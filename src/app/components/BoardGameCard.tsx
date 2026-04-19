import { useState, useRef } from 'react';
import { BoardGame, PlayRecord } from '../App';
import { getWikiGameId } from '../utils/wikiGameId';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { EditGameDialog } from './EditGameDialog';
import { Pencil, Trash2, Play, Users, Clock, BarChart3, Star, Plus, Minus, Calendar, MessageSquare, Package, Archive, Sparkles, ChevronDown, ChevronRight, Book, Globe, PackagePlus, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';
import { BoardWikiModal } from './BoardWikiModal';

// 보드위키 카테고리 옵션
const WIKI_MECHANISMS = [
  '타일 배치', '손 관리', '워커 플레이스먼트', '덱 빌딩', '주사위 굴리기',
  '세트 컬렉션', '경매/입찰', '협동', '정체 숨김', '진영전', '액션 포인트'
];

const WIKI_THEMES = [
  '판타지', '중세', 'SF', '경제', '전쟁', '추리', '공포', '탐험', '역사', '문명'
];

const LANGUAGE_DEPENDENCE = ['없음', '낮', '보통', '높음', '매우 높음'];

const GAME_TYPES = ['전략 게임', '파티 게임', '가족 게임', '어린이 게임', '추상 게임', '테마 게임'];

interface BoardGameCardProps {
  game: BoardGame;
  onEdit: (game: BoardGame) => void;
  onDelete: (gameId: string) => void;
  viewMode?: 'detailed' | 'simple';
  listType?: string;
  allGames?: BoardGame[]; // 전체 게임 목록 (확장판 찾기용)
  isExpanded?: boolean; // 확장판 목록 펼침 상태
  onToggleExpanded?: (gameId: string) => void; // 확장판 목록 토글
  getExpansions?: (parentGameId: string) => BoardGame[]; // 확장판 목록 가져오기
  showExpansionsSeparately?: boolean; // 확장판도 따로 보기 모드
  onNavigateToWiki?: (category: string, game: BoardGame) => void; // 보드위키 탭으로 이동
  isInModal?: boolean;
  accessToken?: string;
  userEmail?: string;
  onAddExpansion?: (game: BoardGame) => void;
  onMoveToOwned?: (game: BoardGame) => void; // 구매예정 → 보유로 이동
  onRelease?: (game: BoardGame) => void; // 방출하기
  userId?: string;
  readOnly?: boolean; // 읽기 전용 모드 (타인 프로필)
}

export function BoardGameCard({ 
  game, 
  onEdit, 
  onDelete, 
  viewMode = 'detailed', 
  listType, 
  allGames = [],
  isExpanded = false,
  onToggleExpanded,
  getExpansions,
  showExpansionsSeparately = false,
  onNavigateToWiki,
  isInModal = false,
  accessToken,
  userEmail,
  onAddExpansion,
  onMoveToOwned,
  onRelease,
  userId,
  readOnly = false,
}: BoardGameCardProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPlayRecordDialogOpen, setIsPlayRecordDialogOpen] = useState(false);
  const [newRecordDate, setNewRecordDate] = useState(new Date().toISOString().split('T')[0]);
  const [newRecordMemo, setNewRecordMemo] = useState('');
  
  // 새로운 플레이 기록 입력 필드
  const [players, setPlayers] = useState<{ name: string; score: number | string }[]>([{ name: '', score: '' }]);
  const [winner, setWinner] = useState<string>('');
  const [totalTimeHours, setTotalTimeHours] = useState(0);
  const [totalTimeMinutes, setTotalTimeMinutes] = useState(0);
  const [selectedExpansions, setSelectedExpansions] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  
  const [tempRating, setTempRating] = useState(game.rating || 0);
  const [isRatingEditing, setIsRatingEditing] = useState(false);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false); // 🆕 모바일 별점 모달
  const [selectedExpansion, setSelectedExpansion] = useState<BoardGame | null>(null);
  const [isPlayRecordExpanded, setIsPlayRecordExpanded] = useState(false);
  const [isGameInfoExpanded, setIsGameInfoExpanded] = useState(false);
  const [isWikiModalOpen, setIsWikiModalOpen] = useState(false);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const mobileDetailClosedAt = useRef<number>(0);
  const [reviewText, setReviewText] = useState(''); // 리뷰 텍스트
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [playerCountRating, setPlayerCountRating] = useState(0); // 플레이 기록 인원별 별점

  const handleAddPlayRecord = () => {
    // 유효성 검사
    const filledPlayers = players.filter(p => p.name.trim() !== '');
    if (filledPlayers.length === 0) {
      toast.error('플레이어를 최소 1명 이상 추가해주세요');
      return;
    }

    if (!winner) {
      toast.error('승자를 선택해주세요');
      return;
    }

    const totalMinutes = totalTimeHours * 60 + totalTimeMinutes;
    if (totalMinutes <= 0) {
      toast.error('플레이 시간을 입력해주세요');
      return;
    }

    // TODO: 이미지 업로드 처리 (Supabase Storage)
    // 지금은 일단 빈 배열로 설정
    const imageUrls: string[] = [];

    const newRecord: PlayRecord = {
      id: Date.now().toString(),
      date: newRecordDate,
      memo: newRecordMemo,
      players: filledPlayers.map(p => ({
        name: p.name,
        score: typeof p.score === 'string' ? (parseInt(p.score) || 0) : p.score
      })),
      winner: winner,
      totalTime: totalMinutes,
      expansionsUsed: selectedExpansions,
      location: location === '기타' ? customLocation : location,
      images: imageUrls,
      playerCountRating: playerCountRating || undefined,
      createdAt: new Date().toISOString(),
    };

    const updatedGame = {
      ...game,
      playRecords: [...(game.playRecords || []), newRecord],
      playCount: (game.playCount || 0) + 1, // 플레이 횟수도 자동 증가
    };

    onEdit(updatedGame);
    
    // 폼 초기화
    setNewRecordDate(new Date().toISOString().split('T')[0]);
    setNewRecordMemo('');
    setPlayers([{ name: '', score: '' }]);
    setWinner('');
    setTotalTimeHours(0);
    setTotalTimeMinutes(0);
    setSelectedExpansions([]);
    setLocation('');
    setCustomLocation('');
    setUploadedImages([]);
    
    // 인원별 별점이 있으면 보드위키에 등록
    const filledCount = filledPlayers.length;
    if (playerCountRating && filledCount >= 1) {
      submitPlayerCountRating(filledCount, playerCountRating);
    }

    setPlayerCountRating(0);
    setIsPlayRecordDialogOpen(false);
    toast.success('플레이 기록이 추가되었습니다! 📝');
  };

  const handleDeletePlayRecord = (recordId: string) => {
    const updatedGame = {
      ...game,
      playRecords: (game.playRecords || []).filter(r => r.id !== recordId),
    };
    onEdit(updatedGame);
    toast.success('플레이 기록이 삭제되었습니다');
  };

  // 방출 예정으로 설정
  const handleSetReleasing = () => {
    onEdit({ ...game, isReleasing: true });
    setIsDeleteDialogOpen(false);
    toast.success('방출 예정으로 설정되었습니다 📦');
  };

  // 방출 취소
  const handleCancelReleasing = () => {
    onEdit({ ...game, isReleasing: false });
    toast.success('방출이 취소되었습니다');
  };

  // 완전 삭제
  const handleCompleteDelete = () => {
    onDelete(game.id);
    toast.success(`"${game.koreanName}" 게임이 삭제되었습니다`);
  };

  // 방출시장에 판매 등록 (추후 구현)
  const handleSellToMarket = () => {
    toast.info('방출시장 기능은 준비중입니다');
    setIsDeleteDialogOpen(false);
  };

  const handleRatingChange = (rating: number) => {
    setTempRating(rating);
    onEdit({ ...game, rating });
  };

  // 별점+리뷰 보드위키에 즉시 등록 (관리자 검증 없이 바로 공개)
  const handleSubmitReview = async (rating: number, review: string) => {
    onEdit({ ...game, rating });
    setTempRating(rating);
    if (!accessToken) {
      toast.success(`평점 ${rating}/10 저장되었습니다! ⭐`);
      setIsRatingModalOpen(false);
      return;
    }
    setIsSubmittingReview(true);
    try {
      const { projectId } = await import('/utils/supabase/info');
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            gameId: getWikiGameId(game),
            gameName: game.koreanName,
            category: 'review',
            postType: 'post',
            title: `${userEmail?.split('@')[0] || '회원'} 리뷰`,
            status: 'approved',
            description: review, // 서버의 description 필드에도 저장 (fallback)
            data: { rating, content: review, reviewerEmail: userEmail },
          }),
        }
      );
      toast.success(review ? `평점 ${rating}/10 + 리뷰 등록! ⭐` : `평점 ${rating}/10 저장! ⭐`);
    } catch {
      toast.success(`평점 ${rating}/10 저장되었습니다! ⭐`);
    } finally {
      setIsSubmittingReview(false);
      setIsRatingModalOpen(false);
      setReviewText('');
    }
  };

  // 플레이 기록 인원별 별점을 보드위키 player-count 카테고리에 등록
  const submitPlayerCountRating = async (playerCount: number, rating: number) => {
    if (!accessToken || !rating) return;
    try {
      const { projectId } = await import('/utils/supabase/info');
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            gameId: getWikiGameId(game),
            gameName: game.koreanName,
            category: 'player-count',
            postType: 'post',
            title: `${playerCount}인 플레이 평가`,
            status: 'approved',
            data: { playerCount, rating, reviewerEmail: userEmail },
          }),
        }
      );
    } catch {
      // 조용히 실패 (플레이 기록 저장 자체는 성공했으므로)
    }
  };

  // 확장판 목록 가져오기
  const expansions = !game.isExpansion && getExpansions ? getExpansions(game.id) : [];
  const hasExpansions = expansions.length > 0;

  // 간단히 보기 모드
  if (viewMode === 'simple') {
    // 모바일: 카드 전체가 탭 영역 (버튼 없음), PC: 버튼 표시
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

    return (
      <>
        <Card className={`overflow-hidden hover:shadow-lg transition-all duration-200 border-gray-200 bg-white ${game.isReleasing ? 'opacity-50 grayscale-[30%]' : ''}`}>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">

              {/* 게임 정보 영역 — 모바일 탭 처리 */}
              <div
                className="flex-1 min-w-0 sm:cursor-default cursor-pointer"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth < 640) {
                    setIsMobileDetailOpen(true);
                  }
                }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base sm:text-lg text-gray-900 break-words">{game.koreanName}</h3>
                  {game.isExpansion && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {game.expansionType === 'series' ? '시리즈' : game.expansionType === 'legacy' ? '레거시' : '확장'}
                    </span>
                  )}
                  {game.languageEdition && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      game.languageEdition === 'korean' ? 'bg-cyan-100 text-cyan-800'
                      : game.languageEdition === 'english' ? 'bg-blue-100 text-blue-800'
                      : 'bg-purple-100 text-purple-800'
                    }`}>
                      {game.languageEdition === 'korean' ? '한글판' : game.languageEdition === 'english' ? '영문판' : '다국어판'}
                    </span>
                  )}
                  {game.quantity && game.quantity > 1 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      보유({game.quantity})
                    </span>
                  )}
                </div>
                {game.englishName && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{game.englishName}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                  {game.recommendedPlayers && <span>{game.recommendedPlayers}</span>}
                  {game.playTime && <span>· {game.playTime}</span>}
                  {game.difficulty && <span>· {game.difficulty}</span>}
                </div>
              </div>

              {/* 평점 — 모바일: 탭하면 모달 / PC: 클릭해서 별점 수정 */}
              <div className="flex-shrink-0">
                {/* 모바일 전용: 탭하면 상세 모달 */}
                <div
                  className="sm:hidden flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-lg cursor-pointer"
                  onClick={() => setIsMobileDetailOpen(true)}
                >
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  <span className="font-bold text-sm text-gray-900">{game.rating || '-'}</span>
                </div>
                {/* PC 전용: 별점 모달 직접 열기 */}
                <button
                  className="hidden sm:flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-lg hover:bg-yellow-100 transition-colors"
                  onClick={() => setIsRatingModalOpen(true)}
                >
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  <span className="font-bold text-sm text-gray-900">{game.rating || '-'}</span>
                </button>
              </div>

              {/* PC 전용 액션 버튼 */}
              {!readOnly && (
                <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                  {game.videoUrl && (
                    <Button variant="ghost" size="sm" className="hover:bg-gray-100 h-8 w-8 p-0"
                      onClick={() => window.open(game.videoUrl, '_blank')}>
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="outline" size="sm"
                    className="hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors text-xs"
                    onClick={() => setIsWikiModalOpen(true)}>
                    <Book className="w-4 h-4 mr-1" />보드위키
                  </Button>
                  <Button variant="ghost" size="sm" className="hover:bg-gray-100 h-8 w-8 p-0"
                    onClick={() => setIsEditDialogOpen(true)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="hover:bg-red-50 h-8 w-8 p-0"
                    onClick={() => setIsDeleteDialogOpen(true)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                  {!game.isExpansion && onAddExpansion && (
                    <Button variant="ghost" size="sm" title="확장판 추가"
                      className="hover:bg-blue-50 h-8 w-8 p-0"
                      onClick={() => onAddExpansion(game)}>
                      <PackagePlus className="w-4 h-4 text-blue-500" />
                    </Button>
                  )}
                  {listType === '구매 예정' && onMoveToOwned && (
                    <Button variant="ghost" size="sm" title="보유 리스트로 이동"
                      className="hover:bg-green-50 h-8 w-8 p-0"
                      onClick={() => onMoveToOwned(game)}>
                      <PackageCheck className="w-4 h-4 text-green-600" />
                    </Button>
                  )}
                  {listType === '보유' && onRelease && (
                    <Button variant="ghost" size="sm" title="방출하기"
                      className="hover:bg-orange-50 text-orange-500 hover:text-orange-600 h-8 px-2 gap-1 text-xs font-medium"
                      onClick={() => onRelease(game)}>
                      <span>📦</span>
                      <span className="hidden sm:inline">방출</span>
                    </Button>
                  )}
                </div>
              )}

              {/* 모바일 전용: 화살표 힌트 */}
              <ChevronRight className="flex sm:hidden w-4 h-4 text-gray-300 flex-shrink-0" />

            </div>
          </CardContent>
        </Card>

        {/* 모바일 상세 모달 */}
        <Dialog open={isMobileDetailOpen} onOpenChange={setIsMobileDetailOpen}>
          <DialogContent className="sm:hidden max-w-lg w-[95vw] max-h-[92vh] overflow-y-auto p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>{game.koreanName || game.englishName}</DialogTitle>
              <DialogDescription>게임 상세 정보</DialogDescription>
            </DialogHeader>
            <div className="p-4">
              {isMobileDetailOpen && (
                <BoardGameCard
                  key={`mobile-detail-${game.id}`}
                  game={game}
                  onEdit={(updated) => { onEdit(updated); }}
                  onDelete={(id) => { onDelete(id); setIsMobileDetailOpen(false); }}
                  viewMode="detailed"
                  listType={listType}
                  allGames={allGames}
                  isInModal={true}
                  accessToken={accessToken}
                  userEmail={userEmail}
                  onAddExpansion={onAddExpansion}
                  onMoveToOwned={onMoveToOwned}
                  readOnly={readOnly}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* PC 전용 다이얼로그들 */}
        <EditGameDialog
          game={game}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onEditGame={onEdit}
          accessToken={accessToken}
        />

        {/* 삭제 옵션 모달 제거 - AlertDialog도 제거하고 아래 Dialog로 통합 */}

        <BoardWikiModal
          game={game}
          open={isWikiModalOpen}
          onOpenChange={setIsWikiModalOpen}
          onNavigateToWiki={onNavigateToWiki}
          accessToken={accessToken}
          userEmail={userEmail}
        />
        <Dialog open={isRatingModalOpen} onOpenChange={(open) => { if (!open) { setIsRatingModalOpen(false); setReviewText(''); } }}>
          <DialogContent className="max-w-sm w-[calc(100vw-2rem)] max-h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
              <DialogTitle className="text-center">⭐ 별점 &amp; 리뷰</DialogTitle>
              <DialogDescription className="text-center text-sm">{game.koreanName}</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 px-5 space-y-5 py-2">
              <div className="text-center">
                <span className="text-4xl font-bold text-gray-900">{tempRating || 0}</span>
                <span className="text-lg text-gray-400 ml-1">/10</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[1,2,3,4,5,6,7,8,9,10].map(r => (
                  <button key={r} onClick={() => setTempRating(r)}
                    className={`h-9 rounded-lg text-sm font-bold transition-all ${
                      tempRating === r ? 'bg-yellow-400 text-white shadow-lg scale-110' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>{r}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setTempRating(Math.max(0, tempRating - 0.5))}
                  className="flex-1 h-10" disabled={tempRating <= 0}>-0.5</Button>
                <span className="text-sm font-bold text-gray-700 w-10 text-center">{tempRating}</span>
                <Button variant="outline" size="sm" onClick={() => setTempRating(Math.min(10, tempRating + 0.5))}
                  className="flex-1 h-10" disabled={tempRating >= 10}>+0.5</Button>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">한줄 리뷰 (선택)</label>
                <textarea value={reviewText} onChange={e => setReviewText(e.target.value)}
                  placeholder="이 게임에 대한 한줄 리뷰를 남겨보세요..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-gray-300"/>
              </div>
            </div>
            <DialogFooter className="px-5 py-4 flex-shrink-0 border-t border-gray-100">
              <Button variant="outline" onClick={() => setIsRatingModalOpen(false)}>취소</Button>
              <Button className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold"
                onClick={() => handleSubmitReview(tempRating, reviewText)}
                disabled={isSubmittingReview || tempRating === 0}>저장</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }


  // 상세 보기 모드 (기존 코드)
  return (
    <>
      <Card className="relative overflow-hidden hover:shadow-xl transition-all duration-300 border-gray-200 bg-white">
        {/* 방출예정 오버레이 */}
        {game.isReleasing && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-6 p-6">
            {/* 텍스트 */}
            <div className="text-center space-y-2">
              <p className="text-white font-bold text-2xl">방출 예정</p>
              <p className="text-gray-200 text-base">{game.koreanName}</p>
            </div>
            
            {/* 버튼 */}
            <div className="flex gap-3 mt-2">
              <Button 
                onClick={handleCancelReleasing}
                className="bg-white text-gray-900 hover:bg-gray-100 font-semibold px-6 h-11 rounded-xl"
              >
                방출 취소
              </Button>
              <Button 
                onClick={handleCompleteDelete}
                className="bg-red-300 hover:bg-red-400 text-white font-semibold px-6 h-11 rounded-xl"
              >
                완전 삭제
              </Button>
            </div>
          </div>
        )}
        {/* ── 모달 컴팩트 헤더: 이미지 + 제목 + 정보 가로 배치 ── */}
        {isInModal && (
          <div className="flex items-start gap-3 p-4 pr-5 border-b border-gray-100">
            {game.imageUrl && (
              <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                <img src={game.imageUrl} alt={game.koreanName} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-bold text-base text-gray-900 break-words">{game.koreanName}</h3>
                    {game.isExpansion && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {game.expansionType === 'series' ? '시리즈' : game.expansionType === 'legacy' ? '레거시' : '확장'}
                      </span>
                    )}
                    {game.languageEdition && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        game.languageEdition === 'korean' ? 'bg-cyan-100 text-cyan-800'
                        : game.languageEdition === 'english' ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                      }`}>
                        {game.languageEdition === 'korean' ? '한글판' : game.languageEdition === 'english' ? '영문판' : '다국어판'}
                      </span>
                    )}
                    {game.quantity && game.quantity > 1 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                        보유({game.quantity})
                      </span>
                    )}
                  </div>
                  {game.englishName && (
                    <p className="text-xs text-gray-400 break-words mt-0.5">{game.englishName}</p>
                  )}
                </div>
                <button
                  onClick={() => setIsRatingModalOpen(true)}
                  className="flex-shrink-0 flex items-center gap-1 bg-yellow-50 px-2.5 py-1 rounded-lg hover:bg-yellow-100 transition-colors"
                >
                  <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  <span className="font-bold text-sm text-gray-900">{game.rating || '-'}</span>
                  <span className="text-xs text-gray-500">/10</span>
                </button>
              </div>
              {/* 게임 정보 인라인 뱃지 */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {game.recommendedPlayers && (
                  <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-lg border border-gray-200 whitespace-nowrap">
                    <Users className="w-3 h-3 text-gray-400" />{game.recommendedPlayers}
                  </span>
                )}
                {game.playTime && (
                  <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-lg border border-gray-200 whitespace-nowrap">
                    <Clock className="w-3 h-3 text-gray-400" />{game.playTime}
                  </span>
                )}
                {game.difficulty && (
                  <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-lg border border-gray-200 whitespace-nowrap">
                    <BarChart3 className="w-3 h-3 text-gray-400" />{game.difficulty}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={isInModal ? "" : "flex flex-col sm:flex-row"}>
          {/* 이미지 영역 (일반 뷰 전용) */}
          {!isInModal && game.imageUrl && (
            <div className="w-full sm:w-64 flex-shrink-0 bg-white flex items-center justify-center p-4 sm:p-6 border-b sm:border-b-0 sm:border-r border-gray-100">
              <img
                src={game.imageUrl}
                alt={game.koreanName}
                className="h-48 sm:h-64 w-auto object-contain max-w-full drop-shadow-md"
              />
            </div>
          )}

          {/* 정보 영역 */}
          <CardContent className={isInModal ? "flex-1 p-4" : "flex-1 p-4 sm:p-6"}>
            {/* 제목과 평점 (일반 뷰 전용 — 모달은 상단 헤더에서 표시) */}
            {!isInModal && (
              <div className="mb-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-xl text-gray-900 break-words">{game.koreanName}</h3>
                      {game.isExpansion && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {game.expansionType === 'series' ? '시리즈' : game.expansionType === 'legacy' ? '레거시' : '확장'}
                        </span>
                      )}
                      {game.languageEdition && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          game.languageEdition === 'korean'
                            ? 'bg-cyan-100 text-cyan-800'
                            : game.languageEdition === 'english'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {game.languageEdition === 'korean' ? '한글판' : game.languageEdition === 'english' ? '영문판' : '다국어판'}
                        </span>
                      )}
                      {game.quantity && game.quantity > 1 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          보유({game.quantity})
                        </span>
                      )}
                    </div>
                    {game.englishName && (
                      <p className="text-sm text-gray-400 font-medium break-words mt-1">{game.englishName}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => setIsRatingModalOpen(true)}
                      className="flex items-center gap-1 bg-yellow-50 px-3 py-1.5 rounded-lg hover:bg-yellow-100 transition-colors"
                    >
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-bold text-gray-900">{game.rating || '-'}</span>
                      <span className="text-xs text-gray-500">/10</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 게임 정보 그리드 (일반 뷰 전용 — 모달은 상단 헤더에서 표시) */}
            {!isInModal && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {game.recommendedPlayers && (
                  <div className="flex flex-col items-center gap-1.5 text-xs sm:text-sm text-gray-600 bg-gray-50 rounded-lg px-2 py-2.5">
                    <Users className="w-4 h-4 flex-shrink-0 text-gray-500" />
                    <span className="font-medium text-center">{game.recommendedPlayers}</span>
                  </div>
                )}
                {game.playTime && (
                  <div className="flex flex-col items-center gap-1.5 text-xs sm:text-sm text-gray-600 bg-gray-50 rounded-lg px-2 py-2.5">
                    <Clock className="w-4 h-4 flex-shrink-0 text-gray-500" />
                    <span className="font-medium text-center">{game.playTime}</span>
                  </div>
                )}
                {game.difficulty && (
                  <div className="flex flex-col items-center gap-1.5 text-xs sm:text-sm text-gray-600 bg-gray-50 rounded-lg px-2 py-2.5">
                    <BarChart3 className="w-4 h-4 flex-shrink-0 text-gray-500" />
                    <span className="font-medium text-center">{game.difficulty}</span>
                  </div>
                )}
              </div>
            )}

            {/* 구매 예정 리스트가 아니고 읽기 전용이 아닐 때만 플레이 기록 & 게임 정보 표시 */}
            {listType !== '구매 예정' && !readOnly && (
              <>
                {/* 플레이 기록 */}
                <div className="mb-4">
                  <div className="w-full flex items-center justify-between text-left p-3 rounded-lg bg-gradient-to-r from-gray-50 to-slate-50 hover:from-gray-100 hover:to-slate-100 transition-all duration-200 mb-2">
                    <button
                      onClick={() => setIsPlayRecordExpanded(!isPlayRecordExpanded)}
                      className="flex items-center gap-2 flex-1"
                    >
                      {isPlayRecordExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      )}
                      <span className="text-sm font-semibold text-gray-700">
                        플레이 기록 {game.playRecords && game.playRecords.length > 0 ? `(${game.playRecords.length})` : ''}
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {isPlayRecordExpanded ? '접기' : '펼치기'}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsPlayRecordDialogOpen(true);
                        }}
                        className="h-7 text-xs hover:bg-white"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        추가
                      </Button>
                    </div>
                  </div>
                  
                  {isPlayRecordExpanded && (
                    <div className="ml-4 pl-4 border-l-2 border-gray-200">
                      {game.playRecords && game.playRecords.length > 0 ? (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {game.playRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((record) => (
                            <div key={record.id} className="bg-white border border-gray-200 rounded-lg p-3 text-sm hover:shadow-md transition-shadow">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                                  <Calendar className="w-3 h-3 text-blue-600" />
                                  <span>{record.date}</span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeletePlayRecord(record.id)}
                                  className="h-5 w-5 p-0 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                </Button>
                              </div>
                              
                              {/* 플레이어 & 점수 */}
                              {record.players && record.players.length > 0 && (
                                <div className="mb-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {record.players.map((player, idx) => (
                                      <div
                                        key={idx}
                                        className={`px-2 py-1 rounded text-xs font-medium ${
                                          player.name === record.winner
                                            ? 'bg-green-100 text-green-800 border border-green-300'
                                            : 'bg-gray-100 text-gray-700'
                                        }`}
                                      >
                                        <Users className="w-3 h-3 inline mr-1" />
                                        {player.name}: {player.score}점
                                        {player.name === record.winner && ' 🏆'}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* 승자 */}
                              {record.winner && (record.winner === '무승부' || record.winner === '승자 없음') && (
                                <div className="mb-2">
                                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                    record.winner === '무승부'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {record.winner === '무승부' ? '🤝' : '🎮'} {record.winner}
                                  </span>
                                </div>
                              )}
                              
                              {/* 플레이 시간 */}
                              {record.totalTime && record.totalTime > 0 && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2">
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    {Math.floor(record.totalTime / 60)}시간 {record.totalTime % 60}분
                                  </span>
                                </div>
                              )}
                              
                              {/* 확장판 사용 */}
                              {record.expansionsUsed && record.expansionsUsed.length > 0 && (
                                <div className="mb-2">
                                  <div className="flex flex-wrap gap-1">
                                    {record.expansionsUsed.map((expId) => {
                                      const exp = allGames.find(g => g.id === expId);
                                      return exp ? (
                                        <span
                                          key={expId}
                                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200"
                                        >
                                          {exp.koreanName}
                                        </span>
                                      ) : null;
                                    })}
                                  </div>
                                </div>
                              )}
                              
                              {/* 장소 */}
                              {record.location && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2">
                                  <span>📍 {record.location}</span>
                                </div>
                              )}
                              
                              {/* 메모 */}
                              {record.memo && (
                                <div className="flex items-start gap-1.5 text-gray-700 bg-gray-50 rounded p-2 mt-2">
                                  <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  <p className="break-words text-xs">{record.memo}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-xs text-gray-400 bg-gray-50 rounded-lg">
                          플레이 기록이 없습니다
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 체크 항목 & 플레이 횟수 */}
                <div className="mb-4">
                  <button
                    onClick={() => setIsGameInfoExpanded(!isGameInfoExpanded)}
                    className="w-full flex items-center justify-between text-left p-3 rounded-lg bg-gradient-to-r from-gray-50 to-slate-50 hover:from-gray-100 hover:to-slate-100 transition-all duration-200 mb-2"
                  >
                    <div className="flex items-center gap-2">
                      {isGameInfoExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      )}
                      <span className="text-sm font-semibold text-gray-700">게임 관리현황</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {isGameInfoExpanded ? '접기' : '펼치기'}
                    </span>
                  </button>
                  
                  {isGameInfoExpanded && (
                    <div className="ml-4 pl-4 border-l-2 border-gray-200 space-y-3">
                      {/* 체크박스 */}
                      <div className="grid grid-cols-1 gap-2">
                        <label className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 cursor-pointer hover:bg-gray-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={game.hasSleeve || false}
                            onChange={(e) => {
                              onEdit({ ...game, hasSleeve: e.target.checked });
                              toast.success(e.target.checked ? '슬리브 완료 ✓' : '슬리브 해제');
                            }}
                            className="w-4 h-4 text-cyan-600 rounded focus:ring-2 focus:ring-cyan-500"
                          />
                          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                            <Package className="w-3.5 h-3.5" />
                            <span>슬리브 완료</span>
                          </div>
                        </label>
                        
                        <label className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 cursor-pointer hover:bg-gray-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={game.hasStorage || false}
                            onChange={(e) => {
                              onEdit({ ...game, hasStorage: e.target.checked });
                              toast.success(e.target.checked ? '박스 아스테이지 완료 ✓' : '박스 아스테이지 해제');
                            }}
                            className="w-4 h-4 text-cyan-600 rounded focus:ring-2 focus:ring-cyan-500"
                          />
                          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                            <Archive className="w-3.5 h-3.5" />
                            <span>박스 아스테이지 완료</span>
                          </div>
                        </label>
                        
                        <label className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 cursor-pointer hover:bg-gray-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={game.hasComponentUpgrade || false}
                            onChange={(e) => {
                              onEdit({ ...game, hasComponentUpgrade: e.target.checked });
                              toast.success(e.target.checked ? '컴포 업그레이드 완료 ✓' : '컴포 업그레이드 해제');
                            }}
                            className="w-4 h-4 text-cyan-600 rounded focus:ring-2 focus:ring-cyan-500"
                          />
                          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>컴포 업그레이드</span>
                          </div>
                        </label>
                      </div>

                      {/* 박스 상태 */}
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
                          <Package className="w-3.5 h-3.5" />
                          <span>박스 상태</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {(['S', 'A', 'B', 'C'] as const).map((grade) => (
                            <button
                              key={grade}
                              onClick={() => {
                                const newCondition = game.boxCondition === grade ? undefined : grade;
                                onEdit({ ...game, boxCondition: newCondition });
                                toast.success(newCondition ? `박스 상태: ${grade}급` : '박스 상태 해제');
                              }}
                              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                                game.boxCondition === grade
                                  ? 'bg-cyan-500 text-white shadow-md'
                                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                              }`}
                            >
                              {grade}급
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 언어판 */}
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
                          <Globe className="w-3.5 h-3.5" />
                          <span>언어판</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            { value: 'korean', label: '한글판', color: 'cyan' },
                            { value: 'english', label: '영문판', color: 'blue' },
                            { value: 'multilingual', label: '다국어판', color: 'purple' }
                          ] as const).map((edition) => (
                            <button
                              key={edition.value}
                              onClick={() => {
                                const newEdition = game.languageEdition === edition.value ? undefined : edition.value;
                                onEdit({ ...game, languageEdition: newEdition });
                                toast.success(newEdition ? `${edition.label} 선택` : '언어판 해제');
                              }}
                              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                                game.languageEdition === edition.value
                                  ? edition.color === 'cyan'
                                    ? 'bg-cyan-500 text-white shadow-md'
                                    : edition.color === 'blue'
                                    ? 'bg-blue-500 text-white shadow-md'
                                    : 'bg-purple-500 text-white shadow-md'
                                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                              }`}
                            >
                              {edition.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 보유 수량 */}
                      <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 flex-shrink-0">
                          <Package className="w-3.5 h-3.5" />
                          <span>보유 수량</span>
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const newQuantity = Math.max(1, (game.quantity || 1) - 1);
                              onEdit({ ...game, quantity: newQuantity });
                              toast.success(`수량: ${newQuantity}개`);
                            }}
                            className="h-7 w-7 p-0"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-sm font-semibold text-gray-900 min-w-[2rem] text-center">
                            {game.quantity || 1}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const newQuantity = Math.min(99, (game.quantity || 1) + 1);
                              onEdit({ ...game, quantity: newQuantity });
                              toast.success(`수량: ${newQuantity}개`);
                            }}
                            className="h-7 w-7 p-0"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      {/* 플레이 횟수 */}
                      <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 flex-shrink-0">
                          <Play className="w-3.5 h-3.5" />
                          <span>플레이 횟수</span>
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const newCount = Math.max(0, (game.playCount || 0) - 1);
                              onEdit({ ...game, playCount: newCount });
                            }}
                            className="h-7 w-7 p-0 text-lg"
                            disabled={(game.playCount || 0) === 0}
                          >
                            −
                          </Button>
                          <span className="font-bold text-sm text-gray-900 w-8 text-center">
                            {game.playCount || 0}회
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const newCount = (game.playCount || 0) + 1;
                              onEdit({ ...game, playCount: newCount });
                              toast.success(`플레이 횟수: ${newCount}회`);
                            }}
                            className="h-7 w-7 p-0 text-lg"
                          >
                            +
                          </Button>
                        </div>
                      </div>
                      {/* 구매 시기 */}
                      <div className="bg-gray-50 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                          <span>🛒</span>
                          <span>구매 시기</span>
                        </div>
                        <input
                          type="date"
                          value={game.purchaseDate || ''}
                          onChange={(e) => {
                            onEdit({ ...game, purchaseDate: e.target.value || undefined });
                            if (e.target.value) toast.success(`구매 시기: ${e.target.value}`);
                          }}
                          className="w-full h-8 px-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                        />
                      </div>

                      {/* 구매 금액 */}
                      <div className="bg-gray-50 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                          <span>💰</span>
                          <span>구매 금액</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={game.purchasePrice != null ? game.purchasePrice.toLocaleString() : ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              const price = raw ? parseInt(raw) : undefined;
                              onEdit({ ...game, purchasePrice: price });
                            }}
                            onBlur={() => {
                              if (game.purchasePrice != null) toast.success(`구매 금액: ${game.purchasePrice.toLocaleString()}원`);
                            }}
                            className="flex-1 h-8 px-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                          />
                          <span className="text-xs text-gray-500 flex-shrink-0">원</span>
                        </div>
                      </div>

                      {/* 방출 버튼 */}
                      {listType === '보유' && onRelease && (
                        <div className="pt-2 border-t border-gray-200">
                          {game.isReleasing ? (
                            <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-base">📦</span>
                                <div>
                                  <p className="text-xs font-semibold text-orange-700">방출 예정</p>
                                  <p className="text-xs text-orange-500">마켓 미등록 상태</p>
                                </div>
                              </div>
                              <button
                                onClick={() => onEdit({ ...game, isReleasing: false })}
                                className="text-xs px-3 py-1.5 bg-white border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 font-medium"
                              >
                                방출 취소
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => onRelease(game)}
                              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-orange-300 text-orange-500 hover:bg-orange-50 hover:border-orange-400 transition-colors text-sm font-medium"
                            >
                              <span>📦</span> 이 게임 방출하기
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 확장판 목록 (본판이면서 확장판이 있을 때) */}
            {!game.isExpansion && hasExpansions && listType === '보유' && (
              <div className="mb-4 pb-4 border-t pt-4">
                <button
                  onClick={() => onToggleExpanded && onToggleExpanded(game.id)}
                  className="w-full flex items-center justify-between text-left p-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-all duration-200"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-blue-600" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-blue-600" />
                    )}
                    <span className="text-sm font-semibold text-blue-900">
                      확장판 {expansions.length}개
                    </span>
                  </div>
                  <span className="text-xs text-blue-700">
                    {isExpanded ? '접기' : '펼치기'}
                  </span>
                </button>

                {/* 확장판 목록 */}
                {isExpanded && (
                  <div className="mt-3 ml-4 space-y-2 pl-4 border-l-2 border-blue-200">
                    {expansions.map((expansion) => (
                      <div 
                        key={expansion.id} 
                        className="bg-white border border-blue-100 rounded-lg p-3 hover:shadow-md transition-all duration-200 cursor-pointer"
                        onClick={() => setSelectedExpansion(expansion)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="font-semibold text-sm text-gray-900 break-words">
                                {expansion.koreanName}
                              </h5>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 flex-shrink-0">
                                확장
                              </span>
                            </div>
                            {expansion.englishName && (
                              <p className="text-xs text-gray-400 mb-2">{expansion.englishName}</p>
                            )}
                            
                            {/* 확장판 간단 정보 */}
                            <div className="flex items-center gap-2 text-xs">
                              {expansion.rating && (
                                <div className="flex items-center gap-1 bg-yellow-50 px-2 py-0.5 rounded">
                                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                  <span className="font-medium text-gray-900">{expansion.rating}</span>
                                </div>
                              )}
                              {expansion.playCount !== undefined && expansion.playCount > 0 && (
                                <div className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded">
                                  <Play className="w-3 h-3 text-gray-600" />
                                  <span className="text-gray-700">{expansion.playCount}회</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* 확장판 액션 버튼 */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="hover:bg-red-50 h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(expansion.id);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 액션 버튼 */}
            {!readOnly && (
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                {game.videoUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors text-xs sm:text-sm"
                    onClick={() => window.open(game.videoUrl, '_blank')}
                  >
                    <Play className="w-4 h-4 mr-1.5" />
                    설명 영상
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors text-xs sm:text-sm"
                  onClick={() => setIsWikiModalOpen(true)}
                >
                  <Book className="w-4 h-4 mr-1.5" />
                  보드위키
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-gray-100"
                  onClick={() => setIsEditDialogOpen(true)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-red-50"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                </Button>
                {!game.isExpansion && onAddExpansion && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="확장판 추가"
                    className="hover:bg-blue-50"
                    onClick={() => onAddExpansion(game)}
                  >
                    <PackagePlus className="w-4 h-4 text-blue-500" />
                  </Button>
                )}
                {listType === '구매 예정' && onMoveToOwned && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="보유 리스트로 이동"
                    className="hover:bg-green-50"
                    onClick={() => onMoveToOwned(game)}
                  >
                    <PackageCheck className="w-4 h-4 text-green-600" />
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      {/* 플레이 기록 추가 다이얼로그 */}
      <Dialog open={isPlayRecordDialogOpen} onOpenChange={setIsPlayRecordDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>플레이 기록 추가</DialogTitle>
            <DialogDescription>
              {game.koreanName}의 플레이 기록을 작성하세요
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* 플레이 날짜 */}
            <div className="space-y-2">
              <Label htmlFor="playDate" className="text-sm font-semibold">플레이 날짜 *</Label>
              <Input
                id="playDate"
                type="date"
                value={newRecordDate}
                onChange={(e) => setNewRecordDate(e.target.value)}
              />
            </div>
            
            {/* 플레이어 & 점수 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">플레이어 & 점수 *</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPlayers([...players, { name: '', score: '' }])}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  플레이어 추가
                </Button>
              </div>
              <div className="space-y-2">
                {players.map((player, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="이름"
                      value={player.name}
                      onChange={(e) => {
                        const newPlayers = [...players];
                        newPlayers[index].name = e.target.value;
                        setPlayers(newPlayers);
                      }}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="점수"
                      value={player.score}
                      onChange={(e) => {
                        const newPlayers = [...players];
                        // 빈 문자열 허용 (0 대신)
                        const value = e.target.value;
                        newPlayers[index].score = value === '' ? '' : parseInt(value) || 0;
                        setPlayers(newPlayers);
                      }}
                      className="w-24"
                    />
                    {players.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPlayers(players.filter((_, i) => i !== index));
                        }}
                        className="h-9 w-9 p-0 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 승자 선택 */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">승자 *</Label>
              <div className="flex flex-wrap gap-2">
                {players.filter(p => p.name.trim() !== '').map((player, index) => (
                  <button
                    key={index}
                    onClick={() => setWinner(player.name)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      winner === player.name
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {player.name}
                  </button>
                ))}
                <button
                  onClick={() => setWinner('무승부')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    winner === '무승부'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  무승부
                </button>
                <button
                  onClick={() => setWinner('승자 없음')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    winner === '승자 없음'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  승자 없음
                </button>
              </div>
            </div>

            {/* 총 플레이 시간 */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">총 플레이 시간 *</Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={totalTimeHours === 0 ? '' : totalTimeHours}
                    onChange={(e) => setTotalTimeHours(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                    className="w-20"
                  />
                  <span className="text-sm text-gray-600">시간</span>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="0"
                    value={totalTimeMinutes === 0 ? '' : totalTimeMinutes}
                    onChange={(e) => setTotalTimeMinutes(e.target.value === '' ? 0 : Math.min(59, parseInt(e.target.value) || 0))}
                    className="w-20"
                  />
                  <span className="text-sm text-gray-600">분</span>
                </div>
              </div>
            </div>

            {/* 사용한 확장판 */}
            {expansions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">사용한 확장판 *</Label>
                <div className="space-y-1">
                  {expansions.map((expansion) => (
                    <label
                      key={expansion.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedExpansions.includes(expansion.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedExpansions([...selectedExpansions, expansion.id]);
                          } else {
                            setSelectedExpansions(selectedExpansions.filter(id => id !== expansion.id));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-600"
                      />
                      <span className="text-sm text-gray-700">{expansion.koreanName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 게임 장소 (선택) */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">게임 장소 (선택)</Label>
              <div className="flex flex-wrap gap-2">
                {['집', '보드게임 카페', '카페', '기타'].map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setLocation(loc)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      location === loc
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
              {location === '기타' && (
                <Input
                  placeholder="직접 입력"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>

            {/* 플레이 메모 (선택) */}
            <div className="space-y-2">
              <Label htmlFor="playMemo" className="text-sm font-semibold">플레이 메모 (선택)</Label>
              <Textarea
                id="playMemo"
                placeholder="예: 친구들과 재미있게 플레이. 다음엔 확장팩 추가해서 해보기"
                value={newRecordMemo}
                onChange={(e) => setNewRecordMemo(e.target.value)}
                rows={3}
              />
            </div>

            {/* 사진 첨부 (선택) - TODO */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-400">사진 첨부 (선택) - 준비 중</Label>
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center text-sm text-gray-400">
                이미지 업로드 기능은 준비 중입니다
              </div>
            </div>

            {/* 인원별 별점 */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-semibold">인원별 평점</Label>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {players.filter(p => p.name.trim()).length}인 플레이
                </span>
              </div>
              <p className="text-xs text-gray-400">이 인원 수로 플레이했을 때의 경험을 평가해주세요. 보드위키 인원별 평가에 반영됩니다.</p>
              <div className="flex flex-wrap gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                  <button key={r} type="button"
                    onClick={() => setPlayerCountRating(r === playerCountRating ? 0 : r)}
                    className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                      playerCountRating === r && r > 0
                        ? 'bg-blue-500 text-white shadow scale-110'
                        : r === 0
                        ? 'bg-gray-100 text-gray-400 hover:bg-gray-200 text-xs'
                        : 'bg-gray-100 text-gray-700 hover:bg-blue-100'
                    }`}>
                    {r === 0 ? '없음' : r}
                  </button>
                ))}
              </div>
              {playerCountRating > 0 && (
                <p className="text-xs text-blue-600 font-medium">
                  {players.filter(p => p.name.trim()).length}인 플레이: {playerCountRating}/10점 으로 평가됩니다
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPlayRecordDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAddPlayRecord}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditGameDialog
        game={game}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onEditGame={onEdit}
        accessToken={accessToken}
      />

      {/* 확장판 상세 모달 */}
      {selectedExpansion && (
        <Dialog open={!!selectedExpansion} onOpenChange={(open) => !open && setSelectedExpansion(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>{selectedExpansion.koreanName || selectedExpansion.englishName}</DialogTitle>
              <DialogDescription>확장판 상세 정보</DialogDescription>
            </DialogHeader>
            <div className="p-4 sm:p-6">
              <BoardGameCard
                game={selectedExpansion}
                onEdit={(updatedGame) => {
                  onEdit(updatedGame);                    // 리스트에 반영
                  setSelectedExpansion(updatedGame);      // 모달 내부도 즉시 반영
                }}
                onDelete={(id) => {
                  onDelete(id);
                  setSelectedExpansion(null);
                }}
                viewMode="detailed"
                listType={listType}
                allGames={allGames}
                isInModal={true}
                accessToken={accessToken}
                userEmail={userEmail}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>"{game.koreanName}" 처리 방법 선택</DialogTitle>
            <DialogDescription>
              어떻게 처리하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4 border-2 hover:border-red-300 hover:bg-red-50"
              onClick={() => {
                onDelete(game.id);
                setIsDeleteDialogOpen(false);
                toast.success(`"${game.koreanName}" 게임이 완전히 삭제되었습니다.`);
              }}
            >
              <div className="text-left">
                <div className="font-bold text-black">완전히 삭제</div>
                <div className="text-sm text-gray-500 mt-1">목록에서 영구적으로 제거됩니다</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4 border-2 hover:border-orange-500 hover:bg-orange-50"
              onClick={() => {
                onEdit({ ...game, isReleasing: true });
                setIsDeleteDialogOpen(false);
                toast.success(`"${game.koreanName}" 게임이 방출예정으로 표시되었습니다.`);
              }}
            >
              <div className="text-left">
                <div className="font-bold text-black">방출예정으로 표시</div>
                <div className="text-sm text-gray-500 mt-1">목록에 남아있지만 방출예정 상태가 됩니다</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4 border-2 hover:border-cyan-500 hover:bg-cyan-50"
              onClick={() => {
                if (onRelease) {
                  onRelease(game);
                  setIsDeleteDialogOpen(false);
                }
              }}
            >
              <div className="text-left">
                <div className="font-bold text-black">방출마켓에 판매</div>
                <div className="text-sm text-gray-500 mt-1">목록에서 삭제하고 중고거래 마켓에 등록합니다</div>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 보드위키 모달 */}
      <BoardWikiModal
        game={game}
        open={isWikiModalOpen}
        onOpenChange={setIsWikiModalOpen}
        onNavigateToWiki={onNavigateToWiki}
        accessToken={accessToken}
      />

      {/* 별점 + 리뷰 모달 */}
      <Dialog open={isRatingModalOpen} onOpenChange={(open) => { if (!open) { setIsRatingModalOpen(false); setReviewText(''); } }}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)] max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
            <DialogTitle className="text-center">⭐ 별점 &amp; 리뷰</DialogTitle>
            <DialogDescription className="text-center text-sm">{game.koreanName}</DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 px-5 space-y-5 py-2">
            {/* 별점 큰 표시 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center gap-2 bg-yellow-50 px-6 py-3 rounded-2xl">
                <Star className="w-7 h-7 fill-yellow-400 text-yellow-400" />
                <span className="text-4xl font-bold text-gray-900">{tempRating || 0}</span>
                <span className="text-lg text-gray-400">/10</span>
              </div>
            </div>

            {/* 숫자 버튼 그리드 */}
            <div className="grid grid-cols-5 gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => (
                <button key={r} onClick={() => setTempRating(r)}
                  className={`aspect-square rounded-xl text-base font-bold transition-all ${
                    tempRating === r ? 'bg-yellow-400 text-white shadow-lg scale-110' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {r}
                </button>
              ))}
            </div>

            {/* 0.5 단위 조정 */}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline"
                onClick={() => setTempRating(r => Math.max(0, parseFloat((r - 0.5).toFixed(1))))}
                className="flex-1 h-10" disabled={tempRating <= 0}>-0.5</Button>
              <span className="text-sm font-bold text-gray-700 w-10 text-center">{tempRating}</span>
              <Button size="sm" variant="outline"
                onClick={() => setTempRating(r => Math.min(10, parseFloat((r + 0.5).toFixed(1))))}
                className="flex-1 h-10" disabled={tempRating >= 10}>+0.5</Button>
            </div>

            {/* 리뷰 텍스트 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-gray-700">리뷰 (선택)</Label>
              <textarea
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                placeholder={"이 게임에 대한 리뷰를 남겨보세요.\n보드위키 평가/리뷰에 바로 등록됩니다."}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <p className="text-xs text-gray-400">💡 리뷰는 보드위키 &gt; 평가/리뷰에 즉시 공개됩니다</p>
            </div>
          </div>

          <DialogFooter className="px-5 py-4 flex-shrink-0 border-t border-gray-100 gap-2">
            <Button variant="outline" onClick={() => { setIsRatingModalOpen(false); setReviewText(''); }} className="flex-1">
              취소
            </Button>
            <Button
              onClick={() => handleSubmitReview(tempRating, reviewText)}
              disabled={isSubmittingReview || tempRating === 0}
              className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold"
            >
              {isSubmittingReview ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}