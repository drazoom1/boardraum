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

    return c.json({
      event: {
        ...event,
        iceCurrentPercentage: pct,
        currentStageImage,
        myCardCount,
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

    const event = await kv.get("ice_event_current");
    if (!event)                     return c.json({ error: "진행 중인 이벤트가 없습니다" }, 400);
    if (event.status !== "active")  return c.json({ error: "이벤트가 종료됐습니다" }, 400);
    if (event.iceCurrent <= 0)      return c.json({ error: "이미 얼음이 다 깨졌습니다" }, 400);

    // 보너스카드 확인
    const currentCards = await readBonusCards(user.email, user.id);
    if (currentCards <= 0) return c.json({ error: "보너스카드가 없습니다" }, 400);

    // 카드 1장 차감
    await writeBonusCards(user.email, currentCards - 1);

    // 닉네임 조회
    const betaEntry = await kv.get(`beta_user_${user.id}`).catch(() => null);
    const nickname =
      betaEntry?.name ||
      betaEntry?.username ||
      betaEntry?.nickname ||
      user.email.split("@")[0];

    // 얼음 체력 감소
    const damage = Number(event.iceDamagePerCard) || 3;
    const newIce = Math.max(0, event.iceCurrent - damage);
    const isEnded = newIce <= 0;

    const updatedEvent = {
      ...event,
      iceCurrent: newIce,
      status: isEnded ? "ended" : "active",
      ...(isEnded ? { endedAt: Date.now() } : {}),
    };
    await kv.set("ice_event_current", updatedEvent);

    // 사용 횟수 기록 (ice_card_usage_{userId})
    const prevUsage = await kv.get(`ice_card_usage_${user.id}`).catch(() => null);
    const newCardCount = (prevUsage?.cardCount ?? 0) + 1;
    await kv.set(`ice_card_usage_${user.id}`, {
      userId: user.id,
      nickname,
      cardCount: newCardCount,
      lastUsedAt: Date.now(),
    });

    const pct = calcPct(updatedEvent);
    const stage = getIceStage(pct);
    const currentStageImage = updatedEvent.iceImages?.[stage] ?? null;

    console.log(
      `[얼음깨기] 카드 사용: userId=${user.id} nickname=${nickname} ice=${event.iceCurrent}→${newIce} cards=${currentCards}→${currentCards - 1}`,
    );

    return c.json({
      success: true,
      iceCurrent: newIce,
      iceCurrentPercentage: pct,
      currentStageImage,
      myCardCount: newCardCount,
      remainingBonusCards: currentCards - 1,
      iceBreak: isEnded,
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
    const participants: any[] = rows
      .map((r) => r.value)
      .filter((v) => v && v.cardCount > 0)
      .sort((a, b) => b.cardCount - a.cardCount);

    if (participants.length === 0) {
      return c.json({ error: "참여자가 없습니다" }, 400);
    }

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
    await kv.set("ice_event_current", updatedEvent);

    // 히스토리 영구 보관
    await kv
      .set(`ice_event_history_${event.eventId}`, {
        ...updatedEvent,
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

Deno.serve(app.fetch);
