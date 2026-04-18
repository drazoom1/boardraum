/**
 * 보드위키 공통 게임 ID 생성
 * 같은 게임이라면 누가 등록했든 동일한 위키 키를 가져야 함
 * 
 * 우선순위:
 * 1. bggId가 있으면 "bgg_12345" 형식 (가장 안정적)
 * 2. 없으면 영문명 정규화 ("Wingspan" → "wingspan")
 * 3. 영문명도 없으면 한글명 정규화 ("윙스팬" → "윙스팬")
 */
export function getWikiGameId(game: {
  id?: string;
  bggId?: string;
  englishName?: string;
  koreanName?: string;
}): string {
  // 1. BGG ID 최우선
  if (game.bggId && game.bggId.trim()) {
    return `bgg_${game.bggId.trim()}`;
  }

  // 2. BGG 직접 선택한 경우 id 자체가 BGG 숫자 ID일 수 있음
  if (game.id && /^\d+$/.test(game.id)) {
    return `bgg_${game.id}`;
  }

  // 3. 영문명 정규화
  if (game.englishName && game.englishName.trim()) {
    return `name_${game.englishName.trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '_')}`;
  }

  // 4. 한글명 정규화
  if (game.koreanName && game.koreanName.trim()) {
    return `name_${game.koreanName.trim().replace(/[^a-z0-9가-힣]/g, '_')}`;
  }

  // fallback: 원래 id 사용
  return game.id || 'unknown';
}
