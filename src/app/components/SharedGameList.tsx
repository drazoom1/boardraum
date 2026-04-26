import { useState, useEffect } from 'react';
import { Loader2, LayoutGrid, List, Grid3x3, Trophy } from 'lucide-react';
import { BoardGame } from '../App';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { FeedCard, type FeedPost } from './FeedPage';
import { toast } from 'sonner';

interface SharedGameListProps {
  userId: string;
  highlightPostId?: string;
}

type ViewMode = 'shelf' | 'simple' | 'detailed';
type TabMode = 'games' | 'posts';

export function SharedGameList({ userId, highlightPostId }: SharedGameListProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [games, setGames] = useState<BoardGame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sharedViewKey = `shared-view-${userId}`;
  const [viewMode, setViewModeRaw] = useState<ViewMode>(() => {
    // 1순위: 이 기기에서 저장한 설정
    const saved = localStorage.getItem(sharedViewKey) as ViewMode | null;
    if (saved && ['shelf', 'simple', 'detailed'].includes(saved)) return saved;
    // 2순위: URL 파라미터
    const urlView = new URLSearchParams(window.location.search).get('view') as ViewMode | null;
    if (urlView && ['shelf', 'simple', 'detailed'].includes(urlView)) return urlView;
    return 'shelf';
  });
  const setViewMode = (v: ViewMode) => {
    localStorage.setItem(sharedViewKey, v);
    setViewModeRaw(v);
  };
  const [shelfModal, setShelfModal] = useState<BoardGame | null>(null);
  const [rankingInfo, setRankingInfo] = useState<{ type: string; rank: number }[]>([]);
  const [tabMode, setTabMode] = useState<TabMode>(highlightPostId ? 'posts' : 'games');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [playStats, setPlayStats] = useState<any>(null);
  const [managementStats, setManagementStats] = useState<any>(null);
  
  useEffect(() => { loadSharedGames(); }, [userId]);
  
  // highlightPostId가 있으면 게시물 탭으로 자동 전환
  useEffect(() => {
    if (highlightPostId) {
      setTabMode('posts');
      loadPosts();
    }
  }, [highlightPostId]);
  
  // 게시물 탭 활성화 시 게시물 로드
  useEffect(() => {
    if (tabMode === 'posts' && posts.length === 0) {
      loadPosts();
    }
  }, [tabMode]);

  const loadSharedGames = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sharedRes, rankingRes] = await Promise.all([
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/shared/${userId}`,
          { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
        ),
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/ranking`,
          { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
        )
      ]);
      if (!sharedRes.ok) throw new Error('Failed to load shared games');
      const data = await sharedRes.json();
      setUserName(data.userName);
      setGames(data.games || []);
      if (data.posts) setPosts(data.posts);
      if (data.playStats) setPlayStats(data.playStats);
      if (data.managementStats) setManagementStats(data.managementStats);

      // 랭킹 정보 계산
      if (rankingRes.ok) {
        const rankData = await rankingRes.json();
        const badges: { type: string; rank: number }[] = [];
        const gamesRank = rankData.byGames?.findIndex((u: any) => u.userId === userId);
        const playRank = rankData.byPlayCount?.findIndex((u: any) => u.userId === userId);
        const spentRank = rankData.bySpent?.findIndex((u: any) => u.userId === userId);
        if (gamesRank >= 0) badges.push({ type: '보유 수량', rank: gamesRank + 1 });
        if (playRank >= 0) badges.push({ type: '다회 플레이', rank: playRank + 1 });
        if (spentRank >= 0) badges.push({ type: '구매 금액', rank: spentRank + 1 });
        setRankingInfo(badges);
      }
    } catch (err) {
      setError('게임 목록을 불러올 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPosts = async () => {
    // shared 엔드포인트에서 이미 posts를 받아왔으므로 재요청 불필요
    // 혹시 비어있을 경우 대비해 loadSharedGames 재호출
    if (posts.length === 0) await loadSharedGames();
  };

  const getDisplayGames = () => {
    const baseGames = games.filter(g => !g.isExpansion);
    const expansionGames = games.filter(g => g.isExpansion);
    const result: BoardGame[] = [];
    for (const base of baseGames) {
      result.push(base);
      result.push(...expansionGames.filter(e => e.parentGameId === base.id));
    }
    result.push(...expansionGames.filter(
      e => !e.parentGameId || !baseGames.find(b => b.id === e.parentGameId)
    ));
    return result;
  };

  const displayGames = getDisplayGames();

  // 구매 총액 계산
  const totalSpent = games
    .filter(g => g.purchasePrice != null && g.purchasePrice > 0)
    .reduce((sum, g) => sum + (g.purchasePrice || 0), 0);

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-cyan-500 mx-auto mb-4" />
        <p className="text-gray-500">게임 목록을 불러오는 중...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center bg-white p-8 rounded-2xl shadow-sm">
        <p className="text-2xl mb-4">😢</p>
        <p className="text-gray-600">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 가입 유도 바 */}
      <div className="bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-300 truncate">나도 내 보드게임 컬렉션을 공유하고 싶다면?</p>
          <a href={window.location.origin}
            className="flex-shrink-0 bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition-colors">
            무료로 시작하기
          </a>
        </div>
      </div>

      {/* 헤더 */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                {userName}님의 보드게임 컬렉션
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <span>총 <span className="font-bold text-cyan-600">{games.length}</span>개</span>
                {totalSpent > 0 && (
                  <span className="flex items-center gap-1">
                    💰 <span className="font-bold text-gray-800">{totalSpent.toLocaleString()}원</span>
                    <span className="text-gray-400">투자</span>
                  </span>
                )}
              </div>
            </div>
            {/* 뷰 모드 토글 - 게임 탭일 때만 표시 */}
            {tabMode === 'games' && (
              <div className="flex items-center bg-gray-100 rounded-lg p-1 shrink-0">
                <button onClick={() => setViewMode('shelf')}
                  className={`h-8 px-2.5 flex items-center gap-1.5 rounded-md transition-all text-sm ${viewMode === 'shelf' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">책장</span>
                </button>
                <button onClick={() => setViewMode('simple')}
                  className={`h-8 px-2.5 flex items-center gap-1.5 rounded-md transition-all text-sm ${viewMode === 'simple' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">간단히</span>
                </button>
                <button onClick={() => setViewMode('detailed')}
                  className={`h-8 px-2.5 flex items-center gap-1.5 rounded-md transition-all text-sm ${viewMode === 'detailed' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                  <Grid3x3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">상세</span>
                </button>
              </div>
            )}
          </div>
          
          {/* 탭 버튼 */}
          <div className="flex gap-2 mt-4">
            <button onClick={() => setTabMode('games')}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${tabMode === 'games' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              보유 게임 ({games.length})
            </button>
            <button onClick={() => setTabMode('posts')}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${tabMode === 'posts' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              게시물
            </button>
          </div>
        </div>
      </div>

      {/* 랭커 배너 */}
      {rankingInfo.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 pt-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex flex-wrap items-center gap-3">
            <Trophy className="w-6 h-6 text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm">{userName}님은 보드라움 랭커예요! 🏆</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {rankingInfo.map(({ type, rank }) => (
                  <span key={type} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400 text-amber-900">
                    {rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : ''}{type} {rank}위
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {tabMode === 'posts' ? (
          // 게시물 탭
          postsLoading ? (
            <div className="flex justify-center py-16 bg-white rounded-lg shadow-sm">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg shadow-sm">
              <div className="text-6xl mb-4">✏️</div>
              <p className="text-gray-500 text-lg">아직 작성한 게시물이 없습니다</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-md overflow-hidden">
              {posts.map(post => (
                <div 
                  key={post.id} 
                  className={`${highlightPostId === post.id ? 'bg-yellow-50 border-2 border-yellow-400' : ''}`}
                >
                  <FeedCard
                    post={post}
                    accessToken={publicAnonKey}
                    userId=""
                    userName="비회원"
                    onUpdate={loadPosts}
                    onFollowToggle={() => {}}
                  />
                </div>
              ))}
            </div>
          )
        ) : (
          // 게임 탭
          games.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg shadow-sm">
              <div className="text-6xl mb-4">🎮</div>
              <p className="text-gray-500 text-lg">아직 등록된 게임이 없습니다</p>
            </div>
          ) : viewMode === 'shelf' ? (
            // 책장 뷰
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {displayGames.map(game => (
                  <button key={game.id} onClick={() => setShelfModal(game)}
                    className="group flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-white hover:shadow-md transition-all text-left">
                    <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-gray-100 shadow-md group-hover:shadow-lg transition-shadow relative">
                      {game.imageUrl
                        ? <img src={game.imageUrl} alt={game.koreanName} className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full flex items-center justify-center text-3xl">🎲</div>
                      }
                      {game.rating && (
                        <div className="absolute bottom-1 left-1 bg-black/60 text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded-full">
                          ★ {game.rating}
                        </div>
                      )}
                      {game.isExpansion && (
                        <div className="absolute top-1 right-1 bg-cyan-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                          확장
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-gray-800 text-center line-clamp-2 w-full leading-tight">
                      {game.koreanName}
                    </p>
                    {game.purchasePrice != null && game.purchasePrice > 0 && (
                      <p className="text-xs text-gray-400">{game.purchasePrice.toLocaleString()}원</p>
                    )}
                  </button>
                ))}
              </div>

              {/* 책장 게임 상세 모달 */}
              {shelfModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
                  onClick={() => setShelfModal(null)}>
                  <div className="bg-white w-full sm:w-[min(100vw-2rem,480px)] rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
                      <div className="flex items-center gap-3 min-w-0">
                        {shelfModal.imageUrl && (
                          <img src={shelfModal.imageUrl} alt={shelfModal.koreanName}
                            className="w-10 h-10 object-cover rounded-lg shadow-sm flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 text-sm truncate">{shelfModal.koreanName}</p>
                          {shelfModal.englishName && <p className="text-xs text-gray-400 truncate">{shelfModal.englishName}</p>}
                        </div>
                      </div>
                      <button onClick={() => setShelfModal(null)} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0 text-xl">✕</button>
                    </div>
                    <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
                      {shelfModal.imageUrl && (
                        <img src={shelfModal.imageUrl} alt={shelfModal.koreanName}
                          className="w-full max-h-48 object-contain rounded-xl bg-gray-50" />
                      )}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {shelfModal.recommendedPlayers && (
                          <div className="bg-gray-50 rounded-lg p-2.5">
                            <p className="text-xs text-gray-400 mb-0.5">추천 인원</p>
                            <p className="font-semibold text-gray-800">👥 {shelfModal.recommendedPlayers}</p>
                          </div>
                        )}
                        {shelfModal.playTime && (
                          <div className="bg-gray-50 rounded-lg p-2.5">
                            <p className="text-xs text-gray-400 mb-0.5">플레이 시간</p>
                            <p className="font-semibold text-gray-800">⏱️ {shelfModal.playTime}</p>
                          </div>
                        )}
                        {shelfModal.difficulty && (
                          <div className="bg-gray-50 rounded-lg p-2.5">
                            <p className="text-xs text-gray-400 mb-0.5">난이도</p>
                            <p className="font-semibold text-gray-800">🎯 {shelfModal.difficulty}</p>
                          </div>
                        )}
                        {shelfModal.rating && (
                          <div className="bg-gray-50 rounded-lg p-2.5">
                            <p className="text-xs text-gray-400 mb-0.5">내 평점</p>
                            <p className="font-semibold text-gray-800">⭐ {shelfModal.rating}/10</p>
                          </div>
                        )}
                        {shelfModal.playCount != null && shelfModal.playCount > 0 && (
                          <div className="bg-gray-50 rounded-lg p-2.5">
                            <p className="text-xs text-gray-400 mb-0.5">플레이 횟수</p>
                            <p className="font-semibold text-gray-800">🎮 {shelfModal.playCount}회</p>
                          </div>
                        )}
                        {shelfModal.purchasePrice != null && shelfModal.purchasePrice > 0 && (
                          <div className="bg-gray-50 rounded-lg p-2.5">
                            <p className="text-xs text-gray-400 mb-0.5">구매 금액</p>
                            <p className="font-semibold text-gray-800">💰 {shelfModal.purchasePrice.toLocaleString()}원</p>
                          </div>
                        )}
                        {shelfModal.purchaseDate && (
                          <div className="bg-gray-50 rounded-lg p-2.5">
                            <p className="text-xs text-gray-400 mb-0.5">구매 시기</p>
                            <p className="font-semibold text-gray-800">📅 {shelfModal.purchaseDate}</p>
                          </div>
                        )}
                      </div>
                      {shelfModal.languageEdition && (
                        <div className="flex gap-1.5">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            shelfModal.languageEdition === 'korean' ? 'bg-cyan-100 text-cyan-700' :
                            shelfModal.languageEdition === 'english' ? 'bg-blue-100 text-blue-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {shelfModal.languageEdition === 'korean' ? '한글판' : shelfModal.languageEdition === 'english' ? '영문판' : '다국어판'}
                          </span>
                          {shelfModal.boxCondition && (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600">
                              박스 {shelfModal.boxCondition}급
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : viewMode === 'simple' ? (
            // 간단 뷰
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="hidden sm:grid sm:grid-cols-12 gap-4 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white font-bold px-4 py-3 text-sm">
                <div className="col-span-4">게임명</div>
                <div className="col-span-2">추천인원</div>
                <div className="col-span-2">플레이시간</div>
                <div className="col-span-2">난이도</div>
                <div className="col-span-1">평점</div>
                <div className="col-span-1">구매가</div>
              </div>
              <div className="divide-y divide-gray-100">
                {displayGames.map((game, index) => (
                  <div key={game.id} className={`hover:bg-cyan-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    {/* 모바일 */}
                    <div className="sm:hidden p-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {game.imageUrl
                          ? <img src={game.imageUrl} alt={game.koreanName} className="w-full h-full object-cover" loading="lazy" />
                          : <div className="w-full h-full flex items-center justify-center text-xl">🎲</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{game.koreanName}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-0.5">
                          {game.recommendedPlayers && <span>👥 {game.recommendedPlayers}</span>}
                          {game.rating && <span>⭐ {game.rating}</span>}
                          {game.purchasePrice != null && game.purchasePrice > 0 && (
                            <span className="text-cyan-600 font-medium">💰 {game.purchasePrice.toLocaleString()}원</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* 데스크탑 */}
                    <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-4 py-3 items-center text-sm">
                      <div className="col-span-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          {game.imageUrl
                            ? <img src={game.imageUrl} alt={game.koreanName} className="w-full h-full object-cover" loading="lazy" />
                            : <div className="w-full h-full flex items-center justify-center">🎲</div>
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{game.koreanName}</p>
                          {game.isExpansion && <span className="text-xs text-cyan-600">확장판</span>}
                        </div>
                      </div>
                      <div className="col-span-2 text-gray-600">{game.recommendedPlayers || '-'}</div>
                      <div className="col-span-2 text-gray-600">{game.playTime || '-'}</div>
                      <div className="col-span-2 text-gray-600">{game.difficulty || '-'}</div>
                      <div className="col-span-1 text-gray-600">{game.rating ? `⭐ ${game.rating}` : '-'}</div>
                      <div className="col-span-1 text-gray-600">
                        {game.purchasePrice != null && game.purchasePrice > 0
                          ? <span className="text-cyan-700 font-medium">{game.purchasePrice.toLocaleString()}원</span>
                          : '-'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // 상세 뷰
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayGames.map(game => (
                <div key={game.id} className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  {game.imageUrl && (
                    <div className="w-full h-40 overflow-hidden bg-gray-100">
                      <img src={game.imageUrl} alt={game.koreanName} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">{game.koreanName}</h3>
                        {game.englishName && <p className="text-xs text-gray-400 truncate">{game.englishName}</p>}
                      </div>
                      {game.rating && (
                        <span className="text-sm font-bold text-yellow-500 flex-shrink-0">⭐ {game.rating}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {game.recommendedPlayers && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">👥 {game.recommendedPlayers}</span>}
                      {game.playTime && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">⏱️ {game.playTime}</span>}
                      {game.difficulty && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">🎯 {game.difficulty}</span>}
                      {game.languageEdition === 'korean' && <span className="bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">한글판</span>}
                      {game.playCount != null && game.playCount > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">🎮 {game.playCount}회</span>}
                    </div>
                    {(game.purchasePrice != null && game.purchasePrice > 0 || game.purchaseDate) && (
                      <div className="flex items-center gap-3 pt-1 border-t border-gray-100 text-xs text-gray-500">
                        {game.purchasePrice != null && game.purchasePrice > 0 && (
                          <span className="font-semibold text-cyan-700">💰 {game.purchasePrice.toLocaleString()}원</span>
                        )}
                        {game.purchaseDate && <span>📅 {game.purchaseDate}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* 플레이 기록 섹션 */}
      {playStats && (
        <div className="max-w-6xl mx-auto px-4 pb-6">
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-center gap-2">
              <span className="text-lg">🎮</span>
              <h2 className="text-base font-bold text-gray-900">플레이 기록</h2>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: '총 플레이', value: `${playStats.totalPlays}회` },
                  { label: '플레이한 게임', value: `${playStats.gamesWithPlays}개` },
                  { label: '총 플레이 시간', value: playStats.totalMinutes >= 60 ? `${Math.round(playStats.totalMinutes / 60)}시간` : `${playStats.totalMinutes}분` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-cyan-500 font-semibold mb-1">{label}</p>
                    <p className="text-lg font-bold text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
              {playStats.topGames?.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">많이 플레이한 게임</p>
                  {playStats.topGames.map((g: any, i: number) => {
                    const maxPlay = playStats.topGames[0]?.playCount || 1;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-300 w-4 text-center">{i + 1}</span>
                        {g.imageUrl
                          ? <img src={g.imageUrl} className="w-8 h-8 rounded-lg object-cover flex-shrink-0 shadow-sm" />
                          : <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{g.name}</p>
                          <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                            <div className="h-full rounded-full bg-cyan-500"
                              style={{ width: `${Math.round((g.playCount / maxPlay) * 100)}%` }} />
                          </div>
                        </div>
                        <span className="text-sm font-bold text-cyan-600 flex-shrink-0">{g.playCount}회</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {playStats.totalPlays === 0 && (
                <p className="text-center text-gray-400 py-4">아직 플레이 기록이 없어요</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 게임 관리 현황 섹션 */}
      {managementStats && (
        <div className="max-w-6xl mx-auto px-4 pb-6">
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-center gap-2">
              <span className="text-lg">🔧</span>
              <h2 className="text-base font-bold text-gray-900">게임 관리 현황</h2>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: '슬리브 완료', done: managementStats.sleeved },
                  { label: '박스 정리', done: managementStats.stored },
                  { label: '컴포 업그레이드', done: managementStats.upgraded },
                ].map(({ label, done }) => (
                  <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 font-semibold mb-1">{label}</p>
                    <p className="text-lg font-bold text-gray-900">
                      {done}<span className="text-xs font-normal text-gray-400"> / {managementStats.total}</span>
                    </p>
                    <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div className="h-full rounded-full bg-cyan-500"
                        style={{ width: managementStats.total > 0 ? `${Math.round((done / managementStats.total) * 100)}%` : '0%' }} />
                    </div>
                  </div>
                ))}
              </div>
              {Object.values(managementStats.condition as Record<string, number>).some((v: number) => v > 0) && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-bold text-gray-400 mb-2">박스 상태</p>
                  <div className="flex gap-2 flex-wrap">
                    {(['S', 'A', 'B', 'C'] as const).map(grade => managementStats.condition[grade] > 0 && (
                      <span key={grade} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-700 shadow-sm">
                        {grade}등급 {managementStats.condition[grade]}개
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 푸터 CTA */}
      <div className="bg-gray-900 mt-12">
        <div className="max-w-2xl mx-auto px-6 py-12 text-center">
          <p className="text-gray-400 text-sm mb-2 tracking-wide uppercase">BOARDRAUM</p>
          <h3 className="text-white text-2xl font-bold mb-3">나도 내 보드게임 컬렉션을<br />공유하고 싶다면?</h3>
          <p className="text-gray-400 text-sm mb-8">소유 게임 관리, 위시리스트, 플레이 기록까지<br />모두 무료로 관리하고 친구들과 공유하세요.</p>
          <a
            href="/"
            className="inline-block bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-xl text-base transition-colors"
          >
            무료로 시작하기
          </a>
          <p className="text-gray-600 text-xs mt-6">이 페이지는 BOARDRAUM 사용자의 컬렉션 공유 링크입니다</p>
        </div>
      </div>
    </div>
  );
}