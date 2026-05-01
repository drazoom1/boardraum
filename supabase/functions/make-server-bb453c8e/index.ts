// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 얼음깨기 이벤트 서버  —  make-server-bb453c8e
// 기존 코드 무관하게 완전 독립 동작. KV prefix: ice_
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const ADMIN_EMAIL = "sityplanner2@naver.com";
const PREFIX = "/make-server-bb453c8e";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const app = new Hono();
app.use("*", cors());

// ══════════════════════════════════════════════════════════════════
// 공통 헬퍼
// ══════════════════════════════════════════════════════════════════

async function getUser(authHeader: string | undefined) {
  const token = authHeader?.split(" ")[1];
  if (!token) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser(token);
    return user ?? null;
  } catch {
    return null;
  }
}

async function requireAdmin(c: any) {
  const user = await getUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.email !== ADMIN_EMAIL) return c.json({ error: "Forbidden" }, 403);
  return user;
}

// ── 보너스카드 헬퍼 (기존 bonus_cards_email_* 키 패턴과 동일하게 읽고 씀) ──

function emailToCardKey(email: string): string {
  return `bonus_cards_email_${email.toLowerCase().trim()}`;
}

function parseCardCount(raw: any): number {
  if (!raw) return 0;
  if (typeof raw === "number") return Math.max(0, Math.floor(raw));
  if (typeof raw === "object" && typeof raw.cards === "number")
    return Math.max(0, Math.floor(raw.cards));
  return 0;
}

async function readBonusCards(email: string, userId?: string): Promise<number> {
  const raw = await kv.get(emailToCardKey(email)).catch(() => null);
  const count = parseCardCount(raw);
  if (count > 0 || !userId) return count;
  // 레거시 userId 키 fallback
  const legacyRaw = await kv.get(`bonus_cards_${userId}`).catch(() => null);
  return parseCardCount(legacyRaw);
}

async function writeBonusCards(email: string, count: number): Promise<void> {
  const safe = Math.min(1000, Math.max(0, Math.floor(count)));
  await kv.set(emailToCardKey(email), { cards: safe, updatedAt: Date.now() });
}

// ── 얼음 단계 계산 (0~100% → '0'|'10'|'30'|'50'|'70'|'90'|'100') ──

function getIceStage(pct: number): string {
  if (pct <= 0)  return "0";
  if (pct <= 10) return "10";
  if (pct <= 30) return "30";
  if (pct <= 50) return "50";
  if (pct <= 70) return "70";
  if (pct <= 90) return "90";
  return "100";
}

function calcPct(event: any): number {
  if (!event?.iceTotal || event.iceTotal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((event.iceCurrent / event.iceTotal) * 100)));
}

// ══════════════════════════════════════════════════════════════════
// [사용자] GET /ice/current
// ══════════════════════════════════════════════════════════════════

