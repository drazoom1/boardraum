// Game deduplication and merging utility
// Prioritizes games with more complete information (English name, image, etc.)

import type { BoardGame } from '../App';

export interface GameWithUserId extends BoardGame {
  userId?: string;
  sourceKey?: string;
}

// 커스텀 이미지인지 확인 (Supabase Storage 업로드 이미지)
function isCustomImage(imageUrl?: string): boolean {
  if (!imageUrl) return false;
  return imageUrl.includes('make-0b7d3bae-game-images');
}

// 게임 정보 완성도 점수 계산
function calculateCompletenessScore(game: GameWithUserId): number {
  let score = 0;
  
  // 영문명이 있으면 +10점 (가장 중요)
  if (game.englishName && game.englishName.trim()) score += 10;
  
  // 이미지가 있으면 +8점 (단, 커스텀 이미지는 제외)
  if (game.imageUrl && game.imageUrl.trim() && !isCustomImage(game.imageUrl)) score += 8;
  
  // 비디오가 있으면 +5점
  if (game.videoUrl && game.videoUrl.trim()) score += 5;
  
  // 추천인원이 있으면 +3점
  if (game.recommendedPlayers && game.recommendedPlayers.trim()) score += 3;
  
  // 플레이시간이 있으면 +3점
  if (game.playTime && game.playTime.trim()) score += 3;
  
  // 난이도가 있으면 +3점
  if (game.difficulty && game.difficulty.trim()) score += 3;
  
  // BGG ID가 있으면 +5점
  if (game.bggId && game.bggId.trim()) score += 5;
  
  // 보드위키 카테고리가 있으면 각각 +2점
  if (game.wikiCategories) {
    if (game.wikiCategories.mechanisms?.length) score += 2;
    if (game.wikiCategories.themes?.length) score += 2;
    if (game.wikiCategories.targetAudiences?.length) score += 2;
  }
  
  return score;
}

