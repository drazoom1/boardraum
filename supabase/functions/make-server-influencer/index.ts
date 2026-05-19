// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 인플루언서 서버  —  make-server-influencer
// KV prefix: influencer_
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const ADMIN_EMAIL = "sityplanner2@naver.com";
const PREFIX = "/make-server-influencer";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const app = new Hono();
app.use("*", cors());

// ── 공통 헬퍼 ──────────────────────────────────────────────────────

async function getUser(authHeader: string | undefined) {
  const token = authHeader?.split(" ")[1];
  if (!token) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser(token);
    return user ?? null;
  } catch { return null; }
}

async function requireAdmin(c: any) {
  const user = await getUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.email !== ADMIN_EMAIL) return c.json({ error: "Forbidden" }, 403);
  return user;
}

function isActivePeriod(form: any): boolean {
  const now = Date.now();
  const start = form?.periodStart ? new Date(form.periodStart).getTime() : 0;
  const end = form?.periodEnd ? new Date(form.periodEnd + "T23:59:59").getTime() : Infinity;
  return now >= start && now <= end;
}

// ══════════════════════════════════════════════════════════════════
// [공개] GET /influencer/form — 활성 신청서 + 내 신청/인플루언서 상태
// ══════════════════════════════════════════════════════════════════

app.get(`${PREFIX}/influencer/form`, async (c) => {
  try {
    const form = await kv.get("influencer_form_active");
    if (!form || form.status === "draft") return c.json({ form: null });

    const user = await getUser(c.req.header("Authorization"));
    let myApplication = null;
    let isInfluencer = false;

    if (user?.id) {
      const [app, member] = await Promise.all([
        kv.get(`influencer_app_${user.id}`).catch(() => null),
        kv.get(`influencer_member_${user.id}`).catch(() => null),
      ]);
      myApplication = app;
      if (member) {
        const now = Date.now();
        const start = member.periodStart ? new Date(member.periodStart).getTime() : 0;
        const end = member.periodEnd ? new Date(member.periodEnd + "T23:59:59").getTime() : Infinity;
        isInfluencer = now >= start && now <= end;
      }
    }

    return c.json({ form, myApplication, isInfluencer });
  } catch (e) {
    console.error("[influencer/form]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [인증] GET /influencer/me — 내 인플루언서 상태
// ══════════════════════════════════════════════════════════════════

app.get(`${PREFIX}/influencer/me`, async (c) => {
  try {
    const user = await getUser(c.req.header("Authorization"));
    if (!user?.id) return c.json({ isInfluencer: false });

    const member = await kv.get(`influencer_member_${user.id}`).catch(() => null);
    if (!member) return c.json({ isInfluencer: false });

    const now = Date.now();
    const start = member.periodStart ? new Date(member.periodStart).getTime() : 0;
    const end = member.periodEnd ? new Date(member.periodEnd + "T23:59:59").getTime() : Infinity;
    const isInfluencer = now >= start && now <= end;

    return c.json({ isInfluencer, member: isInfluencer ? member : null });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] GET /influencer/admin/form — draft 포함 신청서 조회
// ══════════════════════════════════════════════════════════════════

app.get(`${PREFIX}/influencer/admin/form`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;
    const form = await kv.get("influencer_form_active");
    return c.json({ form: form ?? null });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] POST /influencer/admin/save — 신청서 저장 (draft)
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/influencer/admin/save`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const body = await c.req.json();
    const existing = await kv.get("influencer_form_active").catch(() => null);
    const form = {
      ...body,
      id: existing?.id || `inf_${Date.now()}`,
      status: existing?.status ?? "draft",
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    await kv.set("influencer_form_active", form);
    console.log(`[인플루언서] 신청서 저장: ${form.id} by ${user.email}`);
    return c.json({ success: true, form });
  } catch (e) {
    console.error("[influencer/admin/save]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] POST /influencer/admin/open — 신청 오픈
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/influencer/admin/open`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const form = await kv.get("influencer_form_active");
    if (!form) return c.json({ error: "저장된 신청서가 없습니다" }, 400);

    await kv.set("influencer_form_active", { ...form, status: "open", openedAt: Date.now() });
    console.log(`[인플루언서] 신청 오픈: ${form.id} by ${user.email}`);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] POST /influencer/admin/close — 신청 마감
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/influencer/admin/close`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const form = await kv.get("influencer_form_active");
    if (!form) return c.json({ error: "신청서가 없습니다" }, 400);

    await kv.set("influencer_form_active", { ...form, status: "closed", closedAt: Date.now() });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [인증] POST /influencer/apply — 신청서 제출
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/influencer/apply`, async (c) => {
  try {
    const user = await getUser(c.req.header("Authorization"));
    if (!user?.id) return c.json({ error: "로그인이 필요합니다" }, 401);

    const form = await kv.get("influencer_form_active");
    if (!form || form.status !== "open") return c.json({ error: "신청 기간이 아닙니다" }, 400);

    // 신청 기한 체크
    if (form.applyDeadline) {
      const deadline = new Date(form.applyDeadline + "T23:59:59").getTime();
      if (Date.now() > deadline) return c.json({ error: "신청 기한이 지났습니다" }, 400);
    }

    // 중복 신청 체크
    const existing = await kv.get(`influencer_app_${user.id}`).catch(() => null);
    if (existing) return c.json({ error: "이미 신청하셨습니다" }, 400);

    const body = await c.req.json().catch(() => ({}));

    // 닉네임 조회
    const [profileEntry, betaEntry] = await Promise.all([
      kv.get(`user_profile_${user.id}`).catch(() => null),
      kv.get(`beta_user_${user.id}`).catch(() => null),
    ]);
    const nickname =
      profileEntry?.username?.trim() ||
      betaEntry?.username?.trim() ||
      betaEntry?.name?.trim() ||
      user.email?.split("@")[0] || "익명";

    const application = {
      userId: user.id,
      email: user.email,
      nickname,
      answers: body.answers ?? [],
      formId: form.id,
      status: "pending",
      appliedAt: Date.now(),
    };

    await kv.set(`influencer_app_${user.id}`, application);
    console.log(`[인플루언서] 신청: ${nickname} (${user.email})`);
    return c.json({ success: true });
  } catch (e) {
    console.error("[influencer/apply]", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] GET /influencer/admin/applications — 신청자 목록
// ══════════════════════════════════════════════════════════════════

app.get(`${PREFIX}/influencer/admin/applications`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const [appRows, memberRows] = await Promise.all([
      kv.getByPrefixWithKeys("influencer_app_"),
      kv.getByPrefixWithKeys("influencer_member_"),
    ]);

    const memberIds = new Set(memberRows.map(r => r.value?.userId).filter(Boolean));
    const applications = appRows
      .map(r => r.value)
      .filter(Boolean)
      .map(a => ({ ...a, isInfluencer: memberIds.has(a.userId) }))
      .sort((a, b) => b.appliedAt - a.appliedAt);

    return c.json({ applications });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] POST /influencer/admin/approve — 인플루언서 선정
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/influencer/admin/approve`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const { userId } = await c.req.json().catch(() => ({}));
    if (!userId) return c.json({ error: "userId 필요" }, 400);

    const [application, form] = await Promise.all([
      kv.get(`influencer_app_${userId}`),
      kv.get("influencer_form_active"),
    ]);
    if (!application) return c.json({ error: "신청자를 찾을 수 없습니다" }, 400);

    await Promise.all([
      kv.set(`influencer_app_${userId}`, { ...application, status: "approved", approvedAt: Date.now() }),
      kv.set(`influencer_member_${userId}`, {
        userId,
        nickname: application.nickname,
        email: application.email,
        formId: application.formId,
        periodStart: form?.periodStart || null,
        periodEnd: form?.periodEnd || null,
        approvedAt: Date.now(),
      }),
    ]);

    console.log(`[인플루언서] 선정: ${application.nickname} by ${user.email}`);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
// [관리자] POST /influencer/admin/revoke — 인플루언서 박탈
// ══════════════════════════════════════════════════════════════════

app.post(`${PREFIX}/influencer/admin/revoke`, async (c) => {
  try {
    const user = await requireAdmin(c);
    if (user instanceof Response) return user;

    const { userId } = await c.req.json().catch(() => ({}));
    if (!userId) return c.json({ error: "userId 필요" }, 400);

    const application = await kv.get(`influencer_app_${userId}`).catch(() => null);
    await Promise.all([
      kv.del(`influencer_member_${userId}`),
      application
        ? kv.set(`influencer_app_${userId}`, { ...application, status: "revoked", revokedAt: Date.now() })
        : Promise.resolve(),
    ]);

    console.log(`[인플루언서] 박탈: ${userId} by ${user.email}`);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

app.all("*", (c) => c.json({ error: "Not found" }, 404));

Deno.serve(async (req) => app.fetch(req));
