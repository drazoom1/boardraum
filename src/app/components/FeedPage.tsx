import { useState, useEffect, useRef, useCallback, memo } from 'react';
import burgundiImg from '../../imports/burgundi.png';
import { Heart, MessageCircle, Share2, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2, MoreVertical, Lock, LockOpen, PenLine, Star, Search, Image as ImageIcon, Gamepad2, Timer, Trophy, Gift, Link, Copy, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';
import { ChessRankBadge } from './ChessRankBadge';
import { getRankByStats } from './chessRank';
import type { BoardGame } from '../App';
import { PostComposer } from './PostComposer';
import { BonusCardWinOverlay } from './BonusCardWinOverlay';
import { SpamWarningModal } from './SpamWarningModal';
import { ReferralLinkModal } from './ReferralLinkModal';
import { updatePostSEO } from '../utils/seo';

const supabase = getSupabaseClient();

const BASE_CATEGORIES = ['전체', '이벤트', '숙제', '자유', '정보', '게임리뷰', '질문'] as const;
type BaseCategory = typeof BASE_CATEGORIES[number];
const SUBCATEGORIES: Record<string, string[]> = {
  '숙제': ['최근 숙제', '지난 숙제'],
  '정보': ['보드게임 소식', '보드게임 정보등록', '재능판매'],
  '질문': ['살래말래', '보드게임 QnA'],
};
// 정보 하위 카테고리 (필터링용)
const INFO_SUB = ['보드게임 소식', '보드게임 정보등록', '재능판매'];
const QUESTION_SUB = ['살래말래', '보드게임 QnA'];
type Category = BaseCategory | '이벤트' | string;

export interface FeedPost {
  userRankPoints?: { points: number; posts: number; comments: number; likesReceived: number };
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  category: string;
  images: string[];
  linkedGame: { id: string; name: string; imageUrl: string } | null;
  linkedGames?: { id: string; name: string; imageUrl: string }[];
  talentData?: { talentPrice: string; talentCategory: string; talentLocation: string } | null;
  poll?: { question: string; options: { text: string; votes: string[] }[] } | null;
  sallae?: { buy: string[]; pass: string[]; think?: string[] } | null;
  createdAt: string;
  likes: string[];
  comments: { id: string; userId: string; userName: string; userAvatar?: string; userRankPoints?: { points: number; posts: number; comments: number; likesReceived: number }; content: string; createdAt: string; isSecret?: boolean; parentId?: string; likes?: string[] }[];
  isDraft?: boolean;
  pinned?: boolean;
  isHomework?: boolean;
  isPrivate?: boolean;
}

interface FeedPageProps {
  accessToken: string;
  userId: string;
  userEmail: string;
  ownedGames?: BoardGame[];
  onViewProfile?: (targetUserId: string, isMe: boolean) => void;
  highlightPostId?: string | null;
  onHighlightClear?: () => void;
  openComposer?: boolean;
  onComposerClose?: () => void;
  isAdmin?: boolean;
  onCommentingChange?: (isCommenting: boolean) => void;
  onGameClick?: (gameId: string, gameName: string, imageUrl?: string) => void;
  wishlistGames?: { id: string; bggId?: string; koreanName?: string; englishName?: string; imageUrl?: string }[];
  onAddToWishlist?: (game: { id: string; name: string; imageUrl: string }) => void;
  onRemoveFromWishlist?: (gameId: string) => void;
  onGuestAction?: () => void;
}

// ─── 시간 포맷 ──��
function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간`;
  return `${Math.floor(diff / 86400)}일`;
}

// ─── 게임 검색 모달 ───
function GamePickerModal({ ownedGames, onSelect, onClose }: {
  ownedGames: BoardGame[];
  onSelect: (game: { id: string; name: string; imageUrl: string }) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = ownedGames.filter(g =>
    !q || (g.koreanName || g.englishName || '').toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-start justify-center">
      <div className="bg-white rounded-3xl w-full max-w-2xl flex flex-col mx-2 mt-4" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900">게임 태그</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
          </div>
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="게임 이름 입력 시 자동 검색..."
            className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            style={{ fontSize: '16px' }}
          />
        </div>
        {ownedGames.length > 0 && (
          <p className="px-5 text-xs text-gray-400 pb-1 flex-shrink-0">내 보유게임</p>
        )}
        <div className="overflow-y-auto flex-1 px-4 pb-4">
          {filtered.map(g => (
            <button key={g.id} onClick={() => onSelect({ id: g.id, name: g.koreanName || g.englishName, imageUrl: g.imageUrl || '' })}
              className="w-full flex items-center gap-3 py-3 border-b border-gray-50 hover:bg-gray-50 rounded-xl px-2 text-left transition-colors">
              {g.imageUrl
                ? <img src={g.imageUrl} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                : <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center">🎲</div>
              }
              <div>
                <p className="font-semibold text-gray-900 text-sm">{g.koreanName || g.englishName}</p>
                {g.koreanName && g.englishName && <p className="text-xs text-gray-400">{g.englishName}</p>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center py-8 text-sm text-gray-400">검색 결과가 없어요</p>}
        </div>
        <div className="px-4 pb-4 flex-shrink-0">
          <button disabled className="w-full h-12 rounded-2xl bg-gray-100 text-gray-400 text-sm font-medium">게임을 선택해주세요</button>
        </div>
      </div>
    </div>
  );
}

// ─── 댓글 아이템 (최상위 선언 필수 - 내부 선언 시 리렌더링마다 재생성되어 먹통 발생) ───
function CommentItem({ comment, depth, visibleComments, userId, postId, accessToken, onReply, onDelete, onLike, onViewProfile, onEdit, isAdmin, wishlistGames = [], onAddToWishlist, onRemoveFromWishlist, onGameClick }: {
  comment: any; depth: number; visibleComments: any[];
  userId: string; postId: string; accessToken: string;
  onReply: (id: string, name: string, parentIsSecret?: boolean) => void;
  onDelete: (id: string) => void;
  onLike: (commentId: string) => void;
  onViewProfile?: (userId: string, isMe: boolean) => void;
  onEdit?: (commentId: string, newContent: string, newImages?: string[], newLinkedGames?: any[]) => void;
  isAdmin?: boolean;
  wishlistGames?: { id: string; bggId?: string }[];
  onAddToWishlist?: (game: { id: string; name: string; imageUrl: string }) => void;
  onRemoveFromWishlist?: (gameId: string) => void;
  onGameClick?: (gameId: string, gameName: string, imageUrl?: string) => void;
}) {
  const replies = visibleComments.filter(c => c.parentId === comment.id);
  const isLiked = (comment.likes || []).includes(userId);
  const likeCount = (comment.likes || []).length;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [editImages, setEditImages] = useState<string[]>(comment.images || []);
  const [editGames, setEditGames] = useState<{ id: string; name: string; imageUrl: string }[]>(comment.linkedGames?.length > 0 ? comment.linkedGames : (comment.linkedGame ? [comment.linkedGame] : []));
  const [editUploadingImg, setEditUploadingImg] = useState(false);
  const [editShowGamePicker, setEditShowGamePicker] = useState(false);
  const [editGameQ, setEditGameQ] = useState('');
  const [editGameResults, setEditGameResults] = useState<any[]>([]);
  const [editGameLoading, setEditGameLoading] = useState(false);
  const [editGameDone, setEditGameDone] = useState(false);

  return (
    <div>
      <div className={`flex gap-2 items-start ${depth > 0 ? 'text-xs' : 'text-sm'}`}>
        <button className={`${depth === 0 ? 'w-7 h-7' : 'w-6 h-6'} rounded-full bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-gray-500 mt-0.5`}
          onClick={() => comment.userId && onViewProfile?.(comment.userId, comment.userId === userId)}>
          {comment.userAvatar
            ? <img src={comment.userAvatar} className="w-full h-full object-cover" />
            : comment.userName?.[0]?.toUpperCase()}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap mb-0.5">
            <button className="font-semibold text-gray-900 text-xs hover:underline"
              onClick={() => comment.userId && onViewProfile?.(comment.userId, comment.userId === userId)}>
              {comment.userName}
            </button>
            {comment.userRankPoints && (() => {
              const r = getRankByStats(comment.userRankPoints.points, comment.userRankPoints.posts, comment.userRankPoints.comments, comment.userRankPoints.likesReceived);
              return <ChessRankBadge rank={r} />;
            })()}
            {comment.isSecret && <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" />}
            {comment.createdAt && (
              <span className="text-[10px] text-gray-400">{timeAgo(comment.createdAt)}</span>
            )}
          </div>
          {editing ? (
            <div className="mt-1">
              <textarea value={editText} onChange={e => setEditText(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:border-gray-400 bg-gray-50"
                rows={2} autoFocus />
              {/* 수정 중 이미지 미리보기 */}
              {editImages.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  {editImages.map((url, i) => (
                    <div key={i} className="relative w-12 h-12">
                      <img src={url} className="w-full h-full object-cover rounded-lg" />
                      <button onClick={() => setEditImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-gray-900 text-white rounded-full flex items-center justify-center">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* 수정 중 게임태그 */}
              {editGames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {editGames.map((g, i) => (
                    <div key={g.id} className="flex items-center gap-1 px-2 py-1 bg-cyan-50 rounded-lg text-xs text-cyan-700">
                      {g.imageUrl ? <><img src={g.imageUrl} className="w-4 h-4 rounded object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} /></> : <Gamepad2 className="w-3.5 h-3.5 flex-shrink-0" />}
                      <span className="font-medium truncate max-w-[80px]">{g.name}</span>
                      <button onClick={() => setEditGames(prev => prev.filter((_, j) => j !== i))} className="text-cyan-400 hover:text-cyan-700 ml-0.5"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              {/* 수정 아이콘 툴바 */}
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center gap-1">
                  {/* 이미지 */}
                  <label className={`p-1 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors ${editUploadingImg ? 'text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
                    {editUploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                    <input type="file" accept="image/*" multiple className="hidden" disabled={editUploadingImg}
                      onChange={async e => {
                        if (!e.target.files) return;
                        setEditUploadingImg(true);
                        for (const file of Array.from(e.target.files)) {
                          try {
                            const fd = new FormData(); fd.append('file', file);
                            const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
                              { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd });
                            if (res.ok) { const d = await res.json(); setEditImages(prev => [...prev, d.imageUrl]); }
                          } catch {}
                        }
                        setEditUploadingImg(false);
                        e.target.value = '';
                      }} />
                  </label>
                  {/* 게임태그 */}
                  <button onClick={() => setEditShowGamePicker(true)}
                    className={`p-1 rounded-lg hover:bg-gray-100 transition-colors ${editGames.length > 0 ? 'text-cyan-500' : 'text-gray-400 hover:text-gray-600'}`}>
                    <Gamepad2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { onEdit?.(comment.id, editText, editImages, editGames); setEditing(false); }}
                    disabled={!editText.trim() && editImages.length === 0}
                    className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-40">
                    저장
                  </button>
                  <button onClick={() => { setEditing(false); setEditText(comment.content); setEditImages(comment.images || []); setEditGames(comment.linkedGames?.length > 0 ? comment.linkedGames : (comment.linkedGame ? [comment.linkedGame] : [])); }}
                    className="px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs">
                    취소
                  </button>
                </div>
              </div>
              {/* 수정 게임 검색 모달 */}
              {editShowGamePicker && (
                <div className="fixed inset-0 bg-black/50 z-[9999] flex items-end sm:items-center justify-center"
                  onClick={() => setEditShowGamePicker(false)}>
                  <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl max-h-[70vh] flex flex-col"
                    onClick={e => e.stopPropagation()}>
                    <div className="px-4 pt-4 pb-3 flex-shrink-0">
                      <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-gray-900 text-sm">게임 태그</h3>
                        <button onClick={() => setEditShowGamePicker(false)} className="text-gray-400"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="flex gap-2">
                        <input value={editGameQ} onChange={e => { setEditGameQ(e.target.value); if (!e.target.value) { setEditGameDone(false); setEditGameResults([]); } }}
                          onKeyDown={async e => {
                            if (e.key === 'Enter' && editGameQ.trim()) {
                              setEditGameLoading(true); setEditGameDone(true);
                              try {
                                const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`,
                                  { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` }, body: JSON.stringify({ query: editGameQ }) });
                                if (res.ok) setEditGameResults(await res.json());
                              } catch {} finally { setEditGameLoading(false); }
                            }
                          }}
                          placeholder="게임 이름 검색..."
                          className="flex-1 h-8 px-3 rounded-xl border border-gray-200 bg-gray-50 text-base focus:outline-none" style={{fontSize: "16px"}} />
                        <button onClick={async () => {
                            if (!editGameQ.trim()) return;
                            setEditGameLoading(true); setEditGameDone(true);
                            try {
                              const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`,
                                { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` }, body: JSON.stringify({ query: editGameQ }) });
                              if (res.ok) setEditGameResults(await res.json());
                            } catch {} finally { setEditGameLoading(false); }
                          }}
                          className="h-8 px-3 rounded-xl bg-gray-900 text-white text-xs font-medium">
                          {editGameLoading ? '...' : '검색'}
                        </button>
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1 px-3 pb-4">
                      {!editGameDone ? <p className="text-center py-6 text-xs text-gray-400">게임 이름을 검색해보세요</p>
                      : editGameLoading ? <p className="text-center py-6 text-xs text-gray-400">검색 중...</p>
                      : editGameResults.length === 0 ? (
                        <div className="py-4">
                          <p className="text-center text-xs text-gray-400 mb-3">검색 결과가 없어요</p>
                          <button onClick={() => { setEditGames(prev => [...prev, { id: `custom_${Date.now()}`, name: editGameQ, imageUrl: '' }]); setEditShowGamePicker(false); }}
                            className="w-full flex items-center gap-2 py-2 border border-dashed border-gray-300 rounded-xl px-3 text-left">
                            <Gamepad2 className="w-4 h-4 text-gray-400" />
                            <p className="text-xs font-semibold text-gray-800">"{editGameQ}" 직접 등록</p>
                          </button>
                        </div>
                      ) : editGameResults.map(g => {
                        const thumb = (g.thumbnail || g.imageUrl || '').startsWith('//') ? 'https:' + (g.thumbnail || g.imageUrl) : (g.thumbnail || g.imageUrl || '');
                        return (
                          <button key={g.id} onClick={() => { const eg = { id: String(g.id), name: g.koreanName || g.name, imageUrl: thumb }; setEditGames(prev => prev.find(x => x.id === eg.id) ? prev : [...prev, eg]); setEditShowGamePicker(false); }}
                            className="w-full flex items-center gap-2.5 py-2.5 border-b border-gray-50 hover:bg-gray-50 rounded-xl px-2 text-left">
                            {thumb ? <img src={thumb} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                              : <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center"><Gamepad2 className="w-4 h-4 text-gray-400" /></div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">{g.koreanName || g.name}</p>
                              {g.yearPublished && <p className="text-[10px] text-gray-400">{g.yearPublished}년</p>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <span className={`break-words ${comment._hidden ? 'text-gray-400 italic text-xs' : 'text-gray-700'}`}>
              {comment.replyToName && !comment._hidden && (
                <span className="text-cyan-500 font-semibold mr-1">@{comment.replyToName}</span>
              )}
              <span className="whitespace-pre-wrap">{comment.content}</span>
              {comment.editedAt && <span className="text-[10px] text-gray-300 ml-1">(수정됨)</span>}
            </span>
          )}
          {/* 댓글 이미지 */}
          {!comment._hidden && comment.images?.length > 0 && (
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {comment.images.map((url: string, i: number) => (
                <img key={i} src={url} className="w-20 h-20 object-cover rounded-lg cursor-pointer"
                  onClick={() => {
                    const el = document.createElement('div');
                    el.style.cssText = 'position:fixed;inset:0;background:black;z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
                    el.onclick = () => document.body.removeChild(el);
                    const img = document.createElement('img');
                    img.src = url;
                    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
                    el.appendChild(img);
                    document.body.appendChild(el);
                  }} />
              ))}
            </div>
          )}
          {/* 댓글 게임태그 - 여러개 지원 */}
          {!comment._hidden && (() => {
            const cGames = comment.linkedGames?.length > 0 ? comment.linkedGames : (comment.linkedGame ? [comment.linkedGame] : []);
            if (cGames.length === 0) return null;
            if (cGames.length === 1) {
              const g = cGames[0];
              const isW = (wishlistGames ?? []).some((w: any) => w.id === g.id || (g.id && w.bggId === g.id));
              return (
                <div className="flex items-center gap-1.5 mt-1.5 bg-gray-50 rounded-xl text-xs text-gray-700 w-fit max-w-full pr-2" style={{ paddingTop: '6px', paddingBottom: '6px', paddingLeft: '10px' }}>
                  <div className="flex items-center gap-1.5 cursor-pointer"
                    onClick={() => g.id && onGameClick?.(g.id, g.name, g.imageUrl)}>
                    {g.imageUrl ? <img src={g.imageUrl} className="w-5 h-5 rounded-md object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} /> : <Gamepad2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                    <span className="font-medium truncate">{g.name}</span>
                  </div>
                  <button onClick={() => isW ? onRemoveFromWishlist?.(g.id) : onAddToWishlist?.({ id: g.id, name: g.name, imageUrl: g.imageUrl || '' })}
                    className={`ml-1 p-0.5 rounded transition-colors flex-shrink-0 ${isW ? 'text-red-400' : 'text-gray-300 hover:text-red-400'}`}>
                    <Heart className={`w-3.5 h-3.5 ${isW ? 'fill-current' : ''}`} />
                  </button>
                </div>
              );
            }
            return (
              <div className="flex gap-3 mt-2 flex-wrap">
                {cGames.map((g: any) => {
                  const isW = (wishlistGames ?? []).some((w: any) => w.id === g.id || (g.id && w.bggId === g.id));
                  return (
                    <div key={g.id} className="relative" style={{ marginRight: '6px', marginBottom: '6px' }}>
                      <div className="cursor-pointer" onClick={() => g.id && onGameClick?.(g.id, g.name, g.imageUrl)}>
                        {g.imageUrl
                          ? <img src={g.imageUrl} className="w-12 h-12 rounded-xl object-cover" onError={e => { const t = e.target as HTMLImageElement; t.style.display='none'; t.nextElementSibling?.removeAttribute('hidden'); }} />
                          : <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><Gamepad2 className="w-5 h-5 text-gray-400" /></div>}
                      </div>
                      {/* 하트: 우측 하단 삐져나오게 */}
                      <button
                        onClick={() => isW ? onRemoveFromWishlist?.(g.id) : onAddToWishlist?.({ id: g.id, name: g.name, imageUrl: g.imageUrl || '' })}
                        className={`absolute flex items-center justify-center rounded-full shadow-md border-2 border-white transition-colors ${isW ? 'bg-red-500 text-white' : 'bg-white text-gray-400 hover:text-red-500'}`}
                        style={{ width: '18px', height: '18px', bottom: '-5px', right: '-5px' }}>
                        <Heart className={`w-2.5 h-2.5 ${isW ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {/* 액션 버튼: 답글 + 하트 */}
          {!comment._hidden && (
          <div className="flex items-center gap-3 mt-1.5">
            <button onClick={() => onReply(comment.id, comment.userName, comment.isSecret)}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium">
              답글
            </button>
            <button onClick={() => onLike(comment.id)}
              className={`flex items-center gap-0.5 text-xs transition-colors ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}>
              <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
              {likeCount > 0 && <span>{likeCount}</span>}
            </button>
            {(comment.userId === userId || isAdmin) && (
              <>
                {comment.userId === userId && (
                  <button onClick={() => setEditing(true)}
                    className="text-xs text-gray-300 hover:text-gray-600 transition-colors">
                    수정
                  </button>
                )}
                <button onClick={() => onDelete(comment.id)}
                  className="text-xs text-gray-300 hover:text-red-400 transition-colors">
                  삭제{isAdmin && comment.userId !== userId ? ' (관리자)' : ''}
                </button>
              </>
            )}
          </div>
          )}
        </div>
      </div>
      {/* 대댓글 - depth 0일 때만 렌더링 (최대 1단계 들여쓰기) */}
      {depth === 0 && replies.length > 0 && (
        <div className="mt-2 space-y-2 ml-9 pl-3 border-l-2 border-gray-100">
          {replies.map((reply, i) => (
            <CommentItem key={reply.id || `reply-${i}`} comment={reply} depth={1}
              visibleComments={visibleComments} userId={userId} postId={postId}
              accessToken={accessToken} onReply={onReply} onDelete={onDelete} onLike={onLike}
              onViewProfile={onViewProfile} onEdit={onEdit} isAdmin={isAdmin} wishlistGames={wishlistGames ?? []} onAddToWishlist={onAddToWishlist} onRemoveFromWishlist={onRemoveFromWishlist} onGameClick={onGameClick} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 댓글 섹션 ───
const CommentSection = memo(function CommentSection({ post, accessToken, userId, userName, avatarUrl, userRankPoints, onUpdate, inputRef, onViewProfile, isAdmin, wishlistGames = [], onAddToWishlist, onRemoveFromWishlist, onGameClick }: {
  post: FeedPost; accessToken: string; userId: string; userName: string;
  avatarUrl?: string; userRankPoints?: { points: number; posts: number; comments: number; likesReceived: number };
  onUpdate: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  onViewProfile?: (userId: string, isMe: boolean) => void;
  isAdmin?: boolean;
  wishlistGames?: { id: string; bggId?: string }[];
  onAddToWishlist?: (game: { id: string; name: string; imageUrl: string }) => void;
  onRemoveFromWishlist?: (gameId: string) => void;
  onGameClick?: (gameId: string, gameName: string, imageUrl?: string) => void;
}) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [showAll, setShowAll] = useState(false);
  const [isSecret, setIsSecret] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [commentGames, setCommentGames] = useState<{ id: string; name: string; imageUrl: string }[]>([]);
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [gameSearchQ, setGameSearchQ] = useState('');
  const [gameSearchResults, setGameSearchResults] = useState<any[]>([]);
  const [gameSearchLoading, setGameSearchLoading] = useState(false);
  const [gameSearchDone, setGameSearchDone] = useState(false);
  const imgFileRef = useRef<HTMLInputElement>(null);
  // 로컬 comments 상태 - post prop 변경에 독립적으로 관리
  const [localComments, setLocalComments] = useState<any[]>(post.comments || []);
  const [showCommentCardWon, setShowCommentCardWon] = useState(false);
  const [showSpamWarning, setShowSpamWarning] = useState(false);
  const internalRef = useRef<HTMLInputElement>(null);
  const resolvedRef = inputRef || internalRef;

  // 다른 기기 실시간 댓글 반영 - 새 댓글만 추가, 기존 localComments 보존
  const prevCommentsRef = useRef<any[]>(post.comments || []);
  useEffect(() => {
    const prev = prevCommentsRef.current;
    const curr = post.comments || [];
    const prevIds = new Set(prev.map((c: any) => c.id));
    const currIds = new Set(curr.map((c: any) => c.id));
    // 새로 생긴 댓글 추가
    const newComments = curr.filter((c: any) => !prevIds.has(c.id) && !c.id?.startsWith('temp-'));
    if (newComments.length > 0) {
      setLocalComments(lc => {
        const lcIds = new Set(lc.map((c: any) => c.id));
        const toAdd = newComments.filter((c: any) => !lcIds.has(c.id));
        return toAdd.length > 0 ? [...lc, ...toAdd] : lc;
      });
    }
    // 서버에서 삭제된 댓글 제거 (temp- 제외)
    setLocalComments(lc => lc.filter((c: any) => c.id?.startsWith('temp-') || currIds.has(c.id)));
    prevCommentsRef.current = curr;
  }, [post.comments]);



  // 비밀댓글: 볼 수 있는 사람 결정 로직
  // - 최상위 비밀댓글(parentId 없음): 댓글 작성자 + 게시물 작성자
  // - 대댓글 비밀댓글(parentId 있음): 댓글 작성자 + 부모댓글 작성자(태그된 사람)만
  //   ※ 글 작성자라도 태그된 사람이 아니면 볼 수 없음
  const visibleComments = localComments.map((c: any) => {
    if (!c.isSecret) return c;
    // 관리자는 항상 보임
    if (isAdmin) return c;
    // 내가 쓴 댓글이면 항상 보임
    if (c.userId === userId) return c;

    if (!c.parentId) {
      // 최상위 비밀댓글: 게시물 작성자만 볼 수 있음
      if (post.userId === userId) return c;
    } else {
      // 대댓글 비밀댓글: 부모 댓글 작성자(태그된 사람)만 볼 수 있음
      // 게시물 작성자여도, 태그된 당사자가 아니면 볼 수 없음
      const parent = localComments.find((p: any) => p.id === c.parentId);
      if (parent && parent.userId === userId) return c;
    }

    return { ...c, content: '🔒 비밀댓글입니다.', _hidden: true };
  });
  const topLevelComments = visibleComments.filter((c: any) => !c.parentId);

  // 평탄화: 대댓글의 대댓글도 최상위 댓글 그룹에 붙임 (최대 1단계 들여쓰기)
  // 각 최상위 댓글에 자신 + 모든 하위 댓글을 포함시킴
  const flattenReplies = (commentId: string, all: any[]): any[] => {
    const direct = all.filter(c => c.parentId === commentId);
    return direct.flatMap(r => [r, ...flattenReplies(r.id, all)]);
  };

  // 대댓글의 대댓글은 parentId를 최상위로 올리고 replyToName 표시
  const flatComments = visibleComments.map(c => {
    if (!c.parentId) return c; // 최상위 댓글 그대로
    const parent = visibleComments.find(p => p.id === c.parentId);
    if (!parent) return c;
    if (!parent.parentId) return c; // 직접 대댓글 그대로
    // 대댓글의 대댓글: 최상위 부모를 찾아서 parentId를 그것으로 변경
    const findRoot = (id: string): string => {
      const p = visibleComments.find(x => x.id === id);
      if (!p || !p.parentId) return id;
      return findRoot(p.parentId);
    };
    return { ...c, parentId: findRoot(c.parentId), replyToName: parent.userName };
  });
  const flatTopLevel = flatComments.filter((c: any) => !c.parentId);
  const displayed = showAll ? flatTopLevel : flatTopLevel.slice(-3);

  const uploadCommentImage = async (file: File) => {
    setUploadingImg(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업로드 실패');
      setCommentImages(prev => [...prev, data.imageUrl]);
    } catch (e: any) { toast.error(e.message || '이미지 업로드 실패'); }
    finally { setUploadingImg(false); }
  };

  const submit = async () => {
    if (!text.trim() && commentImages.length === 0) return;
    if (submittingRef.current) return;
    if (text.length > 500) { toast.error('댓글은 500자 이내로 입력해주세요'); return; }

    // 3초 이내 연속 작성 도배 감지
    const SPAM_KEY = 'boardraum_last_action_time';
    const now = Date.now();
    const lastTime = parseInt(localStorage.getItem(SPAM_KEY) || '0', 10);
    if (lastTime && now - lastTime < 3000) {
      setShowSpamWarning(true);
      fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/spam-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ actionType: replyTo ? '대댓글' : '댓글', content: text.trim() }),
      }).catch(() => {});
    }
    localStorage.setItem(SPAM_KEY, String(now));

    submittingRef.current = true;
    setSubmitting(true);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempComment = {
      id: tempId, userId, userName, userAvatar: avatarUrl,
      content: text.trim(), createdAt: new Date().toISOString(),
      userRankPoints, isSecret, parentId: replyTo?.id || null, likes: [], images: [...commentImages],
      linkedGame: commentGames[0] || null,
      linkedGames: [...commentGames],
    };
    const sentText = text.trim();
    const sentSecret = isSecret;
    const sentParentId = replyTo?.id || null;
    const sentImages = [...commentImages];
    const sentGames = [...commentGames];
    setText('');
    if (resolvedRef.current) (resolvedRef.current as any).style.height = '24px';
    setReplyTo(null);
    setIsSecret(false);
    setCommentImages([]);
    setCommentGames([]);
    // 로컬 댓글 목록에 즉시 추가
    setLocalComments(prev => [...prev, tempComment]);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ content: sentText, userName, isSecret: sentSecret, parentId: sentParentId, images: sentImages, linkedGame: sentGames[0] || null, linkedGames: sentGames }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '댓글 등록 실패');
      const realComment = data.comment || tempComment;
      setLocalComments(prev => prev.map(c => c.id === tempId ? realComment : c));
      toast.success('댓글을 등록했어요 (+3pt)');
      // 1% 확률 보너스카드 체크
      try {
        const cardRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bonus-cards/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ type: 'comment' }),
        });
        const cardData = await cardRes.json().catch(() => ({}));
        if (cardData.granted) setShowCommentCardWon(true);
      } catch { /* 카드 실패해도 무시 */ }
    } catch (e: any) {
      toast.error(e.message || '댓글 등록 실패');
      setLocalComments(prev => prev.filter(c => c.id !== tempId));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const editComment = async (commentId: string, newContent: string, newImages?: string[], newLinkedGames?: any[]) => {
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/comments/${commentId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ content: newContent, images: newImages, linkedGame: newLinkedGames?.[0] || null, linkedGames: newLinkedGames ?? [] }) }
      );
      setLocalComments(prev => prev.map(c => c.id === commentId
        ? { ...c, content: newContent, images: newImages ?? c.images, linkedGame: newLinkedGames?.[0] || null, linkedGames: newLinkedGames ?? [], editedAt: new Date().toISOString() }
        : c));
    } catch { toast.error('수정 실패'); }
  };

  const deleteComment = async (commentId: string) => {
    const backup = localComments;
    setLocalComments(prev => prev.filter(c => c.id !== commentId));
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/comments/${commentId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `삭제 실패 (${res.status})`);
      toast.success('댓글이 삭제됐어요 (-3pt)');
    } catch (e: any) {
      toast.error(e.message || '댓글 삭제 실패');
      setLocalComments(backup);
    }
  };

  const likeComment = async (commentId: string) => {
    setLocalComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      const likes = c.likes || [];
      return { ...c, likes: likes.includes(userId) ? likes.filter((id: string) => id !== userId) : [...likes, userId] };
    }));
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/comments/${commentId}/like`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
      );
    } catch {
      // 실패해도 롤백 안 함 - 폴링에서 자연스럽게 동기화됨
    }
  };

  const handleReply = (id: string, name: string, parentIsSecret?: boolean) => {
    setReplyTo({ id, name });
    if (parentIsSecret) setIsSecret(true);
    resolvedRef.current?.focus();
  };

  return (
    <>
    {showCommentCardWon && <BonusCardWinOverlay onClose={() => setShowCommentCardWon(false)} />}
    {showSpamWarning && <SpamWarningModal onClose={() => setShowSpamWarning(false)} />}
    <div className="mt-3 pt-3 border-t border-gray-50 space-y-3">
      {!showAll && topLevelComments.length > 3 && (
        <button onClick={() => setShowAll(true)} className="text-xs text-gray-400 hover:text-gray-600">
          댓글 {topLevelComments.length}개 모두 보기
        </button>
      )}
      {displayed.map((c, i) => (
        <CommentItem key={c.id || `comment-${i}`} comment={c} depth={0}
          visibleComments={flatComments} userId={userId} postId={post.id}
          accessToken={accessToken} onReply={handleReply}
          onDelete={deleteComment} onLike={likeComment}
          onViewProfile={onViewProfile} onEdit={editComment} isAdmin={isAdmin} wishlistGames={wishlistGames ?? []} onAddToWishlist={onAddToWishlist} onRemoveFromWishlist={onRemoveFromWishlist} onGameClick={onGameClick} />
      ))}
      {/* 댓글 입력창 */}
      {!userId ? (
        <button
          onClick={() => (document as any).__boardraumGuestAction?.()}
          className="w-full text-left px-3 py-2.5 rounded-xl bg-gray-50 text-sm text-gray-400 border border-gray-100 hover:bg-gray-100 transition-colors">
          댓글을 달려면 <span className="text-gray-600 font-medium">로그인</span>이 필요해요
        </button>
      ) : (
      <div className="flex items-center gap-2 pt-1">
        <div className="w-7 h-7 rounded-full bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-gray-500">
          {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" /> : userName?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 bg-white rounded-2xl px-3 py-2 border border-gray-200 focus-within:border-gray-400 transition-colors">
          {/* 답글 대상 표시 */}
          {replyTo && (
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
              <span>@{replyTo.name}에게 답글</span>
              <button onClick={() => setReplyTo(null)} className="text-gray-300 hover:text-gray-500">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {/* 이미지 미리보기 */}
          {commentImages.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-2">
              {commentImages.map((url, i) => (
                <div key={i} className="relative w-14 h-14">
                  <img src={url} className="w-full h-full object-cover rounded-lg cursor-pointer"
                    onClick={() => setLightboxImg(url)} />
                  <button onClick={() => setCommentImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-gray-900 text-white rounded-full flex items-center justify-center">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* 선택된 게임태그 */}
          {commentGames.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {commentGames.map((g, i) => (
                <div key={g.id} className="flex items-center gap-1 px-2 py-0.5 bg-cyan-50 rounded-full text-xs text-cyan-700">
                  {g.imageUrl && <img src={g.imageUrl} className="w-3.5 h-3.5 rounded object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />}
                  <span className="font-medium truncate max-w-[70px]">{g.name}</span>
                  <button onClick={() => setCommentGames(prev => prev.filter((_, j) => j !== i))} className="text-cyan-300 hover:text-cyan-600"><X className="w-2.5 h-2.5" /></button>
                </div>
              ))}
            </div>
          )}
          {/* 텍스트 입력 */}
          <textarea ref={resolvedRef as any} value={text} onChange={e => {
              if (e.target.value.length > 500) return; // 500자 초과 입력 차단
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            maxLength={500}
            placeholder={replyTo ? `@${replyTo.name}에게 답글...` : '댓글 달기...'}
            rows={1}
            className="w-full bg-transparent outline-none text-gray-900 placeholder-gray-400 resize-none overflow-hidden leading-5"
            style={{ fontSize: '16px', minHeight: '24px', caretColor: '#111827' }}
          />
          {/* 하단 버튼 바 */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-0.5">
              <button onClick={() => imgFileRef.current?.click()} disabled={uploadingImg}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-200 transition-colors">
                {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              </button>
              <input ref={imgFileRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => { if (e.target.files) Array.from(e.target.files).forEach(uploadCommentImage); e.target.value = ''; }} />
              <button onClick={() => setShowGamePicker(true)}
                className={`p-1 rounded-lg hover:bg-gray-200 transition-colors ${commentGames.length > 0 ? 'text-cyan-500' : 'text-gray-400 hover:text-gray-600'}`}>
                <Gamepad2 className="w-4 h-4" />
              </button>
              <button onClick={() => setIsSecret(s => !s)}
                className={`p-1 rounded-lg hover:bg-gray-200 transition-colors ${isSecret ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}>
                {isSecret ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${text.length > 450 ? 'text-red-400' : 'text-gray-400'}`}>{text.length}/500</span>
              <button onClick={submit} disabled={submitting || (!text.trim() && commentImages.length === 0)}
                className="text-xs font-semibold bg-gray-900 text-white px-3 py-1 rounded-full disabled:opacity-30 hover:bg-gray-700 transition-colors">
                {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : '게시'}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* 게임 검색 모달 */}
      {showGamePicker && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-end sm:items-center justify-center"
          onClick={() => setShowGamePicker(false)}>
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-4 pb-3 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900 text-sm">게임 태그</h3>
                <button onClick={() => setShowGamePicker(false)} className="text-gray-400"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2">
                <input value={gameSearchQ} onChange={e => { setGameSearchQ(e.target.value); if (!e.target.value) { setGameSearchDone(false); setGameSearchResults([]); } }}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && gameSearchQ.trim()) {
                      setGameSearchLoading(true); setGameSearchDone(true);
                      try {
                        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`,
                          { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
                            body: JSON.stringify({ query: gameSearchQ }) });
                        if (res.ok) setGameSearchResults(await res.json());
                      } catch {} finally { setGameSearchLoading(false); }
                    }
                  }}
                  placeholder="게임 이름 검색..."
                  className="flex-1 h-8 px-3 rounded-xl border border-gray-200 bg-gray-50 text-base focus:outline-none" style={{fontSize: "16px"}} />
                <button onClick={async () => {
                    if (!gameSearchQ.trim()) return;
                    setGameSearchLoading(true); setGameSearchDone(true);
                    try {
                      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`,
                        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
                          body: JSON.stringify({ query: gameSearchQ }) });
                      if (res.ok) setGameSearchResults(await res.json());
                    } catch {} finally { setGameSearchLoading(false); }
                  }}
                  className="h-8 px-3 rounded-xl bg-gray-900 text-white text-xs font-medium">
                  {gameSearchLoading ? '...' : '검색'}
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-3 pb-4">
              {!gameSearchDone ? (
                <p className="text-center py-6 text-xs text-gray-400">게임 이름을 검색해보세요</p>
              ) : gameSearchLoading ? (
                <p className="text-center py-6 text-xs text-gray-400">검색 중...</p>
              ) : gameSearchResults.length === 0 ? (
                <div className="py-4">
                  <p className="text-center text-xs text-gray-400 mb-3">검색 결과가 없어요</p>
                  <button onClick={() => { setCommentGames(prev => [...prev, { id: `custom_${Date.now()}`, name: gameSearchQ, imageUrl: '' }]); setShowGamePicker(false); }}
                    className="w-full flex items-center gap-2 py-2.5 border border-dashed border-gray-300 hover:border-gray-400 rounded-xl px-3 text-left">
                    <span className="text-lg">🎲</span>
                    <div><p className="text-xs font-semibold text-gray-800">"{gameSearchQ}" 직접 등록</p></div>
                  </button>
                </div>
              ) : (
                <>
                  {gameSearchResults.map(g => {
                    const thumb = (g.thumbnail || g.imageUrl || '').startsWith('//') ? 'https:' + (g.thumbnail || g.imageUrl) : (g.thumbnail || g.imageUrl || '');
                    return (
                      <button key={g.id} onClick={() => { const newG = { id: String(g.id), name: g.koreanName || g.name, imageUrl: thumb }; setCommentGames(prev => prev.find(x => x.id === newG.id) ? prev : [...prev, newG]); setShowGamePicker(false); }}
                        className="w-full flex items-center gap-2.5 py-2.5 border-b border-gray-50 hover:bg-gray-50 rounded-xl px-2 text-left">
                        {thumb ? <img src={thumb} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                          : <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-base">🎲</div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{g.koreanName || g.name}</p>
                          {g.yearPublished && <p className="text-[10px] text-gray-400">{g.yearPublished}년</p>}
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 댓글 이미지 라이트박스 */}
      {lightboxImg && (
        <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center"
          onClick={() => setLightboxImg(null)}>
          <button className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center text-white bg-white/20 rounded-full z-10"
            onClick={() => setLightboxImg(null)}>
            <X className="w-5 h-5" />
          </button>
          <img src={lightboxImg} className="max-w-full max-h-full object-contain"
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
    </>
  );
});

// ─── 피드 카드 ───

// 공지글 본문 - 5줄 초과 시 접기/펼치기 (expanded 외부 제어)
function PinnedContent({ content, linkifyText, expanded, onToggle, needsCollapse }: {
  content: string; linkifyText: (t: string) => any;
  expanded: boolean; onToggle: () => void; needsCollapse: boolean;
}) {
  return (
    <div className="mb-3 px-4 sm:px-8">
      <p className={`text-sm text-gray-800 leading-relaxed whitespace-pre-wrap ${!expanded && needsCollapse ? 'line-clamp-5' : ''}`}>
        {linkifyText(content)}
      </p>
      {needsCollapse && (
        <button
          onClick={onToggle}
          className="mt-1 text-xs text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-0.5"
        >
          {expanded ? (
            <><ChevronUp className="w-3.5 h-3.5" />접기</>
          ) : (
            <><ChevronDown className="w-3.5 h-3.5" />더 보기</>
          )}
        </button>
      )}
    </div>
  );
}

function AdminGameSearch({ accessToken, onSelect }: { accessToken: string; onSelect: (g: {id: string; name: string; imageUrl: string}) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<any>(null);

  const search = (val: string) => {
    setQ(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ query: val }),
        });
        if (res.ok) setResults(await res.json());
      } catch {}
      setLoading(false);
    }, 400);
  };

  return (
    <div>
      <input value={q} onChange={e => search(e.target.value)}
        placeholder="게임 검색..."
        className="w-full h-9 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30 mb-2" />
      {loading && <p className="text-xs text-gray-400 text-center py-2">검색 중...</p>}
      {results.slice(0, 5).map(g => {
        const img = (g.thumbnail || g.imageUrl || '').replace(/^\/\//, 'https://');
        return (
          <button key={g.id} onClick={() => { onSelect({ id: g.id, name: g.koreanName || g.name, imageUrl: img }); setQ(''); setResults([]); }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-xl text-left">
            {img ? <img src={img} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0" />}
            <span className="text-sm text-gray-900 truncate">{g.koreanName || g.name}</span>
          </button>
        );
      })}
    </div>
  );
}

const FeedCardInner = function FeedCard({ post, accessToken, userId, userName, myAvatarUrl, myRankPoints, onUpdate, onFollowToggle, onDelete, onViewProfile, ownedGames, userEmail, userProfile, onOptimisticDelete, onOptimisticLike, onOptimisticComment, onOptimisticDeleteComment, isAdmin, onCommentOpen, onCommentClose, onGameClick, wishlistGames = [], onAddToWishlist, onRemoveFromWishlist, bookmarkedPostIds, onBookmarkChange, onGuestAction, onCategoryClick, isWinner = false, isLeading = false }: {
  post: FeedPost; accessToken: string; userId: string; userName: string;
  myAvatarUrl?: string;
  myRankPoints?: { points: number; posts: number; comments: number; likesReceived: number };
  onUpdate: () => void;
  onFollowToggle: (targetId: string) => void;
  onDelete?: (postId: string) => void;
  onViewProfile?: (targetUserId: string, isMe: boolean) => void;
  highlightPostId?: string | null;
  onHighlightClear?: () => void;
  openComposer?: boolean;
  onComposerClose?: () => void;
  ownedGames?: BoardGame[];
  userEmail?: string;
  userProfile?: { username: string; profileImage?: string } | null;
  onOptimisticDelete?: (postId: string) => void;
  onOptimisticLike?: (postId: string, userId: string) => void;
  onOptimisticComment?: (postId: string, comment: any) => void;
  onOptimisticDeleteComment?: (commentId: string) => void;
  isAdmin?: boolean;
  onCommentOpen?: (postId: string) => void;
  onCommentClose?: (postId: string) => void;
  onGameClick?: (gameId: string, gameName: string, imageUrl?: string) => void;
  wishlistGames?: { id: string; bggId?: string; koreanName?: string; englishName?: string; imageUrl?: string }[];
  onAddToWishlist?: (game: { id: string; name: string; imageUrl: string }) => void;
  onRemoveFromWishlist?: (gameId: string) => void;
  bookmarkedPostIds?: Set<string>;
  onBookmarkChange?: (postId: string, bookmarked: boolean) => void;
  onGuestAction?: () => void;
  onCategoryClick?: (category: string) => void;
  isWinner?: boolean;
  isLeading?: boolean;
}) {
  const [showComments, setShowComments] = useState(false);
  const [liking, setLiking] = useState(false);
  // 공지글 접기/펼치기
  const isPinned = post.pinned && !post.isHomework;
  const pinnedLines = (post.content || '').split('\n');
  const pinnedNeedsCollapse = isPinned && (pinnedLines.length > 5 || (post.content || '').length > 300);
  const [pinnedExpanded, setPinnedExpanded] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showEditComposer, setShowEditComposer] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showAdminGameTag, setShowAdminGameTag] = useState(false);
  const [adminTagQueue, setAdminTagQueue] = useState<{id: string; name: string; imageUrl: string}[]>([]);
  const imageScrollRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  
  // 방어적 처리
  const likes = post.likes || [];
  const comments = post.comments || [];
  const images = post.images || [];
  const isLiked = likes.includes(userId);

  // URL을 클릭 가능한 링크로 변환하는 함수
  const linkifyText = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-500 hover:text-cyan-600 underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  // 이미지 스크롤 감지
  useEffect(() => {
    const handleScroll = () => {
      if (imageScrollRef.current && images.length > 0) {
        const scrollLeft = imageScrollRef.current.scrollLeft;
        const itemWidth = imageScrollRef.current.offsetWidth;
        const index = Math.round(scrollLeft / itemWidth);
        setCurrentImageIndex(index);
      }
    };

    const scrollEl = imageScrollRef.current;
    if (scrollEl) {
      scrollEl.addEventListener('scroll', handleScroll);
      return () => scrollEl.removeEventListener('scroll', handleScroll);
    }
  }, [images.length]);

  // 화살표 클릭으로 이미지 이동
  const scrollToImage = (index: number) => {
    if (!imageScrollRef.current) return;
    const itemWidth = imageScrollRef.current.offsetWidth;
    imageScrollRef.current.scrollTo({ left: itemWidth * index, behavior: 'smooth' });
  };

  const vote = async (optionIndex: number) => {
    try {
      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/poll/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ optionIndex }),
      });
      onUpdate();
    } catch { toast.error('투표 실패'); }
  };

  const [sallaeReason, setSallaeReason] = useState('');
  const [sallaeStep, setSallaeStep] = useState<'vote' | 'reason'>('vote');
  const [sallaePending, setSallaePending] = useState<'buy' | 'pass' | 'think' | null>(null);
  const [sallaeSubmitting, setSallaeSubmitting] = useState(false);

  const sallaeVote = async (choice: 'buy' | 'pass' | 'think') => {
    if (!userId) { onGuestAction?.(); return; }
    const myChoice = post.sallae?.buy?.includes(userId) ? 'buy'
      : post.sallae?.pass?.includes(userId) ? 'pass'
      : post.sallae?.think?.includes(userId) ? 'think' : null;
    if (myChoice === choice) {
      // 같은 버튼 다시 누르면 취소
      try {
        await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/sallae/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ choice: null }),
        });
        onUpdate();
      } catch { toast.error('처리 실패'); }
      return;
    }
    setSallaePending(choice);
    setSallaeStep('reason');
  };

  const sallaeSubmitReason = async (quickReason?: string) => {
    if (!sallaePending || sallaeSubmitting) return;
    setSallaeSubmitting(true);
    // 모달 즉시 닫기 (중복 클릭 방지)
    setSallaeStep('vote');
    const pendingChoice = sallaePending;
    const reasonText = quickReason ?? sallaeReason;
    setSallaePending(null);
    setSallaeReason('');
    try {
      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/sallae/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ choice: pendingChoice }),
      });
      if (reasonText.trim()) {
        const label = pendingChoice === 'buy' ? '살래요 🛒' : pendingChoice === 'think' ? '고민중 🤔' : '말래요 ✋';
        await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ content: `[${label}] ${reasonText.trim()}`, userName }),
        });
      }
      onUpdate();
    } catch { toast.error('처리 실패'); }
    finally { setSallaeSubmitting(false); }
  };

  const toggleLike = async () => {
    if (liking) return;
    setLiking(true);
    // 낙관적 업데이트: 즉시 UI 반영
    onOptimisticLike?.(post.id, userId);
    try {
      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/like`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // 실패 시 ���백
      onOptimisticLike?.(post.id, userId);
    }
    setLiking(false);
  };

  const share = () => {
    const url = `${window.location.origin}/post/${post.id}`;
    
    // 클립보드 API를 시도하고, 실패하면 폴백 메서드 사용
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => {
          toast.success('링크 복사됨!');
        })
        .catch(() => {
          // 폴백: textarea를 사용한 구식 방법
          fallbackCopyTextToClipboard(url);
        });
    } else {
      // 클립보드 API가 없는 경우 폴백 메서드 사용
      fallbackCopyTextToClipboard(url);
    }
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        toast.success('링크 복사됨!');
      } else {
        toast.error('링크 복사 실패');
      }
    } catch (err) {
      toast.error('링크 복사 실패');
    }
    
    document.body.removeChild(textArea);
  };

  const handleDelete = async () => {
    // 이벤트 진행 중이고 내 글이면 실격 경고 먼저
    const isMyPost = post.userId === userId;
    if (isMyPost && isLeading) {
      const agreed = confirm(
        '⚠️ 이벤트 참여 중인 글입니다\n\n' +
        '이 글을 삭제하면 현재 이벤트 자격이 박탈됩니다.\n' +
        '이후 올리는 글도 이 이벤트에 참여되지 않습니다.\n\n' +
        '동의하십니까?'
      );
      if (!agreed) return;
      // 실격 처리
      try {
        await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event/disqualify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {}
    } else if (isMyPost && !isAdmin) {
      if (!confirm('정말 삭제하시겠습니까?')) return;
    } else if (!isMyPost && isAdmin) {
      if (!confirm('이 게시물을 삭제하시겠습니까?')) return;
    }
    // 낙관적 업데이트: 즉시 목록에서 제거
    onOptimisticDelete?.(post.id);
    setShowMenu(false);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        toast.success('게시물이 삭제되었습니다');
      } else {
        toast.error('삭제 실패');
        onUpdate();
      }
    } catch {
      toast.error('삭제 실패');
      onUpdate();
    }
  };

  const handleEdit = () => {
    setShowEditComposer(true);
    setShowMenu(false);
  };

  const toggleBookmark = async () => {
    if (bookmarking) return;
    setBookmarking(true);
    const isBookmarked = bookmarkedPostIds?.has(post.id) ?? false;
    onBookmarkChange?.(post.id, !isBookmarked);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bookmarks/${post.id}`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error();
      const d = await res.json();
      toast.success(d.bookmarked ? '저장했어요' : '저장 취소했어요');
    } catch {
      onBookmarkChange?.(post.id, isBookmarked); // 실패 시 되돌리기
      toast.error('처리 실패');
    }
    setBookmarking(false);
  };

  const handleTogglePrivate = async () => {
    setShowMenu(false);
    const newIsPrivate = !post.isPrivate;
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ isPrivate: newIsPrivate }) }
      );
      if (res.ok) {
        toast.success(newIsPrivate ? '게시물을 비공개로 변경했어요' : '게시물을 공개로 변경했어요');
        onUpdate();
      } else toast.error('처리 실패');
    } catch { toast.error('처리 실패'); }
  };

  const handlePinToggle = async (isHomework: boolean) => {
    setShowMenu(false);
    const newPinned = !post.pinned;
    // 낙관적으로 즉시 반영
    onUpdate();
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/pin`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ pinned: newPinned, isHomework }) }
      );
      if (res.ok) {
        toast.success(newPinned ? (isHomework ? '📌 숙제로 고정했어요' : '📌 게시물을 고정했어요') : '고정을 해제했어요');
        onUpdate();
      }
    } catch { toast.error('처리 실패'); }
  };

  const handleBestToggle = async () => {
    setShowMenu(false);
    const newBest = !post.isBest;
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/best`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ isBest: newBest }) }
      );
      if (res.ok) {
        toast.success(newBest ? '🏆 베스트글로 선정했어요! (+300P 지급)' : '베스트글 해제했어요');
        onUpdate();
      }
    } catch { toast.error('처리 실패'); }
  };

  const CATEGORY_COLORS: Record<string, string> = {
    '정보': 'bg-blue-50 text-blue-600', '소식': 'bg-green-50 text-green-600',
    '게임리뷰': 'bg-amber-50 text-amber-600', '자유': 'bg-gray-100 text-gray-500',
    '살래말래': 'bg-cyan-50 text-cyan-600', '이벤트': 'bg-cyan-100 text-cyan-700',
  };

  return (
    <>
      <div className={`pt-4 pb-3 border-b border-gray-100 last:border-b-0 ${post.pinned ? 'bg-orange-50/40' : ''} ${post.isBest && !post.pinned ? 'bg-yellow-50/30' : ''} ${isWinner ? 'bg-gradient-to-b from-yellow-50 to-red-50' : isLeading ? 'bg-gradient-to-b from-indigo-50 to-white' : ''}`}
        style={isWinner ? { boxShadow: 'inset 0 0 0 2px #f59e0b' } : isLeading ? { boxShadow: 'inset 0 0 0 2px #6366f1' } : post.isBest && !post.pinned ? { boxShadow: 'inset 0 0 0 1.5px #fbbf24' } : {}}>
        {/* 이벤트 당첨/선두 배지 */}
        {isWinner && (
          <div className="mx-4 mb-3 rounded-xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #7c1c2e, #b91c1c)', border: '2px solid #fbbf24' }}>
            <div className="px-4 py-2.5 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400 animate-bounce flex-shrink-0" />
              <div>
                <p className="text-yellow-300 text-xs font-black tracking-widest">🎉 당첨!!!</p>
                <p className="text-white text-xs">이 글 작성자가 이벤트에 당첨됐어요!</p>
              </div>
            </div>
          </div>
        )}
        {isLeading && !isWinner && (
          <div className="mx-4 mb-2 px-3 py-1.5 rounded-xl bg-indigo-600 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-indigo-200 flex-shrink-0" />
            <p className="text-indigo-100 text-xs font-bold">⚡ 현재 선두 — 타이머가 0이 되면 당첨!</p>
          </div>
        )}
        {/* 고정/숙제 배지 */}
        {post.pinned && (
          <div className="flex items-center gap-1.5 mb-2 px-4">
            <span className="text-xs font-bold text-orange-500 flex items-center gap-1">
              📌 {post.isHomework ? '숙제' : '공지'}
            </span>
          </div>
        )}
        {/* 베스트글 배지 */}
        {post.isBest && (
          <div className="flex items-center gap-1.5 mb-2 px-4">
            <span className="text-xs font-bold text-yellow-600 flex items-center gap-1">
              🏆 베스트글
            </span>
          </div>
        )}

        {/* 헤더 */}
        <div className="flex items-start gap-3 px-4 sm:px-8 mb-2">
          {/* 프로필 아이콘 + 팔로우 오버레이 */}
          <div className="flex-shrink-0 relative">
            <button onClick={() => onViewProfile?.(post.userId, post.userId === userId)}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 overflow-hidden hover:opacity-75 transition-opacity">
              {post.userAvatar
                ? <img src={post.userAvatar} className="w-full h-full object-cover" alt={post.userName} />
                : post.userName[0]?.toUpperCase()}
            </button>
            {post.userId !== userId && (
              <button onClick={() => onFollowToggle(post.userId)}
                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-gray-900 rounded-full flex items-center justify-center text-white hover:bg-gray-700 transition-colors z-10">
                <span className="text-[10px] font-bold leading-none">+</span>
              </button>
            )}
          </div>
          {/* 닉네임+레벨+카테고리 / 시간 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0">
              <button onClick={() => onViewProfile?.(post.userId, post.userId === userId)}
                className="font-semibold text-gray-900 text-sm hover:underline">{post.userName}</button>
              {post.userRankPoints && (() => {
                const r = getRankByStats(post.userRankPoints.points, post.userRankPoints.posts, post.userRankPoints.comments, post.userRankPoints.likesReceived);
                return <ChessRankBadge rank={r} />;
              })()}
              {post.category && post.category !== '자유' && (
                <button
                  onClick={() => onCategoryClick?.(post.category)}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[post.category] || 'bg-gray-100 text-gray-500'} hover:opacity-75 transition-opacity`}>
                  {post.category}
                </button>
              )}
              {post.isPrivate && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                  <Lock className="w-3 h-3" />비공개
                </span>
              )}
              {post.isBest && (
                <button
                  onClick={() => toast('🏆 베스트글 선정 시 300P 지급됩니다.', { duration: 2000 })}
                  className="text-xs px-2 py-0.5 rounded-full font-bold bg-yellow-100 text-yellow-600 hover:bg-yellow-200 transition-colors">
                  +300P
                </button>
              )}
            </div>
            <span className="text-xs text-gray-400">{timeAgo(post.createdAt)}</span>
          </div>
          {(post.userId === userId || isAdmin) && (
            <div className="relative flex-shrink-0">
              <button onClick={() => setShowMenu(!showMenu)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-[9]" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-10 min-w-[140px]">
                    {isAdmin && (
                      <>
                        <button onClick={handleBestToggle}
                          className="w-full px-4 py-2 text-left text-sm text-yellow-600 hover:bg-yellow-50 transition-colors">
                          {post.isBest ? '🏆 베스트 해제' : '🏆 베스트글 선정'}
                        </button>
                        <button onClick={() => handlePinToggle(false)}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          {post.pinned && !post.isHomework ? '📌 고정 해제' : '📌 공지로 고정'}
                        </button>
                        <button onClick={() => handlePinToggle(true)}
                          className="w-full px-4 py-2 text-left text-sm text-orange-600 hover:bg-orange-50 transition-colors">
                          {post.pinned && post.isHomework ? '📚 숙제 고정 해제' : '📚 숙제로 고정'}
                        </button>
                        <button onClick={() => { setShowMenu(false); setAdminTagQueue(post.linkedGames || []); setShowAdminGameTag(true); }}
                          className="w-full px-4 py-2 text-left text-sm text-cyan-600 hover:bg-cyan-50 transition-colors">
                          🎲 게임태그 추가/수정
                        </button>
                        <div className="border-t border-gray-100 my-1" />
                      </>
                    )}
                    {post.userId === userId && (
                      <>
                        <button onClick={handleEdit}
                          className="w-full px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 transition-colors">수정</button>
                        <button onClick={handleTogglePrivate}
                          className="w-full px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                          {post.isPrivate ? '🔓 공개로 변경' : '비공개로 변경'}
                        </button>
                      </>
                    )}
                    <button onClick={handleDelete}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors">삭제</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 본문 - 공지글은 5줄 접기 가능 */}
        {isPinned ? (
          <PinnedContent content={post.content} linkifyText={linkifyText}
            expanded={pinnedExpanded} onToggle={() => setPinnedExpanded(v => !v)}
            needsCollapse={pinnedNeedsCollapse} />
        ) : (
          <p className="text-sm text-gray-800 leading-relaxed mb-3 whitespace-pre-wrap px-4 sm:px-8">{linkifyText(post.content)}</p>
        )}

        {/* 재능판매 카드 - 카드 좌측 정렬 */}
        {post.category === '재능판매' && post.talentData && (
          <div className="mb-3 mx-4 sm:mx-8 rounded-xl overflow-hidden border-2 border-[#99E8EC]">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#00C4CC]">
              <svg className="w-3.5 h-3.5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              <span className="text-white text-xs font-bold">재능판매</span>
              <span className="text-[#CCF5F7] text-xs">{post.talentData.talentCategory}</span>
            </div>
            <div className="px-3 py-2.5 bg-[#E6FAFA] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-[#00A3AB]">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                <span>{post.talentData.talentLocation}</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.5-.8-1.4-1-2.5-1-1.4 0-2.5.7-2.5 2s1.1 1.8 2.5 2 2.5.8 2.5 2.2c0 1.2-1.1 2-2.5 2-1.2 0-2.1-.3-2.7-1.2"/><path d="M12 7v1m0 8v1"/></svg>
                {post.talentData.talentPrice
                  ? <span className="text-lg font-black text-gray-900">{parseInt(post.talentData.talentPrice).toLocaleString()}원</span>
                  : <span className="text-sm font-semibold text-gray-400">협의</span>}
              </div>
            </div>
          </div>
        )}

        {/* 연결된 게임 - 카드 좌측 정렬 */}
        {post.category !== '살래말래' && (() => {
          const games = post.linkedGames && post.linkedGames.length > 0 ? post.linkedGames : (post.linkedGame ? [post.linkedGame] : []);
          if (games.length === 0) return null;
          if (games.length === 1) {
            const g = games[0];
            const isWished = wishlistGames.some(w => w.id === g.id || (g.id && w.bggId === g.id));
            return (
              <div className="flex items-center gap-2 mb-3 mx-4 sm:mx-8">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors min-w-0">
                  <div className="flex-1 flex items-center gap-2 cursor-pointer min-w-0"
                    onClick={(e) => { e.stopPropagation(); if (onGameClick) onGameClick(g.bggId || g.id, g.name, g.imageUrl); }}>
                    {g.imageUrl && <img src={g.imageUrl} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />}
                    <span className="text-sm font-medium text-gray-700 truncate flex-1">{g.imageUrl ? '' : '🎲 '}{g.name}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (!userId) { onGuestAction?.(); return; } isWished ? onRemoveFromWishlist?.(g.id) : onAddToWishlist?.({ id: g.id, name: g.name, imageUrl: g.imageUrl || '' }); }}
                    className={`flex-shrink-0 p-1 rounded-lg transition-colors ${isWished ? 'text-red-400' : 'text-gray-300 hover:text-red-400'}`}>
                    <Heart className={`w-4 h-4 ${isWished ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </div>
            );
          }
          // 여러개: 이미지 그리드
          return (
            <div className="flex gap-2 mb-3 mx-4 sm:mx-8 flex-wrap">
              {games.map(g => {
                const isWished = wishlistGames.some(w => w.id === g.id || (g.id && w.bggId === g.id));
                return (
                  <div key={g.id} className="relative cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); if (onGameClick) onGameClick(g.bggId || g.id, g.name, g.imageUrl); }}>
                    {g.imageUrl
                      ? <img src={g.imageUrl} className="w-16 h-16 rounded-xl object-cover" onError={e => { const t = e.target as HTMLImageElement; t.style.display='none'; t.nextElementSibling?.removeAttribute('hidden'); }} />
                      : <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center"><Gamepad2 className="w-6 h-6 text-gray-400" /></div>}
                    <button
                      onClick={(e) => { e.stopPropagation(); if (!userId) { onGuestAction?.(); return; } if (!isWished) onAddToWishlist?.({ id: g.id, name: g.name, imageUrl: g.imageUrl || '' }); }}
                      className={`absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center shadow transition-colors ${isWished ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:text-red-500'}`}>
                      <Heart className={`w-3 h-3 ${isWished ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* 설문조사 */}
        {post.poll && (
          <div className="mx-4 sm:mx-8 mb-3 bg-gray-50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-gray-900 mb-3">{post.poll.question}</p>
            <div className="space-y-2">
              {post.poll.options.map((opt, i) => {
                const totalVotes = post.poll!.options.reduce((s, o) => s + (o.votes?.length || 0), 0);
                const myVote = post.poll!.options.some(o => o.votes?.includes(userId));
                const voted = opt.votes?.includes(userId);
                const pct = totalVotes > 0 ? Math.round((opt.votes?.length || 0) / totalVotes * 100) : 0;
                return (
                  <button key={i} onClick={() => !myVote && vote(i)}
                    className={`w-full text-left rounded-xl px-3 py-2.5 text-sm transition-colors relative overflow-hidden border ${voted ? 'border-gray-900' : myVote ? 'border-gray-200 opacity-60' : 'border-gray-200 hover:border-gray-400'}`}>
                    {myVote && (
                      <div className="absolute inset-0 bg-gray-100 transition-all" style={{ width: `${pct}%` }} />
                    )}
                    <div className="relative flex items-center justify-between">
                      <span className={`font-medium ${voted ? 'text-gray-900' : 'text-gray-700'}`}>{opt.text}</span>
                      {myVote && <span className="text-xs text-gray-500 font-semibold">{pct}%</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2">
              {(() => {
                const total = post.poll.options.reduce((s, o) => s + (o.votes?.length || 0), 0);
                return <p className="text-xs text-gray-400">{total > 0 ? `${total}명 참여` : ''}</p>;
              })()}
              {post.poll.options.some(o => o.votes?.includes(userId)) && (
                <button onClick={() => vote(-1)}
                  className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2">
                  다시 투표하기
                </button>
              )}
            </div>
          </div>
        )}

        {/* 살래말래 */}
        {post.category === '살래말래' && (
          <div className="mx-4 sm:mx-8 mb-4">
            {sallaeStep === 'reason' && sallaePending ? (
              <div className="fixed inset-0 bg-black/50 z-[9990] flex items-center justify-center p-4"
                onClick={() => { setSallaeStep('vote'); setSallaePending(null); setSallaeReason(''); }}>
                <div className="bg-white w-full max-w-sm rounded-2xl px-5 pt-5 pb-8 shadow-2xl"
                  onClick={e => e.stopPropagation()}>
                  {/* 선택 배지 */}
                  <div className="flex justify-center mb-3">
                    <span className="px-4 py-1.5 rounded-full text-sm font-bold"
                      style={{
                        backgroundColor: sallaePending === 'buy' ? '#00AAEE' : sallaePending === 'think' ? '#81C784' : '#FF3355',
                        color: 'white',
                        fontFamily: "'Paper Logic', sans-serif"
                      }}>
                      {sallaePending === 'buy' ? '살래 🛒' : sallaePending === 'think' ? '고민중 🤔' : '말래 ✋'}
                    </span>
                  </div>
                  <p className="text-base font-bold text-gray-900 text-center mb-1">
                    {sallaePending === 'buy' ? '왜 사고 싶으세요?' : sallaePending === 'think' ? '어떤 점이 고민되세요?' : '왜 안 사시려고요?'}
                  </p>
                  <p className="text-xs text-gray-400 text-center mb-4">이유를 남기면 댓글로 등록돼요 (선택)</p>
                  {/* 빠른 선택 칩 */}
                  <p className="text-xs text-gray-400 mb-2">빠르게 선택하면 바로 등록돼요 👇</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(sallaePending === 'buy'
                      ? [
                          '테마가 너무 좋아요 🎨', '가격 대비 최고예요 💰', '디자인이 예뻐요 ✨',
                          '전략이 깊어요 🧠', '컴포넌트가 고급스러워요 🎲', '친구들이랑 하고 싶어요 👫',
                          '오래 즐길 수 있을 것 같아요 🕰️', '입문하기 좋아요 🌱',
                          '혼자서도 재밌어요 🙋', '협동 플레이가 매력적이에요 🤝',
                        ]
                      : sallaePending === 'think'
                      ? [
                          '가격이 좀 부담돼요 💸', '이미 비슷한 게임이 있어요 🔄',
                          '같이 할 사람이 없어요 👥', '공간이 부족해요 📦',
                          '더 알아보고 싶어요 🔍', '아직 후기가 부족해요 📖',
                          '한국어판 기다리는 중 🇰🇷', '다음 세일 때 살 것 같아요 🏷️',
                          '다른 게임이랑 비교 중이에요 ⚖️', '플레이해보고 결정할게요 🎮',
                        ]
                      : [
                          '가격이 너무 비싸요 💸', '비슷한 게임이 이미 있어요 🔄',
                          '플레이 시간이 너무 길어요 ⏰', '운 요소가 많아요 🎰',
                          '혼자서는 못 해요 👥', '룰이 너무 복잡해요 📖',
                          '보관 공간이 너무 커요 📦', '한국어판이 없어요 🇰🇷',
                          '취향에 맞지 않아요 😅', '구하기가 어려워요 🔍',
                        ]
                    ).map(chip => (
                      <button key={chip}
                        onClick={() => sallaeSubmitReason(chip)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all hover:scale-105 active:scale-95"
                        style={{
                          borderColor: sallaePending === 'buy' ? '#00AAEE' : sallaePending === 'think' ? '#81C784' : '#FF3355',
                          color: sallaePending === 'buy' ? '#00AAEE' : sallaePending === 'think' ? '#4CAF50' : '#FF3355',
                          backgroundColor: 'white',
                        }}>
                        {chip}
                      </button>
                    ))}
                  </div>
                  {/* 직접 입력 */}
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={sallaeReason}
                      onChange={e => setSallaeReason(e.target.value)}
                      placeholder="��접 입력하기..."
                      className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none outline-none focus:border-gray-400 bg-gray-50"
                      rows={2}
                    />
                    <button onClick={() => sallaeSubmitReason()}
                      disabled={!sallaeReason.trim()}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40 flex-shrink-0 mb-0.5"
                      style={{ backgroundColor: sallaePending === 'buy' ? '#00AAEE' : sallaePending === 'think' ? '#81C784' : '#FF3355' }}>
                      등록
                    </button>
                  </div>
                  <button onClick={() => sallaeSubmitReason('')}
                    className="w-full mt-2.5 py-1.5 text-xs text-gray-300 hover:text-gray-500 transition-colors">
                    이유 없이 그냥 투표만
                  </button>
                </div>
              </div>
            ) : (() => {
              const buyCount = post.sallae?.buy?.length || 0;
              const passCount = post.sallae?.pass?.length || 0;
              const thinkCount = post.sallae?.think?.length || 0;
              const voteTotal = buyCount + passCount; // 퍼센트 계산용 (think 제외)
              const total = buyCount + passCount + thinkCount; // 전체 참여수
              const myChoice = post.sallae?.buy?.includes(userId) ? 'buy'
                : post.sallae?.pass?.includes(userId) ? 'pass'
                : post.sallae?.think?.includes(userId) ? 'think' : null;
              const buyPct = voteTotal > 0 ? Math.round(buyCount / voteTotal * 100) : 50;
              const passPct = voteTotal > 0 ? 100 - buyPct : 50;
              return (
                <div>
                  {/* 게임 이미지 크게 */}
                  {post.linkedGame?.imageUrl && (() => {
                    const isWishedSallae = wishlistGames.some(w => w.id === post.linkedGame?.id || (post.linkedGame?.id && w.bggId === post.linkedGame?.id));
                    return (
                      <div className="mb-3 rounded-2xl overflow-hidden w-full aspect-[4/3] bg-gray-100 relative cursor-pointer"
                        onClick={() => onGameClick?.(post.linkedGame!.id, post.linkedGame!.name, post.linkedGame!.imageUrl)}>
                        <img src={post.linkedGame.imageUrl} alt={post.linkedGame.name}
                          className="w-full h-full object-cover" />
                        {total > 0 && (
                          <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1">
                            <span>👥</span>
                            <span>{total}명 참여</span>
                          </div>
                        )}
                        {/* + 위시 버튼 */}
                        <button
                          onClick={(e) => { e.stopPropagation(); if (!userId) { onGuestAction?.(); return; } isWishedSallae ? onRemoveFromWishlist?.(post.linkedGame!.id) : onAddToWishlist?.({ id: post.linkedGame!.id, name: post.linkedGame!.name, imageUrl: post.linkedGame!.imageUrl || '' }); }}
                          className={`absolute bottom-2.5 right-2.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors shadow-lg ${isWishedSallae ? 'bg-cyan-500/90 text-white' : 'bg-white/90 text-cyan-600 hover:bg-cyan-500 hover:text-white'}`}>
                          {isWishedSallae ? '위시✓' : '+ 위시'}
                        </button>
                      </div>
                    );
                  })()}
                  {post.linkedGame && (
                    <p className="text-sm font-semibold text-gray-700 mb-3 text-center">🎲 {post.linkedGame.name}</p>
                  )}
                  {!myChoice && (
                    <div className="flex gap-2 mb-3">
                      <button onClick={() => sallaeVote('buy')}
                        className="flex-1 py-4 rounded-2xl text-white font-black text-2xl transition-all active:scale-95"
                        style={{
                          backgroundColor: '#00AAEE',
                          fontFamily: "'Paper Logic', sans-serif",
                          boxShadow: '0 4px 0 #0077BB, 0 6px 8px rgba(0,170,238,0.35)',
                        }}>
                        살래
                      </button>
                      <button onClick={() => sallaeVote('think')}
                        className="flex-1 py-4 rounded-2xl font-black text-2xl transition-all active:scale-95"
                        style={{
                          backgroundColor: '#B8E8C8',
                          color: '#2D7A4F',
                          fontFamily: "'Paper Logic', sans-serif",
                          boxShadow: '0 4px 0 #7DC99A, 0 6px 8px rgba(45,122,79,0.25)',
                        }}>
                        고민중
                      </button>
                      <button onClick={() => sallaeVote('pass')}
                        className="flex-1 py-4 rounded-2xl text-white font-black text-2xl transition-all active:scale-95"
                        style={{
                          backgroundColor: '#FF3355',
                          fontFamily: "'Paper Logic', sans-serif",
                          boxShadow: '0 4px 0 #CC0033, 0 6px 8px rgba(255,51,85,0.35)',
                        }}>
                        말래
                      </button>
                    </div>
                  )}
                  {myChoice === 'think' && (
                    <div>
                      <div className="text-center mb-3 py-2 px-3 rounded-xl" style={{ backgroundColor: '#D8F4E4' }}>
                        <span className="text-lg mr-1">🤔</span>
                        <span className="font-black text-base" style={{ color: '#2D7A4F' }}>아직 고민 중이에요</span>
                      </div>
                      <div className="flex rounded-xl overflow-hidden h-6 mb-1.5">
                        <div className="transition-all duration-500 flex items-center justify-center"
                          style={{ width: `${buyPct}%`, backgroundColor: '#00AAEE' }}>
                          {buyPct >= 15 && <span className="text-white text-xs font-bold">{buyPct}%</span>}
                        </div>
                        <div className="transition-all duration-500 flex items-center justify-center"
                          style={{ width: `${passPct}%`, backgroundColor: '#FF3355' }}>
                          {passPct >= 15 && <span className="text-white text-xs font-bold">{passPct}%</span>}
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>살래 {buyCount}명</span>
                        <span>총 {total}명 참여</span>
                        <span>말래 {passCount}명</span>
                      </div>
                      {thinkCount > 0 && (
                        <p className="text-center text-xs mt-1" style={{ color: '#2D7A4F' }}>🤔 고민중 {thinkCount}명</p>
                      )}
                      <button
                        className="mt-2 w-full text-xs text-gray-300 hover:text-gray-500 transition-colors py-1"
                        onClick={() => {
                          fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/sallae/vote`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                            body: JSON.stringify({ choice: null }),
                          }).then(() => onUpdate());
                        }}>
                        다시 선택하기
                      </button>
                    </div>
                  )}
                  {(myChoice === 'buy' || myChoice === 'pass') && (() => {
                    const verdict = buyPct >= 90
                      ? { text: '이걸 왜 안사!', emoji: '🔥', color: '#00AAEE' }
                      : buyPct >= 60
                      ? { text: '사면 뿌듯함', emoji: '😊', color: '#00AAEE' }
                      : buyPct > 50
                      ? { text: '사도 후회는 없음', emoji: '🙂', color: '#00AAEE' }
                      : buyPct === 50
                      ? { text: '이건 알 수가 없다', emoji: '🤔', color: '#888' }
                      : buyPct >= 40
                      ? { text: '안 사는 게 좋을까?', emoji: '😐', color: '#FF3355' }
                      : buyPct >= 20
                      ? { text: '누군가는 사겠지?', emoji: '😅', color: '#FF3355' }
                      : { text: '다들 말리는 중', emoji: '🚫', color: '#FF3355' };
                    return (
                      <div>
                        {/* 판정 멘트 */}
                        <div className="text-center mb-3 py-2 px-3 rounded-xl bg-gray-50">
                          <span className="text-lg mr-1">{verdict.emoji}</span>
                          <span className="font-black text-base" style={{ color: verdict.color }}>{verdict.text}</span>
                        </div>
                        {/* 그래프 */}
                        <div className="flex rounded-xl overflow-hidden h-6 mb-1.5">
                          <div className="transition-all duration-500 flex items-center justify-center"
                            style={{ width: `${buyPct}%`, backgroundColor: '#00AAEE' }}>
                            {buyPct >= 15 && <span className="text-white text-xs font-bold">{buyPct}%</span>}
                          </div>
                          <div className="transition-all duration-500 flex items-center justify-center"
                            style={{ width: `${passPct}%`, backgroundColor: '#FF3355' }}>
                            {passPct >= 15 && <span className="text-white text-xs font-bold">{passPct}%</span>}
                          </div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>살래 {buyCount}명</span>
                          <span>총 {total}명 참여</span>
                          <span>말래 {passCount}명</span>
                        </div>
                        {thinkCount > 0 && (
                          <p className="text-center text-xs mt-1" style={{ color: '#2D7A4F' }}>🤔 고민중 {thinkCount}명</p>
                        )}
                        <button
                          className="mt-2 w-full text-xs text-gray-300 hover:text-gray-500 transition-colors py-1"
                          onClick={() => {
                            fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}/sallae/vote`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                              body: JSON.stringify({ choice: null }),
                            }).then(() => onUpdate());
                          }}>
                          다시 선택하기
                        </button>
                      </div>
                    );
                  })()}
                  {!myChoice && total > 0 && (
                    <p className="text-center text-xs text-gray-400">투표하면 결과를 볼 수 있어요</p>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* 이미지 - 공지글 접힘 시 숨김 */}
        {images.length > 0 && (!isPinned || pinnedExpanded || !pinnedNeedsCollapse) && (
          <>
            {/* 모바일: 쓰레드 스타일 - 카드 너비에 맞게 */}
            <div className="sm:hidden mb-3">
              <div
                ref={imageScrollRef}
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {images.map((url, i) => (
                  <div key={i} className="flex-shrink-0 snap-start"
                    style={{
                      width: images.length === 1 ? '100%' : 'calc(100% - 48px)',
                      marginRight: images.length === 1 ? 0 : '8px',
                    }}>
                    <img src={url} className="w-full object-contain cursor-pointer bg-gray-50"
                      style={{ maxHeight: '480px' }}
                      onClick={() => setLightboxIndex(i)} />
                  </div>
                ))}
                {images.length > 1 && <div className="flex-shrink-0 w-2" />}
              </div>
            </div>

            {/* PC: 기존 화살표 + 점 스타일 - 패딩 추가 */}
            <div className="hidden sm:block relative mb-3 px-8">
              <div className="overflow-hidden">
                <div ref={imageScrollRef}
                  className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {images.map((url, i) => (
                    <div key={i} className="w-full flex-shrink-0 snap-center flex items-center justify-center bg-[#c9c9c9]">
  <img src={url} className="w-full h-auto cursor-pointer"
    onClick={() => setLightboxIndex(i)} />
</div>
                  ))}
                </div>
              </div>
              {images.length > 1 && (
                <>
                  {currentImageIndex > 0 && (
                    <button onClick={() => scrollToImage(currentImageIndex - 1)}
                      className="absolute left-10 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center z-10">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}
                  {currentImageIndex < images.length - 1 && (
                    <button onClick={() => scrollToImage(currentImageIndex + 1)}
                      className="absolute right-10 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center z-10">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                    {images.map((_, i) => (
                      <button key={i} onClick={() => scrollToImage(i)}
                        className={`rounded-full transition-all duration-200 ${i === currentImageIndex ? 'w-4 h-2 bg-white' : 'w-2 h-2 bg-white/50'}`} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 라이트박스 모달 */}
            {lightboxIndex !== null && (
              <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center"
                onClick={() => setLightboxIndex(null)}>
                <button className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center text-white bg-white/20 rounded-full z-10"
                  onClick={() => setLightboxIndex(null)}>
                  <X className="w-5 h-5" />
                </button>
                {lightboxIndex > 0 && (
                  <button className="absolute left-3 w-9 h-9 flex items-center justify-center text-white bg-white/20 rounded-full z-10"
                    onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}>
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <img src={images[lightboxIndex]} className="max-w-full max-h-full object-contain"
                  onClick={e => e.stopPropagation()} />
                {lightboxIndex < images.length - 1 && (
                  <button className="absolute right-3 w-9 h-9 flex items-center justify-center text-white bg-white/20 rounded-full z-10"
                    onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}
                {images.length > 1 && (
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5">
                    {images.map((_, i) => (
                      <div key={i} className={`rounded-full transition-all ${i === lightboxIndex ? 'w-4 h-2 bg-white' : 'w-2 h-2 bg-white/40'}`} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 액션 버튼 */}
        <div className="flex items-center gap-4 pt-2 px-4 sm:px-8">
          <button onClick={() => { if (!userId) { onGuestAction?.(); return; } toggleLike(); }} disabled={liking}
            className={`flex items-center gap-1.5 text-sm transition-colors ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}>
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
            <span>{likes.length || ''}</span>
          </button>
          <button onClick={() => {
              const next = !showComments;
              setShowComments(next);
              if (next) {
                onCommentOpen?.(post.id);
                if (userId) setTimeout(() => commentInputRef.current?.focus(), 150);
              } else {
                onCommentClose?.(post.id);
              }
            }}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
            <MessageCircle className="w-4 h-4" />
            <span>{comments.length || ''}</span>
          </button>
          <button onClick={share} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
            <Share2 className="w-4 h-4" />
          </button>
          <button onClick={toggleBookmark} disabled={bookmarking}
            className={`flex items-center gap-1.5 text-sm transition-colors ${bookmarkedPostIds?.has(post.id) ? 'text-yellow-400' : 'text-gray-400 hover:text-gray-700'}`}>
            <Star className={`w-4 h-4 ${bookmarkedPostIds?.has(post.id) ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* 댓글 전체 (showComments 시) */}
        {showComments && (
          <div className="px-4 sm:px-8">
            <CommentSection post={post} accessToken={accessToken} userId={userId}
              userName={userName} avatarUrl={myAvatarUrl} userRankPoints={myRankPoints}
              onUpdate={onUpdate}
              inputRef={commentInputRef}
              onViewProfile={onViewProfile}
              isAdmin={isAdmin}
              wishlistGames={wishlistGames}
              onAddToWishlist={onAddToWishlist}
              onRemoveFromWishlist={onRemoveFromWishlist}
              onGameClick={onGameClick}
            />
          </div>
        )}
      </div>
      {/* 수정 모달 */}
      {showEditComposer && ownedGames && userEmail && userProfile && (
        <PostComposer
          accessToken={accessToken}
          userId={userId}
          userEmail={userEmail}
          userProfile={userProfile}
          ownedGames={ownedGames || []}
          onClose={() => setShowEditComposer(false)}
          onPosted={() => {
            setShowEditComposer(false);
            onUpdate();
          }}
          editPost={post}
        />
      )}

      {/* 관리자 게임태그 추가 모달 */}
      {showAdminGameTag && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-bold text-gray-900 mb-1">🎲 게임태그 추가/수정</h3>
            <p className="text-xs text-gray-400 mb-3">기존 태그를 유지하거나 추가·삭제할 수 있어요</p>
            {/* 현재 태그된 게임 */}
            {adminTagQueue.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {adminTagQueue.map(g => (
                  <div key={g.id} className="flex items-center gap-1 bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs px-2 py-1 rounded-full">
                    {g.imageUrl && <img src={g.imageUrl} className="w-4 h-4 rounded object-cover" />}
                    <span>{g.name}</span>
                    <button onClick={() => setAdminTagQueue(prev => prev.filter(x => x.id !== g.id))} className="hover:text-red-500">×</button>
                  </div>
                ))}
              </div>
            )}
            {/* BGG 검색 */}
            <AdminGameSearch
              accessToken={accessToken}
              onSelect={(g) => setAdminTagQueue(prev => prev.some(x => x.id === g.id) ? prev : [...prev, g])}
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdminGameTag(false)}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium">취소</button>
              <button onClick={async () => {
                // bgg_ 접두사 제거해서 ID 통일 저장 (서버 정규화 비교와 일치)
                const normalizedQueue = adminTagQueue.map(g => ({
                  ...g,
                  id: String(g.id).replace(/^bgg_/, ''),
                }));
                await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${post.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                  body: JSON.stringify({ linkedGames: normalizedQueue, linkedGame: normalizedQueue[0] || null }),
                });
                setShowAdminGameTag(false);
                onUpdate();
              }} className="flex-1 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const FeedCard = memo(FeedCardInner);

// ─── 메인 FeedPage ───

// ── 마지막글 이벤트 타이머 배너 ──
// 자정~오전8시(KST)는 휴식시간 → 타이머 일시정지
function useKSTHour() {
  const now = new Date();
  // KST = UTC+9
  return (now.getUTCHours() + 9) % 24;
}

function ReferralRankEventBanner({ event, accessToken }: { event: any; accessToken?: string }) {
  const [showModal, setShowModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const ranking: any[] = event.ranking || [];
  const leader = ranking[0] || null;

  // D-day 계산
  const now = Date.now();
  const endTs = event.eventEndDate ? new Date(event.eventEndDate).getTime() : null;
  const startTs = event.eventStartDate ? new Date(event.eventStartDate).getTime() : null;
  const daysLeft = endTs ? Math.ceil((endTs - now) / 86400000) : null;
  const notStarted = startTs ? now < startTs : false;

  // 기간 포맷 (MM/DD)
  const fmtDate = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })
    : null;

  const periodLabel = (() => {
    if (event.expired) return '⏰ 집계 마감';
    if (notStarted && event.eventStartDate) return `${fmtDate(event.eventStartDate)} 시작`;
    if (daysLeft !== null) {
      if (daysLeft <= 0) return '오늘 마감!';
      return `D-${daysLeft}`;
    }
    return null;
  })();

  const periodColor = event.expired ? '#ef4444' : (daysLeft !== null && daysLeft <= 3) ? '#f59e0b' : '#FFB300';

  return (
    <>
      {/* 카드형 배너 — LastPostEventBanner 스타일 */}
      <div
        className="rounded-2xl mb-3 overflow-hidden shadow-sm bg-white"
        style={{ border: `2px solid ${periodColor}` }}
      >
        <div className="px-5 py-4">
          {/* 상단 행: 타이틀 + D-day */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl leading-none font-black select-none" style={{ color: periodColor, lineHeight: 1 }}>🏅</span>
              <span className="text-gray-900 font-bold text-sm">추천인 랭킹 이벤트</span>
              {event.description && (
                <button
                  onClick={() => setShowModal(true)}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-black"
                  style={{ background: 'rgba(0,0,0,0.25)' }}
                  title="이벤트 설명">!</button>
              )}
            </div>
            {/* D-day / 기간 표시 */}
            <div className="text-right ml-2 flex-shrink-0">
              {periodLabel ? (
                <>
                  <p className="text-gray-400 text-[10px]">
                    {event.eventEndDate && !event.expired ? '마감까지' : ''}
                  </p>
                  <div className="font-black text-2xl tracking-tight leading-none" style={{ color: periodColor }}>
                    {periodLabel}
                  </div>
                </>
              ) : (
                <div className="font-black text-sm" style={{ color: periodColor }}>진행중</div>
              )}
            </div>
          </div>

          {/* 정보 박스: 선두 + 상품 */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-gray-400 text-[10px] mb-0.5">🥇 현재 1위</p>
              <p className="text-gray-800 font-bold text-sm">
                {leader ? (leader.referrerName || '익명') : '아직 없음'}
              </p>
              {leader && (
                <p className="text-[10px] text-gray-400">{leader.count}명 추천</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-gray-400 text-[10px] mb-0.5">상품</p>
                {event.prize && <p className="font-bold text-xs" style={{ color: periodColor }}>{event.prize}</p>}
                {event.prizeCards > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-black text-white inline-block mt-0.5" style={{ background: '#00BCD4' }}>🃏×{event.prizeCards}</span>
                )}
              </div>
              {event.prizeImageUrl && (
                <img src={event.prizeImageUrl} alt="상품" className="w-14 h-14 object-contain rounded-xl bg-white border border-gray-100 flex-shrink-0" />
              )}
            </div>
          </div>

          {/* 랭킹 보기 버튼 */}
          <button
            onClick={() => setShowModal(true)}
            className="mt-3 w-full py-2.5 rounded-2xl font-black text-sm text-white transition-all active:scale-95 flex items-center justify-center gap-1.5"
            style={{ background: periodColor }}
          >
            <Trophy className="w-4 h-4" />
            랭킹 보기
          </button>
        </div>
      </div>

      {/* 랭킹 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center px-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-white w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="px-5 pt-5 pb-4" style={{ background: event.expired ? 'linear-gradient(135deg,#FEE2E2,#FECACA)' : 'linear-gradient(135deg, #FFF8E1, #FFE082)' }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏅</span>
                  <div>
                    <h3 className="font-black text-gray-900 text-base">추천인 랭킹 이벤트</h3>
                    <p className="text-[11px] font-semibold" style={{ color: periodColor }}>
                      {event.eventStartDate && event.eventEndDate
                        ? `${fmtDate(event.eventStartDate)} ~ ${fmtDate(event.eventEndDate)}`
                        : event.eventStartDate
                          ? `${fmtDate(event.eventStartDate)} ~`
                          : event.eventEndDate
                            ? `~ ${fmtDate(event.eventEndDate)}`
                            : '진행중'}
                      {periodLabel && ` (${periodLabel})`}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/50 text-gray-500 hover:bg-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* 상품 */}
              {(event.prize || event.prizeCards > 0) && (
                <div className="mt-3 flex items-center gap-2 bg-white/70 rounded-xl px-3 py-2">
                  <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div className="flex items-center gap-2 flex-wrap">
                    {event.prize && <span className="text-sm font-black text-gray-900">{event.prize}</span>}
                    {event.prizeCards > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-black text-white" style={{ background: '#00BCD4' }}>🃏 보너스카드 ×{event.prizeCards}</span>
                    )}
                  </div>
                </div>
              )}
              {event.description && (
                <p className="text-xs text-amber-800 mt-2 leading-relaxed">{event.description}</p>
              )}
            </div>

            {/* 랭킹 목록 */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 160px)' }}>
              {ranking.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">아직 추천인 없음</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {ranking.map((r: any, i: number) => (
                    <div key={r.referrerId} className={`flex items-center gap-3 px-5 py-3 ${i === 0 ? 'bg-amber-50' : i === 1 ? 'bg-gray-50' : i === 2 ? 'bg-orange-50' : ''}`}>
                      <div className="w-8 h-8 flex items-center justify-center rounded-full font-black text-sm flex-shrink-0"
                        style={{
                          background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#f3f4f6',
                          color: i < 3 ? 'white' : '#9ca3af',
                        }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-900 truncate">{r.referrerName || '익명'}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="text-lg font-black" style={{ color: i === 0 ? '#FFB300' : '#374151' }}>{r.count}</span>
                        <span className="text-xs text-gray-400 ml-0.5">명</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 space-y-3">
              {event.eventStartDate && event.eventEndDate && (
                <p className="text-[11px] font-semibold text-center" style={{ color: periodColor }}>
                  📅 집계 기간: {fmtDate(event.eventStartDate)} ~ {fmtDate(event.eventEndDate)}
                </p>
              )}
              <p className="text-[11px] text-gray-400 text-center">추천인 코드로 가입한 친구 수 기준</p>
              {accessToken && (
                <button
                  onClick={() => { setShowModal(false); setShowReferralModal(true); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl font-black text-sm transition-all active:scale-95"
                  style={{ background: '#F0FDFF', border: '1.5px solid #B2EBF2', color: '#00BCD4' }}
                >
                  <Copy className="w-4 h-4" />
                  내 추천인 코드 복사하기
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 추천인 링크 모달 */}
      {showReferralModal && accessToken && (
        <ReferralLinkModal
          accessToken={accessToken}
          onClose={() => setShowReferralModal(false)}
        />
      )}
    </>
  );
}

function LastPostEventBanner({ event, posts, bonusCards = 0, onUseCard, userId, accessToken, compact = false, onAutoClose, onLowTimer, isAdmin = false }: { event: any; posts: any[]; bonusCards?: number; onUseCard?: () => void; userId?: string | null; accessToken?: string; compact?: boolean; onAutoClose?: (eventId: string, winner: any) => void; onLowTimer?: () => void; isAdmin?: boolean }) {
  const [remaining, setRemaining] = useState(-1); // 남은 초 (-1=초기화전)
  const [initialized, setInitialized] = useState(false);
  const [showNoCardModal, setShowNoCardModal] = useState(false);
  const [showHowToGetModal, setShowHowToGetModal] = useState(false);
  const [showDescModal, setShowDescModal] = useState(false);
  const [showNotLeaderModal, setShowNotLeaderModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  type CardUser = { userId: string; userName: string; count: number };
  const [cardGiftData, setCardGiftData] = useState<{ gift: string | null; cardGiftImageUrl: string | null } | null>(null);

  // 선물 정보만 서버에서 조회 (랭킹은 event.cardUsageLog에서 직접 계산)
  useEffect(() => {
    if (!event?.id) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event/card-stats?eventId=${event.id}`, {
      headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` },
    }).then(r => r.json()).then(d => setCardGiftData({ gift: d.gift || null, cardGiftImageUrl: d.cardGiftImageUrl || null })).catch(() => {});
  }, [event?.id]);

  // event.cardUsageLog에서 직접 랭킹 계산 (manualCardUser 오버라이드 포함)
  const cardRanking: CardUser[] = (() => {
    const log: any[] = event?.cardUsageLog || [];
    const countMap: Record<string, CardUser> = {};
    for (const entry of log) {
      const key = entry.userId || entry.email || entry.userName;
      if (!key) continue;
      if (!countMap[key]) countMap[key] = { userId: entry.userId || key, userName: entry.userName || entry.email || key, count: 0 };
      countMap[key].count++;
    }
    const ranking = Object.values(countMap).sort((a, b) => b.count - a.count);
    // 관리자 수동 지정: 로그에 없는 경우 상위에 삽입
    const manual = event?.manualCardUser;
    if (manual?.userName) {
      const key = manual.userId || manual.userName;
      if (!countMap[key]) {
        ranking.unshift({ userId: key, userName: manual.userName, count: manual.count ?? 1 });
      }
    }
    return ranking;
  })();
  const cardGift = cardGiftData?.gift || null;
  const cardGiftImageUrl = cardGiftData?.cardGiftImageUrl || null;
  const autoCloseCalledRef = useRef(false); // useState 대신 ref: event prop 변경 시에도 리셋 안 됨
  const zeroCountRef = useRef(0);            // 연속 0초 카운트
  const intervalRef = useRef<any>(null);
  const [autoClosing, setAutoClosing] = useState(false); // auto-close 진행 중 (unmount 방지)

  // 마지막 글 - 이벤트 시작 이후 + 실격자·참여제외자 제외 + '이벤트' 카테고리만
  const eventStartTime = event?.startedAt ? new Date(event.startedAt).getTime() : 0;
  const disqualified: string[] = event?.disqualified || [];
  const excluded: string[] = event?.excluded || [];
  const lastPost = posts.length > 0
    ? [...posts]
        .filter(p =>
          p.category === '이벤트' &&
          new Date(p.createdAt).getTime() >= eventStartTime &&
          !disqualified.includes(p.userId) &&
          !excluded.includes(p.userId)
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null
    : null;

  // 선두(이벤트 당첨 후보)와 최다카드 사용자가 동일하면 2위에게 선물, 2위 없으면 1위 그대로
  const winnerUserId = lastPost?.userId;
  const effectiveCardUser = (() => {
    if (cardRanking.length === 0) return null;
    const top = cardRanking[0];
    if (top.userId === winnerUserId && cardRanking.length > 1) return cardRanking[1];
    return top;
  })();

  // ★ 최신 event·lastPost를 ref에 항상 동기화
  // → 인터벌 콜백이 stale closure 없이 항상 최신값을 읽도록 함
  const eventRef = useRef<any>(event);
  const lastPostRef = useRef<any>(lastPost);
  eventRef.current = event;
  lastPostRef.current = lastPost;
  const onLowTimerRef = useRef(onLowTimer);
  onLowTimerRef.current = onLowTimer;
  const lowTimerFiredRef = useRef(false); // 한 번만 발화

  // calc 함수를 ref로 보관 → 외부 useEffect에서도 즉시 호출 가능
  const calcRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!event?.active) return;

    // ★ 인터벌 내부에서 ref로 최신값 읽기 → bonusCards 폴링 등으로 인한 불필요한 재생성 차단
    const calc = () => {
      const ev = eventRef.current;
      const lp = lastPostRef.current;
      if (!ev?.active) return;

      const kstHour = getKSTHour();
      const sleepStartH = ev.sleepStart ?? 0;
      const sleepEndH = ev.sleepEnd ?? 8;
      const isSleep = sleepStartH < sleepEndH
        ? kstHour >= sleepStartH && kstHour < sleepEndH
        : kstHour >= sleepStartH || kstHour < sleepEndH; // 자정 넘는 경우(예: 23~6)

      if (isSleep) {
        // 다음 sleepEnd 시각까지 남은 시간
        const now = new Date();
        const nextWake = new Date();
        nextWake.setUTCHours((sleepEndH - 9 + 24) % 24, 0, 0, 0);
        if (nextWake <= now) nextWake.setUTCDate(nextWake.getUTCDate() + 1);
        setRemaining(-Math.floor((nextWake.getTime() - now.getTime()) / 1000)); // 음수 = 휴식
        setInitialized(true);
        return;
      }

      if (!lp) {
        // 이벤트 시작 이후 글이 없으면 시작 시점부터 타이머
        // ★ 수면 시간을 제외한 실제 활성 경과 시간으로 계산
        const startTime = new Date(ev.startedAt).getTime();
        const reduction = (ev.reductionSeconds || 0) * 1000;
        const totalActiveMs = ev.durationMinutes * 60 * 1000 - reduction;
        const awakeElapsed = calcAwakeElapsedMs(startTime, sleepStartH, sleepEndH);
        const diff = Math.max(0, Math.floor((totalActiveMs - awakeElapsed) / 1000));
        setRemaining(diff);
        setInitialized(true);
        // 남은 시간 120초 미만 → 빠른 폴링 트리거 (한 번만)
        if (diff > 0 && diff <= 120 && !lowTimerFiredRef.current) { lowTimerFiredRef.current = true; onLowTimerRef.current?.(); }
        // 선두 없이 타이머 종료
        if (diff === 0 && !autoCloseCalledRef.current) {
          autoCloseCalledRef.current = true;
          // ★ 즉시 낙관적 업데이트 — 로컬 상태로 배너 즉시 표시 (API 응답 불필요)
          const optimistic = { eventId: ev.id, winnerUserName: null, prize: ev.prize, prizeImageUrl: ev.prizeImageUrl || '', eventTitle: ev.eventTitle || '', description: ev.description || '', closedAt: new Date().toISOString() };
          onAutoClose?.(ev.id, optimistic);
          // 백그라운드에서 서버 확인 (당첨자 정보 업데이트)
          fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event/auto-close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
            body: JSON.stringify({ eventId: ev.id }),
          }).then(r => r.json()).then(data => {
            if (data.winner || data.success || data.alreadyClosed) {
              onAutoClose?.(ev.id, data.winner || optimistic);
            }
          }).catch(() => {});
        }
        return;
      }

      // ★ 수면 시간을 제외한 실제 활성 경과 시간으로 계산
      const lastTime = new Date(lp.createdAt).getTime();
      const reduction = (ev.reductionSeconds || 0) * 1000;
      const totalActiveMs = ev.durationMinutes * 60 * 1000 - reduction;
      const awakeElapsed = calcAwakeElapsedMs(lastTime, sleepStartH, sleepEndH);
      const diff = Math.max(0, Math.floor((totalActiveMs - awakeElapsed) / 1000));
      setRemaining(diff);
      setInitialized(true);
      // 남은 시간 120초 미만 → 빠른 폴링 트리거 (한 번만)
      if (diff > 0 && diff <= 120 && !lowTimerFiredRef.current) { lowTimerFiredRef.current = true; onLowTimerRef.current?.(); }
      // 타이머 0 → 즉시 낙관적 업데이트 + 백그라운드 서버 확인
      if (diff === 0 && !autoCloseCalledRef.current) {
        autoCloseCalledRef.current = true;
        // ★ 즉시 낙관적 업데이트 — 로컬 lastPost 기반으로 당첨자 배너 즉시 표시
        const optimistic = { eventId: ev.id, winnerUserName: lp?.userName || null, winnerUserId: lp?.userId || null, winnerPostId: lp?.id || null, prize: ev.prize, prizeImageUrl: ev.prizeImageUrl || '', eventTitle: ev.eventTitle || '', description: ev.description || '', closedAt: new Date().toISOString() };
        onAutoClose?.(ev.id, optimistic);
        // 백그라운드에서 서버 확인 (서버 계산 당첨자로 업데이트)
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event/auto-close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken || publicAnonKey}` },
          body: JSON.stringify({ eventId: ev.id }),
        }).then(r => r.json()).then(data => {
          if (data.winner || data.success || data.alreadyClosed) {
            onAutoClose?.(ev.id, data.winner || optimistic);
          }
        }).catch(() => {});
      }
    };

    calcRef.current = calc; // ★ 외부에서 즉시 호출 가능하도록 ref에 보관
    calc();
    intervalRef.current = setInterval(calc, 1000);
    return () => clearInterval(intervalRef.current);
  // ★ event.id·active 기준으로만 인터벌 재생성 → lastPost 참조 변경으로 인한 불필요한 재생성 차단
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, event?.active]);

  // ★ 2차 방어: lastPost가 변경될 때 즉시 재계산 (1초 인터벌 딜레이 제거)
  // postsEverLoaded 게이트로 최초 마운트 시 오류는 차단됐지만,
  // 이후 posts 폴링으로 lastPost가 바뀌는 경우에도 즉시 반영
  const lastPostId = lastPost?.id ?? null;
  useEffect(() => {
    if (!initialized) return; // 아직 초기화 전이면 main useEffect가 처리
    calcRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPostId]);

  if (!event?.active) return null;
  if (!initialized) return null;

  const isSleep = remaining < 0;
  const sleepSecs = Math.abs(remaining);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // 타이머 0 → auto-close 완료 후 WinnerBanner로 전환 (완료 전까지는 "종료 중" 표시)
  if (remaining === 0) {
    return (
      <div className={`rounded-2xl overflow-hidden shadow-sm bg-white ${compact ? '' : 'mb-3'}`} style={{ border: '2px solid #fbbf24' }}>
        <div className="px-4 py-6 text-center">
          <Trophy className="w-8 h-8 text-yellow-400 animate-bounce mx-auto mb-2" />
          <p className="text-sm font-bold text-gray-800">🎉 이벤트 종료!</p>
          <p className="text-xs text-gray-500 mt-1">당첨자 확인 중...</p>
          <Loader2 className="w-5 h-5 animate-spin mx-auto mt-2 text-gray-400" />
        </div>
      </div>
    );
  }

  if (isSleep) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 mb-3 overflow-hidden shadow-sm">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5" style={{ color: '#00BCD4' }} />
              <span className="text-gray-900 font-bold text-sm">{event.eventTitle || '마지막글 이벤트'}</span>
              <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">😴 휴식중</span>
            </div>
            <div className="text-right ml-2">
              <p className="text-gray-400 text-[10px]">재개까지</p>
              <p className="font-mono font-bold text-lg" style={{ color: '#00BCD4' }}>{fmt(sleepSecs)}</p>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-gray-400 text-[10px] mb-0.5">🏆 현재 선두</p>
              <p className="text-gray-800 font-bold text-sm">
                {lastPost ? lastPost.userName : '아직 없음'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-gray-400 text-[10px] mb-0.5">상품</p>
                <p className="font-bold text-xs" style={{ color: '#00BCD4' }}>{event.prize}</p>
              </div>
              {event.prizeImageUrl && (
                <img src={event.prizeImageUrl} alt="상품" className="w-14 h-14 object-contain rounded-xl bg-white border border-gray-100 flex-shrink-0" />
              )}
            </div>
          </div>
          <p className="text-gray-400 text-[10px] mt-2 text-center">
            오전 {event.sleepEnd ?? 8}시 재개 후 타이머 시작 · 현재 선두 유지 시 당첨!
          </p>
        </div>
      </div>
    );
  }

  // 타이머 색상 - 남은 시간에 따라
  const urgent = remaining <= 300; // 5분 이하
  const veryUrgent = remaining <= 60; // 1분 이하

  const timerColor = veryUrgent ? '#ef4444' : urgent ? '#f59e0b' : '#00BCD4';
  const borderColor = veryUrgent ? '#ef4444' : urgent ? '#f59e0b' : '#00BCD4';

  return (
    <>
    <div className={`rounded-2xl mb-3 overflow-hidden shadow-sm bg-white transition-all
      ${veryUrgent ? 'animate-pulse' : ''}`}
      style={{ border: `2px solid ${borderColor}` }}>
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl leading-none font-black select-none" style={{ color: '#00BCD4', fontFamily: 'Georgia, serif', lineHeight: 1 }}>❝</span>
            <span className="text-gray-900 font-bold text-sm">{event.eventTitle || '마지막글 이벤트'}</span>
            {event.description && (
              <button onClick={() => setShowDescModal(true)}
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-black transition-colors"
                style={{ background: 'rgba(0,0,0,0.25)' }}
                title="이벤트 설명">!</button>
            )}
          </div>
          <div className="text-right ml-2 flex-shrink-0">
            <div className="font-mono font-black text-3xl tracking-tight" style={{ color: timerColor }}>
              {fmt(remaining)}
            </div>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-gray-400 text-[10px] mb-0.5">🏆 현재 선두</p>
            <p className="text-gray-800 font-bold text-sm">
              {lastPost ? lastPost.userName : '아직 없음'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-gray-400 text-[10px] mb-0.5">상품</p>
              <p className="font-bold text-xs" style={{ color: '#00BCD4' }}>{event.prize}</p>
            </div>
            {event.prizeImageUrl && (
              <img src={event.prizeImageUrl} alt="상품" className="w-14 h-14 object-contain rounded-xl bg-white border border-gray-100 flex-shrink-0" />
            )}
          </div>
        </div>
        {effectiveCardUser && (
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-gray-400 text-[10px] mb-0.5 flex items-center gap-0.5">
                <span>🃏 최다 카드</span>
                <button
                  onClick={e => { e.stopPropagation(); setShowGiftModal(true); }}
                  className="font-black leading-none hover:scale-125 transition-transform text-gray-400 hover:text-cyan-500"
                  style={{ fontFamily: 'Georgia, serif', fontSize: 13 }}
                  title="순위 보기"
                >❝</button>
              </p>
              <p className="text-gray-800 font-bold text-sm">{effectiveCardUser.userName}</p>
            </div>
            <div className="flex items-center gap-2">
              {cardGift && (
                <div className="text-right">
                  <p className="text-gray-400 text-[10px] mb-0.5">선물</p>
                  <p className="font-bold text-xs" style={{ color: '#00BCD4' }}>{cardGift}</p>
                </div>
              )}
              {cardGiftImageUrl && (
                <img src={cardGiftImageUrl} alt="선물" className="w-14 h-14 object-contain rounded-xl bg-white border border-gray-100 flex-shrink-0" />
              )}
            </div>
          </div>
        )}
        {/* 버튼 영역 */}
        {userId && (
          <div className="mt-3">
            <div className="flex gap-2">
              {/* 카드얻기 버튼 (20%) */}
              <button
                onClick={() => setShowHowToGetModal(true)}
                className="relative flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl font-bold text-xs transition-all active:scale-95 flex-shrink-0"
                style={{
                  width: '20%',
                  background: '#F0FDFF',
                  border: '1.5px solid #B2EBF2',
                  color: '#00BCD4',
                }}
              >
                <span className="text-base leading-none">🃏</span>
                <span className="text-[10px] font-bold leading-none">카드얻기</span>
              </button>
              {/* 카드 사용하기 버튼 (80%) */}
              <button
                onClick={() => {
                  if (bonusCards > 0) {
                    const isMyPost = lastPost?.userId === userId;
                    if (!isMyPost) {
                      setShowNotLeaderModal(true);
                    } else {
                      onUseCard?.();
                    }
                  } else {
                    setShowNoCardModal(true);
                  }
                }}
                className="relative flex items-center justify-center gap-2 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95 flex-1"
                style={{
                  background: bonusCards > 0 ? '#00BCD4' : '#f3f4f6',
                  border: bonusCards > 0 ? '1.5px solid #00BCD4' : '1.5px solid #e5e7eb',
                  color: bonusCards > 0 ? 'white' : '#9ca3af',
                }}
              >
                <span>⏱ -{(event.cardReductionSeconds ?? 300) >= 60 ? `${Math.round((event.cardReductionSeconds ?? 300) / 60)}분` : `${event.cardReductionSeconds ?? 300}초`} 사용하기</span>
                {bonusCards > 0
                  ? <span className="absolute right-3 bg-white text-cyan-600 text-[11px] font-black px-2 py-0.5 rounded-full">{bonusCards}장</span>
                  : <span className="absolute right-3 text-gray-400 text-[11px]">카드 없음</span>
                }
              </button>
            </div>
            {/* 카드 사용 횟수 표시 */}
            {(event.cardUsageLog?.length > 0) && (
              <p className="text-[10px] text-center mt-1" style={{ color: '#00BCD4' }}>
                🃏 시간 감축 카드 총 <span className="font-black">{event.cardUsageLog.length}회</span> 사용됨
                {(event.reductionSeconds || 0) > 0 && (
                  <span className="text-gray-400"> · -{Math.floor((event.reductionSeconds || 0) / 60)}분 {(event.reductionSeconds || 0) % 60 > 0 ? `${(event.reductionSeconds || 0) % 60}초` : ''} 적용</span>
                )}
              </p>
            )}
            <p className="text-gray-400 text-[10px] text-center mt-1.5">
              타이머가 00:00이 될 때까지 새 글이 없으면 현재 선두가 당첨!
            </p>
          </div>
        )}
        {!userId && (
          <p className="text-gray-400 text-[10px] mt-2 text-center">
            타이머가 00:00이 될 때까지 새 글이 없으면 현재 선두가 당첨! · 자정~오전8시 휴식
          </p>
        )}
      </div>
    </div>
    {showDescModal && (
      <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4" onClick={() => setShowDescModal(false)}>
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
          <div className="text-center">
            <div className="text-3xl mb-2">🏆</div>
            <h3 className="text-lg font-bold text-gray-900">{event.prize}</h3>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-gray-700 mb-2">📋 이벤트 규칙</p>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{event.description}</p>
          </div>
          <div className="text-xs text-gray-400 space-y-1">
            <p>⏱ 타이머: {event.durationMinutes}분</p>
            <p>💤 오전 {event.sleepStart ?? 0}시~오전 {event.sleepEnd ?? 8}시(KST) 타이머 자동 멈춤</p>
          </div>
          <button onClick={() => setShowDescModal(false)}
            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-700 transition-colors">
            확인
          </button>
        </div>
      </div>
    )}
    {showGiftModal && (
      <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4" onClick={() => setShowGiftModal(false)}>
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
          <div className="text-center">
            <div className="text-3xl mb-2">🃏</div>
            <h3 className="text-lg font-bold text-gray-900">카드 사용 순위</h3>
          </div>
          {cardRanking.length > 0 ? (
            <div className="space-y-1.5">
              {cardRanking.slice(0, 5).map((u, i) => {
                const isWinner = u.userId === winnerUserId;
                const isEffective = u.userId === effectiveCardUser?.userId;
                return (
                  <div key={u.userId} className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-xl ${isEffective && cardGift ? 'bg-cyan-50 border border-cyan-200' : 'bg-gray-50'}`}>
                    <span className={`font-medium ${isEffective && cardGift ? 'text-cyan-700' : 'text-gray-700'}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {u.userName}
                      {isWinner && <span className="ml-1 text-[10px] text-amber-500 font-bold">선두</span>}
                    </span>
                    <span className={`font-bold text-xs ${isEffective && cardGift ? 'text-cyan-600' : 'text-gray-500'}`}>{u.count}회</span>
                  </div>
                );
              })}
              {cardRanking[0]?.userId === winnerUserId && effectiveCardUser && (
                <p className="text-[11px] text-gray-400 text-center pt-1">1위가 선두여서 2위에게 선물 증정</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center">아직 카드 사용 내역이 없어요</p>
          )}
          {cardGift && effectiveCardUser && (
            <div className="bg-cyan-50 rounded-xl p-4">
              <p className="text-xs text-cyan-600 font-bold mb-1 text-center">🎁 {effectiveCardUser.userName}님 선물</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line text-center">{cardGift}</p>
            </div>
          )}
          <button onClick={() => setShowGiftModal(false)}
            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-700 transition-colors">
            확인
          </button>
        </div>
      </div>
    )}
    {showNoCardModal && (
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setShowNoCardModal(false)}>
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom: '1px solid #f0f0f0' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3" style={{ background: 'linear-gradient(135deg, #E0F7FA, #B2EBF2)' }}>🃏</div>
            <h3 className="text-base font-bold text-gray-900">보너스카드가 없어요</h3>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              카드 1장으로 타이머를 <span className="font-bold" style={{ color: '#00BCD4' }}>{(() => { const s = event?.cardReductionSeconds ?? 300; return s >= 60 ? `${Math.round(s/60)}분` : `${s}초`; })()}</span> 줄일 수 있어요
            </p>
          </div>

          <div className="px-6 py-4 space-y-2.5">
            {/* 친구 추천 */}
            <div className="rounded-2xl p-3.5" style={{ background: '#F0FDFF', border: '1px solid #B2EBF2' }}>
              <p className="text-xs font-bold mb-1.5 flex items-center gap-1.5" style={{ color: '#00BCD4' }}>
                <Link className="w-3.5 h-3.5" /> 친구 추천 초대
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                내 링크로 친구가 가입하면 나에게&nbsp;
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-white text-[11px] font-black" style={{ background: '#00BCD4' }}>
                  🃏 3장
                </span>
                &nbsp;자동 지급!
              </p>
            </div>

            {/* 활동 보상 */}
            <div className="rounded-2xl p-3.5" style={{ background: '#F0FDFF', border: '1px solid #B2EBF2' }}>
              <p className="text-xs font-bold mb-1.5 flex items-center gap-1.5" style={{ color: '#00BCD4' }}>
                <Gift className="w-3.5 h-3.5" /> 활동하다 보면 랜덤 지급!
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                글을 쓰거나 댓글을 달다 보면&nbsp;
                <span className="font-bold" style={{ color: '#00BCD4' }}>랜덤으로</span>&nbsp;카드가 뜰 수도 있어요 🃏
              </p>
            </div>

            {/* 레벨업 보상 */}
            <div className="rounded-2xl p-3.5" style={{ background: '#FAFAFA', border: '1px solid #EEEEEE' }}>
              <p className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" style={{ color: '#00BCD4' }} /> 레벨업 보상
              </p>
              <p className="text-xs text-gray-400 mb-2">활동 포인트로 레벨업하면 카드 지급!</p>
              <div className="flex flex-wrap gap-1">
                {[['애기','3장'],['유아','5장'],['보린이','8장'],['대딩','10장'],['회사원','15장'],['원로','20장']].map(([lv, n]) => (
                  <span key={lv} className="text-[10px] bg-white border rounded-full px-2 py-0.5 font-medium text-gray-600" style={{ borderColor: '#B2EBF2' }}>
                    {lv} <span className="font-black" style={{ color: '#00BCD4' }}>{n}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="px-6 pb-6 space-y-2">
            <button
              onClick={() => { setShowNoCardModal(false); setShowReferralModal(true); }}
              className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{ background: '#00BCD4' }}
            >
              <Copy className="w-4 h-4" /> 추천인 코드 복사하기
            </button>
            <button
              onClick={() => setShowNoCardModal(false)}
              className="w-full py-2.5 rounded-2xl text-sm text-gray-400 font-medium hover:bg-gray-50 transition-colors border border-gray-100"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    )}
    {/* 선두 아님 확인 모달 */}
    {showNotLeaderModal && (
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setShowNotLeaderModal(false)}>
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom: '1px solid #f0f0f0' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3" style={{ background: 'linear-gradient(135deg, #FFF8E1, #FFE082)' }}>⚠️</div>
            <h3 className="text-base font-bold text-gray-900">현재 선두가 아닌데요</h3>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              지금 선두는 <span className="font-bold text-gray-700">{lastPost ? lastPost.userName : '없음'}</span>님이에요.<br/>
              카드를 쓰면 타이머가 30초 줄어 선두에게 유리해져요.
            </p>
          </div>
          <div className="px-6 py-4">
            <div className="rounded-2xl px-4 py-3 text-xs text-center font-medium" style={{ background: '#F0FDFF', color: '#00BCD4', border: '1px solid #B2EBF2' }}>
              그래도 카드를 사용하시겠어요?
            </div>
          </div>
          <div className="px-6 pb-6 flex gap-2">
            <button
              onClick={() => setShowNotLeaderModal(false)}
              className="flex-1 py-2.5 rounded-2xl text-sm text-gray-400 font-medium border border-gray-100 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => {
                setShowNotLeaderModal(false);
                onUseCard?.();
              }}
              className="flex-1 py-2.5 rounded-2xl text-sm text-white font-bold transition-all active:scale-95"
              style={{ background: '#00BCD4' }}
            >
              🃏 사용하기
            </button>
          </div>
        </div>
      </div>
    )}
    {/* 카드얻기 방법 모달 (카드 유무 무관 항상 볼 수 있음) */}
    {showHowToGetModal && (
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" onClick={() => setShowHowToGetModal(false)}>
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom: '1px solid #f0f0f0' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3" style={{ background: 'linear-gradient(135deg, #E0F7FA, #B2EBF2)' }}>🃏</div>
            <h3 className="text-base font-bold text-gray-900">보너스카드 얻는 방법</h3>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              카드 1장으로 타이머를 <span className="font-bold" style={{ color: '#00BCD4' }}>{(() => { const s = event?.cardReductionSeconds ?? 300; return s >= 60 ? `${Math.round(s/60)}분` : `${s}초`; })()}</span> 줄일 수 있어요
            </p>
          </div>
          <div className="px-6 py-4 space-y-2.5">
            <div className="rounded-2xl p-3.5" style={{ background: '#F0FDFF', border: '1px solid #B2EBF2' }}>
              <p className="text-xs font-bold mb-1.5 flex items-center gap-1.5" style={{ color: '#00BCD4' }}>
                <Link className="w-3.5 h-3.5" /> 친구 추천 초대
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                내 링크로 친구가 가입하면 나에게&nbsp;
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-white text-[11px] font-black" style={{ background: '#00BCD4' }}>🃏 3장</span>
                &nbsp;자동 지급!
              </p>
            </div>
            <div className="rounded-2xl p-3.5" style={{ background: '#F0FDFF', border: '1px solid #B2EBF2' }}>
              <p className="text-xs font-bold mb-1.5 flex items-center gap-1.5" style={{ color: '#00BCD4' }}>
                <Gift className="w-3.5 h-3.5" /> 활동하다 보면 랜덤 지급!
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                글을 쓰거나 댓글을 달다 보면&nbsp;
                <span className="font-bold" style={{ color: '#00BCD4' }}>랜덤으로</span>&nbsp;카드가 뜰 수도 있어요 🃏
              </p>
            </div>
            <div className="rounded-2xl p-3.5" style={{ background: '#FAFAFA', border: '1px solid #EEEEEE' }}>
              <p className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" style={{ color: '#00BCD4' }} /> 레벨업 보상
              </p>
              <p className="text-xs text-gray-400 mb-2">활동 포인트로 레벨업하면 카드 지급!</p>
              <div className="flex flex-wrap gap-1">
                {[['애기','3장'],['유아','5장'],['보린이','8장'],['대딩','10장'],['회사원','15장'],['원로','20장']].map(([lv, n]) => (
                  <span key={lv} className="text-[10px] bg-white border rounded-full px-2 py-0.5 font-medium text-gray-600" style={{ borderColor: '#B2EBF2' }}>
                    {lv} <span className="font-black" style={{ color: '#00BCD4' }}>{n}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="px-6 pb-6 space-y-2">
            <button
              onClick={() => { setShowHowToGetModal(false); setShowReferralModal(true); }}
              className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{ background: '#00BCD4' }}
            >
              <Copy className="w-4 h-4" /> 추천인 코드 복사하기
            </button>
            <button
              onClick={() => setShowHowToGetModal(false)}
              className="w-full py-2.5 rounded-2xl text-sm text-gray-400 font-medium hover:bg-gray-50 transition-colors border border-gray-100"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    )}
      {showReferralModal && accessToken && (
        <ReferralLinkModal
          accessToken={accessToken}
          onClose={() => setShowReferralModal(false)}
        />
      )}
    </>
  );
}

function getKSTHour() {
  const now = new Date();
  return (now.getUTCHours() + 9) % 24;
}

// 수면 구간을 제외한 실제 활성 경과 시간(ms) 계산
// sinceMs 이후부터 지금까지 "깨어있는 시간"만 누적
function calcAwakeElapsedMs(sinceMs: number, sleepStartH: number, sleepEndH: number): number {
  let elapsed = 0;
  let cursor = sinceMs;
  const now = Date.now();
  const maxIter = 30 * 24;
  let iter = 0;
  while (cursor < now && iter++ < maxIter) {
    const cursorKST = (new Date(cursor).getUTCHours() + 9) % 24;
    const inSleep = sleepStartH < sleepEndH
      ? cursorKST >= sleepStartH && cursorKST < sleepEndH
      : cursorKST >= sleepStartH || cursorKST < sleepEndH;
    if (inSleep) {
      const nextWakeUTCHour = (sleepEndH - 9 + 24) % 24;
      const nextWake = new Date(cursor);
      nextWake.setUTCHours(nextWakeUTCHour, 0, 0, 0);
      if (nextWake.getTime() <= cursor) nextWake.setUTCDate(nextWake.getUTCDate() + 1);
      cursor = Math.min(nextWake.getTime(), now);
    } else {
      const sleepStartUTCHour = (sleepStartH - 9 + 24) % 24;
      const nextSleep = new Date(cursor);
      nextSleep.setUTCHours(sleepStartUTCHour, 0, 0, 0);
      if (nextSleep.getTime() <= cursor) nextSleep.setUTCDate(nextSleep.getUTCDate() + 1);
      const awakeUntil = Math.min(nextSleep.getTime(), now);
      elapsed += awakeUntil - cursor;
      cursor = awakeUntil;
    }
  }
  return elapsed;
}

// ── 카드 사용 내역 토글 ──
function CardLogsToggle({ logs }: { logs: { usedAt: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 mx-auto text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
        <span>🃏 카드 사용 시간 내역</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 9l-7 7-7-7"/></svg>
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-4 gap-1 px-4">
          {logs.map((log, i) => (
            <span key={i} className="text-[10px] text-gray-400 text-center bg-gray-50 rounded-lg py-1">
              {new Date(log.usedAt).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 당첨 배너 (서버 저장 기반, 3시간 유지) ──
function WinnerBanner({ winner, userId, accessToken, isAdmin = false, onAdminClose }: { winner: any; userId?: string | null; accessToken?: string; isAdmin?: boolean; onAdminClose?: (eventId: string) => void }) {
  const [congrats, setCongrats] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [congratsExpanded, setCongratsExpanded] = useState(false);
  const [expiryLeft, setExpiryLeft] = useState('');
  const [closing, setClosing] = useState(false);
  const [cardStats, setCardStats] = useState<{ gift: string | null; cardGiftImageUrl: string | null; ranking: { userId: string; userName: string; count: number }[] } | null>(null);

  useEffect(() => {
    if (!winner?.eventId) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event/card-stats?eventId=${winner.eventId}`, {
      headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` },
    }).then(r => r.json()).then(d => setCardStats({ gift: d.gift || null, cardGiftImageUrl: d.cardGiftImageUrl || null, ranking: d.ranking || [] })).catch(() => {});
  }, [winner?.eventId]);

  const cardGiftForWinner = cardStats?.gift || null;
  const cardGiftImageUrlForWinner = cardStats?.cardGiftImageUrl || null;
  const cardRankingForWinner = cardStats?.ranking || [];
  const effectiveCardGiftUser = cardRankingForWinner.find(u => u.userId !== winner?.winnerUserId) || null;

  // 만료까지 남은 시간
  useEffect(() => {
    const calc = () => {
      const THREE_HOURS = 3 * 60 * 60 * 1000;
      const elapsed = Date.now() - new Date(winner.closedAt).getTime();
      const leftMs = Math.max(0, THREE_HOURS - elapsed);
      const h = Math.floor(leftMs / 3600000);
      const m = Math.floor((leftMs % 3600000) / 60000);
      setExpiryLeft(h > 0 ? `${h}시간 ${m}분` : `${m}분`);
    };
    calc();
    const t = setInterval(calc, 30000);
    return () => clearInterval(t);
  }, [winner.closedAt]);

  const loadCongrats = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/event-congrats/${winner.eventId}`,
        { headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` } }
      );
      if (res.ok) setCongrats(await res.json());
    } catch {}
  };

  useEffect(() => {
    loadCongrats();
    const t = setInterval(loadCongrats, 15000);
    return () => clearInterval(t);
  }, [winner.eventId, accessToken]);

  const submitCongrats = async () => {
    if (!input.trim() || !accessToken) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/event-congrats/${winner.eventId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ content: input.trim() }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setCongrats(prev => [...prev, data.comment]);
        setInput('');
        setCongratsExpanded(true);
        toast.success('축하 댓글을 남겼어요! 🎉');
      } else {
        toast.error('댓글 작성 실패');
      }
    } catch {
      toast.error('오류가 발생했어요');
    }
    setSubmitting(false);
  };

  const handleAdminClose = async () => {
    if (!confirm('이 당첨 배너를 닫을까요? 모든 유저에게 즉시 사라집니다.')) return;
    setClosing(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/event-winner/${winner.eventId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        toast.success('배너를 닫았어요');
        onAdminClose?.(winner.eventId);
      } else {
        toast.error('닫기 실패');
      }
    } catch {
      toast.error('오류 발생');
    }
    setClosing(false);
  };

  const hasWinner = !!winner.winnerUserName;
  const SHOW_COUNT = 3;

  return (
    <div className="rounded-2xl overflow-hidden shadow-md mb-3 bg-white" style={{ border: '2px solid #fbbf24' }}>
      <div className="px-5 py-4">
        {/* 헤더 */}
        <div className="text-center mb-4 relative">
          {isAdmin && (
            <button
              onClick={handleAdminClose}
              disabled={closing}
              title="배너 닫기 (관리자 전용)"
              className="absolute top-0 right-0 flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              {closing ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              <span>배너 닫기</span>
            </button>
          )}
          <div className="flex justify-center mb-2">
            <Trophy className="w-8 h-8 text-yellow-400 animate-bounce" />
          </div>
          <p className="text-xs font-bold tracking-widest mb-1" style={{ color: '#00BCD4' }}>
            🎉 {winner.eventTitle || '마지막글 이벤트'} 종료 · 당첨!
          </p>
          {hasWinner ? (
            <>
              <p className="text-gray-900 font-black text-2xl">{winner.winnerUserName}</p>
              <p className="text-gray-500 text-sm mt-0.5">님 축하드립니다! 🎊</p>
            </>
          ) : (
            <p className="text-gray-500 text-sm">이벤트가 종료되었어요 (당첨자 없음)</p>
          )}
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 inline-flex items-center gap-3">
            <div className="text-left">
              <p className="text-xs text-amber-600 font-medium">🏆 상품</p>
              <p className="font-bold text-sm text-gray-900 mt-0.5">{winner.prize}</p>
            </div>
            {winner.prizeImageUrl && (
              <img src={winner.prizeImageUrl} alt="상품" className="w-14 h-14 object-contain rounded-xl bg-white border border-amber-100 flex-shrink-0" />
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">배너는 {expiryLeft} 후 사라집니다</p>
          {(winner.cardUsedCount || winner.startedAt) && (
            <div className="mt-2 flex justify-center gap-3 text-[11px] text-gray-400">
              {winner.startedAt && (
                <span>⏱ {new Date(winner.startedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} ~ {new Date(winner.closedAt).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {winner.cardUsedCount > 0 && (
                <span>🃏 카드 {winner.cardUsedCount}장 사용</span>
              )}
            </div>
          )}
          {winner.cardUsedLogs?.length > 0 && (
            <CardLogsToggle logs={winner.cardUsedLogs} />
          )}
          {effectiveCardGiftUser && (cardGiftForWinner || cardGiftImageUrlForWinner) && (
            <div className="mt-3 bg-cyan-50 border border-cyan-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] text-cyan-600 font-bold mb-0.5">🃏 최다 카드</p>
                <p className="text-sm font-black text-gray-800">{effectiveCardGiftUser.userName}</p>
                {cardRankingForWinner[0]?.userId === winner?.winnerUserId && (
                  <p className="text-[10px] text-gray-400 mt-0.5">1위가 선두 당첨자여서 2위에게 증정</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {cardGiftForWinner && (
                  <div className="text-right">
                    <p className="text-[10px] text-cyan-500 mb-0.5">선물</p>
                    <p className="font-bold text-xs text-gray-800">{cardGiftForWinner}</p>
                  </div>
                )}
                {cardGiftImageUrlForWinner && (
                  <img src={cardGiftImageUrlForWinner} alt="선물" className="w-14 h-14 object-contain rounded-xl bg-white border border-cyan-200 flex-shrink-0" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* 축하 댓글 영역 */}
        <div className="border-t border-gray-100 pt-3 mt-1">
          <button
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-2 hover:text-gray-700"
            onClick={() => setCongratsExpanded(p => !p)}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            축하 댓글 {congrats.length > 0 ? `${congrats.length}개` : ''}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${congratsExpanded ? 'rotate-180' : ''}`} />
          </button>

          {/* 최신 댓글 3개 항상 표시 */}
          {!congratsExpanded && congrats.length > 0 && (
            <div className="space-y-2 mb-2">
              {congrats.slice(-3).map(c => (
                <div key={c.id} className="flex items-start gap-2">
                  {c.userAvatar ? (
                    <img src={c.userAvatar} className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ background: '#00BCD4' }}>
                      {c.userName?.[0] || '?'}
                    </div>
                  )}
                  <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-xs font-bold text-gray-800 mr-1.5">{c.userName}</span>
                    <span className="text-xs text-gray-600">{c.content}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {congratsExpanded && (
            <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
              {congrats.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">첫 번째 축하 댓글을 남겨보세요! 🎉</p>
              ) : (
                congrats.map(c => (
                  <div key={c.id} className="flex items-start gap-2">
                    {c.userAvatar ? (
                      <img src={c.userAvatar} className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold" style={{ background: '#00BCD4' }}>
                        {c.userName?.[0] || '?'}
                      </div>
                    )}
                    <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                      <span className="text-xs font-bold text-gray-800 mr-1.5">{c.userName}</span>
                      <span className="text-xs text-gray-600">{c.content}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 댓글 입력 */}
          {userId ? (
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCongrats(); } }}
                placeholder="🎉 당첨자에게 축하 한마디!"
                className="flex-1 h-9 px-3 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ ['--tw-ring-color' as any]: '#00BCD4' }}
              />
              <button
                onClick={submitCongrats}
                disabled={submitting || !input.trim()}
                className="px-3 h-9 rounded-xl text-white text-xs font-bold disabled:opacity-50 transition-colors flex-shrink-0"
                style={{ background: '#00BCD4' }}
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '전송'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-1">로그인 후 축하 댓글을 남길 수 있어요</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function FeedPage({ accessToken, userId, userEmail, ownedGames = [], onViewProfile, highlightPostId, onHighlightClear, openComposer, onComposerClose, isAdmin = false, onCommentingChange, onGameClick, onGuestAction, wishlistGames = [], onAddToWishlist, onRemoveFromWishlist }: FeedPageProps) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [lastPostEvents, setLastPostEvents] = useState<any[]>([]);
  const [eventFastPoll, setEventFastPoll] = useState(false); // 타이머 < 120s일 때 3s 빠른 폴링
  const [referralRankEvent, setReferralRankEvent] = useState<any>(null);
  const [eventWinners, setEventWinners] = useState<any[]>([]);
  const [bonusCards, setBonusCards] = useState(0);
  const [loading, setLoading] = useState(true);
  // ★ posts가 최초 1회 이상 로드됐는지 추적 → 배너 초기화 타이밍 제어
  const [postsEverLoaded, setPostsEverLoaded] = useState(false);
  const [postsFetchKey, setPostsFetchKey] = useState(0); // loadPosts 완료마다 +1
  const [category, setCategory] = useState<string>('전체');
  const [subCategory, setSubCategory] = useState<string | null>(null);
  const [showSubSheet, setShowSubSheet] = useState(false); // 모바일 바텀시트
  const [showCategories, setShowCategories] = useState(false); // 카테고리 바 펼침
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showSubPicker, setShowSubPicker] = useState<string | null>(null); // 하위 카테고리 드롭다운
  const [showComposer, setShowComposer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [composerCategory, setComposerCategory] = useState<string | undefined>(undefined);
  const [hwCategories, setHwCategories] = useState<{ id: string; name: string; guideline: string; pointReward: number; prizeReward?: string; startDate?: string; endDate?: string; active?: boolean }[]>([]);
  const [allHwCategories, setAllHwCategories] = useState<{ id: string; name: string; endDate?: string; active?: boolean }[]>([]);
  const [hwWinner, setHwWinner] = useState<{ userName: string; category: string; prizeReward: string; isWinner: boolean; isAdmin?: boolean; emailClaimed: boolean; email?: string; selectedAt: string } | null>(null);
  const [showWinnerEmailModal, setShowWinnerEmailModal] = useState(false);
  const [winnerEmail, setWinnerEmail] = useState('');
  const [winnerEmailSubmitting, setWinnerEmailSubmitting] = useState(false);
  const [showHwSelectModal, setShowHwSelectModal] = useState(false);
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<Set<string>>(new Set());
  const [hwSlideIndex, setHwSlideIndex] = useState(0);
  const [displayedPostsCount, setDisplayedPostsCount] = useState(20);
  const [eventCategoryNotice, setEventCategoryNotice] = useState<{ content: string; title: string; updatedAt: string } | null>(null);
  const [showEventRulesModal, setShowEventRulesModal] = useState(false);
  // 댓글창 열린 포스트 ID 추적 (폴링 중 state 보호용)
  const openCommentPostIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (openComposer) { setShowComposer(true); onComposerClose?.(); }
  }, [openComposer]);

  // 이벤트 카테고리 공지 로딩
  useEffect(() => {
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/event-category-notice`,
      { headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.notice) setEventCategoryNotice(d.notice);
    }).catch(() => {});
  }, [accessToken]);

  // 숙제 카테고리 로딩
  useEffect(() => {
    if (!accessToken) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/homework/categories`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.categories) {
        setAllHwCategories(d.categories);
        setHwCategories(d.categories.filter((c: any) => c.active));
      }
    // 당첨자 조회
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/homework/winner`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.winner) setHwWinner(d.winner);
    }).catch(() => {});
    }).catch(() => {});
  }, [accessToken]);

  // 숙제 슬라이드 자동 전환 (3초)
  useEffect(() => {
    if (hwCategories.length <= 1) return;
    const timer = setInterval(() => {
      setHwSlideIndex(prev => (prev + 1) % hwCategories.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [hwCategories.length]);
  useEffect(() => {
    if (!accessToken) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bookmarks`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.postIds) setBookmarkedPostIds(new Set(d.postIds));
    }).catch(() => {});
  }, [accessToken]);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [userProfile, setUserProfile] = useState<{ username: string; profileImage?: string } | null>(null);
  const [myPoints, setMyPoints] = useState<{ points: number; posts: number; comments: number; likesReceived: number }>({ points: 0, posts: 0, comments: 0, likesReceived: 0 });

  const userName = userProfile?.username || userEmail?.split('@')[0] || '회원';
  const avatarUrl = userProfile?.profileImage;

  // 사용자 프로필 로드
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/user/profile`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.profile) {
            setUserProfile({
              username: data.profile.username || data.profile.name || userEmail?.split('@')[0] || '회원',
              profileImage: data.profile.profileImage
            });
          }
        }
      } catch (error) {
        console.error('Failed to load user profile:', error);
      }
    };
    loadUserProfile();
  }, [accessToken, userEmail]);

  const loadPosts = useCallback(async (silent = false, openCommentPostIds: Set<string> = new Set()) => {
    try {
      // 부모 카테고리(정보/질문)는 서버 필터 없이 전체 조회 후 클라이언트에서 필터링
      // 서브카테고리가 선택된 경우 해당 서브카테고리로 서버 필터링
      const parentCatsWithSubs = Object.keys(SUBCATEGORIES);
      const effectiveCat = subCategory || category;
      const shouldFilter = effectiveCat !== '전체' && effectiveCat !== '이벤트' && category !== '숙제' && !parentCatsWithSubs.includes(effectiveCat);
      const q = shouldFilter ? `?category=${encodeURIComponent(effectiveCat)}` : '';
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts${q}`,
        { headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const incoming: FeedPost[] = data.posts || [];
        setPosts(incoming);
      }
    } catch {}
    if (!silent) setLoading(false);
    // ★ posts 첫 로드 완료 마킹 (이후 배너 렌더 허용)
    setPostsEverLoaded(true);
    setPostsFetchKey(k => k + 1);
  }, [category, subCategory, accessToken]);

  // ── 낙관적 업데이트 함수들 ──
  const optimisticDeletePost = useCallback((postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  }, []);

  const optimisticLike = useCallback((postId: string, uid: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const likes = p.likes || [];
      const already = likes.includes(uid);
      return { ...p, likes: already ? likes.filter(id => id !== uid) : [...likes, uid] };
    }));
  }, []);

  const optimisticAddComment = useCallback((postId: string, comment: any) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return { ...p, comments: [...(p.comments || []), comment] };
    }));
  }, []);

  const optimisticDeleteComment = useCallback((postId: string, commentId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return { ...p, comments: (p.comments || []).filter(c => c.id !== commentId) };
    }));
  }, []);

  useEffect(() => {
    setLoading(true); loadPosts();
  }, [category, subCategory]);

  // 피드 로드 후 현재 유저의 좋아요 초기 상태를 서버(캐시 우회)에서 재확인
  // 기존 토글 로직은 변경하지 않음 — 초기 상태 보정 전용
  useEffect(() => {
    if (!userId || !accessToken || accessToken.split('.').length !== 3) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/my-liked-ids`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.likedPostIds) return;
        const likedSet = new Set<string>(d.likedPostIds);
        setPosts(prev => prev.map(p => {
          const shouldBeLiked = likedSet.has(p.id);
          const currentlyLiked = (p.likes || []).includes(userId);
          if (shouldBeLiked === currentlyLiked) return p;
          return {
            ...p,
            likes: shouldBeLiked
              ? [...(p.likes || []), userId]
              : (p.likes || []).filter(id => id !== userId),
          };
        }));
      })
      .catch(() => {});
  }, [postsFetchKey, userId, accessToken]); // postsFetchKey: loadPosts 완료마다 재확인

  // 보너스카드 조회
  const loadBonusCards = async () => {
    // accessToken이 없거나 JWT 형식(헤더.페이로드.서명)이 아니면 skip → 401 방지
    if (!accessToken || accessToken.split('.').length !== 3) return;
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bonus-cards/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBonusCards(typeof data.cards === 'number' ? data.cards : (parseInt(data.cards) || 0));
      } else if (res.status !== 401) {
        // 401은 세션 만료 등 정상적인 미인증 상태이므로 warn 생략
        console.warn('[보너스카드] 응답 오류:', res.status);
      }
    } catch (e) {
      console.error('[보너스카드] fetch 오류:', e);
    }
  };

  // 보너스카드 사용 → 타이머 -30초
  const handleUseCard = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bonus-cards/use`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        // 서버에서 반환된 값으로 즉시 반영 후, 서버와 재동기화
        setBonusCards(typeof data.cards === 'number' ? data.cards : 0);
        // 서버에서 반환된 업데이트된 이벤트로 즉시 타이머 반영
        if (data.updatedEvent) {
          setLastPostEvents(prev =>
            prev.map(e => e.id === data.updatedEvent.id ? data.updatedEvent : e)
          );
        }
        const secs: number = data.updatedEvent?.cardReductionSeconds ?? 300;
        const reductionLabel = secs >= 60 ? `${Math.round(secs / 60)}분` : `${secs}초`;
        toast.success(`⏱ 타이머가 ${reductionLabel} 줄었어요!`);
        // 서버와 재동기화 (정확한 카드 수 보장)
        setTimeout(() => loadBonusCards(), 500);
      } else {
        const d = await res.json().catch(() => ({}));
        console.error('[카드사용] 실패:', res.status, d);
        toast.error(d.error || '카드 사용 실패');
        // 실패 시에도 서버 상태로 재동기화
        loadBonusCards();
      }
    } catch (e) {
      console.error('[카드사용] 오류:', e);
      toast.error('카드 사용 중 오류가 발생했어요');
    }
  };

  // 마지막글 이벤트 폴링 (60초마다)
  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event`,
          { headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setLastPostEvents(Array.isArray(data) ? data.filter((e: any) => e.active) : (data?.active ? [data] : []));
        }
      } catch {}
    };
    fetchEvent();
    // 타이머 120초 미만이면 3초, 아니면 15초 폴링
    const interval = eventFastPoll ? 3000 : 15000;
    const t = setInterval(fetchEvent, interval);
    return () => clearInterval(t);
  }, [accessToken, eventFastPoll]);

  // 추천인 랭킹 이벤트 폴링 (60초마다)
  useEffect(() => {
    const fetchReferralEvent = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/referral-rank-event`,
          { headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` } }
        );
        if (res.ok) { const d = await res.json(); setReferralRankEvent(d?.active ? d : null); }
      } catch {}
    };
    fetchReferralEvent();
    const t = setInterval(fetchReferralEvent, 60000);
    return () => clearInterval(t);
  }, [accessToken]);

  // 당첨자 배너 폴링 (30초마다)
  useEffect(() => {
    const fetchWinners = async () => {
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event/winner`,
          { headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setEventWinners(Array.isArray(data) ? data : []);
        }
      } catch {}
    };
    fetchWinners();
    const t = setInterval(fetchWinners, 10000); // 10초마다 폴링 (당첨 배너 빠른 감지)
    return () => clearInterval(t);
  }, [accessToken]);

  // 보너스카드 폴링 (15초마다) + 탭 포커스 즉시 갱신
  useEffect(() => {
    loadBonusCards();
    if (!accessToken || accessToken.split('.').length !== 3) return;
    const t = setInterval(loadBonusCards, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') loadBonusCards(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [accessToken]);

  // 실시간 폴링: 5초마다 갱신
  useEffect(() => {
    const interval = setInterval(() => {
      loadPosts(true, openCommentPostIdsRef.current);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadPosts]);

  // 하이라이트 게시물로 스크롤 + SEO 메타태그 업데이트
  useEffect(() => {
    if (!highlightPostId || loading) return;
    // SEO: 해당 게시물의 메타태그 동적 설정
    const targetPost = posts.find(p => p.id === highlightPostId);
    if (targetPost) {
      const gameName = targetPost.linkedGame?.name || targetPost.linkedGames?.[0]?.name;
      const firstImage = targetPost.images?.[0];
      updatePostSEO(targetPost.id, targetPost.content, gameName, firstImage);
      // URL도 /post/:id 형태로 업데이트
      const postUrl = `/post/${targetPost.id}`;
      if (window.location.pathname !== postUrl) {
        window.history.replaceState({ post: targetPost.id }, '', postUrl);
      }
    }
    const el = document.getElementById(`post-${highlightPostId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2');
        onHighlightClear?.();
      }, 2500);
    }
  }, [highlightPostId, loading, posts]);

  // 자동 종료 콜백: 당첨자 즉시 반영 (낙관적 업데이트 → 서버 확인 업데이트 순으로 두 번 호출됨)
  const handleAutoClose = (eventId: string, winner: any) => {
    setLastPostEvents(prev => prev.filter(e => e.id !== eventId));
    setEventWinners(prev => {
      // 기존 항목 replace (낙관적 → 서버 확인 업데이트 허용)
      const filtered = prev.filter(w => w.eventId !== eventId);
      return [...filtered, winner];
    });
  };

  const handleCategoryClick = useCallback((cat: string) => {
    const parentEntry = Object.entries(SUBCATEGORIES).find(([, subs]) => subs.includes(cat));
    if (parentEntry) {
      setCategory(parentEntry[0]);
      setSubCategory(cat);
    } else {
      setCategory(cat);
      setSubCategory(null);
    }
    setShowSubPicker(null);
    setShowCategories(false);
  }, []);

  // ── Pull-to-Refresh ──────────────────────────────────────────────────────
  const [ptrDistance, setPtrDistance] = useState(0);
  const [ptrRefreshing, setPtrRefreshing] = useState(false);
  const ptrStartY = useRef(0);
  const ptrActive = useRef(false);
  const ptrDistRef = useRef(0);
  const ptrRefreshingRef = useRef(false);
  const loadPostsRef = useRef(loadPosts);
  useEffect(() => { loadPostsRef.current = loadPosts; }, [loadPosts]);

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const THRESHOLD = 65;
    const MAX = 72;

    const onStart = (e: TouchEvent) => {
      if (root.scrollTop > 2 || ptrRefreshingRef.current) return;
      ptrStartY.current = e.touches[0].clientY;
      ptrActive.current = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!ptrActive.current || ptrRefreshingRef.current) return;
      const dy = e.touches[0].clientY - ptrStartY.current;
      if (dy <= 0) { ptrActive.current = false; ptrDistRef.current = 0; setPtrDistance(0); return; }
      const d = Math.min(dy * 0.45, MAX);
      ptrDistRef.current = d;
      setPtrDistance(d);
    };
    const onEnd = () => {
      if (!ptrActive.current) return;
      ptrActive.current = false;
      if (ptrDistRef.current >= THRESHOLD) {
        setPtrRefreshing(true);
        ptrRefreshingRef.current = true;
        setPtrDistance(MAX);
        ptrDistRef.current = MAX;
        loadPostsRef.current(true).finally(() => {
          ptrRefreshingRef.current = false;
          setPtrRefreshing(false);
          setPtrDistance(0);
          ptrDistRef.current = 0;
        });
      } else {
        setPtrDistance(0);
        ptrDistRef.current = 0;
      }
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: true });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);
    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
    };
  }, []); // 한 번만 등록 — 가변 값은 모두 ref로 접근
  // ─────────────────────────────────────────────────────────────────────────

  const handleFollowToggle = async (targetId: string) => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/follow/${targetId}`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setFollowingMap(prev => ({ ...prev, [targetId]: data.following }));
        toast.success(data.following ? '팔로우했어요!' : '언팔로우했어요');
      }
    } catch { toast.error('팔로우 실패'); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {/* Pull-to-Refresh 인디케이터 */}
      <div
        className="flex justify-center items-center overflow-hidden transition-all duration-200"
        style={{ height: ptrRefreshing ? 48 : ptrDistance > 4 ? ptrDistance : 0 }}>
        {ptrRefreshing ? (
          <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
        ) : (
          <svg
            className="w-5 h-5 text-gray-400 transition-transform duration-150"
            style={{ transform: ptrDistance >= 65 ? 'rotate(180deg)' : 'rotate(0deg)' }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        )}
      </div>
      {/* 당첨 배너 (3시간 유지) */}
      {eventWinners.map((w: any) => (
        <WinnerBanner
          key={w.eventId + w.closedAt}
          winner={w}
          userId={userId}
          accessToken={accessToken}
          isAdmin={isAdmin}
          onAdminClose={(eventId) => setEventWinners(prev => prev.filter(x => x.eventId !== eventId))}
        />
      ))}

      {/* 마지막글 이벤트 배너 - 2열 그리드 */}
      {/* ★ postsEverLoaded: posts 첫 fetch 완료 전엔 배너를 마운트하지 않음 */}
      {/* → 이벤트 데이터가 posts보다 먼저 도착해 lastPost=null로 잘못된 타이머를 계산하는 버그 방지 */}
      {postsEverLoaded && lastPostEvents.length > 0 && (
        <div className={lastPostEvents.filter((evt: any) => !eventWinners.some((w: any) => w.eventId === evt.id)).length >= 2 ? 'grid grid-cols-2 gap-2' : ''}>
          {lastPostEvents
            .filter((evt: any) => !eventWinners.some((w: any) => w.eventId === evt.id))
            .map((evt: any) => (
            <LastPostEventBanner key={evt.id || 'single'} event={evt} posts={posts} bonusCards={bonusCards} onUseCard={handleUseCard} userId={userId} accessToken={accessToken} compact={lastPostEvents.filter((e: any) => !eventWinners.some((w: any) => w.eventId === e.id)).length >= 2} onAutoClose={handleAutoClose} onLowTimer={() => setEventFastPoll(true)} isAdmin={isAdmin} />
          ))}
        </div>
      )}
      {/* 추천인 랭킹 이벤트 배너 */}
      {referralRankEvent && (
        <ReferralRankEventBanner event={referralRankEvent} accessToken={accessToken} />
      )}
      {/* 비로그인 배너 */}
      {!userId && (
        <div className="bg-gray-900 rounded-2xl px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-white font-bold text-sm">보드라움 회원이 되어보세요 🎲</p>
            <p className="text-gray-400 text-xs mt-0.5">좋아요, 댓글, 컬렉션 관리를 해보세요.</p>
            <p className="text-gray-400 text-xs mt-0.5">다양한 이벤트도 진행됩니다.</p>
          </div>
          <button
            onClick={() => onGuestAction?.()}
            className="flex-shrink-0 bg-white text-gray-900 text-xs font-bold px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors">
            15초 가입
          </button>
        </div>
      )}
      {/* 카테고리 헤더 */}
      <div className="bg-white rounded-2xl shadow-sm relative">
        <div className="flex items-center gap-2 px-4 py-3">
          {/* 현재 선택 표시 + 드롭다운 토글 */}
          <button
            onClick={() => { setShowCategories(v => !v); setShowSubPicker(null); }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all">
            {subCategory ?? (category === '이벤트' ? '🎉 이벤트' : category === '숙제' ? '📚 숙제' : category)}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showCategories ? 'rotate-180' : ''}`} />
          </button>
          {subCategory && (
            <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">{category}</span>
          )}
          {(category !== '전체' || subCategory) && (
            <button onClick={() => { setCategory('전체'); setSubCategory(null); setShowSubPicker(null); setShowCategories(false); }}
              className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => setShowSearch(true)}
            className={`w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors ${searchQuery ? 'text-gray-900' : 'text-gray-400'}`}>
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* 검색어 표시 */}
        {searchQuery && (
          <div className="border-t border-gray-50 px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">검색: <span className="font-semibold text-gray-900">"{searchQuery}"</span></span>
            <button onClick={() => setSearchQuery('')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
              <X className="w-3 h-3" /> 초기화
            </button>
          </div>
        )}

        {/* 데스크톱 드롭다운 */}
        {showCategories && (
          <>
            <div className="fixed inset-0 z-[9997]" onClick={() => { setShowCategories(false); setShowSubPicker(null); }} />
            <div className="hidden lg:block absolute left-4 top-full mt-1.5 z-[9998] bg-white rounded-2xl shadow-xl border border-gray-100 min-w-[160px] overflow-hidden py-1">
              {BASE_CATEGORIES.map(c => {
                const hasSub = !!SUBCATEGORIES[c];
                const isActive = category === c && !subCategory;
                const hasActiveSub = category === c && !!subCategory;
                return (
                  <div key={c}>
                    <button
                      onClick={() => {
                        if (hasSub) { setShowSubPicker(prev => prev === c ? null : c); }
                        else { setCategory(c); setSubCategory(null); setShowCategories(false); setShowSubPicker(null); }
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors
                        ${(isActive || hasActiveSub) ? 'font-bold text-gray-900 bg-gray-50' : 'font-medium text-gray-600 hover:bg-gray-50'}`}>
                      <span>{c === '이벤트' ? '🎉 이벤트' : c === '숙제' ? '📚 숙제' : c}</span>
                      {hasSub
                        ? <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${showSubPicker === c ? 'rotate-180' : ''}`} />
                        : (isActive || hasActiveSub) && <span className="w-1.5 h-1.5 rounded-full bg-gray-900 flex-shrink-0" />}
                    </button>
                    {hasSub && showSubPicker === c && (
                      <div className="bg-gray-50 border-t border-b border-gray-100">
                        <button onClick={() => { setCategory(c); setSubCategory(null); setShowSubPicker(null); setShowCategories(false); }}
                          className={`w-full text-left pl-8 pr-4 py-2 text-sm transition-colors ${category === c && !subCategory ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
                          {c} 전체
                        </button>
                        {SUBCATEGORIES[c].map(s => (
                          <button key={s} onClick={() => { setCategory(c); setSubCategory(s); setShowSubPicker(null); setShowCategories(false); }}
                            className={`w-full text-left pl-8 pr-4 py-2 text-sm transition-colors ${subCategory === s ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 모바일 중앙 모달 */}
            <div className="lg:hidden fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-6"
              onClick={() => { setShowCategories(false); setShowSubPicker(null); }}>
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <h3 className="font-bold text-gray-900 text-base">카테고리</h3>
                  <button onClick={() => { setShowCategories(false); setShowSubPicker(null); }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="pb-4">
                  {BASE_CATEGORIES.map(c => {
                    const hasSub = !!SUBCATEGORIES[c];
                    const isActive = category === c && !subCategory;
                    const hasActiveSub = category === c && !!subCategory;
                    return (
                      <div key={c}>
                        <button
                          onClick={() => {
                            if (hasSub) { setShowSubPicker(prev => prev === c ? null : c); }
                            else { setCategory(c); setSubCategory(null); setShowCategories(false); setShowSubPicker(null); }
                          }}
                          className={`w-full flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors
                            ${(isActive || hasActiveSub) ? 'font-bold text-gray-900 bg-gray-50' : 'font-medium text-gray-600 active:bg-gray-50'}`}>
                          <span>{c === '이벤트' ? '🎉 이벤트' : c === '숙제' ? '📚 숙제' : c}</span>
                          {hasSub
                            ? <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${showSubPicker === c ? 'rotate-180' : ''}`} />
                            : (isActive || hasActiveSub) && <span className="w-2 h-2 rounded-full bg-gray-900 flex-shrink-0" />}
                        </button>
                        {hasSub && showSubPicker === c && (
                          <div className="bg-gray-50 border-t border-b border-gray-100">
                            <button onClick={() => { setCategory(c); setSubCategory(null); setShowSubPicker(null); setShowCategories(false); }}
                              className={`w-full text-left pl-10 pr-5 py-2.5 text-sm transition-colors ${category === c && !subCategory ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                              {c} 전체
                            </button>
                            {SUBCATEGORIES[c].map(s => (
                              <button key={s} onClick={() => { setCategory(c); setSubCategory(s); setShowSubPicker(null); setShowCategories(false); }}
                                className={`w-full text-left pl-10 pr-5 py-2.5 text-sm transition-colors ${subCategory === s ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 검색 모달 */}
      {showSearch && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-start justify-center pt-20 px-4"
          onClick={() => setShowSearch(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setShowSearch(false)}
                placeholder="글 내용 또는 닉네임 검색..."
                style={{fontSize: "16px"}}
                className="flex-1 text-base text-gray-800 outline-none placeholder-gray-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setShowSearch(false)}
                className="text-sm font-semibold text-gray-900 hover:text-gray-600 flex-shrink-0">
                검색
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이벤트 카테고리 규칙사항 박스 */}
      {category === '이벤트' && eventCategoryNotice?.content && (
        <div className="bg-white rounded-2xl shadow-sm px-5 py-4 border-l-4 border-cyan-400">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-cyan-600 mb-1.5 flex items-center gap-1.5">
                📋 {eventCategoryNotice.title || '규칙사항'}
              </p>
              <p className="text-xs text-gray-600 leading-relaxed line-clamp-2 whitespace-pre-line">
                {eventCategoryNotice.content}
              </p>
            </div>
            <button
              onClick={() => setShowEventRulesModal(true)}
              className="flex-shrink-0 text-xs font-semibold text-cyan-500 hover:text-cyan-700 px-2.5 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 transition-colors whitespace-nowrap">
              더보기
            </button>
          </div>
        </div>
      )}

      {/* 글쓰기 입력창 */}
      <div className="bg-white rounded-2xl shadow-sm px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onViewProfile?.(userId, true)}
            className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0 flex items-center justify-center text-sm font-bold text-gray-500 overflow-hidden hover:opacity-75 transition-opacity"
          >
            {avatarUrl 
              ? <img src={avatarUrl} className="w-full h-full object-cover" alt="profile" />
              : userName[0]?.toUpperCase()
            }
          </button>
          <button onClick={() => { if (!userId) { onGuestAction?.(); return; } setShowComposer(true); }}
            className="flex-1 text-left text-sm text-gray-400 px-4 py-2.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
            자유롭게 소통하세요.
          </button>
          <button onClick={() => { if (!userId) { onGuestAction?.(); return; } setShowComposer(true); }}
            className="h-9 px-4 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
            게시
          </button>
        </div>
      </div>

      {/* 숙제 당첨 배너 */}
      {hwWinner && (
        <button
          onClick={() => {
            if (!userId) { onGuestAction?.(); return; }
            if (hwWinner.isWinner || hwWinner.isAdmin) {
              setShowWinnerEmailModal(true);
            } else {
              toast('선정된 분이 아니시네요! 🙏', { duration: 2500 });
            }
          }}
          className="w-full bg-white rounded-2xl shadow-sm overflow-hidden text-left transition-all active:scale-[0.99]">
          <div className="bg-cyan-500 px-4 py-2 flex items-center gap-2">
            <span className="text-white text-xs font-bold">📚 {hwWinner.category}</span>
            <span className="ml-auto text-white/70 text-[10px] font-medium">당첨 발표</span>
          </div>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 text-xl">
              🏆
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-gray-900 text-sm">{hwWinner.userName}님이 선정됐어요!</p>
              {hwWinner.prizeReward && (
                <p className="text-xs text-purple-500 font-medium mt-0.5">🎁 {hwWinner.prizeReward}</p>
              )}
              <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                {hwWinner.emailClaimed
                  ? '📬 이메일 접수가 완료되었습니다.'
                  : '선정되신 분은 배너를 눌러 이메일을 남겨주세요.'}
              </p>
            </div>
          </div>
        </button>
      )}

      {/* 당첨자 이메일 제출 모달 */}
      {showWinnerEmailModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowWinnerEmailModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="bg-cyan-500 px-6 py-4 text-center">
              <div className="text-2xl mb-1">🏆</div>
              <h3 className="font-black text-white text-base">
                {hwWinner?.isAdmin ? '당첨자 이메일 확인' : '축하드립니다!'}
              </h3>
              <p className="text-xs text-white/80 mt-0.5">
                {hwWinner?.isAdmin ? hwWinner.userName + '님 당첨' : '숙제 당첨자로 선정되셨어요'}
              </p>
            </div>
            <div className="p-5 space-y-4">
            {hwWinner?.isAdmin && hwWinner.emailClaimed ? (
              <>
                <p className="text-xs text-gray-400 text-center">제출된 이메일 주소</p>
                <div className="w-full h-11 px-4 rounded-xl border border-cyan-200 bg-cyan-50 flex items-center text-sm font-semibold text-cyan-700">
                  {hwWinner.email || '—'}
                </div>
                <button onClick={() => setShowWinnerEmailModal(false)}
                  className="w-full py-2.5 rounded-xl bg-gray-100 text-sm font-semibold text-gray-600">
                  닫기
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 text-center">
                  {hwWinner?.isAdmin ? '당첨자가 아직 이메일을 남기지 않았어요.\n직접 입력할 수도 있어요.' : '상품 수령을 위해 이메일 주소를 남겨주세요.'}
                </p>
                <input
                  type="email"
                  value={winnerEmail}
                  onChange={e => setWinnerEmail(e.target.value)}
                  placeholder="이메일 주소를 입력해주세요"
                  style={{ fontSize: '16px' }}
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowWinnerEmailModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
                    취소
                  </button>
                  <button
                    disabled={winnerEmailSubmitting || !winnerEmail.trim()}
                    onClick={async () => {
                      if (!winnerEmail.trim()) return;
                      setWinnerEmailSubmitting(true);
                      try {
                        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/homework/winner/claim-email`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                          body: JSON.stringify({ email: winnerEmail.trim() }),
                        });
                        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
                        toast.success('이메일이 제출됐어요 💌');
                        setHwWinner(prev => prev ? { ...prev, emailClaimed: true, email: winnerEmail.trim() } : prev);
                        setShowWinnerEmailModal(false);
                        setWinnerEmail('');
                      } catch (e: any) {
                        toast.error(e.message || '제출 실패');
                      }
                      setWinnerEmailSubmitting(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-bold transition-colors">
                    {winnerEmailSubmitting ? '제출 중...' : '제출하기'}
                  </button>
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      )}

      {/* 숙제 주제 버튼 - 슬라이드 */}
      {hwCategories.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3 space-y-2">
          <p className="text-xs text-gray-400 font-medium">이런 주제 어때요?</p>
          <div className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl"
            style={{ minHeight: '76px' }}>
            {/* 왼쪽: 숙제 정보 */}
            <div className="flex-1 flex flex-col justify-center min-w-0">
              <div className="flex items-center gap-1.5">
                <PenLine className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="font-semibold text-sm text-gray-700 truncate">{hwCategories[hwSlideIndex].name}</span>
                {hwCategories[hwSlideIndex].pointReward > 0 && (
                  <span className="text-xs text-amber-500 font-semibold flex-shrink-0">+{hwCategories[hwSlideIndex].pointReward}pt</span>
                )}
              </div>
              <span className={`text-xs text-purple-500 font-medium mt-0.5 pl-5 ${hwCategories[hwSlideIndex].prizeReward ? 'visible' : 'invisible'}`}>
                🎁 {hwCategories[hwSlideIndex].prizeReward || '없음'}
              </span>
              <span className={`text-[10px] text-gray-400 mt-0.5 pl-5 ${(hwCategories[hwSlideIndex].startDate || hwCategories[hwSlideIndex].endDate) ? 'visible' : 'invisible'}`}>
                {hwCategories[hwSlideIndex].startDate?.replace(/-/g, '.') || '?'} ~ {hwCategories[hwSlideIndex].endDate?.replace(/-/g, '.') || '?'}
              </span>
            </div>
            {/* 오른쪽: 작성하기 버튼 */}
            <button
              onClick={() => {
                if (hwCategories.length === 1) {
                  setComposerCategory(hwCategories[0].name);
                  setShowComposer(true);
                } else {
                  setShowHwSelectModal(true);
                }
              }}
              className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors">
              작성하기
            </button>
          </div>
        </div>
      )}

      {/* 숙제 선택 모달 */}
      {showHwSelectModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowHwSelectModal(false)}>
          <div className="bg-white w-full sm:w-[min(100vw-2rem,480px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">어떤 숙제에 참여할까요?</h2>
              <button onClick={() => setShowHwSelectModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {hwCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setShowHwSelectModal(false); setComposerCategory(cat.name); setShowComposer(true); }}
                  className="w-full text-left flex flex-col gap-1 px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-orange-50 hover:border-orange-200 transition-colors">
                  <div className="flex items-center gap-1.5">
                    <PenLine className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-semibold text-sm text-gray-800">{cat.name}</span>
                    {cat.pointReward > 0 && (
                      <span className="text-xs text-amber-500 font-semibold">+{cat.pointReward}pt</span>
                    )}
                  </div>
                  {cat.prizeReward && (
                    <span className="text-xs text-purple-500 font-medium pl-5">🎁 {cat.prizeReward}</span>
                  )}
                  {(cat.startDate || cat.endDate) && (
                    <span className="text-[10px] text-gray-400 pl-5">
                      {cat.startDate?.replace(/-/g, '.') || '?'} ~ {cat.endDate?.replace(/-/g, '.') || '?'}
                    </span>
                  )}
                  {cat.guideline && (
                    <p className="text-xs text-gray-500 pl-5 mt-0.5 line-clamp-2">{cat.guideline}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 피드 목록 */}
      {loading ? (
        <div className="flex justify-center py-16 bg-white rounded-2xl shadow-sm">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm text-center py-16">
          <div className="text-4xl mb-3">🎲</div>
          <p className="font-semibold text-gray-500">아직 게시물이 없어요</p>
          <p className="text-sm text-gray-400 mt-1">첫 번째 게시물을 작성해보세요!</p>
        </div>
      ) : (
        (() => {
          const q = searchQuery.trim().toLowerCase();
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const allHwNames = new Set(allHwCategories.map((c: any) => c.name));
          const recentHwNames = new Set(allHwCategories.filter((c: any) =>
            !c.endDate || new Date(c.endDate + 'T23:59:59') >= sevenDaysAgo
          ).map((c: any) => c.name));
          const oldHwNames = new Set(allHwCategories.filter((c: any) =>
            c.endDate && new Date(c.endDate + 'T23:59:59') < sevenDaysAgo
          ).map((c: any) => c.name));
          const basePosts = q
            ? posts.filter(p =>
                p.content?.toLowerCase().includes(q) ||
                p.userName?.toLowerCase().includes(q)
              )
            : category === '숙제' && subCategory === '최근 숙제'
              ? posts.filter(p => recentHwNames.has(p.category))
            : category === '숙제' && subCategory === '지난 숙제'
              ? posts.filter(p => oldHwNames.has(p.category))
            : category === '숙제'
              ? posts.filter(p => allHwNames.has(p.category))
            : subCategory
              ? posts.filter(p => p.category === subCategory)
              : category === '이벤트'
              ? posts.filter(p => p.category === '이벤트')
              : category === '정보'
              ? posts.filter(p => p.category === '정보' || INFO_SUB.includes(p.category))
              : category === '질문'
              ? posts.filter(p => p.category === '질문' || QUESTION_SUB.includes(p.category))
              : category !== '전체'
              ? posts.filter(p => p.category === category)
              : posts;
          // 공지 → 베스트글 → 일반글 순서 정렬
          const filteredPosts = [...basePosts].sort((a, b) => {
            const aScore = a.pinned ? 2 : a.isBest ? 1 : 0;
            const bScore = b.pinned ? 2 : b.isBest ? 1 : 0;
            if (aScore !== bScore) return bScore - aScore;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
          return filteredPosts.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm text-center py-16">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-semibold text-gray-500">검색 결과가 없어요</p>
              <p className="text-sm text-gray-400 mt-1">다른 검색어를 입력해보세요</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
              {(() => {
                // 이벤트 당첨/선두 계산 (이벤트 시작 이후 글만 유효)
                let winnerPostId: string | null = null;
                let leadingPostId: string | null = null;
                if (lastPostEvents.length > 0 && posts.length > 0) {
                  const eventStart = lastPostEvents[0].startedAt ? new Date(lastPostEvents[0].startedAt).getTime() : 0;
                  const disqualifiedIds: string[] = lastPostEvents[0].disqualified || [];
                  const excludedIds: string[] = lastPostEvents[0].excluded || [];
                  const validPosts = [...posts]
                    .filter(p =>
                      p.category === '이벤트' &&
                      new Date(p.createdAt).getTime() >= eventStart &&
                      !disqualifiedIds.includes(p.userId) &&
                      !excludedIds.includes(p.userId)
                    )
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                  if (validPosts.length > 0) {
                    const lastPost = validPosts[0];
                    const lastTime = new Date(lastPost.createdAt).getTime();
                    const endTime = lastTime + lastPostEvents[0].durationMinutes * 60 * 1000;
                    const kstHour = (new Date().getUTCHours() + 9) % 24;
                    const isSleep = kstHour >= 0 && kstHour < 8;
                    if (!isSleep && Date.now() >= endTime) winnerPostId = lastPost.id;
                    else leadingPostId = lastPost.id; // 휴식 중에도 선두 표시
                  }
                }
                return filteredPosts.slice(0, displayedPostsCount).map(post => (
                <div key={post.id} id={`post-${post.id}`} className="py-3 transition-all duration-300 ease-in-out">
                  <FeedCard post={post} accessToken={accessToken}
                    isWinner={post.id === winnerPostId}
                    isLeading={post.id === leadingPostId}
                    userId={userId} userName={userName}
                    onUpdate={() => loadPosts(false, openCommentPostIdsRef.current)} onFollowToggle={handleFollowToggle} onDelete={loadPosts} onViewProfile={onViewProfile}
                    myAvatarUrl={avatarUrl} myRankPoints={myPoints}
                    ownedGames={ownedGames} userEmail={userEmail} userProfile={userProfile}
                    isAdmin={isAdmin}
                    onOptimisticDelete={optimisticDeletePost}
                    onOptimisticLike={optimisticLike}
                    onOptimisticComment={(comment) => optimisticAddComment(post.id, comment)}
                    onOptimisticDeleteComment={(commentId) => optimisticDeleteComment(post.id, commentId)}
                    onCommentOpen={(id) => {
                      openCommentPostIdsRef.current.add(id);
                      onCommentingChange?.(true);
                }}
                onCommentClose={(id) => {
                  openCommentPostIdsRef.current.delete(id);
                  if (openCommentPostIdsRef.current.size === 0) onCommentingChange?.(false);
                }}
                onGameClick={onGameClick}
                wishlistGames={wishlistGames}
                onAddToWishlist={onAddToWishlist}
                onRemoveFromWishlist={onRemoveFromWishlist}
                bookmarkedPostIds={bookmarkedPostIds}
                onBookmarkChange={(postId, bookmarked) => {
                  setBookmarkedPostIds(prev => {
                    const next = new Set(prev);
                    bookmarked ? next.add(postId) : next.delete(postId);
                    return next;
                  });
                }}
                onGuestAction={onGuestAction}
                onCategoryClick={handleCategoryClick}
              />
            </div>
          ));})()}
              {filteredPosts.length > displayedPostsCount && (
                <div className="py-4 px-4 text-center border-t border-gray-100">
                  <button
                    onClick={() => setDisplayedPostsCount(prev => prev + 20)}
                    className="px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    더보기 ({filteredPosts.length - displayedPostsCount}개 남음)
                  </button>
                </div>
              )}
            </div>
          );
        })()
      )}

      {/* 이벤트 규칙사항 전체보기 모달 */}
      {showEventRulesModal && eventCategoryNotice && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center px-4"
          onClick={() => setShowEventRulesModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg, #E0F7FA, #ffffff)' }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <span className="font-bold text-gray-900">{eventCategoryNotice.title || '규칙사항'}</span>
              </div>
              <button onClick={() => setShowEventRulesModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-5 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {eventCategoryNotice.content}
              </p>
            </div>
            {eventCategoryNotice.updatedAt && (
              <div className="px-5 pb-4 pt-0">
                <p className="text-[10px] text-gray-400">
                  마지막 업데이트: {new Date(eventCategoryNotice.updatedAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 글 작성 모달 */}
      {showComposer && (
        <PostComposer
          accessToken={accessToken} userId={userId} userEmail={userEmail}
          userProfile={userProfile} ownedGames={ownedGames}
          onClose={() => { setShowComposer(false); setComposerCategory(undefined); }}
          onPosted={loadPosts}
          initialCategory={composerCategory}
        />
      )}
    </div>
  );
}