export function deduplicateAndMergeGames(
  games: GameWithUserId[],
  currentUserId?: string
): BoardGame[] {
  console.log('\n🔄 [Game Dedup] Starting deduplication & merge');
  console.log(`   - Total games: ${games.length}`);
  console.log(`   - Current user ID: ${currentUserId || 'none'}`);
  
  const uniqueGamesMap = new Map<string, GameWithUserId>();
  
  // 모든 게임을 한 번에 처리하되, 완성도 기준으로 선택
  games.forEach((game) => {
    const uniqueKey = (game.koreanName || game.englishName || '').toLowerCase().trim();
    // site_game에서 온 게임은 uniqueKey 없어도 id로 포함
    if (!uniqueKey) {
      if ((game as any)._fromSiteGame && game.id) {
        uniqueGamesMap.set(`id_${game.id}`, game);
      }
      return;
    }
    
    const isCurrentUser = game.userId === currentUserId;
    const existingGame = uniqueGamesMap.get(uniqueKey);
    
    if (!existingGame) {
      // 처음 발견된 게임이면 추가 (단, 커스텀 이미지는 제외)
      const gameToAdd = {
        ...game,
        imageUrl: isCustomImage(game.imageUrl) ? '' : game.imageUrl
      };
      uniqueGamesMap.set(uniqueKey, gameToAdd);
      console.log(`  ✅ Added: ${game.koreanName || game.englishName} (User: ${isCurrentUser ? '⭐ You' : game.userId}, Score: ${calculateCompletenessScore(game)})`);
    } else {
      // 이미 존재하는 게임이면 더 나은 버전을 선택
      const existingIsCurrentUser = existingGame.userId === currentUserId;
      const existingScore = calculateCompletenessScore(existingGame);
      const newScore = calculateCompletenessScore(game);
      
      console.log(`  🔍 Comparing: ${game.koreanName || game.englishName}`);
      console.log(`     - Existing: Score ${existingScore}, User: ${existingIsCurrentUser ? '⭐ You' : existingGame.userId}, English: ${existingGame.englishName ? '✓' : '✗'}`);
      console.log(`     - New: Score ${newScore}, User: ${isCurrentUser ? '⭐ You' : game.userId}, English: ${game.englishName ? '✓' : '✗'}`);
      
      let shouldReplace = false;
      
      // site_game에서 온 기존 게임은 보호
      if ((existingGame as any)._fromSiteGame) {
        shouldReplace = false;
      }
      // 우선순위 1: 현재 사용자의 게임이면 무조건 우선
      else if (isCurrentUser && !existingIsCurrentUser) {
        shouldReplace = true;
        console.log(`     → Replace: Current user's game takes priority`);
      }
      // 우선순위 2: 둘 다 현재 사용자 또는 둘 다 다른 사용자인 경우, 완성도 비교
      else if (isCurrentUser === existingIsCurrentUser) {
        if (newScore > existingScore) {
          shouldReplace = true;
          console.log(`     → Replace: Higher completeness score (${newScore} > ${existingScore})`);
        } else {
          console.log(`     → Keep existing: Higher or equal score (${existingScore} >= ${newScore})`);
        }
      } else {
        console.log(`     → Keep existing: Current user's game`);
      }
      
      if (shouldReplace) {
        // 기존 게임의 추가 정보는 유지하면서 교체
        const merged: GameWithUserId = {
          ...game,
          // 기존에 있던 추가 정보 병합 (단, 커스텀 이미지는 제외)
          englishName: game.englishName || existingGame.englishName,
          imageUrl: (game.imageUrl && !isCustomImage(game.imageUrl)) 
            ? game.imageUrl 
            : (!isCustomImage(existingGame.imageUrl) ? existingGame.imageUrl : ''),
          videoUrl: game.videoUrl || existingGame.videoUrl,
          recommendedPlayers: game.recommendedPlayers || existingGame.recommendedPlayers,
          playTime: game.playTime || existingGame.playTime,
          difficulty: game.difficulty || existingGame.difficulty,
          bggId: game.bggId || existingGame.bggId,
          // 보드위키 카테고리: 배열 병합
          wikiCategories: {
            mechanisms: Array.from(new Set([
              ...(game.wikiCategories?.mechanisms || []),
              ...(existingGame.wikiCategories?.mechanisms || [])
            ])),
            themes: Array.from(new Set([
              ...(game.wikiCategories?.themes || []),
              ...(existingGame.wikiCategories?.themes || [])
            ])),
            targetAudiences: Array.from(new Set([
              ...(game.wikiCategories?.targetAudiences || []),
              ...(existingGame.wikiCategories?.targetAudiences || [])
            ]))
          },
          isExpansion: game.isExpansion || existingGame.isExpansion,
          parentGameId: game.parentGameId || existingGame.parentGameId,
          notes: game.notes || existingGame.notes
        };
        uniqueGamesMap.set(uniqueKey, merged);
      } else {
        // 기존 게임 유지하되, 새 게임의 추가 정보 병합 (단, 커스텀 이미지는 제외)
        const merged: GameWithUserId = {
          ...existingGame,
          // 새 게임에 있는 추가 정보 병합
          englishName: existingGame.englishName || game.englishName,
          imageUrl: (existingGame.imageUrl && !isCustomImage(existingGame.imageUrl)) 
            ? existingGame.imageUrl 
            : (!isCustomImage(game.imageUrl) ? game.imageUrl : ''),
          videoUrl: existingGame.videoUrl || game.videoUrl,
          recommendedPlayers: existingGame.recommendedPlayers || game.recommendedPlayers,
          playTime: existingGame.playTime || game.playTime,
          difficulty: existingGame.difficulty || game.difficulty,
          bggId: existingGame.bggId || game.bggId,
          // 보드위키 카테고리: 배열 병합
          wikiCategories: {
            mechanisms: Array.from(new Set([
              ...(existingGame.wikiCategories?.mechanisms || []),
              ...(game.wikiCategories?.mechanisms || [])
            ])),
            themes: Array.from(new Set([
              ...(existingGame.wikiCategories?.themes || []),
              ...(game.wikiCategories?.themes || [])
            ])),
            targetAudiences: Array.from(new Set([
              ...(existingGame.wikiCategories?.targetAudiences || []),
              ...(game.wikiCategories?.targetAudiences || [])
            ]))
          },
          isExpansion: existingGame.isExpansion || game.isExpansion,
          parentGameId: existingGame.parentGameId || game.parentGameId,
          notes: existingGame.notes || game.notes
        };
        uniqueGamesMap.set(uniqueKey, merged);
      }
    }
  });
  
  // userId와 sourceKey 제거
  const uniqueGames = Array.from(uniqueGamesMap.values()).map(game => {
    const cleaned = { ...game };
    delete cleaned.userId;
    delete cleaned.sourceKey;
    return cleaned as BoardGame;
  });
  
  console.log('\n✅ [Game Dedup] Completed:');
  console.log(`   - Original: ${games.length} games`);
  console.log(`   - Unique: ${uniqueGames.length} games`);
  console.log(`   - Merged: ${games.length - uniqueGames.length} duplicates`);
  console.log('Sample merged games:');
  uniqueGames.slice(0, 3).forEach((game, idx) => {
    console.log(`  ${idx + 1}. ${game.koreanName || game.englishName}`);
    console.log(`      - English: ${game.englishName ? '✓' : '✗'}`);
    console.log(`      - Image: ${game.imageUrl ? '✓' : '✗'}`);
    console.log(`      - Video: ${game.videoUrl ? '✓' : '✗'}`);
    console.log(`      - Score: ${calculateCompletenessScore(game as GameWithUserId)}`);
  });
  
  return uniqueGames;
}