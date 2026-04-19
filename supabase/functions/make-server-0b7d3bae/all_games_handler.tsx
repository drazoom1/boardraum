// All Games API Handler
// 레거시 배열 방식 + 개별 키 방식 모두 읽어서 전체 게임 반환

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

export async function getAllRegisteredGames() {
  console.log('📖 [All Games] Fetching all registered games...');

  const seenIds = new Set<string>();
  const allGames: any[] = [];

  // ── 쿼리 1: 레거시 배열 키 (user_{UUID}_owned) ──
  const { data: ownedKeys } = await supabase
    .from('kv_store_0b7d3bae')
    .select('key, value')
    .like('key', 'user_%_owned');

  if (ownedKeys) {
    for (const item of ownedKeys) {
      if (item.key.includes('_backup')) continue;
      const arr = Array.isArray(item.value) ? item.value : null;
      if (!arr) continue;
      for (const game of arr) {
        if (!game?.id || !(game.koreanName || game.englishName)) continue;
        const dedupeKey = game.bggId ? `bgg_${game.bggId}` : `id_${game.id}`;
        if (!seenIds.has(dedupeKey)) { seenIds.add(dedupeKey); allGames.push(game); }
      }
    }
  }
  console.log(`📦 [Legacy owned] ${allGames.length} games`);

  // ── 쿼리 2: 레거시 배열 키 (user_{UUID}_wishlist) ──
  const { data: wishlistKeys } = await supabase
    .from('kv_store_0b7d3bae')
    .select('key, value')
    .like('key', 'user_%_wishlist');

  if (wishlistKeys) {
    for (const item of wishlistKeys) {
      if (item.key.includes('_backup')) continue;
      const arr = Array.isArray(item.value) ? item.value : null;
      if (!arr) continue;
      for (const game of arr) {
        if (!game?.id || !(game.koreanName || game.englishName)) continue;
        const dedupeKey = game.bggId ? `bgg_${game.bggId}` : `id_${game.id}`;
        if (!seenIds.has(dedupeKey)) { seenIds.add(dedupeKey); allGames.push(game); }
      }
    }
  }
  console.log(`📦 [Legacy wishlist] ${allGames.length} games total`);

  // ── 쿼리 3: 개별 키 방식 (user_{UUID}_game_{gameId}) ──
  const { data: individualKeys } = await supabase
    .from('kv_store_0b7d3bae')
    .select('key, value')
    .like('key', 'user_%_game_%');

  if (individualKeys) {
    for (const item of individualKeys) {
      const game = item.value;
      if (!game || typeof game !== 'object' || Array.isArray(game)) continue;
      if (!game.id || !(game.koreanName || game.englishName)) continue;
      const dedupeKey = game.bggId ? `bgg_${game.bggId}` : `id_${game.id}`;
      if (!seenIds.has(dedupeKey)) { seenIds.add(dedupeKey); allGames.push(game); }
    }
  }
  console.log(`🎮 [Individual keys] ${allGames.length} games total`);

  console.log(`✅ [All Games] Final: ${allGames.length} unique games`);

  return {
    games: allGames,
    count: allGames.length,
    timestamp: new Date().toISOString()
  };
}