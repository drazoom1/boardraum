import { useState, useEffect, useRef } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { BoardGame } from '../App';
import { BoardGameCard } from './BoardGameCard';
import { AddGameDialog } from './AddGameDialog';
import { Button } from './ui/button';
import { SlidersHorizontal, Plus, ArrowUpDown, Grid3x3, List, ChevronDown, ChevronRight, Book, Share2, Copy, Check, BarChart3, Search, X, LayoutGrid, Trophy } from 'lucide-react';
import { PlayStatsModal } from './PlayStatsModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { BoardWikiModal } from './BoardWikiModal';
import { toast } from 'sonner';

interface BoardGameListProps {
  games: BoardGame[];
  onGamesChange: (games: BoardGame[]) => void;
  listType: string;
  onNavigateToWiki?: (category: string, game: BoardGame) => void;
  accessToken?: string;
  userId?: string;
  userEmail?: string;
  onMoveToOwned?: (game: BoardGame) => void;
  onRelease?: (game: BoardGame) => void; // 방출하기
  openAddDialog?: boolean; // 외부에서 다이얼로그 열기
  onAddDialogClose?: () => void; // 닫힘 콜백
  readOnly?: boolean; // 읽기 전용 (타인 프로필)
}

type SortOption = 'korean-asc' | 'english-asc' | 'recent-asc' | 'recent-desc' | 'rating-desc' | 'releasing';
type ViewMode = 'detailed' | 'simple' | 'shelf';

// ===== 이런 게임 어때요? 추천 섹션 =====
interface RecommendedGame {
  bggId: string;
  name: string;
  imageUrl: string;
  purchaseUrl?: string;
}

