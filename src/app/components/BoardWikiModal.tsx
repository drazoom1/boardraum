import { BoardGame } from '../App';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { 
  Book, 
  ExternalLink, 
  Package, 
  FileText, 
  Image as ImageIcon, 
  Video, 
  MessageSquare,
  Users,
  Award,
  Boxes,
  Archive,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { projectId } from '/utils/supabase/info';
import { getWikiGameId } from '../utils/wikiGameId';

interface BoardWikiModalProps {
  game: BoardGame | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToWiki?: (category: string, game: BoardGame) => void;
  accessToken?: string;
}

interface WikiPost {
  id: string;
  gameId: string;
  category: string;
  title: string;
  postType: string;
  data: any;
  created_by_email: string;
  status: string;
  created_at: string;
}

// 보드위키 실제 카테고리 정의
const WIKI_CATEGORIES = [
  {
    id: 'overview',
    name: '게임 설명',
    icon: FileText,
    description: '게임의 기본 정보와 설명'
  },
  {
    id: 'sleeve',
    name: '슬리브 크기',
    icon: Package,
    description: '필요한 슬리브 종류와 수량'
  },
  {
    id: 'components',
    name: '구성품',
    icon: Boxes,
    description: '게임 구성품 목록 및 설명'
  },
  {
    id: 'video',
    name: '플레이 영상',
    icon: Video,
    description: '게임 플레이 영상 및 리뷰'
  },
  {
    id: 'review',
    name: '평가/리뷰',
    icon: MessageSquare,
    description: '사용자 평가 및 리뷰'
  },
  {
    id: 'player-count',
    name: '인원별 평가',
    icon: Users,
    description: '플레이 인원에 따른 평가'
  }
];

export function BoardWikiModal({ game, open, onOpenChange, onNavigateToWiki, accessToken }: BoardWikiModalProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [categoryPosts, setCategoryPosts] = useState<Record<string, WikiPost[]>>({});
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(new Set());

  if (!game) return null;

  const handleEditCategory = (categoryId: string) => {
    console.log('[BoardWikiModal] handleEditCategory', categoryId, 'onNavigateToWiki:', !!onNavigateToWiki);
    // 모달 닫기
    onOpenChange(false);
    if (onNavigateToWiki) {
      // 닫힌 후 이동 (Dialog 애니메이션 충돌 방지)
      setTimeout(() => {
        onNavigateToWiki(categoryId, game!);
      }, 200);
    }
  };

  const toggleCategory = async (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    
    if (newExpanded.has(categoryId)) {
      // 이미 펼쳐져 있으면 접기
      newExpanded.delete(categoryId);
    } else {
      // 접혀 있으면 펼치기
      newExpanded.add(categoryId);
      
      // 해당 카테고리의 포스트를 아직 불러오지 않았다면 불러오기
      if (!categoryPosts[categoryId] && accessToken) {
        await loadCategoryPosts(categoryId);
      }
    }
    
    setExpandedCategories(newExpanded);
  };

  const loadCategoryPosts = async (categoryId: string) => {
    if (!accessToken) return;
    
    setLoadingCategories(prev => new Set(prev).add(categoryId));
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${getWikiGameId(game)}?category=${categoryId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCategoryPosts(prev => ({
          ...prev,
          [categoryId]: data.posts || []
        }));
      }
    } catch (error) {
      console.error('Failed to load category posts:', error);
    } finally {
      setLoadingCategories(prev => {
        const newSet = new Set(prev);
        newSet.delete(categoryId);
        return newSet;
      });
    }
  };

  const renderPostContent = (post: WikiPost) => {
    const { category, postType, data } = post;

    // 승인된 게시물만 렌더링
    if (post.status !== 'approved') {
      return null;
    }

    // 정보 포스트 렌더링
    if (postType === 'info') {
      if (category === 'overview') {
        return (
          <div className="space-y-4">
            {data.gameName && (
              <div>
                <span className="font-semibold text-gray-700">게임명: </span>
                <span className="text-gray-600">{data.gameName}</span>
              </div>
            )}
            {data.genre && (
              <div>
                <span className="font-semibold text-gray-700">장르: </span>
                <span className="text-gray-600">{data.genre}</span>
              </div>
            )}
            {data.designer && (
              <div>
                <span className="font-semibold text-gray-700">디자이너: </span>
                <span className="text-gray-600">{data.designer}</span>
              </div>
            )}
            {data.publisher && (
              <div>
                <span className="font-semibold text-gray-700">퍼블리셔: </span>
                <span className="text-gray-600">{data.publisher}</span>
              </div>
            )}
            {data.playerCount && (
              <div>
                <span className="font-semibold text-gray-700">인원: </span>
                <span className="text-gray-600">{data.playerCount}</span>
              </div>
            )}
            {data.playTime && (
              <div>
                <span className="font-semibold text-gray-700">플레이 시간: </span>
                <span className="text-gray-600">{data.playTime}</span>
              </div>
            )}
            {data.difficulty && (
              <div>
                <span className="font-semibold text-gray-700">난이도: </span>
                <span className="text-gray-600">{data.difficulty}</span>
              </div>
            )}
            {data.backstory && (
              <div>
                <span className="font-semibold text-gray-700">배경 스토리: </span>
                <p className="text-gray-600 mt-1 whitespace-pre-wrap">{data.backstory}</p>
              </div>
            )}
            {data.objective && (
              <div>
                <span className="font-semibold text-gray-700">게임 목표: </span>
                <p className="text-gray-600 mt-1 whitespace-pre-wrap">{data.objective}</p>
              </div>
            )}
          </div>
        );
      } else if (category === 'sleeve') {
        return (
          <div className="space-y-3">
            {data.cards && data.cards.length > 0 && (
              <div>
                <p className="font-semibold text-gray-700 mb-2">카드 정보:</p>
                {data.cards.map((card: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200 mb-2">
                    <p className="text-sm">
                      <span className="font-medium">{card.name}</span> - {card.width}mm × {card.height}mm ({card.quantity}장)
                    </p>
                  </div>
                ))}
              </div>
            )}
            {data.recommendedProduct && (
              <div>
                <span className="font-semibold text-gray-700">추천 제품: </span>
                <span className="text-gray-600">{data.recommendedProduct}</span>
              </div>
            )}
            {data.purchaseLinks && data.purchaseLinks.length > 0 && (
              <div>
                <p className="font-semibold text-gray-700 mb-2">구매 링크:</p>
                {data.purchaseLinks.map((link: any, idx: number) => (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-600 hover:underline block text-sm"
                  >
                    {link.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      } else if (category === 'components') {
        return (
          <div className="space-y-3">
            {data.components && data.components.length > 0 && (
              <div>
                <p className="font-semibold text-gray-700 mb-2">구성품 목록:</p>
                {data.components.map((comp: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200 mb-2">
                    <p className="font-medium text-gray-900">{comp.name}</p>
                    <p className="text-sm text-gray-600">수량: {comp.quantity}</p>
                    {comp.description && <p className="text-sm text-gray-600 mt-1">{comp.description}</p>}
                  </div>
                ))}
              </div>
            )}
            {data.images && data.images.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {data.images.map((img: string, idx: number) => (
                  <img key={idx} src={img} alt={`구성품 ${idx + 1}`} className="rounded border" />
                ))}
              </div>
            )}
          </div>
        );
      } else if (category === 'video') {
        return (
          <div className="space-y-3">
            {data.title && (
              <div>
                <span className="font-semibold text-gray-700">제목: </span>
                <span className="text-gray-600">{data.title}</span>
              </div>
            )}
            {data.videoUrl && (
              <a
                href={data.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-600 hover:underline flex items-center gap-2"
              >
                <Video className="w-4 h-4" />
                영상 보기
              </a>
            )}
            {data.description && (
              <p className="text-gray-600 whitespace-pre-wrap">{data.description}</p>
            )}
          </div>
        );
      }
    }

    // 리뷰 포스트 렌더링 (postType 'post' 또는 'info' 모두 허용)
    if (category === 'review' && (data?.rating !== undefined || postType === 'post')) {
      // data.content 또는 description 필드 fallback
      const reviewBody = data.content || post.description || '';
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {data.rating !== undefined && (
              <div className="flex items-center gap-1 bg-yellow-50 px-3 py-1.5 rounded-lg">
                <span className="text-yellow-500 text-lg">★</span>
                <span className="font-bold text-gray-900">{data.rating}</span>
                <span className="text-gray-400 text-sm">/10</span>
              </div>
            )}
            {(data.reviewerEmail || post.created_by_email) && (
              <span className="text-xs text-gray-400">
                {(data.reviewerEmail || post.created_by_email || '').split('@')[0]}
              </span>
            )}
          </div>
          {reviewBody ? (
            <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed bg-gray-50 rounded-lg px-3 py-2">{reviewBody}</p>
          ) : (
            <p className="text-gray-400 text-xs italic">리뷰 내용 없음</p>
          )}
        </div>
      );
    }

    // 인원별 평가 렌더링 (postType 구분 없이 처리)
    if (category === 'player-count' && data?.playerCount !== undefined) {
      return (
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
            {data.playerCount}인
          </span>
          <div className="flex items-center gap-1 bg-yellow-50 px-2.5 py-1 rounded-lg">
            <span className="text-yellow-500">★</span>
            <span className="font-bold text-sm">{data.rating}</span>
            <span className="text-gray-400 text-xs">/10</span>
          </div>
          {data.reviewerEmail && (
            <span className="text-xs text-gray-400">{data.reviewerEmail.split('@')[0]}</span>
          )}
        </div>
      );
    }

    // 일반 포스트 렌더링
    return (
      <div className="space-y-2">
        {data.content && (
          <p className="text-gray-600 whitespace-pre-wrap">{data.content}</p>
        )}
        {data.images && data.images.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {data.images.map((img: string, idx: number) => (
              <img key={idx} src={img} alt={`이미지 ${idx + 1}`} className="rounded border" />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-0">
        {/* 접근성용 숨김 타이틀 */}
        <DialogTitle className="sr-only">{game.koreanName} 보드위키</DialogTitle>

        {/* 게임 헤더: 이미지 + 이름/정보 가로 배치 */}
        <div className="flex items-start gap-4 p-5 pr-12 border-b border-gray-100">
          {game.imageUrl ? (
            <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
              <img
                src={game.imageUrl}
                alt={game.koreanName}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center">
              <Book className="w-8 h-8 text-gray-300" />
            </div>
          )}
          <div className="flex-1 overflow-hidden pt-0.5">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-tight break-words">{game.koreanName}</h2>
            {game.englishName && (
              <p className="text-xs text-gray-400 mt-0.5 break-words">{game.englishName}</p>
            )}
            {/* 기본 정보 뱃지 */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {game.recommendedPlayers && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100 whitespace-nowrap">
                  <Users className="w-3 h-3" />{game.recommendedPlayers}
                </span>
              )}
              {game.playTime && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full border border-green-100 whitespace-nowrap">
                  ⏱ {game.playTime}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {/* 카테고리 목록 (아코디언) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">보드위키 카테고리</p>
            
            <div className="space-y-2">
              {WIKI_CATEGORIES.map((category) => {
                const Icon = category.icon;
                const isExpanded = expandedCategories.has(category.id);
                const isLoading = loadingCategories.has(category.id);
                const posts = categoryPosts[category.id] || [];
                
                return (
                  <div
                    key={category.id}
                    className="bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-all duration-200"
                  >
                    {/* 카테고리 헤더 */}
                    <div 
                      className="p-4 cursor-pointer"
                      onClick={() => toggleCategory(category.id)}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
                            <Icon className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 mb-0.5 flex items-center gap-2 flex-wrap">
                              {category.name}
                              {posts.length > 0 && (
                                <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">
                                  {posts.length}개
                                </span>
                              )}
                              {/* 평가/리뷰: 평균 별점 미리 표시 */}
                              {category.id === 'review' && posts.length > 0 && (() => {
                                const rated = posts.filter(p => p.data?.rating !== undefined);
                                if (!rated.length) return null;
                                const avg = rated.reduce((s, p) => s + p.data.rating, 0) / rated.length;
                                return (
                                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold">
                                    ★ {avg.toFixed(1)}
                                  </span>
                                );
                              })()}
                              {/* 인원별 평가: 평가된 인원수 미리 표시 */}
                              {category.id === 'player-count' && posts.length > 0 && (() => {
                                const counts = [...new Set(posts.filter(p=>p.data?.playerCount).map(p=>p.data.playerCount))].sort((a,b)=>a-b);
                                if (!counts.length) return null;
                                return (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                    {counts.join(', ')}인 평가
                                  </span>
                                );
                              })()}
                            </h4>
                            <p className="text-xs text-gray-500">
                              {category.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditCategory(category.id);
                            }}
                            className="hover:bg-gray-50"
                          >
                            <ExternalLink className="w-4 h-4 mr-1.5" />
                            편집
                          </Button>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 카테고리 내용 (펼쳤을 때) */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 p-4 bg-gray-50">
                        {isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                          </div>
                        ) : posts.length > 0 ? (
                          <div className="space-y-4">
                            {/* 평가/리뷰: 평균 별점 집계 표시 */}
                            {category.id === 'review' && (() => {
                              const rated = posts.filter(p => p.data?.rating !== undefined);
                              if (rated.length === 0) return null;
                              const avg = rated.reduce((s, p) => s + p.data.rating, 0) / rated.length;
                              return (
                                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-4 border border-yellow-200 flex items-center gap-4 mb-2">
                                  <div className="text-center">
                                    <div className="text-4xl font-black text-gray-900">{avg.toFixed(1)}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">평균 별점</div>
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex gap-0.5 mb-1">
                                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                        <div key={n} className={`h-2 flex-1 rounded-full ${n <= Math.round(avg) ? 'bg-yellow-400' : 'bg-gray-200'}`} />
                                      ))}
                                    </div>
                                    <p className="text-xs text-gray-500">{rated.length}명 평가</p>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* 인원별 평가: 통계 UI */}
                            {category.id === 'player-count' && (() => {
                              const byCount: Record<number, number[]> = {};
                              posts.forEach(p => {
                                if (p.data?.playerCount && p.data?.rating) {
                                  const n = Number(p.data.playerCount);
                                  if (!byCount[n]) byCount[n] = [];
                                  byCount[n].push(Number(p.data.rating));
                                }
                              });
                              const sorted = Object.entries(byCount)
                                .map(([count, ratings]) => ({
                                  count: Number(count),
                                  ratings,
                                  avg: ratings.reduce((a,b) => a+b, 0) / ratings.length,
                                  total: ratings.length,
                                }))
                                .sort((a, b) => a.count - b.count);

                              if (sorted.length === 0) return (
                                <div className="text-center py-10 text-gray-400">
                                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                  <p className="text-sm">아직 인원별 평가가 없습니다.</p>
                                  <p className="text-xs mt-1">플레이 기록 추가 시 인원별 별점을 남겨보세요!</p>
                                </div>
                              );

                              const bestCount = sorted.reduce((a, b) => a.avg > b.avg ? a : b);
                              const maxAvg = Math.max(...sorted.map(s => s.avg));

                              // 별점 → 색상 (낮음=빨강, 중간=노랑, 높음=초록)
                              const getColor = (avg: number) => {
                                if (avg >= 8) return { bar: '#22c55e', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-500' };
                                if (avg >= 6) return { bar: '#f59e0b', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-500' };
                                return { bar: '#ef4444', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', badge: 'bg-red-500' };
                              };

                              const totalVotes = sorted.reduce((s, r) => s + r.total, 0);

                              return (
                                <div className="space-y-3 mb-2">
                                  {/* 헤더 */}
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-bold text-gray-700">인원별 평균 별점</p>
                                    <span className="text-xs text-gray-400">총 {totalVotes}명 평가</span>
                                  </div>

                                  {/* 카드 그리드 */}
                                  <div className="grid gap-2" style={{gridTemplateColumns: `repeat(${Math.min(sorted.length, 4)}, 1fr)`}}>
                                    {sorted.map(({ count, avg, total }) => {
                                      const c = getColor(avg);
                                      const isBest = count === bestCount.count;
                                      return (
                                        <div key={count} className={`relative rounded-xl border p-3 text-center ${c.bg} ${c.border} ${isBest ? 'ring-2 ring-offset-1 ring-green-400' : ''}`}>
                                          {isBest && (
                                            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                                              <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                                                최고 👑
                                              </span>
                                            </div>
                                          )}
                                          <div className="text-lg font-black text-gray-800 mt-1">{count}인</div>
                                          <div className={`text-2xl font-black mt-1 ${c.text}`}>{avg.toFixed(1)}</div>
                                          <div className="text-xs text-gray-400 mt-0.5">/10</div>
                                          {/* 미니 바 */}
                                          <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-500"
                                              style={{ width: `${(avg / 10) * 100}%`, backgroundColor: c.bar }} />
                                          </div>
                                          <div className="text-xs text-gray-400 mt-1.5">{total}명</div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* 비교 바 차트 */}
                                  {sorted.length > 1 && (
                                    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                                      <p className="text-xs font-semibold text-gray-500">상세 비교</p>
                                      {sorted.map(({ count, avg, total }) => {
                                        const c = getColor(avg);
                                        const barWidth = maxAvg > 0 ? (avg / 10) * 100 : 0;
                                        return (
                                          <div key={count} className="flex items-center gap-3">
                                            <span className="text-sm font-bold text-gray-600 w-8 shrink-0">{count}인</span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden relative">
                                              <div className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                                                style={{ width: `${barWidth}%`, backgroundColor: c.bar }}>
                                              </div>
                                            </div>
                                            <span className="text-sm font-black text-gray-800 w-10 text-right shrink-0">{avg.toFixed(1)}</span>
                                            <span className="text-xs text-gray-400 w-10 shrink-0">({total}명)</span>
                                          </div>
                                        );
                                      })}
                                      <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">
                                        💡 플레이 기록 추가 시 인원별 별점을 남길 수 있습니다
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* 인원별 평가는 개별 카드 목록 숨김 (통계로 충분) */}
                            {category.id !== 'player-count' && posts.map((post) => (
                              <div key={post.id} className="bg-white rounded-lg p-4 border border-gray-200">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <h5 className="font-medium text-gray-900 text-sm">{post.title}</h5>
                                  {post.status === 'pending' && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded shrink-0">승인 대기</span>
                                  )}
                                </div>
                                {renderPostContent(post)}
                                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                                  {new Date(post.created_at).toLocaleDateString('ko-KR')}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <p className="text-sm">아직 등록된 정보가 없습니다.</p>
                            <p className="text-xs mt-1">편집 버튼을 눌러 정보를 추가해보세요!</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 안내 메시지 */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start gap-3">
              <Book className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-900 mb-1">💡 보드위키 사용 방법</p>
                <p className="leading-relaxed">
                  각 카테고리를 클릭하면 등록된 정보를 확인할 수 있습니다. "편집" 버튼을 클릭하면 보드위키 페이지로 이동하여 정보를 추가하거나 수정할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}