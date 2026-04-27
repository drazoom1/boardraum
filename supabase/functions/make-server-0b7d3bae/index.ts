import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import * as analytics from "./analytics.tsx";
import { getAnalyticsStats } from "./analytics_stats.tsx";
import { getAllRegisteredGames } from "./all_games_handler.tsx";
import { diagnoseHongyaData } from "./hongya_diagnosis.tsx";
import { forceLoadHongyaData } from "./hongya_force_load.tsx";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BOARDRAUM Server - Deploy Status: OK (2025-04-05) ✅
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { diagnoseAndRecoverHongya } from "./hongya_precise_diagnosis.tsx";

const app = new Hono();

// 개발 모드 체크
const isDevelopment = Deno.env.get('ENVIRONMENT') === 'development' || 
                     Deno.env.get('DEBUG') === 'true';

// 개발 모드에서만 콘솔 로그 출력
const devLog = (...args: any[]) => {
  if (isDevelopment) {
  }
};

// 에러는 항상 출력 (운영에서도 필요)
const logError = (...args: any[]) => {
  console.error(...args);
};

// ==================== 인메모리 캐시 ====================
const memCache = new Map<string, { data: any; expiry: number }>();
function cacheGet(key: string): any | null {
  const hit = memCache.get(key);
  if (hit && hit.expiry > Date.now()) return hit.data;
  memCache.delete(key);
  return null;
}
function cacheSet(key: string, data: any, ttlMs: number) {
  memCache.set(key, { data, expiry: Date.now() + ttlMs });
}
function cacheDelete(key: string) {
  memCache.delete(key);
}

// ==================== 🆕 NEW: KV store retry helper (502 에러 대응) ====================
async function kvGetWithRetry<T>(key: string, maxRetries = 3, delayMs = 500): Promise<T | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await kv.get(key);
      return result as T | null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // 502 Bad Gateway 에러 체크
      const is502Error = errorMsg.includes('502') || errorMsg.includes('Bad gateway');
      
      if (is502Error && attempt < maxRetries) {
        console.warn(`⚠️ [KV Retry] Attempt ${attempt}/${maxRetries} failed with 502 error for key: ${key}`);
        console.warn(`⚠️ [KV Retry] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      // 최대 재시도 횟수 도달 또는 다른 에러
      console.error(`❌ [KV Error] Failed to get key "${key}" after ${attempt} attempts:`, errorMsg.substring(0, 200));
      throw error;
    }
  }
  return null;
}

async function kvSetWithRetry(key: string, value: any, maxRetries = 3, delayMs = 500): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await kv.set(key, value);
      return;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const is502Error = errorMsg.includes('502') || errorMsg.includes('Bad gateway');
      
      if (is502Error && attempt < maxRetries) {
        console.warn(`⚠️ [KV Retry] Attempt ${attempt}/${maxRetries} failed with 502 error for key: ${key}`);
        console.warn(`⚠️ [KV Retry] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      console.error(`❌ [KV Error] Failed to set key "${key}" after ${attempt} attempts:`, errorMsg.substring(0, 200));
      throw error;
    }
  }
}

// Initialize Supabase client with service role key
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Ensure storage bucket exists
const BUCKET_NAME = 'make-0b7d3bae-boardgame-images';

async function ensureBucket() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
    
    if (!bucketExists) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5242880, // 5MB
      });
    }
  } catch (error) {
    logError('Error ensuring bucket exists:', error);
  }
}

// Initialize bucket on startup
ensureBucket();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// getByPrefix helper: kv.getByPrefixWithKeys 위임 (매 호출 신선한 클라이언트, 502 방지)
async function getByPrefix(prefix: string): Promise<Array<{ key: string; value: any }>> {
  try {
    return await kv.getByPrefixWithKeys(prefix);
  } catch (error) {
    console.error(`❌ getByPrefix error for prefix '${prefix}':`, error);
    return [];
  }
}

// ==================== 🆕 NEW: Individual Game Storage System ====================
// 게임 하나당 키 하나로 저장 (데이터 유실 방지)
// 변경 전: user_유저ID_owned = [{game1},{game2},...{game327}]
// 변경 후: user_유저ID_game_게임ID = {game1}

/**
 * 게임 데이터를 개별 키로 저장 (새 방식)
 * @param userId 사용자 ID
 * @param games 게임 배열
 * @param type 'owned' 또는 'wishlist'
 */
async function saveGamesIndividually(userId: string, games: any[], type: 'owned' | 'wishlist'): Promise<void> {

  const prefix = `user_${userId}_game_`;
  const timestamp = Date.now();
  const BATCH_SIZE = 10; // Reduced from 50 to 10 to prevent timeout
  const validGames = games.filter((g: any) => g?.id);

  // 1. 새 데이터 먼저 upsert (삭제 전에 저장 — 빈 상태 방지)
  for (let i = 0; i < validGames.length; i += BATCH_SIZE) {
    const batch = validGames.slice(i, i + BATCH_SIZE);
    
    // Use individual set operations instead of mset to avoid timeout
    for (const game of batch) {
      const key = `${prefix}${game.id}`;
      const value = { ...game, listType: type, savedAt: timestamp };
      try {
        await kv.set(key, value);
      } catch (error) {
        console.error(`❌ Failed to save game ${game.id}:`, error);
        // Continue with other games even if one fails
      }

      // ── 사이트 게임 DB 영구 보존 (유저 삭제와 무관하게 유지) ──
      const siteKey = `site_game_${game.id}`;
      try {
        const rawImg = game.imageUrl || game.thumbnail || '';
        const cleanImg = rawImg.startsWith('//') ? 'https:' + rawImg : rawImg;
        // 항상 upsert — 없으면 새로 저장, 있으면 이미지/이름만 보완
        const existing = await kv.get(siteKey);
        if (!existing) {
          await kv.set(siteKey, {
            id: game.id,
            bggId: game.bggId,
            koreanName: game.koreanName,
            englishName: game.englishName,
            name: game.koreanName || game.englishName || game.name,
            imageUrl: cleanImg,
            yearPublished: game.yearPublished,
            registeredAt: timestamp,
          });
        } else if (!existing.imageUrl && cleanImg) {
          // 이미지 없는 기존 데이터에 이미지 보완
          await kv.set(siteKey, { ...existing, imageUrl: cleanImg });
        }
      } catch (e) {
        // 영구 DB 저장 실패해도 유저 저장은 계속 진행
      }
    }
    
  }

  // 2. 저장 완료 후, 이번 목록에 없는 구 키만 삭제 (없어진 게임 제거)
  const newIds = new Set(validGames.map((g: any) => `${prefix}${g.id}`));
  const existingItems = await kv.getByPrefixWithKeys(prefix);
  const toDeleteKeys = existingItems
    .filter((item: any) => item.value?.listType === type && !newIds.has(item.key))
    .map((item: any) => item.key);

  if (toDeleteKeys.length > 0) {
    // Delete one by one to avoid timeout
    for (const key of toDeleteKeys) {
      try {
        await kv.del(key);
      } catch (error) {
        console.error(`❌ Failed to delete key ${key}:`, error);
      }
    }
  }

}


/**
 * 개별 키로 저장된 게임 데이터 로드 (새 방식)
 * @param userId 사용자 ID
 * @param type 'owned' 또는 'wishlist'
 * @returns 게임 배열
 */
async function loadGamesIndividually(userId: string, type: 'owned' | 'wishlist'): Promise<any[]> {

  const prefix = `user_${userId}_game_`;
  // getByPrefixWithKeys 사용 — value를 명시적으로 접근
  const allGameItems = await kv.getByPrefixWithKeys(prefix);

  const games = allGameItems
    .map((item: any) => item.value)
    .filter((game: any) => game && game.listType === type);

  return games;
}

/**
 * 기존 배열 방식 데이터를 개별 키로 마이그레이션 (복사만, 삭제 안 함)
 * @param userId 사용자 ID
 */
async function migrateToIndividualKeys(userId: string): Promise<void> {
  
  // 기존 데이터 읽기 (절대 삭제하지 않음 - fallback으로 유지)
  const legacyOwned = await kv.get(`user_${userId}_owned`);
  const legacyWishlist = await kv.get(`user_${userId}_wishlist`);
  
  let migratedOwnedCount = 0;
  let migratedWishlistCount = 0;
  
  // Owned 마이그레이션
  if (legacyOwned && Array.isArray(legacyOwned) && legacyOwned.length > 0) {
    await saveGamesIndividually(userId, legacyOwned, 'owned');
    migratedOwnedCount = legacyOwned.length;
  }
  
  // Wishlist 마이그레이션
  if (legacyWishlist && Array.isArray(legacyWishlist) && legacyWishlist.length > 0) {
    await saveGamesIndividually(userId, legacyWishlist, 'wishlist');
    migratedWishlistCount = legacyWishlist.length;
  }
  
}

/**
 * 게임 데이터 로드 with fallback (새 방식 → 기존 방식)
 * @param userId 사용자 ID
 * @param type 'owned' 또는 'wishlist'
 * @returns 게임 배열
 */
async function applyApprovedImageOverrides(games: any[]): Promise<any[]> {
  if (!games.length) return games;
  try {
    // 한 번의 prefix 조회로 모든 오버라이드 이미지 가져오기 (N번 호출 → 1번)
    const overrides = await getByPrefix('game_image_');
    if (!overrides.length) return games;
    const overrideMap: Record<string, string> = {};
    for (const { key, value } of overrides) {
      if (value?.imageUrl) overrideMap[key] = value.imageUrl;
    }
    return games.map(g => {
      const byBgg = g.bggId ? overrideMap[`game_image_bgg_${g.bggId}`] : null;
      const byId = overrideMap[`game_image_id_${g.id}`];
      const newUrl = byBgg || byId;
      return newUrl ? { ...g, imageUrl: newUrl } : g;
    });
  } catch {
    return games;
  }
}

async function loadGamesWithFallback(userId: string, type: 'owned' | 'wishlist'): Promise<any[]> {
  
  // 1. 새 방식으로 로드 시도
  const individualGames = await loadGamesIndividually(userId, type);
  
  if (individualGames.length > 0) {
    return applyApprovedImageOverrides(individualGames);
  }
  
  // 2. 기존 방식으로 fallback
  const legacyKey = `user_${userId}_${type}`;
  const legacyData = await kvGetWithRetry<any[]>(legacyKey);
  
  if (legacyData && Array.isArray(legacyData) && legacyData.length > 0) {
    
    // 자동 마이그레이션 (백그라운드에서 복사)
    await saveGamesIndividually(userId, legacyData, type).catch(err => {
      console.error(`⚠️ [Load with Fallback] Auto-migration failed (non-critical):`, err);
    });
    
    return applyApprovedImageOverrides(legacyData);
  }
  
  return [];
}


// 이미지 오버라이드 없이 빠르게 게임 로드 (랭킹 등 통계용)
async function loadGamesForStats(userId: string, type: 'owned' | 'wishlist'): Promise<any[]> {
  const individualGames = await loadGamesIndividually(userId, type);
  if (individualGames.length > 0) return individualGames;
  const legacyData = await kvGetWithRetry<any[]>(`user_${userId}_${type}`);
  return (legacyData && Array.isArray(legacyData)) ? legacyData : [];
}

// Health check endpoint
app.get("/make-server-0b7d3bae/health", (c) => {
  return c.json({ status: "ok" });
});

// BGG API proxy endpoint with caching
app.post("/make-server-0b7d3bae/bgg-search", async (c) => {
  try {
    const { query } = await c.req.json();
    if (!query) return c.json({ error: 'Query is required' }, 400);

    // ── 유틸 ──────────────────────────────────────────────────
    const normalizeName = (n: string) => (n || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
    const noSpace = (s: string) => (s || '').toLowerCase().replace(/\s+/g, '');

    // 초성 추출
    const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    function getChosung(str: string): string {
      return [...str].map(ch => {
        const code = ch.charCodeAt(0);
        if (code >= 0xAC00 && code <= 0xD7A3) return CHOSUNG[Math.floor((code - 0xAC00) / 588)];
        return ch;
      }).join('');
    }

    const qRaw = query.toLowerCase();
    const qNorm = noSpace(query);
    const isChosungQuery = /^[ㄱ-ㅎ]+$/.test(query.trim());

    // 매칭 점수 (높을수록 우선)
    function scoreMatch(ko: string, en: string): number {
      const nKo = noSpace(ko);
      const nEn = noSpace(en);
      if (isChosungQuery) {
        const cs = getChosung(nKo);
        if (cs === qNorm) return 5;
        if (cs.startsWith(qNorm)) return 4;
        if (cs.includes(qNorm)) return 3;
        return 0;
      }
      if (nKo === qNorm || nEn === qNorm) return 5;          // 완전 일치
      if (nKo.startsWith(qNorm) || nEn.startsWith(qNorm)) return 4; // 앞부분 일치
      if (nKo.includes(qNorm) || nEn.includes(qNorm)) return 3;     // 부분 포함 (공백 제거)
      if ((ko||'').toLowerCase().includes(qRaw) || (en||'').toLowerCase().includes(qRaw)) return 2; // 원문 공백 포함
      return 0;
    }

    // dedup 헬퍼
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    function addSeen(dk: string, ko: string, en: string) {
      seenIds.add(dk);
      const nKo = normalizeName(ko); const nEn = normalizeName(en);
      if (nKo) seenNames.add(nKo);
      if (nEn) seenNames.add(nEn);
    }
    function alreadySeen(dk: string, ko: string, en: string): boolean {
      if (seenIds.has(dk)) return true;
      const nKo = normalizeName(ko); const nEn = normalizeName(en);
      if (nKo && seenNames.has(nKo)) return true;
      if (nEn && seenNames.has(nEn)) return true;
      return false;
    }

    // ── 1순위: site_game_ KV (스코어 정렬) ───────────────────
    const siteEntries: Array<{ score: number; game: any }> = [];
    try {
      const siteGameKeys = await getByPrefix('site_game_');
      for (const item of siteGameKeys) {
        const g = item.value;
        if (!g?.id) continue;
        const ko = g.koreanName || g.name || '';
        const en = g.englishName || '';
        const score = scoreMatch(ko, en);
        if (score === 0) continue;
        const dk = g.bggId ? `bgg_${g.bggId}` : `id_${g.id}`;
        if (alreadySeen(dk, ko, en)) continue;
        addSeen(dk, ko, en);
        siteEntries.push({
          score,
          game: {
            id: g.bggId && /^\d+$/.test(g.bggId) ? g.bggId : g.id,
            bggId: g.bggId || null,
            name: ko || en,
            koreanName: g.koreanName || g.name || null,
            englishName: en || null,
            thumbnail: g.imageUrl || null,
            yearPublished: g.yearPublished || '',
            source: 'site',
          }
        });
      }
    } catch (e) {
      console.error('site_game search error:', e);
    }
    siteEntries.sort((a, b) => b.score - a.score);
    const siteGames = siteEntries.map(x => x.game);

    // ── 2순위: BGG API 보완 (캐시 우선) ──────────────────────
    const cacheKey = `bgg_search_v2_${qRaw}`;
    let bggItems: any[] = [];
    const cached = await kv.get(cacheKey);
    if (cached && Array.isArray(cached)) {
      bggItems = cached;
    } else {
      const bggToken = Deno.env.get('BGG_API_TOKEN');
      if (bggToken) {
        try {
          const url = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(query)}&type=boardgame`;
          const res = await fetch(url, { headers: { 'Authorization': `Bearer ${bggToken}` } });
          if (res.ok) {
            const xml = await res.text();
            const matches = xml.matchAll(/<item[^>]*id="(\d+)"[^>]*>[\s\S]*?<name[^>]*value="([^"]*)"[^>]*\/>[\s\S]*?(?:<yearpublished[^>]*value="(\d+)"[^>]*\/>)?[\s\S]*?<\/item>/g);
            for (const m of matches) {
              bggItems.push({ id: m[1], name: m[2], yearPublished: m[3] || '', source: 'bgg' });
            }
            await kv.set(cacheKey, bggItems);
          }
        } catch (e) { console.error('BGG API error:', e); }
      }
    }

    // site 게임과 중복되는 BGG 결과 제거
    const siteIds = new Set<string>();
    for (const g of siteGames) {
      siteIds.add(String(g.id));
      if (g.bggId) siteIds.add(String(g.bggId));
    }
    const bggFiltered = bggItems.filter((g: any) => {
      if (siteIds.has(String(g.id))) return false;
      if (alreadySeen(`bgg_${g.id}`, '', g.name || '')) return false;
      return true;
    });

    // 최종 안전망 dedup (bggId + 한글명 + 영문명)
    const finalSeenBggIds = new Set<string>();
    const finalSeenKoNames = new Set<string>();
    const finalSeenEnNames = new Set<string>();
    const finalResult: any[] = [];
    for (const g of [...siteGames, ...bggFiltered]) {
      const bggKey = g.bggId ? String(g.bggId) : (g.source === 'bgg' ? String(g.id) : null);
      if (bggKey && finalSeenBggIds.has(bggKey)) continue;
      const nKo = normalizeName(g.koreanName || (g.source !== 'bgg' ? g.name : '') || '');
      const nEn = normalizeName(g.englishName || (g.source === 'bgg' ? g.name : '') || '');
      if ((nKo && finalSeenKoNames.has(nKo)) || (nEn && finalSeenEnNames.has(nEn))) {
        if (bggKey) finalSeenBggIds.add(bggKey);
        continue;
      }
      if (bggKey) finalSeenBggIds.add(bggKey);
      if (nKo) finalSeenKoNames.add(nKo);
      if (nEn) finalSeenEnNames.add(nEn);
      finalResult.push(g);
    }
    return c.json(finalResult);
  } catch (error) {
    console.error('BGG search error:', error);
    return c.json({ error: `Search error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

// BGG 사용자 컬렉션 불러오기
app.get("/make-server-0b7d3bae/bgg/collection/:username", async (c) => {
  const username = c.req.param('username');
  if (!username) return c.json({ error: 'Username required' }, 400);

  try {
    const bggToken = Deno.env.get('BGG_API_TOKEN');
    if (!bggToken) {
      console.error('BGG_API_TOKEN not configured');
      return c.json({ error: 'BGG API token not configured' }, 500);
    }

    const colUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&own=1&excludesubtype=boardgameexpansion`;
    let xmlText = '';

    for (let i = 0; i < 5; i++) {
      const res = await fetch(colUrl, {
        headers: {
          'Authorization': `Bearer ${bggToken}`,
        },
      });
      if (res.status === 202) { await new Promise(r => setTimeout(r, 2000)); continue; }
      if (!res.ok) {
        if (res.status === 404) return c.json({ error: '존재하지 않는 BGG 사용자예요' }, 404);
        return c.json({ error: `BGG 오류: ${res.status}` }, 500);
      }
      xmlText = await res.text();
      break;
    }

    if (!xmlText) return c.json({ error: 'BGG가 응답하지 않아요. 잠시 후 다시 시도해주세요.' }, 503);
    if (xmlText.includes('<errors>')) {
      const msgMatch = xmlText.match(/<message>(.*?)<\/message>/);
      return c.json({ error: msgMatch ? msgMatch[1] : 'BGG 오류' }, 400);
    }

    const games: { bggId: string; name: string; yearPublished: string; thumbnail: string }[] = [];
    const itemMatches = xmlText.matchAll(/<item[^>]*objecttype="thing"[^>]*objectid="(\d+)"[^>]*subtype="boardgame"[\s\S]*?<\/item>/g);
    for (const match of itemMatches) {
      const block = match[0];
      const bggId = match[1];
      const nameMatch = block.match(/<name[^>]*sortindex="1"[^>]*>([\s\S]*?)<\/name>/);
      const yearMatch = block.match(/<yearpublished>([\s\S]*?)<\/yearpublished>/);
      const thumbMatch = block.match(/<thumbnail>([\s\S]*?)<\/thumbnail>/);
      if (nameMatch) {
        const raw = thumbMatch ? thumbMatch[1].trim() : '';
        const thumbnail = raw.startsWith('//') ? 'https:' + raw : raw;
        games.push({ bggId, name: nameMatch[1].trim(), yearPublished: yearMatch ? yearMatch[1].trim() : '', thumbnail });
      }
    }

    return c.json({ games, totalCount: games.length });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// GET version of BGG search
app.get("/make-server-0b7d3bae/bgg/search", async (c) => {
  try {
    const query = c.req.query('query');
    
    if (!query) {
      return c.json({ error: 'Query is required' }, 400);
    }

    // Check cache first
    const cacheKey = `bgg_search_${query.toLowerCase()}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      return c.json({ items: cached });
    }

    const bggToken = Deno.env.get('BGG_API_TOKEN');
    if (!bggToken) {
      console.error('BGG_API_TOKEN not configured');
      return c.json({ error: 'BGG API token not configured' }, 500);
    }

    // Call BGG API
    const url = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(query)}&type=boardgame`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${bggToken}`,
      },
    });

    if (!response.ok) {
      console.error('BGG API error:', response.status, response.statusText);
      return c.json({ error: `BGG API error: ${response.statusText}` }, response.status);
    }

    const xmlText = await response.text();
    
    // Parse XML to extract game info
    const items: any[] = [];
    const itemMatches = xmlText.matchAll(/<item[^>]*id=\"(\d+)\"[^>]*>[\s\S]*?<name[^>]*value=\"([^\"]*)\"[^>]*\/>[\s\S]*?(?:<yearpublished[^>]*value=\"(\d+)\"[^>]*\/>)?[\s\S]*?<\/item>/g);
    
    for (const match of itemMatches) {
      items.push({
        id: match[1],
        name: match[2],
        yearPublished: match[3] || '',
      });
    }

    // Cache for 24 hours
    await kv.set(cacheKey, items, 86400);
    
    return c.json({ items });
  } catch (error) {
    console.error('BGG search error:', error);
    return c.json({ error: `Search error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

// BGG game details endpoint with caching
app.post("/make-server-0b7d3bae/bgg-details", async (c) => {
  try {
    const { id } = await c.req.json();
    if (!id) return c.json({ error: 'Game ID is required' }, 400);

    const cacheKey = `bgg_details_${id}`;
    const cached = await kv.get(cacheKey);
    // averageRating 있는 새 캐시만 유효
    if (cached && cached.averageRating !== undefined) return c.json(cached);

    const bggToken = Deno.env.get('BGG_API_TOKEN');
    if (!bggToken) return c.json({ error: 'BGG API token not configured' }, 500);

    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${id}&stats=1`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${bggToken}` } });
    if (!response.ok) return c.json({ error: `BGG API error: ${response.statusText}` }, response.status);

    const xmlText = await response.text();

    // 기본 정보
    const imageMatch = xmlText.match(/<image>([^<]+)<\/image>/);
    const minPlayersMatch = xmlText.match(/<minplayers[^>]*value="(\d+)"/);
    const maxPlayersMatch = xmlText.match(/<maxplayers[^>]*value="(\d+)"/);
    const minPlayTimeMatch = xmlText.match(/<minplaytime[^>]*value="(\d+)"/);
    const maxPlayTimeMatch = xmlText.match(/<maxplaytime[^>]*value="(\d+)"/);
    const averageWeightMatch = xmlText.match(/<averageweight[^>]*value="([\d.]+)"/);
    const averageRatingMatch = xmlText.match(/<average[^>]*value="([\d.]+)"/);
    const minAgeMatch = xmlText.match(/<minage[^>]*value="(\d+)"/);
    const rankMatch = xmlText.match(/<rank[^>]*type="subtype"[^>]*value="(\d+)"/);

    // 디자이너, 아트웍, 출판사
    const designers: string[] = [];
    const artists: string[] = [];
    const publishers: string[] = [];
    for (const m of xmlText.matchAll(/<link[^>]*type="boardgamedesigner"[^>]*value="([^"]+)"/g)) designers.push(m[1]);
    for (const m of xmlText.matchAll(/<link[^>]*type="boardgameartist"[^>]*value="([^"]+)"/g)) artists.push(m[1]);
    for (const m of xmlText.matchAll(/<link[^>]*type="boardgamepublisher"[^>]*value="([^"]+)"/g)) publishers.push(m[1]);

    // 베스트/추천 인원
    let bestPlayerCount = '';
    let recommendedPlayerCount = '';
    const pollMatch = xmlText.match(/<poll[^>]*name="suggested_numplayers"[^>]*>([\s\S]*?)<\/poll>/);
    if (pollMatch) {
      let maxBestVotes = 0, maxRecVotes = 0;
      for (const r of pollMatch[1].matchAll(/<results[^>]*numplayers="([^"]+)"[^>]*>([\s\S]*?)<\/results>/g)) {
        const numP = r[1];
        const bm = r[2].match(/<result[^>]*value="Best"[^>]*numvotes="(\d+)"/);
        const rm = r[2].match(/<result[^>]*value="Recommended"[^>]*numvotes="(\d+)"/);
        if (bm && parseInt(bm[1]) > maxBestVotes) { maxBestVotes = parseInt(bm[1]); bestPlayerCount = numP; }
        if (rm && parseInt(rm[1]) > maxRecVotes) { maxRecVotes = parseInt(rm[1]); recommendedPlayerCount = numP; }
      }
    }

    const details = {
      imageUrl: imageMatch ? imageMatch[1].trim() : '',
      minPlayers: minPlayersMatch ? parseInt(minPlayersMatch[1]) : 0,
      maxPlayers: maxPlayersMatch ? parseInt(maxPlayersMatch[1]) : 0,
      minPlayTime: minPlayTimeMatch ? parseInt(minPlayTimeMatch[1]) : 0,
      maxPlayTime: maxPlayTimeMatch ? parseInt(maxPlayTimeMatch[1]) : 0,
      complexity: averageWeightMatch ? parseFloat(averageWeightMatch[1]) : 0,
      averageRating: averageRatingMatch ? parseFloat(averageRatingMatch[1]) : 0,
      minAge: minAgeMatch ? parseInt(minAgeMatch[1]) : 0,
      rank: rankMatch ? parseInt(rankMatch[1]) : 0,
      bestPlayerCount,
      recommendedPlayerCount,
      designers: designers.slice(0, 5),
      artists: artists.slice(0, 5),
      publishers: publishers.slice(0, 3),
    };

    await kv.set(cacheKey, details); // 영구 저장 (TTL 없음)
    return c.json(details);
  } catch (error) {
    console.error('BGG details error:', error);
    return c.json({ error: `Details error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

// BGG 데이터 파싱 헬퍼 (migrate-all에서도 재사용)
async function fetchAndParseBggDetails(id: string, bggToken: string): Promise<any | null> {
  try {
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${id}&stats=1`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${bggToken}` } });
    if (!response.ok) return null;
    const xmlText = await response.text();

    const imageMatch = xmlText.match(/<image>([^<]+)<\/image>/);
    const minPlayersMatch = xmlText.match(/<minplayers[^>]*value="(\d+)"/);
    const maxPlayersMatch = xmlText.match(/<maxplayers[^>]*value="(\d+)"/);
    const minPlayTimeMatch = xmlText.match(/<minplaytime[^>]*value="(\d+)"/);
    const maxPlayTimeMatch = xmlText.match(/<maxplaytime[^>]*value="(\d+)"/);
    const averageWeightMatch = xmlText.match(/<averageweight[^>]*value="([\d.]+)"/);
    const averageRatingMatch = xmlText.match(/<average[^>]*value="([\d.]+)"/);
    const minAgeMatch = xmlText.match(/<minage[^>]*value="(\d+)"/);
    const rankMatch = xmlText.match(/<rank[^>]*type="subtype"[^>]*value="(\d+)"/);

    const designers: string[] = [];
    const artists: string[] = [];
    const publishers: string[] = [];
    for (const m of xmlText.matchAll(/<link[^>]*type="boardgamedesigner"[^>]*value="([^"]+)"/g)) designers.push(m[1]);
    for (const m of xmlText.matchAll(/<link[^>]*type="boardgameartist"[^>]*value="([^"]+)"/g)) artists.push(m[1]);
    for (const m of xmlText.matchAll(/<link[^>]*type="boardgamepublisher"[^>]*value="([^"]+)"/g)) publishers.push(m[1]);

    let bestPlayerCount = '';
    let recommendedPlayerCount = '';
    const pollMatch = xmlText.match(/<poll[^>]*name="suggested_numplayers"[^>]*>([\s\S]*?)<\/poll>/);
    if (pollMatch) {
      let maxBestVotes = 0, maxRecVotes = 0;
      for (const r of pollMatch[1].matchAll(/<results[^>]*numplayers="([^"]+)"[^>]*>([\s\S]*?)<\/results>/g)) {
        const numP = r[1];
        const bm = r[2].match(/<result[^>]*value="Best"[^>]*numvotes="(\d+)"/);
        const rm = r[2].match(/<result[^>]*value="Recommended"[^>]*numvotes="(\d+)"/);
        if (bm && parseInt(bm[1]) > maxBestVotes) { maxBestVotes = parseInt(bm[1]); bestPlayerCount = numP; }
        if (rm && parseInt(rm[1]) > maxRecVotes) { maxRecVotes = parseInt(rm[1]); recommendedPlayerCount = numP; }
      }
    }

    const rawImage = imageMatch ? imageMatch[1].trim() : '';
    return {
      imageUrl: rawImage.startsWith('//') ? 'https:' + rawImage : rawImage,
      minPlayers: minPlayersMatch ? parseInt(minPlayersMatch[1]) : 0,
      maxPlayers: maxPlayersMatch ? parseInt(maxPlayersMatch[1]) : 0,
      minPlayTime: minPlayTimeMatch ? parseInt(minPlayTimeMatch[1]) : 0,
      maxPlayTime: maxPlayTimeMatch ? parseInt(maxPlayTimeMatch[1]) : 0,
      complexity: averageWeightMatch ? parseFloat(averageWeightMatch[1]) : 0,
      averageRating: averageRatingMatch ? parseFloat(averageRatingMatch[1]) : 0,
      minAge: minAgeMatch ? parseInt(minAgeMatch[1]) : 0,
      rank: rankMatch ? parseInt(rankMatch[1]) : 0,
      bestPlayerCount,
      recommendedPlayerCount,
      designers: designers.slice(0, 5),
      artists: artists.slice(0, 5),
      publishers: publishers.slice(0, 3),
    };
  } catch {
    return null;
  }
}

// BGG 캐시 일괄 마이그레이션 (관리자 전용)
app.post("/make-server-0b7d3bae/bgg-cache/migrate-all", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin') return c.json({ error: 'Admin only' }, 403);

    const bggToken = Deno.env.get('BGG_API_TOKEN');
    if (!bggToken) return c.json({ error: 'BGG_API_TOKEN not configured' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const offset: number = body.offset ?? 0;
    const limit: number = body.limit ?? 10;

    // site_game_* 에서 bggId 목록 수집
    const siteGames = await getByPrefix('site_game_');
    const bggIds = [...new Set(
      siteGames
        .map(({ value: g }: any) => g?.bggId || (g?.id && /^\d+$/.test(g.id) ? g.id : null))
        .filter(Boolean)
        .map(String)
    )];
    const total = bggIds.length;
    const batch = bggIds.slice(offset, offset + limit);

    let cached = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const bggId of batch) {
      const cacheKey = `bgg_details_${bggId}`;
      const existing = await kv.get(cacheKey);
      if (existing && existing.averageRating !== undefined && existing.imageUrl) {
        skipped++;
        continue;
      }
      await new Promise(r => setTimeout(r, 500));
      const details = await fetchAndParseBggDetails(bggId, bggToken);
      if (details && details.averageRating !== undefined) {
        await kv.set(cacheKey, details);
        cached++;
      } else {
        failed++;
        errors.push(bggId);
      }
    }

    const nextOffset = offset + limit;
    return c.json({
      success: true,
      total,
      offset,
      limit,
      cached,
      skipped,
      failed,
      errors,
      done: nextOffset >= total,
      nextOffset: nextOffset < total ? nextOffset : null,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// GET version of BGG game details with more comprehensive parsing
app.get("/make-server-0b7d3bae/bgg/game/:id", async (c) => {
  try {
    const id = c.req.param('id');
    
    if (!id) {
      return c.json({ error: 'Game ID is required' }, 400);
    }

    // Check cache first
    const cacheKey = `bgg_game_full_${id}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const bggToken = Deno.env.get('BGG_API_TOKEN');
    if (!bggToken) {
      console.error('BGG_API_TOKEN not configured');
      return c.json({ error: 'BGG API token not configured' }, 500);
    }

    // Call BGG API with stats
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${id}&stats=1`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${bggToken}`,
      },
    });

    if (!response.ok) {
      console.error('BGG API error:', response.status, response.statusText);
      return c.json({ error: `BGG API error: ${response.statusText}` }, response.status);
    }

    const xmlText = await response.text();
    
    // Parse comprehensive game information
    const nameMatch = xmlText.match(/<name[^>]*type=\"primary\"[^>]*value=\"([^\"]*)\"/)
    const yearMatch = xmlText.match(/<yearpublished[^>]*value=\"(\d+)\"/);
    const imageMatch = xmlText.match(/<image>([^<]+)<\/image>/);
    const descriptionMatch = xmlText.match(/<description>([^<]+)<\/description>/);
    const minPlayersMatch = xmlText.match(/<minplayers[^>]*value=\"(\d+)\"/);
    const maxPlayersMatch = xmlText.match(/<maxplayers[^>]*value=\"(\d+)\"/);
    const playingtimeMatch = xmlText.match(/<playingtime[^>]*value=\"(\d+)\"/);
    const minPlaytimeMatch = xmlText.match(/<minplaytime[^>]*value=\"(\d+)\"/);
    const maxPlaytimeMatch = xmlText.match(/<maxplaytime[^>]*value=\"(\d+)\"/);
    const minAgeMatch = xmlText.match(/<minage[^>]*value=\"(\d+)\"/);
    
    // Extract designers
    const designers: string[] = [];
    const designerMatches = xmlText.matchAll(/<link[^>]*type=\"boardgamedesigner\"[^>]*value=\"([^\"]*)\"[^>]*\/>/g);
    for (const match of designerMatches) {
      designers.push(match[1]);
    }
    
    // Extract artists
    const artists: string[] = [];
    const artistMatches = xmlText.matchAll(/<link[^>]*type=\"boardgameartist\"[^>]*value=\"([^\"]*)\"[^>]*\/>/g);
    for (const match of artistMatches) {
      artists.push(match[1]);
    }
    
    // Extract publishers
    const publishers: string[] = [];
    const publisherMatches = xmlText.matchAll(/<link[^>]*type=\"boardgamepublisher\"[^>]*value=\"([^\"]*)\"[^>]*\/>/g);
    for (const match of publisherMatches) {
      publishers.push(match[1]);
    }
    
    // Extract categories
    const categories: string[] = [];
    const categoryMatches = xmlText.matchAll(/<link[^>]*type=\"boardgamecategory\"[^>]*value=\"([^\"]*)\"[^>]*\/>/g);
    for (const match of categoryMatches) {
      categories.push(match[1]);
    }
    
    // Extract mechanics
    const mechanics: string[] = [];
    const mechanicMatches = xmlText.matchAll(/<link[^>]*type=\"boardgamemechanic\"[^>]*value=\"([^\"]*)\"[^>]*\/>/g);
    for (const match of mechanicMatches) {
      mechanics.push(match[1]);
    }

    const gameData = {
      id,
      name: nameMatch ? nameMatch[1] : '',
      yearpublished: yearMatch ? parseInt(yearMatch[1]) : null,
      image: imageMatch ? imageMatch[1] : '',
      description: descriptionMatch ? descriptionMatch[1] : '',
      minplayers: minPlayersMatch ? parseInt(minPlayersMatch[1]) : null,
      maxplayers: maxPlayersMatch ? parseInt(maxPlayersMatch[1]) : null,
      playingtime: playingtimeMatch ? parseInt(playingtimeMatch[1]) : null,
      minplaytime: minPlaytimeMatch ? parseInt(minPlaytimeMatch[1]) : null,
      maxplaytime: maxPlaytimeMatch ? parseInt(maxPlaytimeMatch[1]) : null,
      minage: minAgeMatch ? parseInt(minAgeMatch[1]) : null,
      designers,
      artists,
      publishers,
      categories,
      mechanics,
    };

    // Cache for 7 days (game details rarely change)
    await kv.set(cacheKey, gameData, 604800);
    
    return c.json(gameData);
  } catch (error) {
    console.error('BGG game details error:', error);
    return c.json({ error: `Details error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

// BGG Thing API endpoint - for detailed game information in overview form
app.get("/make-server-0b7d3bae/bgg/thing/:id", async (c) => {
  try {
    const id = c.req.param('id');
    
    if (!id) {
      return c.json({ error: 'Game ID is required' }, 400);
    }

    // Check cache first
    const cacheKey = `bgg_thing_${id}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      return c.json(cached);
    }

    const bggToken = Deno.env.get('BGG_API_TOKEN');
    if (!bggToken) {
      console.error('BGG_API_TOKEN not configured');
      return c.json({ error: 'BGG API token not configured' }, 500);
    }

    // Call BGG API with stats
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${id}&stats=1`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${bggToken}`,
      },
    });

    if (!response.ok) {
      console.error('BGG API error:', response.status, response.statusText);
      return c.json({ error: `BGG API error: ${response.statusText}` }, response.status);
    }

    const xmlText = await response.text();
    
    // Parse comprehensive game information
    const nameMatch = xmlText.match(/<name[^>]*type=\"primary\"[^>]*value=\"([^\"]*)\"/);
    const yearMatch = xmlText.match(/<yearpublished[^>]*value=\"(\d+)\"/);
    const imageMatch = xmlText.match(/<image>([^<]+)<\/image>/);
    const descriptionMatch = xmlText.match(/<description>([^<]+)<\/description>/);
    const minPlayersMatch = xmlText.match(/<minplayers[^>]*value=\"(\d+)\"/);
    const maxPlayersMatch = xmlText.match(/<maxplayers[^>]*value=\"(\d+)\"/);
    const playingtimeMatch = xmlText.match(/<playingtime[^>]*value=\"(\d+)\"/);
    const minPlaytimeMatch = xmlText.match(/<minplaytime[^>]*value=\"(\d+)\"/);
    const maxPlaytimeMatch = xmlText.match(/<maxplaytime[^>]*value=\"(\d+)\"/);
    const minAgeMatch = xmlText.match(/<minage[^>]*value=\"(\d+)\"/);
    const weightMatch = xmlText.match(/<averageweight[^>]*value=\"([\d.]+)\"/);
    
    // Extract designers
    const designers: string[] = [];
    const designerMatches = xmlText.matchAll(/<link[^>]*type=\"boardgamedesigner\"[^>]*value=\"([^\"]*)\"[^>]*\/>/g);
    for (const match of designerMatches) {
      designers.push(match[1]);
    }
    
    // Extract artists
    const artists: string[] = [];
    const artistMatches = xmlText.matchAll(/<link[^>]*type=\"boardgameartist\"[^>]*value=\"([^\"]*)\"[^>]*\/>/g);
    for (const match of artistMatches) {
      artists.push(match[1]);
    }
    
    // Extract publishers
    const publishers: string[] = [];
    const publisherMatches = xmlText.matchAll(/<link[^>]*type=\"boardgamepublisher\"[^>]*value=\"([^\"]*)\"[^>]*\/>/g);
    for (const match of publisherMatches) {
      publishers.push(match[1]);
    }
    
    // Extract categories
    const categories: string[] = [];
    const categoryMatches = xmlText.matchAll(/<link[^>]*type=\"boardgamecategory\"[^>]*value=\"([^\"]*)\"[^>]*\/>/g);
    for (const match of categoryMatches) {
      categories.push(match[1]);
    }
    
    // Extract mechanics
    const mechanics: string[] = [];
    const mechanicMatches = xmlText.matchAll(/<link[^>]*type=\"boardgamemechanic\"[^>]*value=\"([^\"]*)\"[^>]*\/>/g);
    for (const match of mechanicMatches) {
      mechanics.push(match[1]);
    }

    // Format player count
    let playerCount = '';
    if (minPlayersMatch && maxPlayersMatch) {
      const min = minPlayersMatch[1];
      const max = maxPlayersMatch[1];
      playerCount = min === max ? `${min}명` : `${min}-${max}명`;
    }

    // Format play time
    let playTime = '';
    if (minPlaytimeMatch && maxPlaytimeMatch) {
      const min = minPlaytimeMatch[1];
      const max = maxPlaytimeMatch[1];
      playTime = min === max ? `${min}분` : `${min}-${max}분`;
    } else if (playingtimeMatch) {
      playTime = `${playingtimeMatch[1]}분`;
    }

    // Format difficulty/weight
    let difficulty = '';
    if (weightMatch) {
      const weight = parseFloat(weightMatch[1]);
      difficulty = weight.toFixed(2);
    }

    const gameData = {
      name: nameMatch ? nameMatch[1] : '',
      yearPublished: yearMatch ? yearMatch[1] : '',
      designer: designers.join(', '),
      artist: artists.join(', '),
      publisher: publishers.join(', '),
      playerCount,
      playTime,
      age: minAgeMatch ? `${minAgeMatch[1]}세 이상` : '',
      weight: difficulty,
      description: descriptionMatch ? descriptionMatch[1].replace(/&[^;]+;/g, '') : '', // Remove HTML entities
      categories: categories.join(', '),
      mechanics: mechanics.join(', '),
    };

    // Cache for 7 days (game details rarely change)
    await kv.set(cacheKey, gameData, 604800);
    
    return c.json(gameData);
  } catch (error) {
    console.error('BGG thing error:', error);
    return c.json({ error: `Thing error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

// Image upload endpoint

// 게임 이미지 일괄 변경 (bggId 또는 koreanName 기준으로 모든 유저 보유/위시 데이터 업데이트)
// 게임 이미지 오버라이드 조회 (bggId 기준)
// 게임명으로 site_game + bgg_details 통합 조회 (보드위키 URL 직접 접속용)
app.get("/make-server-0b7d3bae/game/info", async (c) => {
  try {
    const name = c.req.query('name');
    if (!name) return c.json(null, 400);

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const q = norm(name);

    // site_game_* 에서 이름으로 검색
    const siteGames = await getByPrefix('site_game_');
    let found: any = null;
    for (const { value: g } of siteGames) {
      if (!g?.id) continue;
      if (norm(g.koreanName || '') === q || norm(g.englishName || '') === q || norm(g.name || '') === q) {
        found = g;
        break;
      }
    }
    if (!found) return c.json(null, 404);

    // bggId가 있으면 bgg_details 캐시도 병합
    const bggId = found.bggId && /^\d+$/.test(found.bggId) ? found.bggId : null;
    let details: any = null;
    if (bggId) {
      details = await kv.get(`bgg_details_${bggId}`);
    }

    const imageUrl = found.imageUrl || details?.imageUrl || '';
    return c.json({
      id: found.id,
      bggId: bggId || found.id,
      koreanName: found.koreanName || found.name || '',
      englishName: found.englishName || '',
      imageUrl: imageUrl.startsWith('//') ? 'https:' + imageUrl : imageUrl,
      yearPublished: found.yearPublished || '',
      minPlayers: details?.minPlayers || 0,
      maxPlayers: details?.maxPlayers || 0,
      minPlayTime: details?.minPlayTime || 0,
      maxPlayTime: details?.maxPlayTime || 0,
      complexity: details?.complexity || 0,
      averageRating: details?.averageRating || 0,
      rank: details?.rank || 0,
      designers: details?.designers || [],
      publishers: details?.publishers || [],
      recommendedPlayers: details?.minPlayers && details?.maxPlayers ? `${details.minPlayers}-${details.maxPlayers}명` : '',
      playTime: details?.maxPlayTime ? `${details.maxPlayTime}분` : '',
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

// 게임 보유 인원 수 (공개, 목록 없음)
app.get("/make-server-0b7d3bae/game/owner-count", async (c) => {
  try {
    const gameId = c.req.query('id') || '';
    const gameName = c.req.query('name') || '';
    if (!gameId && !gameName) return c.json({ count: 0 });

    const normG = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
    const tn = normG(gameName);

    const sid = String(gameId);
    const hasGame = (g: any): boolean => {
      if (!g?.id) return false;
      const gid = String(g.id);
      const gbgg = g.bggId ? String(g.bggId) : '';
      if (gameId && (gid === sid || gbgg === sid)) return true;
      if (tn) {
        if (normG(g.koreanName || g.name || '') === tn) return true;
        if (normG(g.englishName || '') === tn) return true;
      }
      return false;
    };

    const seenUsers = new Set<string>();
    const getUserId = (key: string): string | null => {
      const rest = key.slice(5);
      const gi = rest.indexOf('_game_');
      if (gi > 0) return rest.slice(0, gi);
      if (rest.endsWith('_owned')) return rest.slice(0, rest.length - 6);
      if (rest.endsWith('_wishlist')) return rest.slice(0, rest.length - 9);
      return null;
    };

    const allUserItems = await kv.getByPrefixWithKeys('user_');
    for (const { key, value } of allUserItems) {
      if (key.includes('_backup') || key.includes('_metadata') || key.includes('_temp') || key.includes('_profile_')) continue;
      const uid = getUserId(key);
      if (!uid || seenUsers.has(uid)) continue;
      const games = Array.isArray(value) ? value : (value?.id ? [value] : []);
      if (games.some(hasGame)) seenUsers.add(uid);
    }

    return c.json({ count: seenUsers.size });
  } catch (e) { return c.json({ count: 0 }); }
});

// 임시 디버그: 특정 이메일 유저의 KV 컬렉션 키 + 게임 목록 확인
// user_ 키 총 개수 + pagination 실제 반환 수 확인
app.get("/make-server-0b7d3bae/debug/kv-count", async (c) => {
  try {
    const prefix = c.req.query('prefix') || 'user_';
    const { createClient } = await import('jsr:@supabase/supabase-js@2');
    const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { count, error } = await sb.from('kv_store_0b7d3bae').select('*', { count: 'exact', head: true }).like('key', prefix + '%');
    // getByPrefixWithKeys로 실제 반환 수도 확인
    const actual = await kv.getByPrefixWithKeys(prefix);
    return c.json({ prefix, dbCount: count, actualReturned: actual.length, error: error?.message });
  } catch (e) { return c.json({ error: String(e) }); }
});

// 특정 게임 bggId로 보유자 userId 전체 검색
app.get("/make-server-0b7d3bae/debug/game-owners", async (c) => {
  try {
    const bggId = c.req.query('bggId') || '';
    const name = c.req.query('name') || '';
    if (!bggId && !name) return c.json({ error: 'bggId or name required' });
    const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
    const tn = norm(name);
    const allItems = await kv.getByPrefixWithKeys('user_');
    const result: {key: string, userId: string, gameId: string, gameBggId: string, gameName: string}[] = [];
    for (const { key, value } of allItems) {
      if (key.includes('_backup') || key.includes('_profile_')) continue;
      const games = Array.isArray(value) ? value : (value?.id ? [value] : []);
      for (const g of games) {
        const match = (bggId && String(g?.bggId) === bggId) ||
                      (tn && (norm(g?.koreanName || '') === tn || norm(g?.englishName || '') === tn));
        if (match) {
          const rest = key.slice(5);
          const gi = rest.indexOf('_game_');
          const userId = gi > 0 ? rest.slice(0, gi) : rest.endsWith('_owned') ? rest.slice(0, -6) : rest.endsWith('_wishlist') ? rest.slice(0, -9) : null;
          if (userId) result.push({ key, userId, gameId: String(g.id), gameBggId: String(g.bggId), gameName: g.koreanName || g.englishName || '' });
        }
      }
    }
    return c.json(result);
  } catch (e) { return c.json({ error: String(e) }); }
});

app.get("/make-server-0b7d3bae/debug/user-games", async (c) => {
  try {
    const email = c.req.query('email') || '';
    if (!email) return c.json({ error: 'email required' });

    // 1. beta_user_* 에서 userId 찾기
    const betaUsers = await kv.getByPrefixWithKeys('beta_user_');
    const matched = betaUsers.filter(({ value: u }) =>
      (u?.email || '').toLowerCase() === email.toLowerCase()
    );

    if (!matched.length) return c.json({ error: '유저 없음', email });

    const result: any[] = [];
    for (const { key: bk, value: u } of matched) {
      const userId = u?.userId || u?.id;
      if (!userId) continue;

      // 2. user_* 키 전체에서 이 userId 관련 키 수집
      const allUserItems = await kv.getByPrefixWithKeys(`user_${userId}`);
      const keys: any[] = [];
      for (const { key, value } of allUserItems) {
        const games = Array.isArray(value) ? value.map((g: any) => ({ id: g?.id, bggId: g?.bggId, koreanName: g?.koreanName, englishName: g?.englishName }))
          : (value?.id ? [{ id: value.id, bggId: value.bggId, koreanName: value.koreanName, englishName: value.englishName }] : []);
        keys.push({ key, gameCount: games.length, games });
      }
      result.push({ betaKey: bk, userId, email: u?.email, keys });
    }

    return c.json(result);
  } catch (e) { return c.json({ error: String(e) }); }
});


app.get("/make-server-0b7d3bae/game/image-override", async (c) => {
  try {
    const bggId = c.req.query('bggId');
    const gameId = c.req.query('gameId');
    if (!bggId && !gameId) return c.json(null);
    const key = bggId ? `game_image_bgg_${bggId}` : `game_image_id_${gameId}`;
    const data = await kv.get(key);
    return c.json(data || null);
  } catch {
    return c.json(null);
  }
});

// 게임 이미지 변경 요청 (관리자: 즉시 적용 / 일반: 검수 대기)
app.post("/make-server-0b7d3bae/game/update-image", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const { gameId, bggId, koreanName, newImageUrl } = await c.req.json();
    if (!newImageUrl) return c.json({ error: 'newImageUrl required' }, 400);

    const role = await getUserRole(user.id);
    const isAdmin = role === 'admin';

    if (isAdmin) {
      // 관리자: 즉시 모든 유저 데이터에 반영
      await applyGameImageUpdate(gameId, bggId, koreanName, newImageUrl);
      return c.json({ success: true, status: 'applied' });
    } else {
      // 일반회원: 검수 대기 큐에 추가
      const requestId = `img_req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await kv.set(requestId, {
        id: requestId,
        gameId, bggId, koreanName, newImageUrl,
        requestedBy: user.id,
        requestedAt: new Date().toISOString(),
        status: 'pending',
      });
      return c.json({ success: true, status: 'pending', message: '검수 후 반영될 예정이에요' });
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 이미지 일괄 적용 헬퍼
async function applyGameImageUpdate(gameId: string, bggId: string, koreanName: string, newImageUrl: string) {
  // 공용 이미지 맵에 저장 (로드 시 오버라이드용)
  const imageMapKey = bggId ? `game_image_bgg_${bggId}` : (gameId ? `game_image_id_${gameId}` : null);
  if (imageMapKey) await kv.set(imageMapKey, { imageUrl: newImageUrl, updatedAt: new Date().toISOString() });

  const allUserKeys = await getByPrefix('user_');
  const matches = (g: any) =>
    (gameId && g.id === gameId) ||
    (bggId && g.bggId === bggId) ||
    (koreanName && (g.koreanName || '').toLowerCase() === koreanName.toLowerCase());

  for (const { key, value } of allUserKeys) {
    // 방식 A: 개별 게임 키 (user_{userId}_game_{gameId})
    if (key.includes('_game_') && value && matches(value)) {
      await kv.set(key, { ...value, imageUrl: newImageUrl });
      continue;
    }
    // 방식 B: 배열 키 (user_{userId}_owned, user_{userId}_wishlist)
    if (!key.endsWith('_owned') && !key.endsWith('_wishlist')) continue;
    const games: any[] = Array.isArray(value) ? value : [];
    let changed = false;
    for (const g of games) {
      if (matches(g)) { g.imageUrl = newImageUrl; changed = true; }
    }
    if (changed) await kv.set(key, games);
  }
}

// 이미지 변경 요청 목록 조회 (관리자용)
app.get("/make-server-0b7d3bae/game/image-requests", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const all = await getByPrefix('img_req_');
    const requests = all.map(d => d.value).filter((r: any) => r.status === 'pending');
    return c.json(requests);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 이미지 변경 요청 승인/거부 (관리자용)
app.post("/make-server-0b7d3bae/game/image-requests/:requestId/review", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const requestId = c.req.param('requestId');
    const { action } = await c.req.json(); // 'approve' | 'reject'
    const req = await kv.get(requestId);
    if (!req) return c.json({ error: 'Request not found' }, 404);

    if (action === 'approve') {
      await applyGameImageUpdate(req.gameId, req.bggId, req.koreanName, req.newImageUrl);
      req.status = 'approved';
    } else {
      req.status = 'rejected';
    }
    req.reviewedAt = new Date().toISOString();
    req.reviewedBy = user.id;
    await kv.set(requestId, req);

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

app.post("/make-server-0b7d3bae/upload-image", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' }, 400);
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: 'File too large. Maximum size is 5MB.' }, 400);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const extension = file.name.split('.').pop();
    const filename = `${timestamp}-${random}.${extension}`;

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, uint8Array, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('Storage upload error:', error);
      return c.json({ error: `Upload failed: ${error.message}` }, 500);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filename);

    return c.json({ imageUrl: publicUrl });
  } catch (error) {
    console.error('Image upload error:', error);
    return c.json({ error: `Upload error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

// Auth: Sign up endpoint
app.post("/make-server-0b7d3bae/auth/check-nickname", async (c) => {
  try {
    const { username } = await c.req.json();
    if (!username?.trim()) return c.json({ exists: false });
    const allUsers = await getByPrefix('beta_user_');
    const usernameLower = username.toLowerCase().trim();
    const exists = allUsers.some((item: any) => {
      const val = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
      return val?.username?.toLowerCase() === usernameLower;
    });
    return c.json({ exists });
  } catch { return c.json({ exists: false }); }
});

app.post("/make-server-0b7d3bae/auth/check-email", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ exists: false });
    // KV에 beta_user로 등록된 유저만 진짜 가입된 유저로 판단
    const allUsers = await getByPrefix('beta_user_');
    const emailLower = email.toLowerCase().trim();
    const exists = allUsers.some((item: any) => {
      const val = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
      return val?.email?.toLowerCase() === emailLower;
    });
    return c.json({ exists });
  } catch { return c.json({ exists: false }); }
});

// 이메일 인증번호 발송
app.post("/make-server-0b7d3bae/auth/send-verification-code", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: '이메일을 입력해주세요' }, 400);

    // 중복 이메일 체크
    // KV에 beta_user로 등록된 유저만 진짜 가입된 유저로 판단 (Supabase 임시 유저 제외)
    const allUsers = await getByPrefix('beta_user_');
    const emailLower = email.toLowerCase().trim();
    console.log('[check-dup] 검사 이메일:', emailLower, '| KV 유저 수:', allUsers.length);
    const alreadyExists = allUsers.some((item: any) => {
      const val = typeof item.value === 'string' ? JSON.parse(item.value) : item.value;
      console.log('[check-dup] KV email:', val?.email);
      return val?.email?.toLowerCase() === emailLower;
    });
    console.log('[check-dup] 중복 결과:', alreadyExists);
    if (alreadyExists) return c.json({ error: '이미 가입된 이메일 주소예요. 로그인을 시도해보세요.' }, 400);

    // 6자리 인증번호 생성 후 KV 저장 (10분 유효)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await kv.set(`email_verify_${email.toLowerCase().trim()}`, { code, expiresAt: Date.now() + 10 * 60 * 1000 });

    // Resend로 메일 발송 시도
    const resendKey = Deno.env.get('RESEND_API_KEY');
    let mailSent = false;
    if (resendKey) {
      try {
        const mailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'noreply@boardraum.site',
            to: email,
            subject: '[보드라움] 이메일 인증번호',
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h2 style="color:#111">보드라움 이메일 인증</h2>
              <p>아래 인증번호를 입력해주세요. (10분 이내 유효)</p>
              <div style="background:#f2f2f2;border-radius:12px;padding:24px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:#111;margin:24px 0">${code}</div>
              <p style="color:#888;font-size:13px">본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
            </div>`,
          }),
        });
        if (mailRes.ok) {
          mailSent = true;
          console.log('✅ 인증메일 발송 성공:', email);
        } else {
          const err = await mailRes.text();
          console.error('Resend 발송 실패:', err);
        }
      } catch (e) {
        console.error('Resend 예외:', e);
      }
    }

    // 메일 발송 성공이면 성공만, 실패면 devCode도 함께 반환
    return c.json({ success: true, mailSent, devCode: mailSent ? undefined : code });
  } catch (e) {
    console.error('send-verification-code error:', e);
    return c.json({ error: '인증번호 발송에 실패했어요. 다시 시도해주세요.' }, 500);
  }
});

// 이메일 인증번호 확인
app.post("/make-server-0b7d3bae/auth/verify-code", async (c) => {
  try {
    const { email, code } = await c.req.json();
    if (!email || !code) return c.json({ error: '이메일과 인증번호를 입력해주세요' }, 400);

    const stored = await kv.get(`email_verify_${email.toLowerCase().trim()}`);
    if (!stored) return c.json({ error: '인증번호를 먼저 요청해주세요' }, 400);
    if (Date.now() > stored.expiresAt) {
      await kv.del(`email_verify_${email.toLowerCase().trim()}`);
      return c.json({ error: '인증번호가 만료됐어요. 다시 요청해주세요' }, 400);
    }
    if (stored.code !== code.trim()) return c.json({ error: '인증번호가 일치하지 않아요' }, 400);

    // 인증 성공 - 완료 표시
    await kv.set(`email_verify_${email.toLowerCase().trim()}`, { ...stored, verified: true });
    return c.json({ success: true });
  } catch (e) {
    console.error('verify-code error:', e);
    return c.json({ error: '인증번호 확인에 실패했어��' }, 500);
  }
});

app.post("/make-server-0b7d3bae/auth/signup", async (c) => {
  try {
    const { email, password, name, username, phone, reason, referralCode } = await c.req.json();
    
    if (!email || !password || !name || !phone) {
      return c.json({ error: 'Email, password, name, and phone are required' }, 400);
    }

    // 유저 생성 (이미 있으면 업데이트, 없으면 신규 생성)
    let userId: string | undefined;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name || '', username: username || '' },
      email_confirm: true,
    });

    if (error) {
      // 이미 존재하는 유저면 업데이트 (OTP 임시 유저 처리)
      if (error.code === 'email_exists' || error.message?.includes('already') || error.message?.includes('duplicate')) {
        const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 }).catch(() => ({ data: null }));
        const existing = userList?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase().trim());
        if (existing) {
          const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
            password,
            user_metadata: { name: name || '', username: username || '' },
            email_confirm: true,
          });
          if (updateError) return c.json({ error: '회원가입 처리 중 오류가 발생했어요.' }, 400);
          userId = updated?.user?.id;
        } else {
          return c.json({ error: '이미 가입된 이메일 주소예요. 로그인을 시도해보세요.' }, 400);
        }
      } else {
        return c.json({ error: `Sign up failed: ${error.message}` }, 400);
      }
    } else {
      if (!data?.user?.id) return c.json({ error: '회원가입 처리 중 오류가 발생했어요.' }, 400);
      userId = data.user.id;
    }

    // Save beta tester info to KV store
    if (userId) {
      const betaTesterInfo = {
        userId,
        email,
        name,
        username: username || '',
        phone,
        reason: reason || '',
        status: 'approved', // 베타 종료 — 가입 즉시 승인
        created_at: new Date().toISOString(),
      };
      
      await kv.set(`beta_user_${userId}`, betaTesterInfo);

      // ★ 가입 즉시 user_profile_ KV도 생성 → 프로필 페이지에 닉네임·이메일 자동 표시
      const existingProfile = await kv.get(`user_profile_${userId}`).catch(() => null);
      if (!existingProfile) {
        await kv.set(`user_profile_${userId}`, {
          userId,
          email,
          name,
          username: username || '',
          phone,
          birthdate: '',
          profileImage: '',
          bio: '',
          favoriteGames: '',
          createdAt: new Date().toISOString(),
        });
      }

      // 추천인 처리 (코드 기반)
      if (referralCode?.trim() && userId) {
        try {
          const codeData = await kv.get(`referral_code_${referralCode.trim()}`).catch(() => null);
          if (codeData?.userId && codeData.userId !== userId) {
            // 본인 추천 방지
            const referrerId = codeData.userId;
            const referrerEntry = await kv.get(`beta_user_${referrerId}`).catch(() => null);
            const referrerEmail = referrerEntry?.email;
            const REFERRAL_BONUS = 3; // 추천인 보너스카드 장수
            let referralCardsBefore = 0;
            let referralCardsAfter = 0;
            if (referrerEmail) {
              const current = await readCardCountByEmail(referrerEmail, referrerId);
              referralCardsBefore = current;
              referralCardsAfter = current + REFERRAL_BONUS;
              await writeCardCountByEmail(referrerEmail, referralCardsAfter);
              console.log(`✅ 추천인 보너스카드 +${REFERRAL_BONUS}: email=${referrerEmail} (${current}→${referralCardsAfter})`);
            } else {
              const current = await readCardCount(referrerId);
              referralCardsBefore = current;
              referralCardsAfter = current + REFERRAL_BONUS;
              await writeCardCount(referrerId, referralCardsAfter);
            }
            // 추천 로그 저장 (랭킹 이벤트용)
            try {
              const referralLogs: any[] = await kv.get('referral_log') || [];
              referralLogs.push({
                referrerId,
                referrerName: referrerEntry?.name || referrerEntry?.username || '',
                referreeId: userId,
                refereeName: name || '',
                joinedAt: new Date().toISOString(),
              });
              await kv.set('referral_log', referralLogs);
            } catch {}
            // ★ 추천인 카드 이력 로그 저장
            try {
              const referrerLog: any[] = await kv.get(`bonus_card_log_${referrerId}`) || [];
              await kv.set(`bonus_card_log_${referrerId}`, [{
                type: 'referral',
                source: `추천인 초대 보상 (${name || userId} 가입)`,
                amount: REFERRAL_BONUS,
                cardsBefore: referralCardsBefore,
                cardsAfter: referralCardsAfter,
                grantedAt: Date.now(),
                referreeId: userId,
                refereeName: name || '',
              }, ...referrerLog].slice(0, 200));
            } catch {}
          }
        } catch (e) {
          console.error('추천인 처리 오류 (non-critical):', e);
        }
      }
    }

    return c.json({ 
      user: {
        id: userId,
        email: data.user?.email,
      }
    });
  } catch (error) {
    console.error('Sign up error:', error);
    return c.json({ error: `Sign up error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

// Auth: Get current session
app.get("/make-server-0b7d3bae/auth/session", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ user: null });
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return c.json({ user: null });
    }

    // Get user role from KV store (항상 DB에서 조회)
    const role = await getUserRole(user.id);

    return c.json({ 
      user: {
        id: user.id,
        email: user.email,
        role: role,
        isAdmin: role === 'admin'
      }
    });
  } catch (error) {
    console.error('Session check error:', error);
    return c.json({ user: null });
  }
});

// Data: Save user's board game data (원자적 업데이트 & 충돌 감지)
app.post("/make-server-0b7d3bae/data/save", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    const accessToken = authHeader?.split(' ')[1];
    
    if (!accessToken) {
      console.error('❌ [Save] No token provided');
      return c.json({ error: 'Unauthorized: No token provided' }, 401);
    }


    // Use service role client to verify user token
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError) {
      // Only log detailed errors if it's not a session missing error
      if (authError.message !== 'Auth session missing!') {
        console.error('❌ [Save] Auth error:', authError.message);
        // Safe stringify - avoid circular references
        try {
          console.error('❌ [Save] Auth error details:', {
            name: authError.name,
            message: authError.message,
            status: authError.status,
            __isAuthError: authError.__isAuthError
          });
        } catch (stringifyError) {
          console.error('❌ [Save] Could not stringify auth error');
        }
      }
      return c.json({ error: `Unauthorized: ${authError.message}` }, 401);
    }

    if (!user?.id) {
      console.error('❌ [Save] User ID not found in token');
      return c.json({ error: 'Unauthorized: User not found' }, 401);
    }

    const { ownedGames, wishlistGames, clientTimestamp, mergeMode = false } = await c.req.json();

    // 항상 클라이언트 데이터를 신뢰하여 덮어쓰기 (삭제 복구 버그 방지)
    // 병합 모드는 명시적으로 mergeMode=true 일 때만 허용
    const serverTimestamp = await kvGetWithRetry<number>(`user_${user.id}_last_modified`) || 0;
    const shouldMerge = mergeMode === true; // 자동 병합 완전 비활성화

    // 원자적 업데이트: 모든 작업을 try-catch로 감싸서 실패 시 롤백
    const timestamp = Date.now();
    
    try {
      // ���업 생성 (이전 데이터 보존)
      const backupOwnedKey = `user_${user.id}_owned_backup`;
      const backupWishlistKey = `user_${user.id}_wishlist_backup`;
      const currentOwned = await kvGetWithRetry<any[]>(`user_${user.id}_owned`);
      const currentWishlist = await kvGetWithRetry<any[]>(`user_${user.id}_wishlist`);
      
      if (currentOwned) await kvSetWithRetry(backupOwnedKey, currentOwned);
      if (currentWishlist) await kvSetWithRetry(backupWishlistKey, currentWishlist);
      
      // 병합 모드인 경우: 기존 데이터와 병합
      let finalOwnedGames = ownedGames;
      let finalWishlistGames = wishlistGames;
      
      if (shouldMerge && (currentOwned || currentWishlist)) {
        
        // 게임 ID를 기준으로 병합 (중복 제거)
        if (currentOwned && Array.isArray(currentOwned) && Array.isArray(ownedGames)) {
          const mergedOwned = [...currentOwned];
          ownedGames.forEach((game: any) => {
            const exists = mergedOwned.find((g: any) => g.id === game.id);
            if (!exists) {
              mergedOwned.push(game);
            } else {
              // 기존 게임 정보 업데이트 (최신 정보 우선)
              const index = mergedOwned.findIndex((g: any) => g.id === game.id);
              mergedOwned[index] = { ...mergedOwned[index], ...game };
            }
          });
          finalOwnedGames = mergedOwned;
        }
        
        if (currentWishlist && Array.isArray(currentWishlist) && Array.isArray(wishlistGames)) {
          const mergedWishlist = [...currentWishlist];
          wishlistGames.forEach((game: any) => {
            const exists = mergedWishlist.find((g: any) => g.id === game.id);
            if (!exists) {
              mergedWishlist.push(game);
            } else {
              // 기존 게임 정보 업데이트 (최신 정보 우선)
              const index = mergedWishlist.findIndex((g: any) => g.id === game.id);
              mergedWishlist[index] = { ...mergedWishlist[index], ...game };
            }
          });
          finalWishlistGames = mergedWishlist;
        }
      }
      
      const beforeOwned = await loadGamesWithFallback(user.id, 'owned');
      const beforeWishlist = await loadGamesWithFallback(user.id, 'wishlist');
      
      // ==================== 🆕 NEW: 개별 키로 저장 ====================
      await saveGamesIndividually(user.id, finalOwnedGames, 'owned');
      await saveGamesIndividually(user.id, finalWishlistGames, 'wishlist');
      
      // Legacy 방식도 유지 (fallback)
      await kvSetWithRetry(`user_${user.id}_owned`, finalOwnedGames);
      await kvSetWithRetry(`user_${user.id}_wishlist`, finalWishlistGames);
      await kvSetWithRetry(`user_${user.id}_last_modified`, timestamp);

      
      // 저장 직후 즉시 읽어서 확인
      const verifyOwned = await loadGamesWithFallback(user.id, 'owned');
      const verifyWishlist = await loadGamesWithFallback(user.id, 'wishlist');
      

      // 플레이 기록 수 계산
      const totalPlayRecords = (finalOwnedGames || []).reduce((sum: number, game: any) => 
        sum + (game.playRecords?.length || 0), 0);

      
      return c.json({ 
        status: 'success', 
        timestamp,
        message: 'Data saved successfully',
        merged: shouldMerge,
        ownedCount: finalOwnedGames?.length || 0,
        wishlistCount: finalWishlistGames?.length || 0
      });
    } catch (saveError) {
      console.error('❌ [Save] Failed to save data:', saveError);
      
      // 롤백: 백업에서 복구 시도
      try {
        const backupOwned = await kvGetWithRetry<any[]>(`user_${user.id}_owned_backup`);
        const backupWishlist = await kvGetWithRetry<any[]>(`user_${user.id}_wishlist_backup`);
        
        if (backupOwned) await kvSetWithRetry(`user_${user.id}_owned`, backupOwned);
        if (backupWishlist) await kvSetWithRetry(`user_${user.id}_wishlist`, backupWishlist);
        
      } catch (rollbackError) {
        console.error('❌ [Save] Rollback failed:', rollbackError);
      }
      
      return c.json({ 
        error: '저장에 실패했습니다. 다시 시도해주세요.',
        details: saveError instanceof Error ? saveError.message : 'Unknown error'
      }, 500);
    }
  } catch (error) {
    console.error('❌ [Save] Unexpected error:', error);
    return c.json({ 
      error: '저장 중 오류가 발생했습니다. 다시 시도해주세요.',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Data: Load user's board game data
app.get("/make-server-0b7d3bae/data/load", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    const accessToken = authHeader?.split(' ')[1];
    
    if (!accessToken) {
      console.error('❌ [Load] No token provided');
      return c.json({ error: 'Unauthorized: No token provided' }, 401);
    }


    // Use service role client to verify user token
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError) {
      // Only log detailed errors if it's not a session missing error
      if (authError.message !== 'Auth session missing!') {
        console.error('❌ [Load] Auth error:', authError.message);
        console.error('❌ [Load] Auth error details:', JSON.stringify(authError));
      }
      return c.json({ error: `Unauthorized: ${authError.message}` }, 401);
    }

    if (!user?.id) {
      console.error('❌ [Load] User ID not found in token');
      return c.json({ error: 'Unauthorized: User not found' }, 401);
    }

    // ==================== 병렬 로드로 속도 최적화 ====================
    const [ownedGames, wishlistGames, lastModified] = await Promise.all([
      loadGamesWithFallback(user.id, 'owned'),
      loadGamesWithFallback(user.id, 'wishlist'),
      kvGetWithRetry<number>(`user_${user.id}_last_modified`).then(v => v || 0),
    ]);


    // 플레이 기록 수 계산
    const totalPlayRecords = (ownedGames || []).reduce((sum: number, game: any) => 
      sum + (game.playRecords?.length || 0), 0);

    return c.json({ 
      ownedGames,
      wishlistGames,
      lastModified
    });
  } catch (error) {
    console.error('❌ [Load] Unexpected error:', error);
    return c.json({ error: `Load error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

// Data: Get all registered games (from all users' owned and wishlist)
app.get("/make-server-0b7d3bae/data/all-games", async (c) => {
  try {
    const normName = (s: string) => (s || '').toLowerCase().replace(/\s+/g, '');

    // dedup 추적: bggId Set + 정규화 이름 Set
    const seenBggIds = new Set<string>();
    const seenNames = new Set<string>();
    const allGames: any[] = [];

    function markSeen(g: any) {
      if (g.bggId) seenBggIds.add(String(g.bggId));
      const n = normName(g.koreanName || g.name || g.englishName || '');
      if (n) seenNames.add(n);
    }
    function isSeen(g: any): boolean {
      if (g.bggId && seenBggIds.has(String(g.bggId))) return true;
      const n = normName(g.koreanName || g.name || g.englishName || '');
      return !!(n && seenNames.has(n));
    }

    // ── 1순위: site_game_* ──
    const siteGameKeys = await getByPrefix('site_game_');
    for (const item of siteGameKeys) {
      const g = item.value;
      if (!g?.id || !(g.koreanName || g.englishName || g.name)) continue;
      if (isSeen(g)) continue;
      markSeen(g);
      allGames.push({ ...g, koreanName: g.koreanName || g.name, englishName: g.englishName || '' });
    }

    // ── 2순위: user_* (site_game_에 없는 게임만 추가) ──
    const allUserKeys = await getByPrefix('user_');
    for (const item of allUserKeys) {
      const key: string = item.key || '';
      const value = item.value;

      // 게임 데이터가 아닌 키 스킵
      if (
        key.includes('_backup') || key.includes('_last_modified') ||
        key.includes('_timestamp') || key.includes('_metadata') || key.includes('_temp') ||
        key.includes('_profile') || key.includes('_points') || key.includes('_play_records') ||
        key.includes('_community') || key.includes('_social') || key.includes('_notification')
      ) continue;

      const tryAdd = (g: any) => {
        if (!g?.id || !(g.koreanName || g.englishName)) return;
        if (isSeen(g)) return;
        markSeen(g);
        allGames.push(g);
      };

      if (Array.isArray(value)) {
        for (const g of value) tryAdd(g);
      } else if (value && typeof value === 'object' && value.id) {
        tryAdd(value);
      }
    }

    // imageUrl 없는 게임: BGG 캐시에서 보완
    for (const game of allGames) {
      if (!game.imageUrl && game.bggId) {
        const cached = await kv.get(`bgg_details_${game.bggId}`) || await kv.get(`bgg_game_full_${game.bggId}`);
        if (cached?.imageUrl) game.imageUrl = cached.imageUrl;
        else if (cached?.image) game.imageUrl = cached.image;
      }
    }

    return c.json({ games: allGames, count: allGames.length, timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('❌ [All Games] Error:', error);
    return c.json({ games: [], count: 0, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 🔧 DEBUG: Show all KV store keys (temporary debug endpoint)
app.get("/make-server-0b7d3bae/debug/kv-keys", async (c) => {
  try {
    
    // ⚠️ 중요: 모든 prefix를 시도해서 전체 키 목록 확인
    
    // 1. user_ prefix로 시도
    const userKeys = await getByPrefix('user_');
    
    // 2. 빈 prefix로 시도 (모든 키)
    const allKeys = await getByPrefix('');
    
    // 전체 키 이름 출력
    
    // user_ prefix 키 전체 목록 출력
    userKeys.forEach((item, idx) => {
    });
    
    // user_ prefix 키들의 suffix 패턴 분석
    const suffixPatterns = new Map();
    userKeys.forEach(item => {
      const key = item.key || '';
      const parts = key.split('_');
      // user_<userId>_<suffix> 형식이라고 가정
      if (parts.length >= 3) {
        const suffix = parts.slice(2).join('_'); // 마지막 부분을 suffix로
        suffixPatterns.set(suffix, (suffixPatterns.get(suffix) || 0) + 1);
      }
    });
    
    const suffixSummary = Array.from(suffixPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([suffix, count]) => ({ suffix, count }));
    
    suffixSummary.forEach(({ suffix, count }) => {
    });
    
    // 게임 관련 키 필터링 (owned, wishlist 포함)
    const gameRelatedKeys = userKeys.filter(item => {
      const key = item.key || '';
      return key.includes('owned') || key.includes('wishlist') || key.includes('game');
    });
    
    
    // 상세 정보
    const keyInfo = gameRelatedKeys.map(item => ({
      key: item.key,
      type: typeof item.value,
      isArray: Array.isArray(item.value),
      length: Array.isArray(item.value) ? item.value.length : 'N/A',
      sampleData: Array.isArray(item.value) && item.value.length > 0 
        ? { 
            firstGameId: item.value[0]?.id, 
            firstGameName: item.value[0]?.koreanName || item.value[0]?.englishName 
          }
        : (typeof item.value === 'string' || typeof item.value === 'number') 
          ? item.value 
          : 'complex object'
    }));
    
    
    // 패턴 분석
    const keyPatterns = new Map();
    allKeys.forEach(item => {
      const key = item.key || '';
      const parts = key.split('_');
      const pattern = parts.length > 0 ? parts[0] : 'unknown';
      keyPatterns.set(pattern, (keyPatterns.get(pattern) || 0) + 1);
    });
    
    const patternSummary = Array.from(keyPatterns.entries()).map(([pattern, count]) => ({
      pattern: pattern + '_*',
      count
    }));
    
    
    return c.json({ 
      totalKeys: allKeys.length,
      userPrefixKeys: userKeys.length,
      gameRelatedKeys: gameRelatedKeys.length,
      patterns: patternSummary,
      userKeySuffixes: suffixSummary,
      userKeyList: userKeys.map(k => k.key),
      allKeyNames: allKeys.map(k => k.key),
      gameKeyDetails: keyInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [Debug] Error:', error);
    return c.json({ error: `Debug error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

// Admin: Load specific user's board game data
app.get("/make-server-0b7d3bae/admin/user-data/:userId", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized: No token provided' }, 401);
    }

    // Verify admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }

    // Get target user ID
    const targetUserId = c.req.param('userId');
    
    if (!targetUserId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    // ==================== 🆕 NEW: Load with fallback ====================
    const ownedGames = await loadGamesWithFallback(targetUserId, 'owned');
    const wishlistGames = await loadGamesWithFallback(targetUserId, 'wishlist');
    const lastModified = await kv.get(`user_${targetUserId}_last_modified`) || 0;

    return c.json({ 
      ownedGames,
      wishlistGames,
      lastModified
    });
  } catch (error) {
    console.error('❌ [Admin Load] Unexpected error:', error);
    return c.json({ error: `Load error: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

// BGG Hot Rankings endpoint with caching
// 보드라움 언급 많은 게임 집계
app.get("/make-server-0b7d3bae/trending-games", async (c) => {
  try {
    // 캐시 확인 (10분)
    const cacheKey = 'trending_games_cache';
    const cached = await kv.get(cacheKey);
    if (cached) return c.json(cached);

    // 7일치 게시글 게임태그 집계
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const postsData = await getByPrefix('beta_post_');
    const posts = postsData
      .map(d => d.value)
      .filter((p: any) => !p.isDraft && new Date(p.createdAt).getTime() >= thirtyDaysAgo);

    const countMap: Record<string, { id: string; name: string; imageUrl: string; count: number }> = {};

    for (const post of posts) {
      const tagged = Array.isArray(post.linkedGames) ? post.linkedGames : [];
      for (const g of tagged) {
        if (!g?.id) continue;
        if (!countMap[g.id]) {
          const rawImg = g.imageUrl || g.thumbnail || '';
          countMap[g.id] = {
            id: g.id,
            name: g.koreanName || g.englishName || g.name || '',
            imageUrl: rawImg.startsWith('//') ? 'https:' + rawImg : rawImg,
            count: 0,
          };
        }
        countMap[g.id].count += 1;
      }
      for (const comment of (post.comments || [])) {
        const cTagged = Array.isArray(comment.linkedGames) ? comment.linkedGames : [];
        for (const g of cTagged) {
          if (!g?.id) continue;
          if (!countMap[g.id]) {
            const rawImg = g.imageUrl || g.thumbnail || '';
            countMap[g.id] = {
              id: g.id,
              name: g.koreanName || g.englishName || g.name || '',
              imageUrl: rawImg.startsWith('//') ? 'https:' + rawImg : rawImg,
              count: 0,
            };
          }
          countMap[g.id].count += 1;
        }
      }
    }

    // 블랙리스트 적용
    const blacklist: string[] = (await kv.get('trending_blacklist')) || [];

    // site_game_ 및 game_image_ 에서 최신 이미지 보완
    const siteGames = await getByPrefix('site_game_');
    const siteImageMap: Record<string, string> = {};
    for (const item of siteGames) {
      const g = item.value;
      if (g?.id && g?.imageUrl) siteImageMap[g.id] = g.imageUrl;
      if (g?.bggId && g?.imageUrl) siteImageMap[g.bggId] = g.imageUrl;
    }
    const gameImages = await getByPrefix('game_image_');
    for (const item of gameImages) {
      const key: string = item.key || '';
      const val = item.value;
      if (!val?.imageUrl) continue;
      // game_image_bgg_12345 → id = "12345"
      const bggMatch = key.match(/^game_image_bgg_(.+)$/);
      const idMatch = key.match(/^game_image_id_(.+)$/);
      if (bggMatch) siteImageMap[bggMatch[1]] = val.imageUrl;
      if (idMatch) siteImageMap[idMatch[1]] = val.imageUrl;
    }
    const bggDetails = await getByPrefix('bgg_details_');
    for (const item of bggDetails) {
      const key: string = item.key || '';
      const val = item.value;
      if (!val?.imageUrl) continue;
      const match = key.match(/^bgg_details_(.+)$/);
      if (match && !siteImageMap[match[1]]) siteImageMap[match[1]] = val.imageUrl;
    }

    const sorted = Object.values(countMap)
      .filter(g => !blacklist.includes(g.id))
      .map(g => ({
        ...g,
        imageUrl: siteImageMap[g.id] || g.imageUrl || '',
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100);

    await kv.set(cacheKey, sorted, { expiresIn: 600 });
    return c.json(sorted);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

app.get("/make-server-0b7d3bae/bgg-hot", async (c) => {
  try {
    
    // Check if force refresh is requested
    const forceRefresh = c.req.query('force') === 'true';
    
    // Check cache first (5 minutes cache for more frequent updates)
    const cacheKey = 'bgg_hot_rankings';
    if (!forceRefresh) {
      const cached = await kv.get(cacheKey);
      if (cached) {
        return c.json(cached);
      }
    } else {
    }

    const bggToken = Deno.env.get('BGG_API_TOKEN');
    
    // Helper function to decode HTML entities
    const decodeHtmlEntities = (text: string): string => {
      return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
    };
    
    // Step 1: Get hot games list
    const hotUrl = 'https://boardgamegeek.com/xmlapi2/hot?type=boardgame';
    
    const headers: Record<string, string> = {};
    if (bggToken) {
      headers['Authorization'] = `Bearer ${bggToken}`;
    } else {
    }
    
    const hotResponse = await fetch(hotUrl, { headers });


    if (!hotResponse.ok) {
      const errorText = await hotResponse.text();
      console.error('✗ BGG API error response:', errorText);
      return c.json({ 
        error: `BGG API error: ${hotResponse.statusText}`,
        details: errorText,
        status: hotResponse.status 
      }, hotResponse.status);
    }

    const hotXml = await hotResponse.text();
    
    // Parse hot games list
    const games: any[] = [];
    const itemMatches = hotXml.matchAll(/<item[^>]*id=\"(\d+)\"[^>]*rank=\"(\d+)\"[^>]*>([\s\S]*?)<\/item>/g);
    
    const gameIds: string[] = [];
    for (const match of itemMatches) {
      const itemId = match[1];
      const itemRank = match[2];
      const itemContent = match[3];
      
      const nameMatch = itemContent.match(/<name[^>]*value=\"([^\"]*)\"/);
      const yearMatch = itemContent.match(/<yearpublished[^>]*value=\"(\d+)\"/);
      
      const rawName = nameMatch ? nameMatch[1] : 'Unknown Game';
      const decodedName = decodeHtmlEntities(rawName);
      
      games.push({
        id: itemId,
        rank: parseInt(itemRank),
        name: decodedName,
        koreanName: '', // Will be filled in step 2
        yearPublished: yearMatch ? yearMatch[1] : '',
        thumbnail: '', // Will be filled in step 2
      });
      
      gameIds.push(itemId);
    }

    
    if (games.length === 0) {
      console.error('✗ No games were parsed from XML');
      return c.json({ error: 'No games found in response' }, 500);
    }

    // Step 2: Get Korean names for top 20 games
    const idsToFetch = gameIds.slice(0, 20);
    const thingUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${idsToFetch.join(',')}`;
    
    const thingResponse = await fetch(thingUrl, { headers });
    
    if (thingResponse.ok) {
      const thingXml = await thingResponse.text();
      
      // Parse alternate names from thing API
      const itemDetailsMatches = thingXml.matchAll(/<item[^>]*id=\"(\d+)\"[^>]*>([\s\S]*?)<\/item>/g);
      
      for (const match of itemDetailsMatches) {
        const gameId = match[1];
        const itemContent = match[2];
        
        // Find all name tags
        const nameMatches = itemContent.matchAll(/<name[^>]*type=\"([^\"]*)\"[^>]*value=\"([^\"]*)\"/g);
        
        let koreanName = '';
        for (const nameMatch of nameMatches) {
          const nameType = nameMatch[1];
          const nameValue = decodeHtmlEntities(nameMatch[2]);
          
          // Check if this is a Korean alternate name
          // Korean names typically contain Korean characters (한글)
          if (nameType === 'alternate' && /[\u3131-\u314e|\u314f-\u3163|\uac00-\ud7a3]/.test(nameValue)) {
            koreanName = nameValue;
            break; // Use the first Korean name found
          }
        }
        
        // Find thumbnail, fix protocol-relative URLs
        const thumbnailMatch = itemContent.match(/<thumbnail>([^<]*)<\/thumbnail>/);
        let thumbnail = thumbnailMatch ? thumbnailMatch[1].trim() : '';
        if (thumbnail.startsWith('//')) thumbnail = 'https:' + thumbnail;
        
        // Find the game in our list and update Korean name and thumbnail
        const game = games.find(g => g.id === gameId);
        if (game) {
          game.koreanName = koreanName;
          game.thumbnail = thumbnail;
          if (koreanName) {
          } else {
          }
        }
      }
    } else {
      console.error('✗ Failed to fetch game details, status:', thingResponse.status);
    }

    // Return top 20 games only
    const resultGames = games.slice(0, 20);

    // Cache for 1 hour
    await kv.set(cacheKey, resultGames, 3600);
    
    return c.json(resultGames);
  } catch (error) {
    console.error('=== BGG Hot Rankings Request FAILED ===');
    console.error('✗ Error type:', error?.constructor?.name);
    console.error('✗ Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('✗ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return c.json({ 
      error: `Hot rankings error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      type: error?.constructor?.name || 'Unknown'
    }, 500);
  }
});

// ============================================
// Game Customs API
// ============================================

// Helper: Get user role
// 이름 가운데 x 마스킹 (닉네임 없을 때)
function maskName(name: string): string {
  if (!name || name === 'Anonymous') return 'Anonymous';
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  if (trimmed.length === 2) return trimmed[0] + 'x';
  const mid = Math.floor(trimmed.length / 2);
  return trimmed.slice(0, mid) + 'x' + trimmed.slice(mid + 1);
}

// 유저 이름 해석 헬퍼 — 닉네임(username) 우선, 없으면 이름 마스킹
async function getUserName(userId: string): Promise<string> {
  try {
    const profile = await kv.get(`user_profile_${userId}`).catch(() => null);
    // 닉네임이 있으면 그대로 사용
    if (profile?.username && profile.username.trim() && profile.username !== 'Anonymous') return profile.username.trim();
    const beta = await kv.get(`beta_user_${userId}`).catch(() => null);
    if (beta?.username && beta.username.trim() && beta.username !== 'Anonymous') return beta.username.trim();
    // 닉네임 없으면 이름 마스킹
    if (beta?.name && beta.name !== 'Anonymous') return maskName(beta.name);
    if (profile?.name && profile.name !== 'Anonymous') return maskName(profile.name);
    const { data } = await supabase.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }));
    const meta = data?.user?.user_metadata;
    if (meta?.username && meta.username.trim() && meta.username !== 'Anonymous') return meta.username.trim();
    if (meta?.name && meta.name !== 'Anonymous') return maskName(meta.name);
    const email = data?.user?.email;
    if (email) return maskName(email.split('@')[0]);
  } catch {}
  return 'Anonymous';
}

// 역할 인메모리 캐시 (isolate 재사용 시 유효, 30초)
const _roleCache = new Map<string, { role: string; at: number }>();

async function getUserRole(userId: string, email?: string): Promise<string> {
  if (email === 'sityplanner2@naver.com') return 'admin';

  // 인메모리 캐시 확인 (30초)
  const cached = _roleCache.get(userId);
  if (cached && Date.now() - cached.at < 30000) return cached.role;

  // KV에서 프로필만 확인 (admin.getUserById 제거 → 외부 API 호출 없음)
  const profile = await kvGetWithRetry<any>(`user_profile_${userId}`).catch(() => null) || {};
  
  if (!profile.email) {
    // 프로필에 이메일이 없는 경우, 최초 1회 Auth에서 가져와 저장 (관리자 확인용)
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      if (data?.user?.email) {
        profile.email = data.user.email;
        kvSetWithRetry(`user_profile_${userId}`, profile).catch(console.error);
      }
    } catch (err) {
      console.error('getUserRole - auth check failed', err);
    }
  }

  let role = profile.role || 'user';
  if (profile.email === 'sityplanner2@naver.com') {
    role = 'admin';
    if (profile.role !== 'admin') {
      profile.role = 'admin';
      kvSetWithRetry(`user_profile_${userId}`, profile).catch(console.error);
    }
  }

  _roleCache.set(userId, { role, at: Date.now() });
  return role;
}

// Helper: Set user role (for admin setup)
async function setUserRole(userId: string, role: string): Promise<void> {
  const profile = await kvGetWithRetry<any>(`user_profile_${userId}`) || {};
  profile.role = role;
  await kvSetWithRetry(`user_profile_${userId}`, profile);
}

// Set admin role for sityplanner2@naver.com
app.post("/make-server-0b7d3bae/setup-admin", async (c) => {
  try {
    // This is a one-time setup endpoint
    const { data: users, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    const adminUser = users.users.find(u => u.email === 'sityplanner2@naver.com');
    
    if (!adminUser) {
      return c.json({ success: true, message: 'Already configured' });
    }
    
    await setUserRole(adminUser.id, 'admin');
    
    return c.json({ 
      success: true, 
      message: 'Admin role set for sityplanner2@naver.com',
      userId: adminUser.id 
    });
  } catch (error) {
    console.error('Setup admin error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Get all custom posts for a game
app.get("/make-server-0b7d3bae/customs/:gameId", async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const category = c.req.query('category');
    
    
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    let currentUserId = null;
    let isAdmin = false;
    
    if (accessToken) {
      const { data: { user } } = await supabase.auth.getUser(accessToken);
      currentUserId = user?.id;
      if (currentUserId) {
        const role = await getUserRole(currentUserId);
        isAdmin = role === 'admin';
      }
    }
    
    
    // Get all posts for this game
    const prefix = `game_custom_${gameId}_`;
    const allPostsData = await getByPrefix(prefix);
    const allPosts = allPostsData.map(d => d.value);
    
    
    // getByPrefix already returns values (posts), not {key, value} pairs
    let posts = allPosts.filter(post => post && post.category);
    
    
    // Filter by category if specified
    if (category) {
      posts = posts.filter(p => p.category === category);
    }
    
    // 게임 커스텀 페이지에서는 ����자도 승인된 게시물만 표시
    // (관리자 승인 페이지는 별도 엔드포인트 사용)
    posts = posts.filter(p => p.status === 'approved');
    
    // Log each post for debugging
    posts.forEach(p => {
    });
    
    // Sort by created_at desc
    posts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return c.json({ posts });
  } catch (error) {
    console.error('❌ [Get Customs] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Create a new custom post
app.post("/make-server-0b7d3bae/customs", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    
    const body = await c.req.json();
    const { gameId, gameName, category, postType, title, description, link, sizeInfo, images, data: postData, status: requestedStatus } = body;
    
    console.log('📋 [Create Post] Request body:', {
      gameId,
      gameName,
      category,
      postType,
      title,
      requestedStatus,
      hasDescription: !!description,
      hasLink: !!link,
      hasSizeInfo: !!sizeInfo,
      imageCount: images?.length || 0,
      hasData: !!postData
    });
    
    if (!gameId || !category || !title) {
      console.error('❌ [Create Post] Missing required fields');
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const postId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const kvKey = `game_custom_${gameId}_${category}_${postId}`;
    
    const post = {
      id: postId,
      gameId,
      gameName,
      category,
      postType: postType || 'post',
      title,
      description: description || '',
      link: link || '',
      sizeInfo: sizeInfo || '',
      images: images || [],
      data: postData || {},
      status: requestedStatus || 'approved',
      created_by: user.id,
      created_by_email: user.email,
      created_by_name: await getUserName(user.id).catch(() => user.email?.split('@')[0] || ''),
      created_at: new Date().toISOString(),
      likes: 0,
      liked_by: [],
    };
    
    
    await kv.set(kvKey, post);

    // 운영진/관리자 위키 등록 자동 적립 +10점
    let staffPointsAwarded = 0;
    if (post.postType === 'info' && post.category === 'overview') {
      const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
      const isMember = members.some((m: any) => m.userId === user.id);
      const isAdminUser = await getUserRole(user.id) === 'admin';
      if (isMember || isAdminUser) {
        const logs: any[] = (await kv.get(`staff_activity_${user.id}`) as any[]) ?? [];
        logs.unshift({
          action: '활동점수 합계 10점',
          detail: `보드위키 등록 1건(+10점) | gameId: ${gameId}`,
          totalPoints: 10,
          scores: { wiki: 1 },
          recordedAt: new Date().toISOString(),
          recordedBy: user.id,
        });
        await kv.set(`staff_activity_${user.id}`, logs.slice(0, 200));
        staffPointsAwarded = 10;
        await createNotification(user.id, {
          type: 'points',
          fromUserId: user.id,
          fromUserName: '',
          postId: postId,
          message: `보드위키 등록 +10 운영진 포인트 적립!`,
        }).catch(() => {});
      }
    }

    return c.json({ success: true, post, staffPointsAwarded });
  } catch (error) {
    console.error('❌ [Create Post] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Update an existing custom post
app.patch("/make-server-0b7d3bae/customs/:postId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const postId = c.req.param('postId');
    
    // Find the existing post
    const { data, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value")
      .like("key", "game_custom_%");
    
    if (error) {
      console.error('❌ [Update Post] KV Store query error:', error);
      return c.json({ error: error.message }, 500);
    }
    
    const postItem = data.find(item => item.value?.id === postId);
    
    if (!postItem) {
      console.error(`❌ [Update Post] Post ${postId} not found`);
      return c.json({ error: 'Post not found' }, 404);
    }
    
    const existingPost = postItem.value;
    
    // Check if user is the author
    if (existingPost.created_by !== user.id) {
      console.error(`❌ [Update Post] User ${user.email} is not the author`);
      return c.json({ error: 'You can only edit your own posts' }, 403);
    }
    
    
    const body = await c.req.json();
    const { title, description, link, sizeInfo, images, data: postData, status: requestedStatus } = body;
    
    // Update the post
    const updatedPost = {
      ...existingPost,
      title: title || existingPost.title,
      description: description !== undefined ? description : existingPost.description,
      link: link !== undefined ? link : existingPost.link,
      sizeInfo: sizeInfo !== undefined ? sizeInfo : existingPost.sizeInfo,
      images: images !== undefined ? images : existingPost.images,
      data: postData !== undefined ? postData : existingPost.data,
      status: requestedStatus || existingPost.status || 'approved',
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };
    
    
    await kv.set(postItem.key, updatedPost);
    
    
    return c.json({ success: true, post: updatedPost });
  } catch (error) {
    console.error('❌ [Update Post] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Update post status (admin only)
app.post("/make-server-0b7d3bae/customs/:postId/status", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    const postId = c.req.param('postId');
    const { status, rejectionReason } = await c.req.json();
    
    if (!['approved', 'rejected'].includes(status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }
    
    
    // Query KV Store directly to get {key, value} pairs
    const { data, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value")
      .like("key", "game_custom_%");
    
    if (error) {
      console.error('❌ [Update Status] KV Store query error:', error);
      return c.json({ error: error.message }, 500);
    }
    
    const postItem = data.find(item => item.value?.id === postId);
    
    if (!postItem) {
      console.error(`❌ [Update Status] Post ${postId} not found`);
      return c.json({ error: 'Post not found' }, 404);
    }
    
    
    const post = postItem.value;
    post.status = status;
    if (status === 'rejected') {
      post.rejectionReason = rejectionReason || '';
    }
    post.reviewed_at = new Date().toISOString();
    post.reviewed_by = user.id;
    
    await kv.set(postItem.key, post);

    
    
    return c.json({ success: true, post });
  } catch (error) {
    console.error('❌ [Update Status] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Delete a custom post (admin only)
app.delete("/make-server-0b7d3bae/customs/:postId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      console.error(`❌ [Delete Post] User ${user.email} is not admin`);
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    const postId = c.req.param('postId');
    
    // Find the existing post
    const { data, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value")
      .like("key", "game_custom_%");
    
    if (error) {
      console.error('❌ [Delete Post] KV Store query error:', error);
      return c.json({ error: error.message }, 500);
    }
    
    const postItem = data.find(item => item.value?.id === postId);
    
    if (!postItem) {
      console.error(`❌ [Delete Post] Post ${postId} not found`);
      return c.json({ error: 'Post not found' }, 404);
    }
    
    
    // Delete the post from KV Store
    await kv.del(postItem.key);
    
    
    return c.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('❌ [Delete Post] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Like/unlike a post
app.post("/make-server-0b7d3bae/customs/:postId/like", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const postId = c.req.param('postId');
    
    
    // Query KV Store directly to get {key, value} pairs
    const { data, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value")
      .like("key", "game_custom_%");
    
    if (error) {
      console.error('❌ [Like] KV Store query error:', error);
      return c.json({ error: error.message }, 500);
    }
    
    const postItem = data.find(item => item.value?.id === postId);
    
    if (!postItem) {
      console.error(`❌ [Like] Post ${postId} not found`);
      return c.json({ error: 'Post not found' }, 404);
    }
    
    const post = postItem.value;
    
    if (!post.liked_by) {
      post.liked_by = [];
    }
    
    const likedIndex = post.liked_by.indexOf(user.id);
    
    if (likedIndex > -1) {
      // Unlike
      post.liked_by.splice(likedIndex, 1);
      post.likes = (post.likes || 0) - 1;
    } else {
      // Like
      post.liked_by.push(user.id);
      post.likes = (post.likes || 0) + 1;
    }
    
    await kv.set(postItem.key, post);
    
    return c.json({ success: true, likes: post.likes, isLiked: likedIndex === -1 });
  } catch (error) {
    console.error('❌ [Like] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Get comments for a post
app.get("/make-server-0b7d3bae/customs/:postId/comments", async (c) => {
  try {
    const postId = c.req.param('postId');
    
    const comments = await kv.get(`comments_${postId}`) || [];
    
    return c.json({ comments });
  } catch (error) {
    console.error('Get comments error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Add a comment to a post
app.post("/make-server-0b7d3bae/customs/:postId/comments", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const postId = c.req.param('postId');
    const { content } = await c.req.json();
    
    if (!content || content.trim() === '') {
      return c.json({ error: 'Comment content is required' }, 400);
    }
    
    const comments = await kv.get(`comments_${postId}`) || [];
    
    const comment = {
      id: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
      postId,
      content,
      created_by: user.id,
      created_by_email: user.email,
      created_at: new Date().toISOString(),
    };
    
    comments.push(comment);
    await kv.set(`comments_${postId}`, comments);
    
    invalidateFeedCache().catch(() => {});
    return c.json({ success: true, comment, allComments: post.comments });
  } catch (error) {
    console.error('Add comment error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Get pending posts (admin only)
app.get("/make-server-0b7d3bae/customs/pending/all", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    
    if (!accessToken) {
      console.error('❌ [Admin Check] No access token provided');
      return c.json({ error: 'Unauthorized - No token' }, 401);
    }
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError) {
      console.error('❌ [Admin Check] Auth error:', authError);
      return c.json({ error: `Auth error: ${authError.message}` }, 401);
    }
    
    if (!user?.id) {
      console.error('❌ [Admin Check] No user found');
      return c.json({ error: 'Unauthorized - Invalid user' }, 401);
    }
    
    
    const role = await getUserRole(user.id);
    
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      console.error(`❌ [Admin Check] User ${user.email} is not admin. Role: ${role}`);
      return c.json({ 
        error: 'Forbidden: Admin only',
        details: `Your role is '${role}'. Admin access required.`,
        userEmail: user.email,
        userId: user.id
      }, 403);
    }
    
    
    const allPostsData = await getByPrefix('game_custom_');
    const allPosts = allPostsData.map(d => d.value);
    
    const pendingPosts = allPosts
      .filter(post => {
        if (!post) return false;
        const isPending = post.status === 'pending';
        if (isPending) {
        }
        return isPending;
      })
      .sort((a, b) => {
        // updated_at이 있으면 그것을 우선 사용, 없으면 created_at 사용
        const timeA = new Date(a.updated_at || a.created_at).getTime();
        const timeB = new Date(b.updated_at || b.created_at).getTime();
        return timeB - timeA; // 최신순 (내림차순)
      });
    
    
    return c.json({ posts: pendingPosts });
  } catch (error) {
    console.error('❌ [Admin Check] Get pending posts error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// Set user role (admin setup endpoint)
app.post("/make-server-0b7d3bae/admin/set-role", async (c) => {
  try {
    const { email, role } = await c.req.json();
    
    if (!email || !role) {
      return c.json({ error: 'Email and role are required' }, 400);
    }
    
    // Find user by email
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.error('Failed to list users:', error);
      return c.json({ error: 'Failed to find user' }, 500);
    }
    
    const user = users?.find(u => u.email === email);
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    await setUserRole(user.id, role);
    
    return c.json({ 
      success: true, 
      message: `Role '${role}' set for ${email}`,
      userId: user.id 
    });
  } catch (error) {
    console.error('Set role error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Get user role (debug endpoint)
app.get("/make-server-0b7d3bae/admin/check-role", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    const profile = await kv.get(`user_profile_${user.id}`);
    
    return c.json({ 
      userId: user.id,
      email: user.email,
      role: role,
      profile: profile,
      isAdmin: role === 'admin'
    });
  } catch (error) {
    console.error('Check role error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Debug: Get all custom posts (admin only)
app.get("/make-server-0b7d3bae/admin/debug/all-customs", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    
    // Query KV Store directly to get {key, value} pairs
    const { data, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value")
      .like("key", "game_custom_%");
    
    if (error) {
      console.error('❌ [Debug] KV Store query error:', error);
      return c.json({ error: error.message }, 500);
    }
    
    
    const posts = data.map(item => ({
      key: item.key,
      value: item.value
    }));
    
    // Group by status
    const byStatus = {
      pending: posts.filter(p => p.value?.status === 'pending'),
      approved: posts.filter(p => p.value?.status === 'approved'),
      rejected: posts.filter(p => p.value?.status === 'rejected'),
      unknown: posts.filter(p => !p.value?.status),
    };
    
    console.log('📊 [Debug] Posts by status:', {
      pending: byStatus.pending.length,
      approved: byStatus.approved.length,
      rejected: byStatus.rejected.length,
      unknown: byStatus.unknown.length,
      total: posts.length
    });
    
    return c.json({ 
      total: posts.length,
      byStatus: {
        pending: byStatus.pending.length,
        approved: byStatus.approved.length,
        rejected: byStatus.rejected.length,
        unknown: byStatus.unknown.length,
      },
      posts: posts
    });
  } catch (error) {
    console.error('❌ [Debug] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Fix: Update status for posts without status field (admin only)
app.post("/make-server-0b7d3bae/admin/fix-pending-status", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    
    // Query KV Store directly to get {key, value} pairs
    const { data, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value")
      .like("key", "game_custom_%");
    
    if (error) {
      console.error('❌ [Fix] KV Store query error:', error);
      return c.json({ error: error.message }, 500);
    }
    
    const postsToFix = data.filter(item => !item.value?.status);
    
    
    let fixed = 0;
    for (const item of postsToFix) {
      if (item.value) {
        item.value.status = 'pending';
        await kv.set(item.key, item.value);
        fixed++;
      }
    }
    
    
    return c.json({ 
      success: true, 
      fixed: fixed,
      message: `${fixed}개 게시물의 status를 'pending'으로 업데이트했습니다.`
    });
  } catch (error) {
    console.error('❌ [Fix] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ============================================
// Data Backup and Recovery
// ============================================

// Get ALL KV store keys and data (admin only - for debugging)
app.get("/make-server-0b7d3bae/admin/kv-all", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Check if user is admin
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    
    // Query ALL data directly from KV Store table
    const { data, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value");
    
    if (error) {
      console.error('❌ [Admin] KV Store query error:', error);
      return c.json({ error: error.message }, 500);
    }
    
    
    // Categorize keys by prefix
    const keysByPrefix: Record<string, any[]> = {};
    
    data.forEach((item) => {
      const prefix = item.key.split('_')[0];
      if (!keysByPrefix[prefix]) {
        keysByPrefix[prefix] = [];
      }
      keysByPrefix[prefix].push({
        key: item.key,
        value: item.value,
        valueType: typeof item.value,
        valuePreview: typeof item.value === 'object' 
          ? JSON.stringify(item.value).substring(0, 100) + '...' 
          : String(item.value).substring(0, 100)
      });
    });
    
    // Log detailed information
    Object.keys(keysByPrefix).forEach((prefix) => {
      keysByPrefix[prefix].forEach((item) => {
      });
    });
    
    return c.json({
      totalEntries: data.length,
      allData: data,
      keysByPrefix,
      prefixes: Object.keys(keysByPrefix)
    });
  } catch (error) {
    console.error('Get all KV data error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Get all KV store keys (admin only - for debugging)
app.get("/make-server-0b7d3bae/admin/kv-keys", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Check if user is admin
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    
    // Get all beta_user_ entries
    const betaUsersData = await getByPrefix('beta_user_');
    const betaUsers = betaUsersData.map(d => d.value);
    const userDataKeysData = await getByPrefix('user_');
    
    // Parse user data keys to get unique user IDs
    const userIds = new Set<string>();
    userDataKeysData.forEach((item: any) => {
      // Extract user ID from keys like "user_abc123_owned" or "user_abc123_wishlist"
      const match = String(item.key).match(/user_([a-f0-9\-]+)_/);
      if (match) {
        userIds.add(match[1]);
      }
    });
    
    
    return c.json({ 
      betaUsersCount: betaUsers.length,
      userDataKeysCount: userDataKeysData.length,
      uniqueUserIdsWithData: userIds.size,
      betaUsers: betaUsers.map((u: any) => ({
        key: `beta_user_${u.userId}`,
        email: u.email,
        name: u.name,
        status: u.status,
        created_at: u.created_at
      })),
      userIdsWithGameData: Array.from(userIds)
    });
  } catch (error) {
    console.error('Get KV keys error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Migrate user data: Create beta_user entries for users with game data but no beta application
app.post("/make-server-0b7d3bae/admin/migrate-users", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Check if user is admin
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    
    // Query ALL data directly from KV Store table
    const { data: allKVData, error: kvError } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value");
    
    if (kvError) {
      console.error('❌ [Migration] KV Store query error:', kvError);
      return c.json({ error: kvError.message }, 500);
    }
    
    allKVData.forEach((item, index) => {
      if (typeof item.value === 'object' && item.value !== null) {
      }
    });
    
    // Get all existing beta_user_ entries
    const betaUsersData = await getByPrefix('beta_user_');
    const betaUsers = betaUsersData.map(d => d.value);
    const betaUserIds = new Set(betaUsers.map((u: any) => u.userId));
    
    betaUsers.forEach((u: any) => {
    });
    
    // Extract all potential user IDs from ALL keys
    const userIdsFromKeys = new Set<string>();
    
    allKVData.forEach((item) => {
      // Try to extract user ID from various patterns
      const patterns = [
        /user_([a-f0-9\-]{36})_/i,  // user_UUID_owned, user_UUID_wishlist
        /beta_user_([a-f0-9\-]{36})/i,  // beta_user_UUID
        /tester_([a-f0-9\-]{36})/i,  // tester_UUID
      ];
      
      for (const pattern of patterns) {
        const match = item.key.match(pattern);
        if (match) {
          userIdsFromKeys.add(match[1]);
          break;
        }
      }
      
      // Also check if the value contains userId field
      if (item.value && typeof item.value === 'object' && item.value.userId) {
        userIdsFromKeys.add(item.value.userId);
      }
    });
    
    
    // Find users missing beta_user entries
    const missingBetaUsers: string[] = [];
    for (const userId of userIdsFromKeys) {
      if (!betaUserIds.has(userId)) {
        missingBetaUsers.push(userId);
      }
    }
    
    
    // Get all users from Supabase Auth
    const { data: { users: allAuthUsers } } = await supabase.auth.admin.listUsers();
    
    const migratedUsers = [];
    const failedUsers = [];
    const skippedUsers = [];
    
    for (const userId of missingBetaUsers) {
      try {
        // Find user in Auth
        const authUser = allAuthUsers?.find((u) => u.id === userId);
        
        if (!authUser) {
          console.warn(`⚠️ [Migration] User ${userId} not found in Auth - skipping`);
          failedUsers.push({ userId, reason: 'Not found in Auth' });
          continue;
        }
        
        // Check if beta_user already exists (double check)
        const existingBetaUser = await kv.get(`beta_user_${authUser.id}`);
        if (existingBetaUser) {
          skippedUsers.push({
            userId: authUser.id,
            email: authUser.email,
            reason: 'Already exists'
          });
          continue;
        }
        
        // Create beta_user entry
        const betaUserData = {
          userId: authUser.id,
          email: authUser.email || 'unknown@email.com',
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Unknown User',
          username: authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'user',
          phone: authUser.user_metadata?.phone || '',
          reason: 'Auto-migrated from existing game data',
          status: 'approved', // Auto-approve existing users with game data
          created_at: authUser.created_at || new Date().toISOString(),
          approved_at: new Date().toISOString(),
          approved_by: user.id, // Admin who ran migration
          migration_note: 'Auto-migrated from existing game data'
        };
        
        await kv.set(`beta_user_${authUser.id}`, betaUserData);
        
        migratedUsers.push({
          userId: authUser.id,
          email: authUser.email,
          name: betaUserData.name
        });
      } catch (error) {
        console.error(`❌ [Migration] Failed to migrate user ${userId}:`, error);
        failedUsers.push({ 
          userId, 
          reason: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
    
    
    return c.json({
      success: true,
      totalUniqueUserIds: userIdsFromKeys.size,
      existingBetaUsers: betaUsers.length,
      migratedCount: migratedUsers.length,
      skippedCount: skippedUsers.length,
      failedCount: failedUsers.length,
      migratedUsers,
      skippedUsers,
      failedUsers,
      allKeys: allKVData.map(item => item.key)
    });
  } catch (error) {
    console.error('Migration error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ============================================
// Beta Community API
// ============================================

// Check beta tester status
app.get("/make-server-0b7d3bae/check-beta-status", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    
    // Check if user is admin by email first
    if (user.email === 'sityplanner2@naver.com') {
      await setUserRole(user.id, 'admin');
      return c.json({ status: 'approved', isAdmin: true });
    }
    
    // Check if user is admin by role
    const role = await getUserRole(user.id);
    if (role === 'admin') {
      return c.json({ status: 'approved', isAdmin: true });
    }
    
    // Check beta tester status
    const betaUser = await kv.get(`beta_user_${user.id}`);
    
    if (!betaUser) {
      return c.json({ status: 'not_found', message: '베타 테스터 신청 정보를 찾을 수 없습니다.' }, 404);
    }
    
    return c.json({ 
      status: betaUser.status,
      name: betaUser.name,
      email: betaUser.email,
      rejection_reason: betaUser.rejection_reason 
    });
  } catch (error) {
    console.error('Check beta status error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Get all keys (for debugging)
app.get("/make-server-0b7d3bae/admin/all-keys", async (c) => {
  try {
    
    // Get all keys from KV store
    const allKeysData = await getByPrefix('');
    const keys = allKeysData.map((item: any) => item.key);


    return c.json({ 
      keys,
      count: keys.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ [Admin] Get all keys error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Debug endpoint: Check specific user data
app.get("/make-server-0b7d3bae/admin/debug-user/:userId", async (c) => {
  try {
    const userId = c.req.param('userId');
    
    // ==================== 🆕 NEW: Load with fallback ====================
    const owned = await loadGamesWithFallback(userId, 'owned');
    const wishlist = await loadGamesWithFallback(userId, 'wishlist');
    const lastModified = await kv.get(`user_${userId}_last_modified`);
    
    // Also check legacy format
    const legacyOwned = await kv.get(`user_${userId}_owned`);
    const legacyWishlist = await kv.get(`user_${userId}_wishlist`);
    
    console.log('📊 [Debug] User data:', {
      userId,
      ownedCount: owned.length,
      wishlistCount: wishlist.length,
      legacyOwnedCount: Array.isArray(legacyOwned) ? legacyOwned.length : 0,
      legacyWishlistCount: Array.isArray(legacyWishlist) ? legacyWishlist.length : 0,
      lastModified: lastModified ? new Date(lastModified).toISOString() : 'none'
    });
    
    return c.json({
      userId,
      owned: owned,
      wishlist: wishlist,
      lastModified: lastModified || null,
      ownedCount: owned.length,
      wishlistCount: wishlist.length,
      ownedType: 'array',
      wishlistType: 'array',
      ownedIsArray: true,
      wishlistIsArray: true,
      // Legacy info
      legacyOwnedCount: Array.isArray(legacyOwned) ? legacyOwned.length : 0,
      legacyWishlistCount: Array.isArray(legacyWishlist) ? legacyWishlist.length : 0
    });
  } catch (error) {
    console.error('❌ [Debug] Error:', error);
    return c.json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }, 500);
  }
});

// 관리자 - 특정 닉네임 유저 게시글 조회 (draft 포함)
app.get("/make-server-0b7d3bae/admin/posts-by-username", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const username = c.req.query('username') || '';
    if (!username) return c.json({ error: 'username 파라미터 필요' }, 400);

    const allPosts = await getByPrefix('beta_post_');
    const matched = allPosts
      .map((d: any) => d.value)
      .filter((p: any) => p && (p.userName === username || p.authorName === username))
      .map((p: any) => ({ id: p.id, title: p.content?.slice(0, 30), createdAt: p.createdAt, isDraft: !!p.isDraft }))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({ count: matched.length, posts: matched });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// Get all beta testers (admin only)
app.get("/make-server-0b7d3bae/admin/beta-testers", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Check if user is admin
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    // ✅ 페이지네이션 ���라미터
    const limit = parseInt(c.req.query('limit') || '10');
    const offset = parseInt(c.req.query('offset') || '0');
    const includeGameData = c.req.query('includeGameData') === 'true'; // 게임 데이터 포함 여부
    
    // Get all beta_user_ entries
    const betaUsersData = await getByPrefix('beta_user_');
    const betaUsers = betaUsersData.map(d => d.value);
    
    // 정렬 (최신순)
    betaUsers.sort((a: any, b: any) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });
    
    // 페이지네이션 적용
    const totalCount = betaUsers.length;
    const paginatedUsers = betaUsers.slice(offset, offset + limit);
    
    // Transform to match expected format
    const testersWithData = includeGameData
      ? await Promise.all(paginatedUsers.map(async (user: any) => {
          // 게임 데이터 포함 (느림)
          const owned = await loadGamesWithFallback(user.userId, 'owned');
          const wishlist = await loadGamesWithFallback(user.userId, 'wishlist');
          const ownedWithWiki = owned.filter((game: any) => game.koreanName || game.englishName).length;
          
          return {
            userId: user.userId,
            email: user.email,
            name: user.name,
            username: user.username || '',
            phone: user.phone,
            reason: user.reason,
            status: user.status,
            created_at: user.created_at,
            reviewed_at: user.reviewed_at,
            rejection_reason: user.rejection_reason,
            ownedCount: owned.length,
            wishlistCount: wishlist.length,
            wikiCount: ownedWithWiki,
          };
        }))
      : paginatedUsers.map((user: any) => ({
          // 게임 데이터 제외 (빠름)
          userId: user.userId,
          email: user.email,
          name: user.name,
          username: user.username || '',
          phone: user.phone,
          reason: user.reason,
          status: user.status,
          created_at: user.created_at,
          reviewed_at: user.reviewed_at,
          rejection_reason: user.rejection_reason,
          ownedCount: 0,
          wishlistCount: 0,
          wikiCount: 0,
        }));
    
    return c.json({ 
      testers: testersWithData,
      totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount
    });
  } catch (error) {
    console.error('Get beta testers error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Update beta tester status (admin only)
app.post("/make-server-0b7d3bae/admin/beta-testers/:userId/status", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Check if user is admin
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    const targetUserId = c.req.param('userId');
    const { status, reason } = await c.req.json();
    
    if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }
    
    const betaUser = await kv.get(`beta_user_${targetUserId}`);
    
    if (!betaUser) {
      return c.json({ error: 'Beta tester not found' }, 404);
    }
    
    // Update status
    betaUser.status = status;
    betaUser.reviewed_at = new Date().toISOString();
    
    if (status === 'rejected' && reason) {
      betaUser.rejection_reason = reason;
    }
    
    await kv.set(`beta_user_${targetUserId}`, betaUser);
    
    
    return c.json({ success: true, tester: betaUser });
  } catch (error) {
    console.error('Update beta tester status error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Get user info by ID
app.get("/make-server-0b7d3bae/beta-user/:userId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = c.req.param('userId');
    const user = await kv.get(`beta_user_${userId}`);
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    return c.json(user);
  } catch (error) {
    console.error('Get beta user error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 임시저장 목록 조회
app.get("/make-server-0b7d3bae/community/drafts", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const allPosts = await getByPrefix('beta_post_');
    const drafts = allPosts
      .map((d: any) => d.value)
      .filter((p: any) => p && p.isDraft && p.userId === user.id)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({ drafts });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Get all community posts
// 피드 최신 게시물 timestamp 체크 (폴링용)
// 게임 태그된 피드 게시글 조회
app.get("/make-server-0b7d3bae/community/posts/by-game/:gameId", async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const postsData = await getByPrefix('beta_post_');
    const posts = postsData
      .map((d: any) => d.value)
      .filter((p: any) => {
        if (!p || p.isDraft || p.isPrivate) return false;
        const games = Array.isArray(p.linkedGames) ? p.linkedGames : (p.linkedGame ? [p.linkedGame] : []);
        const normalizeId = (id?: string) => id ? id.replace(/^bgg_/, '') : '';
        const normGameId = normalizeId(gameId);
        return games.some((g: any) =>
          normalizeId(g?.id) === normGameId ||
          normalizeId(g?.bggId) === normGameId ||
          g?.id === gameId ||
          g?.bggId === gameId
        );
      })
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
    return c.json({ posts });
  } catch (error) {
    return c.json({ posts: [], error: String(error) }, 500);
  }
});

app.get("/make-server-0b7d3bae/community/posts/by-user/:userId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const targetUserId = c.req.param('userId');
    const isSelf = user.id === targetUserId;
    const role = await getUserRole(user.id);
    const isAdmin = role === 'admin';

    const postsData = await getByPrefix('beta_post_');
    const posts = postsData
      .map((d: any) => d.value)
      .filter((p: any) => {
        if (!p || p.isDraft) return false;
        if (p.userId !== targetUserId) return false;
        if (p.isPrivate && !isSelf && !isAdmin) return false;
        return true;
      })
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({ posts });
  } catch (error) {
    return c.json({ posts: [], error: String(error) }, 500);
  }
});

app.get("/make-server-0b7d3bae/community/posts/latest-ts", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const allPosts = await getByPrefix('beta_post_');
    const posts = allPosts.map((p: any) => p.value).filter((p: any) => p && !p.isDraft);
    if (posts.length === 0) return c.json({ latestAt: null, count: 0 });
    posts.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return c.json({ latestAt: posts[0].createdAt, count: posts.length });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown' }, 500);
  }
});

// 현재 유저가 좋아요한 포스트 ID 목록 (캐시 우회, 라이브 KV 직접 조회)
app.get("/make-server-0b7d3bae/community/posts/my-liked-ids", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ likedPostIds: [] });
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ likedPostIds: [] });
    const allPosts = await getByPrefix('beta_post_');
    const likedPostIds = allPosts
      .filter(({ value: p }) => p && Array.isArray(p.likes) && p.likes.includes(user.id))
      .map(({ value: p }) => p.id as string);
    return c.json({ likedPostIds });
  } catch { return c.json({ likedPostIds: [] }); }
});

app.get("/make-server-0b7d3bae/community/posts", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];

    // 비회원도 피드 조회 가능 — 인증은 선택적
    let userId: string | null = null;
    let isAdmin = false;
    if (accessToken) {
      const { data: { user } } = await supabase.auth.getUser(accessToken);
      if (user?.id) {
        userId = user.id;
        const role = await getUserRole(user.id);
        isAdmin = role === 'admin';
        if (!isAdmin) {
          const betaUser = await kv.get(`beta_user_${user.id}`);
          if (!betaUser || betaUser.status !== 'approved') {
            return c.json({ error: 'Only approved beta testers can access this page' }, 403);
          }
        }
      }
    }

    const category = c.req.query('category') || '전체';

    // 공개 피드는 2분 캐시 (비공개 게시물 있는 경우 제외)
    const cacheKey = `feed_cache_${category}`;
    const CACHE_TTL = 2 * 60 * 1000; // 2분
    if (!isAdmin) {
      try {
        const cached = await kv.get(cacheKey);
        if (cached?.posts && cached.cachedAt && (Date.now() - cached.cachedAt) < CACHE_TTL) {
          // 캐시 적중 — 비공개 게시물 필터만 적용
          const publicPosts = cached.posts.filter((p: any) => !p.isPrivate || p.userId === userId);
          return c.json({ posts: publicPosts });
        }
      } catch {}
    }

    // 캐시 미스 — 전체 조회
    const postsData = await getByPrefix('beta_post_');
    const posts = postsData.map(d => d.value);

    // draft 제외, 카테고리 필터
    let filtered = posts.filter((p: any) => !p.isDraft);
    if (category !== '전체') {
      filtered = filtered.filter((p: any) => p.category === category);
    }
    
    // 최신순 정렬, 고정글 최상단
    filtered.sort((a: any, b: any) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // userRankPoints 병렬 조회로 붙이기
    const postsWithRank = await Promise.all(filtered.map(async (post: any) => {
      if (post.userRankPoints) return post; // 이미 있으면 스킵
      const pts = await getUserPoints(post.userId).catch(() => null);
      return { ...post, userRankPoints: pts };
    }));

    // site_game_* 데이터로 linkedGames imageUrl 보완 (직접 등록 게임 이미지 누락 방지)
    let postsEnriched = postsWithRank;
    try {
      const siteGameItems = await getByPrefix('site_game_');
      const normName = (n: string) => (n || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const imgById = new Map<string, string>();
      const imgByName = new Map<string, string>();
      for (const { value: sg } of siteGameItems) {
        if (!sg?.imageUrl) continue;
        const img = sg.imageUrl.startsWith('//') ? 'https:' + sg.imageUrl : sg.imageUrl;
        if (sg.id) imgById.set(String(sg.id), img);
        if (sg.bggId) imgById.set(String(sg.bggId), img);
        if (sg.koreanName) imgByName.set(normName(sg.koreanName), img);
        if (sg.englishName) imgByName.set(normName(sg.englishName), img);
        if (sg.name) imgByName.set(normName(sg.name), img);
      }
      const enrichGame = (g: any) => {
        if (g?.imageUrl) return g;
        const img = imgById.get(String(g.id || '')) || imgById.get(String(g.bggId || '')) || imgByName.get(normName(g.name || g.koreanName || '')) || '';
        return img ? { ...g, imageUrl: img } : g;
      };
      postsEnriched = postsWithRank.map((post: any) => ({
        ...post,
        linkedGames: Array.isArray(post.linkedGames) ? post.linkedGames.map(enrichGame) : post.linkedGames,
        linkedGame: post.linkedGame ? enrichGame(post.linkedGame) : post.linkedGame,
      }));
    } catch {}

    // 캐시 저장 (백그라운드)
    kv.set(cacheKey, { posts: postsEnriched, cachedAt: Date.now() }).catch(() => {});

    // 응답 시 비공개 게시물 필터
    const visiblePosts = postsEnriched.filter((p: any) => !p.isPrivate || p.userId === userId || isAdmin);
    return c.json({ posts: visiblePosts });
  } catch (error) {
    console.error('❌ [Community] Get community posts error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});


// 피드 캐시 무효화 (글 작성/삭제/수정 시 호출)
async function invalidateFeedCache() {
  const categories = ['전체', '정보', '자유', '소식', '게임리뷰', '재능판매', '숙제'];
  await Promise.all(categories.map(cat =>
    kv.del(`feed_cache_${cat}`).catch(() => {})
  ));
}

// Create a new post
app.post("/make-server-0b7d3bae/community/posts", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Check if user is admin or approved beta tester
    const role = await getUserRole(user.id);
    const isAdmin = role === 'admin';
    
    if (!isAdmin) {
      const betaUser = await kv.get(`beta_user_${user.id}`);
      if (!betaUser || betaUser.status !== 'approved') {
        return c.json({ error: 'Only approved beta testers can post' }, 403);
      }
      // 커뮤니티 제한 유저 차단
      const restricted = await kv.get(`community_restricted_${user.id}`);
      if (restricted) {
        return c.json({ error: '커뮤니티 이용이 제한된 계정입니다. 관리자에게 문의해주세요.' }, 403);
      }
    }
    
    const { content, userName, userAvatar, category, images, linkedGame, linkedGames, isDraft, talentData, isPrivate, poll } = await c.req.json();
    
    if (!isDraft && (!content || content.trim().length === 0)) {
      return c.json({ error: 'Content is required' }, 400);
    }
    
    if (content && content.length > 1000) {
      return c.json({ error: 'Content must be 1000 characters or less' }, 400);
    }

    // 재능판매 하루 1개 제한 (KST = UTC+9)
    if (!isDraft && category === '재능판매') {
      const allPosts = await getByPrefix('beta_post_');
      const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const todayKST = nowKST.toISOString().slice(0, 10);
      const todayTalent = allPosts.find((p: any) => {
        if (!p.value || p.value.userId !== user.id || p.value.category !== '재능판매' || p.value.isDraft) return false;
        const postKST = new Date(new Date(p.value.createdAt).getTime() + 9 * 60 * 60 * 1000);
        return postKST.toISOString().slice(0, 10) === todayKST;
      });
      if (todayTalent) {
        return c.json({ error: '재능판매 게시물은 하루에 1개만 등록할 수 있어요' }, 429);
      }
    }
    
    const postId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const [resolvedUserName, resolvedRankPoints] = await Promise.all([
      getUserName(user.id),
      getUserPoints(user.id).catch(() => null),
    ]);
    // 첫 게시물 여부 미리 확인 (post 객체에 플래그 포함시키기 위해)
    // 이전에 글을 한 번도 올린 적 없는 사람만 적용 (posts 카운트 0 확인)
    const prevPostCount = (resolvedRankPoints as any)?.posts ?? 0;
    const isEligibleForFirstPost = prevPostCount === 0;
    const firstPostKey = `user_first_post_${user.id}`;
    const alreadyFirstPost = !isDraft ? await kv.get(firstPostKey).catch(() => null) : true;
    const isFirstPostFlag = !isDraft && !alreadyFirstPost && isEligibleForFirstPost;

    const post = {
      id: postId,
      userId: user.id,
      userName: resolvedUserName,
      userAvatar: userAvatar || null,
      content: (content || '').trim(),
      category: category || '자유',
      images: Array.isArray(images) ? images : [],
      linkedGame: linkedGame || null,
      linkedGames: Array.isArray(linkedGames) && linkedGames.length > 0 ? linkedGames : (linkedGame ? [linkedGame] : []),
      talentData: talentData || null,
      poll: poll || null,
      isDraft: isDraft || false,
      isPrivate: isPrivate || false,
      createdAt: new Date().toISOString(),
      likes: [],
      comments: [],
      userRankPoints: resolvedRankPoints,
      isFirstPost: isFirstPostFlag || undefined,
    };
    
    const kvKey = `beta_post_${postId}`;
    await kv.set(kvKey, post);
    // 게임태그 있으면 트렌딩 캐시 무효화 + 게임피드 새 글 뱃지 갱신
    if (!isDraft && post.linkedGames?.length > 0) {
      await kv.del('trending_games_cache').catch(() => {});
      const feedLatestAt = new Date().toISOString();
      for (const g of post.linkedGames) {
        if (g?.id) kv.set(`game_feed_latest_${g.id}`, { createdAt: feedLatestAt }).catch(() => {});
      }
    }
    // 포인트 적립 + 알림 (임시저장 제외)
    let isFirstPost = false;
    if (!isDraft) {
      // ── 첫 게시물 처리 (위에서 미리 확인한 isFirstPostFlag 재사용) ──
      if (isFirstPostFlag) {
        isFirstPost = true;
        // KV 저장 (중복 방지)
        await kv.set(firstPostKey, { postId, createdAt: new Date().toISOString() }).catch(() => {});
        // 300pt 추가 지급
        try {
          const current = await getUserPoints(user.id);
          const updated = { ...current, points: current.points + 300 };
          await kv.set(`user_points_${user.id}`, updated);
          await createNotification(user.id, {
            type: 'points',
            fromUserId: user.id,
            fromUserName: userName || '',
            postId,
            message: `🎉 첫 게시물 축하! +300pt 지급!`,
          }).catch(() => {});
        } catch {}
        // 카드 3장 지급 (user.email 직접 사용 — beta_user_ KV 없어도 동작)
        try {
          const cardEmail = user.email || (await kv.get(`beta_user_${user.id}`).catch(() => null))?.email;
          if (cardEmail) {
            const current = await readCardCountByEmail(cardEmail, user.id);
            await writeCardCountByEmail(cardEmail, current + 3);
            console.log(`🃏 첫게시글 카드 3장 지급: email=${cardEmail} (${current}→${current + 3})`);
          } else {
            const current = await readCardCount(user.id);
            await writeCardCount(user.id, current + 3);
            console.log(`🃏 첫게시글 카드 3장 지급(레거시): userId=${user.id} (${current}→${current + 3})`);
          }
        } catch {}
        // 첫 게시글: 활성 이벤트 카드 성공 확률 +3% (최대 100%)
        try {
          const fpEvents: any[] = await kv.get('last_post_events') || [];
          if (fpEvents.some((e: any) => e.active)) {
            const boosted = fpEvents.map((e: any) => {
              if (!e.active) return e;
              return { ...e, cardSuccessRate: Math.min(100, (e.cardSuccessRate ?? 100) + 3) };
            });
            await kv.set('last_post_events', boosted);
            console.log(`🎲 첫게시글 보너스: 카드 성공 확률 +3% (userId=${user.id})`);
          } else {
            const fpSingle = await kv.get('last_post_event');
            if (fpSingle?.active) {
              await kv.set('last_post_event', { ...fpSingle, cardSuccessRate: Math.min(100, (fpSingle.cardSuccessRate ?? 100) + 3) });
              console.log(`🎲 첫게시글 보너스: 카드 성공 확률 +3% (단일, userId=${user.id})`);
            }
          }
        } catch {}
      }

      const pts = await addPoints(user.id, 'POST').catch(() => null);
      if (pts && !isFirstPost) {
        await createNotification(user.id, {
          type: 'points',
          fromUserId: user.id,
          fromUserName: userName || '',
          postId,
          message: `게시물 작성으로 +${10}pt 획득!`,
        }).catch(() => {});
      }

      // 게시물 본문의 @멘션 알림
      const postMentions = extractMentions(content || '');
      if (postMentions.length > 0) {
        const notifiedInPost = new Set<string>([user.id]);
        for (const mentionedName of postMentions) {
          try {
            const mentionedUserId = await findUserIdByUsername(mentionedName);
            if (mentionedUserId && !notifiedInPost.has(mentionedUserId)) {
              notifiedInPost.add(mentionedUserId);
              await createNotification(mentionedUserId, {
                type: 'mention',
                fromUserId: user.id,
                fromUserName: userName || 'Anonymous',
                postId,
                postContent: (content || '').slice(0, 40),
                message: `${userName || 'Anonymous'}님이 게시글에서 나를 태그했어요`,
              }).catch(() => {});
            }
          } catch {}
        }
      }
    }
    
    // ★ 마지막글 이벤트 선두 교체 시 reductionSeconds 리셋
    // ★ '이벤트' 카테고리 글만 이벤트 참여 처리 (다른 카테고리는 이벤트에 영향 없음)
    if (!isDraft && (category || '자유') === '이벤트') {
      try {
        const activeEvents: any[] = await kv.get('last_post_events') || [];
        const disqualifiedList: string[] = await kv.get('last_event_disqualified') || [];
        const excludedEntries: any[] = await kv.get('event_excluded_users') || [];
        const excludedList: string[] = excludedEntries.map((e: any) => e.userId);

        const isEligible = !disqualifiedList.includes(user.id) && !excludedList.includes(user.id);

        if (isEligible && activeEvents.some((e: any) => e.active)) {
          const resetEvents = activeEvents.map((e: any) => {
            if (!e.active) return e;
            // ★ 카드로 이미 타이머가 0이 된 이벤트는 리셋 금지
            // → 다른 기기의 stale 상태에서 글 써도 reductionSeconds 유지
            const effectiveDurationMs = (e.durationMinutes || 60) * 60 * 1000 - (e.reductionSeconds || 0) * 1000;
            if (effectiveDurationMs <= 0) {
              console.log(`[이벤트] 타이머 만료 상태에서 글 작성 → 카드 리셋 SKIP (eventId=${e.id}, userId=${user.id})`);
              return e; // reductionSeconds 그대로 유지
            }
            return { ...e, reductionSeconds: 0, lastReductionAt: null, lastReductionBy: null };
          });
          await kv.set('last_post_events', resetEvents);
          console.log(`[이벤트] 선두 교체 처리 (userId=${user.id}, postId=${postId}, category=${category})`);
        } else if (!isEligible) {
          console.log(`[이벤트] 실격/제외 유저 → 이벤트 참여 제외 (userId=${user.id})`);
        }
      } catch (evErr) {
        console.log('[이벤트] 카드 리셋 처리 중 오류 (무시):', evErr);
      }
    } else if (!isDraft) {
      console.log(`[이벤트] 카테고리 '${category || '자유'}' → 이벤트 참여 제외 (postId=${postId})`);
    }

    invalidateFeedCache().catch(() => {});
    return c.json({ success: true, post, isFirstPost });
  } catch (error) {
    console.error('❌ [Community] Create post error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 첫 게시물 여부 조회
app.get("/make-server-0b7d3bae/community/posts/first-post-status", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    // 이전에 글을 올린 적 없는 사람만 적용
    const userPts = await getUserPoints(user.id).catch(() => null);
    const prevPostCount = (userPts as any)?.posts ?? 0;
    if (prevPostCount > 0) return c.json({ isFirstTime: false });
    const already = await kv.get(`user_first_post_${user.id}`).catch(() => null);
    return c.json({ isFirstTime: !already });
  } catch {
    return c.json({ isFirstTime: false });
  }
});

// 관리자 - 생애 첫 게시글 취소 (포인트 300pt + 카드 3장 회수)
app.post("/make-server-0b7d3bae/admin/posts/:postId/cancel-first-post", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const postId = c.req.param('postId');
    const post = await kv.get(`beta_post_${postId}`).catch(() => null);
    if (!post) return c.json({ error: 'Post not found' }, 404);
    if (!post.isFirstPost) return c.json({ error: '첫 게시글이 아닙니다' }, 400);

    const targetUserId = post.userId;

    // 1. 게시글 isFirstPost 플래그 제거
    post.isFirstPost = undefined;
    await kv.set(`beta_post_${postId}`, post);

    // 2. user_first_post_ KV 삭제
    await kv.delete(`user_first_post_${targetUserId}`).catch(() => {});

    // 3. 포인트 300pt 회수
    const currentPts = await getUserPoints(targetUserId).catch(() => ({ points: 0, posts: 0, comments: 0, likesReceived: 0 }));
    await kv.set(`user_points_${targetUserId}`, {
      ...currentPts,
      points: Math.max(0, (currentPts.points || 0) - 300),
    }).catch(() => {});

    // 4. 카드 3장 회수
    const targetBetaEntry = await kv.get(`beta_user_${targetUserId}`).catch(() => null);
    const targetEmail = targetBetaEntry?.email;
    if (targetEmail) {
      const currentCards = await readCardCountByEmail(targetEmail, targetUserId);
      await writeCardCountByEmail(targetEmail, Math.max(0, currentCards - 3));
    } else {
      const currentCards = await readCardCount(targetUserId);
      await writeCardCount(targetUserId, Math.max(0, currentCards - 3));
    }

    // 5. 알림
    await createNotification(targetUserId, {
      type: 'system',
      fromUserId: user.id,
      fromUserName: '관리자',
      postId,
      message: '생애 첫 게시글 혜택이 취소되었습니다. (포인트 300pt, 카드 3장 회수)',
    }).catch(() => {});

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 관리자 - 일반 게시글을 생애 첫 게시글로 지정 (포인트 300pt + 카드 3장 지급)
app.post("/make-server-0b7d3bae/admin/posts/:postId/set-first-post", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const postId = c.req.param('postId');
    const post = await kv.get(`beta_post_${postId}`).catch(() => null);
    if (!post) return c.json({ error: 'Post not found' }, 404);
    if (post.isFirstPost) return c.json({ error: '이미 첫 게시글로 지정되어 있습니다' }, 400);

    const targetUserId = post.userId;

    // 1. 게시글 isFirstPost 플래그 설정
    post.isFirstPost = true;
    await kv.set(`beta_post_${postId}`, post);

    // 2. user_first_post_ KV 저장
    await kv.set(`user_first_post_${targetUserId}`, { postId, createdAt: new Date().toISOString() }).catch(() => {});

    // 3. 포인트 300pt 지급
    const currentPts = await getUserPoints(targetUserId).catch(() => ({ points: 0, posts: 0, comments: 0, likesReceived: 0 }));
    await kv.set(`user_points_${targetUserId}`, {
      ...currentPts,
      points: (currentPts.points || 0) + 300,
    }).catch(() => {});

    // 4. 카드 3장 지급
    const targetBetaEntry = await kv.get(`beta_user_${targetUserId}`).catch(() => null);
    const targetEmail = targetBetaEntry?.email || user.email;
    if (targetEmail) {
      const currentCards = await readCardCountByEmail(targetEmail, targetUserId);
      await writeCardCountByEmail(targetEmail, currentCards + 3);
    } else {
      const currentCards = await readCardCount(targetUserId);
      await writeCardCount(targetUserId, currentCards + 3);
    }

    // 5. 알림
    await createNotification(targetUserId, {
      type: 'system',
      fromUserId: user.id,
      fromUserName: '관리자',
      postId,
      message: '🎉 생애 첫 게시글 혜택이 지급되었습니다! (포인트 +300pt, 카드 3장)',
    }).catch(() => {});

    invalidateFeedCache().catch(() => {});
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Delete a post (admin only)
// 이벤트 실격자 목록 조회
app.get("/make-server-0b7d3bae/last-post-event/disqualified", async (c) => {
  try {
    const list = await kv.get("last_event_disqualified") || [];
    return c.json(list);
  } catch { return c.json([]); }
});

// 실격 해제 (관리자)
app.delete("/make-server-0b7d3bae/last-post-event/disqualified", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    const role = await getUserRole(user?.id || "");
    if (role !== "admin") return c.json({ error: "Forbidden" }, 403);
    const { userId } = await c.req.json();
    const current: string[] = await kv.get("last_event_disqualified") || [];
    await kv.set("last_event_disqualified", current.filter((id: string) => id !== userId));
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 이벤트 실격 처리 (본인 글 삭제 시 자동 호출)
app.post("/make-server-0b7d3bae/last-post-event/disqualify", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

    const current: string[] = await kv.get("last_event_disqualified") || [];
    if (!current.includes(user.id)) {
      current.push(user.id);
      await kv.set("last_event_disqualified", current);
    }
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 개별 포스트 조회
app.get("/make-server-0b7d3bae/community/posts/:postId", async (c) => {
  try {
    const postId = c.req.param('postId');
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    let userId: string | null = null;
    if (accessToken) {
      const { data: { user } } = await supabase.auth.getUser(accessToken);
      if (user?.id) userId = user.id;
    }
    const post = await kv.get(`beta_post_${postId}`);
    if (!post || post.isDraft) return c.json({ error: 'Post not found' }, 404);
    const pts = await getUserPoints(post.userId).catch(() => null);
    return c.json({ post: { ...post, userRankPoints: pts } });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 이벤트 시작 시 실격자 목록 초기화 (start action에 포함)
app.delete("/make-server-0b7d3bae/community/posts/:postId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const postId = c.req.param('postId');
    const post = await kv.get(`beta_post_${postId}`);
    
    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }
    
    // Only admin or post author can delete
    if (user.email !== 'sityplanner2@naver.com' && post.userId !== user.id) {
      return c.json({ error: 'Forbidden: Only admin or post author can delete' }, 403);
    }
    
    await kv.del(`beta_post_${postId}`);
    invalidateFeedCache().catch(() => {});

    // 본인이 삭제한 경우에만 포인트 회수 (임시저장 제외)
    if (post.userId === user.id && !post.isDraft) {
      const { loss } = await removePoints(user.id, 'POST').catch(() => ({ loss: 0 }));
      if (loss > 0) {
        await createNotification(user.id, {
          type: 'points',
          fromUserId: user.id,
          fromUserName: post.userName || '',
          postId,
          message: `게시물 삭제로 -${loss}pt 차감`,
        }).catch(() => {});
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete post error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Update a post (PATCH)
app.patch("/make-server-0b7d3bae/community/posts/:postId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const postId = c.req.param('postId');
    const post = await kv.get(`beta_post_${postId}`);
    
    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }
    
    // Only post author, admin, or staff can edit
    const role = await getUserRole(user.id);
    const isAdmin = role === 'admin';
    const staffMembers: any[] = (await kv.get('staff_members') as any[]) ?? [];
    const isStaff = staffMembers.some((m: any) => m.userId === user.id);
    if (post.userId !== user.id && !isAdmin && !isStaff) {
      return c.json({ error: 'Forbidden: Only post author can edit' }, 403);
    }

    const { content, category, images, linkedGame, linkedGames, talentData, isPrivate } = await c.req.json();

    // 운영진(비관리자, 비작성자)은 linkedGames만 수정 가능
    if (isStaff && !isAdmin && post.userId !== user.id) {
      if (linkedGames === undefined) {
        return c.json({ error: 'Forbidden: Staff can only update game tags' }, 403);
      }
    }

    // isPrivate 또는 linkedGames만 업데이트하는 경우 content 불필요
    if (isPrivate === undefined && linkedGames === undefined && (!content || content.trim().length === 0)) {
      return c.json({ error: 'Content is required' }, 400);
    }
    
    // Update post
    const updatedPost: any = {
      ...post,
      updatedAt: new Date().toISOString(),
    };
    if (content !== undefined) updatedPost.content = content.trim();
    if (category !== undefined) updatedPost.category = category;
    if (images !== undefined) updatedPost.images = images || [];
    if (linkedGames !== undefined) {
      const resolvedGames = await Promise.all(
        (Array.isArray(linkedGames) ? linkedGames : (linkedGame ? [linkedGame] : [])).map(async (g: any) => {
          if (g.imageUrl) return g;
          // 이미지 없으면 bgg_details_ 캐시에서 가져오기
          const bggId = g.bggId || (/^\d+$/.test(g.id) ? g.id : null);
          if (bggId) {
            const cached = await kv.get(`bgg_details_${bggId}`).catch(() => null);
            if (cached?.imageUrl) return { ...g, imageUrl: cached.imageUrl };
            // 캐시에도 없으면 BGG API 직접 호출
            try {
              const bggToken = Deno.env.get('BGG_API_TOKEN');
              const res = await fetch(`https://boardgamegeek.com/xmlapi2/thing?id=${bggId}`, bggToken ? { headers: { Authorization: `Bearer ${bggToken}` } } : {});
              if (res.ok) {
                const xml = await res.text();
                const imgMatch = xml.match(/<image>([^<]+)<\/image>/);
                if (imgMatch) {
                  const imgUrl = imgMatch[1].startsWith('//') ? 'https:' + imgMatch[1] : imgMatch[1];
                  return { ...g, imageUrl: imgUrl };
                }
              }
            } catch {}
          }
          return g;
        })
      );
      updatedPost.linkedGames = resolvedGames;
      updatedPost.linkedGame = resolvedGames[0] || null;
    }
    if (talentData !== undefined) updatedPost.talentData = talentData || null;
    if (isPrivate !== undefined) updatedPost.isPrivate = isPrivate;
    
    await kv.set(`beta_post_${postId}`, updatedPost);
    // 피드 캐시 무효화 (전체 + 해당 카테고리)
    await Promise.all([
      kv.del('feed_cache_전체').catch(() => {}),
      kv.del(`feed_cache_${updatedPost.category}`).catch(() => {}),
      kv.del('trending_games_cache').catch(() => {}),
    ]);

    // 운영진 태그 자동 적립: 운영진/관리자가 게임 태그 추가한 경우 +2점
    let staffPointsAwarded = 0;
    if (linkedGames !== undefined && updatedPost.linkedGames?.length > 0) {
      const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
      const isMember = members.some((m: any) => m.userId === user.id);
      if (isMember || isAdmin) {
        const prevCount = Array.isArray(post.linkedGames) ? post.linkedGames.length : (post.linkedGame ? 1 : 0);
        const newCount = updatedPost.linkedGames.length;
        const added = Math.max(0, newCount - prevCount);
        if (added > 0) {
          const pts = added * 2;
          const logs: any[] = (await kv.get(`staff_activity_${user.id}`) as any[]) ?? [];
          logs.unshift({
            action: `활동점수 합계 ${pts}점`,
            detail: `태그 매기기 ${added}건(+${pts}점) | postId: ${postId}`,
            totalPoints: pts,
            scores: { tag: added },
            recordedAt: new Date().toISOString(),
            recordedBy: user.id,
          });
          await kv.set(`staff_activity_${user.id}`, logs.slice(0, 200));
          staffPointsAwarded = pts;
          await createNotification(user.id, {
            type: 'points',
            fromUserId: user.id,
            fromUserName: '',
            postId,
            message: `태그 매기기 ${added}건 +${pts} 운영진 포인트 적립!`,
          }).catch(() => {});
        }
      }
    }

    return c.json({ success: true, post: updatedPost, staffPointsAwarded });
  } catch (error) {
    console.error('Update post error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Toggle like on a post
app.post("/make-server-0b7d3bae/community/posts/:postId/like", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const postId = c.req.param('postId');
    const post = await kv.get(`beta_post_${postId}`);
    
    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }
    
    if (!post.likes) {
      post.likes = [];
    }
    
    const likeIndex = post.likes.indexOf(user.id);
    
    if (likeIndex > -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
    } else {
      // Like
      post.likes.push(user.id);
    }
    
    await kv.set(`beta_post_${postId}`, post);
    
    if (likeIndex === -1) {
      // 좋아요 추가 → 포인트 적립 + 알림
      await addPoints(post.userId, 'LIKE_RECEIVED').catch(() => {});
      if (post.userId !== user.id) {
        const likerProfile = await kv.get(`user_profile_${user.id}`).catch(() => null);
        const likerName = likerProfile?.username || likerProfile?.name || user.email?.split('@')[0] || '누군가';
        await createNotification(post.userId, {
          type: 'like',
          fromUserId: user.id,
          fromUserName: likerName,
          postId,
          postContent: (post.content || '').slice(0, 30),
          message: `${likerName}님이 하트를 눌렀어요 (+${POINT_RULES.LIKE_RECEIVED}pt)`,
        }).catch(() => {});
      }
    } else {
      // 좋아요 취소 → 포인트 회수 + 알림
      const { loss } = await removePoints(post.userId, 'LIKE_RECEIVED').catch(() => ({ loss: 0 }));
      if (loss > 0 && post.userId !== user.id) {
        await createNotification(post.userId, {
          type: 'points',
          fromUserId: user.id,
          fromUserName: '',
          postId,
          postContent: (post.content || '').slice(0, 30),
          message: `하트가 취소됐어요 (-${loss}pt)`,
        }).catch(() => {});
      }
    }
    
    return c.json({ success: true, likes: post.likes.length, isLiked: likeIndex === -1 });
  } catch (error) {
    console.error('Toggle like error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Add a comment to a post
app.post("/make-server-0b7d3bae/community/posts/:postId/comments", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // 커뮤니티 제한 유저 차단 (댓글, 관리자 제외)
    const commentRole = await getUserRole(user.id);
    if (commentRole !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      const restricted = await kv.get(`community_restricted_${user.id}`);
      if (restricted) {
        return c.json({ error: '커뮤니티 이용이 제한된 계정입니다. 관리자에게 문의해주세요.' }, 403);
      }
    }

    const postId = c.req.param('postId');
    const { content, userName, isSecret, parentId, images: commentImages, linkedGame: commentLinkedGame, linkedGames: commentLinkedGames } = await c.req.json();
    
    if ((!content || content.trim().length === 0) && (!commentImages || commentImages.length === 0)) {
      return c.json({ error: 'Content or image is required' }, 400);
    }
    
    if (content && content.length > 500) {
      return c.json({ error: '댓글은 500자 이내로 입력해주세요' }, 400);
    }
    
    const post = await kv.get(`beta_post_${postId}`);
    
    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }
    
    if (!post.comments) {
      post.comments = [];
    }
    
    // 댓글 작성자 프로필/포인트 첨부
    const [resolvedUserName, commenterProfile, commenterPoints] = await Promise.all([
      getUserName(user.id),
      kv.get(`user_profile_${user.id}`).catch(() => null),
      getUserPoints(user.id).catch(() => null),
    ]);

    const comment = {
      id: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
      userId: user.id,
      userName: resolvedUserName,
      userAvatar: commenterProfile?.profileImage || null,
      userRankPoints: commenterPoints,
      content: (content || "").trim(),
      isSecret: !!isSecret,
      parentId: parentId || null,
      likes: [],
      images: Array.isArray(commentImages) ? commentImages : [],
      linkedGame: commentLinkedGame || null,
      linkedGames: Array.isArray(commentLinkedGames) && commentLinkedGames.length > 0 ? commentLinkedGames : (commentLinkedGame ? [commentLinkedGame] : []),
      createdAt: new Date().toISOString(),
    };
    
    post.comments.push(comment);
    
    await kv.set(`beta_post_${postId}`, post);
    
    // 댓글 작성 포인트 + 알림
    // 첫 게시글 여부: 2026-04-23 이후 작성된 글 + post.isFirstPost 또는 KV 확인
    const FIRST_POST_COMMENT_CUTOFF = '2026-04-23T00:00:00.000Z';
    const postCreatedAfterCutoff = post.createdAt ? new Date(post.createdAt) >= new Date(FIRST_POST_COMMENT_CUTOFF) : false;
    let bonusPointsGiven = 0;
    const isFirstPostByKv = post.isFirstPost || false;
    const authorFirstPostKv = postCreatedAfterCutoff && post.userId ? await kv.get(`user_first_post_${post.userId}`).catch(() => null) : null;
    const isActualFirstPost = postCreatedAfterCutoff && (isFirstPostByKv || (authorFirstPostKv && authorFirstPostKv.postId === postId));

    if (isActualFirstPost && post.userId !== user.id) {
      const bonusKey = `first_post_comment_bonus_${postId}_${user.id}`;
      const alreadyClaimed = await kv.get(bonusKey).catch(() => null);
      if (!alreadyClaimed) {
        // addPoints(COMMENT) 대신 직접 30pt 지급 (comments 카운트는 +1)
        const currentPoints = await getUserPoints(user.id).catch(() => ({ points: 0, posts: 0, comments: 0, likesReceived: 0 }));
        await kv.set(`user_points_${user.id}`, {
          ...currentPoints,
          points: (currentPoints.points || 0) + POINT_RULES.COMMENT * 10,
          comments: (currentPoints.comments || 0) + 1,
        }).catch(() => {});
        await kv.set(bonusKey, { claimedAt: new Date().toISOString() }).catch(() => {});
        bonusPointsGiven = POINT_RULES.COMMENT * 10; // 30pt
      } else {
        await addPoints(user.id, 'COMMENT').catch(() => {});
      }
    } else {
      await addPoints(user.id, 'COMMENT').catch(() => {});
    }

    await createNotification(user.id, {
      type: 'points',
      fromUserId: user.id,
      fromUserName: userName || 'Anonymous',
      postId,
      message: bonusPointsGiven > 0
        ? `🎉 첫 게시글 댓글 보너스! +${bonusPointsGiven}pt 획득! (10배 적용)`
        : `댓글 작성으로 +${POINT_RULES.COMMENT}pt 획득!`,
    }).catch(() => {});
    
    const commenterName = comment.userName || userName || 'Anonymous';

    // ── 1. 게시물 작성자에게 댓글 알림 (본인 제외, ���댓글이 아닌 경우만)
    if (!parentId && post.userId && post.userId !== user.id) {
      await createNotification(post.userId, {
        type: 'comment',
        fromUserId: user.id,
        fromUserName: commenterName,
        postId,
        postContent: (post.content || '').slice(0, 30),
        message: `${commenterName}님이 내 글에 댓글을 달았어요`,
      }).catch(() => {});
    }

    // ── 2. 대댓글(reply) 알림: 부모 댓글 작성자에게 알림 (본인 제외)
    if (parentId) {
      const parentComment = (post.comments || []).find((c: any) => c.id === parentId);
      if (parentComment && parentComment.userId && parentComment.userId !== user.id) {
        await createNotification(parentComment.userId, {
          type: 'reply',
          fromUserId: user.id,
          fromUserName: commenterName,
          postId,
          postContent: (parentComment.content || '').slice(0, 30),
          message: `${commenterName}님이 내 댓글에 답글을 달았어요`,
        }).catch(() => {});
      }
    }

    // ── 3. @멘션 알림: 댓글 내용에서 @username 추출해서 각 유저에게 알림
    const mentionedNames = extractMentions(comment.content || '');
    if (mentionedNames.length > 0) {
      const notifiedInThisComment = new Set<string>([user.id]); // 중복 알림 방지
      for (const mentionedName of mentionedNames) {
        try {
          const mentionedUserId = await findUserIdByUsername(mentionedName);
          if (mentionedUserId && !notifiedInThisComment.has(mentionedUserId)) {
            notifiedInThisComment.add(mentionedUserId);
            await createNotification(mentionedUserId, {
              type: 'mention',
              fromUserId: user.id,
              fromUserName: commenterName,
              postId,
              postContent: (comment.content || '').slice(0, 40),
              message: `${commenterName}님이 댓글에서 나를 태그했어요`,
            }).catch(() => {});
          }
        } catch {}
      }
    }

    invalidateFeedCache().catch(() => {});
    return c.json({ success: true, comment, pointsEarned: bonusPointsGiven > 0 ? bonusPointsGiven : POINT_RULES.COMMENT });
  } catch (error) {
    console.error('Add comment error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 댓글 삭제
// 댓글 수정
app.patch("/make-server-0b7d3bae/community/posts/:postId/comments/:commentId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const postId = c.req.param('postId');
    const commentId = c.req.param('commentId');
    const { content: newContent, images: newImages, linkedGame: newLinkedGame, linkedGames: newLinkedGames } = await c.req.json();
    if (!newContent?.trim() && !newImages?.length) return c.json({ error: 'Content required' }, 400);
    const post = await kv.get(`beta_post_${postId}`);
    if (!post) return c.json({ error: 'Post not found' }, 404);

    const findAndEdit = (comments: any[]): boolean => {
      for (const c of comments) {
        if (c.id === commentId) {
          if (c.userId !== user.id) return false;
          c.content = (newContent || '').trim();
          if (newImages !== undefined) c.images = newImages;
          if (newLinkedGame !== undefined) c.linkedGame = newLinkedGame;
          if (newLinkedGames !== undefined) c.linkedGames = Array.isArray(newLinkedGames) ? newLinkedGames : (newLinkedGame ? [newLinkedGame] : []);
          c.editedAt = new Date().toISOString();
          return true;
        }
      }
      return false;
    };
    if (!findAndEdit(post.comments || [])) return c.json({ error: 'Comment not found or not yours' }, 403);
    await kv.set(`beta_post_${postId}`, post);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

app.delete("/make-server-0b7d3bae/community/posts/:postId/comments/:commentId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const postId = c.req.param('postId');
    const commentId = c.req.param('commentId');
    const post = await kv.get(`beta_post_${postId}`);
    if (!post) return c.json({ error: 'Post not found' }, 404);

    const comments = post.comments || [];
    const commentIdx = comments.findIndex((c: any) => c.id === commentId);
    if (commentIdx === -1) return c.json({ error: 'Comment not found' }, 404);

    const comment = comments[commentIdx];
    // 본인 댓글 또는 관리자만 삭제 가능
    const isAdmin = user.email === 'sityplanner2@naver.com';
    if (comment.userId !== user.id && !isAdmin) return c.json({ error: 'Forbidden' }, 403);

    post.comments.splice(commentIdx, 1);
    await kv.set(`beta_post_${postId}`, post);

    // 본인 댓글 삭제 시 포인트 회수
    if (comment.userId === user.id) {
      const { loss } = await removePoints(user.id, 'COMMENT').catch(() => ({ loss: 0 }));
      if (loss > 0) {
        await createNotification(user.id, {
          type: 'points',
          fromUserId: user.id,
          fromUserName: comment.userName || '',
          postId,
          message: `댓글 삭제로 -${loss}pt 차감`,
        }).catch(() => {});
      }
    }

    invalidateFeedCache().catch(() => {});
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 설문 투표
app.post("/make-server-0b7d3bae/community/posts/:postId/poll/vote", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const postId = c.req.param('postId');
    const { optionIndex } = await c.req.json();
    const post = await kv.get(`beta_post_${postId}`);
    if (!post?.poll) return c.json({ error: 'Poll not found' }, 404);

    // 기존 투표 취소
    post.poll.options.forEach((opt: any) => {
      opt.votes = (opt.votes || []).filter((id: string) => id !== user.id);
    });
    // optionIndex가 -1이면 취소만
    if (optionIndex >= 0) {
      if (!post.poll.options[optionIndex]) return c.json({ error: 'Invalid option' }, 400);
      post.poll.options[optionIndex].votes = [...(post.poll.options[optionIndex].votes || []), user.id];
    }

    await kv.set(`beta_post_${postId}`, post);
    return c.json({ success: true, poll: post.poll });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 살래말래 투표
app.post("/make-server-0b7d3bae/community/posts/:postId/sallae/vote", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const postId = c.req.param('postId');
    const { choice } = await c.req.json(); // 'buy' | 'pass' | null (취소)
    const post = await kv.get(`beta_post_${postId}`);
    if (!post) return c.json({ error: 'Post not found' }, 404);

    if (!post.sallae) {
      post.sallae = { buy: [], pass: [], think: [] };
    }
    if (!post.sallae.think) post.sallae.think = [];

    // 기존 투표 제거
    post.sallae.buy = (post.sallae.buy || []).filter((id: string) => id !== user.id);
    post.sallae.pass = (post.sallae.pass || []).filter((id: string) => id !== user.id);
    post.sallae.think = (post.sallae.think || []).filter((id: string) => id !== user.id);

    // 새 투표 추가
    if (choice === 'buy') {
      post.sallae.buy = [...post.sallae.buy, user.id];
    } else if (choice === 'pass') {
      post.sallae.pass = [...post.sallae.pass, user.id];
    } else if (choice === 'think') {
      post.sallae.think = [...post.sallae.think, user.id];
    }

    await kv.set(`beta_post_${postId}`, post);
    return c.json({ success: true, sallae: post.sallae });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 살래말래 카운트 관리자 조작
app.post("/make-server-0b7d3bae/community/posts/:postId/sallae/admin", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const postId = c.req.param('postId');
    const { buyCount, passCount, thinkCount } = await c.req.json();
    const post = await kv.get(`beta_post_${postId}`);
    if (!post) return c.json({ error: 'Post not found' }, 404);

    if (!post.sallae) post.sallae = { buy: [], pass: [], think: [] };
    if (!post.sallae.think) post.sallae.think = [];

    // 실제 유저 투표는 유지하고, admin_ 접두사 더미만 교체
    post.sallae.buy = post.sallae.buy.filter((id: string) => !id.startsWith('admin_'));
    post.sallae.pass = post.sallae.pass.filter((id: string) => !id.startsWith('admin_'));
    post.sallae.think = post.sallae.think.filter((id: string) => !id.startsWith('admin_'));

    for (let i = 0; i < buyCount; i++) {
      post.sallae.buy.push(`admin_buy_${i}`);
    }
    for (let i = 0; i < passCount; i++) {
      post.sallae.pass.push(`admin_pass_${i}`);
    }
    for (let i = 0; i < (thinkCount || 0); i++) {
      post.sallae.think.push(`admin_think_${i}`);
    }

    await kv.set(`beta_post_${postId}`, post);
    return c.json({ success: true, sallae: post.sallae });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 댓글 좋아요 토글
app.post("/make-server-0b7d3bae/community/posts/:postId/comments/:commentId/like", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const postId = c.req.param('postId');
    const commentId = c.req.param('commentId');
    const post = await kv.get(`beta_post_${postId}`);
    if (!post) return c.json({ error: 'Post not found' }, 404);

    const comment = (post.comments || []).find((c: any) => c.id === commentId);
    if (!comment) return c.json({ error: 'Comment not found' }, 404);

    const likes: string[] = comment.likes || [];
    const alreadyLiked = likes.includes(user.id);
    comment.likes = alreadyLiked
      ? likes.filter((id: string) => id !== user.id)
      : [...likes, user.id];

    await kv.set(`beta_post_${postId}`, post);
    return c.json({ success: true, liked: !alreadyLiked, likes: comment.likes });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ============================================
// 💬 베타사용자 소통 - 실시간 메시지 API
// ============================================

// Get all chat messages
app.get("/make-server-0b7d3bae/community/messages", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Check if user is approved
    const role = await getUserRole(user.id);
    if (role !== 'admin' && role !== 'beta_tester') {
      return c.json({ error: 'Only approved beta testers can view messages' }, 403);
    }
    
    // Fetch all messages
    const messagesDataResult = await getByPrefix('beta_message_');
    
    const messages = messagesDataResult
      .map(item => item.value) // Extract values
      .filter(msg => msg && msg.id && msg.userId && msg.content && msg.createdAt) // Validate message structure
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    
    return c.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Send a new chat message
app.post("/make-server-0b7d3bae/community/messages", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Check if user is approved
    const role = await getUserRole(user.id);
    if (role !== 'admin' && role !== 'beta_tester') {
      return c.json({ error: 'Only approved beta testers can send messages' }, 403);
    }
    
    const { content, userName } = await c.req.json();
    
    if (!content || !content.trim()) {
      return c.json({ error: 'Content is required' }, 400);
    }
    
    if (content.length > 500) {
      return c.json({ error: 'Content too long (max 500 characters)' }, 400);
    }
    
    const messageId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const message = {
      id: messageId,
      userId: user.id,
      userName: userName || 'Anonymous',
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    
    await kv.set(`beta_message_${messageId}`, message);
    
    return c.json({ success: true, message });
  } catch (error) {
    console.error('Send message error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ============================================
// 👤 사용자 프로필 API
// ============================================

// 프로필 조회
app.get("/make-server-0b7d3bae/user/profile", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // 프로필 데이터 가져오기
    const profile = await kv.get(`user_profile_${user.id}`);
    const betaTesterInfo = await kv.get(`beta_user_${user.id}`).catch(() => null);

    // 프로필이 없으면 beta_user에서 기본값 생성
    if (!profile) {
      const defaultProfile = {
        userId: user.id,
        email: user.email || betaTesterInfo?.email || '',
        name: betaTesterInfo?.name || '',
        username: betaTesterInfo?.username || '',
        phone: betaTesterInfo?.phone || '',
        birthdate: '',
        profileImage: '',
        bio: '',
        favoriteGames: '',
        createdAt: betaTesterInfo?.created_at || new Date().toISOString(),
      };
      return c.json({ profile: defaultProfile });
    }

    // ★ 프로필은 있지만 username·email이 비어있으면 beta_user에서 채워서 반환 (기존 회원 구제)
    const mergedProfile = { ...profile };
    if (!mergedProfile.username?.trim() && betaTesterInfo?.username?.trim()) {
      mergedProfile.username = betaTesterInfo.username.trim();
    }
    if (!mergedProfile.email?.trim()) {
      mergedProfile.email = user.email || betaTesterInfo?.email || '';
    }
    if (!mergedProfile.name?.trim() && betaTesterInfo?.name?.trim()) {
      mergedProfile.name = betaTesterInfo.name.trim();
    }

    // resolvedName: getUserName()과 동일한 로직 — 낙관적 업데이트와 서버 저장값 일치
    const resolvedName = await getUserName(user.id);
    return c.json({ profile: { ...mergedProfile, resolvedName } });
  } catch (error) {
    console.error('Get profile error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 프로필 저장/수정
app.post("/make-server-0b7d3bae/user/profile", async (c) => {
  try {
    
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }


    const body = await c.req.json();

    // 기존 프로필 + beta_user 가져오기
    const [existingProfile, betaUser] = await Promise.all([
      kv.get(`user_profile_${user.id}`).catch(() => null),
      kv.get(`beta_user_${user.id}`).catch(() => null),
    ]);

    // ★ username·name 비어있으면 beta_user에서 fallback (실수로 빈 값 저장 방지)
    const finalUsername = body.username?.trim() || existingProfile?.username?.trim() || betaUser?.username?.trim() || '';
    const finalName     = body.name?.trim()     || existingProfile?.name?.trim()     || betaUser?.name?.trim()     || '';

    // 프로필 데이터 구성
    const profile: any = {
      userId: user.id,
      email: user.email || betaUser?.email || '',
      name: finalName,
      username: finalUsername,
      phone: body.phone || existingProfile?.phone || betaUser?.phone || '',
      birthdate: body.birthdate || existingProfile?.birthdate || '',
      profileImage: body.profileImage !== undefined ? body.profileImage : (existingProfile?.profileImage || ''),
      bio: body.bio !== undefined ? body.bio : (existingProfile?.bio || ''),
      favoriteGames: body.favoriteGames !== undefined ? body.favoriteGames : (existingProfile?.favoriteGames || ''),
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };


    // 프로필 저장
    await kv.set(`user_profile_${user.id}`, profile);
    
    // 저장 확인
    const savedProfile = await kv.get(`user_profile_${user.id}`);
    
    
    return c.json({ success: true, profile });
  } catch (error) {
    console.error('❌ [Server] Save profile error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 게임 보기/정렬 설정 저장 (GET/PUT)
app.get("/make-server-0b7d3bae/user/game-view", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const settings = await kv.get(`user_game_view_${user.id}`) ?? {};
    return c.json({ settings });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.put("/make-server-0b7d3bae/user/game-view", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json();
    const current: any = await kv.get(`user_game_view_${user.id}`) ?? {};
    const merged = { ...current, ...body, updatedAt: new Date().toISOString() };
    await kv.set(`user_game_view_${user.id}`, merged);
    return c.json({ success: true, settings: merged });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// ============================================
// 🚨 긴급 데이터 복구 API
// ============================================

// 전체 키 목록 상세 조회 (admin only) - 모든 키를 prefix별로 분류
// 비밀번호 변경
// ===== 추천인 코드 API =====

// 내 추천 코드 조회/생성
app.get("/make-server-0b7d3bae/referral/my-code", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    // 기존 코드 조회
    const existing = await kv.get(`referral_code_user_${user.id}`).catch(() => null);
    if (existing?.code) return c.json({ code: existing.code });

    // 없으면 6자리 코드 생성
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];

    // 코드 → userId 매핑 저장
    await kv.set(`referral_code_user_${user.id}`, { code, userId: user.id });
    await kv.set(`referral_code_${code}`, { userId: user.id });

    return c.json({ code });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ===== 추천인 랭킹 이벤트 API =====

// 날짜 기간으로 referral_log 필터링하는 헬퍼
function filterLogsByPeriod(logs: any[], eventStartDate?: string, eventEndDate?: string): any[] {
  const from = eventStartDate ? new Date(eventStartDate).getTime() : 0;
  const to   = eventEndDate   ? new Date(eventEndDate).getTime()   : Infinity;
  return logs.filter((l: any) => {
    const t = new Date(l.joinedAt).getTime();
    return t >= from && t <= to;
  });
}

// referrerId 별 카운트 집계 헬퍼
function buildRanking(filtered: any[], withRecruits = false) {
  const countMap: Record<string, any> = {};
  for (const log of filtered) {
    if (!countMap[log.referrerId]) {
      countMap[log.referrerId] = { referrerId: log.referrerId, referrerName: log.referrerName, count: 0, ...(withRecruits ? { recruits: [] } : {}) };
    }
    countMap[log.referrerId].count++;
    if (withRecruits) countMap[log.referrerId].recruits.push({ name: log.refereeName, joinedAt: log.joinedAt });
  }
  return Object.values(countMap).sort((a: any, b: any) => b.count - a.count);
}

// 랭킹 항목의 닉네임을 최신 KV(beta_user_) 기준으로 업데이트
async function applyLatestNames(ranking: any[]): Promise<any[]> {
  return Promise.all(
    ranking.map(async (r) => {
      try {
        // user_profile_ 우선 (닉네임 변경 시 여기에 저장됨), 없으면 beta_user_ 참조
        const profile = await kv.get(`user_profile_${r.referrerId}`).catch(() => null);
        if (profile?.username && profile.username.trim() && profile.username !== 'Anonymous') {
          return { ...r, referrerName: profile.username.trim() };
        }
        const beta = await kv.get(`beta_user_${r.referrerId}`).catch(() => null);
        if (beta?.username && beta.username.trim() && beta.username !== 'Anonymous') {
          return { ...r, referrerName: beta.username.trim() };
        }
        if (beta?.name && beta.name !== 'Anonymous') {
          return { ...r, referrerName: beta.name };
        }
        return { ...r, referrerName: r.referrerName || '익명' };
      } catch {
        return r;
      }
    })
  );
}

// 공개: 추천인 랭킹 이벤트 조회 + 랭킹 계산
app.get("/make-server-0b7d3bae/referral-rank-event", async (c) => {
  try {
    const event = await kv.get("referral_rank_event") || null;
    if (!event?.active) return c.json({ active: false });

    const now = Date.now();
    const expired = event.eventEndDate ? new Date(event.eventEndDate).getTime() < now : false;

    const logs: any[] = await kv.get("referral_log") || [];
    const filtered = filterLogsByPeriod(logs, event.eventStartDate || undefined, event.eventEndDate || undefined);
    // 최신 닉네임 기준으로 랭킹 표시
    const ranking = await applyLatestNames(buildRanking(filtered, false));

    return c.json({ ...event, ranking, expired });
  } catch (e) { return c.json({ active: false, error: String(e) }); }
});

// 관리자: 추천인 랭킹 이벤트 시작/종료
app.post("/make-server-0b7d3bae/admin/referral-rank-event", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);

    const body = await c.req.json();
    const { action, prize, prizeCards, description, prizeImageUrl, eventStartDate, eventEndDate } = body;

    if (action === "start") {
      const newEvent = {
        active: true,
        prize: prize || '',
        prizeCards: prizeCards || 0,
        description: description || '',
        prizeImageUrl: prizeImageUrl || '',
        startedAt: new Date().toISOString(),
        eventStartDate: eventStartDate || null,
        eventEndDate:   eventEndDate   || null,
      };
      await kv.set("referral_rank_event", newEvent);
      return c.json({ ok: true, event: newEvent });
    }
    if (action === "update") {
      const current = await kv.get("referral_rank_event") || {};
      const updated = {
        ...current,
        ...(prize          !== undefined ? { prize }          : {}),
        ...(prizeCards     !== undefined ? { prizeCards }     : {}),
        ...(description    !== undefined ? { description }    : {}),
        ...(prizeImageUrl  !== undefined ? { prizeImageUrl }  : {}),
        ...(eventStartDate !== undefined ? { eventStartDate } : {}),
        ...(eventEndDate   !== undefined ? { eventEndDate }   : {}),
      };
      await kv.set("referral_rank_event", updated);
      return c.json({ ok: true, event: updated });
    }
    if (action === "stop") {
      const current = await kv.get("referral_rank_event") || {};
      const updated = { ...current, active: false, stoppedAt: new Date().toISOString() };
      await kv.set("referral_rank_event", updated);
      // 히스토리 저장
      const history: any[] = await kv.get("referral_rank_event_history") || [];
      history.unshift(updated);
      await kv.set("referral_rank_event_history", history.slice(0, 20));
      return c.json({ ok: true });
    }
    return c.json({ error: "Unknown action" }, 400);
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 관리자: 추천인 랭킹 이벤트 현황 + 전체 로그 조회
app.get("/make-server-0b7d3bae/admin/referral-rank-event", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);

    const event = await kv.get("referral_rank_event") || null;
    const logs: any[] = await kv.get("referral_log") || [];

    const startFilter = event?.eventStartDate || event?.startedAt || null;
    const endFilter   = event?.eventEndDate   || null;
    const filtered = event ? filterLogsByPeriod(logs, startFilter || undefined, endFilter || undefined) : logs;
    // 최신 닉네임 기준으로 랭킹 표시
    const ranking  = await applyLatestNames(buildRanking(filtered, true));

    const now = Date.now();
    const expired = event?.eventEndDate ? new Date(event.eventEndDate).getTime() < now : false;

    const history: any[] = await kv.get("referral_rank_event_history") || [];
    return c.json({ event, ranking, history, totalLogs: logs.length, expired });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 추천 코드 → userId 조회 (가입 시 사용)
app.get("/make-server-0b7d3bae/referral/resolve/:code", async (c) => {
  try {
    const code = c.req.param('code');
    const data = await kv.get(`referral_code_${code}`).catch(() => null);
    if (!data?.userId) return c.json({ error: 'Invalid code' }, 404);
    return c.json({ userId: data.userId });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ===== 보너스카드 API =====

// =====================================================================
// ★★★ 보너스카드 시스템 — 이메일 기반 키로 완전 교체 ★★★
// 핵심: 카드를 bonus_cards_email_<email> 키에 저장
//       → userId(UUID)가 달라도 항상 같은 이메일로 읽고 쓰므로 불일치 불가
// =====================================================================

function emailToCardKey(email: string): string {
  return `bonus_cards_email_${email.toLowerCase().trim()}`;
}

function parseCardCount(raw: any): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return Math.max(0, Math.floor(raw));
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    return isNaN(n) ? 0 : Math.max(0, n);
  }
  if (typeof raw === 'object') {
    if (raw.cards !== undefined) return parseCardCount(raw.cards);
    if (raw.value !== undefined) return parseCardCount(raw.value);
  }
  return 0;
}

// 이메일 기반으로 카드 수 읽기
// userIdForLegacy: 이메일 키에 없을 때 레거시 userId 키도 확인해서 자동 마이그레이션
async function readCardCountByEmail(email: string, userIdForLegacy?: string): Promise<number> {
  const emailKey = emailToCardKey(email);
  try {
    const raw = await kv.get(emailKey);
    const count = parseCardCount(raw);
    if (count > 0) {
      console.log(`[카드읽기] emailKey=${emailKey} → ${count}장`);
      return count;
    }

    // 이메일 키에 카드 없음 → 레거시 userId 키 확인
    if (userIdForLegacy) {
      const legacyRaw = await kv.get(`bonus_cards_${userIdForLegacy}`).catch(() => null);
      const legacyCount = parseCardCount(legacyRaw);
      if (legacyCount > 0) {
        console.log(`[카드마이그레이션] bonus_cards_${userIdForLegacy}(${legacyCount}장) → ${emailKey}`);
        await kv.set(emailKey, { cards: legacyCount, updatedAt: Date.now() });
        await kv.set(`bonus_cards_${userIdForLegacy}`, { cards: 0, updatedAt: Date.now() });
        return legacyCount;
      }
    }

    // Step 2b: uid 역방향 룩업 키 확인 (beta_user_ 전체 스캔 대신 O(1) 조회)
    if (userIdForLegacy) {
      try {
        const lookup = await kv.get(`bonus_cards_uid_lookup_${userIdForLegacy}`).catch(() => null);
        if (lookup?.emailKey && lookup.emailKey !== emailKey) {
          const altRaw = await kv.get(lookup.emailKey).catch(() => null);
          const altCount = parseCardCount(altRaw);
          if (altCount > 0) {
            console.log(`[카드마이그레이션] uid룩업(${lookup.emailKey})(${altCount}장) → ${emailKey}`);
            await kv.set(emailKey, { cards: altCount, updatedAt: Date.now() });
            await kv.set(lookup.emailKey, { cards: 0, updatedAt: Date.now() });
            return altCount;
          }
        }
      } catch (lookupErr) {
        console.error('[카드읽기] uid룩업 오류:', lookupErr);
      }
    }

    // Step 3: beta_user_ 전체 스캔은 제거 (풀스캔 → 502 Bad Gateway 유발)
    // 마이그레이션이 필요한 경우 관리자 페이지의 카드 마이그레이션 버튼을 사용할 것

    console.log(`[카드읽기] emailKey=${emailKey} → 0장 (없음)`);
    return 0;
  } catch (e) {
    console.error(`[카드읽기] 오류 emailKey=${emailKey}:`, e);
    return 0;
  }
}

// 이메일 기반으로 카드 수 쓰기
async function writeCardCountByEmail(email: string, count: number): Promise<void> {
  const safeCount = Math.min(1000, Math.max(0, Math.floor(count)));
  const emailKey = emailToCardKey(email);
  await kv.set(emailKey, { cards: safeCount, updatedAt: Date.now() });
  console.log(`[카드쓰기] emailKey=${emailKey} cards=${safeCount}`);
}

// 레거시 호환용 (레벨업 등 기존 코드에서 userId로 호출하는 곳)
async function readCardCount(userId: string): Promise<number> {
  try {
    const raw = await kv.get(`bonus_cards_${userId}`);
    return parseCardCount(raw);
  } catch { return 0; }
}
async function writeCardCount(userId: string, count: number): Promise<void> {
  const safeCount = Math.min(1000, Math.max(0, Math.floor(count)));
  await kv.set(`bonus_cards_${userId}`, { cards: safeCount, updatedAt: Date.now() });
}

// 내 보너스카드 조회
app.get("/make-server-0b7d3bae/bonus-cards/me", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || !user.email) return c.json({ error: 'Unauthorized' }, 401);

    // ★ 이메일 기반으로 읽기 (userId 불일치 완전 해결 + 레거시 자동 마이그레이션)
    const cards = await readCardCountByEmail(user.email, user.id);
    console.log(`[bonus-cards/me] userId=${user.id} email=${user.email} → ${cards}장`);
    return c.json({ cards, userId: user.id });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Helper: 이벤트 당첨자(마지막 이벤트글 작성자) 계산
async function findEventWinner(event: any): Promise<{ winnerUserId: string | null; winnerUserName: string | null; winnerPostId: string | null }> {
  const startedAtMs = new Date(event.startedAt).getTime();
  const disqualified: string[] = event.disqualified || [];
  const excluded: string[] = event.excluded || [];
  const reductionMs2   = (event.reductionSeconds || 0) * 1000;
  const baseDurationMs2 = (event.durationMinutes || 60) * 60 * 1000;
  const isExpiredByCards2 = reductionMs2 >= baseDurationMs2;
  const cardCutoffMs2 = isExpiredByCards2 && event.lastReductionAt ? Number(event.lastReductionAt) : Infinity;
  const allPostsData = await getByPrefix('beta_post_');
  const eligiblePosts = allPostsData
    .map((d: any) => d.value)
    .filter((p: any) =>
      p &&
      !p.isDraft &&
      p.category === '이벤트' &&
      new Date(p.createdAt).getTime() >= startedAtMs &&
      new Date(p.createdAt).getTime() <= cardCutoffMs2 &&
      !disqualified.includes(p.userId) &&
      !excluded.includes(p.userId)
    )
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const leader = eligiblePosts[0] || null;
  return {
    winnerUserId: leader?.userId || null,
    winnerUserName: leader?.userName || null,
    winnerPostId: leader?.id || null,
  };
}

// 보너스카드 사용 (타이머 감소)
app.post("/make-server-0b7d3bae/bonus-cards/use", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || !user.email) return c.json({ error: 'Unauthorized' }, 401);

    // 연속 카드 사용 방지: 동일 유저 1초 이내 재사용 차단
    const rateKey = `card_rate_${user.email.toLowerCase().trim()}`;
    const lastUseTs: number | null = await kv.get(rateKey).catch(() => null);
    if (lastUseTs && Date.now() - lastUseTs < 1000) {
      return c.json({ error: '카드 사용 후 잠시 기다려 주세요.' }, 429);
    }
    await kv.set(rateKey, Date.now());

    // ★ 이메일 기반으로 현재 카드 수 조회
    const current = await readCardCountByEmail(user.email, user.id);
    console.log(`[카드사용] userId=${user.id} email=${user.email} emailKey=bonus_cards_email_${user.email.toLowerCase().trim()} 보유=${current}장`);
    if (current <= 0) {
      // 카드가 없을 때 직접 이메일 키 값도 출력해서 불일치 디버깅
      const rawEmailKey = await kv.get(`bonus_cards_email_${user.email.toLowerCase().trim()}`).catch(() => null);
      console.log(`[카드사용] 이메일키 raw값:`, JSON.stringify(rawEmailKey));
      return c.json({ error: '보너스카드가 없어요' }, 400);
    }

    // 이메일 기반으로 차감
    await writeCardCountByEmail(user.email, current - 1);

    // 이벤트 타이머 -5분(300초) 적용 + 카드 사용 기록 남기기 (다중 이벤트 지원)
    let updatedEvent = null;
    const useEvents: any[] = await kv.get('last_post_events') || [];
    // 사용자 이름 조회 (user_profile_ 우선, 없으면 beta_user_)
    let cardUserName = user.email || user.id;
    try {
      const profileEntry = await kv.get(`user_profile_${user.id}`).catch(() => null);
      if (profileEntry?.username) cardUserName = profileEntry.username;
      else if (profileEntry?.name) cardUserName = profileEntry.name;
      else {
        const betaEntry = await kv.get(`beta_user_${user.id}`).catch(() => null);
        if (betaEntry?.username) cardUserName = betaEntry.username;
        else if (betaEntry?.name) cardUserName = betaEntry.name;
      }
    } catch {}

    if (useEvents.length > 0) {
      const idx = useEvents.findIndex((e: any) => e.active);
      if (idx >= 0) {
        const perCardSecs = useEvents[idx].cardReductionSeconds ?? 300;
        const successRate = useEvents[idx].cardSuccessRate ?? 100;
        const roll = Math.random() * 100;
        const cardFailed = roll >= successRate;
        const usageEntry = {
          userId: user.id,
          userName: cardUserName,
          email: user.email,
          usedAt: new Date().toISOString(),
          cardsAfter: current - 1,
          reductionSeconds: cardFailed ? 0 : perCardSecs,
          failed: cardFailed,
        };
        // ★ 쓰기 직전 재조회 — auto-close가 이미 이벤트를 제거했으면 덮어쓰지 않음
        const freshEvents: any[] = await kv.get('last_post_events') || [];
        const freshIdx = freshEvents.findIndex((e: any) => e.id === useEvents[idx].id && e.active);
        if (freshIdx >= 0) {
          freshEvents[freshIdx] = {
            ...freshEvents[freshIdx],
            reductionSeconds: (freshEvents[freshIdx].reductionSeconds || 0) + (cardFailed ? 0 : perCardSecs),
            lastReductionAt: Date.now(),
            lastReductionBy: user.id,
            cardUsageLog: [...(freshEvents[freshIdx].cardUsageLog || []), usageEntry],
          };
          await kv.set('last_post_events', freshEvents);
          updatedEvent = freshEvents[freshIdx];
        } else {
          console.log(`[카드사용] 이벤트 ${useEvents[idx].id} 이미 종료됨 — last_post_events 덮어쓰기 skip`);
        }
        if (cardFailed) return c.json({ success: true, cards: current - 1, cardFailed: true, updatedEvent });
      }
    } else {
      const event = await kv.get('last_post_event');
      if (event?.active) {
        const perCardSecs = event.cardReductionSeconds ?? 300;
        const successRate = event.cardSuccessRate ?? 100;
        const roll = Math.random() * 100;
        const cardFailed = roll >= successRate;
        const usageEntry = {
          userId: user.id,
          userName: cardUserName,
          email: user.email,
          usedAt: new Date().toISOString(),
          cardsAfter: current - 1,
          reductionSeconds: cardFailed ? 0 : perCardSecs,
          failed: cardFailed,
        };
        const currentReduction = event.reductionSeconds || 0;
        updatedEvent = {
          ...event,
          reductionSeconds: currentReduction + (cardFailed ? 0 : perCardSecs),
          lastReductionAt: Date.now(),
          lastReductionBy: user.id,
          cardUsageLog: [...(event.cardUsageLog || []), usageEntry],
        };
        await kv.set('last_post_event', updatedEvent);
        if (cardFailed) return c.json({ success: true, cards: current - 1, cardFailed: true, updatedEvent });
      }
    }

    return c.json({ success: true, cards: current - 1, updatedEvent });
  } catch (e) {
    console.error('[카드사용] 오류:', e);
    return c.json({ error: String(e) }, 500);
  }
});

// 활동 보상 카드 (글 5%, 댓글 1%)
app.post("/make-server-0b7d3bae/bonus-cards/activity", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json().catch(() => ({}));
    const type = body.type; // 'post' | 'comment'
    // ★ KV에서 관리자가 설정한 확률 읽기 (기본값: 글 5%, 댓글 1%)
    const probSettings: any = await kv.get('activity_card_prob_settings').catch(() => null);
    const postProb    = typeof probSettings?.post    === 'number' ? probSettings.post    : 0.05;
    const commentProb = typeof probSettings?.comment === 'number' ? probSettings.comment : 0.01;
    const probability = type === 'post' ? postProb : type === 'comment' ? commentProb : 0;
    if (probability === 0) return c.json({ granted: false });

    // ✅ 이벤트 진행 중 여부 확인 (이벤트 없으면 카드 지급 안 함)
    const activityEvents: any[] = await kv.get('last_post_events') || [];
    const activityActiveEvent = activityEvents.find((e: any) => e.active);
    if (!activityActiveEvent) {
      console.log(`[활동카드] 이벤트 없음 → 지급 안 함 (type=${type}, email=${user.email})`);
      return c.json({ granted: false, reason: 'no_event' });
    }

    // ✅ 휴식 시간 여부 확인
    const activityKstHour = (new Date().getUTCHours() + 9) % 24;
    const actSleepStart = activityActiveEvent.sleepStart ?? 0;
    const actSleepEnd = activityActiveEvent.sleepEnd ?? 8;
    const actIsSleep = actSleepStart !== actSleepEnd && (
      actSleepStart < actSleepEnd
        ? activityKstHour >= actSleepStart && activityKstHour < actSleepEnd
        : activityKstHour >= actSleepStart || activityKstHour < actSleepEnd
    );
    if (actIsSleep) {
      console.log(`[활동카드] 휴식 시간(KST ${activityKstHour}시) → 지급 안 함 (type=${type}, email=${user.email})`);
      return c.json({ granted: false, reason: 'sleep' });
    }

    const roll = Math.random();
    if (roll >= probability) return c.json({ granted: false });

    // 카드 지급
    const emailKey = emailToCardKey(user.email!);
    const current = await readCardCountByEmail(user.email!, user.id);
    const newCount = current + 1;
    await kv.set(emailKey, { cards: newCount, updatedAt: Date.now() });
    console.log(`[활동카드] type=${type} email=${user.email} roll=${roll.toFixed(3)} prob=${probability} → 지급! (${current}→${newCount}장)`);

    // 활동 카드 지급 로그 저장
    try {
      const betaEntry = await kv.get(`beta_user_${user.id}`).catch(() => null);
      const userName = betaEntry?.name || betaEntry?.nickname || user.email?.split('@')[0] || '';
      const existingLog: any[] = await kv.get('activity_card_grant_log') || [];
      const newEntry = {
        userId: user.id,
        email: user.email,
        userName,
        type,
        cardsBefore: current,
        cardsAfter: newCount,
        grantedAt: Date.now(),
      };
      const updatedLog = [newEntry, ...existingLog].slice(0, 500);
      await kv.set('activity_card_grant_log', updatedLog);
    } catch (logErr) {
      console.error('[활동카드] 로그 저장 오류:', logErr);
    }

    return c.json({ granted: true, cards: newCount });
  } catch (e) {
    console.error('[활동카드] 오류:', e);
    return c.json({ error: String(e) }, 500);
  }
});

// 관리자 - 활동 카드 지급 로그 조회
app.get("/make-server-0b7d3bae/admin/activity-card-grant-log", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);
    const log: any[] = await kv.get('activity_card_grant_log') || [];
    return c.json({ log });
  } catch (e) {
    console.error('[활동카드로그] 조회 오류:', e);
    return c.json({ error: String(e) }, 500);
  }
});

// 관리자 - 활동 카드 확률 조회
app.get("/make-server-0b7d3bae/admin/activity-card-prob", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);
    const settings: any = await kv.get('activity_card_prob_settings').catch(() => null);
    return c.json({
      post:    typeof settings?.post    === 'number' ? settings.post    : 0.05,
      comment: typeof settings?.comment === 'number' ? settings.comment : 0.01,
    });
  } catch (e) {
    console.error('[활동카드확률] 조회 오류:', e);
    return c.json({ error: String(e) }, 500);
  }
});

// 관리자 - 활동 카드 확률 수정
app.put("/make-server-0b7d3bae/admin/activity-card-prob", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const post    = typeof body.post    === 'number' ? body.post    : parseFloat(body.post);
    const comment = typeof body.comment === 'number' ? body.comment : parseFloat(body.comment);
    if (isNaN(post) || isNaN(comment) || post < 0 || post > 1 || comment < 0 || comment > 1) {
      return c.json({ error: '확률은 0~1 사이 숫자로 입력해주세요' }, 400);
    }
    await kv.set('activity_card_prob_settings', { post, comment, updatedAt: Date.now(), updatedBy: user.email });
    console.log(`[활동카드확률] 수정: post=${post} comment=${comment} by=${user.email}`);
    return c.json({ success: true, post, comment });
  } catch (e) {
    console.error('[활동카드확률] 수정 오류:', e);
    return c.json({ error: String(e) }, 500);
  }
});

// 관리자 - 보너스카드 지급
app.post("/make-server-0b7d3bae/admin/users/:targetUserId/grant-bonus-cards", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const targetUserId = c.req.param('targetUserId');
    const body = await c.req.json();
    const amount = typeof body.amount === 'number' ? body.amount : parseInt(body.amount);
    if (!amount || isNaN(amount) || amount < 1 || amount > 100) {
      return c.json({ error: '수량은 1~100 사이로 입력해주세요' }, 400);
    }

    // ★ beta_user_ KV에서 이메일 가져와서 이메일 기반 키에 저장
    const betaUserEntry = await kv.get(`beta_user_${targetUserId}`).catch(() => null);
    const targetEmail = betaUserEntry?.email;
    if (!targetEmail) {
      return c.json({ error: `유저 이메일을 찾을 수 없습니다 (userId: ${targetUserId}). 관리자 목록을 새로고침 후 다시 시도해주세요.` }, 400);
    }

    // 이메일 기반으로 현재 카드 수 조회 (레거시 자동 마이그레이션 포함)
    const current = await readCardCountByEmail(targetEmail, targetUserId);
    const newCount = current + amount;

    // 이메일 기반 키에 저장 → 어떤 userId로 읽어도 항상 같은 값
    await writeCardCountByEmail(targetEmail, newCount);

    // uid → emailKey 역방향 룩업 저장 (readCardCountByEmail beta_user_ 전체 스캔 없이 O(1) 조회 가능)
    const emailKey = emailToCardKey(targetEmail);
    await kv.set(`bonus_cards_uid_lookup_${targetUserId}`, { emailKey, updatedAt: Date.now() }).catch(() => null);

    // 검증
    const verifiedRaw = await kv.get(emailKey);
    const verified = parseCardCount(verifiedRaw);
    console.log(`🃏 카드지급: email=${targetEmail} +${amount} (${current}→${newCount}, 검증=${verified})`);

    // ★ 개인별 카드 이력 로그 저장
    try {
      const targetUserEntry = await kv.get(`beta_user_${targetUserId}`).catch(() => null);
      const targetUserName = targetUserEntry?.name || targetUserEntry?.nickname || targetEmail?.split('@')[0] || '';
      const userLog: any[] = await kv.get(`bonus_card_log_${targetUserId}`) || [];
      const newLogEntry = {
        type: 'admin_grant',
        source: '관리자 지급',
        amount,
        cardsBefore: current,
        cardsAfter: verified,
        grantedAt: Date.now(),
        grantedBy: user.email,
      };
      await kv.set(`bonus_card_log_${targetUserId}`, [newLogEntry, ...userLog].slice(0, 200));
      const globalAdminLog: any[] = await kv.get('admin_card_grant_log') || [];
      await kv.set('admin_card_grant_log', [{
        userId: targetUserId,
        email: targetEmail,
        userName: targetUserName,
        ...newLogEntry,
      }, ...globalAdminLog].slice(0, 500));
    } catch (logErr) {
      console.error('[카드지급] 로그 저장 오류:', logErr);
    }

    return c.json({ success: true, cards: verified, granted: amount, before: current });
  } catch (e) {
    console.error('보너스카드 지급 오류:', e);
    return c.json({ error: String(e) }, 500);
  }
});

// 관리자 - 특정 유저 카드 획득 이력 조회
app.get("/make-server-0b7d3bae/admin/users/:targetUserId/card-history", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const targetUserId = c.req.param('targetUserId');

    // 1) 개인별 로그 (어드민 지급 이력)
    const userLog: any[] = await kv.get(`bonus_card_log_${targetUserId}`) || [];

    // 2) 전역 활동카드 로그에서 해당 유저 필터
    const activityLog: any[] = await kv.get('activity_card_grant_log') || [];
    const userActivityLog = activityLog
      .filter((e: any) => e.userId === targetUserId)
      .map((e: any) => ({
        type: e.type === 'post' ? 'activity_post' : 'activity_comment',
        source: e.type === 'post' ? '글 작성 (활동 카드)' : '댓글 작성 (활동 카드)',
        amount: 1,
        cardsBefore: e.cardsBefore,
        cardsAfter: e.cardsAfter,
        grantedAt: e.grantedAt,
      }));

    // 병합 후 시간 내림차순 정렬
    const merged = [...userLog, ...userActivityLog]
      .sort((a: any, b: any) => (b.grantedAt || 0) - (a.grantedAt || 0))
      .slice(0, 100);

    return c.json({ history: merged });
  } catch (e) {
    console.error('[card-history] 오류:', e);
    return c.json({ error: String(e) }, 500);
  }
});

// 관리자 - 여러 유저 보너스카드 수량 일괄 조회 (getByPrefix 2회로 처리)
app.post("/make-server-0b7d3bae/admin/users/bulk-bonus-cards", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const { userIds } = await c.req.json();
    if (!Array.isArray(userIds)) return c.json({ error: 'userIds required' }, 400);

    const userIdSet = new Set<string>(userIds);

    // 로컬 getByPrefix는 {key, value} 반환
    const [betaEntries, emailCardEntries, legacyCardEntries] = await Promise.all([
      getByPrefix('beta_user_'),
      getByPrefix('bonus_cards_email_'),
      getByPrefix('bonus_cards_'),
    ]);

    const userEmailMap: Record<string, string> = {};
    for (const { key, value } of betaEntries as any[]) {
      const uid = key.replace('beta_user_', '');
      if (userIdSet.has(uid) && value?.email) userEmailMap[uid] = value.email.toLowerCase().trim();
    }

    const emailCardMap: Record<string, number> = {};
    for (const { key, value } of emailCardEntries as any[]) {
      const email = key.replace('bonus_cards_email_', '');
      emailCardMap[email] = parseCardCount(value);
    }

    const legacyCardMap: Record<string, number> = {};
    for (const { key, value } of legacyCardEntries as any[]) {
      const uid = key.replace('bonus_cards_', '');
      if (!uid.includes('@')) legacyCardMap[uid] = parseCardCount(value);
    }

    const cardMap: Record<string, number> = {};
    for (const uid of userIds) {
      const email = userEmailMap[uid];
      const byEmail = email ? (emailCardMap[email] ?? 0) : 0;
      const byLegacy = legacyCardMap[uid] ?? 0;
      cardMap[uid] = byEmail > 0 ? byEmail : byLegacy;
    }

    return c.json({ cards: cardMap });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 관리자 - 특정 유저 보너스카드 수량 조회
app.get("/make-server-0b7d3bae/admin/users/:targetUserId/bonus-cards", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const targetUserId = c.req.param('targetUserId');

    // ★ 이메일 기반으로 조회 (레거시 자동 마이그레이션 포함)
    const betaUserEntry = await kv.get(`beta_user_${targetUserId}`).catch(() => null);
    const targetEmail = betaUserEntry?.email;
    let cards = 0;
    if (targetEmail) {
      cards = await readCardCountByEmail(targetEmail, targetUserId);
    } else {
      cards = await readCardCount(targetUserId);
    }
    console.log(`[admin/bonus-cards] targetUserId=${targetUserId} email=${targetEmail} → ${cards}장`);
    return c.json({ cards });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// 관리자 - 전체 카드 레거시→이메일 기반 마이그레이션 (1회성 실행 가능)
app.post("/make-server-0b7d3bae/admin/migrate-bonus-cards", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const allBetaUsers = await getByPrefix('beta_user_');
    let migrated = 0;
    let skipped = 0;
    const details: any[] = [];

    for (const item of allBetaUsers) {
      const bu = item.value;
      if (!bu?.email || !bu?.userId) { skipped++; continue; }

      const email = bu.email.toLowerCase().trim();
      const userId = bu.userId;
      const emailKey = emailToCardKey(email);

      // 이미 이메일 키에 카드가 있으면 스킵
      const existing = await kv.get(emailKey).catch(() => null);
      const existingCount = parseCardCount(existing);

      // 레거시 userId 키 확인
      const legacyRaw = await kv.get(`bonus_cards_${userId}`).catch(() => null);
      const legacyCount = parseCardCount(legacyRaw);

      if (existingCount > 0) {
        details.push({ email, userId, action: 'skip', emailKeyCount: existingCount, legacyCount });
        skipped++;
        continue;
      }

      if (legacyCount > 0) {
        await kv.set(emailKey, { cards: legacyCount, updatedAt: Date.now() });
        await kv.set(`bonus_cards_${userId}`, { cards: 0, updatedAt: Date.now() });
        details.push({ email, userId, action: 'migrated', legacyCount, emailKeyCount: legacyCount });
        migrated++;
      } else {
        details.push({ email, userId, action: 'no_cards' });
        skipped++;
      }
    }

    console.log(`[카드마이그레이션] 완료: migrated=${migrated}, skipped=${skipped}`);
    return c.json({ success: true, migrated, skipped, details });
  } catch (e) {
    console.error('카드 마이그레이션 오류:', e);
    return c.json({ error: String(e) }, 500);
  }
});

// 회원탈퇴
app.delete("/make-server-0b7d3bae/user/withdraw", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    // KV 데이터 삭제
    await kv.del(`beta_user_${user.id}`).catch(() => {});
    await kv.del(`user_profile_${user.id}`).catch(() => {});

    // Supabase Auth 유저 삭제
    await supabase.auth.admin.deleteUser(user.id);

    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '탈퇴 처리 실패' }, 500);
  }
});

// 관리자 - 3일 정지
app.post("/make-server-0b7d3bae/admin/users/:userId/suspend", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const userId = c.req.param('userId');
    const { until } = await c.req.json();
    const betaUser = await kv.get(`beta_user_${userId}`);
    if (!betaUser) return c.json({ error: 'User not found' }, 404);
    await kv.set(`beta_user_${userId}`, { ...betaUser, suspended: true, suspendedUntil: until });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '정지 처리 실패' }, 500);
  }
});

// 관리자 - 강제탈퇴
app.delete("/make-server-0b7d3bae/admin/users/:userId/force-withdraw", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id || user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const userId = c.req.param('userId');
    await kv.del(`beta_user_${userId}`).catch(() => {});
    await kv.del(`user_profile_${userId}`).catch(() => {});
    await supabase.auth.admin.deleteUser(userId);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '강제탈퇴 처리 실패' }, 500);
  }
});

app.post("/make-server-0b7d3bae/user/change-password", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return c.json({ error: "Unauthorized" }, 401);

    const { currentPassword, newPassword } = await c.req.json();
    if (!currentPassword || !newPassword) return c.json({ error: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요" }, 400);
    if (newPassword.length < 8) return c.json({ error: "비밀번호는 8자 이상이어야 합니다" }, 400);

    // 현재 비밀번호로 로그인해서 세션 획득
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    });
    if (signInError || !signInData.session) return c.json({ error: "현재 비밀번호가 올바르지 않습니다" }, 400);

    // 획득한 access_token으로 Supabase Auth REST API 직접 호출
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const updateRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${signInData.session.access_token}`,
        'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!updateRes.ok) {
      const err = await updateRes.json();
      return c.json({ error: err.msg || err.message || '비밀번��� 변경 실패' }, 500);
    }

    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

app.get("/make-server-0b7d3bae/admin/emergency/all-keys", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    
    // Query ALL keys from KV Store
    const { data: allData, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value");
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    // Categorize by prefix
    const prefixGroups: Record<string, string[]> = {};
    const allKeys: string[] = [];
    const keyDetails: any[] = [];
    
    allData.forEach((item) => {
      const key = item.key as string;
      allKeys.push(key);
      
      // Extract prefix (everything before first underscore or full key)
      const prefixMatch = key.match(/^([^_]+)_/);
      const prefix = prefixMatch ? prefixMatch[1] : key;
      
      if (!prefixGroups[prefix]) {
        prefixGroups[prefix] = [];
      }
      prefixGroups[prefix].push(key);
      
      // Store key details with size info
      keyDetails.push({
        key,
        valueType: Array.isArray(item.value) ? 'array' : typeof item.value,
        arrayLength: Array.isArray(item.value) ? item.value.length : null,
        hasData: !!item.value
      });
    });
    
    // Sort prefixes by count
    const sortedPrefixes = Object.entries(prefixGroups)
      .map(([prefix, keys]) => ({
        prefix,
        count: keys.length,
        sampleKeys: keys.slice(0, 5)
      }))
      .sort((a, b) => b.count - a.count);
    
    sortedPrefixes.forEach(p => {
    });
    
    // Additional analysis for user data
    const userOwnedKeys = allKeys.filter(k => k.includes('owned'));
    const userWishlistKeys = allKeys.filter(k => k.includes('wishlist'));
    const userKeys = allKeys.filter(k => k.startsWith('user_'));
    const betaUserKeys = allKeys.filter(k => k.startsWith('beta_user_'));
    const gameCustomKeys = allKeys.filter(k => k.startsWith('game_custom_'));
    const betaPostKeys = allKeys.filter(k => k.startsWith('beta_post_'));
    const playRecordKeys = allKeys.filter(k => k.includes('play_records') || k.includes('playrecords'));
    
    userOwnedKeys.slice(0, 5).forEach(key => {
      const data = allData.find(d => d.key === key);
      console.log(`   - ${key}:`, {
        type: Array.isArray(data?.value) ? 'array' : typeof data?.value,
        length: Array.isArray(data?.value) ? data.value.length : 'N/A',
        sample: Array.isArray(data?.value) ? data.value.slice(0, 2) : data?.value
      });
    });
    
    
    return c.json({
      success: true,
      totalKeys: allKeys.length,
      allKeys,
      prefixGroups: sortedPrefixes,
      keyDetails,
      analysis: {
        userOwnedKeys: userOwnedKeys.length,
        userWishlistKeys: userWishlistKeys.length,
        userKeys: userKeys.length,
        betaUserKeys: betaUserKeys.length,
        gameCustomKeys: gameCustomKeys.length,
        betaPostKeys: betaPostKeys.length,
        playRecordKeys: playRecordKeys.length,
        allOwnedKeys: userOwnedKeys,
        allWishlistKeys: userWishlistKeys,
        allUserKeys: userKeys,
        allPlayRecordKeys: playRecordKeys,
        sampleOwnedKeys: userOwnedKeys.slice(0, 10),
        sampleWishlistKeys: userWishlistKeys.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('All keys error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 🚨🚨🚨 홍야님 데이터 완전 진단 (admin only)
app.get("/make-server-0b7d3bae/admin/emergency/diagnose-hongya", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    // 진단 실행
    const userId = 'cc50eac9-0d05-43fa-bc62-0ea1eb712565';
    const report = await diagnoseHongyaData(userId);
    
    return c.json(report);
    
  } catch (error) {
    console.error('🚨 [Hongya Diagnosis Error]', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// 🔬 홍야님 데이터 초정밀 진단 + 자동 복구 (admin only)
app.get("/make-server-0b7d3bae/admin/emergency/precise-diagnose-hongya", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    // 초정밀 진단 + 자동 복구 실행
    const report = await diagnoseAndRecoverHongya();
    
    return c.json(report);
    
  } catch (error) {
    console.error('🚨 [Hongya Precise Diagnosis Error]', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// 🔥 홍야님 데이터 강제 로드 (admin only)
app.get("/make-server-0b7d3bae/admin/emergency/force-load-hongya", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    // 강제 로드 실행
    const result = await forceLoadHongyaData();
    
    return c.json(result);
    
  } catch (error) {
    console.error('🚨 [Hongya Force Load Error]', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// 전체 데이터 진단 (admin only)
app.get("/make-server-0b7d3bae/admin/emergency/diagnose", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    
    // Query ALL data from KV Store
    const { data: allData, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value");
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    // Categorize data
    const stats = {
      totalKeys: allData.length,
      userOwnedGames: 0,
      userWishlistGames: 0,
      betaUsers: 0,
      gameCustoms: 0,
      betaPosts: 0,
      playRecords: 0,
      userProfiles: 0,
      other: 0,
      users: new Set<string>()
    };
    
    const userDataSummary: any[] = [];
    
    allData.forEach((item) => {
      const key = item.key;
      
      if (key.startsWith('user_') && key.endsWith('_owned')) {
        stats.userOwnedGames++;
        const userId = key.replace('user_', '').replace('_owned', '');
        stats.users.add(userId);
        
        const games = Array.isArray(item.value) ? item.value : [];
        userDataSummary.push({
          userId,
          type: 'owned',
          count: games.length,
          preview: games.slice(0, 3).map((g: any) => g.koreanName || g.englishName)
        });
      } else if (key.startsWith('user_') && key.endsWith('_wishlist')) {
        stats.userWishlistGames++;
        const userId = key.replace('user_', '').replace('_wishlist', '');
        stats.users.add(userId);
        
        const games = Array.isArray(item.value) ? item.value : [];
        userDataSummary.push({
          userId,
          type: 'wishlist',
          count: games.length,
          preview: games.slice(0, 3).map((g: any) => g.koreanName || g.englishName)
        });
      } else if (key.startsWith('beta_user_')) {
        stats.betaUsers++;
      } else if (key.startsWith('game_custom_')) {
        stats.gameCustoms++;
      } else if (key.startsWith('beta_post_')) {
        stats.betaPosts++;
      } else if (key.startsWith('play_records_')) {
        stats.playRecords++;
      } else if (key.startsWith('user_profile_')) {
        stats.userProfiles++;
      } else {
        stats.other++;
      }
    });
    
    console.log('📊 [Emergency Diagnose] Results:', {
      ...stats,
      uniqueUsers: stats.users.size
    });
    
    return c.json({
      success: true,
      stats: {
        ...stats,
        uniqueUsers: stats.users.size,
        users: undefined // Remove Set from response
      },
      userDataSummary,
      allKeys: allData.map(item => item.key)
    });
  } catch (error) {
    console.error('Emergency diagnose error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 사용자별 데이터 조회 (admin only)
app.get("/make-server-0b7d3bae/admin/emergency/user/:userId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    const targetUserId = c.req.param('userId');
    
    // ==================== 🆕 NEW: Load with fallback ====================
    const ownedGames = await loadGamesWithFallback(targetUserId, 'owned');
    const wishlistGames = await loadGamesWithFallback(targetUserId, 'wishlist');
    const lastModified = await kv.get(`user_${targetUserId}_last_modified`);
    const betaUser = await kv.get(`beta_user_${targetUserId}`);
    
    return c.json({
      userId: targetUserId,
      betaUser,
      ownedGames,
      wishlistGames,
      lastModified,
      counts: {
        owned: ownedGames.length,
        wishlist: wishlistGames.length
      }
    });
  } catch (error) {
    console.error('Get user data error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 전체 데이터 복구 (admin only) - KV Store 내에서 데이터 정리 및 복구
app.post("/make-server-0b7d3bae/admin/emergency/recover", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    
    const stats = {
      usersFound: 0,
      usersRecovered: 0,
      gamesRecovered: 0,
      errors: [] as string[]
    };
    
    // Query all user data
    const { data: allData, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value");
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    // Find all users with game data
    const userIds = new Set<string>();
    allData.forEach((item) => {
      const match = item.key.match(/^user_([a-f0-9\-]+)_(owned|wishlist)$/);
      if (match) {
        userIds.add(match[1]);
      }
    });
    
    stats.usersFound = userIds.size;
    
    // Verify and fix each user's data
    for (const userId of userIds) {
      try {
        const ownedKey = `user_${userId}_owned`;
        const wishlistKey = `user_${userId}_wishlist`;
        const timestampKey = `user_${userId}_last_modified`;
        
        const owned = await kv.get(ownedKey);
        const wishlist = await kv.get(wishlistKey);
        const timestamp = await kv.get(timestampKey);
        
        // Verify data integrity
        const ownedArray = Array.isArray(owned) ? owned : [];
        const wishlistArray = Array.isArray(wishlist) ? wishlist : [];
        
        // Re-save data to ensure consistency
        await kv.set(ownedKey, ownedArray);
        await kv.set(wishlistKey, wishlistArray);
        
        if (!timestamp) {
          await kv.set(timestampKey, Date.now());
        }
        
        const totalGames = ownedArray.length + wishlistArray.length;
        if (totalGames > 0) {
          stats.usersRecovered++;
          stats.gamesRecovered += totalGames;
        }
      } catch (error) {
        const errorMsg = `Failed to recover user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        console.error(`❌ [Recover] ${errorMsg}`);
      }
    }
    
    
    return c.json({
      success: true,
      message: `데이터 복구 완료: ${stats.usersRecovered}명의 사용자, ${stats.gamesRecovered}개의 게임`,
      stats
    });
  } catch (error) {
    console.error('Emergency recover error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ============================================
// Data Backup & Sync API
// ============================================

// ============================================
// Image Upload API
// ============================================

// 🖼️ 이미지 업로드 (유저별 게임 카드 이미지)
app.post("/make-server-0b7d3bae/image/upload", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user?.id) {
      return c.json({ error: 'Auth error: ' + (authError?.message || 'No user') }, 401);
    }


    // FormData에서 이미지 파일 가져오기
    const formData = await c.req.formData();
    const file = formData.get('image');
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No image file provided' }, 400);
    }

    // 파일 유효성 검사
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return c.json({ error: 'File size too large (max 5MB)' }, 400);
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: 'Invalid file type. Only JPEG, PNG, WebP, GIF allowed.' }, 400);
    }

    // 버킷 이름
    const bucketName = 'make-0b7d3bae-game-images';

    // 버킷 존재 확인 및 생성
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true, // 공개 버킷 (이미지는 누구나 볼 수 있어야 함)
        fileSizeLimit: maxSize,
        allowedMimeTypes: allowedTypes
      });
      
      if (createError) {
        console.error('Failed to create bucket:', createError);
        return c.json({ error: 'Failed to create storage bucket' }, 500);
      }
    }

    // 파일명 생성 (충돌 방지)
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    // 파일을 ArrayBuffer로 변환
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Supabase Storage에 업로드
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, uint8Array, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return c.json({ error: 'Failed to upload image: ' + uploadError.message }, 500);
    }

    // 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);


    return c.json({
      success: true,
      url: urlData.publicUrl,
      path: fileName
    });

  } catch (error) {
    console.error('Image upload error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 🔥 관리자 전용: 전체 회원 데이터 백업
app.post("/make-server-0b7d3bae/data/admin-backup-all", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id || user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Admin only' }, 403);
    }


    // ==================== STEP 1: 승인된 베타 테스터 목록 조회 ====================
    const betaTestersKeys = await getByPrefix('beta_user_');
    
    // 승인된 베타 테스터만 필터링
    const approvedTesters = betaTestersKeys.filter(item => {
      return item.value?.status === 'approved';
    });
    
    
    if (approvedTesters.length === 0) {
      return c.json({ 
        success: false, 
        message: '승인된 베타 테스터가 없습니다.',
        totalUsers: 0,
        successCount: 0,
        errorCount: 0
      });
    }

    // 승인된 테스터의 userId 목록 추출
    const approvedUserIds = approvedTesters.map(item => {
      // beta_user_유저ID 형식에서 유저ID 추출
      const match = item.key.match(/^beta_user_(.+)$/);
      return match ? match[1] : null;
    }).filter(id => id !== null);


    // ==================== STEP 2: 각 승인된 유저의 게임 데이터 조회 ====================
    const userDataMap = new Map<string, { ownedGames: any[], wishlistGames: any[], playRecords: any[] }>();
    
    for (const userId of approvedUserIds) {
      try {
        // 각 유저의 데이터 조회
        const [ownedData, wishlistData, playRecordsData] = await Promise.all([
          kv.get(`user_${userId}_owned`),
          kv.get(`user_${userId}_wishlist`),
          kv.get(`user_play_records_${userId}`)
        ]);

        const ownedGames = ownedData || [];
        const wishlistGames = wishlistData || [];
        const playRecords = playRecordsData || [];

        // 데이터가 하나라도 있으면 맵에 추가
        if (ownedGames.length > 0 || wishlistGames.length > 0 || playRecords.length > 0) {
          userDataMap.set(userId, { ownedGames, wishlistGames, playRecords });
        }
      } catch (error) {
        console.error(`❌ [Admin Backup] Error loading data for user ${userId}:`, error);
      }
    }


    // 각 사용자의 데이터를 KV Store에 백업 (backup_user_유저ID_타임스탬프)
    let successCount = 0;
    let errorCount = 0;

    for (const [userId, userData] of userDataMap) {
      try {
        const gameCount = (userData.ownedGames.length || 0) + (userData.wishlistGames.length || 0);
        const timestamp = Date.now();
        
        // KV Store에 백업 저장
        const backupKey = `backup_user_${userId}_${timestamp}`;
        await kv.set(backupKey, {
          user_id: userId,
          backup_data: {
            ownedGames: userData.ownedGames,
            wishlistGames: userData.wishlistGames,
            playRecords: userData.playRecords
          },
          game_count: gameCount,
          created_at: new Date().toISOString()
        });

        // 유저당 최대 3개만 유지 - 오래된 백업 삭제
        const userBackupsKeys = await getByPrefix(`backup_user_${userId}_`);
        
        if (userBackupsKeys.length > 3) {
          // 타임스탬프로 정렬 (오래된 것부터)
          const sortedBackups = userBackupsKeys.sort((a, b) => {
            const timeA = parseInt(a.key.split('_').pop() || '0');
            const timeB = parseInt(b.key.split('_').pop() || '0');
            return timeA - timeB;
          });
          
          // 가장 오래된 것들 삭제 (최신 3개만 남김)
          const backupsToDelete = sortedBackups.slice(0, sortedBackups.length - 3);
          const keysToDelete = backupsToDelete.map(b => b.key);
          
          if (keysToDelete.length > 0) {
            await kv.mdel(keysToDelete);
          }
        }

        successCount++;
      } catch (error) {
        console.error(`❌ [Admin Backup] Exception for user ${userId}:`, error);
        errorCount++;
      }
    }


    return c.json({
      success: true,
      message: `전체 회원 백업 완료 (승인된 ${approvedUserIds.length}명 중 ${successCount}명 백업)`,
      totalUsers: userDataMap.size,
      approvedTesters: approvedUserIds.length,
      successCount,
      errorCount
    });
  } catch (error) {
    console.error('Admin backup all error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 🔍 관리자 전용: 전체 백업 조회
app.get("/make-server-0b7d3bae/data/admin-backup-list", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id || user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Admin only' }, 403);
    }


    // backup_로 시작하는 모든 키 조회
    const allBackups = await getByPrefix('backup_');

    // 유저별로 그룹화
    const backupsByUser = new Map<string, any[]>();
    allBackups.forEach((item: any) => {
      // backup_user_{userId}_{timestamp} 형식에서 userId 추출
      const match = item.key.match(/^backup_user_([^_]+)_/);
      if (match) {
        const userId = match[1];
        if (!backupsByUser.has(userId)) {
          backupsByUser.set(userId, []);
        }
        backupsByUser.get(userId)!.push({
          key: item.key,
          gameCount: item.value?.game_count || 0,
          createdAt: item.value?.created_at || 'Unknown',
          userData: {
            ownedCount: item.value?.backup_data?.ownedGames?.length || 0,
            wishlistCount: item.value?.backup_data?.wishlistGames?.length || 0,
            playRecordsCount: item.value?.backup_data?.playRecords?.length || 0
          }
        });
      }
    });


    let totalBackups = 0;
    const userBackupList = Array.from(backupsByUser.entries()).map(([userId, backups]) => {
      totalBackups += backups.length;
      return {
        userId,
        backupCount: backups.length,
        backups: backups.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      };
    });

    return c.json({
      success: true,
      totalBackups,
      usersWithBackups: backupsByUser.size,
      backupsByUser: userBackupList
    });
  } catch (error) {
    console.error('Admin backup list error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 🔍 관리자 전용: 개별 백업 다운로드 (전체 데이터 포함)
app.get("/make-server-0b7d3bae/data/admin-backup-download/:backupKey", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id || user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Admin only' }, 403);
    }

    const backupKey = c.req.param('backupKey');

    // 백업 데이터 조회
    const backupData = await kv.get(backupKey);
    
    if (!backupData) {
      return c.json({ error: 'Backup not found' }, 404);
    }


    return c.json({
      success: true,
      backupKey,
      data: backupData
    });
  } catch (error) {
    console.error('Admin backup download error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 자동 백업: Supabase 테이블에 저장 (최대 3개 유지)
app.post("/make-server-0b7d3bae/data/auto-backup", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized - No token' }, 401);
    }
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError) {
      console.error('❌ [Auto Backup] Auth error:', authError);
      return c.json({ error: 'Auth error: ' + authError.message }, 401);
    }
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized - No user' }, 401);
    }


    // 현재 데이터 읽기 (KV Store에서 그대로 읽기)
    const ownedGames = await kv.get(`user_${user.id}_owned`);
    const wishlistGames = await kv.get(`user_${user.id}_wishlist`);
    const playRecords = await kv.get(`user_play_records_${user.id}`);
    
    
    const gameCount = (ownedGames?.length || 0) + (wishlistGames?.length || 0);
    
    // KV Store에 백업 저장
    const timestamp = Date.now();
    const backupKey = `backup_user_${user.id}_${timestamp}`;
    
    
    try {
      await kv.set(backupKey, {
        user_id: user.id,
        backup_data: {
          ownedGames,
          wishlistGames,
          playRecords
        },
        game_count: gameCount,
        created_at: new Date().toISOString()
      });
    } catch (setError) {
      console.error(`❌ [Auto Backup] Failed to save backup:`, setError);
      throw setError;
    }

    // 유저당 최대 3개만 유지 - 오래된 백업 삭제
    const userBackupsKeys = await getByPrefix(`backup_user_${user.id}_`);
    
    if (userBackupsKeys.length > 3) {
      // 타임스탬프로 정렬 (오래된 것부터)
      const sortedBackups = userBackupsKeys.sort((a, b) => {
        const timeA = parseInt(a.key.split('_').pop() || '0');
        const timeB = parseInt(b.key.split('_').pop() || '0');
        return timeA - timeB;
      });
      
      // 가장 오래된 것들 삭제 (최신 3개만 남김)
      const backupsToDelete = sortedBackups.slice(0, sortedBackups.length - 3);
      const keysToDelete = backupsToDelete.map(b => b.key);
      
      if (keysToDelete.length > 0) {
        await kv.mdel(keysToDelete);
      }
    }


    return c.json({
      success: true,
      message: '자동 백업 완료',
      backupKey: backupKey,
      timestamp: timestamp,
      ownedCount: ownedGames?.length || 0,
      wishlistCount: wishlistGames?.length || 0,
      playRecordsCount: playRecords?.length || 0,
      gameCount
    });
  } catch (error) {
    console.error('❌❌❌ [Auto Backup] CRITICAL ERROR:', error);
    console.error('❌ [Auto Backup] Error type:', typeof error);
    console.error('❌ [Auto Backup] Error constructor:', error?.constructor?.name);
    console.error('❌ [Auto Backup] Is Error instance?', error instanceof Error);
    console.error('❌ [Auto Backup] Error message:', error instanceof Error ? error.message : String(error));
    console.error('❌ [Auto Backup] Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    // 에러 메시지 추출 (다양한 에러 타입 지원)
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error);
    } else {
      errorMessage = String(error);
    }
    
    return c.json({ 
      success: false,
      error: errorMessage,
      errorType: typeof error,
      details: '백업 생성 중 오류가 발생했습니다. 서버 로그를 확인하세요.'
    }, 500);
  }
});

// 백업 목록 조회 (Supabase 테이블에서)
app.get("/make-server-0b7d3bae/data/backups", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // KV Store에서 백업 조회 (최대 3개, 최신순)
    const userBackupsKeys = await getByPrefix(`backup_user_${user.id}_`);
    
    // 안전성 체크: undefined나 null이면 빈 배열로 처리
    const safeBackupsKeys = Array.isArray(userBackupsKeys) ? userBackupsKeys : [];
    
    // 타임스탬프로 정렬 (최신 것부터)
    const sortedBackups = safeBackupsKeys.sort((a, b) => {
      const timeA = parseInt(a.key.split('_').pop() || '0');
      const timeB = parseInt(b.key.split('_').pop() || '0');
      return timeB - timeA; // 내림차순
    }).slice(0, 3); // 최대 3개만

    // 프론트엔드 호환 형식으로 변환
    const backups = sortedBackups.map((backup, index) => {
      const backupData = backup.value;
      const timestamp = parseInt(backup.key.split('_').pop() || '0');
      
      return {
        slot: index + 1,
        key: backup.key, // 복구 시 사용할 실제 키
        timestamp: timestamp,
        ownedCount: backupData?.backup_data?.ownedGames?.length || 0,
        wishlistCount: backupData?.backup_data?.wishlistGames?.length || 0,
        playRecordsCount: backupData?.backup_data?.playRecords?.length || 0,
        gameCount: backupData?.game_count || 0
      };
    });

    return c.json({ backups });
  } catch (error) {
    console.error('❌❌❌ [Get Backups] CRITICAL ERROR:', error);
    console.error('❌ [Get Backups] Error type:', typeof error);
    console.error('❌ [Get Backups] Error constructor:', error?.constructor?.name);
    console.error('❌ [Get Backups] Error message:', error instanceof Error ? error.message : String(error));
    console.error('❌ [Get Backups] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('❌ [Get Backups] Error toString:', error?.toString?.());
    
    // 에러가 발생해도 빈 배열 반환 (페이지 로드는 유지)
    return c.json({ 
      backups: [],
      error: error instanceof Error ? error.message : String(error),
      errorType: typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      details: String(error)
    }, 200); // 200으로 변경 - 페이지가 로드되도록
  }
});

// 백업에서 복구 (Supabase 테이블에서)
app.post("/make-server-0b7d3bae/data/restore-backup", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { slot, key } = await c.req.json();
    
    // 백업 키 결정: key가 있으면 사용, 없으면 slot으로 조회
    let backupKey = key;
    
    if (!backupKey && slot) {
      // slot 번호로 백업 찾기
      const userBackupsKeys = await getByPrefix(`backup_user_${user.id}_`);
      const sortedBackups = userBackupsKeys.sort((a, b) => {
        const timeA = parseInt(a.key.split('_').pop() || '0');
        const timeB = parseInt(b.key.split('_').pop() || '0');
        return timeB - timeA;
      });
      
      if (sortedBackups[slot - 1]) {
        backupKey = sortedBackups[slot - 1].key;
      }
    }
    
    if (!backupKey) {
      return c.json({ error: 'Invalid backup' }, 400);
    }


    // KV Store에서 백업 데이터 읽기
    const backup = await kv.get(backupKey);

    if (!backup || backup.user_id !== user.id) {
      console.error('❌ [Restore] Backup not found or unauthorized');
      return c.json({ error: '백업을 찾을 수 없습니다' }, 404);
    }
    
    const { ownedGames, wishlistGames, playRecords } = backup.backup_data;
    
    // 현재 데이터를 임시 백업으로 저장 (KV Store에 보관)
    const currentOwned = await kv.get(`user_${user.id}_owned`);
    const currentWishlist = await kv.get(`user_${user.id}_wishlist`);
    
    if (currentOwned) {
      await kv.set(`user_${user.id}_temp_backup_owned`, currentOwned);
    }
    if (currentWishlist) {
      await kv.set(`user_${user.id}_temp_backup_wishlist`, currentWishlist);
    }
    
    // 백업 데이터로 복구 (KV Store에 저장)
    if (ownedGames) {
      await kv.set(`user_${user.id}_owned`, ownedGames);
    }
    if (wishlistGames) {
      await kv.set(`user_${user.id}_wishlist`, wishlistGames);
    }
    if (playRecords) {
      await kv.set(`user_play_records_${user.id}`, playRecords);
    }
    
    await kv.set(`user_${user.id}_last_modified`, Date.now());


    return c.json({
      success: true,
      message: '백업에서 복구 완료',
      slot,
      timestamp: new Date(backup.created_at).getTime(),
      ownedCount: ownedGames?.length || 0,
      wishlistCount: wishlistGames?.length || 0,
      playRecordsCount: playRecords?.length || 0,
    });
  } catch (error) {
    console.error('Restore backup error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 데이터 동기화 상태 확인 (타임스탬프 비교)
app.get("/make-server-0b7d3bae/data/sync-status", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const serverTimestamp = await kv.get(`user_${user.id}_last_modified`) || 0;
    const ownedGames = await kv.get(`user_${user.id}_owned`) || [];
    const wishlistGames = await kv.get(`user_${user.id}_wishlist`) || [];
    const playRecords = await kv.get(`user_play_records_${user.id}`) || [];

    return c.json({
      timestamp: serverTimestamp,
      ownedCount: ownedGames.length,
      wishlistCount: wishlistGames.length,
      playRecordsCount: playRecords.length,
      lastModified: serverTimestamp ? new Date(serverTimestamp).toISOString() : null,
    });
  } catch (error) {
    console.error('Sync status error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 🔒 Privacy settings: GET
app.get("/make-server-0b7d3bae/user/privacy", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const settings = await kv.get(`user_privacy_${user.id}`);
    const defaults = { showOwnedList: true, showOwnedTotal: false, showWishList: true, showWishTotal: false, showPlayRecords: false, showGameManagement: false };
    return c.json({ settings: { ...defaults, ...(settings || {}) } });
  } catch (e) {
    return c.json({ error: 'Failed to load privacy settings' }, 500);
  }
});

// 🔒 Privacy settings: POST
app.post("/make-server-0b7d3bae/user/privacy", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json();
    const allowed = ['showOwnedList','showOwnedTotal','showWishList','showWishTotal','showPlayRecords','showGameManagement'];
    const settings: Record<string, boolean> = {};
    for (const key of allowed) { if (typeof body[key] === 'boolean') settings[key] = body[key]; }
    const existing = await kvGetWithRetry(`user_privacy_${user.id}`) || {};
    await kvSetWithRetry(`user_privacy_${user.id}`, { ...existing, ...settings });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Failed to save privacy settings' }, 500);
  }
});

// 📤 Public: Get shared game list (no auth required)
app.get("/make-server-0b7d3bae/shared/:userId", async (c) => {
  try {
    const userId = c.req.param('userId');

    if (!userId) {
      console.error('❌ [Shared API] No userId provided');
      return c.json({ error: 'User ID is required' }, 400);
    }

    const [ownedGamesRaw, wishlistGamesRaw, profile, betaUser, privacyRaw] = await Promise.all([
      kv.get(`user_${userId}_owned`),
      kv.get(`user_${userId}_wishlist`),
      kv.get(`user_profile_${userId}`).catch(() => null),
      kv.get(`beta_user_${userId}`),
      kv.get(`user_privacy_${userId}`).catch(() => null),
    ]);

    const privacyDefaults = { showOwnedList: true, showOwnedTotal: false, showWishList: true, showWishTotal: false, showPlayRecords: false, showGameManagement: false };
    const privacy = { ...privacyDefaults, ...(privacyRaw || {}) };

    const userName = profile?.username || profile?.name || betaUser?.name || '게임 컬렉터';
    const profileImage = profile?.profileImage || null;

    // 보유 리스트 공개 처리
    let ownedGames: any[] = [];
    if (privacy.showOwnedList && Array.isArray(ownedGamesRaw)) {
      ownedGames = privacy.showOwnedTotal
        ? ownedGamesRaw
        : ownedGamesRaw.map(({ purchasePrice, ...rest }: any) => rest);
    }

    // 위시 리스트 공개 처리
    let wishlistGames: any[] = [];
    if (privacy.showWishList && Array.isArray(wishlistGamesRaw)) {
      wishlistGames = privacy.showWishTotal
        ? wishlistGamesRaw
        : wishlistGamesRaw.map(({ purchasePrice, ...rest }: any) => rest);
    }

    // 플레이 기록 통계
    let playStats: any = null;
    if (privacy.showPlayRecords && Array.isArray(ownedGamesRaw) && ownedGamesRaw.length > 0) {
      const raw = ownedGamesRaw as any[];
      const totalPlays = raw.reduce((s, g) => s + (g.playCount || 0), 0);
      const gamesWithPlays = raw.filter(g => (g.playCount || 0) > 0).length;
      const totalMinutes = raw.reduce((s, g) =>
        s + ((g.playRecords || []) as any[]).reduce((t: number, r: any) => t + (r.totalTime || 0), 0), 0);
      const topGames = [...raw]
        .filter(g => (g.playCount || 0) > 0)
        .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
        .slice(0, 5)
        .map(g => ({ name: g.koreanName || g.englishName || '이름 없음', playCount: g.playCount || 0, imageUrl: g.imageUrl || null }));
      playStats = { totalPlays, gamesWithPlays, totalMinutes, topGames, totalGames: raw.length };
    }

    // 게임 관리 현황 통계
    let managementStats: any = null;
    if (privacy.showGameManagement && Array.isArray(ownedGamesRaw) && ownedGamesRaw.length > 0) {
      const raw = ownedGamesRaw as any[];
      const total = raw.length;
      const sleeved = raw.filter(g => g.hasSleeve).length;
      const stored = raw.filter(g => g.hasStorage).length;
      const upgraded = raw.filter(g => g.hasComponentUpgrade).length;
      const condition: Record<string, number> = { S: 0, A: 0, B: 0, C: 0 };
      raw.forEach(g => { if (g.boxCondition && condition[g.boxCondition] !== undefined) condition[g.boxCondition]++; });
      managementStats = { total, sleeved, stored, upgraded, condition };
    }

    // 공개 게시물 조회 (비공개 제외)
    const allPostsData = await getByPrefix('beta_post_');
    const publicPosts = allPostsData
      .map((d: any) => d.value)
      .filter((p: any) => p && p.userId === userId && !p.isDraft && !p.isPrivate)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({
      success: true,
      userName,
      profileImage,
      games: ownedGames,
      wishlistGames,
      totalCount: Array.isArray(ownedGamesRaw) ? ownedGamesRaw.length : 0,
      posts: publicPosts,
      privacy,
      playStats,
      managementStats,
    });
  } catch (error) {
    logError('❌ [Shared API] Error loading shared game list:', error);
    return c.json({
      error: `Failed to load shared game list: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, 500);
  }
});


// 🏆 Public: 랭킹 API

// 🧮 커스텀 계산기 저장
app.post("/make-server-0b7d3bae/calculators", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const { calculator } = await c.req.json();
    if (!calculator) return c.json({ error: 'No calculator data' }, 400);

    await kv.set(`custom_calc_${user.id}_${calculator.id}`, { ...calculator, userId: user.id });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Failed to save calculator' }, 500);
  }
});

// 🧮 커스텀 계산기 목록 조회
app.get("/make-server-0b7d3bae/calculators", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const items = await getByPrefix(`custom_calc_${user.id}_`);
    const calculators = items.map((d: any) => d.value).filter(Boolean);
    return c.json({ calculators });
  } catch (e) {
    return c.json({ calculators: [] });
  }
});

// 🧮 커스텀 계산기 삭제

// 🧮 공개된 승인 계산기 목록 (인증 불필요)
app.get("/make-server-0b7d3bae/calculators/public", async (c) => {
  try {
    const allCalcs = await getByPrefix('custom_calc_');
    const publicCalcs = allCalcs
      .map((d: any) => d.value)
      .filter((c: any) => c && c.approved === true);
    return c.json({ calculators: publicCalcs });
  } catch (e) {
    return c.json({ calculators: [] });
  }
});

app.delete("/make-server-0b7d3bae/calculators/:calcId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const calcId = c.req.param('calcId');
    await kv.del(`custom_calc_${user.id}_${calcId}`);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Failed to delete calculator' }, 500);
  }
});

// 🧮 관리자: 공개 요청 계산기 전체 조회
app.get("/make-server-0b7d3bae/admin/calculators", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    // 관리자 확인
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    // 모든 커스텀 계산기 조회
    const allCalcs = await getByPrefix('custom_calc_');
    const calculators = allCalcs
      .map((d: any) => d.value)
      .filter((c: any) => c && c.shareRequested);

    return c.json({ calculators });
  } catch (e) {
    return c.json({ calculators: [] });
  }
});

// 🧮 관리자: 계산기 승인
app.post("/make-server-0b7d3bae/admin/calculators/approve", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const { calcId, userId } = await c.req.json();
    const key = `custom_calc_${userId}_${calcId}`;
    const calc = await kv.get(key);
    if (!calc) return c.json({ error: 'Not found' }, 404);

    await kv.set(key, { ...calc, approved: true });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Failed' }, 500);
  }
});

// 🧮 관리자: 계산기 반려 (공개요청 취소)
app.post("/make-server-0b7d3bae/admin/calculators/reject", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const { calcId, userId } = await c.req.json();
    const key = `custom_calc_${userId}_${calcId}`;
    const calc = await kv.get(key);
    if (!calc) return c.json({ error: 'Not found' }, 404);

    await kv.set(key, { ...calc, shareRequested: false, approved: false });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Failed' }, 500);
  }
});


app.get("/make-server-0b7d3bae/ranking", async (c) => {
  try {
    // 5분 캐시
    const cached = await kv.get('ranking_cache');
    if (cached?.data && cached.cachedAt && (Date.now() - cached.cachedAt) < 5 * 60 * 1000) {
      return c.json(cached.data);
    }
    // 모든 베타 유저 목록 가져오기
    const betaUsers = await getByPrefix('beta_user_');
    const approvedUsers = betaUsers
      .map((d: any) => d.value)
      .filter((u: any) => u && u.status === 'approved' && u.userId);

    const results = await Promise.all(
      approvedUsers.map(async (user: any) => {
        try {
          // 개별 키 방식으로 로드 시도, 없으면 legacy
          const ownedGames = await loadGamesForStats(user.userId, 'owned');

          const totalGames = ownedGames.length;
          const totalPlayCount = ownedGames.reduce((sum: number, g: any) =>
            sum + (g.playCount || 0), 0);
          const totalSpent = ownedGames
            .filter((g: any) => g.purchasePrice != null && g.purchasePrice > 0)
            .reduce((sum: number, g: any) => sum + (g.purchasePrice || 0), 0);

          // 이름 마스킹: 가운데 한 글자만 *로 대체
          const realName = user.name || user.email?.split('@')[0] || '익명';
          const maskedName = realName.length <= 1
            ? realName
            : realName.length === 2
            ? realName[0] + '*'
            : realName[0] + '*'.repeat(1) + realName.slice(2);

          return {
            userId: user.userId,
            nickname: maskedName,
            totalGames,
            totalPlayCount,
            totalSpent,
          };
        } catch {
          return null;
        }
      })
    );

    const valid = results.filter(Boolean);

    const result = {
      byGames: [...valid].sort((a: any, b: any) => b.totalGames - a.totalGames).slice(0, 50),
      byPlayCount: [...valid].sort((a: any, b: any) => b.totalPlayCount - a.totalPlayCount).slice(0, 50),
      bySpent: [...valid].filter((u: any) => u.totalSpent > 0).sort((a: any, b: any) => b.totalSpent - a.totalSpent).slice(0, 50),
    };
    // 결과 캐시
    await kv.set('ranking_cache', { data: result, cachedAt: Date.now() });
    return c.json(result);
  } catch (error) {
    console.error('Ranking error:', error);
    return c.json({ error: 'Failed to load ranking' }, 500);
  }
});

// ==================== Analytics API Endpoints (방문 통계) ====================

// 방문 기록 API (모든 사용자 - 익명 포함)
app.post("/make-server-0b7d3bae/analytics/visit", async (c) => {
  try {
    const { timestamp, userId, userEmail, sessionId, pathname, userAgent, isAnonymous } = await c.req.json();


    // 방문 기록 저장 (즉시 응답하기 위해 await 없음 - fire and forget)
    const visitKey = `analytics_visit_${sessionId}_${timestamp}`;
    kv.set(visitKey, { timestamp, userId, userEmail, sessionId, pathname, userAgent, isAnonymous })
      .catch(err => logError('Failed to save visit:', err));

    // 누적 카운터 증가 (fire and forget)
    kv.get('analytics_total_visits_counter')
      .then((current: number | null) => {
        return kv.set('analytics_total_visits_counter', (current || 0) + 1);
      })
      .catch(err => logError('Failed to update visit counter:', err));

    // 즉시 성공 응답 반환 (KV 저장 완료 대기 안함)
    return c.json({ success: true });
  } catch (error) {
    logError('Record visit error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 통계 조회 API (관리자 전용) - KV Store 기반
app.get("/make-server-0b7d3bae/analytics/stats", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const isAdmin = user.email === 'sityplanner2@naver.com';
    
    if (!isAdmin) {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }


    // 오늘 00:00:00 타임스탬프 (UTC 기준)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayTimestamp = todayStart.getTime();
    
    devLog('📅 [Date Range]', {
      now: now.toISOString(),
      todayStart: todayStart.toISOString(),
      todayTimestamp
    });

    // ==================== 1. 방문자 통계 ====================
    const allVisitsData = await getByPrefix('analytics_visit_');
    if (allVisitsData.length > 0) {
    }
    
    const allVisits = allVisitsData.map(item => {
      let value = item.value;
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch (e) {}
      }
      return value;
    }).filter(v => v && typeof v === 'object');
    
    
    // 전체 방문자: 누적 카운터 사용 (KV 만료로 사라진 기록도 포함)
    const persistedCounter = await kv.get('analytics_total_visits_counter') as number | null;
    const totalVisits = Math.max(persistedCounter || 0, allVisits.length);
    const uniqueVisitors = new Set(allVisits.map((v: any) => v?.userId).filter(Boolean)).size;
    
    // 오늘 방문자
    const todayVisits = allVisits.filter((v: any) => {
      const ts = v?.timestamp || 0;
      return ts >= todayTimestamp;
    });
    const todayVisitsCount = todayVisits.length;
    const todayUniqueVisitors = new Set(todayVisits.map((v: any) => v?.userId).filter(Boolean)).size;

    console.log('📊 [Visit Stats]', { 
      rawRecords: allVisitsData.length,
      totalVisits,
      uniqueVisitors,
      todayVisitsCount,
      todayUniqueVisitors
    });

    // ==================== 2. 사용자 통계 ====================
    const allBetaUsersData = await getByPrefix('beta_user_');
    if (allBetaUsersData.length > 0) {
    }
    
    const allBetaUsers = allBetaUsersData.map(item => {
      let value = item.value;
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch (e) {}
      }
      return value;
    }).filter(u => u && typeof u === 'object');
    
    
    // 전체 가입자
    const totalUsers = allBetaUsers.length;
    const approvedUsers = allBetaUsers.filter((u: any) => u?.status === 'approved').length;
    const pendingUsers = allBetaUsers.filter((u: any) => u?.status === 'pending').length;
    
    // 오늘 가입자 (created_at 기준)
    const todayUsers = allBetaUsers.filter((u: any) => {
      if (!u?.created_at) return false;
      try {
        const createdTime = new Date(u.created_at).getTime();
        return createdTime >= todayTimestamp;
      } catch (e) {
        return false;
      }
    });
    const todayUsersCount = todayUsers.length;

    console.log('📊 [User Stats]', { 
      rawRecords: allBetaUsersData.length,
      totalUsers, 
      approvedUsers, 
      pendingUsers,
      todayUsersCount
    });

    // ==================== 3. 게임 리스트 통계 ====================
    const allUserKeysData = await getByPrefix('user_');
    
    let totalOwnedGames = 0;
    let totalWishlistGames = 0;
    let todayOwnedGames = 0;
    let todayWishlistGames = 0;
    
    // 각 사용자별로 last_modified 확인
    const userGameData: Record<string, { owned: any[], wishlist: any[], lastModified: number }> = {};
    
    for (const item of allUserKeysData) {
      // Extract user ID from key (user_UUID_owned or user_UUID_wishlist)
      const match = item.key.match(/user_([a-f0-9\-]{36})_(owned|wishlist|last_modified)/i);
      if (!match) continue;
      
      const userId = match[1];
      const keyType = match[2];
      
      if (!userGameData[userId]) {
        userGameData[userId] = { owned: [], wishlist: [], lastModified: 0 };
      }
      
      // Parse JSON string if necessary
      let value = item.value;
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch (e) {}
      }
      
      if (keyType === 'owned' && !item.key.includes('_backup')) {
        userGameData[userId].owned = Array.isArray(value) ? value : [];
        totalOwnedGames += userGameData[userId].owned.length;
      } else if (keyType === 'wishlist' && !item.key.includes('_backup')) {
        userGameData[userId].wishlist = Array.isArray(value) ? value : [];
        totalWishlistGames += userGameData[userId].wishlist.length;
      } else if (keyType === 'last_modified') {
        userGameData[userId].lastModified = typeof value === 'number' ? value : 0;
      }
    }
    
    
    // 오늘 등록된 게임 (last_modified 기준)
    for (const userId in userGameData) {
      const userData = userGameData[userId];
      if (userData.lastModified >= todayTimestamp) {
        todayOwnedGames += userData.owned.length;
        todayWishlistGames += userData.wishlist.length;
      }
    }

    // ==================== 4. 접속 중인 사용자 (최근 5분 이내) ====================
    const allActiveUsersData = await getByPrefix('analytics_active_');
    const currentActiveUsers = allActiveUsersData.filter((item: any) => {
      let value = item.value;
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch (e) {}
      }
      if (!value?.lastSeen) return false;
      const lastSeen = new Date(value.lastSeen);
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      return lastSeen >= fiveMinutesAgo;
    }).length;

    console.log('📊 [Game Stats]', { 
      rawRecords: allUserKeysData.length,
      totalOwnedGames, 
      totalWishlistGames,
      todayOwnedGames,
      todayWishlistGames,
      totalUsers: Object.keys(userGameData).length,
      currentActiveUsers
    });

    const stats = {
      // 방문자 통계
      totalVisits,           // 전체 방문 수
      uniqueVisitors,        // 전체 고유 방문자
      todayVisitsCount,      // 오늘 방문 수
      todayUniqueVisitors,   // 오늘 고유 방문자
      // 사용자 통계
      totalUsers,            // 전체 가입자
      approvedUsers,         // 승인된 테스터
      pendingUsers,          // 승인 대기
      todayUsersCount,       // 오늘 가입자
      // 게임 리스트 통계
      totalOwnedGames,       // 전체 보유 게임
      totalWishlistGames,    // 전체 위시리스트 게임
      todayOwnedGames,       // 오늘 등록된 보유 게임
      todayWishlistGames,    // 오늘 등록된 위시리스트 게임
      // 현재 접속 인원
      currentActiveUsers,
    };

    
    return c.json(stats);
  } catch (error) {
    logError('Get analytics stats error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ==================== DEBUG: Analytics Key Inspector (관리자 전용) - DUPLICATE REMOVED ====================
// This endpoint is duplicated below at line 4450 - skipping this version to avoid syntax errors
/*
app.get("/make-server-0b7d3bae/analytics/debug", async (c) => {

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const isAdmin = user.email === 'sityplanner2@naver.com';
    
    if (!isAdmin) {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }

    // KV store에서 모든 방문 기록 조회
    const allVisitsData = await getByPrefix('analytics_visit_');
    const allVisits = allVisitsData.map(item => item.value);
    

    // 타임스탬프로 정렬 (최신순)
    const sortedVisits = allVisits
      .filter((v: any) => v && v.timestamp)
      .sort((a: any, b: any) => b.timestamp - a.timestamp);

    // ==================== 1. 방문 통계 ====================
    const totalVisits = sortedVisits.length;
    const uniqueUsers = new Set(sortedVisits.map((v: any) => v.userId)).size;

    // 오늘 방문 (UTC 기준 수정)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayTimestamp = today.getTime();
    const todayVisits = sortedVisits.filter((v: any) => v.timestamp >= todayTimestamp).length;

    devLog('📊 Date check:', {
      now: now.toISOString(),
      today: today.toISOString(),
      todayTimestamp,
      sampleTimestamp: sortedVisits[0]?.timestamp,
      todayVisitsCount: todayVisits,
    });

    // ==================== 2. 사용자 통계 ====================
    // 모든 베타 신청자 (pending + approved)
    const allBetaTestersData = await getByPrefix('beta_tester_');
    const allBetaTesters = allBetaTestersData.map(item => item.value);
    const totalUsers = allBetaTesters.length;
    const approvedUsers = allBetaTesters.filter((t: any) => t.status === 'approved').length;

    // ==================== 3. 게�� 리스트 통계 ====================
    // 모든 사용자의 보유 리스트
    const ownedGamesData = await getByPrefix('games_owned_');
    let totalOwnedGames = 0;
    for (const item of ownedGamesData) {
      if (Array.isArray(item.value)) {
        totalOwnedGames += item.value.length;
      }
    }

    // 모든 사용자의 구매 예정 리스트
    const wishlistGamesData = await getByPrefix('games_wishlist_');
    let totalWishlistGames = 0;
    for (const item of wishlistGamesData) {
      if (Array.isArray(item.value)) {
        totalWishlistGames += item.value.length;
      }
    }

    // 최근 7일 일별 통계
    const last7Days: any[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
      
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const dayVisits = sortedVisits.filter((v: any) => 
        v.timestamp >= dayStart.getTime() && v.timestamp <= dayEnd.getTime()
      );
      
      const dayUniqueUsers = new Set(dayVisits.map((v: any) => v.userId)).size;
      
      last7Days.unshift({
        date: dateStr,
        visits: dayVisits.length,
        uniqueUsers: dayUniqueUsers,
      });
    }

    // 최근 30일 일�� 통계
    const last30Days: any[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
      
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const dayVisits = sortedVisits.filter((v: any) => 
        v.timestamp >= dayStart.getTime() && v.timestamp <= dayEnd.getTime()
      );
      
      const dayUniqueUsers = new Set(dayVisits.map((v: any) => v.userId)).size;
      
      last30Days.unshift({
        date: dateStr,
        visits: dayVisits.length,
        uniqueUsers: dayUniqueUsers,
      });
    }

    // 최근 100건 방문 기록
    const recentVisits = sortedVisits.slice(0, 100);

    const stats = {
      // 방문 통계
      totalVisits,
      uniqueUsers,
      todayVisits,
      last7Days,
      last30Days,
      recentVisits,
      // 사용자 통계 (NEW)
      totalUsers,      // 전체 가입자 (승인 대기 포함)
      approvedUsers,   // 승인된 베타 테스터
      // 게임 리스트 통계 (NEW)
      totalOwnedGames,    // 보유 리스트 총 게임 수
      totalWishlistGames, // 구매 예정 리스트 총 게임 수
    };

    devLog('📊 Stats calculated:', {
      totalVisits,
      uniqueUsers,
      todayVisits,
      totalUsers,
      approvedUsers,
      totalOwnedGames,
      totalWishlistGames,
      last7DaysCount: last7Days.length,
      last30DaysCount: last30Days.length,
      recentVisitsCount: recentVisits.length,
    });
    
    return c.json(stats);
  } catch (error) {
    logError('Get analytics stats error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
*/

// ==================== DEBUG: Analytics Key Inspector (관리자 전용) ====================
app.get("/make-server-0b7d3bae/analytics/debug", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const isAdmin = user.email === 'sityplanner2@naver.com';
    
    if (!isAdmin) {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }

    // KV store에서 모든 analytics 키 조회
    const allVisitsData = await getByPrefix('analytics_visit_');
    
    allVisitsData.slice(0, 5).forEach((item: any) => {
    });

    const debugInfo = {
      totalKeys: allVisitsData.length,
      sampleKeys: allVisitsData.slice(0, 10).map((item: any) => ({
        key: item.key,
        value: item.value,
      })),
      allKeys: allVisitsData.map((item: any) => item.key),
    };

    return c.json(debugInfo);
  } catch (error) {
    logError('Analytics debug error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ==================== END: Analytics API Endpoints ====================

// 🔍 DEBUG: 홍야님 데이터 상세 조회 (관리자 전용)
app.get("/make-server-0b7d3bae/debug/hongya-data", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const isAdmin = user.email === 'sityplanner2@naver.com';
    
    if (!isAdmin) {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }

    const hongyaUserId = 'cc50eac9-0d05-43fa-bc62-0ea1eb712565';
    

    // 1. 모든 가능한 키 패턴 확인
    const keyPatterns = [
      `user_${hongyaUserId}_owned`,
      `user_${hongyaUserId}_wishlist`,
      `user_${hongyaUserId}_last_modified`,
      `user_${hongyaUserId}_owned_backup`,
      `user_${hongyaUserId}_slot1_owned`,
      `user_${hongyaUserId}_slot2_owned`,
      `user_${hongyaUserId}_slot3_owned`,
      `games_owned_${hongyaUserId}`,  // 혹시 이전 형식
      `games_wishlist_${hongyaUserId}`, // 혹시 이전 형식
    ];

    const results: any = {
      userId: hongyaUserId,
      timestamp: new Date().toISOString(),
      keys: {}
    };

    // 2. 각 키별로 데이터 조회
    for (const key of keyPatterns) {
      try {
        const { data, error } = await supabase
          .from("kv_store_0b7d3bae")
          .select("value")
          .eq("key", key)
          .maybeSingle();

        if (error || !data) {
          results.keys[key] = { exists: false };
        } else {
          const isArray = Array.isArray(data.value);
          const length = isArray ? data.value.length : 0;
          const isNestedArray = isArray && data.value.length > 0 && Array.isArray(data.value[0]);
          
          
          if (isNestedArray) {
          }
          
          if (isArray && length > 0) {
          }

          results.keys[key] = {
            exists: true,
            type: typeof data.value,
            isArray,
            length,
            isNestedArray,
            nestedLength: isNestedArray ? data.value[0]?.length : null,
            totalIfFlattened: isNestedArray ? data.value.reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0) : null,
            firstItemPreview: isArray && length > 0 ? JSON.stringify(data.value[0]).substring(0, 200) : null,
            sampleData: length > 0 && length <= 3 ? data.value : null,
          };
        }
      } catch (e) {
        results.keys[key] = { exists: false, error: String(e) };
      }
    }

    // 3. 모든 user_ prefix 키 조회 (혹시 다른 키가 있는지)
    const allUserKeys = await getByPrefix(`user_${hongyaUserId}`);
    
    results.allUserKeys = allUserKeys.map(item => ({
      key: item.key,
      type: typeof item.value,
      isArray: Array.isArray(item.value),
      length: Array.isArray(item.value) ? item.value.length : null,
    }));

    allUserKeys.forEach((item: any) => {
    });

    // 4. kv.get() 함수로 조회해보기
    const kvOwnedKey = `user_${hongyaUserId}_owned`;
    const kvResult = await kv.get(kvOwnedKey);
    
    
    results.kvGetTest = {
      key: kvOwnedKey,
      type: typeof kvResult,
      isArray: Array.isArray(kvResult),
      length: Array.isArray(kvResult) ? kvResult.length : null,
      firstItem: Array.isArray(kvResult) && kvResult.length > 0 ? kvResult[0] : null,
    };


    return c.json(results);
  } catch (error) {
    console.error('❌ [HONGYA DEBUG] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 🚑 RECOVERY: 홍야님 데이터 복구 (백업에서 복원, 관리자 전용)
app.post("/make-server-0b7d3bae/admin/hongya-recovery", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const isAdmin = user.email === 'sityplanner2@naver.com';
    
    if (!isAdmin) {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }

    const hongyaUserId = 'cc50eac9-0d05-43fa-bc62-0ea1eb712565';
    

    // 1. 모든 백업 키 조회
    const allBackupKeys = await getByPrefix(`user_${hongyaUserId}`);
    
    
    const backupData: any = {};
    let bestBackup: { key: string; data: any; count: number } | null = null;
    
    for (const item of allBackupKeys) {
      const isArray = Array.isArray(item.value);
      const length = isArray ? item.value.length : 0;
      const isNested = isArray && item.value.length > 0 && Array.isArray(item.value[0]);
      
      
      if (isArray && length > 0) {
        backupData[item.key] = {
          key: item.key,
          data: item.value,
          count: length,
          isNested,
          actualCount: isNested ? item.value.reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0) : length
        };
        
        // 가장 많은 데이터를 가진 백업 찾기
        const actualCount = isNested ? backupData[item.key].actualCount : length;
        if (!bestBackup || actualCount > bestBackup.count) {
          bestBackup = {
            key: item.key,
            data: isNested ? item.value.flat() : item.value, // 중첩 배열 평탄화
            count: actualCount
          };
        }
      }
    }
    
    if (!bestBackup) {
      console.error('❌ [RECOVERY] No valid backup found!');
      return c.json({
        success: false,
        error: 'No backup data found',
        scannedKeys: allBackupKeys.length
      }, 404);
    }
    
    
    // 2. 메인 키에 복구
    const mainKey = `user_${hongyaUserId}_owned`;
    
    await kv.set(mainKey, bestBackup.data);
    
    // 3. 검증
    const verifyData = await kv.get(mainKey);
    const verifyCount = Array.isArray(verifyData) ? verifyData.length : 0;
    
    
    const success = verifyCount === bestBackup.count;
    
    if (success) {
    } else {
      console.error(`\n❌ [RECOVERY FAILED] Mismatch: saved ${bestBackup.count}, loaded ${verifyCount}`);
    }
    

    return c.json({
      success,
      sourceBackup: bestBackup.key,
      gamesRestored: bestBackup.count,
      verifiedCount: verifyCount,
      allBackupsFound: Object.keys(backupData),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [HONGYA RECOVERY] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 🔍 SUPER SCAN: 전체 DB에서 327개 데이터 찾기 (관리자 전용)
app.get("/make-server-0b7d3bae/admin/hongya-super-scan", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const isAdmin = user.email === 'sityplanner2@naver.com';
    
    if (!isAdmin) {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }

    const hongyaUserId = 'cc50eac9-0d05-43fa-bc62-0ea1eb712565';
    

    // 1. 전체 KV Store 스캔 (홍야님 관련만)
    
    const { data: allRows, error: scanError } = await supabase
      .from('kv_store_0b7d3bae')
      .select('key, value');
    
    if (scanError) {
      throw new Error(`DB scan failed: ${scanError.message}`);
    }
    
    
    // 2. 모든 사��자별 게임 개수 통계
    
    const userStats: { [userId: string]: { owned: number; wishlist: number; keys: string[] } } = {};
    let totalOwnedGames = 0;
    let totalWishlistGames = 0;
    
    for (const row of allRows || []) {
      // user_<userId>_owned 또는 user_<userId>_wishlist 패턴 찾기
      const ownedMatch = row.key.match(/^user_([a-f0-9-]+)_owned$/);
      const wishlistMatch = row.key.match(/^user_([a-f0-9-]+)_wishlist$/);
      
      if (ownedMatch) {
        const userId = ownedMatch[1];
        if (!userStats[userId]) {
          userStats[userId] = { owned: 0, wishlist: 0, keys: [] };
        }
        
        const isArray = Array.isArray(row.value);
        const count = isArray ? row.value.length : 0;
        userStats[userId].owned = count;
        userStats[userId].keys.push(row.key);
        totalOwnedGames += count;
        
      }
      
      if (wishlistMatch) {
        const userId = wishlistMatch[1];
        if (!userStats[userId]) {
          userStats[userId] = { owned: 0, wishlist: 0, keys: [] };
        }
        
        const isArray = Array.isArray(row.value);
        const count = isArray ? row.value.length : 0;
        userStats[userId].wishlist = count;
        userStats[userId].keys.push(row.key);
        totalWishlistGames += count;
      }
    }
    
    
    // 3. 홍야님 관련 키만 필터링
    const hongyaKeys = allRows?.filter((row: any) => 
      row.key.includes(hongyaUserId) || 
      row.key.includes('hongya') ||
      row.key.includes('cc50eac9')
    ) || [];
    
    
    // 3. 각 키 분석
    const analysis: any[] = [];
    let foundTarget: any = null;
    
    for (const row of hongyaKeys) {
      const isArray = Array.isArray(row.value);
      const length = isArray ? row.value.length : 0;
      const isNested = isArray && length > 0 && Array.isArray(row.value[0]);
      const actualCount = isNested 
        ? row.value.reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
        : length;
      
      const info = {
        key: row.key,
        type: typeof row.value,
        isArray,
        length,
        isNested,
        actualCount,
        hasTarget: actualCount >= 300 && actualCount <= 350, // 300~350 사이
      };
      
      if (isNested) {
      }
      if (info.hasTarget) {
        foundTarget = {
          ...info,
          sampleData: isArray && length > 0 ? row.value.slice(0, 2) : null,
        };
      }
      
      analysis.push(info);
    }
    
    // 4. 다른 사용자 키도 확인 (혹시 잘못 저장되었을 경우)
    
    const otherLargeArrays = allRows?.filter((row: any) => {
      if (row.key.includes(hongyaUserId)) return false; // 이미 체크함
      
      const isArray = Array.isArray(row.value);
      if (!isArray) return false;
      
      const length = row.value.length;
      const isNested = length > 0 && Array.isArray(row.value[0]);
      const actualCount = isNested 
        ? row.value.reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
        : length;
      
      return actualCount >= 300 && actualCount <= 350;
    }) || [];
    
    
    const otherArraysInfo = otherLargeArrays.map((row: any) => {
      const isArray = Array.isArray(row.value);
      const length = isArray ? row.value.length : 0;
      const isNested = isArray && length > 0 && Array.isArray(row.value[0]);
      const actualCount = isNested 
        ? row.value.reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
        : length;
      
      
      return {
        key: row.key,
        isArray,
        length,
        isNested,
        actualCount,
        sampleItem: isArray && length > 0 ? row.value[0] : null,
      };
    });
    
    
    // 6. 546개 게임 이론 검증
    const EXPECTED_TOTAL_REGISTERED_GAMES = 546;
    const missingGames = EXPECTED_TOTAL_REGISTERED_GAMES - totalOwnedGames;
    
    
    
    return c.json({
      success: true,
      totalKeysScanned: allRows?.length || 0,
      hongyaKeysFound: hongyaKeys.length,
      userStats,
      totalOwnedGames,
      totalWishlistGames,
      expectedTotal: EXPECTED_TOTAL_REGISTERED_GAMES,
      missingGames,
      theoryMatch: Math.abs(missingGames - 327) <= 20,
      analysis,
      targetFound: !!foundTarget,
      targetData: foundTarget,
      suspiciousOtherKeys: otherArraysInfo,
      recommendation: foundTarget 
        ? `Found potential target in key: ${foundTarget.key}` 
        : otherArraysInfo.length > 0
        ? `No data under Hongya's keys, but found ${otherArraysInfo.length} suspicious keys under OTHER user IDs`
        : missingGames > 300
        ? `🚨 CRITICAL: ${missingGames} games are MISSING! This confirms Hongya's data (327 games) is NOT being loaded.`
        : 'No 327-game data found in entire database. Data may have been lost.',
    });
    
  } catch (error) {
    console.error('❌ [SUPER SCAN] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ==================== 🆕 Admin: Manual Migration to Individual Keys ====================
app.post("/make-server-0b7d3bae/admin/migrate-individual-keys", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') {
      return c.json({ error: 'Forbidden: Admin only' }, 403);
    }
    
    
    // Get all beta users
    const allBetaUsersData = await getByPrefix('beta_user_');
    const userIds = allBetaUsersData.map(item => {
      const value = item.value;
      return value?.userId;
    }).filter(Boolean);
    
    
    const results = {
      total: userIds.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      details: [] as any[]
    };
    
    for (const userId of userIds) {
      try {
        
        // Check if already migrated
        const individualKeys = await getByPrefix(`user_${userId}_game_`);
        
        if (individualKeys.length > 0) {
          results.skipped++;
          results.details.push({
            userId,
            status: 'skipped',
            reason: 'already_migrated',
            existingKeys: individualKeys.length
          });
          continue;
        }
        
        // Migrate
        await migrateToIndividualKeys(userId);
        
        // Verify
        const afterKeys = await getByPrefix(`user_${userId}_game_`);
        
        results.successful++;
        results.details.push({
          userId,
          status: 'success',
          individualKeysSaved: afterKeys.length
        });
        
      } catch (error) {
        console.error(`   ❌ Failed to migrate user ${userId}:`, error);
        results.failed++;
        results.details.push({
          userId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    
    return c.json({
      success: true,
      results
    });
    
  } catch (error) {
    console.error('❌ [MIGRATION] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 팝업 설정 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 팝업 설정 조회 (로그인 사용자 누구나)
app.get("/make-server-0b7d3bae/admin/popup-config", async (c) => {
  try {
    const config = await kv.get('popup_config');
    return c.json({ config: config || null });
  } catch (error) {
    console.error('Get popup config error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 팝업 설정 저장 (관리자만)
app.post("/make-server-0b7d3bae/admin/popup-config", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden: Admin only' }, 403);

    const { config } = await c.req.json();
    if (!config) return c.json({ error: 'config is required' }, 400);

    // updatedAt 갱신
    config.updatedAt = new Date().toISOString();

    await kv.set('popup_config', config);

    return c.json({ success: true, config });
  } catch (error) {
    console.error('Save popup config error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 실시간 접속자 추적 (Heartbeat)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Heartbeat 수신 (로그인 사용자)
app.post("/make-server-0b7d3bae/presence/heartbeat", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const now = Date.now();
    const key = `presence_${user.id}`;

    await kv.set(key, {
      userId: user.id,
      email: user.email,
      lastSeen: now,
    });

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 현재 접속자 조회 (관리자)
app.get("/make-server-0b7d3bae/presence/online", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const allPresence = await getByPrefix('presence_');
    const now = Date.now();
    const ONLINE_THRESHOLD = 3 * 60 * 1000; // 3분

    const onlineUsers = allPresence
      .map(({ value }) => value)
      .filter(p => p && now - (p.lastSeen || 0) < ONLINE_THRESHOLD)
      .sort((a, b) => b.lastSeen - a.lastSeen);

    return c.json({ 
      count: onlineUsers.length,
      users: onlineUsers,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 월드컵 결과 공유 API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 월드컵 결과 저장 (짧은 ID 생성)
app.post("/make-server-0b7d3bae/wc/save", async (c) => {
  try {
    const body = await c.req.json();
    const { winner, top8 } = body;

    if (!winner || !top8) {
      return c.json({ error: 'Invalid data' }, 400);
    }

    // 랜덤 6자리 ID 생성 (소문자 + 숫자)
    const generateId = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let id = '';
      for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
      return id;
    };

    let shareId = generateId();
    let attempts = 0;
    
    // ID 중복 방지 (최대 10회 시도)
    while (attempts < 10) {
      const existing = await kv.get(`wc_result:${shareId}`);
      if (!existing) break;
      shareId = generateId();
      attempts++;
    }

    // 데이터 저장 (30일 후 자동 삭제)
    const data = {
      winner,
      top8,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    await kv.set(`wc_result:${shareId}`, data);

    return c.json({ shareId, url: `${shareId}` });
  } catch (error) {
    console.error('❌ [WC Save] Error:', error);
    return c.json({ error: 'Failed to save result' }, 500);
  }
});

// 월드컵 결과 조회 (로그인 불필요)
app.get("/make-server-0b7d3bae/wc/load/:shareId", async (c) => {
  try {
    const shareId = c.req.param('shareId');
    
    if (!shareId || shareId.length !== 6) {
      return c.json({ error: 'Invalid share ID' }, 400);
    }

    const data = await kv.get(`wc_result:${shareId}`);

    if (!data) {
      return c.json({ error: 'Result not found or expired' }, 404);
    }

    return c.json(data);
  } catch (error) {
    console.error('❌ [WC Load] Error:', error);
    return c.json({ error: 'Failed to load result' }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



// 관리자 전용: 샘플 게임 키 디버그 확인
app.get("/make-server-0b7d3bae/admin/debug-games", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin") return c.json({ error: "Admin only" }, 403);

    const allKeys = await kv.getByPrefixWithKeys("user_");
    const gameKeys = allKeys.filter((item: any) =>
      /^user_[a-f0-9-]{36}_game_/i.test(item.key)
    );

    const total = gameKeys.length;
    const withBggId = gameKeys.filter((item: any) => item.value?.bggId).length;
    const withoutBggId = gameKeys.filter((item: any) => !item.value?.bggId).length;

    // 샘플 5개
    const samples = gameKeys.slice(0, 5).map((item: any) => ({
      key: item.key,
      bggId: item.value?.bggId,
      koreanName: item.value?.koreanName,
      recommendedPlayers: item.value?.recommendedPlayers,
      listType: item.value?.listType,
    }));

    // bggId 있는 것 중 BGG 캐시 있는 것
    let cacheHits = 0;
    for (const item of gameKeys.slice(0, 20)) {
      if (!item.value?.bggId) continue;
      const cached = await kv.get("bgg_details_" + item.value.bggId);
      if (cached?.minPlayers) cacheHits++;
    }

    return c.json({ total, withBggId, withoutBggId, cacheHitsIn20: cacheHits, samples });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// 관리자 전용: 가능 인원 마이그레이션 (배치)
app.post("/make-server-0b7d3bae/admin/migrate-player-counts", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin") return c.json({ error: "Admin only" }, 403);

    const rawBody = await c.req.text().catch(() => "{}");
    let bodyObj: any = {};
    try { bodyObj = JSON.parse(rawBody); } catch { bodyObj = {}; }
    const dryRun = bodyObj.dryRun !== false;
    const offset = Number(bodyObj.offset) || 0;
    const limit = Number(bodyObj.limit) || 50;


    const allKeys = await kv.getByPrefixWithKeys("user_");
    const gameKeys = allKeys.filter((item: any) =>
      /^user_[a-f0-9-]{36}_game_/i.test(item.key) && item.value?.bggId
    );

    const total = gameKeys.length;
    const batch = gameKeys.slice(offset, offset + limit);

    const stats = { total, offset, checked: 0, updated: 0, skipped: 0, failed: 0 };
    const preview: { game: string; before: string; after: string }[] = [];
    const bggCache: Record<string, string | null> = {};

    const getPlayers = async (bggId: string): Promise<string | null> => {
      if (bggId in bggCache) return bggCache[bggId];
      const kvCached = await kv.get("bgg_details_" + bggId);
      if (kvCached && kvCached.minPlayers) {
        const min = Number(kvCached.minPlayers);
        const max = Number(kvCached.maxPlayers) || min;
        const r = min === max ? (min + "명") : (min + "-" + max + "명");
        bggCache[bggId] = r;
        return r;
      }
      try {
        await new Promise<void>(r => setTimeout(r, 200));
        const res = await fetch("https://boardgamegeek.com/xmlapi2/thing?id=" + bggId);
        if (!res.ok) { bggCache[bggId] = null; return null; }
        const xml = await res.text();
        const minM = xml.match(/<minplayers[^>]*value="(\d+)"/);
        const maxM = xml.match(/<maxplayers[^>]*value="(\d+)"/);
        if (!minM) { bggCache[bggId] = null; return null; }
        const min = parseInt(minM[1]);
        const max = maxM ? parseInt(maxM[1]) : min;
        const r = min === max ? (min + "명") : (min + "-" + max + "명");
        bggCache[bggId] = r;
        const existing = kvCached || {};
        await kv.set("bgg_details_" + bggId, Object.assign({}, existing, { minPlayers: min, maxPlayers: max }), 604800);
        return r;
      } catch {
        bggCache[bggId] = null;
        return null;
      }
    };

    for (const item of batch) {
      const game = item.value;
      stats.checked++;
      const newPlayers = await getPlayers(String(game.bggId));
      if (!newPlayers) { stats.failed++; continue; }
      if (game.recommendedPlayers === newPlayers) { stats.skipped++; continue; }
      if (preview.length < 30) {
        preview.push({
          game: game.koreanName || game.englishName || "?",
          before: game.recommendedPlayers || "(없음)",
          after: newPlayers,
        });
      }
      if (!dryRun) {
        await kv.set(item.key, Object.assign({}, game, { recommendedPlayers: newPlayers }));
      }
      stats.updated++;
    }

    const hasMore = offset + limit < total;
    return c.json({ dryRun, hasMore, nextOffset: hasMore ? offset + limit : null, stats, preview,
      message: dryRun
        ? "[미리보기] " + stats.updated + "개 변경 예정"
        : stats.updated + "개 업데이트 완료 (" + (offset + limit) + "/" + total + ")",
    });
  } catch (error) {
    console.error("[MigratePC] Error:", error);
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

// ===== 공지 배너 엔드포인트 =====

// 공개 조회 (누구나 - anon key 포함)
app.get("/make-server-0b7d3bae/notices", async (c) => {
  try {
    const data = await kv.get("site_notices") as any[] | null;
    return c.json({ notices: data || [] });
  } catch {
    return c.json({ notices: [] });
  }
});

// 관리자 저장
app.post("/make-server-0b7d3bae/admin/notices", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin") return c.json({ error: "Admin only" }, 403);
    const body = await c.req.json();
    const notices = Array.isArray(body.notices) ? body.notices.slice(0, 10) : [];
    await kv.set("site_notices", notices);
    return c.json({ success: true, count: notices.length });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});


// ===== 게시물 공지 시스템 =====

// 공지 목록 + 읽음 여부 조회
app.get("/make-server-0b7d3bae/post-notices", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const noticeItems = await getByPrefix('notice_');
    const notices = noticeItems
      .map(item => item.value)
      .filter((n: any) => n?.postId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const announced = await kv.get('site_notice_announced_at') as any;
    const announcementActive = announced?.active === true;
    // 비로그인(anon key)이면 read tracking 없이 notices만 반환
    if (!token) return c.json({ notices, readIds: [], unreadCount: notices.length, announcementActive });
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ notices, readIds: [], unreadCount: notices.length, announcementActive });
    const readData = await kv.get(`user_notice_read_${user.id}`) as any;
    const readIds: string[] = readData?.readIds || [];
    const readSet = new Set(readIds);
    const unreadCount = notices.filter((n: any) => !readSet.has(n.postId)).length;
    return c.json({ notices, readIds, unreadCount, announcementActive });
  } catch { return c.json({ notices: [], readIds: [], unreadCount: 0, announcementActive: false }); }
});

// 읽지 않은 공지 수만 빠르게 조회
app.get("/make-server-0b7d3bae/post-notices/unread-count", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ count: 0, isNew: false });
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ count: 0, isNew: false });
    const noticeItems = await getByPrefix('notice_');
    const allIds = noticeItems.map(item => item.value?.postId).filter(Boolean);
    const readData = await kv.get(`user_notice_read_${user.id}`) as any;
    const readSet = new Set<string>(readData?.readIds || []);
    const count = allIds.filter((id: string) => !readSet.has(id)).length;
    const announced = await kv.get('site_notice_announced_at') as any;
    const isNew = !!(announced?.active === true && announced?.at && (!readData?.updatedAt || new Date(announced.at) > new Date(readData.updatedAt)));
    return c.json({ count, isNew });
  } catch { return c.json({ count: 0, isNew: false }); }
});

// 읽음 처리
app.post("/make-server-0b7d3bae/post-notices/read", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const { readIds } = await c.req.json();
    await kv.set(`user_notice_read_${user.id}`, { readIds, updatedAt: new Date().toISOString() });
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 공지 등록 (admin only)
app.post("/make-server-0b7d3bae/post-notices", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const { postId, title: customTitle } = await c.req.json();
    const post = await kv.get(`beta_post_${postId}`) as any;
    if (!post) return c.json({ error: '게시물을 찾을 수 없어요' }, 404);
    const notice = {
      postId,
      title: (customTitle && customTitle.trim()) ? customTitle.trim() : (post.content || '').slice(0, 60),
      content: post.content || '',
      showInFeed: true,
      createdAt: new Date().toISOString(),
      pinnedBy: user.id,
    };
    await kv.set(`notice_${postId}`, notice);
    return c.json({ success: true, notice });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// showInFeed 토글 / 제목 수정 (admin only)
app.patch("/make-server-0b7d3bae/post-notices/:postId", async (c) => {
  const { error } = await requireAdmin(c);
  if (error) return error;
  try {
    const postId = c.req.param('postId');
    const body = await c.req.json();
    const notice = await kv.get(`notice_${postId}`) as any;
    if (!notice) return c.json({ error: '공지가 없어요' }, 404);
    const updated: any = { ...notice };
    if (body.showInFeed !== undefined) updated.showInFeed = !!body.showInFeed;
    if (body.title !== undefined) updated.title = body.title;
    await kv.set(`notice_${postId}`, updated);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 최신글 알림 토글 (admin only) - N 뱃지 켜기/끄기
app.post("/make-server-0b7d3bae/post-notices/announce", async (c) => {
  const { error } = await requireAdmin(c);
  if (error) return error;
  try {
    const current = await kv.get('site_notice_announced_at') as any;
    const isCurrentlyActive = current?.active === true;
    if (isCurrentlyActive) {
      await kv.set('site_notice_announced_at', { ...current, active: false });
    } else {
      await kv.set('site_notice_announced_at', { at: new Date().toISOString(), active: true });
    }
    return c.json({ success: true, active: !isCurrentlyActive });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 공지 해제 (admin only)
app.delete("/make-server-0b7d3bae/post-notices/:postId", async (c) => {
  const { error } = await requireAdmin(c);
  if (error) return error;
  try {
    const postId = c.req.param('postId');
    await kv.del(`notice_${postId}`);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});


// ===== 추천 게임 엔드포인트 =====

// 공개 조회
app.get("/make-server-0b7d3bae/recommended-games", async (c) => {
  try {
    const data = await kv.get("site_recommended_games") as any[] | null;
    return c.json({ games: data || [] });
  } catch {
    return c.json({ games: [] });
  }
});

// ���리자 저장
app.post("/make-server-0b7d3bae/admin/recommended-games", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin") return c.json({ error: "Admin only" }, 403);
    const body = await c.req.json();
    const games = Array.isArray(body.games) ? body.games.slice(0, 20) : [];
    await kv.set("site_recommended_games", games);
    return c.json({ success: true, count: games.length });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});


// ===== 방출 게임 마켓 엔드포인트 =====

// 목록 조회


// ===== 알림 API =====

interface NotificationData {
  type: 'comment' | 'like' | 'follow' | 'points' | 'reply' | 'mention';
  fromUserId: string;
  fromUserName: string;
  postId?: string;
  postContent?: string;
  message: string;
}

// 댓글/게시물 텍스트에서 @username 멘션 추출
function extractMentions(text: string): string[] {
  const regex = /@([A-Za-z0-9가-힣_\-\.]+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1].toLowerCase());
  }
  return [...new Set(mentions)];
}

// username으로 beta_user_ 항목 찾아 실제 Auth userId 반환
async function findUserIdByUsername(username: string): Promise<string | null> {
  try {
    const allUsers = await getByPrefix('beta_user_');
    for (const item of allUsers) {
      const u = item.value;
      const uname = (u?.username || u?.name || '').toLowerCase();
      if (uname === username.toLowerCase()) {
        if (u.email) {
          const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 }).catch(() => ({ data: null }));
          const authUser = (data as any)?.users?.find((au: any) => au.email?.toLowerCase() === u.email.toLowerCase());
          if (authUser?.id) return authUser.id;
        }
        return u.userId || null;
      }
    }
  } catch {}
  return null;
}

async function createNotification(targetUserId: string, data: NotificationData) {
  const notifId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const notif = {
    id: notifId,
    targetUserId,
    ...data,
    read: false,
    createdAt: new Date().toISOString(),
  };
  await kv.set(`notif_${targetUserId}_${notifId}`, notif);
  return notif;
}

// 내 알림 목록 조회
app.get("/make-server-0b7d3bae/notifications", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const all = await getByPrefix(`notif_${user.id}_`);
    const notifs = all.map((n: any) => n.value).filter(Boolean);
    notifs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const unreadCount = notifs.filter((n: any) => !n.read).length;

    return c.json({ notifications: notifs.slice(0, 50), unreadCount });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown' }, 500);
  }
});

// 알림 모두 읽음 처리
app.post("/make-server-0b7d3bae/notifications/read-all", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const all = await getByPrefix(`notif_${user.id}_`);
    await Promise.all(all.map(async (n: any) => {
      if (n.value && !n.value.read) {
        await kv.set(n.key, { ...n.value, read: true });
      }
    }));

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown' }, 500);
  }
});

// ===== 팔로우 API =====

// 팔로우/언팔로우 토글
app.post("/make-server-0b7d3bae/follow/:targetUserId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const targetUserId = c.req.param('targetUserId');
    if (targetUserId === user.id) return c.json({ error: 'Cannot follow yourself' }, 400);

    const followKey = `follow_${user.id}_${targetUserId}`;
    const existing = await kv.get(followKey).catch(() => null);

    if (existing) {
      await kv.del(followKey);
      return c.json({ following: false });
    } else {
      await kv.set(followKey, { followerId: user.id, followingId: targetUserId, createdAt: new Date().toISOString() });
      return c.json({ following: true });
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// 팔로워/팔로잉 수 조회
app.get("/make-server-0b7d3bae/follow/stats/:targetUserId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const targetUserId = c.req.param('targetUserId');

    // 팔로워: 나를 팔로우하는 사람 (follow_*_targetUserId)
    const followers = await getByPrefix(`follow_`);
    const followerCount = followers.filter((f: any) => f.value?.followingId === targetUserId).length;
    const followingCount = followers.filter((f: any) => f.value?.followerId === targetUserId).length;
    const isFollowing = followers.some((f: any) => f.value?.followerId === user.id && f.value?.followingId === targetUserId);

    return c.json({ followerCount, followingCount, isFollowing });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});


// 팔로워 목록 조회
app.get("/make-server-0b7d3bae/follow/list/:targetUserId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const targetUserId = c.req.param('targetUserId');
    const type = c.req.query('type') || 'followers'; // 'followers' | 'following'

    const allFollows = await getByPrefix('follow_');

    let userIds: string[] = [];
    if (type === 'followers') {
      // targetUserId를 팔로우하는 사람들
      userIds = allFollows
        .filter((f: any) => f.value?.followingId === targetUserId)
        .map((f: any) => f.value?.followerId)
        .filter(Boolean);
    } else {
      // targetUserId가 팔로우하는 사람들
      userIds = allFollows
        .filter((f: any) => f.value?.followerId === targetUserId)
        .map((f: any) => f.value?.followingId)
        .filter(Boolean);
    }

    // 각 유저 프로필 조회
    const profiles = await Promise.all(userIds.map(async (uid: string) => {
      try {
        const p = await kv.get(`user_profile_${uid}`);
        return { userId: uid, username: p?.username || p?.name || uid.slice(0, 8), profileImage: p?.profileImage || null };
      } catch {
        return { userId: uid, username: uid.slice(0, 8), profileImage: null };
      }
    }));

    return c.json({ users: profiles });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});


// ===== 포인트/등급 API =====

// 포인트 적립 규칙: 글=10pt, 댓글=3pt, 하트받기=5pt
const POINT_RULES = { POST: 10, COMMENT: 3, LIKE_RECEIVED: 5 };

async function getUserPoints(userId: string) {
  try {
    const data = await kv.get(`user_points_${userId}`);
    return data || { points: 0, posts: 0, comments: 0, likesReceived: 0 };
  } catch { return { points: 0, posts: 0, comments: 0, likesReceived: 0 }; }
}

// 포인트로 tier 계산 (서버용 간이 버전)
function getTierFromPoints(points: number): number {
  if (points >= 15800) return 6; // 원로
  if (points >= 6800)  return 5; // 회사원  
  if (points >= 1600)  return 4; // 보린이 - 실제론 대딩이지만 서버는 단순화
  if (points >= 5600)  return 5;
  if (points >= 1600)  return 3;
  if (points >= 80)    return 2; // 유아
  return 1; // 애기
}

// 포인트로 전체 rank 인덱스 계산 (0~35)
function getRankIndexFromPoints(pts: { points: number; posts: number; comments: number; likesReceived: number }): number {
  const RAW_DATA: [number, number, number, number][] = [
    [0,0,0,0],[80,3,10,1],[200,6,25,3],[400,10,50,6],[700,15,80,10],[1100,22,120,15],
    [1600,30,170,20],[2200,40,230,28],[2900,52,300,38],[3700,65,380,50],[4600,80,470,63],[5600,97,570,78],
    [6800,115,680,95],[8200,135,800,115],[9800,157,930,138],[11600,180,1080,163],[13600,206,1240,191],[15800,234,1410,222],
    [18200,265,1590,256],[20800,298,1780,293],[23600,333,1980,333],[26600,370,2190,376],[29800,410,2410,422],[33200,452,2640,471],
    [36800,497,2880,523],[40600,544,3130,578],[44600,593,3390,636],[48800,645,3660,697],[53200,700,3940,761],[57800,757,4230,828],
    [62600,817,4530,898],[67600,879,4840,971],[72800,944,5160,1047],[78200,1011,5490,1126],[83800,1081,5830,1208],[89600,1153,6180,1293],
  ];
  let rankIdx = 0;
  for (let i = 0; i < RAW_DATA.length; i++) {
    const [p, po, c, l] = RAW_DATA[i];
    if (pts.points >= p && pts.posts >= po && pts.comments >= c && pts.likesReceived >= l) {
      rankIdx = i;
    }
  }
  return rankIdx;
}

// 레벨업 보상 카드 수 (tier 1=애기, 2=유아, 3=보린이, 4=대딩, 5=회사원, 6=원로)
const TIER_CARDS: Record<number, number> = { 1: 3, 2: 5, 3: 8, 4: 10, 5: 15, 6: 20 };
const TIER_NAMES: Record<number, string> = { 1: '애기', 2: '유아', 3: '보린이', 4: '대딩', 5: '회사원', 6: '원로' };

async function addPoints(userId: string, type: 'POST' | 'COMMENT' | 'LIKE_RECEIVED') {
  const current = await getUserPoints(userId);
  const gain = POINT_RULES[type];
  const updated = {
    points: current.points + gain,
    posts: type === 'POST' ? current.posts + 1 : current.posts,
    comments: type === 'COMMENT' ? current.comments + 1 : current.comments,
    likesReceived: type === 'LIKE_RECEIVED' ? current.likesReceived + 1 : current.likesReceived,
  };

  // 레벨업 감지
  const prevRankIdx = getRankIndexFromPoints(current);
  const newRankIdx = getRankIndexFromPoints(updated);

  if (newRankIdx > prevRankIdx) {
    // 이미 보상을 받은 rankIdx 목록을 KV에서 조회 (평생 1회 지급 보장)
    const claimedRanks: number[] = (await kv.get(`levelup_claimed_ranks_${userId}`).catch(() => null)) || [];
    const claimedSet = new Set(claimedRanks);

    // prevRankIdx+1 ~ newRankIdx 사이에서 아직 보상받지 않은 rank만 지급
    let totalCardsToGive = 0;
    const newlyClaimed: number[] = [];

    for (let rankIdx = prevRankIdx + 1; rankIdx <= newRankIdx; rankIdx++) {
      if (!claimedSet.has(rankIdx)) {
        const tier = Math.floor(rankIdx / 6) + 1;
        totalCardsToGive += TIER_CARDS[tier] ?? 3;
        newlyClaimed.push(rankIdx);
      }
    }

    if (totalCardsToGive > 0) {
      // 도달한 최상위 티어 이름 (알림에 표시)
      const newTier = Math.floor(newRankIdx / 6) + 1;
      const newTierName = TIER_NAMES[newTier] || `티어${newTier}`;
      const cardsPerRank = TIER_CARDS[newTier] ?? 3;

      try {
        const betaEntry = await kv.get(`beta_user_${userId}`).catch(() => null);
        const userEmail = betaEntry?.email;
        let levelupCardsBefore = 0;
        let levelupCardsAfter = 0;
        if (userEmail) {
          const currentCards = await readCardCountByEmail(userEmail, userId);
          levelupCardsBefore = currentCards;
          levelupCardsAfter = currentCards + totalCardsToGive;
          await writeCardCountByEmail(userEmail, levelupCardsAfter);
          console.log(`🎉 레벨업! userId=${userId} email=${userEmail} tier=${newTierName}(${newTier}) ranks=${newlyClaimed} 카드+${totalCardsToGive} (${currentCards}→${levelupCardsAfter})`);
        } else {
          const currentCards = await readCardCount(userId);
          levelupCardsBefore = currentCards;
          levelupCardsAfter = currentCards + totalCardsToGive;
          await writeCardCount(userId, levelupCardsAfter);
          console.log(`🎉 레벨업! userId=${userId} tier=${newTierName}(${newTier}) ranks=${newlyClaimed} 카드+${totalCardsToGive}`);
        }
        // 지급된 rankIdx를 영구 기록 (삭제 후 재레벨업 어뷰징 방지)
        await kv.set(`levelup_claimed_ranks_${userId}`, [...claimedRanks, ...newlyClaimed]);
        // ★ 레벨업 카드 이력 로그 저장
        try {
          const userLog: any[] = await kv.get(`bonus_card_log_${userId}`) || [];
          await kv.set(`bonus_card_log_${userId}`, [{
            type: 'levelup',
            source: `등급 달성 보상 (${newTierName} 등급)`,
            amount: totalCardsToGive,
            cardsBefore: levelupCardsBefore,
            cardsAfter: levelupCardsAfter,
            grantedAt: Date.now(),
            tierName: newTierName,
            tier: newTier,
            ranks: newlyClaimed,
          }, ...userLog].slice(0, 200));
        } catch {}
      } catch (cardErr) {
        console.error(`[레벨업 카드지급 오류] userId=${userId}:`, cardErr);
      }
      // 레벨업 알림 (티어명 + 카드 장수 안내)
      await createNotification(userId, {
        type: 'points',
        fromUserId: userId,
        fromUserName: '',
        message: `🎉 레벨업! [${newTierName}] 등급 보너스카드 ${totalCardsToGive}장 획득!`,
      }).catch(() => {});
    }
  }

  await kv.set(`user_points_${userId}`, updated);
  return updated;
}

async function removePoints(userId: string, type: 'POST' | 'COMMENT' | 'LIKE_RECEIVED') {
  const current = await getUserPoints(userId);
  const loss = POINT_RULES[type];
  const updated = {
    points: Math.max(0, current.points - loss),
    posts: type === 'POST' ? Math.max(0, current.posts - 1) : current.posts,
    comments: type === 'COMMENT' ? Math.max(0, current.comments - 1) : current.comments,
    likesReceived: type === 'LIKE_RECEIVED' ? Math.max(0, current.likesReceived - 1) : current.likesReceived,
  };
  await kv.set(`user_points_${userId}`, updated);
  return { updated, loss };
}

// 내 포인트 조회
app.get("/make-server-0b7d3bae/points/me", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const data = await getUserPoints(user.id);
    return c.json(data);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown' }, 500);
  }
});

// 특정 유저 포인트 조회
app.get("/make-server-0b7d3bae/points/:userId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const data = await getUserPoints(c.req.param('userId'));
    return c.json(data);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown' }, 500);
  }
});

app.get("/make-server-0b7d3bae/market/listings", async (c) => {
  try {
    const listings = await kv.get("market_listings") as any[] | null;
    return c.json({ listings: listings || [] });
  } catch { return c.json({ listings: [] }); }
});

// 등록
app.post("/make-server-0b7d3bae/market/listings", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const listings = (await kv.get("market_listings") as any[] | null) || [];
    const newListing = {
      ...body,
      id: `listing_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId: user.id,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    listings.unshift(newListing);
    await kv.set("market_listings", listings);
    return c.json({ success: true, listing: newListing });
  } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Unknown" }, 500); }
});

// 거래 완료 처리
app.post("/make-server-0b7d3bae/market/listings/:id/sold", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const listings = (await kv.get("market_listings") as any[] | null) || [];
    const idx = listings.findIndex((l: any) => l.id === id);
    if (idx === -1) return c.json({ error: "Not found" }, 404);
    const role = await getUserRole(user.id);
    if (listings[idx].userId !== user.id && role !== "admin") return c.json({ error: "Forbidden" }, 403);
    listings[idx].status = "sold";
    await kv.set("market_listings", listings);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Unknown" }, 500); }
});

// 끌어올리기 (한국시간 기준 2일 경과 후 가능)
app.post("/make-server-0b7d3bae/market/listings/:id/bump", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const listings = (await kv.get("market_listings") as any[] | null) || [];
    const idx = listings.findIndex((l: any) => l.id === id);
    if (idx === -1) return c.json({ error: "Not found" }, 404);
    if (listings[idx].userId !== user.id) return c.json({ error: "Forbidden" }, 403);
    // 한국시간 기준 2일 경과 확인
    const lastBump = listings[idx].bumpedAt || listings[idx].createdAt;
    const koNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const koLast = new Date(new Date(lastBump).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    if (koNow.getTime() - koLast.getTime() < 2 * 24 * 60 * 60 * 1000) {
      return c.json({ error: "아직 끌어올리기가 불가능해요. 등록 후 2일이 지나야 합니다." }, 400);
    }
    // 목록 맨 앞으��� 이동
    const item = listings.splice(idx, 1)[0];
    item.bumpedAt = new Date().toISOString();
    listings.unshift(item);
    await kv.set("market_listings", listings);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Unknown" }, 500); }
});

// 예약 설정/취소
app.post("/make-server-0b7d3bae/market/listings/:id/reserve", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const listings = (await kv.get("market_listings") as any[] | null) || [];
    const idx = listings.findIndex((l: any) => l.id === id);
    if (idx === -1) return c.json({ error: "Not found" }, 404);
    if (listings[idx].userId !== user.id) return c.json({ error: "Forbidden" }, 403);
    const body = await c.req.json();
    if (body.cancel) {
      delete listings[idx].reservation;
    } else {
      listings[idx].reservation = { commentId: body.commentId, userNickname: body.userNickname, offerPrice: body.offerPrice };
    }
    await kv.set("market_listings", listings);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Unknown" }, 500); }
});

// 방출 취소 (마켓에서 제거)
app.post("/make-server-0b7d3bae/market/listings/:id/cancel", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const listings = (await kv.get("market_listings") as any[] | null) || [];
    const idx = listings.findIndex((l: any) => l.id === id);
    if (idx === -1) return c.json({ error: "Not found" }, 404);
    const role = await getUserRole(user.id);
    if (listings[idx].userId !== user.id && role !== "admin") return c.json({ error: "Forbidden" }, 403);
    const bggId = listings[idx].game?.bggId;
    const gameId = listings[idx].gameId;
    listings.splice(idx, 1);
    await kv.set("market_listings", listings);
    return c.json({ success: true, bggId, gameId });
  } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Unknown" }, 500); }
});


app.get("/make-server-0b7d3bae/market/comments/:listingId", async (c) => {
  try {
    const { data: { user } } = await supabase.auth.getUser((c.req.header("Authorization") || "").replace("Bearer ", ""));
    const listingId = c.req.param("listingId");
    const allComments = (await kv.get(`market_comments_${listingId}`) as any[] | null) || [];
    // 비밀 댓글 필터: 본인 또는 판매자 또는 관리자만 열람
    const listings = (await kv.get("market_listings") as any[] | null) || [];
    const listing = listings.find((l: any) => l.id === listingId);
    const role = user ? await getUserRole(user.id) : null;
    const filtered = allComments.filter((comment: any) => {
      if (!comment.isSecret) return true;
      if (!user) return false;
      if (comment.userId === user.id) return true;
      if (listing?.userId === user.id) return true;
      if (role === "admin") return true;
      return false;
    });
    return c.json({ comments: filtered });
  } catch { return c.json({ comments: [] }); }
});

// 댓글 등록
app.post("/make-server-0b7d3bae/market/comments", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const { listingId } = body;
    const comments = (await kv.get(`market_comments_${listingId}`) as any[] | null) || [];
    const newComment = {
      ...body,
      id: `comment_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId: user.id,
      createdAt: new Date().toISOString(),
    };
    comments.push(newComment);
    await kv.set(`market_comments_${listingId}`, comments);
    return c.json({ success: true, comment: newComment });
  } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Unknown" }, 500); }
});


// ============================================================
// 📚 숙제 기능 API
// ============================================================

// helper: 관리자 체크
async function requireAdmin(c: any): Promise<{ user: any; error?: Response }> {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return { user: null, error: c.json({ error: 'Unauthorized' }, 401) };
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user?.id) return { user: null, error: c.json({ error: 'Unauthorized' }, 401) };
  const role = await getUserRole(user.id);
  if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return { user: null, error: c.json({ error: 'Forbidden' }, 403) };
  return { user };
}

// ============================================================
// 🎯 경매 시스템 API
// ============================================================

// 헬퍼: auction_results 특정 항목 업데이트
async function updateAuctionResult(auctionId: string, updates: any) {
  try {
    const results = (await kv.get('auction_results') as any[] | null) || [];
    const idx = results.findIndex((r: any) => r.auctionId === auctionId);
    if (idx >= 0) { results[idx] = { ...results[idx], ...updates }; await kv.set('auction_results', results); }
  } catch {}
}

// 헬퍼: userId가 관리자인지 soft 체크
async function checkIsAdmin(userId: string): Promise<boolean> {
  try { const role = await getUserRole(userId); return role === 'admin'; } catch { return false; }
}

// GET /auction/active — 현재/최근 경매 조회 (공개)
app.get("/make-server-0b7d3bae/auction/active", async (c) => {
  try {
    const cached = cacheGet("auction_active_response");
    if (cached) return c.json(cached);

    const activeId = await kvGetWithRetry<string>("auction_active_id");
    if (!activeId) { const r = { auction: null }; cacheSet("auction_active_response", r, 10000); return c.json(r); }
    const auction = await kvGetWithRetry<any>(`auction_${activeId}`);
    if (!auction) { const r = { auction: null }; cacheSet("auction_active_response", r, 10000); return c.json(r); }

    const now = new Date().toISOString();
    let updated = false;
    if (auction.status === 'scheduled' && auction.startAt && now >= auction.startAt) {
      auction.status = 'active'; updated = true;
    }
    if (auction.status === 'active' && auction.endAt && now >= auction.endAt) {
      auction.status = 'ended';
      if (auction.currentBidder && !auction.winnerUserId) {
        auction.winnerUserId = auction.currentBidder;
        auction.winnerNickname = auction.currentBidderNickname;
      }
      updated = true;
    }
    const participants = (await kv.get(`auction_participants_${activeId}`) as any[] | null) || [];
    const bids = (await kv.get(`auction_bids_${activeId}`) as any[] | null) || [];
    const bidderIds = [...new Set((bids as any[]).map((b: any) => b.userId))];

    // 자동 종료 시 resultExpiresAt 설정 + 아카이브 + 카드 처리
    if (updated && auction.status === 'ended' && !auction.resultExpiresAt) {
      auction.resultExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      if (!auction.archived) {
        auction.archived = true;
        // 낙찰자 카드 차감 (지급은 송장 등록 후 2일 뒤 지연 지급)
        if (auction.winnerUserId) {
          const winnerBids = (bids as any[]).filter((b: any) => b.userId === auction.winnerUserId).sort((a: any, b: any) => b.amount - a.amount);
          const winningBid = winnerBids[0];
          if (winningBid?.email) {
            const wCards = await readCardCountByEmail(winningBid.email, auction.winnerUserId);
            await writeCardCountByEmail(winningBid.email, Math.max(0, wCards - auction.currentBid));
          }
          auction.escrowAmount = auction.currentBid;
          auction.escrowStatus = 'pending';
        }
        const results = (await kv.get('auction_results') as any[] | null) || [];
        if (!results.some((r: any) => r.auctionId === auction.auctionId)) {
          results.unshift({
            auctionId: auction.auctionId, title: auction.title, imageUrl: auction.imageUrl,
            prize: auction.prize, boxCondition: auction.boxCondition,
            winnerUserId: auction.winnerUserId, winnerNickname: auction.winnerNickname,
            hostUserId: auction.hostUserId, hostNickname: auction.hostNickname,
            createdBy: auction.createdBy || null,
            finalBid: auction.currentBid, startPrice: auction.startPrice,
            participantCount: participants.length, endedAt: now, createdAt: auction.createdAt,
            escrowAmount: auction.escrowAmount ?? auction.currentBid, escrowStatus: 'pending',
          });
          await kv.set('auction_results', results);
        }
      }
      await kv.set(`auction_${activeId}`, auction);
    } else if (updated) {
      await kv.set(`auction_${activeId}`, auction);
    }

    // 결과 배너 만료 시 빈 응답
    if (auction.status === 'ended' && auction.resultExpiresAt && now > auction.resultExpiresAt) {
      const r = { auction: null }; cacheSet("auction_active_response", r, 10000); return c.json(r);
    }

    const response = { auction, participants, bidderIds };
    // 상태 전환이 일어난 경우 캐시 스킵 (다음 폴링이 즉시 변경된 상태를 반영)
    if (!updated) {
      const ttl = auction.status === 'active' ? 4000 : auction.status === 'scheduled' ? 8000 : 5000;
      cacheSet("auction_active_response", response, ttl);
    }
    return c.json(response);
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// GET /auction/results — 경매 결과 목록 (관리자)
app.get("/make-server-0b7d3bae/auction/results", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const results = (await kv.get('auction_results') as any[] | null) || [];
    return c.json({ results });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// POST /auction — 경매 등록 (관리자)
app.post("/make-server-0b7d3bae/auction", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const body = await c.req.json();
    const { title, description, imageUrl, imageUrls, startPrice, bidUnit, timerMinutes, scheduleAfterMinutes, prize, boxCondition, gameId, hostUserId, hostNickname, tags, entryFee } = body;
    if (!title?.trim()) return c.json({ error: '상품명을 입력해주세요' }, 400);
    if (!startPrice || Number(startPrice) < 1) return c.json({ error: '시작가를 입력해주세요' }, 400);
    if (!bidUnit || Number(bidUnit) < 1) return c.json({ error: '입찰 단위를 입력해주세요' }, 400);

    const auctionId = `auction_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const nowMs = Date.now();
    const schedAfter = Math.max(0, Number(scheduleAfterMinutes) || 0);
    const timer = Math.max(1, Number(timerMinutes) || 10);
    const startAt = new Date(nowMs + schedAfter * 60 * 1000).toISOString();
    const endAt = new Date(nowMs + schedAfter * 60 * 1000 + timer * 60 * 1000).toISOString();
    const status: 'scheduled' | 'active' = schedAfter > 0 ? 'scheduled' : 'active';
    const resolvedImageUrls: string[] = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
    const now = new Date(nowMs).toISOString();

    // 보드위키 게임 표지 이미지 조회 (오버라이드 → site_game → 전달받은 imageUrl 순)
    let coverImageUrl = imageUrl || '';
    if (gameId) {
      try {
        const idOverride = await kv.get(`game_image_id_${gameId}`).catch(() => null) as any;
        if (idOverride?.url) {
          coverImageUrl = idOverride.url;
        } else {
          const siteGame = await kv.get(`site_game_${gameId}`).catch(() => null) as any;
          if (siteGame) {
            if (siteGame.bggId) {
              const bggOverride = await kv.get(`game_image_bgg_${siteGame.bggId}`).catch(() => null) as any;
              coverImageUrl = bggOverride?.url || siteGame.imageUrl || coverImageUrl;
            } else {
              coverImageUrl = siteGame.imageUrl || coverImageUrl;
            }
          }
        }
      } catch {}
    }

    const auction = {
      auctionId, title: title.trim(), description: description?.trim() || '',
      imageUrl: coverImageUrl, imageUrls: resolvedImageUrls,
      startPrice: Number(startPrice), bidUnit: Number(bidUnit),
      status, scheduledAt: startAt, startAt, endAt,
      timerMinutes: timer, scheduleAfterMinutes: schedAfter,
      createdBy: user.id, currentBid: Number(startPrice),
      currentBidder: null, currentBidderNickname: null,
      prize: prize?.trim() || '', boxCondition: boxCondition || '',
      gameId: gameId || '', type: 'admin',
      winnerUserId: null, winnerNickname: null, createdAt: now,
      hostUserId: hostUserId || null, hostNickname: hostNickname || null,
      tags: Array.isArray(tags) ? tags : [],
      entryFee: Math.max(0, Number(entryFee) || 0),
    };

    await kv.set(`auction_${auctionId}`, auction);
    await kv.set('auction_active_id', auctionId);
    cacheDelete("auction_active_response"); // 새 경매 등록 시 캐시 무효화
    return c.json({ success: true, auction });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// POST /auction/request — 경매 요청 (일반회원)
app.post("/make-server-0b7d3bae/auction/request", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json();
    const { title, description, imageUrl, imageUrls, startPrice, bidUnit, prize, boxCondition, nickname, gameId } = body;
    if (!title?.trim()) return c.json({ error: '상품명을 입력해주세요' }, 400);
    const requestId = `auc_req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const profile = await kv.get(`user_profile_${user.id}`).catch(() => null) as any;
    const noEmail = (s: any) => (s && typeof s === 'string' && !s.includes('@')) ? s : null;
    const resolvedNickname = noEmail(profile?.username) || noEmail(profile?.userName) || noEmail(profile?.nickname) || noEmail(nickname) || user.email?.split('@')[0] || '';
    const request = {
      requestId, userId: user.id, nickname: resolvedNickname,
      title: title.trim(), description: description?.trim() || '',
      imageUrl: imageUrl || '',
      imageUrls: Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [],
      startPrice: Number(startPrice) || 1,
      bidUnit: Number(bidUnit) || 1,
      prize: prize?.trim() || '',
      boxCondition: boxCondition || '',
      gameId: gameId || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const requests = (await kv.get('auction_requests') as any[] | null) || [];
    await kv.set('auction_requests', [...requests, request]);
    return c.json({ success: true, request });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// GET /auction/my-requests — 내 경매 요청 목록 (승인된 것 포함)
app.get("/make-server-0b7d3bae/auction/my-requests", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const requests = (await kv.get('auction_requests') as any[] | null) || [];
    const mine = requests.filter((r: any) => r.userId === user.id);
    return c.json({ requests: mine });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// POST /auction/request/:requestId/launch — 승인된 요청으로 경매 시작 (5분 후)
app.post("/make-server-0b7d3bae/auction/request/:requestId/launch", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const requestId = c.req.param('requestId');

    const requests = (await kv.get('auction_requests') as any[] | null) || [];
    const req = requests.find((r: any) => r.requestId === requestId);
    if (!req) return c.json({ error: '요청을 찾을 수 없어요' }, 404);
    if (req.userId !== user.id) return c.json({ error: '본인 요청만 시작할 수 있어요' }, 403);
    if (req.status !== 'approved') return c.json({ error: '승인된 요청만 시작할 수 있어요' }, 400);

    // 현재 진행 중인 경매 확인
    const activeId = await kv.get('auction_active_id') as string | null;
    if (activeId) {
      const activeAuction = await kv.get(`auction_${activeId}`) as any | null;
      if (activeAuction && activeAuction.status !== 'ended') {
        return c.json({ error: '현재 진행 중인 경매가 있어요. 경매 종료 후 시작해주세요.' }, 409);
      }
    }

    const schedAfter = 5;
    const timerMinutes = 10;
    const nowMs = Date.now();
    const auctionId = `auction_${nowMs}_${Math.random().toString(36).slice(2)}`;
    const startAt = new Date(nowMs + schedAfter * 60 * 1000).toISOString();
    const endAt = new Date(nowMs + (schedAfter + timerMinutes) * 60 * 1000).toISOString();
    const now = new Date(nowMs).toISOString();

    const profile = await kv.get(`user_profile_${user.id}`).catch(() => null) as any;
    const noEmail = (s: any) => (s && typeof s === 'string' && !s.includes('@')) ? s : null;
    const hostNickname = noEmail(profile?.username) || noEmail(profile?.userName) || noEmail(profile?.nickname) || req.nickname || user.email?.split('@')[0] || '';

    // BoardWiki 이미지 조회 (관리자 경매 생성과 동일한 로직)
    let resolvedImageUrl = req.imageUrl || '';
    const reqGameId = req.gameId || '';
    if (reqGameId) {
      const idOverride = await kv.get(`game_image_id_${reqGameId}`).catch(() => null) as any;
      if (idOverride?.imageUrl) {
        resolvedImageUrl = idOverride.imageUrl;
      } else {
        const siteGame = await kv.get(`site_game_${reqGameId}`).catch(() => null) as any;
        if (siteGame?.imageUrl) {
          resolvedImageUrl = siteGame.imageUrl;
        } else if (siteGame?.bggId) {
          const bggOverride = await kv.get(`game_image_bgg_${siteGame.bggId}`).catch(() => null) as any;
          if (bggOverride?.imageUrl) resolvedImageUrl = bggOverride.imageUrl;
        }
      }
    }

    const auction = {
      auctionId, title: req.title, description: req.description || '',
      imageUrl: resolvedImageUrl, imageUrls: req.imageUrls || [],
      startPrice: req.startPrice, bidUnit: req.bidUnit,
      status: 'scheduled' as const,
      scheduledAt: startAt, startAt, endAt,
      timerMinutes, scheduleAfterMinutes: schedAfter,
      createdBy: user.id, currentBid: req.startPrice,
      currentBidder: null, currentBidderNickname: null,
      prize: req.prize || '', boxCondition: req.boxCondition || '',
      gameId: reqGameId, type: 'user',
      winnerUserId: null, winnerNickname: null, createdAt: now,
      hostUserId: user.id, hostNickname,
      tags: [], entryFee: Math.max(0, Number(req.entryFee) || 0),
      fromRequestId: requestId,
    };

    await kv.set(`auction_${auctionId}`, auction);
    await kv.set('auction_active_id', auctionId);

    // 요청 상태를 launched로 변경
    const updatedRequests = requests.map((r: any) =>
      r.requestId === requestId ? { ...r, status: 'launched', launchedAuctionId: auctionId, launchedAt: now } : r
    );
    await kv.set('auction_requests', updatedRequests);

    return c.json({ success: true, auction });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// POST /auction/:auctionId/bid — 입찰
app.post("/make-server-0b7d3bae/auction/:auctionId/bid", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const auctionId = c.req.param('auctionId');
    const auction = await kv.get(`auction_${auctionId}`) as any | null;
    if (!auction) return c.json({ error: '경매를 찾을 수 없어요' }, 404);

    const now = new Date().toISOString();
    if (auction.status === 'ended' || now >= auction.endAt) return c.json({ error: '종료된 경매예요' }, 400);
    if (auction.status === 'scheduled' && now < auction.startAt) return c.json({ error: '아직 경매가 시작되지 않았어요' }, 400);
    if ((auction.hostUserId && auction.hostUserId === user.id) || (auction.createdBy && auction.createdBy === user.id)) return c.json({ error: '경매 주체자는 입찰할 수 없어요' }, 403);
    if (auction.currentBidder === user.id) return c.json({ error: '이미 최고 입찰자예요' }, 400);

    const { nickname, amount } = await c.req.json();
    const bidAmount = Number(amount);
    const expectedBid = auction.currentBid + auction.bidUnit;
    if (bidAmount !== expectedBid) return c.json({ error: `입찰가는 ${expectedBid}장이어야 해요` }, 400);

    const email = user.email || '';
    const cardCount = await readCardCountByEmail(email, user.id);
    if (cardCount < bidAmount) return c.json({ error: `보너스카드가 부족해요 (보유: ${cardCount}장, 필요: ${bidAmount}장)` }, 400);

    const bids = (await kv.get(`auction_bids_${auctionId}`) as any[] | null) || [];
    bids.push({
      bidId: `bid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId: user.id, email, nickname: nickname || '', amount: bidAmount, bidAt: now,
    });
    await kv.set(`auction_bids_${auctionId}`, bids);

    // 프로필 닉네임 조회 (이메일 형식 값은 건너뜀)
    const noEmail = (s: any) => (s && typeof s === 'string' && !s.includes('@')) ? s : null;
    const bidProfile = await kv.get(`user_profile_${user.id}`).catch(() => null) as any;
    const bidNickname = noEmail(bidProfile?.username) || noEmail(bidProfile?.userName) || noEmail(bidProfile?.nickname) || noEmail(bidProfile?.name) || noEmail(nickname) || user.email?.split('@')[0] || '';

    const newEndAt = new Date(Date.now() + (auction.timerMinutes || 10) * 60 * 1000).toISOString();
    auction.currentBid = bidAmount;
    auction.currentBidder = user.id;
    auction.currentBidderNickname = bidNickname;
    auction.endAt = newEndAt;
    if (auction.status === 'scheduled') auction.status = 'active';
    await kv.set(`auction_${auctionId}`, auction);
    cacheDelete("auction_active_response"); // 입찰 시 캐시 무효화

    // 입찰 시 자동 참여 등록
    const participants = (await kv.get(`auction_participants_${auctionId}`) as any[] | null) || [];
    if (!participants.find((p: any) => p.userId === user.id)) {
      participants.push({ userId: user.id, nickname: bidNickname, joinedAt: now });
      await kv.set(`auction_participants_${auctionId}`, participants);
    }

    return c.json({ success: true, auction });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// POST /auction/:auctionId/join — 경매 참여
app.post("/make-server-0b7d3bae/auction/:auctionId/join", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const auctionId = c.req.param('auctionId');
    const auction = await kv.get(`auction_${auctionId}`) as any | null;
    if (!auction) return c.json({ error: '경매를 찾을 수 없어요' }, 404);
    if (auction.status === 'ended') return c.json({ error: '종료된 경매예요' }, 400);
    if ((auction.hostUserId && auction.hostUserId === user.id) || (auction.createdBy && auction.createdBy === user.id)) return c.json({ error: '경매 주체자는 참여할 수 없어요' }, 403);

    const { nickname } = await c.req.json();
    const noEmail2 = (s: any) => (s && typeof s === 'string' && !s.includes('@')) ? s : null;
    const profile = await kv.get(`user_profile_${user.id}`).catch(() => null) as any;
    const resolvedNickname = noEmail2(profile?.username) || noEmail2(profile?.userName) || noEmail2(profile?.nickname) || noEmail2(profile?.name) || noEmail2(nickname) || user.email?.split('@')[0] || '';
    const participants = (await kv.get(`auction_participants_${auctionId}`) as any[] | null) || [];
    const alreadyJoined = !!participants.find((p: any) => p.userId === user.id);

    if (!alreadyJoined) {
      const entryFee = Number(auction.entryFee) || 0;
      if (entryFee > 0) {
        if (!user.email) return c.json({ error: '이메일 정보가 없어요' }, 400);
        const currentCards = await readCardCountByEmail(user.email, user.id);
        if (currentCards < entryFee) {
          return c.json({ error: `카드가 부족해요 (보유: ${currentCards}장, 필요: ${entryFee}장)` }, 402);
        }
        await writeCardCountByEmail(user.email, currentCards - entryFee);
      }
      participants.push({ userId: user.id, nickname: resolvedNickname, joinedAt: new Date().toISOString() });
      await kv.set(`auction_participants_${auctionId}`, participants);
      cacheDelete("auction_active_response"); // 참여 시 캐시 무효화
    }
    return c.json({ success: true, participants });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// POST /auction/:auctionId/end — 경매 종료 처리 (관리자)
app.post("/make-server-0b7d3bae/auction/:auctionId/end", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const auctionId = c.req.param('auctionId');
    const auction = await kv.get(`auction_${auctionId}`) as any | null;
    if (!auction) return c.json({ error: '경매를 찾을 수 없어요' }, 404);
    if (auction.status === 'ended') return c.json({ error: '이미 종료된 경매예요' }, 400);

    const endedNow = new Date().toISOString();
    auction.status = 'ended';
    auction.endAt = endedNow;
    auction.resultExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const endParticipants = (await kv.get(`auction_participants_${auctionId}`) as any[] | null) || [];

    if (auction.currentBidder) {
      auction.winnerUserId = auction.currentBidder;
      auction.winnerNickname = auction.currentBidderNickname;
      const bids = (await kv.get(`auction_bids_${auctionId}`) as any[] | null) || [];
      const winnerBids = (bids as any[])
        .filter((b: any) => b.userId === auction.currentBidder)
        .sort((a: any, b: any) => b.amount - a.amount);
      const winningBid = winnerBids[0];
      if (winningBid?.email) {
        const winnerCards = await readCardCountByEmail(winningBid.email, auction.currentBidder);
        await writeCardCountByEmail(winningBid.email, Math.max(0, winnerCards - auction.currentBid));
        console.log(`[경매낙찰] 차감 ${winningBid.email} -${auction.currentBid}장`);
      }
      auction.escrowAmount = auction.currentBid;
      auction.escrowStatus = 'pending';
    }

    // 아카이브
    if (!auction.archived) {
      auction.archived = true;
      const results = (await kv.get('auction_results') as any[] | null) || [];
      if (!results.some((r: any) => r.auctionId === auction.auctionId)) {
        results.unshift({
          auctionId: auction.auctionId, title: auction.title, imageUrl: auction.imageUrl,
          prize: auction.prize, boxCondition: auction.boxCondition,
          winnerUserId: auction.winnerUserId, winnerNickname: auction.winnerNickname,
          hostUserId: auction.hostUserId, hostNickname: auction.hostNickname,
          createdBy: auction.createdBy || null,
          finalBid: auction.currentBid, startPrice: auction.startPrice,
          participantCount: endParticipants.length, endedAt: endedNow, createdAt: auction.createdAt,
        });
        await kv.set('auction_results', results);
      }
    }

    await kv.set(`auction_${auctionId}`, auction);
    cacheDelete("auction_active_response"); // 종료 시 캐시 무효화
    return c.json({ success: true, auction });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// POST /auction/:auctionId/dismiss-banner — 낙찰 배너 즉시 종료 (관리자)
app.post("/make-server-0b7d3bae/auction/:auctionId/dismiss-banner", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const auctionId = c.req.param('auctionId');
    const auction = await kv.get(`auction_${auctionId}`) as any | null;
    if (!auction) return c.json({ error: '경매를 찾을 수 없어요' }, 404);
    if (auction.status !== 'ended') return c.json({ error: '종료된 경매가 아니에요' }, 400);
    auction.resultExpiresAt = new Date(Date.now() - 1000).toISOString();
    await kv.set(`auction_${auctionId}`, auction);
    cacheDelete("auction_active_response");
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// ─── 경매 배달 / 에스크로 ─────────────────────────────────────

// POST /auction/:id/winner-address — 낙찰자 배송지 입력
app.post("/make-server-0b7d3bae/auction/:auctionId/winner-address", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const auctionId = c.req.param('auctionId');
    const auction = await kv.get(`auction_${auctionId}`) as any | null;
    if (!auction) return c.json({ error: '경매를 찾을 수 없어요' }, 404);
    const isAdmin = await checkIsAdmin(user.id);
    if (user.id !== auction.winnerUserId && !isAdmin) return c.json({ error: '낙찰자만 배송지를 입력할 수 있어요' }, 403);
    const { address } = await c.req.json();
    if (!address?.trim()) return c.json({ error: '배송지를 입력해주세요' }, 400);
    const delivery = { address: address.trim(), submittedAt: new Date().toISOString(), winnerUserId: user.id };
    await kv.set(`auction_delivery_${auctionId}`, delivery);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// GET /auction/:id/delivery-info — 배달 정보 조회 (낙찰자/주체/관리자)
app.get("/make-server-0b7d3bae/auction/:auctionId/delivery-info", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const auctionId = c.req.param('auctionId');
    const auction = await kv.get(`auction_${auctionId}`) as any | null;
    if (!auction) return c.json({ error: '경매를 찾을 수 없어요' }, 404);
    const isAdmin = await checkIsAdmin(user.id);
    if (user.id !== auction.winnerUserId && user.id !== auction.hostUserId && !isAdmin)
      return c.json({ error: '권한이 없어요' }, 403);
    const delivery = await kv.get(`auction_delivery_${auctionId}`) as any | null;
    return c.json({
      address: delivery?.address || null,
      addressSubmittedAt: delivery?.submittedAt || null,
      trackingNumber: auction.trackingNumber || null,
      trackingCarrier: auction.trackingCarrier || null,
      trackingSubmittedAt: auction.trackingSubmittedAt || null,
      releaseAt: auction.releaseAt || null,
      escrowAmount: auction.escrowAmount || 0,
      escrowStatus: auction.escrowStatus || 'pending',
      releasedAt: auction.releasedAt || null,
    });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// POST /auction/:id/submit-tracking — 주체가 송장번호 입력
app.post("/make-server-0b7d3bae/auction/:auctionId/submit-tracking", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const auctionId = c.req.param('auctionId');
    const auction = await kv.get(`auction_${auctionId}`) as any | null;
    if (!auction) return c.json({ error: '경매를 찾을 수 없어요' }, 404);
    const isAdmin = await checkIsAdmin(user.id);
    if (user.id !== auction.hostUserId && !isAdmin) return c.json({ error: '경매 주체만 송장을 등록할 수 있어요' }, 403);
    const { trackingNumber, carrier } = await c.req.json();
    if (!trackingNumber?.trim()) return c.json({ error: '송장번호를 입력해주세요' }, 400);
    const now = new Date().toISOString();
    auction.trackingNumber = trackingNumber.trim();
    auction.trackingCarrier = carrier?.trim() || '';
    auction.trackingSubmittedAt = now;
    auction.releaseAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    auction.escrowStatus = 'tracking_submitted';
    await kv.set(`auction_${auctionId}`, auction);
    await updateAuctionResult(auctionId, { trackingNumber: auction.trackingNumber, trackingCarrier: auction.trackingCarrier, escrowStatus: 'tracking_submitted', releaseAt: auction.releaseAt });
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// DELETE /auction/result/:auctionId — 관리자: 경매 거래 결과 카드 삭제
app.delete("/make-server-0b7d3bae/auction/result/:auctionId", async (c) => {
  const { error } = await requireAdmin(c);
  if (error) return error;
  try {
    const auctionId = c.req.param('auctionId');
    const results = (await kv.get('auction_results') as any[] | null) || [];
    const updated = results.filter((r: any) => r.auctionId !== auctionId);
    await kv.set('auction_results', updated);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// GET /auction/requests — 관리자: 경매 요청 목록 조회
app.get("/make-server-0b7d3bae/auction/requests", async (c) => {
  const { error } = await requireAdmin(c);
  if (error) return error;
  try {
    const requests = (await kv.get('auction_requests') as any[] | null) || [];
    return c.json({ requests });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// PATCH /auction/request/:requestId — 관리자: 경매 요청 상태 변경 (approve/reject)
app.patch("/make-server-0b7d3bae/auction/request/:requestId", async (c) => {
  const { error } = await requireAdmin(c);
  if (error) return error;
  try {
    const requestId = c.req.param('requestId');
    const { status, rejectReason, entryFee } = await c.req.json();
    const requests = (await kv.get('auction_requests') as any[] | null) || [];
    const idx = requests.findIndex((r: any) => r.requestId === requestId);
    if (idx === -1) return c.json({ error: '요청을 찾을 수 없어요' }, 404);
    requests[idx] = {
      ...requests[idx], status, rejectReason: rejectReason || '',
      reviewedAt: new Date().toISOString(),
      ...(entryFee !== undefined ? { entryFee: Math.max(0, Number(entryFee) || 0) } : {}),
    };
    await kv.set('auction_requests', requests);
    return c.json({ success: true, request: requests[idx] });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// DELETE /auction/request/:requestId — 관리자: 경매 요청 삭제
app.delete("/make-server-0b7d3bae/auction/request/:requestId", async (c) => {
  const { error } = await requireAdmin(c);
  if (error) return error;
  try {
    const requestId = c.req.param('requestId');
    const requests = (await kv.get('auction_requests') as any[] | null) || [];
    await kv.set('auction_requests', requests.filter((r: any) => r.requestId !== requestId));
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// GET /my/auction-trades — 내가 낙찰자 또는 주체인 경매 거래 목록
app.get("/make-server-0b7d3bae/my/auction-trades", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const isAdmin = await checkIsAdmin(user.id);
    const results = (await kv.get('auction_results') as any[] | null) || [];
    const myTrades = results.filter((r: any) =>
      r.winnerUserId === user.id || r.hostUserId === user.id || isAdmin
    );
    // 지연 지급 처리 (releaseAt 지난 항목)
    let updatedResults = false;
    for (const trade of myTrades) {
      if (trade.escrowStatus === 'tracking_submitted' && trade.releaseAt && new Date(trade.releaseAt) <= new Date()) {
        const auction = await kv.get(`auction_${trade.auctionId}`) as any | null;
        if (auction && auction.escrowStatus === 'tracking_submitted' && auction.hostUserId) {
          const hostEntry = await kv.get(`beta_user_${auction.hostUserId}`).catch(() => null) as any;
          if (hostEntry?.email) {
            const hCards = await readCardCountByEmail(hostEntry.email, auction.hostUserId);
            await writeCardCountByEmail(hostEntry.email, hCards + (auction.escrowAmount || 0));
            const releasedAt = new Date().toISOString();
            auction.escrowStatus = 'released';
            auction.releasedAt = releasedAt;
            await kv.set(`auction_${auction.auctionId}`, auction);
            trade.escrowStatus = 'released';
            trade.releasedAt = releasedAt;
            updatedResults = true;
          }
        }
      }
    }
    if (updatedResults) {
      const allResults = (await kv.get('auction_results') as any[] | null) || [];
      for (const trade of myTrades) {
        const idx = allResults.findIndex((r: any) => r.auctionId === trade.auctionId);
        if (idx >= 0) allResults[idx] = { ...allResults[idx], ...trade };
      }
      await kv.set('auction_results', allResults);
    }
    // 각 거래에 배송지 정보 포함
    const tradesWithDelivery = await Promise.all(myTrades.map(async (trade: any) => {
      const delivery = await kv.get(`auction_delivery_${trade.auctionId}`).catch(() => null) as any;
      const auction = await kv.get(`auction_${trade.auctionId}`).catch(() => null) as any;
      return {
        ...trade,
        escrowStatus: auction?.escrowStatus || trade.escrowStatus,
        escrowAmount: auction?.escrowAmount || trade.escrowAmount,
        trackingNumber: auction?.trackingNumber || trade.trackingNumber,
        trackingCarrier: auction?.trackingCarrier || trade.trackingCarrier,
        releaseAt: auction?.releaseAt || trade.releaseAt,
        releasedAt: auction?.releasedAt || trade.releasedAt,
        winnerAddress: delivery?.address || null,
        winnerAddressAt: delivery?.submittedAt || null,
        role: trade.winnerUserId === user.id ? 'winner' : (trade.hostUserId === user.id || auction?.createdBy === user.id ? 'host' : 'admin'),
      };
    }));
    return c.json({ trades: tradesWithDelivery });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// ─── 경매 태그 ───────────────────────────────────────────────
// GET /auction/tags
app.get("/make-server-0b7d3bae/auction/tags", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const tags = (await kv.get('auction_tags') as string[] | null) || [];
    return c.json({ tags });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// POST /auction/tags (관리자)
app.post("/make-server-0b7d3bae/auction/tags", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const { tag } = await c.req.json();
    if (!tag?.trim()) return c.json({ error: '태그명을 입력해주세요' }, 400);
    const tags = (await kv.get('auction_tags') as string[] | null) || [];
    const t = tag.trim();
    if (!tags.includes(t)) { tags.push(t); await kv.set('auction_tags', tags); }
    return c.json({ tags });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// DELETE /auction/tags/:tag (관리자)
app.delete("/make-server-0b7d3bae/auction/tags/:tag", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const tag = decodeURIComponent(c.req.param('tag'));
    const tags = (await kv.get('auction_tags') as string[] | null) || [];
    await kv.set('auction_tags', tags.filter(t => t !== tag));
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// ─── 경매 채팅 ───────────────────────────────────────────────
// GET /auction/:auctionId/chat
app.get("/make-server-0b7d3bae/auction/:auctionId/chat", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const auctionId = c.req.param('auctionId');
    const messages = (await kv.get(`auction_chat_${auctionId}`) as any[] | null) || [];
    return c.json({ messages });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// POST /auction/:auctionId/chat
app.post("/make-server-0b7d3bae/auction/:auctionId/chat", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const auctionId = c.req.param('auctionId');
    const isAdmin = await checkIsAdmin(user.id);
    if (!isAdmin) {
      const participants = (await kv.get(`auction_participants_${auctionId}`) as any[] | null) || [];
      const joined = participants.some((p: any) => p.userId === user.id);
      if (!joined) return c.json({ error: '경매 참여자만 대화할 수 있어요' }, 403);
    }
    const { text } = await c.req.json();
    if (!text?.trim()) return c.json({ error: '내용을 입력해주세요' }, 400);
    const noEmail = (s: any) => (s && typeof s === 'string' && !s.includes('@')) ? s : null;
    const profile = await kv.get(`user_profile_${user.id}`).catch(() => null) as any;
    const nickname = noEmail(profile?.username) || noEmail(profile?.userName) || noEmail(profile?.nickname) || noEmail(profile?.name) || user.email?.split('@')[0] || '익명';
    const messages = (await kv.get(`auction_chat_${auctionId}`) as any[] | null) || [];
    messages.push({
      msgId: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId: user.id, nickname, text: text.trim(),
      sentAt: new Date().toISOString(),
    });
    // 최대 200개 유지
    if (messages.length > 200) messages.splice(0, messages.length - 200);
    await kv.set(`auction_chat_${auctionId}`, messages);
    return c.json({ success: true, messages });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 숙제 카테고리 목록 조회 (전체 공개)
app.get("/make-server-0b7d3bae/homework/categories", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const cats = (await kv.get('homework_categories') as any[] | null) || [];
    return c.json({ categories: cats });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 숙제 카테고리 생성 (관리자)
app.post("/make-server-0b7d3bae/homework/categories", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const { name, guideline, pointReward, prizeReward, startDate, endDate } = await c.req.json();
    if (!name?.trim()) return c.json({ error: '이름을 입력해주세요' }, 400);
    const cats = (await kv.get('homework_categories') as any[] | null) || [];
    const id = `hw_cat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const newCat = { id, name: name.trim(), guideline: guideline || '', pointReward: pointReward || 0, prizeReward: prizeReward || '', startDate: startDate || '', endDate: endDate || '', createdAt: new Date().toISOString(), active: true };
    await kv.set('homework_categories', [...cats, newCat]);
    return c.json({ success: true, category: newCat });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 숙제 카테고리 수정 (관리자)
app.patch("/make-server-0b7d3bae/homework/categories/:catId", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const catId = c.req.param('catId');
    const updates = await c.req.json();
    const cats = (await kv.get('homework_categories') as any[] | null) || [];
    const updated = cats.map((cat: any) => cat.id === catId ? { ...cat, ...updates } : cat);
    await kv.set('homework_categories', updated);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 숙제 카테고리 삭제 (관리자)
app.delete("/make-server-0b7d3bae/homework/categories/:catId", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const catId = c.req.param('catId');
    const cats = (await kv.get('homework_categories') as any[] | null) || [];
    await kv.set('homework_categories', cats.filter((cat: any) => cat.id !== catId));
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 게시물 고정/해제 (관리자)
// ─── 베스트글 선정/해제 API ───────────────────────────────────────────────
app.patch("/make-server-0b7d3bae/community/posts/:postId/best", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const postId = c.req.param('postId');
    const { isBest } = await c.req.json();
    const post = await kv.get(`beta_post_${postId}`) as any;
    if (!post) return c.json({ error: '게시물을 찾을 수 없어요' }, 404);

    const updated = { ...post, isBest: !!isBest };
    await kv.set(`beta_post_${postId}`, updated);

    // 새로 베스트 선정 시 기존 베스트글 자동 해제 (포인트는 유지)
    if (isBest && !post.isBest) {
      try {
        const allPostsData = await getByPrefix('beta_post_');
        const prevBests = allPostsData
          .map((d: any) => d.value)
          .filter((p: any) => p && p.isBest && p.id !== postId);
        await Promise.all(prevBests.map((p: any) =>
          kv.set(`beta_post_${p.id}`, { ...p, isBest: false })
        ));
      } catch {}
    }

    // 베스트 선정 시 300포인트 지급 (최초 1회)
    if (isBest && !post.isBest) {
      try {
        const current = await getUserPoints(post.userId);
        await kv.set(`user_points_${post.userId}`, {
          ...current,
          points: current.points + 300,
        });
        // 알림 발송
        const notifKey = `notif_${post.userId}_best_${postId}`;
        const already = await kv.get(notifKey);
        if (!already) {
          const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
          await kv.set(`notif_${post.userId}_${notifId}`, {
            id: notifId, userId: post.userId, type: 'best',
            message: '🏆 회원님의 게시글이 베스트글로 선정되었어요! (+300P)',
            postId, read: false, createdAt: new Date().toISOString(),
          });
          await kv.set(notifKey, true);
        }
      } catch {}
    }

    return c.json({ success: true, post: updated });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.patch("/make-server-0b7d3bae/community/posts/:postId/pin", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const postId = c.req.param('postId');
    const { pinned, isHomework } = await c.req.json();
    const post = await kv.get(`beta_post_${postId}`) as any;
    if (!post) return c.json({ error: '게시물을 찾을 수 없어요' }, 404);
    const updated = { ...post, pinned: !!pinned, isHomework: !!isHomework };
    await kv.set(`beta_post_${postId}`, updated);
    return c.json({ success: true, post: updated });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 숙제 제출 목록 조회 (관리자) - 숙제 카테고리의 게시물만
app.get("/make-server-0b7d3bae/homework/submissions", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const cats = (await kv.get('homework_categories') as any[] | null) || [];
    const catNames = cats.map((cat: any) => cat.name);
    const allPostsData = await getByPrefix('beta_post_');
    const posts = allPostsData.map((d: any) => d.value).filter((p: any) => p && !p.isDraft && catNames.includes(p.category));
    posts.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // 포인트 지급 여부 확인
    const submissions = await Promise.all(posts.map(async (p: any) => {
      const cat = cats.find((c: any) => c.name === p.category);
      const reward = await kv.get(`homework_reward_${p.id}`) as any;
      return { ...p, homeworkCategory: cat, rewardGranted: !!reward, rewardAmount: reward?.amount || 0 };
    }));
    return c.json({ submissions });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 숙제 포인트 지급 (관리��)
app.post("/make-server-0b7d3bae/homework/submissions/:postId/reward", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const postId = c.req.param('postId');
    const { points } = await c.req.json();
    if (!points || points <= 0) return c.json({ error: '포인트를 입력해주세요' }, 400);
    // 중복 지급 방지
    const existing = await kv.get(`homework_reward_${postId}`);
    if (existing) return c.json({ error: '이미 포인트를 지급했습니다' }, 409);
    const post = await kv.get(`beta_post_${postId}`) as any;
    if (!post) return c.json({ error: '게시물을 찾을 수 없어요' }, 404);
    // 포인트 직접 추가
    const current = await getUserPoints(post.userId);
    const updated = { ...current, points: current.points + points };
    await kv.set(`user_points_${post.userId}`, updated);
    // 지급 기록
    await kv.set(`homework_reward_${postId}`, { postId, userId: post.userId, amount: points, grantedAt: new Date().toISOString(), grantedBy: user.id });
    // 알림 발송
    await createNotification(post.userId, {
      type: 'points',
      fromUserId: user.id,
      fromUserName: '관리자',
      postId,
      message: `숙제 완료 보상으로 +${points}pt 획득! 🎉`,
    }).catch(() => {});
    return c.json({ success: true, newPoints: updated });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 숙제 당첨자 선정 (관리자)
app.post("/make-server-0b7d3bae/homework/submissions/:postId/select-winner", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const postId = c.req.param('postId');
    const post = await kv.get(`beta_post_${postId}`) as any;
    if (!post) return c.json({ error: '게시물을 찾을 수 없어요' }, 404);
    const cats = (await kv.get('homework_categories') as any[] | null) || [];
    const cat = cats.find((c: any) => c.name === post.category);
    const winner = {
      postId,
      userId: post.userId,
      userName: post.userName,
      category: post.category,
      prizeReward: cat?.prizeReward || '',
      selectedAt: new Date().toISOString(),
      selectedBy: user.id,
      emailClaimed: false,
      email: '',
    };
    await kv.set('homework_winner', winner);
    // 당첨된 숙제 카테고리 비활성화
    if (cat) {
      const updatedCats = cats.map((ct: any) => ct.id === cat.id ? { ...ct, active: false } : ct);
      await kv.set('homework_categories', updatedCats);
    }
    await createNotification(post.userId, {
      type: 'points',
      fromUserId: user.id,
      fromUserName: '관리자',
      postId,
      message: `🎉 숙제 당첨자로 선정되셨어요! 홈피드 배너를 확인해주세요.`,
    }).catch(() => {});
    return c.json({ success: true, winner });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 숙제 당첨자 조회 (인증 유저)
app.get("/make-server-0b7d3bae/homework/winner", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ winner: null });
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ winner: null });
    const winner = await kv.get('homework_winner') as any;
    if (!winner) return c.json({ winner: null });
    const role = await getUserRole(user.id);
    const isAdminUser = role === 'admin' || user.email === 'sityplanner2@naver.com';
    const safe = {
      ...winner,
      userId: winner.userId === user.id ? winner.userId : undefined,
      isWinner: winner.userId === user.id,
      isAdmin: isAdminUser,
      email: isAdminUser ? (winner.email || '') : undefined,
    };
    return c.json({ winner: safe });
  } catch (e) { return c.json({ winner: null }); }
});

// 당첨자 이메일 등록 (당첨자 본인만)
app.post("/make-server-0b7d3bae/homework/winner/claim-email", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const winner = await kv.get('homework_winner') as any;
    if (!winner) return c.json({ error: '당첨 정보가 없어요' }, 404);
    const role = await getUserRole(user.id);
    const isAdminUser = role === 'admin' || user.email === 'sityplanner2@naver.com';
    if (winner.userId !== user.id && !isAdminUser) return c.json({ error: '선정된 분이 아니시네요!' }, 403);
    const { email } = await c.req.json();
    if (!email?.trim()) return c.json({ error: '이메일을 입력해주세요' }, 400);
    await kv.set('homework_winner', { ...winner, email: email.trim(), emailClaimed: true, claimedAt: new Date().toISOString() });
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 숙제 마감 (관리자) - 현재 당첨자를 마감 목록으로 이동, 배너 제거
app.post("/make-server-0b7d3bae/homework/winner/close", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const winner = await kv.get('homework_winner') as any;
    if (!winner) return c.json({ error: '현재 당첨자가 없어요' }, 404);
    const closed = (await kv.get('homework_closed_winners') as any[] | null) || [];
    closed.unshift({ ...winner, closedAt: new Date().toISOString(), closedBy: user.id });
    await kv.set('homework_closed_winners', closed);
    await kv.del('homework_winner');
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 마감된 숙제 당첨 목록 조회 (관리자)
app.get("/make-server-0b7d3bae/homework/closed-winners", async (c) => {
  const { error } = await requireAdmin(c);
  if (error) return error;
  try {
    const closed = (await kv.get('homework_closed_winners') as any[] | null) || [];
    return c.json({ closedWinners: closed });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 내 숙제 현황 조회 (회원)
app.get("/make-server-0b7d3bae/homework/my", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const cats = (await kv.get('homework_categories') as any[] | null) || [];
    const catNames = cats.map((cat: any) => cat.name);
    const allPostsData = await getByPrefix('beta_post_');
    // 내 숙제 제출 게시물
    const mySubmissions = allPostsData
      .map((d: any) => d.value)
      .filter((p: any) => p && !p.isDraft && p.userId === user.id && catNames.includes(p.category));
    const result = await Promise.all(mySubmissions.map(async (p: any) => {
      const cat = cats.find((c: any) => c.name === p.category);
      const reward = await kv.get(`homework_reward_${p.id}`) as any;
      return { postId: p.id, categoryName: p.category, categoryId: cat?.id, content: p.content, submittedAt: p.createdAt, rewardGranted: !!reward, rewardAmount: reward?.amount || 0 };
    }));
    return c.json({ categories: cats, submissions: result });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});


// ===== 북마크 API =====

// 북마크 토글
app.post("/make-server-0b7d3bae/bookmarks/:postId", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const postId = c.req.param('postId');
    const key = `bookmark_${user.id}_${postId}`;
    const existing = await kv.get(key).catch(() => null);

    if (existing) {
      await kv.del(key);
      return c.json({ bookmarked: false });
    } else {
      await kv.set(key, { userId: user.id, postId, savedAt: new Date().toISOString() });
      return c.json({ bookmarked: true });
    }
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 내 북마크 목록 조회
app.get("/make-server-0b7d3bae/bookmarks", async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);

    const bookmarkItems = await getByPrefix(`bookmark_${user.id}_`);
    const postIds = bookmarkItems.map((b: any) => b.value?.postId).filter(Boolean);

    // 게시물 내용 조회
    const posts = await Promise.all(postIds.map(async (postId: string) => {
      try {
        const post = await kv.get(`beta_post_${postId}`);
        if (!post || post.isDraft) return null;
        const pts = await getUserPoints(post.userId).catch(() => null);
        return { ...post, userRankPoints: pts };
      } catch { return null; }
    }));

    const validPosts = posts.filter(Boolean).sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return c.json({ posts: validPosts, postIds });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});


// ── 마지막글 이벤트 (Last Post Wins) ──

// 이벤트 당첨자 조회 (3시간 이내)
app.get("/make-server-0b7d3bae/last-post-event/winner", async (c) => {
  try {
    const winners: any[] = await kv.get("last_event_winners") || [];
    const THREE_HOURS = 3 * 60 * 60 * 1000;
    const now = Date.now();
    const recent = winners.filter((w: any) => now - new Date(w.closedAt).getTime() < THREE_HOURS);
    if (recent.length !== winners.length) {
      await kv.set("last_event_winners", recent);
    }
    return c.json(recent);
  } catch (e) {
    console.log("[last-post-event/winner] 오류:", String(e));
    return c.json([]);
  }
});

// 관리자: 수동으로 당첨 배너 등록
app.post("/make-server-0b7d3bae/last-post-event/winner/manual", async (c) => {
  try {
    await requireAdmin(c);
    const { eventId, winnerUserName, prize, prizeImageUrl, eventTitle } = await c.req.json();
    if (!eventId) return c.json({ error: 'eventId required' }, 400);
    const winners: any[] = await kv.get("last_event_winners") || [];
    // 이미 있으면 제거 후 재등록
    const filtered = winners.filter((w: any) => w.eventId !== eventId);
    filtered.push({
      eventId,
      winnerUserName: winnerUserName || null,
      prize: prize || '',
      prizeImageUrl: prizeImageUrl || '',
      eventTitle: eventTitle || '',
      closedAt: new Date().toISOString(),
    });
    await kv.set("last_event_winners", filtered);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 이벤트 자동 종료 (타이머 0 되면 클라이언트가 호출)
app.post("/make-server-0b7d3bae/last-post-event/auto-close", async (c) => {
  try {
    const body = await c.req.json();
    const { eventId } = body;
    if (!eventId) return c.json({ error: "eventId required" }, 400);

    // ── 1) 이벤트 존재 확인 ──
    const events: any[] = await kv.get("last_post_events") || [];
    const event = events.find((e: any) => e.id === eventId && e.active);
    if (!event) {
      // 이미 다른 요청이 처리했을 수 있음 → winner 있으면 반환
      const existingWinners: any[] = await kv.get("last_event_winners") || [];
      const already = existingWinners.find((w: any) => w.eventId === eventId);
      console.log(`[auto-close] 이미 종료된 이벤트: eventId=${eventId}`);
      return c.json({ alreadyClosed: true, winner: already || null });
    }

    // ── 2) 이벤트 시작 후 최소 3분은 종료 불가 (절대 안전망) ──
    const startedAtMs = new Date(event.startedAt).getTime();
    const wallElapsedMs = Date.now() - startedAtMs;
    if (wallElapsedMs < 3 * 60 * 1000) {
      console.log(`[auto-close] 이벤트 시작 3분 미경과 → 거부: eventId=${eventId}, elapsed=${Math.round(wallElapsedMs/1000)}s`);
      return c.json({ tooEarly: true, message: "이벤트 시작 후 최소 3분이 지나야 종료됩니다" });
    }

    // ── 3) 서버가 직접 선두 글 계산 (클라이언트 winner 데이터 무시) ──
    // 클라이언트 posts 상태가 stale하거나 여러 브라우저 동시 호출 시
    // 잘못된 winner(또는 null)를 보낼 수 있음 → 서버가 KV에서 직접 계산
    const disqualified: string[] = event.disqualified || [];
    const excluded: string[]     = event.excluded     || [];
    // ★ 카드로 타이머가 0이 된 경우 lastReductionAt 이후 글은 당첨 대상 제외
    const reductionMs      = (event.reductionSeconds || 0) * 1000;
    const baseDurationMs   = (event.durationMinutes || 60) * 60 * 1000;
    const isExpiredByCards = reductionMs >= baseDurationMs;
    const cardCutoffMs     = isExpiredByCards && event.lastReductionAt ? Number(event.lastReductionAt) : Infinity;
    const allPostsData = await getByPrefix('beta_post_');
    const eligiblePosts = allPostsData
      .map((d: any) => d.value)
      .filter((p: any) =>
        p &&
        !p.isDraft &&
        p.category === '이벤트' &&
        new Date(p.createdAt).getTime() >= startedAtMs &&
        new Date(p.createdAt).getTime() <= cardCutoffMs && // 카드 완전소진 후 글 제외
        !disqualified.includes(p.userId) &&
        !excluded.includes(p.userId)
      )
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const leaderPost = eligiblePosts[0] || null;

    // ── 4) 조기 종료 방지: 서버가 직접 sinceTimestamp 계산 ──
    // 선두 글이 있으면 createdAt, 없으면 이벤트 startedAt 기준
    // ★ reductionSeconds(보너스카드 감소량)를 반영한 유효 duration으로 검증
    const sinceMs          = leaderPost ? new Date(leaderPost.createdAt).getTime() : startedAtMs;
    const elapsedMs        = Date.now() - sinceMs;
    const durationMs       = (event.durationMinutes || 60) * 60 * 1000;
    const effectiveDurMs   = Math.max(durationMs - reductionMs, 60 * 1000); // 최소 1분
    const minRequiredMs    = effectiveDurMs * 0.85;
    if (elapsedMs < minRequiredMs) {
      console.log(`[auto-close] 조기 종료 거부: eventId=${eventId}, leader=${leaderPost?.id || 'none'}, elapsed=${Math.round(elapsedMs/1000)}s, required=${Math.round(minRequiredMs/1000)}s, reduction=${Math.round(reductionMs/1000)}s`);
      return c.json({ tooEarly: true, message: "타이머가 아직 충분히 경과하지 않았습니다" });
    }

    // ── 5) winner 중복 저장 방지 (race condition 2차 방어) ──
    // 두 요청이 거의 동시에 1~4를 통과했을 때 winner를 두 번 쓰는 것을 막음
    const currentWinners: any[] = await kv.get("last_event_winners") || [];
    const alreadyWon = currentWinners.find((w: any) => w.eventId === eventId);
    if (alreadyWon) {
      console.log(`[auto-close] winner 이미 저장됨 (race 방어): eventId=${eventId}`);
      return c.json({ success: true, winner: alreadyWon });
    }

    // ── 6) 이벤트 종료 + winner 저장 ──
    const updated = events.filter((e: any) => e.id !== eventId);
    await kv.set("last_post_events", updated);

    const winnerEntry = {
      eventId,
      prize: event.prize,
      eventTitle: event.eventTitle || "",
      prizeImageUrl: event.prizeImageUrl || "",
      description: event.description || "",
      winnerUserId:   leaderPost?.userId   || null,
      winnerUserName: leaderPost?.userName || null,
      winnerPostId:   leaderPost?.id       || null,
      closedAt: new Date().toISOString(),
    };
    await kv.set("last_event_winners", [...currentWinners, winnerEntry]);

    // 히스토리에도 저장 (관리자 페이지에서 영구 조회 가능)
    const autoCloseHistory: any[] = await kv.get("last_post_events_history") || [];
    const autoCloseHistEntry = {
      ...event,
      active: false,
      stoppedAt: new Date().toISOString(),
      autoClose: true,
      winnerUserName: winnerEntry.winnerUserName,
      winnerUserId: winnerEntry.winnerUserId,
      winnerPostId: winnerEntry.winnerPostId,
    };
    await kv.set("last_post_events_history", [autoCloseHistEntry, ...autoCloseHistory].slice(0, 100));

    console.log(`[auto-close] 이벤트 종료: eventId=${eventId}, winner=${winnerEntry.winnerUserName || '없음'}, post=${leaderPost?.id || 'none'}`);
    return c.json({ success: true, winner: winnerEntry });
  } catch (e) {
    console.log("[auto-close] 오류:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// 관리자 - 당첨 배너 강제 닫기
app.delete("/make-server-0b7d3bae/admin/event-winner/:eventId", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);

    const eventId = c.req.param("eventId");
    const winners: any[] = await kv.get("last_event_winners") || [];
    const updated = winners.filter((w: any) => w.eventId !== eventId);
    await kv.set("last_event_winners", updated);
    console.log("[admin] 당첨 배너 강제 닫기:", eventId);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// 축하 댓글 조회
app.get("/make-server-0b7d3bae/event-congrats/:eventId", async (c) => {
  try {
    const eventId = c.req.param("eventId");
    const comments: any[] = await kv.get(`event_congrats_${eventId}`) || [];
    return c.json(comments);
  } catch (e) {
    return c.json([]);
  }
});

// 축하 댓글 작성
app.post("/make-server-0b7d3bae/event-congrats/:eventId", async (c) => {
  try {
    const eventId = c.req.param("eventId");
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json();
    const { content } = body;
    if (!content?.trim()) return c.json({ error: "content required" }, 400);

    const profile: any = await kv.get(`user_profile_${user.id}`) || {};
    const userName = profile.username || profile.name || user.email?.split("@")[0] || "회원";
    const userAvatar = profile.profileImage || null;

    const comments: any[] = await kv.get(`event_congrats_${eventId}`) || [];
    const newComment = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      userId: user.id,
      userName,
      userAvatar,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    await kv.set(`event_congrats_${eventId}`, [...comments, newComment]);
    return c.json({ success: true, comment: newComment });
  } catch (e) {
    console.log("[event-congrats POST] 오류:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// 이벤트 상태 조회 (공개)
app.get("/make-server-0b7d3bae/last-post-event", async (c) => {
  try {
    const cached = cacheGet("last_post_event_response");
    if (cached) return c.json(cached);

    // 다중 이벤트 지원: last_post_events 배열 우선, 없으면 단일 이벤트 fallback
    let events: any[] = await kv.get("last_post_events") || [];
    const disqualified: string[] = await kv.get("last_event_disqualified") || [];
    const excludedEntries: any[] = await kv.get("event_excluded_users") || [];
    const excluded: string[] = excludedEntries.map((e: any) => e.userId);

    if (events.length > 0) {
      // 예약 이벤트 자동 활성화 체크
      const now = Date.now();
      let changed = false;
      events = events.map((e: any) => {
        if (e.scheduled && !e.active && e.scheduledAt && new Date(e.scheduledAt).getTime() <= now) {
          changed = true;
          return { ...e, active: true, scheduled: false, startedAt: new Date().toISOString() };
        }
        return e;
      });
      if (changed) await kv.set("last_post_events", events);

      const visible = events.filter((e: any) => e.active || e.scheduled);
      if (visible.length === 0) { cacheSet("last_post_event_response", [], 5000); return c.json([]); }
      const result = visible.map((e: any) => ({ ...e, disqualified, excluded, excludedEntries }));
      // 상태 전환 시 캐시 스킵, 그 외 5초 캐시
      if (!changed) cacheSet("last_post_event_response", result, 5000);
      return c.json(result);
    }

    // fallback: 기존 단일 이벤트
    const event = await kv.get("last_post_event") || null;
    if (!event?.active) { cacheSet("last_post_event_response", [], 5000); return c.json([]); }
    const result = [{ ...event, disqualified, excluded, excludedEntries }];
    cacheSet("last_post_event_response", result, 5000);
    return c.json(result);
  } catch { return c.json([]); }
});

// 이벤트 켜기/끄기/설정 (관리자) - 다중 이벤트 지원
app.post("/make-server-0b7d3bae/admin/last-post-event", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);

    // 관리자 액션은 항상 캐시 무효화
    cacheDelete("last_post_event_response");

    const body = await c.req.json();
    const { action, prize, eventTitle, durationMinutes, description, eventId, sleepStart, sleepEnd, cardReductionSeconds, cardSuccessRate, prizeImageUrl, manualCardUser, scheduledAt } = body;

    const events: any[] = await kv.get("last_post_events") || [];

    if (action === "cancel-schedule") {
      const updated = events.filter((e: any) => !(e.id === eventId && e.scheduled));
      await kv.set("last_post_events", updated);
      return c.json({ success: true });
    }

    if (action === "stop") {
      const history: any[] = await kv.get("last_post_events_history") || [];
      const winners: any[] = await kv.get("last_event_winners") || [];

      if (eventId) {
        const toStop = events.find((e: any) => e.id === eventId);
        if (toStop) {
          // 당첨자 자동 계산 후 히스토리 + 배너 등록
          const winnerInfo = await findEventWinner(toStop);
          const histEntry = { ...toStop, active: false, stoppedAt: new Date().toISOString(), stoppedBy: user.id, autoClose: false, winnerUserName: winnerInfo.winnerUserName, winnerUserId: winnerInfo.winnerUserId, winnerPostId: winnerInfo.winnerPostId };
          await kv.set("last_post_events_history", [histEntry, ...history].slice(0, 100));
          const filteredWinners = winners.filter((w: any) => w.eventId !== eventId);
          filteredWinners.push({ eventId, prize: toStop.prize, eventTitle: toStop.eventTitle || "", prizeImageUrl: toStop.prizeImageUrl || "", description: toStop.description || "", winnerUserName: winnerInfo.winnerUserName, winnerUserId: winnerInfo.winnerUserId, winnerPostId: winnerInfo.winnerPostId, closedAt: new Date().toISOString() });
          await kv.set("last_event_winners", filteredWinners);
        }
        const updated = events.filter((e: any) => e.id !== eventId);
        await kv.set("last_post_events", updated);
      } else {
        // 전체 종료: 진행중 이벤트 전부 히스토리 + 배너 저장
        const newWinners = [...winners];
        const newEntries = [];
        for (const e of events) {
          const winnerInfo = await findEventWinner(e);
          newEntries.push({ ...e, active: false, stoppedAt: new Date().toISOString(), stoppedBy: user.id, autoClose: false, winnerUserName: winnerInfo.winnerUserName, winnerUserId: winnerInfo.winnerUserId, winnerPostId: winnerInfo.winnerPostId });
          const fw = newWinners.filter((w: any) => w.eventId !== e.id);
          fw.push({ eventId: e.id, prize: e.prize, eventTitle: e.eventTitle || "", prizeImageUrl: e.prizeImageUrl || "", description: e.description || "", winnerUserName: winnerInfo.winnerUserName, winnerUserId: winnerInfo.winnerUserId, winnerPostId: winnerInfo.winnerPostId, closedAt: new Date().toISOString() });
          newWinners.length = 0;
          newWinners.push(...fw);
        }
        await kv.set("last_post_events_history", [...newEntries, ...history].slice(0, 100));
        await kv.set("last_event_winners", newWinners);
        await kv.set("last_post_events", []);
        try { await kv.del("last_post_event"); } catch {}
      }
      return c.json({ success: true, status: "stopped" });
    }

    if (action === "reset") {
      // 모든 활성 이벤트를 히스토리에 저장 후 완전 초기화
      const resetHistory: any[] = await kv.get("last_post_events_history") || [];
      const resetEntries = events.map((e: any) => ({
        ...e, active: false,
        stoppedAt: new Date().toISOString(),
        stoppedBy: user.id,
        reason: 'admin_reset',
      }));
      const newResetHistory = [...resetEntries, ...resetHistory].slice(0, 100);
      await kv.set("last_post_events_history", newResetHistory);

      // 이벤트 관련 KV 전부 초기화
      await kv.set("last_post_events", []);
      try { await kv.del("last_post_event"); } catch {}
      await kv.set("last_event_winners", []);
      await kv.set("last_event_disqualified", []);

      console.log(`[admin/reset] 이벤트 완전 리셋 by=${user.email}, clearedEvents=${events.length}`);
      return c.json({ success: true, status: "reset", clearedEvents: events.length });
    }

    if (action === "update") {
      const updated = events.map((e: any) => {
        if (e.id !== eventId) return e;
        const patch: any = {};
        if (sleepStart !== undefined) patch.sleepStart = Number(sleepStart);
        if (sleepEnd !== undefined) patch.sleepEnd = Number(sleepEnd);
        if (durationMinutes !== undefined) patch.durationMinutes = Number(durationMinutes);
        if (cardReductionSeconds !== undefined) patch.cardReductionSeconds = Number(cardReductionSeconds);
        if (cardSuccessRate !== undefined) patch.cardSuccessRate = Math.min(100, Math.max(1, Number(cardSuccessRate)));
        if (description !== undefined) patch.description = description;
        if (prize !== undefined) patch.prize = prize;
        if (eventTitle !== undefined) patch.eventTitle = eventTitle;
        if (prizeImageUrl !== undefined) patch.prizeImageUrl = prizeImageUrl;
        if (manualCardUser !== undefined) patch.manualCardUser = manualCardUser; // null = clear
        return { ...e, ...patch };
      });
      await kv.set("last_post_events", updated);
      const found = updated.find((e: any) => e.id === eventId);
      return c.json({ success: true, event: found });
    }

    if (action === "resume") {
      // 종료된 이벤트를 재개: 새 ID + 새 startedAt으로 다시 active 상태로 등록
      const { eventData } = body;
      if (!eventData) return c.json({ error: "eventData required" }, 400);

      const newEventId = `evt_${Date.now()}`;
      const resumedEvent: any = {
        ...eventData,
        id: newEventId,
        active: true,
        startedAt: new Date().toISOString(),
        startedBy: user.id,
        resumedFrom: eventData.id || null,
        reductionSeconds: 0,
        cardUsageLog: [],
      };
      delete resumedEvent.stoppedAt;
      delete resumedEvent.stoppedBy;

      await kv.set("last_post_events", [...events, resumedEvent]);

      // last_event_winners에서도 해당 이벤트 제거 (당첨 배너 숨기기)
      if (eventData.id) {
        try {
          const winners: any[] = await kv.get("last_event_winners") || [];
          const filteredWinners = winners.filter((w: any) => w.eventId !== eventData.id);
          await kv.set("last_event_winners", filteredWinners);
        } catch {}
      }

      console.log("[resume] 이벤트 재개:", resumedEvent);
      return c.json({ success: true, event: resumedEvent });
    }

    // action === 'start' - 새 이벤트 추가 (즉시 또는 예약)
    const newEventId = `evt_${Date.now()}`;
    const isScheduled = scheduledAt && new Date(scheduledAt).getTime() > Date.now();
    const newEvent = {
      id: newEventId,
      active: !isScheduled,
      scheduled: isScheduled ? true : undefined,
      scheduledAt: isScheduled ? scheduledAt : undefined,
      prize: prize || "상품",
      eventTitle: eventTitle || "",
      durationMinutes: durationMinutes || 60,
      description: description || "",
      prizeImageUrl: prizeImageUrl || "",
      reductionSeconds: 0,
      cardReductionSeconds: cardReductionSeconds !== undefined ? Number(cardReductionSeconds) : 300,
      cardSuccessRate: cardSuccessRate !== undefined ? Math.min(100, Math.max(1, Number(cardSuccessRate))) : 100,
      sleepStart: sleepStart !== undefined ? Number(sleepStart) : 0,
      sleepEnd: sleepEnd !== undefined ? Number(sleepEnd) : 8,
      startedAt: isScheduled ? undefined : new Date().toISOString(),
      startedBy: user.id,
    };

    // 첫 이벤트면 실격자 초기화
    if (events.length === 0) await kv.set("last_event_disqualified", []);

    await kv.set("last_post_events", [...events, newEvent]);
    return c.json({ success: true, event: newEvent });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// 이벤트 참여 제외 목록 조회 (관리자)
app.get("/make-server-0b7d3bae/admin/event-excluded-users", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);
    const list: any[] = await kv.get("event_excluded_users") || [];
    return c.json({ list });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 이벤트 참여 제외 추가 (관리자)
app.post("/make-server-0b7d3bae/admin/event-excluded-users", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);

    const { userId, email, userName, reason } = await c.req.json();
    if (!userId) return c.json({ error: "userId required" }, 400);

    const current: any[] = await kv.get("event_excluded_users") || [];
    if (current.some((e: any) => e.userId === userId)) return c.json({ ok: true, already: true });
    const updated = [...current, { userId, email: email || '', userName: userName || '', reason: reason || '', excludedAt: Date.now() }];
    await kv.set("event_excluded_users", updated);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 이벤트 참여 제외 해제 (관리자)
app.delete("/make-server-0b7d3bae/admin/event-excluded-users", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);

    const { userId } = await c.req.json();
    if (!userId) return c.json({ error: "userId required" }, 400);
    const current: any[] = await kv.get("event_excluded_users") || [];
    await kv.set("event_excluded_users", current.filter((e: any) => e.userId !== userId));
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 이벤트 히스토리 조회 (관리자)
app.get("/make-server-0b7d3bae/admin/last-post-events-history", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);
    const history: any[] = await kv.get("last_post_events_history") || [];
    return c.json(history);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// 이벤트 히스토리 당첨자 수동 수정 (관리자)
app.patch("/make-server-0b7d3bae/admin/last-post-events-history/:eventId", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const eventId = c.req.param("eventId");
    const { winnerUserName } = await c.req.json();
    const history: any[] = await kv.get("last_post_events_history") || [];
    const updated = history.map((h: any) =>
      h.id === eventId
        ? { ...h, winnerUserName: winnerUserName ?? null, winnerOverriddenAt: new Date().toISOString(), winnerOverriddenBy: user.id }
        : h
    );
    await kv.set("last_post_events_history", updated);
    // 활성 배너도 동기화
    const winners: any[] = await kv.get("last_event_winners") || [];
    const updatedWinners = winners.map((w: any) =>
      w.eventId === eventId ? { ...w, winnerUserName: winnerUserName ?? null } : w
    );
    await kv.set("last_event_winners", updatedWinners);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 이벤트 KV 원시값 디버그 (관리자)
app.get("/make-server-0b7d3bae/admin/last-post-events-debug", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    const eventsArr = await kv.get("last_post_events");
    const eventSingle = await kv.get("last_post_event");
    return c.json({ last_post_events: eventsArr, last_post_event: eventSingle });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// 이벤트 목록 조회 (관리자)
app.get("/make-server-0b7d3bae/admin/last-post-events", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    let events: any[] = await kv.get("last_post_events") || [];
    // fallback: 구 버전 단일 이벤트도 포함
    if (events.length === 0) {
      const legacy = await kv.get("last_post_event");
      if (legacy?.active) events = [legacy];
    }

    // 활성 이벤트에 lastPostAt(마지막 글 시각) 추가 — 정확한 타이머 계산용
    // getByPrefix 실패해도 이벤트 목록은 정상 반환하도록 별도 try-catch
    const hasActive = events.some((e: any) => e.active);
    if (hasActive) {
      try {
        const disqualified: string[] = await kv.get("last_event_disqualified") || [];
        const postsData = await kv.getByPrefix("beta_post_");
        const allPosts = postsData.map((d: any) => d.value).filter((p: any) => !p.isDraft);
        events = events.map((ev: any) => {
          if (!ev.active) return ev;
          const eventStart = new Date(ev.startedAt).getTime();
          const eligible = allPosts
            .filter((p: any) =>
              p.category === '이벤트' &&
              new Date(p.createdAt).getTime() >= eventStart &&
              !disqualified.includes(p.userId)
            )
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const lastPost = eligible[0] || null;
          return {
            ...ev,
            lastPostAt: lastPost ? lastPost.createdAt : null,
            lastPostUser: lastPost ? lastPost.userName : null,
          };
        });
      } catch (postErr) {
        console.log("[admin/last-post-events] lastPostAt 조회 실패, 이벤트 목록은 정상 반환:", String(postErr));
      }
    }

    return c.json({ events });
  } catch (e) {
    console.log("[admin/last-post-events] 오류:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// ── 이벤트 카테고리 공지(규칙사항) 조회 ──
app.get("/make-server-0b7d3bae/event-category-notice", async (c) => {
  try {
    const notice = await kv.get("event_category_notice") || null;
    return c.json({ notice });
  } catch (e) {
    console.log("[event-category-notice] 오류:", String(e));
    return c.json({ notice: null }, 500);
  }
});

// ── 이벤트 카테고리 공지(규칙사항) 저장 (관리자) ──
app.post("/make-server-0b7d3bae/admin/event-category-notice", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);

    const body = await c.req.json();
    const { content, title } = body;
    const notice = { content: content || "", title: title || "규칙사항", updatedAt: new Date().toISOString() };
    await kv.set("event_category_notice", notice);
    console.log("[admin/event-category-notice] 공지 저장");
    return c.json({ ok: true, notice });
  } catch (e) {
    console.log("[admin/event-category-notice] 오류:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// ── 도배·어뷰징 로그 기록 (인증 유저) ──
app.post("/make-server-0b7d3bae/spam-log", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

    const { actionType, content } = await c.req.json();
    const userName = await getUserName(user.id);

    const logs: any[] = (await kv.get("spam_logs")) || [];
    const now = new Date().toISOString();

    const existingIdx = logs.findIndex((l: any) => l.userId === user.id);
    if (existingIdx >= 0) {
      logs[existingIdx].count = (logs[existingIdx].count || 1) + 1;
      logs[existingIdx].lastAt = now;
      logs[existingIdx].actions = [
        ...(logs[existingIdx].actions || []),
        { type: actionType, at: now, preview: (content || "").slice(0, 60) },
      ].slice(-50);
    } else {
      logs.push({
        userId: user.id,
        userEmail: user.email || "",
        userName,
        count: 1,
        firstAt: now,
        lastAt: now,
        actions: [{ type: actionType, at: now, preview: (content || "").slice(0, 60) }],
        restricted: false,
      });
    }
    await kv.set("spam_logs", logs);
    console.log(`[spam-log] ${userName}(${user.email}) ${actionType} 도배 감지`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("[spam-log] 오류:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// ── 도배·어뷰징 로그 조회 (관리자) ──
app.get("/make-server-0b7d3bae/admin/spam-logs", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Forbidden" }, 403);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);

    const logs: any[] = (await kv.get("spam_logs")) || [];
    logs.sort((a: any, b: any) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    return c.json({ logs });
  } catch (e) {
    console.log("[admin/spam-logs] 오류:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// ── 커뮤니티 제한 토글 (관리자) ──
app.post("/make-server-0b7d3bae/admin/users/:userId/community-restrict", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Forbidden" }, 403);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);

    const targetUserId = c.req.param("userId");
    const { restrict, reason } = await c.req.json();

    if (restrict) {
      await kv.set(`community_restricted_${targetUserId}`, {
        restrictedAt: new Date().toISOString(),
        reason: reason || "도배·어뷰징 감지",
        restrictedBy: user.email,
      });
    } else {
      await kv.del(`community_restricted_${targetUserId}`);
    }

    const logs: any[] = (await kv.get("spam_logs")) || [];
    const idx = logs.findIndex((l: any) => l.userId === targetUserId);
    if (idx >= 0) {
      logs[idx].restricted = restrict;
      await kv.set("spam_logs", logs);
    }

    console.log(`[admin/community-restrict] userId=${targetUserId} restrict=${restrict}`);
    return c.json({ ok: true, restricted: restrict });
  } catch (e) {
    console.log("[admin/community-restrict] 오류:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

// ── 도배 로그 단일 항목 삭제 (관리자) ──
app.delete("/make-server-0b7d3bae/admin/spam-logs/:userId", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Forbidden" }, 403);
    const role = await getUserRole(user.id);
    if (role !== "admin" && user.email !== "sityplanner2@naver.com") return c.json({ error: "Forbidden" }, 403);

    const targetUserId = c.req.param("userId");
    const logs: any[] = (await kv.get("spam_logs")) || [];
    const updated = logs.filter((l: any) => l.userId !== targetUserId);
    await kv.set("spam_logs", updated);
    return c.json({ ok: true });
  } catch (e) {
    console.log("[admin/spam-logs DELETE] 오류:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});


// ===== 단체 메일 - 회원 수 조회 =====
app.get("/make-server-0b7d3bae/admin/bulk-mail/count", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);
    const allUsers = await getByPrefix('beta_user_');
    const emails = allUsers.map((item: any) => item.value?.email).filter((e: string) => e && e.includes('@'));
    return c.json({ count: emails.length });
  } catch (e) {
    console.error('bulk-mail count error:', e);
    return c.json({ error: String(e) }, 500);
  }
});

// ===== 단체 메일 - 이번 달 발송량 조회 =====
app.get("/make-server-0b7d3bae/admin/bulk-mail/usage", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);
    const month = new Date().toISOString().slice(0, 7);
    const data = (await kv.get(`bulk_mail_monthly_${month}`)) || { count: 0 };
    return c.json({ month, sentThisMonth: data.count || 0 });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ===== 단체 메일 - 수신자 이메일 목록 조회 =====
app.get("/make-server-0b7d3bae/admin/bulk-mail/recipients", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);
    const allUsers = await getByPrefix('beta_user_');
    const emails: string[] = allUsers
      .map((item: any) => ({ email: item.value?.email, name: item.value?.name || item.value?.username || '' }))
      .filter((u: any) => u.email && u.email.includes('@'))
      .map((u: any) => u.email);
    return c.json({ emails, count: emails.length });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ===== 단체 메일 실시간 스트리밍 발송 =====
app.post("/make-server-0b7d3bae/admin/bulk-mail/stream", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    const { subject, body: mailBody, isAd, offset = 0 } = await c.req.json();
    if (!subject?.trim() || !mailBody?.trim()) return c.json({ error: '제목과 내용을 입력해주세요' }, 400);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return c.json({ error: 'Resend API 키가 설정되지 않았어요' }, 500);

    const allUsers = await getByPrefix('beta_user_');
    const allEmails: string[] = allUsers
      .map((item: any) => item.value?.email)
      .filter((e: string) => e && e.includes('@'));
    const targetEmails = allEmails.slice(offset);
    const total = allEmails.length;

    const finalSubject = isAd ? `(광고) ${subject}` : subject;
    const footer = isAd ? `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;text-align:center"><p>본 메일은 보드라움 서비스 관련 광고성 정보입니다.</p><p>수신거부: <a href="mailto:sityplanner2@naver.com" style="color:#00BCD4">sityplanner2@naver.com</a></p><p>보드라움 · boardraum.site</p></div>` : '';
    const htmlBody = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">${mailBody}${footer}</div>`;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: object) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        let success = 0, fail = 0;
        let quotaExceeded = false;
        const BATCH = 10;

        for (let i = 0; i < targetEmails.length; i += BATCH) {
          if (quotaExceeded) break;
          const batch = targetEmails.slice(i, i + BATCH);
          const payload = batch.map((email: string) => ({
            from: '보드라움 <noreply@boardraum.site>',
            to: [email], subject: finalSubject, html: htmlBody,
          }));
          try {
            const res = await fetch('https://api.resend.com/emails/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
              body: JSON.stringify(payload),
            });
            if (res.ok) {
              for (const email of batch) { success++; emit({ type: 'progress', email, ok: true, success, fail, sent: success + fail, total: targetEmails.length }); }
            } else {
              const errText = await res.text();
              if (errText.includes('daily_quota_exceeded') || errText.includes('429')) { quotaExceeded = true; }
              for (const email of batch) { fail++; emit({ type: 'progress', email, ok: false, success, fail, sent: success + fail, total: targetEmails.length }); }
            }
          } catch {
            for (const email of batch) { fail++; emit({ type: 'progress', email, ok: false, success, fail, sent: success + fail, total: targetEmails.length }); }
          }
          if (i + BATCH < targetEmails.length) await new Promise(r => setTimeout(r, 200));
        }

        if (success > 0) {
          const monthKey = `bulk_mail_monthly_${new Date().toISOString().slice(0, 7)}`;
          const prev = (await kv.get(monthKey)) || { count: 0 };
          await kv.set(monthKey, { count: (prev.count || 0) + success, updatedAt: new Date().toISOString() });
        }

        const remaining = Math.max(0, total - (offset + success + fail));
        emit({ type: 'done', success, fail, total, remaining, quotaExceeded });
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
    });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ===== 단체 메일 발송 API =====
app.post("/make-server-0b7d3bae/admin/bulk-mail", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const role = await getUserRole(user.id);
    if (role !== 'admin' && user.email !== 'sityplanner2@naver.com') return c.json({ error: 'Forbidden' }, 403);

    // offset: 이어서 보낼 시작 인덱스, limit: 이번에 최대 발송 수
    const { subject, body, isAd, sampleOnly, sampleEmail, sampleEmails, offset = 0, limit = 99999 } = await c.req.json();
    if (!subject?.trim() || !body?.trim()) return c.json({ error: '제목과 내용을 입력해주세요' }, 400);

    const bulkResendKey = Deno.env.get('RESEND_API_KEY');
    if (!bulkResendKey) return c.json({ error: 'Resend API 키가 설정되지 않았어요' }, 500);

    // 샘플 발송 모드: 최대 10개 이메일에 개별 발송
    if (sampleOnly) {
      // sampleEmails 배열 우선, 없으면 sampleEmail 단일값 fallback
      const rawList: string[] = Array.isArray(sampleEmails) && sampleEmails.length > 0
        ? sampleEmails
        : sampleEmail ? [sampleEmail] : [];
      const validList = rawList.map((e: string) => e.trim()).filter((e: string) => e.includes('@')).slice(0, 10);
      if (validList.length === 0) return c.json({ error: '유효한 이메일 주소를 1개 이상 입력해주세요' }, 400);
      const finalSubject = isAd ? `(광고) [샘플] ${subject}` : `[샘플] ${subject}`;
      const sampleHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
        <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:8px 12px;margin-bottom:16px;font-size:12px;color:#92400e">
          ⚠️ 이것은 샘플 메일입니다. 실제 발송 전 테스트용이에요.
        </div>
        ${body}
      </div>`;
      const batchPayload = validList.map((email: string) => ({
        from: '보드라움 <noreply@boardraum.site>',
        to: [email],
        subject: finalSubject,
        html: sampleHtml,
      }));
      const res = validList.length === 1
        ? await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bulkResendKey}` },
            body: JSON.stringify(batchPayload[0]),
          })
        : await fetch('https://api.resend.com/emails/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bulkResendKey}` },
            body: JSON.stringify(batchPayload),
          });
      if (!res.ok) throw new Error('샘플 발송 실패: ' + await res.text());
      return c.json({ success: validList.length, fail: 0, total: validList.length, sample: true, sentTo: validList });
    }

    // 전체 가입 회원 이메일 수집
    const allUsers = await getByPrefix('beta_user_');
    const allEmails: string[] = allUsers
      .map((item: any) => item.value?.email)
      .filter((email: string) => email && email.includes('@'));

    const total = allEmails.length;
    // offset부터 limit개만 슬라이싱 (분할 발송 지원)
    const targetEmails = allEmails.slice(offset, offset + limit);

    const finalSubject = isAd ? `(광고) ${subject}` : subject;
    const unsubscribeFooter = isAd ? `
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;text-align:center">
        <p>본 메일은 보드라움 서비스 관련 광고성 정보입니다.</p>
        <p>수신거부를 원하시면 <a href="mailto:sityplanner2@naver.com" style="color:#00BCD4">sityplanner2@naver.com</a>으로 문의해주세요.</p>
        <p>보드라움 · boardraum.site</p>
      </div>` : '';

    const htmlBody = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
        ${body}
        ${unsubscribeFooter}
      </div>`;

    let success = 0, fail = 0;
    let quotaExceeded = false;

    // ★ 개인정보 보호: 각 수신자에게 개별 발송 (to에 1명씩)
    const BATCH = 100;
    for (let i = 0; i < targetEmails.length; i += BATCH) {
      const batch = targetEmails.slice(i, i + BATCH);
      const batchPayload = batch.map((email: string) => ({
        from: '보드라움 <noreply@boardraum.site>',
        to: [email],
        subject: finalSubject,
        html: htmlBody,
      }));
      try {
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bulkResendKey}` },
          body: JSON.stringify(batchPayload),
        });
        if (res.ok) {
          success += batch.length;
        } else {
          const errText = await res.text();
          console.error('Resend 배치 실패:', errText);
          // 일일 쿼터 초과 → 즉시 중단
          if (errText.includes('daily_quota_exceeded') || errText.includes('429')) {
            quotaExceeded = true;
            fail += batch.length;
            break;
          }
          fail += batch.length;
        }
      } catch (e) {
        fail += batch.length;
        console.error('Resend 배치 예외:', e);
      }
      if (i + BATCH < targetEmails.length) await new Promise(r => setTimeout(r, 500));
    }

    // 월간 발송량 KV 누적
    if (success > 0) {
      const monthKey = `bulk_mail_monthly_${new Date().toISOString().slice(0, 7)}`; // e.g. "2026-04"
      const prev = (await kv.get(monthKey)) || { count: 0 };
      await kv.set(monthKey, { count: (prev.count || 0) + success, updatedAt: new Date().toISOString() });
    }

    const nextOffset = offset + success + fail;
    const remaining = Math.max(0, total - nextOffset);
    console.log(`📧 발송: 성공 ${success}, 실패 ${fail}, 총 ${total}명, offset ${offset}→${nextOffset}, 남은 ${remaining}명${quotaExceeded ? ' [쿼터초과]' : ''}`);
    return c.json({ success, fail, total, offset, nextOffset, remaining, quotaExceeded });
  } catch (e) {
    console.error('bulk-mail error:', e);
    return c.json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});


// ─── 사이트 게임 DB 관리 API ───────────────────────────────────────────────

// 전체 목록 조회
// - site_game_* 우선, 없으면 각 유저별 게임 prefix로 수집 (user_전체 스캔 X)
app.get("/make-server-0b7d3bae/admin/site-games", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const gameMap: Record<string, any> = {};
    const ownerMap: Record<string, Set<string>> = {}; // gameKey → Set<userId>

    const normName = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
    const seenNames = new Set<string>();
    const nameToKey: Record<string, string> = {}; // normName → gameKey (이름으로 gameKey 역조회)

    const getGameKey = (g: any): string | null => {
      if (!g?.id && !(g?.bggId)) return null;
      const bggId = g.bggId != null ? String(g.bggId) : '';
      const id = g.id != null ? String(g.id) : '';
      return bggId && /^\d+$/.test(bggId) ? `bgg_${bggId}` : (id ? `id_${id}` : null);
    };

    const getUserId = (key: string): string | null => {
      const rest = key.slice(5); // "user_" 제거
      const gameIdx = rest.indexOf('_game_');
      if (gameIdx > 0) return rest.slice(0, gameIdx);
      if (rest.endsWith('_owned')) return rest.slice(0, rest.length - 6);
      if (rest.endsWith('_wishlist')) return rest.slice(0, rest.length - 9);
      return null;
    };

    const trackOwner = (g: any, userId: string | null) => {
      if (!userId) return;
      const gk = getGameKey(g);
      if (!gk) {
        // bggId 없는 경우 이름으로 역조회
        const kn = normName(g.koreanName || g.name || '');
        const en = normName(g.englishName || '');
        const k = nameToKey[kn] || nameToKey[en];
        if (k) { if (!ownerMap[k]) ownerMap[k] = new Set(); ownerMap[k].add(userId); }
        return;
      }
      // gameKey가 gameMap에 없으면 이름으로 역조회
      const actualKey = gameMap[gk] ? gk : (nameToKey[normName(g.koreanName || g.name || '')] || nameToKey[normName(g.englishName || '')] || gk);
      if (!ownerMap[actualKey]) ownerMap[actualKey] = new Set();
      ownerMap[actualKey].add(userId);
    };

    const addGame = (g: any, source: string) => {
      if (!g?.id || !(g.koreanName || g.englishName || g.name)) return;
      const bggIdStr = g.bggId != null ? String(g.bggId) : '';
      const idKey = bggIdStr && /^\d+$/.test(bggIdStr) ? `bgg_${bggIdStr}` : `id_${String(g.id)}`;
      if (gameMap[idKey]) return;
      const kn = normName(g.koreanName || g.name || '');
      const en = normName(g.englishName || '');
      if (kn && seenNames.has(kn)) return;
      if (en && seenNames.has(en)) return;
      if (kn) { seenNames.add(kn); nameToKey[kn] = idKey; }
      if (en) { seenNames.add(en); nameToKey[en] = idKey; }
      gameMap[idKey] = {
        id: g.id, bggId: g.bggId,
        koreanName: g.koreanName, englishName: g.englishName,
        name: g.koreanName || g.englishName || g.name,
        imageUrl: g.imageUrl || g.thumbnail || '',
        yearPublished: g.yearPublished, _source: source,
      };
    };

    // 1) site_game_* — 최우선
    const siteData = await getByPrefix('site_game_');
    for (const { value: g } of siteData) {
      if (!g?.id) continue;
      const _b = g.bggId != null ? String(g.bggId) : '';
      const key = _b && /^\d+$/.test(_b) ? `bgg_${_b}` : `id_${String(g.id)}`;
      gameMap[key] = { ...g, _source: 'site' };
      const kn = normName(g.koreanName || g.name || '');
      const en = normName(g.englishName || '');
      if (kn) { seenNames.add(kn); nameToKey[kn] = key; }
      if (en) { seenNames.add(en); nameToKey[en] = key; }
    }

    // 2) 유저 컬렉션 전체 스캔 + 소유자 카운팅
    const allUserItems = await kv.getByPrefixWithKeys('user_');
    for (const { key, value } of allUserItems) {
      if (key.includes('_backup') || key.includes('_metadata') || key.includes('_temp')) continue;
      const userId = getUserId(key);
      if (Array.isArray(value)) {
        for (const g of value) { addGame(g, 'user'); trackOwner(g, userId); }
      } else if (value && typeof value === 'object' && key.match(/_game_[^_]+$/)) {
        addGame(value, 'user'); trackOwner(value, userId);
      }
    }

    const games = Object.values(gameMap).map((g: any) => {
      const _kb = g.bggId != null ? String(g.bggId) : '';
      const key = _kb && /^\d+$/.test(_kb) ? `bgg_${_kb}` : `id_${String(g.id)}`;
      return { ...g, ownerCount: ownerMap[key]?.size || 0 };
    }).sort((a: any, b: any) =>
      (a.koreanName || a.englishName || '').localeCompare(b.koreanName || b.englishName || '', 'ko')
    );
    return c.json(games);
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 게임 소유자 목록
app.get("/make-server-0b7d3bae/admin/site-games/:id/owners", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const gameId = c.req.param('id');
    const sid = String(gameId);
    const normGame = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '');

    // 프론트에서 넘긴 값 우선 사용, 없으면 site_game_* 조회
    const qBggId = c.req.query('bggId') || '';
    const qKorean = c.req.query('koreanName') || '';
    const qEnglish = c.req.query('englishName') || '';

    const siteGame = (!qKorean && !qEnglish) ? await kv.get(`site_game_${gameId}`) : null;
    const siteBggId = qBggId || (siteGame?.bggId ? String(siteGame.bggId) : '');
    const tn = normGame(qKorean || siteGame?.koreanName || siteGame?.name || '');
    const te = normGame(qEnglish || siteGame?.englishName || '');

    const owners: any[] = [];
    const seenUserIds = new Set<string>();

    const getUserId = (key: string): string | null => {
      const rest = key.slice(5);
      const gameIdx = rest.indexOf('_game_');
      if (gameIdx > 0) return rest.slice(0, gameIdx);
      if (rest.endsWith('_owned')) return rest.slice(0, rest.length - 6);
      if (rest.endsWith('_wishlist')) return rest.slice(0, rest.length - 9);
      return null;
    };

    const hasGame = (g: any): boolean => {
      if (!g?.id) return false;
      const gid = String(g.id);
      const gbgg = g.bggId ? String(g.bggId) : '';
      // ID / bggId 직접 매칭
      if (gid === sid) return true;
      if (siteBggId && (gid === siteBggId || gbgg === siteBggId)) return true;
      if (gbgg && gbgg === sid) return true;
      // 이름 기반 폴백
      const gkn = normGame(g.koreanName || g.name || '');
      const gen = normGame(g.englishName || '');
      if (tn && (gkn === tn || gen === tn)) return true;
      if (te && (gkn === te || gen === te)) return true;
      return false;
    };

    const allUserItems = await kv.getByPrefixWithKeys('user_');

    // siteBggId/tn 미확정 시 user collections에서 id 매칭 게임 찾아 bggId/name 추출
    if (!siteBggId || !tn) {
      for (const { key, value } of allUserItems) {
        if (key.includes('_backup') || key.includes('_profile_')) continue;
        const games = Array.isArray(value) ? value : (value?.id ? [value] : []);
        const found = games.find((g: any) => g?.id && String(g.id) === sid);
        if (found) {
          if (!siteBggId && found.bggId) siteBggId = String(found.bggId);
          if (!tn && found.koreanName) tn = normGame(found.koreanName);
          if (!te && found.englishName) te = normGame(found.englishName);
          if (siteBggId && tn) break;
        }
      }
    }

    const userProfileMap: Record<string, any> = {};

    // beta_user_* → email, name, username
    const betaUsers = await kv.getByPrefixWithKeys('beta_user_');
    for (const { value: u } of betaUsers) {
      const uid = u?.userId || u?.id;
      if (uid) userProfileMap[uid] = { ...userProfileMap[uid], ...u };
    }
    // user_profile_* → profileImage, 최신 닉네임 등
    const profileItems = await kv.getByPrefixWithKeys('user_profile_');
    for (const { value: p } of profileItems) {
      const uid = p?.userId || p?.id;
      if (uid) userProfileMap[uid] = { ...userProfileMap[uid], ...p };
    }

    for (const { key, value } of allUserItems) {
      if (key.includes('_backup') || key.includes('_metadata') || key.includes('_temp') || key.includes('_profile_')) continue;
      const userId = getUserId(key);
      if (!userId || seenUserIds.has(userId)) continue;
      const games = Array.isArray(value) ? value : (value?.id ? [value] : []);
      if (games.some(hasGame)) {
        seenUserIds.add(userId);
        const profile = userProfileMap[userId];
        owners.push({
          userId,
          userName: profile?.username || profile?.userName || profile?.nickname || profile?.name || userId.slice(0, 8),
          email: profile?.email || '',
          userAvatar: profile?.profileImage || profile?.userAvatar || null,
        });
      }
    }

    return c.json({ owners, total: owners.length });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 게임 수정
app.put("/make-server-0b7d3bae/admin/site-games/:gameId", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const gameId = c.req.param('gameId');
    const body = await c.req.json();
    const existing = await kv.get(`site_game_${gameId}`);
    if (!existing) return c.json({ error: '게임을 찾을 수 없어요' }, 404);
    await kv.set(`site_game_${gameId}`, { ...existing, ...body, id: gameId });
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 게임 삭제
app.delete("/make-server-0b7d3bae/admin/site-games/:gameId", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const gameId = c.req.param('gameId');
    await kv.del(`site_game_${gameId}`);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 직접등록 게임 → BGG 게임으로 마이그레이션
// 1) site_game_{bggId} 업서트  2) user_* 컬렉션 교체  3) 게시물 태그 교체  4) 원본 삭제
app.post("/make-server-0b7d3bae/admin/site-games/:id/migrate-to-bgg", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const fromId = c.req.param('id');
    const { bggId: rawBggId } = await c.req.json();
    const bggId = String(rawBggId || '');
    if (!bggId || !/^\d+$/.test(bggId)) return c.json({ error: '유효한 BGG ID가 필요해요' }, 400);
    if (fromId === bggId) return c.json({ error: '같은 게임이에요' }, 400);

    // site_game_* 없어도 진행 가능 (user 컬렉션에만 있는 게임 포함)
    let fromGame = await kv.get(`site_game_${fromId}`);
    // site_game_ 없으면 user 컬렉션에서 게임 정보 찾기
    if (!fromGame) {
      const allUserItems = await kv.getByPrefixWithKeys('user_');
      outer: for (const { key, value } of allUserItems) {
        if (key.includes('_backup') || key.includes('_metadata')) continue;
        const games = Array.isArray(value) ? value : (value?.id ? [value] : []);
        for (const g of games) {
          if (g?.id === fromId || g?.bggId === fromId) { fromGame = g; break outer; }
        }
      }
    }

    const bggDetails = await kv.get(`bgg_details_${bggId}`);
    const toName = (fromGame?.koreanName || fromGame?.name) || bggDetails?.koreanName || bggDetails?.name || '';
    const toEnglish = bggDetails?.name || fromGame?.englishName || '';
    const rawImg = bggDetails?.imageUrl || fromGame?.imageUrl || '';
    const toImage = rawImg.startsWith('//') ? 'https:' + rawImg : rawImg;

    // 1. site_game_{bggId} 업서트 (한글명은 직접등록명 우선 유지)
    const existingBgg = await kv.get(`site_game_${bggId}`);
    await kv.set(`site_game_${bggId}`, {
      ...(existingBgg || {}),
      id: bggId, bggId,
      koreanName: existingBgg?.koreanName || toName,
      englishName: existingBgg?.englishName || toEnglish,
      imageUrl: existingBgg?.imageUrl || toImage,
      yearPublished: existingBgg?.yearPublished || bggDetails?.yearPublished || fromGame.yearPublished || '',
    });

    // 2. user_* 컬렉션에서 fromId → bggId 교체
    const allUserItems = await kv.getByPrefixWithKeys('user_');
    let updatedUsers = 0;
    for (const { key, value } of allUserItems) {
      if (!value) continue;
      if (key.includes('_backup') || key.includes('_last_modified') ||
          key.includes('_timestamp') || key.includes('_metadata') || key.includes('_temp')) continue;
      if (Array.isArray(value)) {
        let changed = false;
        const updated = value.map((g: any) => {
          if (g?.id === fromId || g?.bggId === fromId) {
            changed = true;
            return { ...g, id: bggId, bggId, koreanName: toName, englishName: toEnglish, imageUrl: g.imageUrl || toImage };
          }
          return g;
        });
        if (changed) { await kv.set(key, updated); updatedUsers++; }
      } else if (value?.id === fromId || value?.bggId === fromId) {
        await kv.set(key, { ...value, id: bggId, bggId, koreanName: toName, englishName: toEnglish, imageUrl: value.imageUrl || toImage });
        updatedUsers++;
      }
    }

    // 3. 게시물 linkedGames/linkedGame 교체
    const allPosts = await kv.getByPrefixWithKeys('beta_post_');
    let updatedPosts = 0;
    for (const { key, value: post } of allPosts) {
      if (!post) continue;
      let changed = false;
      const newLinkedGames = Array.isArray(post.linkedGames)
        ? post.linkedGames.map((g: any) => {
            if (g.id === fromId || g.bggId === fromId) {
              changed = true;
              return { ...g, id: bggId, bggId, name: toName, imageUrl: g.imageUrl || toImage };
            }
            return g;
          })
        : post.linkedGames;
      let newLinkedGame = post.linkedGame;
      if (post.linkedGame?.id === fromId || post.linkedGame?.bggId === fromId) {
        changed = true;
        newLinkedGame = { ...post.linkedGame, id: bggId, bggId, name: toName, imageUrl: post.linkedGame.imageUrl || toImage };
      }
      if (changed) { await kv.set(key, { ...post, linkedGames: newLinkedGames, linkedGame: newLinkedGame }); updatedPosts++; }
    }

    // 4. 원본 삭제
    await kv.del(`site_game_${fromId}`);

    return c.json({ success: true, updatedUsers, updatedPosts });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 게임 통합 (from → to로 합치고 from 삭제)
app.post("/make-server-0b7d3bae/admin/site-games/merge", async (c) => {
  const { user, error } = await requireAdmin(c);
  if (error) return error;
  try {
    const { fromId, toId } = await c.req.json();
    if (!fromId || !toId) return c.json({ error: 'fromId, toId 필요' }, 400);

    // site_game_* 우선, 없으면 user 컬렉션에서 게임 정보 조회
    const findGame = async (id: string) => {
      const site = await kv.get(`site_game_${id}`);
      if (site) return site;
      const allUserItems = await kv.getByPrefixWithKeys('user_');
      for (const { key, value } of allUserItems) {
        if (key.includes('_backup') || key.includes('_metadata')) continue;
        const games = Array.isArray(value) ? value : (value?.id ? [value] : []);
        for (const g of games) {
          if (g?.id === id || g?.bggId === id) return g;
        }
      }
      return null;
    };

    const [from, to] = await Promise.all([findGame(fromId), findGame(toId)]);
    if (!from || !to) return c.json({ error: '게임을 찾을 수 없어요' }, 404);

    // bggId: 진짜 숫자 BGG id만 유지, 없으면 null (toId fallback 금지 — 숫자 toId가 BGG 게임으로 오분류됨)
    const isRealBggId = (id: any) => id && /^\d+$/.test(String(id)) && String(id) !== String(to.id) && String(id) !== String(from.id);
    const mergedBggId = isRealBggId(to.bggId) ? to.bggId : isRealBggId(from.bggId) ? from.bggId : (to.bggId || from.bggId || null);

    const mergedData = {
      id: toId,
      bggId: mergedBggId,
      koreanName: to.koreanName || from.koreanName || '',
      englishName: to.englishName || from.englishName || '',
      name: to.koreanName || from.koreanName || '',
      imageUrl: to.imageUrl || from.imageUrl || '',
      yearPublished: to.yearPublished || from.yearPublished || '',
    };

    // site_game_ 업서트 (to 게임 보강)
    await kv.set(`site_game_${toId}`, mergedData);
    // from site_game_ 삭제 (없어도 무방)
    await kv.del(`site_game_${fromId}`);

    const toName = mergedData.koreanName || mergedData.name || '';
    const toImage = mergedData.imageUrl || '';

    // user 컬렉션에서 fromId → toId 교체
    const allUserItems = await kv.getByPrefixWithKeys('user_');
    let updatedUsers = 0;
    for (const { key, value } of allUserItems) {
      if (!value || key.includes('_backup') || key.includes('_metadata') || key.includes('_temp')) continue;
      if (Array.isArray(value)) {
        let changed = false;
        const updated = value.map((g: any) => {
          if (g?.id === fromId || g?.bggId === fromId) {
            changed = true;
            return { ...g, id: toId, bggId: mergedData.bggId, koreanName: toName, imageUrl: g.imageUrl || toImage };
          }
          return g;
        });
        if (changed) { await kv.set(key, updated); updatedUsers++; }
      } else if (value?.id === fromId || value?.bggId === fromId) {
        await kv.set(key, { ...value, id: toId, bggId: mergedData.bggId, koreanName: toName, imageUrl: value.imageUrl || toImage });
        updatedUsers++;
      }
    }

    // 게시물 태그 교체
    const allPosts = await kv.getByPrefixWithKeys('beta_post_');
    let updatedPosts = 0;
    for (const { key, value: post } of allPosts) {
      if (!post) continue;
      let changed = false;
      let newLinkedGames = post.linkedGames;
      if (Array.isArray(post.linkedGames)) {
        newLinkedGames = post.linkedGames.map((g: any) => {
          if (g.id === fromId || g.bggId === fromId) {
            changed = true;
            return { ...g, id: toId, bggId: mergedData.bggId, name: toName, imageUrl: g.imageUrl || toImage };
          }
          return g;
        });
      }
      let newLinkedGame = post.linkedGame;
      if (post.linkedGame?.id === fromId || post.linkedGame?.bggId === fromId) {
        changed = true;
        newLinkedGame = { ...post.linkedGame, id: toId, bggId: mergedData.bggId, name: toName, imageUrl: post.linkedGame.imageUrl || toImage };
      }
      if (changed) { await kv.set(key, { ...post, linkedGames: newLinkedGames, linkedGame: newLinkedGame }); updatedPosts++; }
    }

    return c.json({ success: true, updatedUsers, updatedPosts });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});


// ─── sitemap.xml 생성 ─────────────────────────────────────────────────────────
app.get("/make-server-0b7d3bae/sitemap.xml", async (c) => {
  const SITE = 'https://boardraum.site';
  try {
    const urls: string[] = [];

    // 메인
    urls.push(`  <url>\n    <loc>${SITE}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`);

    // 게임 URL (site_game_ + game_custom_ 양쪽 수집, 이름 중복 제거)
    const gameNames = new Set<string>();
    try {
      const siteGames = await getByPrefix('site_game_');
      for (const { value: g } of siteGames) {
        const name = g?.koreanName || g?.englishName || g?.name;
        if (name) gameNames.add(name);
      }
    } catch {}
    try {
      const customGames = await getByPrefix('game_custom_');
      for (const { value: g } of customGames) {
        const name = g?.gameName || g?.koreanName || g?.englishName;
        if (name) gameNames.add(name);
      }
    } catch {}
    for (const name of gameNames) {
      urls.push(`  <url>\n    <loc>${SITE}/game/${encodeURIComponent(name)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
    }

    // 최근 게시글 100개
    try {
      const allPosts = await getByPrefix('beta_post_');
      const published = allPosts
        .map((item: any) => item?.value ?? item)
        .filter((p: any) => p && !p.isDraft && !p.isPrivate && p.id)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 100);
      for (const p of published) {
        const lastmod = p.updatedAt || p.createdAt;
        urls.push(`  <url>\n    <loc>${SITE}/post/${p.id}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>${lastmod ? `\n    <lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>` : ''}\n  </url>`);
      }
    } catch {}

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
    return new Response(xml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
    });
  } catch {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc></url></urlset>`, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
});


// ─── 사이트 게임 직접 등록 (보드위키 등록 시) ─────────────────────────────────
app.post("/make-server-0b7d3bae/site-games/register", async (c) => {
  try {
    const { game } = await c.req.json();
    if (!game?.id) return c.json({ error: 'game.id 필요' }, 400);
    const siteKey = `site_game_${game.id}`;
    const existing = await kv.get(siteKey);
    const rawImg = game.imageUrl || game.thumbnail || '';
    const cleanImg = rawImg.startsWith('//') ? 'https:' + rawImg : rawImg;
    if (!existing) {
      await kv.set(siteKey, {
        id: game.id,
        bggId: game.bggId || game.id,
        koreanName: game.koreanName || game.name || '',
        englishName: game.englishName || '',
        name: game.koreanName || game.name || '',
        imageUrl: cleanImg,
        yearPublished: game.yearPublished || '',
        registeredAt: Date.now(),
      });
    } else {
      // 기존 데이터에 koreanName 없으면 보완
      if (!existing.koreanName && (game.koreanName || game.name)) {
        await kv.set(siteKey, { ...existing, koreanName: game.koreanName || game.name, name: game.koreanName || game.name });
      }
    }
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});


// ─── 트렌딩 블랙리스트 관리 (관리자) ─────────────────────────────────────────
app.post("/make-server-0b7d3bae/admin/trending-blacklist", async (c) => {
  try {
    await requireAdmin(c);
    const { gameId, action } = await c.req.json(); // action: 'add' | 'remove'
    const blacklist: string[] = (await kv.get('trending_blacklist')) || [];
    let updated: string[];
    if (action === 'add') {
      updated = blacklist.includes(gameId) ? blacklist : [...blacklist, gameId];
    } else {
      updated = blacklist.filter((id: string) => id !== gameId);
    }
    await kv.set('trending_blacklist', updated);
    // 캐시 무효화
    await kv.del('trending_games_cache').catch(() => {});
    return c.json({ success: true, blacklist: updated });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});


// ─── 트렌딩 캐시 강제 삭제 ─────────────────────────────────────────────────────
app.post("/make-server-0b7d3bae/admin/trending-cache-clear", async (c) => {
  try {
    await requireAdmin(c);
    await kv.del('trending_games_cache').catch(() => {});
    return c.json({ success: true, message: '트렌딩 캐시가 삭제되었어요' });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 일반 사용자도 캐시 갱신 가능 (rate limit 없음 - 트렌딩 조회 시 자동 갱신)
app.delete("/make-server-0b7d3bae/trending-games/cache", async (c) => {
  try {
    await kv.del('trending_games_cache').catch(() => {});
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEO Prerender Endpoint - 크롤러용 메타태그 HTML 반환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SITE_URL = 'https://boardraum.site';
const DEFAULT_TITLE = '보드라움 - 보드게임 컬렉션 관리 커뮤니티';
const DEFAULT_DESC = '보드게임 컬렉션을 관리하고, 위시리스트를 만들고, 보드게이머들과 소통하는 커뮤니티. 보드라움에서 내 보드게임을 정리해보세요.';
const DEFAULT_IMAGE = `${SITE_URL}/icon.png`;

function buildPrerenderHTML(opts: {
  title: string; desc: string; url: string; image: string;
  jsonLd?: Record<string, any>;
}) {
  const { title, desc, url, image, jsonLd } = opts;
  const jsonLdScript = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : '';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(desc)}"/>
<meta name="robots" content="index, follow"/>
<link rel="canonical" href="${escHtml(url)}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="보드라움"/>
<meta property="og:title" content="${escHtml(title)}"/>
<meta property="og:description" content="${escHtml(desc)}"/>
<meta property="og:image" content="${escHtml(image)}"/>
<meta property="og:url" content="${escHtml(url)}"/>
<meta property="og:locale" content="ko_KR"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escHtml(title)}"/>
<meta name="twitter:description" content="${escHtml(desc)}"/>
<meta name="twitter:image" content="${escHtml(image)}"/>
${jsonLdScript}
</head>
<body>
<h1>${escHtml(title)}</h1>
<p>${escHtml(desc)}</p>
<p><a href="${escHtml(url)}">보드라움에서 보기</a></p>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

app.get("/make-server-0b7d3bae/prerender", async (c) => {
  const path = c.req.query('path') || '/';
  try {
    const gameMatch = path.match(/^\/game\/([^/]+)$/);
    if (gameMatch) {
      const gameName = decodeURIComponent(gameMatch[1]);
      let imageUrl = DEFAULT_IMAGE;
      let gameDesc = `${gameName} 보드게임 정보, 리뷰, 평점, 게시물을 보드라움에서 확인하세요.`;
      try {
        const allGames = await getByPrefix('game_custom_');
        const found = allGames.find((g: any) => {
          const v = g.value;
          return v && (v.gameName === gameName || v.koreanName === gameName || v.englishName === gameName);
        });
        if (found?.value?.imageUrl) imageUrl = found.value.imageUrl;
        if (found?.value?.description) gameDesc = found.value.description;
      } catch {}
      const title = `${gameName} - 보드게임 정보 | 보드라움`;
      const url = `${SITE_URL}/game/${encodeURIComponent(gameName)}`;
      return c.html(buildPrerenderHTML({
        title, desc: gameDesc, url, image: imageUrl,
        jsonLd: {
          '@context': 'https://schema.org', '@type': 'Game',
          name: gameName, description: gameDesc, image: imageUrl, url,
          publisher: { '@type': 'Organization', name: '보드라움', url: SITE_URL },
        },
      }));
    }

    const postMatch = path.match(/^\/post\/([^/]+)$/);
    if (postMatch) {
      const postId = decodeURIComponent(postMatch[1]);
      const post = await kv.get(`beta_post_${postId}`) as any;
      if (post && !post.isDraft) {
        const content = (post.content || '').replace(/\n/g, ' ');
        const truncated = content.slice(0, 50);
        const gameName = post.linkedGame?.name || post.linkedGames?.[0]?.name;
        const title = gameName ? `${gameName} - ${truncated} | 보드라움` : `${truncated} | 보드라움`;
        const desc = content.slice(0, 150);
        const image = post.images?.[0] || DEFAULT_IMAGE;
        const url = `${SITE_URL}/post/${postId}`;
        return c.html(buildPrerenderHTML({
          title, desc, url, image,
          jsonLd: {
            '@context': 'https://schema.org', '@type': 'SocialMediaPosting',
            headline: title, description: desc, image, url,
            datePublished: post.createdAt,
            author: { '@type': 'Person', name: post.userName || '보드라움 사용자' },
            publisher: { '@type': 'Organization', name: '보드라움', url: SITE_URL },
          },
        }));
      }
    }

    return c.html(buildPrerenderHTML({
      title: DEFAULT_TITLE, desc: DEFAULT_DESC,
      url: SITE_URL, image: DEFAULT_IMAGE,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'WebApplication',
        name: '보드라움', url: SITE_URL, description: DEFAULT_DESC,
        image: DEFAULT_IMAGE, inLanguage: 'ko',
      },
    }));
  } catch (e) {
    return c.html(buildPrerenderHTML({
      title: DEFAULT_TITLE, desc: DEFAULT_DESC,
      url: SITE_URL, image: DEFAULT_IMAGE,
    }));
  }
});


// 카드 선물 통계 조회 (공개)
app.get("/make-server-0b7d3bae/last-post-event/card-stats", async (c) => {
  try {
    const eventId = c.req.query("eventId");
    if (!eventId) return c.json({ gift: null, topUser: null, ranking: [] });
    const stats: any = await kv.get(`last_post_event_card_stats_${eventId}`) || {};
    const allEvents: any[] = await kv.get("last_post_events") || [];
    const history: any[] = await kv.get("last_post_events_history") || [];
    const target = [...allEvents, ...history].find((e: any) => e.id === eventId);
    const countMap: Record<string, { userId: string; userName: string; count: number }> = {};
    for (const entry of (target?.cardUsageLog || [])) {
      const key = entry.userId || entry.email || entry.userName;
      if (!key) continue;
      if (!countMap[key]) countMap[key] = { userId: entry.userId || key, userName: entry.userName || entry.email || key, count: 0 };
      countMap[key].count++;
    }
    const ranking = Object.values(countMap).sort((a: any, b: any) => b.count - a.count);
    return c.json({ gift: stats.gift || null, cardGiftImageUrl: stats.cardGiftImageUrl || null, topUser: ranking[0] || null, ranking });
  } catch { return c.json({ gift: null, topUser: null, ranking: [] }); }
});

// 카드 선물 설정 (관리자)
app.post("/make-server-0b7d3bae/admin/last-post-event/card-gift", async (c) => {
  const { error: adminError } = await requireAdmin(c);
  if (adminError) return adminError;
  try {
    const { eventId, gift, cardGiftImageUrl } = await c.req.json();
    if (!eventId) return c.json({ error: "eventId required" }, 400);
    const existing: any = await kv.get(`last_post_event_card_stats_${eventId}`) || {};
    const patch: any = { ...existing, gift: gift ?? '' };
    if (cardGiftImageUrl !== undefined) patch.cardGiftImageUrl = cardGiftImageUrl;
    await kv.set(`last_post_event_card_stats_${eventId}`, patch);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 임시: 카드 사용 로그 복원 (관리자)
app.post("/make-server-0b7d3bae/admin/restore-card-log", async (c) => {
  const { error: adminError } = await requireAdmin(c);
  if (adminError) return adminError;
  try {
    const { eventId, entries } = await c.req.json();
    if (!eventId || !Array.isArray(entries)) return c.json({ error: "eventId and entries required" }, 400);
    const events: any[] = await kv.get("last_post_events") || [];
    const idx = events.findIndex((e: any) => e.id === eventId);
    if (idx < 0) return c.json({ error: "event not found" }, 404);
    events[idx] = { ...events[idx], cardUsageLog: entries };
    await kv.set("last_post_events", events);
    return c.json({ success: true, count: entries.length });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// ── 게임피드 새 글 뱃지: 사용자 보유/위시 게임별 배지 조회 ──
app.get("/make-server-0b7d3bae/game-feed-badges", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ badgeGameIds: [] });
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ badgeGameIds: [] });

    const gameIdsParam = c.req.query("gameIds") || "";
    const gameIds = gameIdsParam.split(",").map(s => s.trim()).filter(Boolean);
    if (gameIds.length === 0) return c.json({ badgeGameIds: [] });

    // 두 번의 prefix scan으로 전체 데이터 가져오기
    const [allLatest, allCleared] = await Promise.all([
      kv.getByPrefixWithKeys("game_feed_latest_"),
      kv.getByPrefixWithKeys(`user_game_feed_badge_${user.id}_`),
    ]);
    const latestMap: Record<string, string> = {};
    for (const { key, value } of allLatest) {
      const gameId = key.replace("game_feed_latest_", "");
      if (value?.createdAt) latestMap[gameId] = value.createdAt;
    }
    const clearedMap: Record<string, string> = {};
    for (const { key, value } of allCleared) {
      const gameId = key.replace(`user_game_feed_badge_${user.id}_`, "");
      if (value?.clearedAt) clearedMap[gameId] = value.clearedAt;
    }

    const now = Date.now();
    const badgeGameIds: string[] = [];
    for (const gameId of gameIds) {
      const latestAt = latestMap[gameId];
      if (!latestAt) continue;
      if (now - new Date(latestAt).getTime() > 86400000) continue; // 24h 지나면 소멸
      const clearedAt = clearedMap[gameId];
      if (!clearedAt || new Date(clearedAt) < new Date(latestAt)) {
        badgeGameIds.push(gameId);
      }
    }
    return c.json({ badgeGameIds });
  } catch (e) {
    return c.json({ badgeGameIds: [] });
  }
});

// ── 게임피드 새 글 뱃지: 읽음 처리 ──
app.post("/make-server-0b7d3bae/game-feed-badge/mark-read", async (c) => {
  try {
    const accessToken = c.req.header("Authorization")?.split(" ")[1];
    if (!accessToken) return c.json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json();
    const ids: string[] = Array.isArray(body.gameIds)
      ? body.gameIds
      : body.gameId ? [body.gameId] : [];
    if (ids.length === 0) return c.json({ success: true });

    const now = new Date().toISOString();
    const keys = ids.map(id => `user_game_feed_badge_${user.id}_${id}`);
    const values = ids.map(() => ({ clearedAt: now }));
    await kv.mset(keys, values);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ─── Staff / Operator API (staff_ KV prefix only) ────────────────────────────

async function requireStaffAdmin(c: any): Promise<{ user: any } | Response> {
  const token = (c.req.header('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
  const role = await getUserRole(user.id, user.email ?? '');
  if (role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  return { user };
}

app.get('/make-server-0b7d3bae/staff/list', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const members = (await kv.get('staff_members')) ?? [];
    return c.json({ members });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 공개: 운영진 등급 맵 (userId → level), 인증 불필요
app.get('/make-server-0b7d3bae/staff/grade-map', async (c) => {
  try {
    const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
    const map: Record<string, number> = {};
    for (const m of members) {
      if (m.userId && m.level) map[m.userId] = m.level;
    }
    return c.json({ map });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.post('/make-server-0b7d3bae/staff/add', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const { userId, nickname, level } = await c.req.json();
    if (!userId || !nickname) return c.json({ error: 'userId and nickname required' }, 400);
    const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
    if (members.find((m: any) => m.userId === userId)) return c.json({ error: 'Already a staff member' }, 409);
    members.push({ userId, nickname, level: level ?? 1, joinedAt: new Date().toISOString() });
    await kv.set('staff_members', members);
    return c.json({ success: true, members });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.post('/make-server-0b7d3bae/staff/remove', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const { userId } = await c.req.json();
    if (!userId) return c.json({ error: 'userId required' }, 400);
    const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
    const next = members.filter((m: any) => m.userId !== userId);
    await kv.set('staff_members', next);
    return c.json({ success: true, members: next });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.get('/make-server-0b7d3bae/staff/equity', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const equity = (await kv.get('staff_equity')) ?? {};
    return c.json({ equity });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.post('/make-server-0b7d3bae/staff/equity', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const { equity } = await c.req.json();
    if (!equity || typeof equity !== 'object') return c.json({ error: 'equity object required' }, 400);
    await kv.set('staff_equity', equity);
    return c.json({ success: true, equity });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.get('/make-server-0b7d3bae/staff/activity/:userId', async (c) => {
  try {
    const token = (c.req.header('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
    const userId = c.req.param('userId');
    // 관리자 또는 본인만 조회 가능
    const role = await getUserRole(user.id, user.email ?? '');
    const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
    const isSelf = user.id === userId;
    const isAdminUser = role === 'admin';
    const isStaffMember = members.some((m: any) => m.userId === user.id);
    if (!isAdminUser && !isSelf && !isStaffMember) return c.json({ error: 'Forbidden' }, 403);
    const logs = (await kv.get(`staff_activity_${userId}`)) ?? [];
    return c.json({ logs });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.post('/make-server-0b7d3bae/staff/activity', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const { userId, action, detail, totalPoints, scores } = await c.req.json();
    if (!userId || !action) return c.json({ error: 'userId and action required' }, 400);
    const logs: any[] = (await kv.get(`staff_activity_${userId}`) as any[]) ?? [];
    logs.unshift({
      action, detail: detail ?? null,
      totalPoints: totalPoints ?? null,
      scores: scores ?? null,
      recordedAt: new Date().toISOString(),
      recordedBy: (auth as any).user.id,
    });
    await kv.set(`staff_activity_${userId}`, logs.slice(0, 200));
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.post('/make-server-0b7d3bae/staff/revenue', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const { amount, category, note } = await c.req.json();
    if (amount === undefined || !category) return c.json({ error: 'amount and category required' }, 400);
    const list: any[] = (await kv.get('staff_revenue_list') as any[]) ?? [];
    const entry = { id: crypto.randomUUID(), amount: Number(amount), category, note: note ?? '', recordedAt: new Date().toISOString(), recordedBy: (auth as any).user.id, paid: false };
    list.unshift(entry);
    await kv.set('staff_revenue_list', list.slice(0, 500));
    return c.json({ success: true, entry });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.get('/make-server-0b7d3bae/staff/revenue/list', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const list = (await kv.get('staff_revenue_list')) ?? [];
    return c.json({ list });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.post('/make-server-0b7d3bae/staff/payout', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const { userId, amount, note } = await c.req.json();
    if (!userId || amount === undefined) return c.json({ error: 'userId and amount required' }, 400);
    const history: any[] = (await kv.get(`staff_payout_${userId}`) as any[]) ?? [];
    history.unshift({ id: crypto.randomUUID(), amount: Number(amount), note: note ?? '', paidAt: new Date().toISOString(), paidBy: (auth as any).user.id });
    await kv.set(`staff_payout_${userId}`, history.slice(0, 200));
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// ─── Staff Member Self-Service API (staff_members에 등록된 유저 전용) ─────────

async function requireStaffMember(c: any): Promise<{ user: any; member: any } | Response> {
  const token = (c.req.header('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
  const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
  const member = members.find((m: any) => m.userId === user.id);
  if (!member) {
    const role = await getUserRole(user.id, user.email ?? '');
    if (role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
    return { user, member: null };
  }
  return { user, member };
}

app.get('/make-server-0b7d3bae/staff/me', async (c) => {
  try {
    const token = (c.req.header('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) return c.json({ member: null });
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) return c.json({ member: null });
    const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
    const member = members.find((m: any) => m.userId === user.id) ?? null;
    if (!member) {
      const role = await getUserRole(user.id, user.email ?? '');
      if (role === 'admin') {
        return c.json({ member: { userId: user.id, nickname: '관리자', level: 1, joinedAt: new Date().toISOString(), isAdmin: true } });
      }
      return c.json({ member: null });
    }
    return c.json({ member });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.get('/make-server-0b7d3bae/staff/revenue/public', async (c) => {
  try {
    const auth = await requireStaffMember(c);
    if (auth instanceof Response) return auth;
    const list: any[] = (await kv.get('staff_revenue_list') as any[]) ?? [];
    const publicList = list.filter((e: any) => e.isPublic !== false);
    return c.json({ list: publicList });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.get('/make-server-0b7d3bae/staff/agenda', async (c) => {
  try {
    const auth = await requireStaffMember(c);
    if (auth instanceof Response) return auth;
    const agendas: any[] = (await kv.get('staff_agenda_list') as any[]) ?? [];
    return c.json({ agendas });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.post('/make-server-0b7d3bae/staff/agenda', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const { title, description } = await c.req.json();
    if (!title) return c.json({ error: 'title required' }, 400);
    const agendas: any[] = (await kv.get('staff_agenda_list') as any[]) ?? [];
    const agenda = {
      id: crypto.randomUUID(),
      title,
      description: description ?? '',
      createdAt: new Date().toISOString(),
      closedAt: null,
      status: 'open',
      votes: {},
      createdBy: (auth as any).user.id,
    };
    agendas.unshift(agenda);
    await kv.set('staff_agenda_list', agendas.slice(0, 100));
    return c.json({ success: true, agenda });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.patch('/make-server-0b7d3bae/staff/agenda/:id/close', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param('id');
    const agendas: any[] = (await kv.get('staff_agenda_list') as any[]) ?? [];
    const idx = agendas.findIndex((a: any) => a.id === id);
    if (idx === -1) return c.json({ error: 'not found' }, 404);
    agendas[idx] = { ...agendas[idx], status: 'closed', closedAt: new Date().toISOString() };
    await kv.set('staff_agenda_list', agendas);
    return c.json({ success: true, agenda: agendas[idx] });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.post('/make-server-0b7d3bae/staff/agenda/:id/vote', async (c) => {
  try {
    const auth = await requireStaffMember(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param('id');
    const { vote } = await c.req.json();
    if (vote !== 'yes' && vote !== 'no') return c.json({ error: 'vote must be yes or no' }, 400);
    const agendas: any[] = (await kv.get('staff_agenda_list') as any[]) ?? [];
    const idx = agendas.findIndex((a: any) => a.id === id);
    if (idx === -1) return c.json({ error: '의제를 찾을 수 없습니다' }, 404);
    if (agendas[idx].status !== 'open') return c.json({ error: '종료된 의제입니다' }, 400);
    const userId = (auth as any).user.id;
    agendas[idx] = { ...agendas[idx], votes: { ...agendas[idx].votes, [userId]: vote } };
    await kv.set('staff_agenda_list', agendas);
    return c.json({ success: true, agenda: agendas[idx] });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 이달 활동 점수 합계
app.get('/make-server-0b7d3bae/staff/monthly-scores', async (c) => {
  try {
    const auth = await requireStaffMember(c);
    if (auth instanceof Response) return auth;
    const month = (c.req.query('month') ?? new Date().toISOString().slice(0, 7));
    const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
    // 요청자(관리자 포함)도 반드시 포함
    const requesterId = (auth as any).user.id;
    const allUserIds = [...new Set([...members.map((m: any) => m.userId), requesterId])];
    const scores: Record<string, number> = {};

    const calcLogPoints = (logs: any[]): number =>
      logs
        .filter((l: any) => (l.recordedAt ?? '').startsWith(month))
        .reduce((s: number, l: any) => {
          // totalPoints 필드가 있으면 그대로, 없으면 scores 객체에서 합산 (하위 호환)
          if (typeof l.totalPoints === 'number') return s + l.totalPoints;
          if (l.scores && typeof l.scores === 'object') {
            const POINTS: Record<string, number> = { tag: 2, title: 3, wiki: 10, report: 10, mediate: 15, recruit: 20, event: 30, meeting: 10 };
            const sub = Object.entries(l.scores as Record<string, number>)
              .reduce((acc: number, [k, v]) => acc + (POINTS[k] ?? 0) * (v ?? 0), 0);
            return s + sub;
          }
          return s;
        }, 0);

    await Promise.all(allUserIds.map(async (uid: string) => {
      const logs: any[] = (await kv.get(`staff_activity_${uid}`) as any[]) ?? [];
      const total = calcLogPoints(logs);
      if (total > 0) scores[uid] = total;
    }));
    return c.json({ scores });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 회의 생성 (어드민)
app.post('/make-server-0b7d3bae/staff/meeting', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const { title, date } = await c.req.json();
    if (!title) return c.json({ error: 'title required' }, 400);
    const meetings: any[] = (await kv.get('staff_meetings') as any[]) ?? [];
    const meeting = {
      id: crypto.randomUUID(),
      title, date: date ?? '',
      status: 'open',
      attendees: [],
      createdAt: new Date().toISOString(),
      createdBy: (auth as any).user.id,
    };
    meetings.unshift(meeting);
    await kv.set('staff_meetings', meetings.slice(0, 100));
    return c.json({ success: true, meetings });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 회의 목록 조회
app.get('/make-server-0b7d3bae/staff/meetings', async (c) => {
  try {
    const auth = await requireStaffMember(c);
    if (auth instanceof Response) return auth;
    const meetings = (await kv.get('staff_meetings')) ?? [];
    return c.json({ meetings });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 회의 참석 (자동 +10점)
app.post('/make-server-0b7d3bae/staff/meeting/:id/attend', async (c) => {
  try {
    const auth = await requireStaffMember(c);
    if (auth instanceof Response) return auth;
    const userId = (auth as any).user.id;
    const id = c.req.param('id');
    const meetings: any[] = (await kv.get('staff_meetings') as any[]) ?? [];
    const idx = meetings.findIndex((m: any) => m.id === id);
    if (idx === -1) return c.json({ error: '회의를 찾을 수 없습니다' }, 404);
    if (meetings[idx].status !== 'open') return c.json({ error: '종료된 회의입니다' }, 400);
    if ((meetings[idx].attendees ?? []).includes(userId)) return c.json({ error: '이미 참석했습니다' }, 400);
    meetings[idx] = { ...meetings[idx], attendees: [...(meetings[idx].attendees ?? []), userId] };
    await kv.set('staff_meetings', meetings);
    // 활동 점수 자동 적립 (+10점)
    const logs: any[] = (await kv.get(`staff_activity_${userId}`) as any[]) ?? [];
    logs.unshift({
      action: '활동점수 합계 10점',
      detail: `회의 참석 1회(+10점) | ${meetings[idx].title}`,
      totalPoints: 10,
      scores: { meeting: 1 },
      recordedAt: new Date().toISOString(),
      recordedBy: userId,
    });
    await kv.set(`staff_activity_${userId}`, logs.slice(0, 200));
    return c.json({ success: true, meeting: meetings[idx] });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 회의록 PDF 업로드 (관리자)
app.post('/make-server-0b7d3bae/staff/upload-pdf', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    if (!file) return c.json({ error: 'No file provided' }, 400);
    if (file.type !== 'application/pdf') return c.json({ error: 'PDF 파일만 업로드할 수 있습니다' }, 400);
    if (file.size > 20 * 1024 * 1024) return c.json({ error: '파일 크기는 20MB 이하여야 합니다' }, 400);
    const filename = `minutes_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
    const arrayBuffer = await file.arrayBuffer();
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, new Uint8Array(arrayBuffer), { contentType: 'application/pdf', upsert: false });
    if (error) return c.json({ error: `업로드 실패: ${error.message}` }, 500);
    const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filename);
    return c.json({ url: publicUrl });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 회의 완료 + 회의록 저장 (관리자)
app.post('/make-server-0b7d3bae/staff/meeting/:id/close', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param('id');
    const { minutes, minutesPdfUrl } = await c.req.json().catch(() => ({}));
    const meetings: any[] = (await kv.get('staff_meetings') as any[]) ?? [];
    const idx = meetings.findIndex((m: any) => m.id === id);
    if (idx === -1) return c.json({ error: '회의를 찾을 수 없습니다' }, 404);
    meetings[idx] = {
      ...meetings[idx],
      status: 'closed',
      closedAt: new Date().toISOString(),
      minutes: minutes ?? '',
      minutesPdfUrl: minutesPdfUrl ?? null,
    };
    await kv.set('staff_meetings', meetings.slice(0, 100));
    return c.json({ success: true, meeting: meetings[idx] });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 회의 안건 제출 (운영진/관리자)
app.post('/make-server-0b7d3bae/staff/meeting/:id/agenda', async (c) => {
  try {
    const auth = await requireStaffMember(c);
    if (auth instanceof Response) return auth;
    const userId = (auth as any).user.id;
    const id = c.req.param('id');
    const { title, description } = await c.req.json();
    if (!title) return c.json({ error: 'title required' }, 400);
    const meetings: any[] = (await kv.get('staff_meetings') as any[]) ?? [];
    const idx = meetings.findIndex((m: any) => m.id === id);
    if (idx === -1) return c.json({ error: '회의를 찾을 수 없습니다' }, 404);
    if (meetings[idx].status !== 'open') return c.json({ error: '종료된 회의입니다' }, 400);
    const agendaItem = {
      id: crypto.randomUUID(),
      title,
      description: description ?? '',
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
    };
    meetings[idx] = { ...meetings[idx], agendas: [...(meetings[idx].agendas ?? []), agendaItem] };
    await kv.set('staff_meetings', meetings.slice(0, 100));
    return c.json({ success: true, meeting: meetings[idx] });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 동의서 확인 여부 조회
app.get('/make-server-0b7d3bae/staff/agreement-status', async (c) => {
  try {
    const auth = await requireStaffMember(c);
    if (auth instanceof Response) return auth;
    const userId = (auth as any).user.id;
    const agreed = await kv.get(`staff_agreement_${userId}`);
    return c.json({ agreed: !!agreed });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 동의서 초기화 (관리자)
app.delete('/make-server-0b7d3bae/staff/agreement/:userId', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const userId = c.req.param('userId');
    await kv.del(`staff_agreement_${userId}`);
    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 동의서 동의 저장
app.post('/make-server-0b7d3bae/staff/agreement', async (c) => {
  try {
    const auth = await requireStaffMember(c);
    if (auth instanceof Response) return auth;
    const userId = (auth as any).user.id;

    // 닉네임 조회 (법적 기록용)
    const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
    const member = members.find((m: any) => m.userId === userId);
    const nickname = member?.nickname ?? '관리자';

    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      ?? c.req.header('cf-connecting-ip')
      ?? 'unknown';
    const userAgent = c.req.header('user-agent') ?? 'unknown';
    const agreedAt = new Date().toISOString();
    const documentVersion = 'staff-agreement-v1';

    const record = { userId, nickname, agreedAt, ip, userAgent, documentVersion };

    // 개인 동의 상태 저장
    await kv.set(`staff_agreement_${userId}`, record);

    // 법적 감사 로그에 누적 (삭제해도 남음)
    const log: any[] = (await kv.get('staff_agreements_log') as any[]) ?? [];
    log.push(record);
    await kv.set('staff_agreements_log', log);

    return c.json({ success: true });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// 동의 현황 목록 조회 (관리자 전용)
app.get('/make-server-0b7d3bae/staff/agreements', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const log: any[] = (await kv.get('staff_agreements_log') as any[]) ?? [];
    const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
    const adminUserId = (auth as any).user.id;

    // 현재 유효한 동의 상태 수집 (운영진 + 관리자)
    const activeIds = new Set<string>();
    const allCheckIds = [...members.map((m: any) => m.userId), adminUserId];
    for (const uid of allCheckIds) {
      const status = await kv.get(`staff_agreement_${uid}`);
      if (status) activeIds.add(uid);
    }

    // 로그에 없지만 현재 동의가 유효한 경우 보완 항목 추가 (로깅 추가 이전 동의자 포함)
    const loggedIds = new Set(log.map((e: any) => e.userId));
    const extraEntries: any[] = [];
    for (const uid of activeIds) {
      if (!loggedIds.has(uid)) {
        const existing: any = await kv.get(`staff_agreement_${uid}`);
        const m = members.find((m: any) => m.userId === uid);
        extraEntries.push({
          userId: uid,
          nickname: existing?.nickname ?? m?.nickname ?? (uid === adminUserId ? '관리자' : uid.slice(0, 8)),
          agreedAt: existing?.agreedAt ?? new Date().toISOString(),
          ip: existing?.ip ?? 'unknown',
          userAgent: existing?.userAgent ?? 'unknown',
          documentVersion: existing?.documentVersion ?? 'staff-agreement-v1',
        });
      }
    }

    const fullLog = [...log, ...extraEntries].sort(
      (a: any, b: any) => new Date(b.agreedAt).getTime() - new Date(a.agreedAt).getTime()
    );

    return c.json({ log: fullLog, activeIds: [...activeIds] });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

app.post('/make-server-0b7d3bae/staff/update-level', async (c) => {
  try {
    const auth = await requireStaffAdmin(c);
    if (auth instanceof Response) return auth;
    const { userId, level } = await c.req.json();
    if (!userId || level === undefined) return c.json({ error: 'userId and level required' }, 400);
    const members: any[] = (await kv.get('staff_members') as any[]) ?? [];
    const idx = members.findIndex(m => m.userId === userId);
    if (idx === -1) return c.json({ error: '운영진을 찾을 수 없습니다' }, 404);
    members[idx] = { ...members[idx], level: Number(level) };
    await kv.set('staff_members', members);
    return c.json({ success: true, members });
  } catch (e) { return c.json({ error: String(e) }, 500); }
});

// ─── End Staff API ────────────────────────────────────────────────────────────

Deno.serve(app.fetch);