function RecommendedGamesSection({
  accessToken,
  onAddToWishlist,
  existingGames,
}: {
  accessToken?: string;
  onAddToWishlist: (game: RecommendedGame) => void;
  existingGames: BoardGame[];
}) {
  const [games, setGames] = useState<RecommendedGame[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = accessToken || publicAnonKey;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/recommended-games`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.games) && d.games.length) setGames(d.games); })
      .catch(() => {});
  }, [accessToken]);

  if (games.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: dir === 'right' ? 200 : -200, behavior: 'smooth' });
  };

  const isAlreadyAdded = (bggId: string) => existingGames.some(g => g.bggId === bggId);

  const handleAdd = async (game: RecommendedGame) => {
    if (isAlreadyAdded(game.bggId)) return;
    setAdding(game.bggId);
    try {
      const token = accessToken || publicAnonKey;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: game.bggId }),
      });
      const d = res.ok ? await res.json() : {};
      const rp = d.minPlayers && d.maxPlayers
        ? (d.minPlayers === d.maxPlayers ? `${d.minPlayers}명` : `${d.minPlayers}-${d.maxPlayers}명`)
        : (d.bestPlayerCount ? `${d.bestPlayerCount}명` : '');
      const newGame: BoardGame = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        koreanName: game.name, englishName: game.name,
        recommendedPlayers: rp,
        playTime: d.playTime ? `${d.playTime}분` : '',
        difficulty: d.complexity ? String(Math.round(d.complexity * 10) / 10) : '',
        imageUrl: game.imageUrl || d.imageUrl || '',
        videoUrl: '', bggId: game.bggId,
        isExpansion: false,
        createdAt: new Date().toISOString(), quantity: 1,
      };
      onAddToWishlist(newGame);
    } catch {
      onAddToWishlist({
        ...game,
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      } as any);
    }
    setAdding(null);
  };

  return (
    <div className="mb-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <p className="text-base font-black text-gray-900">이런 게임 어때요?</p>
      </div>
      <div className="relative px-2 pb-3">
        {/* 좌 버튼 */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-white shadow-md rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
        >
          ‹
        </button>

        {/* 스크롤 영역 */}
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide px-6 scroll-smooth">
          {games.map(game => {
            const added = isAlreadyAdded(game.bggId);
            const isAdding = adding === game.bggId;
            return (
              <div key={game.bggId} className="flex-shrink-0 w-28 flex flex-col items-center gap-1.5">
                {/* 게임 이미지 */}
                <div className="relative group w-28 h-28 rounded-lg overflow-hidden border border-gray-200 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                  onClick={() => !added && handleAdd(game)}>
                  <img src={game.imageUrl} alt={game.name} className="w-full h-full object-cover" />
                  {/* 우측 상단 아이콘 배지 */}
                  {added ? (
                    <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : isAdding ? (
                    <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-gray-500 rounded-full flex items-center justify-center shadow-md">
                      <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center shadow-md opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  )}
                  {/* hover 시 어두운 오버레이 (모바일 제외) */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors hidden sm:block" />
                </div>
                {/* 게임명 */}
                <p className="text-xs text-center text-gray-700 font-medium leading-tight line-clamp-2 w-full">{game.name}</p>
                {/* 구매하기 버튼 */}
                {game.purchaseUrl && (
                  <a href={game.purchaseUrl} target="_blank" rel="noopener noreferrer"
                    className="w-full text-center text-xs px-2 py-1 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors">
                    구매하기
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* 우 버튼 */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-white shadow-md rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
        >
          ›
        </button>
      </div>
    </div>
  );
}

export function BoardGameList({ games, onGamesChange, listType, onNavigateToWiki, accessToken, userId, userEmail, onMoveToOwned, onRelease, openAddDialog, onAddDialogClose, readOnly = false }: BoardGameListProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  useEffect(() => {
    if (openAddDialog) {
      setIsAddDialogOpen(true);
      onAddDialogClose?.();
    }
  }, [openAddDialog]);
  const [sortOption, setSortOption] = useState<SortOption>('recent-desc');
  const [viewMode, setViewMode] = useState<ViewMode>('detailed');
  const [showExpansionsSeparately, setShowExpansionsSeparately] = useState(false);
  const [expandedGames, setExpandedGames] = useState<Set<string>>(new Set());
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [shelfModalGame, setShelfModalGame] = useState<BoardGame | null>(null);
  const [expansionTarget, setExpansionTarget] = useState<{ query: string; parentGameId: string } | null>(null)
  const [rankingBadges, setRankingBadges] = useState<{ type: string; rank: number }[]>([]);
  const [rankingBannerOpen, setRankingBannerOpen] = useState(true);
  const [displayedGamesCount, setDisplayedGamesCount] = useState(20);
  const [showSortModal, setShowSortModal] = useState(false);

  useEffect(() => {
    if (listType !== '보유' || !userId || readOnly) return;
    fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/ranking`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } }
    ).then(r => r.ok ? r.json() : null).then(data => {
      if (!data) return;
      const badges: { type: string; rank: number }[] = [];
      const gi = data.byGames?.findIndex((u: any) => u.userId === userId);
      const pi = data.byPlayCount?.findIndex((u: any) => u.userId === userId);
      const si = data.bySpent?.findIndex((u: any) => u.userId === userId);
      if (gi >= 0) badges.push({ type: '보유 수량', rank: gi + 1 });
      if (pi >= 0) badges.push({ type: '다회 플레이', rank: pi + 1 });
      if (si >= 0) badges.push({ type: '구매 금액', rank: si + 1 });
      setRankingBadges(badges);
    }).catch(() => {});
  }, [userId, listType, readOnly]);

  const toggleExpanded = (gameId: string) => {
    const newExpanded = new Set(expandedGames);
    if (newExpanded.has(gameId)) {
      newExpanded.delete(gameId);
    } else {
      newExpanded.add(gameId);
    }
    setExpandedGames(newExpanded);
  };

  const handleAddGame = (game: BoardGame) => {
    onGamesChange([...games, game]);
  };
  const handleAddGames = (newGames: BoardGame[]) => {
    onGamesChange([...games, ...newGames]);
  };

  const handleAddExpansion = (parentGame: BoardGame) => {
    setExpansionTarget({
      query: parentGame.koreanName || parentGame.englishName || '',
      parentGameId: parentGame.id,
    });
    setIsAddDialogOpen(true);
  };

  const handleEditGame = (updatedGame: BoardGame) => {
    onGamesChange(games.map(game => game.id === updatedGame.id ? updatedGame : game));
  };

  const handleDeleteGame = (gameId: string) => {
    onGamesChange(games.filter(game => game.id !== gameId));
  };

  const sortGames = (gamesToSort: BoardGame[]): BoardGame[] => {
    // 먼저 본판과 확장판을 분리
    const baseGames = gamesToSort.filter(game => !game.isExpansion);
    const expansionGames = gamesToSort.filter(game => game.isExpansion);
    
    // 본판의 원래 인덱스 저장 (최근 추가순 정렬을 위해)
    const baseGamesWithIndex = baseGames.map((game, index) => ({
      game,
      originalIndex: gamesToSort.indexOf(game)
    }));
    
    // 본판 정렬
    switch (sortOption) {
      case 'korean-asc':
        baseGamesWithIndex.sort((a, b) => {
          const aName = a.game.koreanName || a.game.englishName;
          const bName = b.game.koreanName || b.game.englishName;
          
          // 한글, 영어, 숫자 판별 함수
          const getCharType = (char: string) => {
            if (!char) return 3;
            const code = char.charCodeAt(0);
            if (code >= 0xAC00 && code <= 0xD7A3) return 0; // 한글
            if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return 1; // 영어
            if (code >= 48 && code <= 57) return 2; // 숫자
            return 3; // 기타
          };
          
          const aType = getCharType(aName[0]);
          const bType = getCharType(bName[0]);
          
          // 타입이 다르면 한글(0) → 영어(1) → 숫자(2) 순
          if (aType !== bType) return aType - bType;
          
          // 같은 타입이면 일반 정렬
          return aName.localeCompare(bName, ['ko', 'en']);
        });
        break;
      case 'english-asc':
        baseGamesWithIndex.sort((a, b) => a.game.englishName.localeCompare(b.game.englishName, 'en'));
        break;
      case 'rating-desc':
        baseGamesWithIndex.sort((a, b) => (b.game.rating || 0) - (a.game.rating || 0));
        break;
      case 'recent-asc':
        // 오래된 것부터 (createdAt 기준)
        baseGamesWithIndex.sort((a, b) => {
          const aTime = a.game.createdAt ? new Date(a.game.createdAt).getTime() : a.originalIndex;
          const bTime = b.game.createdAt ? new Date(b.game.createdAt).getTime() : b.originalIndex;
          return aTime - bTime;
        });
        break;
      case 'recent-desc':
      default:
        // 최신 것부터 (createdAt 기준)
        baseGamesWithIndex.sort((a, b) => {
          const aTime = a.game.createdAt ? new Date(a.game.createdAt).getTime() : a.originalIndex;
          const bTime = b.game.createdAt ? new Date(b.game.createdAt).getTime() : b.originalIndex;
          return bTime - aTime;
        });
        break;
    }
    
    const sortedBaseGames = baseGamesWithIndex.map(item => item.game);
    
    // 각 본판 뒤에 해당하는 확장판을 배치
    const result: BoardGame[] = [];
    for (const baseGame of sortedBaseGames) {
      result.push(baseGame);
      // 이 본판의 확장판들을 찾아서 추가
      const expansions = expansionGames.filter(exp => exp.parentGameId === baseGame.id);
      result.push(...expansions);
    }
    
    // parentGameId가 없거나 잘못된 확장판들도 마지막에 추가
    const orphanExpansions = expansionGames.filter(
      exp => !exp.parentGameId || !baseGames.find(base => base.id === exp.parentGameId)
    );
    result.push(...orphanExpansions);
    
    return result;
  };

  const sortedGames = sortGames(games);

  const getSortLabel = () => {
    switch (sortOption) {
      case 'korean-asc': return '한글명 ㄱㄴㄷ순';
      case 'english-asc': return '영문명 ABC순';
      case 'rating-desc': return '평점 높은순';
      case 'recent-asc': return '오래된 등록순';
      case 'recent-desc': return '최근 등록순';
      case 'releasing': return '📦 방출 예정만';
    }
  };

  // 확장판 따로 보기 토글 (보유 리스트에서만)
  const getFilteredGames = () => {
    // 방출 예정 필터
    if (sortOption === 'releasing') {
      return sortedGames.filter(g => g.isReleasing);
    }
    // 구매예정 리스트는 확장판도 항상 표시 (들여쓰기 적용)
    if (listType !== '보유') {
      return sortedGames; // 전체 표시 (확장판은 본판 바로 아래)
    }

    if (showExpansionsSeparately) {
      // 확장판도 따로 보기: 전체 표시
      return sortedGames;
    } else {
      // 본판만 표시 (확장판은 본판 카드 내부에서 표시)
      return sortedGames.filter(game => !game.isExpansion);
    }
  };

  const filteredGames = (() => {
    let result = getFilteredGames();
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(game =>
        (game.koreanName || '').toLowerCase().includes(q) ||
        (game.englishName || '').toLowerCase().includes(q)
      );
    }
    return result;
  })();

  // 특정 게임의 확장판 목록 가져오기
  const getExpansions = (parentGameId: string): BoardGame[] => {
    return sortedGames.filter(game => game.isExpansion && game.parentGameId === parentGameId);
  };

  // 공유 링크 복사
  const handleShareList = () => {
    if (!userId) {
      toast.error('공유 기능을 사용할 수 없습니다');
      return;
    }
    setShowShareDialog(true);
    setCopySuccess(false);
  };

  // 텍스트 복사 (폴백 메서드)
  const copyToClipboard = async () => {
    if (!userId) return;
    
    const shareUrl = `${window.location.origin}/shared/${userId}`;
    
    // textarea를 이용한 폴백 메서드 (가장 안정적)
    try {
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopySuccess(true);
        toast.success('링크가 복사되었습니다! 🎉');
        setTimeout(() => setCopySuccess(false), 2000);
        return;
      }
    } catch (err) {
      console.error('Copy failed:', err);
    }
    
    // 모든 방법 실패
    toast.error('링크 복사에 실패했습니다. 수동으로 복사해주세요.');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-3 bg-white rounded-2xl px-4 sm:px-5 py-3 shadow-sm space-y-2.5">

        {/* ── 검색창 + 설정 아이콘 ── */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="게임 이름으로 검색..."
              className="w-full h-9 pl-9 pr-8 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* 설정 아이콘 → 정렬/뷰 모달 */}
          <button
            onClick={() => setShowSortModal(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors shrink-0"
            title="정렬 및 보기 설정"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* ── 정렬/뷰 설정 모달 ── */}
      {showSortModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[9998]" onClick={() => setShowSortModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 lg:left-[72px] bg-white rounded-t-3xl z-[9999] p-6 shadow-2xl">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <h3 className="text-base font-bold text-gray-900 mb-5">정렬 및 보기 설정</h3>

            {/* 보기 방식 */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">보기 방식</p>
              <div className="flex gap-2">
                {([['detailed','상세', '카드 형태로 자세히'] , ['simple','간단히','목록으로 간략히'], ['shelf','책장','책장처럼 표지만']] as const).map(([mode, label, desc]) => (
                  <button key={mode} onClick={() => setViewMode(mode)}
                    className={`flex-1 py-3 px-2 rounded-2xl border-2 text-sm font-semibold transition-all ${viewMode === mode ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-100 bg-gray-50 text-gray-600'}`}>
                    <div>{label}</div>
                    <div className={`text-xs mt-0.5 font-normal ${viewMode === mode ? 'text-gray-300' : 'text-gray-400'}`}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 정렬 방식 */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">정렬 방식</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['recent-desc','최근 등록순'],
                  ['recent-asc','오래된 등록순'],
                  ['korean-asc','한글명 ㄱㄴㄷ순'],
                  ['english-asc','영문명 ABC순'],
                  ['rating-desc','평점 높은순'],
                ] as const).map(([opt, label]) => (
                  <button key={opt} onClick={() => setSortOption(opt)}
                    className={`py-2.5 px-4 rounded-xl border-2 text-sm font-medium text-left transition-all ${sortOption === opt ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-100 bg-gray-50 text-gray-600'}`}>
                    {label}
                  </button>
                ))}
                {listType === '보유' && (
                  <button onClick={() => setSortOption('releasing')}
                    className={`py-2.5 px-4 rounded-xl border-2 text-sm font-medium text-left transition-all ${sortOption === 'releasing' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-100 bg-gray-50 text-gray-600'}`}>
                    📦 방출 예정만
                  </button>
                )}
              </div>
            </div>

            {/* 확장판 옵션 */}
            {listType === '보유' && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">기타 옵션</p>
                <label className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl cursor-pointer">
                  <span className="text-sm font-medium text-gray-700">확장판도 따로 보기</span>
                  <input type="checkbox" checked={showExpansionsSeparately}
                    onChange={(e) => setShowExpansionsSeparately(e.target.checked)}
                    className="w-5 h-5 rounded accent-gray-900" />
                </label>
              </div>
            )}

            <button onClick={() => setShowSortModal(false)}
              className="w-full py-3 bg-gray-900 text-white rounded-2xl font-semibold text-sm">
              확인
            </button>
          </div>
        </>
      )}

      {/* 랭킹 배너 - 보유 탭에서 랭킹 진입 시 */}


      {/* 이런 게임 어때요? - 구매예정 탭에만 표시 */}
      {listType !== '보유' && (
        <RecommendedGamesSection
          accessToken={accessToken}
          existingGames={games}
          onAddToWishlist={(game) => onGamesChange([...games, game as BoardGame])}
        />
      )}

      {games.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-300 shadow-sm">
          <div className="text-6xl mb-4">🎲</div>
          <p className="text-gray-500 mb-6 text-lg">{listType} 리스트가 비어있습니다</p>
          <Button 
            variant="outline" 
            onClick={() => setIsAddDialogOpen(true)}
            className="hover:bg-gray-900 hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            첫 번째 게임 추가하기
          </Button>
        </div>
      ) : filteredGames.length === 0 && searchQuery ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-gray-500 text-base mb-2">
            '<span className="font-semibold text-gray-700">{searchQuery}</span>' 검색 결과가 없어요
          </p>
          <p className="text-gray-400 text-sm mb-4">게임 이름을 다시 확인해보세요</p>
          <button onClick={() => setSearchQuery('')}
            className="text-sm text-gray-500 underline hover:text-gray-700 transition-colors">
            검색 초기화
          </button>
        </div>
      ) : viewMode === 'shelf' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {filteredGames.map(game => (
              <button
                key={game.id}
                onClick={() => setShelfModalGame(game)}
                className="group flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-gray-50 transition-all text-left"
              >
                <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-gray-100 shadow-md group-hover:shadow-lg transition-shadow relative">
                  {game.imageUrl
                    ? <img src={game.imageUrl} alt={game.koreanName} className="w-full h-full object-cover"/>
                    : <div className="w-full h-full flex items-center justify-center text-4xl">🎲</div>
                  }
                  {game.isReleasing && (
                    <div className="absolute top-1.5 right-1.5 bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">방출</div>
                  )}
                  {(game.rating ?? 0) > 0 && (
                    <div className="absolute bottom-1.5 left-1.5 bg-black/60 text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      ★ {game.rating}
                    </div>
                  )}
                </div>
                <p className="text-xs font-medium text-gray-800 text-center line-clamp-2 w-full leading-tight">
                  {game.koreanName}
                </p>
              </button>
            ))}
          </div>

          {/* 책장 클릭 시 모달 */}
          {shelfModalGame && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
              onClick={() => setShelfModalGame(null)}>
              <div className="bg-white w-full sm:w-[min(100vw-2rem,480px)] rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>
                {/* 모달 헤더 */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0 border-b border-gray-100">
                  <div className="flex items-center gap-3 min-w-0">
                    {shelfModalGame.imageUrl && (
                      <img src={shelfModalGame.imageUrl} alt={shelfModalGame.koreanName}
                        className="w-10 h-10 object-cover rounded-lg shadow-sm flex-shrink-0"/>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm leading-tight truncate">{shelfModalGame.koreanName}</p>
                      {shelfModalGame.englishName && <p className="text-xs text-gray-400 truncate">{shelfModalGame.englishName}</p>}
                    </div>
                  </div>
                  <button onClick={() => setShelfModalGame(null)} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
                    <X className="w-5 h-5"/>
                  </button>
                </div>
                {/* 카드 내용 */}
                <div className="overflow-y-auto flex-1 px-1 pb-4">
                  <BoardGameCard
                    game={shelfModalGame}
                    onEdit={(g) => { handleEditGame(g); setShelfModalGame(null); }}
                    onDelete={(id) => { handleDeleteGame(id); setShelfModalGame(null); }}
                    viewMode="detailed"
                    listType={listType}
                    allGames={games}
                    isExpanded={expandedGames.has(shelfModalGame.id)}
                    onToggleExpanded={toggleExpanded}
                    getExpansions={getExpansions}
                    showExpansionsSeparately={showExpansionsSeparately}
                    onNavigateToWiki={onNavigateToWiki}
                    accessToken={accessToken}
                    userId={userId}
                    userEmail={userEmail}
                    onAddExpansion={handleAddExpansion}
                    onMoveToOwned={onMoveToOwned}
                    onRelease={listType === '보유' ? onRelease : undefined}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4">
            {filteredGames.slice(0, displayedGamesCount).map(game => {
              // 확장판 들여쓰기 조건:
              // 1. 보유 리스트: showExpansionsSeparately가 true일 때
              // 2. 구매예정 리스트: 항상 확장판 들여쓰기
              const shouldIndent = game.isExpansion && (
                (listType === '보유' && showExpansionsSeparately) || 
                (listType !== '보유')
              );
              
              return (
                <div 
                  key={game.id}
                  className={shouldIndent ? 'ml-8 pl-4 border-l-4 border-cyan-200' : ''}
                >
                  <BoardGameCard
                    game={game}
                    onEdit={handleEditGame}
                    onDelete={handleDeleteGame}
                    viewMode={viewMode}
                    listType={listType}
                    allGames={games}
                    isExpanded={expandedGames.has(game.id)}
                    onToggleExpanded={toggleExpanded}
                    getExpansions={getExpansions}
                    showExpansionsSeparately={showExpansionsSeparately}
                    onNavigateToWiki={onNavigateToWiki}
                    accessToken={accessToken}
                    userId={userId}
                    userEmail={userEmail}
                    onAddExpansion={handleAddExpansion}
                    onMoveToOwned={onMoveToOwned}
                    onRelease={listType === '보유' ? onRelease : undefined}
                    readOnly={readOnly}
                  />
                </div>
              );
            })}
          </div>
          
          {filteredGames.length > displayedGamesCount && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setDisplayedGamesCount(prev => prev + 20)}
                className="px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors shadow-sm"
              >
                더보기 ({filteredGames.length - displayedGamesCount}개 남음)
              </button>
            </div>
          )}
        </>
      )}

      <AddGameDialog
        open={isAddDialogOpen}
        onOpenChange={(v) => { setIsAddDialogOpen(v); if (!v) setExpansionTarget(null); }}
        onAddGame={handleAddGame}
        onAddGames={handleAddGames}
        existingGames={games}
        initialQuery={expansionTarget?.query || ''}
        initialParentGameId={expansionTarget?.parentGameId || ''}
      />

      {/* 공유 링크 다이얼로그 */}
      <PlayStatsModal
        open={showStatsModal}
        onOpenChange={setShowStatsModal}
        games={games}
      />

      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>공유 링크 복사하기</DialogTitle>
            <DialogDescription>
              아래 링크를 사하여 친구들과 공유할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={`${window.location.origin}/shared/${userId}`}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <Button
              onClick={copyToClipboard}
              className="bg-gray-900 hover:bg-gray-800 text-white shadow-sm"
            >
              {copySuccess ? (
                <Check className="w-4 h-4 mr-1.5" />
              ) : (
                <Copy className="w-4 h-4 mr-1.5" />
              )}
              {copySuccess ? '복사됨!' : '복사하기'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}