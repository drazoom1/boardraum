import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

async function fetchAllByPrefix(prefix: string): Promise<{ key: string; value: any }[]> {
  const PAGE_SIZE = 1000;
  const result: { key: string; value: any }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('kv_store_0b7d3bae')
      .select('key, value')
      .like('key', `${prefix}%`)
      .range(from, from + PAGE_SIZE - 1)
      .order('key');
    if (error) throw new Error(`DB error (${prefix}): ${error.message}`);
    if (!data || data.length === 0) break;
    result.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return result;
}

export async function getAnalyticsStats() {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const todayStart = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - kstOffset);
  const todayTimestamp = todayStart.getTime();

  // 총 방문수: DB에서 카운터 직접 조회 (키 수 세는 방식 X)
  const { data: counterRow } = await supabase
    .from('kv_store_0b7d3bae')
    .select('value')
    .eq('key', 'analytics_total_visits_counter')
    .maybeSingle();
  const totalVisits = (counterRow?.value as number) || 0;

  // 오늘/최근 방문: visit 키에서 필터
  const visitsRaw = await fetchAllByPrefix('analytics_visit_');
  const allVisits = visitsRaw.map((item: any) => item.value).filter(Boolean);
  const todayVisits = allVisits.filter((v: any) => {
    const ts = v?.timestamp;
    if (!ts) return false;
    const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
    return t >= todayTimestamp;
  });
  const todayVisitsCount = todayVisits.length;
  const todayUniqueVisitors = new Set(todayVisits.map((v: any) => v?.userId).filter(Boolean)).size;
  const uniqueVisitors = new Set(allVisits.map((v: any) => v?.userId).filter(Boolean)).size;

  // 사용자 통계
  const usersRaw = await fetchAllByPrefix('beta_user_');
  const allBetaUsers = usersRaw.map((item: any) => item.value).filter(Boolean);
  const totalUsers = allBetaUsers.length;
  const approvedUsers = allBetaUsers.filter((u: any) => u?.status === 'approved').length;
  const pendingUsers = allBetaUsers.filter((u: any) => u?.status === 'pending').length;
  const todayUsersCount = allBetaUsers.filter((u: any) => {
    if (!u?.created_at) return false;
    try { return new Date(u.created_at).getTime() >= todayTimestamp; } catch { return false; }
  }).length;

  // 게임 통계 (개별 키 우선)
  const gameKeysRaw = await fetchAllByPrefix('user_');
  let totalOwnedGames = 0;
  let totalWishlistGames = 0;
  let todayOwnedGames = 0;
  let todayWishlistGames = 0;
  const individualUserIds = new Set<string>();

  for (const item of gameKeysRaw) {
    const m = item.key.match(/^user_([a-f0-9\-]{36})_game_/i);
    if (m && !item.key.includes('_backup')) {
      individualUserIds.add(m[1]);
      const game = item.value;
      if (!game) continue;
      if (game.listType === 'owned') {
        totalOwnedGames++;
        if ((game.savedAt || 0) >= todayTimestamp) todayOwnedGames++;
      } else if (game.listType === 'wishlist') {
        totalWishlistGames++;
        if ((game.savedAt || 0) >= todayTimestamp) todayWishlistGames++;
      }
    }
  }
  for (const item of gameKeysRaw) {
    const m = item.key.match(/^user_([a-f0-9\-]{36})_(owned|wishlist)$/i);
    if (!m || individualUserIds.has(m[1])) continue;
    const games = Array.isArray(item.value) ? item.value : [];
    if (m[2] === 'owned') totalOwnedGames += games.length;
    else if (m[2] === 'wishlist') totalWishlistGames += games.length;
  }

  // 현재 접속 중인 인원 (5분 이내)
  const activeUsersRaw = await fetchAllByPrefix('analytics_active_');
  const currentActiveUsers = activeUsersRaw.filter((item: any) => {
    if (!item.value?.lastSeen) return false;
    const lastSeen = new Date(item.value.lastSeen);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    return lastSeen >= fiveMinutesAgo;
  }).length;

  return {
    totalVisits, uniqueVisitors, todayVisitsCount, todayUniqueVisitors,
    totalUsers, approvedUsers, pendingUsers, todayUsersCount,
    totalOwnedGames, totalWishlistGames, todayOwnedGames, todayWishlistGames,
    currentActiveUsers,
  };
}