app.get(`${PREFIX}/ice/current`, async (c) => {
  try {
    const event = await kv.get("ice_event_current");
    if (!event) return c.json({ event: null });

    const pct = calcPct(event);
    const stage = getIceStage(pct);
    const currentStageImage = event.iceImages?.[stage] ?? null;

    let myCardCount = 0;
    const user = await getUser(c.req.header("Authorization"));
    if (user?.id) {
      const usage = await kv.get(`ice_card_usage_${user.id}`).catch(() => null);
      myCardCount = usage?.cardCount ?? 0;
    }

    const { iceImages, prizeGameImage, ...eventData } = event;
    return c.json({
      event: {
        ...eventData,
        iceCurrentPercentage: pct,
        currentStageImage,
        myCardCount,
        // 룰렛 공개된 경우에만 참여자 데이터 포함
        ...(event.roulettePublished ? {
          roulettePublished: true,
          rouletteParticipants: event.rouletteParticipants ?? [],
          rouletteTotalCards: event.rouletteTotalCards ?? 0,
        } : {}),
      },
    });
  } catch (e) {
    console.error("[ice/current]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [사용자] POST /ice/use-card
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/ice/use-card`, async (c) => {
  try {
    const user = await getUser(c.req.header("Authorization"));
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    if (!user.email) return c.json({ error: "이메일 정보가 없습니다" }, 400);

    const body = await c.req.json().catch(() => ({}));
    const requestedCount = Math.max(1, Math.floor(Number(body.count) || 1));

    // Phase 1: 필요한 데이터 전부 병렬 조회
    const [event, currentCards, profileEntry, betaEntry, prevUsage] = await Promise.all([
      kv.get("ice_event_current"),
      readBonusCards(user.email, user.id),
      kv.get(`user_profile_${user.id}`).catch(() => null),
      kv.get(`beta_user_${user.id}`).catch(() => null),
      kv.get(`ice_card_usage_${user.id}`).catch(() => null),
    ]);

    if (!event)                     return c.json({ error: "진행 중인 이벤트가 없습니다" }, 400);
    if (event.status !== "active")  return c.json({ error: "이벤트가 종료됐습니다" }, 400);
    if (event.iceCurrent <= 0)      return c.json({ error: "이미 얼음이 다 깨졌습니다" }, 400);
    if (currentCards <= 0)          return c.json({ error: "보너스카드가 없습니다" }, 400);

    const damagePerCard = Number(event.iceDamagePerCard) || 3;
    // 얼음을 다 깨는 데 필요한 최소 카드 수 — 초과분은 차감하지 않음
    const cardsNeededToBreak = Math.ceil(event.iceCurrent / damagePerCard);
    const useCount = Math.min(requestedCount, currentCards, cardsNeededToBreak);
    const damage = damagePerCard * useCount;
    const newIce = Math.max(0, event.iceCurrent - damage);
    const isEnded = newIce <= 0;

    const nickname =
      profileEntry?.username?.trim() ||
      betaEntry?.username?.trim() ||
      betaEntry?.name?.trim() ||
      user.email.split("@")[0];

    const newCardCount = (prevUsage?.cardCount ?? 0) + useCount;

    const updatedEvent = {
      ...event,
      iceCurrent: newIce,
      status: isEnded ? "ended" : "active",
      ...(isEnded ? { endedAt: Date.now() } : {}),
    };

    // Phase 2: 이벤트 저장 (정합성 보장 — 실패 시 카드 차감 안 됨)
    await kv.set("ice_event_current", updatedEvent);

    // Phase 3: 나머지 쓰기 병렬 처리
    await Promise.all([
      writeBonusCards(user.email, currentCards - useCount),
      kv.set(`ice_card_usage_${user.id}`, {
        userId: user.id,
        nickname,
        cardCount: newCardCount,
        lastUsedAt: Date.now(),
      }),
    ]);

    const pct = calcPct(updatedEvent);
    const stage = getIceStage(pct);
    const currentStageImage = updatedEvent.iceImages?.[stage] ?? null;

    console.log(
      `[얼음깨기] 카드 사용: ${nickname} count=${useCount} ice=${event.iceCurrent}→${newIce} cards=${currentCards}→${currentCards - useCount}`,
    );

    return c.json({
      success: true,
      damage,
      useCount,
      requestedCount,
      cappedByIce: useCount < requestedCount && useCount === cardsNeededToBreak,
      iceCurrent: newIce,
      iceCurrentPercentage: pct,
      currentStageImage,
      myCardCount: newCardCount,
      remainingBonusCards: currentCards - useCount,
      iceBreak: isEnded,
      updatedEvent: {
        ...updatedEvent,
        iceCurrentPercentage: pct,
        currentStageImage,
        myCardCount: newCardCount,
      },
    });
  } catch (e) {
    console.error("[ice/use-card]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] POST /ice/admin/create
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/ice/admin/create`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    // 기존 active 이벤트 충돌 방지
    const existing = await kv.get("ice_event_current");
    if (existing?.status === "active") {
      return c.json(
        { error: "이미 진행 중인 이벤트가 있습니다. 먼저 종료해주세요." },
        400,
      );
    }

    const body = await c.req.json();
    const {
      title,
      description,
      prizeGameName,
      prizeGameImage,
      iceTotal,
      iceDamagePerCard,
      iceImages,
    } = body;

    if (!title || !iceTotal || !iceDamagePerCard) {
      return c.json(
        { error: "title, iceTotal, iceDamagePerCard 는 필수입니다" },
        400,
      );
    }
    if (Number(iceTotal) <= 0 || Number(iceDamagePerCard) <= 0) {
      return c.json({ error: "iceTotal, iceDamagePerCard 는 양수여야 합니다" }, 400);
    }

    const eventId = `ice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const event = {
      eventId,
      title,
      description: description ?? "",
      prizeGameName: prizeGameName ?? "",
      prizeGameImage: prizeGameImage ?? "",
      iceTotal: Number(iceTotal),
      iceDamagePerCard: Number(iceDamagePerCard),
      iceCurrent: Number(iceTotal),
      iceImages: iceImages ?? {},
      status: "active",
      createdAt: Date.now(),
    };

    await kv.set("ice_event_current", event);
    console.log(`[얼음깨기] 이벤트 생성: ${eventId} by ${user.email}`);
    return c.json({ success: true, event });
  } catch (e) {
    console.error("[ice/admin/create]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] POST /ice/admin/end
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/ice/admin/end`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const event = await kv.get("ice_event_current");
    if (!event) return c.json({ error: "진행 중인 이벤트가 없습니다" }, 400);
    if (event.status === "ended" || event.status === "drawn") {
      return c.json({ error: "이미 종료된 이벤트입니다" }, 400);
    }

    const updated = { ...event, status: "ended", endedAt: Date.now() };
    await kv.set("ice_event_current", updated);
    console.log(`[얼음깨기] 강제 종료: ${event.eventId} by ${user.email}`);
    return c.json({ success: true, event: updated });
  } catch (e) {
    console.error("[ice/admin/end]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] POST /ice/admin/draw
// 카드 사용 비율로 가중치 룰렛 추첨
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/ice/admin/draw`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const event = await kv.get("ice_event_current");
    if (!event) return c.json({ error: "이벤트가 없습니다" }, 400);
    if (event.status === "drawn")  return c.json({ error: "이미 추첨이 완료됐습니다" }, 400);
    if (event.status === "active") return c.json({ error: "이벤트를 먼저 종료해주세요 (/ice/admin/end)" }, 400);

    // 참여자 전원 조회
    const rows = await kv.getByPrefixWithKeys("ice_card_usage_");
    const rawParticipants: any[] = rows
      .map((r) => r.value)
      .filter((v) => v && v.cardCount > 0)
      .sort((a, b) => b.cardCount - a.cardCount);

    if (rawParticipants.length === 0) {
      return c.json({ error: "참여자가 없습니다" }, 400);
    }

    // 닉네임을 user_profile_에서 최신으로 재조회 (카드 사용 당시 저장된 닉네임이 오래됐을 수 있음)
    const nicknameEntries = await Promise.all(
      rawParticipants.map((p) =>
        Promise.all([
          kv.get(`user_profile_${p.userId}`).catch(() => null),
          kv.get(`beta_user_${p.userId}`).catch(() => null),
        ])
      )
    );
    const participants = rawParticipants.map((p, i) => {
      const [profile, beta] = nicknameEntries[i];
      const nickname =
        profile?.username?.trim() ||
        beta?.username?.trim() ||
        beta?.name?.trim() ||
        p.nickname ||
        p.userId;
      return { ...p, nickname };
    });

    const totalCards = participants.reduce((s, p) => s + p.cardCount, 0);

    // 가중치 룰렛
    const roll = Math.random() * totalCards;
    let cumulative = 0;
    let winner = participants[0];
    for (const p of participants) {
      cumulative += p.cardCount;
      if (roll < cumulative) { winner = p; break; }
    }

    const participantsWithPct = participants.map((p) => ({
      ...p,
      percentage:
        totalCards > 0
          ? Math.round((p.cardCount / totalCards) * 1000) / 10
          : 0,
    }));

    const updatedEvent = {
      ...event,
      status: "drawn",
      winnerId: winner.userId,
      winnerNickname: winner.nickname,
      drawnAt: Date.now(),
    };
    // 현재 이벤트에 룰렛 데이터 저장 (공개 재생용)
    const updatedEventWithRoulette = {
      ...updatedEvent,
      rouletteParticipants: participantsWithPct,
      rouletteTotalCards: totalCards,
      roulettePublished: false,
    };
    await kv.set("ice_event_current", updatedEventWithRoulette);

    // 히스토리 영구 보관 — 이미지 제외 (KV 용량 절약)
    const { iceImages: _i1, prizeGameImage: _i2, currentStageImage: _i3, ...eventNoImages } = updatedEventWithRoulette;
    await kv
      .set(`ice_event_history_${event.eventId}`, {
        ...eventNoImages,
        participants: participantsWithPct,
        totalCards,
        drawnBy: user.email,
      })
      .catch(() => {});

    console.log(
      `[얼음깨기] 추첨 완료: winner=${winner.nickname}(${winner.userId}) roll=${roll.toFixed(1)}/${totalCards} by ${user.email}`,
    );

    return c.json({
      success: true,
      winnerId: winner.userId,
      winnerNickname: winner.nickname,
      participants: participantsWithPct,
      totalCards,
    });
  } catch (e) {
    console.error("[ice/admin/draw]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] GET /ice/admin/participants
// ══════════════════════════════════════════════════════════════════

app.get(`${PREFIX}/ice/admin/participants`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const event = await kv.get("ice_event_current");

    const rows = await kv.getByPrefixWithKeys("ice_card_usage_");
    const participants: any[] = rows
      .map((r) => r.value)
      .filter((v) => v && v.cardCount > 0)
      .sort((a, b) => b.cardCount - a.cardCount);

    const totalCards = participants.reduce((s, p) => s + p.cardCount, 0);
    const participantsWithPct = participants.map((p) => ({
      ...p,
      percentage:
        totalCards > 0
          ? Math.round((p.cardCount / totalCards) * 1000) / 10
          : 0,
    }));

    return c.json({
      event: event ?? null,
      participants: participantsWithPct,
      totalCards,
      participantCount: participants.length,
    });
  } catch (e) {
    console.error("[ice/admin/participants]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] GET /ice/admin/history
// 종료된 이벤트 히스토리 목록
// ══════════════════════════════════════════════════════════════════

app.get(`${PREFIX}/ice/admin/history`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const rows = await kv.getByPrefixWithKeys("ice_event_history_");
    const history = rows
      .map((r) => r.value)
      .filter(Boolean)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    return c.json({ history });
  } catch (e) {
    console.error("[ice/admin/history]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] DELETE /ice/admin/reset-usage
// 이벤트 종료 후 ice_card_usage_ 키 전체 초기화 (다음 이벤트 준비)
// ══════════════════════════════════════════════════════════════════

app.delete(`${PREFIX}/ice/admin/reset-usage`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const event = await kv.get("ice_event_current");
    if (event?.status === "active") {
      return c.json({ error: "진행 중인 이벤트가 있습니다. 종료 후 초기화하세요." }, 400);
    }

    const rows = await kv.getByPrefixWithKeys("ice_card_usage_");
    for (const r of rows) {
      await kv.del(r.key).catch(() => {});
    }

    console.log(`[얼음깨기] 사용 기록 초기화: ${rows.length}건 삭제 by ${user.email}`);
    return c.json({ success: true, deleted: rows.length });
  } catch (e) {
    console.error("[ice/admin/reset-usage]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] POST /ice/admin/publish-roulette — 추첨 결과 공개
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/ice/admin/publish-roulette`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;
    const event = await kv.get("ice_event_current");
    if (!event || event.status !== "drawn") return c.json({ error: "추첨 완료된 이벤트가 없습니다" }, 400);
    await kv.set("ice_event_current", { ...event, roulettePublished: true });
    console.log(`[얼음깨기] 룰렛 공개: ${event.eventId} winner=${event.winnerNickname} by ${user.email}`);
    return c.json({ success: true });
  } catch (e) {
    console.error("[ice/admin/publish-roulette]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] GET /ice/admin/overview — 한 번에 전체 데이터 (빠른 로딩)
// ══════════════════════════════════════════════════════════════════

app.get(`${PREFIX}/ice/admin/overview`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const [event, usageRows] = await Promise.all([
      kv.get("ice_event_current"),
      kv.getByPrefixWithKeys("ice_card_usage_"),
    ]);
    // 히스토리는 별도 try-catch — 실패해도 나머지 데이터는 정상 반환
    let historyRows: { key: string; value: any }[] = [];
    try {
      historyRows = await kv.getByPrefixWithKeys("ice_event_history_");
    } catch (e) {
      console.error("[overview] 히스토리 조회 실패 (무시):", e);
    }

    // 참여자
    const participants = usageRows
      .map((r) => r.value)
      .filter((v) => v && v.cardCount > 0)
      .sort((a, b) => b.cardCount - a.cardCount);
    const totalCards = participants.reduce((s, p) => s + p.cardCount, 0);
    const participantsWithPct = participants.map((p) => ({
      ...p,
      percentage: totalCards > 0 ? Math.round((p.cardCount / totalCards) * 1000) / 10 : 0,
    }));

    // 히스토리 — base64 이미지 제외 + 기존 KV에 이미지 있으면 자동 정리
    const stripImages = (obj: any) => {
      if (!obj) return obj;
      const { iceImages, prizeGameImage, currentStageImage, ...rest } = obj;
      return rest;
    };
    const history: any[] = [];
    for (const row of historyRows) {
      const val = row.value;
      if (!val) continue;
      const hasImages = val.iceImages || val.prizeGameImage || val.currentStageImage;
      if (hasImages) {
        // 기존 KV 레코드에 이미지 있으면 이미지 제거 후 덮어쓰기 (백그라운드)
        const cleaned = stripImages(val);
        kv.set(row.key, cleaned).catch(() => {});
        history.push(cleaned);
      } else {
        history.push(val);
      }
    }
    history.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    // 현재 이벤트 — 이미지 전부 제외 (관리자 페이지는 이미지 불필요)
    // KV에 이미지가 아직 남아있으면 ice/current 응답은 그대로 두고 overview만 제외
    const eventLight = event ? (() => {
      const { iceImages, prizeGameImage, currentStageImage, ...rest } = event;
      const pct = calcPct(rest);
      return { ...rest, iceCurrentPercentage: pct };
    })() : null;

    return c.json({ event: eventLight, participants: participantsWithPct, totalCards, history });
  } catch (e) {
    console.error("[ice/admin/overview]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] DELETE /ice/admin/clear-current
// 추첨 완료된 이벤트를 히스토리로 보내고 현재 슬롯을 비움 (새 이벤트 준비)
// ══════════════════════════════════════════════════════════════════

app.delete(`${PREFIX}/ice/admin/clear-current`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const event = await kv.get("ice_event_current");
    if (!event) return c.json({ error: "현재 이벤트가 없습니다" }, 400);
    if (event.status === "active") {
      return c.json({ error: "진행 중인 이벤트는 종료할 수 없습니다. 먼저 강제 종료해주세요." }, 400);
    }

    // 히스토리에 없다면 보관 — 이미지 제외 (KV 용량 절약)
    if (event.eventId) {
      const existing = await kv.get(`ice_event_history_${event.eventId}`).catch(() => null);
      if (!existing) {
        const { iceImages: _i1, prizeGameImage: _i2, currentStageImage: _i3, ...eventNoImages } = event;
        await kv.set(`ice_event_history_${event.eventId}`, {
          ...eventNoImages,
          archivedAt: Date.now(),
          archivedBy: user.email,
        }).catch(() => {});
      }
    }

    // 현재 이벤트 슬롯 비우기
    await kv.del("ice_event_current");

    // 카드 사용 기록도 초기화
    const rows = await kv.getByPrefixWithKeys("ice_card_usage_");
    for (const r of rows) {
      await kv.del(r.key).catch(() => {});
    }

    console.log(`[얼음깨기] 이벤트 종료 및 초기화: ${event.eventId} by ${user.email}`);
    return c.json({ success: true });
  } catch (e) {
    console.error("[ice/admin/clear-current]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] POST /ice/admin/cleanup-images
// 기존 히스토리/현재 이벤트 KV에서 base64 이미지 정리 (1회성 마이그레이션)
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/ice/admin/cleanup-images`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    let cleaned = 0;

    // 현재 이벤트 이미지 정리
    const current = await kv.get("ice_event_current").catch(() => null);
    if (current && (current.iceImages || current.prizeGameImage)) {
      const { iceImages, prizeGameImage, ...rest } = current;
      const pct = calcPct(rest);
      const stage = getIceStage(pct);
      const currentStageImage = (iceImages ?? {})[stage] ?? null;
      await kv.set("ice_event_current", { ...rest, currentStageImage });
      cleaned++;
    }

    // 히스토리 이미지 정리
    const historyRows = await kv.getByPrefixWithKeys("ice_event_history_");
    for (const row of historyRows) {
      const val = row.value;
      if (val && (val.iceImages || val.prizeGameImage || val.currentStageImage)) {
        const { iceImages, prizeGameImage, currentStageImage, ...rest } = val;
        await kv.set(row.key, rest).catch(() => {});
        cleaned++;
      }
    }

    console.log(`[얼음깨기] 이미지 정리 완료: ${cleaned}건 by ${user.email}`);
    return c.json({ success: true, cleaned });
  } catch (e) {
    console.error("[ice/admin/cleanup-images]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════

Deno.serve(app.fetch);
