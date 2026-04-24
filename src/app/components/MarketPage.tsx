import { useState, useEffect, useRef } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { toast } from 'sonner';
import { Loader2, MessageSquare, Lock, Send, Package, X, ChevronDown, ChevronUp, Search, ChevronRight, Plus } from 'lucide-react';
import type { BoardGame } from '../App';

export interface MarketListing {
  id: string;
  userId: string;
  userNickname: string;
  game: {
    koreanName: string;
    englishName?: string;
    imageUrl?: string;
    bggId?: string;
    playCount?: number;
    hasSleeve?: boolean;
    hasStorage?: boolean;
    hasComponentUpgrade?: boolean;
    boxCondition?: 'S' | 'A' | 'B' | 'C';
    wikiInfo?: string;
  };
  minPrice?: number;
  sellerNote?: string;
  status: 'active' | 'sold';
  reservation?: { commentId: string; userNickname: string; offerPrice: number };
  createdAt: string;
  bumpedAt?: string; // 끌어올리기 마지막 시각
}

export interface MarketComment {
  id: string;
  listingId: string;
  userId: string;
  userNickname: string;
  offerPrice?: number;
  content: string;
  isSecret: boolean;
  parentId?: string;
  createdAt: string;
}

// ===== 경매 인터페이스 =====
interface Auction {
  auctionId: string;
  title: string;
  description: string;
  imageUrl: string;
  imageUrls?: string[];
  startPrice: number;
  bidUnit: number;
  status: 'scheduled' | 'active' | 'ended';
  scheduledAt?: string;
  startAt: string;
  endAt: string;
  timerMinutes: number;
  createdBy: string;
  currentBid: number;
  currentBidder: string | null;
  currentBidderNickname: string | null;
  prize: string;
  boxCondition?: string;
  type: 'admin' | 'user';
  winnerUserId: string | null;
  winnerNickname: string | null;
  createdAt: string;
  resultExpiresAt?: string;
  tags?: string[];
}

function maskName(str: string): string {
  if (!str) return str;
  if (str.includes('@')) return str.split('@')[0];
  return str;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}일 ${h}시간 ${m}분`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ===== 마켓 등록 모달 =====
export function ListingModal({ game, accessToken, userNickname, onClose, onSuccess }: {
  game: BoardGame; accessToken: string; userNickname: string; onClose: () => void; onSuccess: () => void;
}) {
  const [minPriceStr, setMinPriceStr] = useState('');
  const [sellerNote, setSellerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const minPrice = minPriceStr ? parseInt(minPriceStr.replace(/,/g, '')) : undefined;
      const body = {
        userNickname,
        gameId: game.id,
        game: {
          koreanName: game.koreanName, englishName: game.englishName,
          imageUrl: game.imageUrl, bggId: game.bggId, playCount: game.playCount,
          hasSleeve: game.hasSleeve, hasStorage: game.hasStorage,
          hasComponentUpgrade: game.hasComponentUpgrade, boxCondition: game.boxCondition,
          wikiInfo: game.wikiInfo,
        },
        minPrice, sellerNote,
      };
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/market/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '등록 실패');
      toast.success('마켓에 등록되었습니다!');
      onSuccess();
    } catch (e: any) { toast.error(e.message); }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">마켓 등록</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          {game.imageUrl && <img src={game.imageUrl} alt={game.koreanName} className="w-12 h-12 object-cover rounded-lg flex-shrink-0"/>}
          <div>
            <p className="font-semibold text-gray-900 text-sm">{game.koreanName}</p>
            {game.englishName && <p className="text-xs text-gray-400">{game.englishName}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">시작 금액 (선택)</label>
          <div className="flex items-center gap-2">
            <input type="text" inputMode="numeric" placeholder="0"
              value={minPriceStr}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setMinPriceStr(raw ? parseInt(raw).toLocaleString() : '');
              }}
              className="flex-1 h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300"/>
            <span className="text-sm text-gray-500">원</span>
          </div>
          <p className="text-xs text-gray-400">비워두면 자유 제안을 받아요</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">판매자 메모 (선택)</label>
          <textarea rows={3} value={sellerNote} onChange={e => setSellerNote(e.target.value)}
            placeholder="게임 상태, 거래 방법 등을 적어주세요"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"/>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-40">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : '등록하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 방출 확인 모달 =====
export function ReleaseConfirmModal({ game, onMarketRegister, onJustRelease, onClose }: {
  game: BoardGame; onMarketRegister: () => void; onJustRelease: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">게임 방출</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          {game.imageUrl && <img src={game.imageUrl} alt={game.koreanName} className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />}
          <div>
            <p className="font-semibold text-gray-900 text-sm">{game.koreanName}</p>
            {game.englishName && <p className="text-xs text-gray-400">{game.englishName}</p>}
          </div>
        </div>
        <p className="text-sm text-gray-600 text-center">
          이 게임을 <span className="font-bold text-gray-900">📦 방출 게임 마켓</span>에도<br />등록하시겠어요?
        </p>
        <div className="flex gap-2">
          <button onClick={onJustRelease} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
            마켓 없이 방출
          </button>
          <button onClick={onMarketRegister} className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700">
            마켓에 등록
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 댓글 섹션 =====
function CommentSection({ listing, accessToken, userId, userNickname, onReservationChange, onTopOfferChange }: {
  listing: MarketListing; accessToken?: string; userId?: string; userNickname?: string;
  onReservationChange?: (r: { commentId: string; userNickname: string; offerPrice: number } | null) => void;
  onTopOfferChange?: (o: { price: number; nick: string } | null) => void;
}) {
  const [comments, setComments] = useState<MarketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [offerPrice, setOfferPrice] = useState('');
  const [content, setContent] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; nick: string } | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<'offer' | 'inquiry'>('offer');
  const [reservation, setReservation] = useState(listing.reservation || null);
  const [reserving, setReserving] = useState(false);

  const isSeller = userId === listing.userId;

  const load = async () => {
    try {
      const token = accessToken || publicAnonKey;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/market/comments/${listing.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      const loaded: MarketComment[] = Array.isArray(d.comments) ? d.comments : [];
      setComments(loaded);
      // 최고 제안가 카드로 전달
      const offers = loaded.filter(c => c.offerPrice && c.offerPrice > 0 && !c.parentId);
      if (offers.length > 0) {
        const top = offers.reduce((a, b) => a.offerPrice! > b.offerPrice! ? a : b);
        onTopOfferChange?.({ price: top.offerPrice!, nick: top.userNickname });
      } else {
        onTopOfferChange?.(null);
      }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [listing.id]);

  const canSee = (c: MarketComment) =>
    !c.isSecret || c.userId === userId || listing.userId === userId;

  const submit = async (parentId?: string) => {
    const text = parentId ? replyContent : content;
    if (!text.trim()) { toast.error('내용을 입력해주세요'); return; }
    if (!accessToken) { toast.error('로그인이 필요합니다'); return; }
    if (userId === listing.userId && !parentId) { toast.error('내 게임에는 제안할 수 없어요'); return; }

    const price = tab === 'offer' && !parentId && offerPrice
      ? parseInt(offerPrice.replace(/,/g, '')) : undefined;

    if (tab === 'offer' && !parentId) {
      if (!price) { toast.error('제안 금액을 입력해주세요'); return; }
      if (listing.minPrice && price < listing.minPrice) {
        toast.error(`시작가(${listing.minPrice.toLocaleString()}원) 이상으로 제안해주세요`); return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/market/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          listingId: listing.id, userNickname,
          offerPrice: price,
          content: text,
          isSecret: parentId ? false : (tab === 'inquiry' ? isSecret : false),
          parentId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      if (parentId) { setReplyContent(''); setReplyTo(null); }
      else { setContent(''); setOfferPrice(''); }
      await load();
      toast.success('등록되었습니다');
    } catch (e: any) { toast.error(e.message || '등록 실패'); }
    setSubmitting(false);
  };

  const offerComments = comments.filter(c => c.offerPrice && !c.parentId);
  const inquiryComments = comments.filter(c => !c.offerPrice && !c.parentId);
  const getReplies = (id: string) => comments.filter(c => c.parentId === id);

  const reserve = async (c: MarketComment) => {
    if (!accessToken || !isSeller) return;
    setReserving(true);
    try {
      const isCancel = reservation?.commentId === c.id;
      const body = isCancel ? { cancel: true } : { commentId: c.id, userNickname: c.userNickname, offerPrice: c.offerPrice };
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/market/listings/${listing.id}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const newReservation = isCancel ? null : { commentId: c.id, userNickname: c.userNickname!, offerPrice: c.offerPrice! };
      setReservation(newReservation);
      onReservationChange?.(newReservation);
      toast.success(isCancel ? '예약이 취소되었습니다' : `${c.userNickname}님께 예약되었습니다`);
    } catch (e: any) { toast.error(e.message); }
    setReserving(false);
  };

  const CommentItem = ({ c }: { c: MarketComment }) => {
    const replies = getReplies(c.id);
    const isReserved = reservation?.commentId === c.id;
    return (
      <div className={`py-2.5 space-y-2 ${isReserved ? 'bg-amber-50 -mx-1 px-1 rounded-xl' : ''}`}>
        {canSee(c) ? (
          <>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-800">{c.userNickname}</span>
                  {isReserved && (
                    <span className="flex items-center gap-1 text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">
                      🔖 예약됨
                    </span>
                  )}
                  {c.isSecret && <span className="flex items-center gap-0.5 text-xs text-gray-400"><Lock className="w-2.5 h-2.5"/>비밀</span>}
                  <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString('ko-KR')}</span>
                </div>
                {c.offerPrice && c.content && (
                  <div className="flex items-start gap-1 mt-0.5">
                    <Lock className="w-3 h-3 text-gray-300 flex-shrink-0 mt-0.5"/>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                  </div>
                )}
                {!c.offerPrice && <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{c.content}</p>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* 판매자만 보이는 예약 버튼 */}
                {isSeller && c.offerPrice && listing.status === 'active' && (
                  <button
                    onClick={() => reserve(c)}
                    disabled={reserving}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      isReserved
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        : reservation
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200'
                    }`}
                  >
                    {reserving ? <Loader2 className="w-3 h-3 animate-spin"/> : isReserved ? '예약 취소' : '예약'}
                  </button>
                )}
                {accessToken && !replyTo && (
                  <button onClick={() => setReplyTo({ id: c.id, nick: c.userNickname })}
                    className="text-xs text-gray-400 hover:text-gray-700">답글</button>
                )}
              </div>
            </div>
            {/* 대댓글 */}
            {replies.map(r => (
              <div key={r.id} className="ml-4 pl-3 border-l-2 border-gray-100">
                {canSee(r) ? (
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-800">{r.userNickname}</span>
                      <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString('ko-KR')}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.content}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-gray-400 py-1">
                    <Lock className="w-3 h-3"/>비밀 댓글
                  </div>
                )}
              </div>
            ))}
            {/* 답글 입력 */}
            {replyTo?.id === c.id && (
              <div className="ml-4 pl-3 border-l-2 border-gray-200 space-y-2">
                <textarea rows={2} value={replyContent} onChange={e => setReplyContent(e.target.value)}
                  placeholder={`@${replyTo.nick}에게 답글`}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gray-300" />
                <div className="flex gap-2">
                  <button onClick={() => setReplyTo(null)} className="text-xs text-gray-400">취소</button>
                  <button onClick={() => submit(c.id)} disabled={submitting}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40">
                    {submitting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Send className="w-3 h-3"/>} 등록
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 py-1">
            <Lock className="w-3 h-3"/>비밀 댓글입니다
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setTab('offer')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'offer' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          💰 금액 제안 ({offerComments.length})
        </button>
        <button onClick={() => setTab('inquiry')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'inquiry' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          💬 문의 ({inquiryComments.filter(canSee).length})
        </button>
      </div>

      {/* 댓글 목록 */}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400"/></div>
      ) : (
        <div className="divide-y divide-gray-100">
          {tab === 'offer' && (
            offerComments.length === 0
              ? <p className="text-xs text-gray-400 text-center py-4">아직 금액 제안이 없어요</p>
              : offerComments
                  .sort((a, b) => b.offerPrice! - a.offerPrice!)
                  .map(c => <CommentItem key={c.id} c={c} />)
          )}
          {tab === 'inquiry' && (
            inquiryComments.filter(canSee).length === 0
              ? <p className="text-xs text-gray-400 text-center py-4">아직 문의가 없어요</p>
              : inquiryComments.map(c => <CommentItem key={c.id} c={c} />)
          )}
        </div>
      )}

      {/* 입력창 */}
      {accessToken && !replyTo && (
        <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
          {tab === 'offer' ? (
            <>
              <div className="flex items-center gap-2">
                <input type="text" inputMode="numeric" placeholder="제안 금액"
                  value={offerPrice}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setOfferPrice(raw ? parseInt(raw).toLocaleString() : '');
                  }}
                  className="flex-1 h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white font-bold" />
                <span className="text-sm text-gray-500 flex-shrink-0">원</span>
              </div>
              {listing.minPrice && (
                <p className="text-xs text-gray-400">시작가: {listing.minPrice.toLocaleString()}원 이상</p>
              )}
              <textarea rows={2} value={content} onChange={e => setContent(e.target.value)}
                placeholder="제안 메시지 (거래 방법, 지역 등)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white" />
            </>
          ) : (
            <>
              <textarea rows={2} value={content} onChange={e => setContent(e.target.value)}
                placeholder="게임 상태나 거래 관련 문의를 남겨주세요"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white" />
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input type="checkbox" checked={isSecret} onChange={e => setIsSecret(e.target.checked)} className="rounded" />
                <Lock className="w-3 h-3"/> 비밀 문의 (판매자 + 관리자만 열람)
              </label>
            </>
          )}
          <div className="flex justify-end">
            <button onClick={() => submit()} disabled={submitting}
              className="flex items-center gap-1 text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40">
              {submitting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Send className="w-3 h-3"/>}
              {tab === 'offer' ? '제안하기' : '문의하기'}
            </button>
          </div>
        </div>
      )}
      {!accessToken && <p className="text-xs text-gray-400 text-center">로그인 후 참여할 수 있어요</p>}
    </div>
  );
}

// ===== 마켓 카드 =====
function ListingCard({ listing, accessToken, userId, userNickname, isAdmin, onCancelListing }: {
  listing: MarketListing; accessToken?: string; userId?: string; userNickname?: string; isAdmin?: boolean;
  onCancelListing?: (gameId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [markingSold, setMarkingSold] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [bumping, setBumping] = useState(false);
  const [hidden, setHidden] = useState(false);
  // 카드 레벨에서 실시간 반영용 상태
  const [liveReservation, setLiveReservation] = useState(listing.reservation || null);
  const [liveTopOffer, setLiveTopOffer] = useState<{ price: number; nick: string } | null>(null);

  const condColor: Record<string, string> = {
    S: 'bg-blue-100 text-blue-700', A: 'bg-green-100 text-green-700',
    B: 'bg-yellow-100 text-yellow-700', C: 'bg-red-100 text-red-700',
  };

  const isSeller = userId === listing.userId;

  // 한국시간 기준 2일 경과 여부
  const canBump = (() => {
    if (!isSeller || listing.status !== 'active') return false;
    const created = new Date(listing.bumpedAt || listing.createdAt);
    const koNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const koCreated = new Date(created.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    return (koNow.getTime() - koCreated.getTime()) >= 2 * 24 * 60 * 60 * 1000;
  })();

  const markSold = async () => {
    if (!accessToken) return;
    setMarkingSold(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/market/listings/${listing.id}/sold`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('거래 완료!');
      window.location.reload();
    } catch (e: any) { toast.error(e.message); }
    setMarkingSold(false);
  };

  const cancelListing = async () => {
    if (!accessToken) return;
    setCancelling(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/market/listings/${listing.id}/cancel`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const d = await res.json();
      // gameId 우선, 없으면 bggId, 없으면 listing.id
      const matchId = d.gameId || d.bggId || listing.id;
      toast.success('방출이 취소되었습니다. 보유 리스트로 돌아갔어요.');
      onCancelListing?.(matchId);
      setHidden(true);
    } catch (e: any) { toast.error(e.message); }
    setCancelling(false);
  };

  const bumpListing = async () => {
    if (!accessToken) return;
    setBumping(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/market/listings/${listing.id}/bump`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('끌어올리기 완료! 목록 상단으로 이동했어요.');
      window.location.reload();
    } catch (e: any) { toast.error(e.message); }
    setBumping(false);
  };

  if (hidden) return null;
  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${listing.status === 'sold' ? 'opacity-60' : 'hover:shadow-md'}`}>
      <div className="p-4 space-y-3">
        {/* 모바일 전용 예약 배너 (작고 심플하게) */}
        {liveReservation && listing.status === 'active' && (
          <div className="sm:hidden flex items-center gap-1.5 text-xs text-amber-700 font-medium bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <span>🔖</span> 예약 중 · {liveReservation.userNickname}님 · {liveReservation.offerPrice.toLocaleString()}원
          </div>
        )}

        {/* 상단: 이미지 + 게임 정보 */}
        <div className="flex gap-3">
          {/* 이미지 */}
          <div className="relative flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden bg-gray-100">
            {listing.game.imageUrl
              ? <img src={listing.game.imageUrl} alt={listing.game.koreanName} className="w-full h-full object-cover"/>
              : <div className="w-full h-full flex items-center justify-center text-2xl">🎲</div>}
            {listing.status === 'sold' && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="text-white text-xs font-bold">거래완료</span>
              </div>
            )}
          </div>

          {/* 게임 정보 */}
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <p className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">{listing.game.koreanName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs text-gray-400">by {listing.userNickname}</p>              </div>
            </div>
            {/* 가격 — 모바일: 이미지 아래 */}
            <div className="mt-1.5 sm:hidden">
              {liveReservation ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-amber-600 font-medium">🔖 예약가</span>
                  <span className="text-base font-black text-amber-700">{liveReservation.offerPrice.toLocaleString()}원</span>
                </div>
              ) : liveTopOffer ? (
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs text-green-600 font-medium">최고 제안</span>
                    <span className="text-base font-black text-green-700">{liveTopOffer.price.toLocaleString()}원</span>
                  </div>
                  <p className="text-xs text-gray-400">{liveTopOffer.nick}님</p>
                </div>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-gray-400">시작가</span>
                  <span className="text-base font-black text-gray-900">
                    {listing.minPrice ? `${listing.minPrice.toLocaleString()}원` : '제안받기'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 가격 + 예약 — PC only: 우측 정렬 */}
          <div className="hidden sm:flex flex-col items-end justify-center flex-shrink-0 gap-1">
            {liveReservation && listing.status === 'active' && (
              <span className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">🔖 예약 중</span>
            )}
            {liveReservation ? (
              <p className="text-base font-black text-amber-700">{liveReservation.offerPrice.toLocaleString()}원</p>
            ) : liveTopOffer ? (
              <div className="text-right">
                <p className="text-xs text-green-600 font-medium">최고 제안</p>
                <p className="text-base font-black text-green-700">{liveTopOffer.price.toLocaleString()}원</p>
                <p className="text-xs text-gray-400">{liveTopOffer.nick}님</p>
              </div>
            ) : (
              <div className="text-right">
                <p className="text-xs text-gray-400">시작가</p>
                <p className="text-base font-black text-gray-900">
                  {listing.minPrice ? `${listing.minPrice.toLocaleString()}원` : '제안받기'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 태그 */}
        <div className="flex flex-wrap gap-1">
          {listing.game.boxCondition && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${condColor[listing.game.boxCondition]}`}>
              박스 {listing.game.boxCondition}급
            </span>
          )}
          {listing.game.hasSleeve && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">슬리브 ✓</span>}
          {listing.game.hasStorage && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">아스테이지 ✓</span>}
          {listing.game.hasComponentUpgrade && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">컴포업 ✓</span>}
          {(listing.game.playCount ?? 0) > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{listing.game.playCount}회 플레이</span>
          )}
        </div>

        {/* 판매자 메모 */}
        {listing.sellerNote && (
          <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5 leading-relaxed">{listing.sellerNote}</p>
        )}
        {listing.game.wikiInfo && (
          <div className="text-xs bg-blue-50 rounded-xl px-3 py-2.5 leading-relaxed">
            <span className="font-semibold text-blue-700">관리 메모 </span>
            <span className="text-gray-600">{listing.game.wikiInfo}</span>
          </div>
        )}

        {/* 가격 제안/문의 버튼 */}
        <button onClick={() => setExpanded(!expanded)}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all border ${
            expanded
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
          }`}>
          <MessageSquare className="w-4 h-4"/>
          가격 제안 / 문의 보기
          {expanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
        </button>

        {/* 판매자 액션 버튼들 */}
        {isSeller && listing.status === 'active' && (
          <div className="flex gap-2">
            <button onClick={markSold} disabled={markingSold}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors">
              {markingSold ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : null}
              거래 완료
            </button>
            <button onClick={cancelListing} disabled={cancelling}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:border-red-300 hover:text-red-500 disabled:opacity-40 transition-colors">
              {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : null}
              방출 취소
            </button>
          </div>
        )}
        {/* 관리자 전용 거래완료 (판매자가 아닌 경우) */}
        {!isSeller && isAdmin && listing.status === 'active' && (
          <button onClick={markSold} disabled={markingSold}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40">
            {markingSold ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : null}
            거래 완료 (관리자)
          </button>
        )}

        {/* 끌어올리기 */}
        {canBump && (
          <button onClick={bumpListing} disabled={bumping}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-blue-300 text-blue-500 hover:bg-blue-50 text-sm font-medium transition-colors">
            {bumping ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <span>⬆️</span>}
            끌어올리기
          </button>
        )}
      </div>

      {/* 댓글 섹션 */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4">
          <CommentSection
            listing={listing} accessToken={accessToken} userId={userId} userNickname={userNickname}
            onReservationChange={(r) => setLiveReservation(r)}
            onTopOfferChange={(o) => setLiveTopOffer(o)}
          />
        </div>
      )}
    </div>
  );
}

// ===== 메인 마켓 페이지 =====
// ===== 경매 등록 모달 (관리자) =====
const BOX_CONDITIONS = [
  { value: 'S', label: 'S급', desc: '미개봉/새제품' },
  { value: 'A', label: 'A급', desc: '거의 새것' },
  { value: 'B', label: 'B급', desc: '사용감 있음' },
  { value: 'C', label: 'C급', desc: '파손·흠집' },
] as const;

function AuctionCreateModal({ accessToken, ownedGames = [], onClose, onSuccess }: {
  accessToken: string; ownedGames?: BoardGame[]; onClose: () => void; onSuccess: () => void;
}) {
  const [step, setStep] = useState<'game' | 'form'>('game');
  const [gameSearch, setGameSearch] = useState('');
  const [selectedGame, setSelectedGame] = useState<BoardGame | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [startPrice, setStartPrice] = useState('1');
  const [bidUnit, setBidUnit] = useState('1');
  const [timerMinutes, setTimerMinutes] = useState('10');
  const [schedulePreset, setSchedulePreset] = useState<'now' | '10' | '30' | '60' | 'custom'>('now');
  const [scheduleCustom, setScheduleCustom] = useState('');
  const [prize, setPrize] = useState('');
  const [boxCondition, setBoxCondition] = useState<string>('');
  const [hostUserId, setHostUserId] = useState('');
  const [hostNickname, setHostNickname] = useState('');
  const [hostSearchQ, setHostSearchQ] = useState('');
  const [hostResults, setHostResults] = useState<any[]>([]);
  const [hostSearching, setHostSearching] = useState(false);
  const [allUsers, setAllUsers] = useState<any[] | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function selectGame(game: BoardGame) {
    setSelectedGame(game);
    setTitle(game.koreanName || '');
    setBoxCondition(game.boxCondition || '');
    setStep('form');
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, idx: number) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIdx(idx);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/image/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      const d = await res.json();
      if (d.url) {
        setImageUrls(prev => {
          const next = [...prev];
          next[idx] = d.url;
          return next;
        });
      } else toast.error('이미지 업로드 실패');
    } catch { toast.error('이미지 업로드 실패'); }
    setUploadingIdx(null);
  }

  function removeImage(idx: number) {
    setImageUrls(prev => prev.filter((_, i) => i !== idx));
  }

  const scheduleAfterMinutes = schedulePreset === 'now' ? 0
    : schedulePreset === 'custom' ? (Number(scheduleCustom) || 0)
    : Number(schedulePreset);

  const AAPI = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae`;

  useEffect(() => {
    fetch(`${AAPI}/auction/tags`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.json()).then(d => setAvailableTags(d.tags || [])).catch(() => {});
  }, []);

  async function addTag(tag: string) {
    const t = tag.trim();
    if (!t) return;
    try {
      const r = await fetch(`${AAPI}/auction/tags`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: t }),
      });
      if (r.ok) { const d = await r.json(); setAvailableTags(d.tags || []); if (!selectedTags.includes(t)) setSelectedTags(prev => [...prev, t]); }
    } catch {}
    setNewTagInput('');
  }

  async function deleteTag(tag: string) {
    try {
      const r = await fetch(`${AAPI}/auction/tags/${encodeURIComponent(tag)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) { setAvailableTags(prev => prev.filter(t => t !== tag)); setSelectedTags(prev => prev.filter(t => t !== tag)); }
    } catch {}
  }

  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function searchHost(q: string) {
    setHostSearchQ(q);
    if (!q.trim()) { setHostResults([]); return; }
    setHostSearching(true);
    try {
      let users = allUsers;
      if (!users) {
        const r = await fetch(`${AAPI}/admin/beta-testers?limit=1000&offset=0&includeGameData=false`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (r.ok) { const d = await r.json(); users = (d.testers ?? []).filter((u: any) => u.status === 'approved'); setAllUsers(users); }
        else { users = []; }
      }
      const lq = q.toLowerCase();
      setHostResults((users ?? []).filter((u: any) => {
        const name = (u.name || u.username || u.nickname || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        return name.includes(lq) || email.includes(lq);
      }).slice(0, 8));
    } catch { /* silent */ }
    setHostSearching(false);
  }

  function selectHost(u: any) {
    setHostUserId(u.userId || u.id || '');
    setHostNickname(u.name || u.username || u.nickname || u.email || '');
    setHostSearchQ('');
    setHostResults([]);
  }

  async function handleSubmit() {
    if (!title.trim()) { toast.error('상품명을 입력해주세요'); return; }
    const timer = Number(timerMinutes) || 10;
    if (timer < 1) { toast.error('타이머를 1분 이상으로 설정해주세요'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${AAPI}/auction`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description,
          imageUrl: selectedGame?.imageUrl || '',
          imageUrls,
          startPrice: Number(startPrice) || 1,
          bidUnit: Number(bidUnit) || 1,
          timerMinutes: timer,
          scheduleAfterMinutes,
          prize,
          boxCondition,
          gameId: selectedGame?.id,
          hostUserId: hostUserId || undefined,
          hostNickname: hostNickname || undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
        }),
      });
      const d = await res.json();
      if (d.success) { toast.success('경매가 등록됐어요!'); onSuccess(); onClose(); }
      else toast.error(d.error || '등록 실패');
    } catch { toast.error('네트워크 오류'); }
    setSubmitting(false);
  }

  const filteredGames = ownedGames.filter(g => {
    if (!gameSearch.trim()) return true;
    const q = gameSearch.toLowerCase();
    return (g.koreanName || '').toLowerCase().includes(q) || (g.englishName || '').toLowerCase().includes(q);
  });

  // 이미지 슬롯: 업로드된 것 + 빈 슬롯 1개 (최대 5장)
  const imageSlots = [...imageUrls, ...(imageUrls.length < 5 ? [''] : [])].slice(0, 5);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[9998]" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[88vh]">
        <div className="px-5 pt-4 pb-3 flex-shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {step === 'form' && (
                <button onClick={() => setStep('game')} className="text-gray-400 hover:text-gray-700 -ml-1 mr-1">
                  <ChevronDown className="w-5 h-5 rotate-90" />
                </button>
              )}
              <h3 className="text-base font-bold text-gray-900">
                {step === 'game' ? '경매할 게임 선택' : '경매 등록'}
              </h3>
            </div>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
        </div>

        {/* 게임 선택 단계 */}
        {step === 'game' && (
          <>
            <div className="px-5 pt-3 pb-2 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  value={gameSearch} onChange={e => setGameSearch(e.target.value)}
                  placeholder="게임 이름 검색..."
                  className="w-full h-9 pl-9 pr-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-6">
              {filteredGames.length > 0 ? filteredGames.map(game => (
                <button key={game.id} onClick={() => selectGame(game)}
                  className="w-full flex items-center gap-3 py-3 border-b border-gray-50 hover:bg-gray-50 rounded-xl px-2 transition-colors text-left">
                  {game.imageUrl
                    ? <img src={game.imageUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
                    : <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-xl">🎲</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{game.koreanName || game.englishName}</p>
                    {game.koreanName && game.englishName && (
                      <p className="text-xs text-gray-400 truncate">{game.englishName}</p>
                    )}
                    {game.boxCondition && (
                      <p className="text-xs text-gray-400">상태: {game.boxCondition}급</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              )) : (
                <div className="text-center py-10 text-sm text-gray-400">
                  {gameSearch ? '검색 결과가 없어요' : '보유 게임이 없어요'}
                </div>
              )}
              {/* 직접 입력 옵션 */}
              <button
                onClick={() => { setSelectedGame(null); setStep('form'); }}
                className="w-full mt-3 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors">
                + 게임 목록 없이 직접 입력
              </button>
            </div>
          </>
        )}

        {/* 경매 상세 입력 단계 */}
        {step === 'form' && (
          <>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* 선택된 게임 카드 */}
              {selectedGame && (
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                  {selectedGame.imageUrl
                    ? <img src={selectedGame.imageUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    : <div className="w-12 h-12 rounded-xl bg-gray-200 flex-shrink-0 flex items-center justify-center text-lg">🎲</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{selectedGame.koreanName}</p>
                    {selectedGame.englishName && <p className="text-xs text-gray-400 truncate">{selectedGame.englishName}</p>}
                  </div>
                </div>
              )}

              {/* 실물 사진 (여러 장) */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">실물 사진 (최대 5장)</label>
                <div className="flex gap-2 flex-wrap">
                  {imageSlots.map((url, idx) => (
                    <div key={idx} className="relative">
                      {url ? (
                        <div className="relative w-20 h-20">
                          <img src={url} className="w-20 h-20 rounded-xl object-cover bg-gray-100" />
                          {idx === 0 && (
                            <span className="absolute top-1 left-1 text-[9px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded-md">표지</span>
                          )}
                          <button
                            onClick={() => removeImage(idx)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 bg-gray-50 transition-colors">
                          {uploadingIdx === idx ? (
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          ) : (
                            <>
                              <Plus className="w-5 h-5 text-gray-300" />
                              {idx === 0 && <span className="text-[9px] text-gray-300 mt-0.5">표지</span>}
                            </>
                          )}
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => handleImageUpload(e, idx)} />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 상품명 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">상품명 *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 아크노바 (완전 새제품)" className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>

              {/* 게임 상태 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">게임 상태</label>
                <div className="flex gap-2">
                  {BOX_CONDITIONS.map(c => (
                    <button key={c.value} onClick={() => setBoxCondition(boxCondition === c.value ? '' : c.value)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-colors ${boxCondition === c.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                      <p>{c.label}</p>
                      <p className={`font-normal text-[10px] mt-0.5 ${boxCondition === c.value ? 'text-gray-300' : 'text-gray-400'}`}>{c.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 설명 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">설명</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="상품 설명..." className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none" />
              </div>

              {/* 상품 내용 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">상품 내용</label>
                <input value={prize} onChange={e => setPrize(e.target.value)} placeholder="예: 아크노바 보드게임" className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>

              {/* 시작가 / 입찰 단위 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">시작가 (카드 수) *</label>
                  <input type="number" min="1" value={startPrice} onChange={e => setStartPrice(e.target.value)} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">입찰 단위 (카드 수) *</label>
                  <input type="number" min="1" value={bidUnit} onChange={e => setBidUnit(e.target.value)} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
              </div>

              {/* 경매 타이머 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">경매 타이머 (분) *</label>
                <p className="text-[11px] text-gray-400 mb-2">입찰 시마다 타이머가 이 시간으로 초기화돼요</p>
                <div className="flex gap-2 mb-2">
                  {[5, 10, 15, 30].map(m => (
                    <button key={m} type="button"
                      onClick={() => setTimerMinutes(String(m))}
                      className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-colors ${timerMinutes === String(m) ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                      {m}분
                    </button>
                  ))}
                </div>
                <input type="number" min="1" value={timerMinutes} onChange={e => setTimerMinutes(e.target.value)}
                  placeholder="직접 입력 (분)"
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>

              {/* 경매 시작 시점 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">경매 시작 시점</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {([['now', '즉시 시작'], ['10', '10분 후'], ['30', '30분 후'], ['60', '1시간 후'], ['custom', '직접 입력']] as const).map(([v, label]) => (
                    <button key={v} type="button"
                      onClick={() => setSchedulePreset(v)}
                      className={`py-2 rounded-xl border text-xs font-bold transition-colors ${schedulePreset === v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {schedulePreset === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" value={scheduleCustom} onChange={e => setScheduleCustom(e.target.value)}
                      placeholder="분 입력"
                      className="flex-1 h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300" />
                    <span className="text-sm text-gray-500 whitespace-nowrap">분 후 시작</span>
                  </div>
                )}
                {scheduleAfterMinutes > 0 && (
                  <p className="text-xs text-blue-500 mt-1.5 font-medium">예고 배너 표시 후 {scheduleAfterMinutes}분 뒤 경매 시작</p>
                )}
              </div>
              {/* 태그 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">상태 태그</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {availableTags.map(tag => (
                    <div key={tag} className="flex items-center gap-0.5">
                      <button type="button" onClick={() => toggleTag(tag)}
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition-colors ${selectedTags.includes(tag) ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                        {tag}
                      </button>
                      <button type="button" onClick={() => deleteTag(tag)}
                        className="w-4 h-4 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(newTagInput); } }}
                    placeholder="새 태그 추가 (예: S급, 카드슬리브)"
                    className="flex-1 h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                  <button type="button" onClick={() => addTag(newTagInput)}
                    className="h-9 px-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors">
                    추가
                  </button>
                </div>
              </div>

              {/* 경매 주체 (카드 수령인) */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">경매 주체 (낙찰 카드 수령인)</label>
                {hostUserId ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                    <span className="text-sm font-semibold text-emerald-700">{hostNickname}</span>
                    <button onClick={() => { setHostUserId(''); setHostNickname(''); }} className="text-xs text-gray-400 hover:text-red-500 transition-colors">변경</button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        value={hostSearchQ}
                        onChange={e => searchHost(e.target.value)}
                        placeholder="닉네임으로 검색..."
                        className="w-full h-10 pl-9 pr-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                      {hostSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
                    </div>
                    {hostResults.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {hostResults.map((u, i) => (
                          <button key={i} onClick={() => selectHost(u)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{u.name || u.username || u.nickname || '—'}</p>
                              <p className="text-xs text-gray-400 truncate">{u.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-1">선택하지 않으면 카드가 지급되지 않아요</p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={handleSubmit} disabled={submitting} className="w-full h-12 bg-gray-900 text-white rounded-2xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '경매 등록하기'}
              </button>
            </div>
          </>
        )}
      </div>
      </div>
    </>
  );
}

// ===== 경매 요청 모달 (일반 회원) =====
function AuctionRequestModal({ accessToken, userNickname, onClose }: {
  accessToken: string; userNickname?: string; onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [startPrice, setStartPrice] = useState('1');
  const [bidUnit, setBidUnit] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/image/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      const d = await res.json();
      if (d.url) setImageUrl(d.url);
      else toast.error('이미지 업로드 실패');
    } catch { toast.error('이미지 업로드 실패'); }
    setImageUploading(false);
  }

  async function handleSubmit() {
    if (!title.trim()) { toast.error('상품명을 입력해주세요'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/auction/request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, imageUrl, startPrice: Number(startPrice) || 1, bidUnit: Number(bidUnit) || 1, nickname: userNickname }),
      });
      const d = await res.json();
      if (d.success) { toast.success('경매 요청이 접수됐어요! 관리자 승인 후 진행돼요.'); onClose(); }
      else toast.error(d.error || '요청 실패');
    } catch { toast.error('네트워크 오류'); }
    setSubmitting(false);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[9998]" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-5 pt-4 pb-3 flex-shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">경매 요청하기</h3>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <p className="text-xs text-gray-400 mt-1">관리자 승인 후 경매가 진행됩니다. 낙찰 시 카드가 포인트로 지급돼요.</p>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">상품 이미지</label>
            <label className="flex items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-gray-400 transition-colors overflow-hidden bg-gray-50">
              {imageUrl ? (
                <img src={imageUrl} className="w-full h-full object-cover" />
              ) : imageUploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              ) : (
                <span className="text-sm text-gray-400">이미지 선택</span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">상품명 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="경매할 상품명..." className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">설명</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="상품 설명..." className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">희망 시작가 (카드)</label>
              <input type="number" min="1" value={startPrice} onChange={e => setStartPrice(e.target.value)} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">희망 입찰 단위</label>
              <input type="number" min="1" value={bidUnit} onChange={e => setBidUnit(e.target.value)} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300" />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={handleSubmit} disabled={submitting} className="w-full h-12 bg-orange-500 text-white rounded-2xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '경매 요청 제출'}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}

// ===== 경매 배너 섹션 =====
function AuctionSection({ accessToken, userId, userNickname, isAdmin, ownedGames = [], onGoToMyAuctions }: {
  accessToken?: string; userId?: string; userNickname?: string; isAdmin?: boolean; ownedGames?: BoardGame[]; onGoToMyAuctions?: () => void;
}) {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [participants, setParticipants] = useState<{ userId: string; nickname: string }[]>([]);
  const [bidderIds, setBidderIds] = useState<string[]>([]);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeDisplay, setTimeDisplay] = useState('');
  const [cardCount, setCardCount] = useState(0);
  const [bidding, setBidding] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [dismissingBanner, setDismissingBanner] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [submittingAddress, setSubmittingAddress] = useState(false);
  const [addressSubmitted, setAddressSubmitted] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const API = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae`;

  async function loadAuction() {
    try {
      const token = accessToken || publicAnonKey;
      const res = await fetch(`${API}/auction/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setAuction(d.auction || null);
      const pts: { userId: string; nickname: string }[] = d.participants || [];
      setParticipants(pts);
      setBidderIds(d.bidderIds || []);
      if (userId) setJoined(pts.some(p => p.userId === userId));
    } catch {}
    setLoading(false);
  }

  async function loadCardCount() {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API}/bonus-cards/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await res.json();
      setCardCount(d.cards || 0);
    } catch {}
  }

  useEffect(() => {
    loadAuction();
    if (accessToken) loadCardCount();
  }, [accessToken]);

  // 채팅 폴링: 경매 active/ended 상태에서 5초마다 갱신
  useEffect(() => {
    if (chatPollRef.current) clearInterval(chatPollRef.current);
    if (!auction || !accessToken) return;
    loadChat(auction.auctionId);
    chatPollRef.current = setInterval(() => loadChat(auction.auctionId), 5000);
    return () => { if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [auction?.auctionId, accessToken]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!auction || auction.status === 'ended') return;

    const tick = () => {
      const now = Date.now();
      if (auction.status === 'scheduled') {
        const target = new Date(auction.startAt).getTime();
        setTimeDisplay(formatCountdown(target - now));
      } else if (auction.status === 'active') {
        const ms = new Date(auction.endAt).getTime() - now;
        setTimeDisplay(formatCountdown(ms));
        if (ms <= 0) loadAuction();
      } else if (auction.status === 'ended' && auction.resultExpiresAt) {
        const ms = new Date(auction.resultExpiresAt).getTime() - now;
        setTimeDisplay(formatCountdown(Math.max(0, ms)));
        if (ms <= 0) { setAuction(null); setParticipants([]); setBidderIds([]); }
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [auction?.endAt, auction?.startAt, auction?.status, auction?.resultExpiresAt]);

  async function handleBid() {
    if (!accessToken || !auction) return;
    setBidding(true);
    const nextBid = auction.currentBid + auction.bidUnit;
    try {
      const res = await fetch(`${API}/auction/${auction.auctionId}/bid`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: userNickname, amount: nextBid }),
      });
      const d = await res.json();
      if (d.success) {
        toast.success(`${nextBid}장으로 입찰했어요!`);
        setAuction(d.auction);
        setShowConfirm(false);
        setJoined(true);
        if (userId && !bidderIds.includes(userId)) setBidderIds(prev => [...prev, userId]);
        if (userId && !participants.some(p => p.userId === userId)) {
          setParticipants(prev => [...prev, { userId, nickname: userNickname || '' }]);
        }
        loadCardCount();
      } else {
        toast.error(d.error || '입찰 실패');
      }
    } catch { toast.error('네트워크 오류'); }
    setBidding(false);
  }

  async function handleJoin() {
    if (!accessToken || !auction || joined) return;
    setJoining(true);
    try {
      const res = await fetch(`${API}/auction/${auction.auctionId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: userNickname }),
      });
      const d = await res.json();
      if (d.success) {
        setJoined(true);
        setParticipants(d.participants || []);
        toast.success('경매에 참여했어요!');
      } else toast.error(d.error || '참여 실패');
    } catch { toast.error('네트워크 오류'); }
    setJoining(false);
  }

  async function loadChat(id: string) {
    if (!accessToken) return;
    try {
      const r = await fetch(`${API}/auction/${id}/chat`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (r.ok) { const d = await r.json(); setChatMessages(d.messages || []); }
    } catch {}
  }

  async function sendChat() {
    if (!accessToken || !auction || !chatInput.trim()) return;
    setSendingChat(true);
    try {
      const r = await fetch(`${API}/auction/${auction.auctionId}/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatInput.trim() }),
      });
      if (r.ok) {
        const d = await r.json();
        setChatMessages(d.messages || []);
        setChatInput('');
        setTimeout(() => { if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight; }, 50);
      }
    } catch {}
    setSendingChat(false);
  }

  async function submitAddress() {
    if (!accessToken || !auction || !addressInput.trim()) return;
    setSubmittingAddress(true);
    try {
      const r = await fetch(`${API}/auction/${auction.auctionId}/winner-address`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addressInput.trim() }),
      });
      if (r.ok) { toast.success('배송지가 등록됐어요'); setAddressSubmitted(true); loadDeliveryInfo(auction.auctionId); }
      else { const d = await r.json(); toast.error(d.error || '실패'); }
    } catch { toast.error('네트워크 오류'); }
    setSubmittingAddress(false);
  }

  async function loadDeliveryInfo(auctionId: string) {
    if (!accessToken) return;
    try {
      const r = await fetch(`${API}/auction/${auctionId}/delivery-info`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) { const d = await r.json(); setDeliveryInfo(d); }
    } catch {}
  }

  useEffect(() => {
    if (auction?.status === 'ended' && auction.auctionId && accessToken) {
      loadDeliveryInfo(auction.auctionId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auction?.auctionId, auction?.status, accessToken]);

  async function handleDismissBanner() {
    if (!accessToken || !auction) return;
    setDismissingBanner(true);
    try {
      const res = await fetch(`${API}/auction/${auction.auctionId}/dismiss-banner`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      const d = await res.json();
      if (d.success) { toast.success('배너가 종료됐어요'); setAuction(null); }
      else toast.error(d.error || '실패');
    } catch { toast.error('네트워크 오류'); }
    setDismissingBanner(false);
  }

  async function handleEnd() {
    if (!accessToken || !auction) return;
    if (!confirm('경매를 지금 종료하고 낙찰 처리할까요?')) return;
    try {
      const res = await fetch(`${API}/auction/${auction.auctionId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (d.success) { toast.success('경매가 종료됐어요'); setAuction(d.auction); }
      else toast.error(d.error || '종료 실패');
    } catch { toast.error('네트워크 오류'); }
  }

  if (loading) return null;

  const nextBid = auction ? auction.currentBid + auction.bidUnit : 0;
  const isMyBid = auction?.currentBidder === userId;
  const canBid = !!accessToken && auction?.status === 'active' && !isMyBid && cardCount >= nextBid;

  return (
    <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-100 overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🥕</span>
          <span className="text-sm font-bold text-orange-700">보너스카드 경매</span>
          {auction && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              auction.status === 'active' ? 'bg-green-100 text-green-700' :
              auction.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {auction.status === 'active' ? '진행 중' : auction.status === 'scheduled' ? '예고' : '종료'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && auction?.status === 'active' && (
            <button onClick={handleEnd} className="text-[11px] text-gray-400 hover:text-red-500 transition-colors">강제종료</button>
          )}
          {isAdmin && (
            <button onClick={() => setShowCreateModal(true)} className="text-xs font-semibold bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors">
              경매 시작하기
            </button>
          )}
          {!isAdmin && accessToken && (
            <button onClick={() => setShowRequestModal(true)} className="text-xs font-semibold bg-white text-orange-600 border border-orange-200 px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors">
              경매 요청하기
            </button>
          )}
        </div>
      </div>

      {/* 경매 없음 */}
      {!auction && (
        <div className="px-5 pb-5 text-center">
          <p className="text-sm text-orange-300 font-medium">현재 진행 중인 경매가 없어요</p>
        </div>
      )}

      {/* 경매 예고 */}
      {auction?.status === 'scheduled' && (
        <div className="px-5 pb-5">
          <div className="flex gap-4 items-start">
            {auction.imageUrl && (
              <img src={auction.imageUrl} className="w-16 h-16 rounded-xl object-cover shrink-0 bg-white" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{auction.title}</p>
              {auction.prize && <p className="text-xs text-gray-500 mt-0.5">{auction.prize}</p>}
              <p className="text-xs text-gray-400 mt-1">시작가 {auction.startPrice}장 · {auction.bidUnit}장 단위 입찰</p>
            </div>
          </div>
          <div className="mt-3 bg-white/70 rounded-xl px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-1">경매 시작까지</p>
            <p className="text-2xl font-black text-orange-500 tabular-nums">{timeDisplay}</p>
          </div>
        </div>
      )}

      {/* 경매 진행 중 */}
      {auction?.status === 'active' && (
        <div className="px-5 pb-5">
          <div className="flex gap-4 items-start mb-3">
            {auction.imageUrl && (
              <img src={auction.imageUrl} className="w-16 h-16 rounded-xl object-cover shrink-0 bg-white" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{auction.title}</p>
              {(auction.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {auction.tags!.map((t, i) => (
                    <span key={i} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">{t}</span>
                  ))}
                </div>
              )}
              {auction.prize && <p className="text-xs text-gray-500 mt-0.5">{auction.prize}</p>}
              <p className="text-xs text-gray-400 mt-0.5">입찰 단위 {auction.bidUnit}장{(auction as any).hostNickname ? ` · 주체: ${(auction as any).hostNickname}` : ''}</p>
            </div>
          </div>
          <div className="bg-white/70 rounded-xl px-4 py-3 mb-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-400">현재 최고 입찰</p>
                <p className="text-xl font-black text-orange-500">{auction.currentBid}장
                  {auction.currentBidderNickname && (
                    <span className="text-sm font-semibold text-gray-500 ml-2">· {maskName(auction.currentBidderNickname)}</span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">남은 시간</p>
                <p className="text-lg font-black text-gray-700 tabular-nums">{timeDisplay}</p>
              </div>
            </div>
          </div>
          {/* 실물 사진 */}
          {(auction.imageUrls?.filter(Boolean).length ?? 0) > 0 && (
            <div className="flex gap-2 overflow-x-auto mb-3">
              {auction.imageUrls!.filter(Boolean).map((url, idx) => (
                <button key={idx} onClick={() => setLightboxIdx(idx)}
                  className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 border-white/60 hover:border-orange-300 transition-all active:scale-95">
                  <img src={url} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {accessToken && (
            <p className="text-xs text-gray-400 mb-2 text-right">내 카드 {cardCount}장</p>
          )}
          {accessToken ? (
            showConfirm ? (
              <div className="bg-orange-100 rounded-xl p-3 flex items-center gap-2">
                <p className="flex-1 text-sm font-semibold text-orange-800">{nextBid}장으로 입찰할까요?</p>
                <button onClick={() => setShowConfirm(false)} className="text-xs text-gray-400 px-2 py-1 rounded-lg hover:bg-white transition-colors">취소</button>
                <button onClick={handleBid} disabled={bidding} className="text-xs font-bold bg-orange-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1">
                  {bidding ? <Loader2 className="w-3 h-3 animate-spin" /> : `입찰 (${nextBid}장)`}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={!canBid}
                className="w-full h-11 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-orange-500 text-white hover:bg-orange-600 active:scale-95"
              >
                {isMyBid ? '내가 최고 입찰 중' : cardCount < nextBid ? `카드 부족 (필요: ${nextBid}장)` : `입찰하기 · ${nextBid}장`}
              </button>
            )
          ) : (
            <p className="text-center text-xs text-gray-400 py-2">로그인 후 입찰할 수 있어요</p>
          )}
        </div>
      )}

      {/* 경매 종료 */}
      {auction?.status === 'ended' && (
        <div className="px-5 pb-5">
          <div className="flex gap-4 items-center mb-3">
            {auction.imageUrl && (
              <img src={auction.imageUrl} className="w-14 h-14 rounded-xl object-cover shrink-0 bg-white opacity-70" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-600 text-sm truncate">{auction.title}</p>
              {auction.prize && <p className="text-xs text-gray-400">{auction.prize}</p>}
              {(auction as any).hostNickname && (
                <p className="text-xs text-gray-400 mt-0.5">주체: <span className="font-semibold text-gray-500">{(auction as any).hostNickname}</span></p>
              )}
            </div>
          </div>
          <div className="bg-white/70 rounded-xl px-4 py-3 text-center">
            {auction.winnerNickname ? (
              <>
                <p className="text-xs text-gray-400 mb-1">낙찰자</p>
                <p className="text-base font-black text-gray-800">🎉 {auction.winnerNickname}</p>
                <p className="text-sm text-orange-500 font-bold mt-0.5">{auction.currentBid}장 낙찰</p>
              </>
            ) : (
              <p className="text-sm text-gray-400 font-medium">유찰됐어요</p>
            )}
          </div>
          {/* 낙찰자에게만 '내 경매'로 이동 버튼 */}
          {auction.winnerNickname && !!userId && auction.winnerUserId === userId && onGoToMyAuctions && (
            <button
              onClick={onGoToMyAuctions}
              className="w-full mt-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5">
              📦 배송지 입력하기
            </button>
          )}
          <div className="flex items-center justify-between mt-2">
            {auction.resultExpiresAt ? (
              <p className="text-[11px] text-gray-400">
                배너 종료까지 <span className="font-mono font-semibold text-gray-500">{timeDisplay}</span>
              </p>
            ) : <span />}
            {isAdmin && (
              <button onClick={handleDismissBanner} disabled={dismissingBanner}
                className="text-[11px] text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1">
                {dismissingBanner ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                배너 종료
              </button>
            )}
          </div>
        </div>
      )}

      {/* 실물 사진 썸네일 (scheduled/ended 상태용) */}
      {auction && auction.status !== 'active' && (auction.imageUrls?.filter(Boolean).length ?? 0) > 0 && (() => {
        const photos = auction.imageUrls!.filter(Boolean);
        return (
          <div className="px-5 pb-3 flex gap-2 overflow-x-auto">
            {photos.map((url, idx) => (
              <button key={idx} onClick={() => setLightboxIdx(idx)}
                className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 border-white/60 hover:border-orange-300 transition-all active:scale-95">
                <img src={url} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        );
      })()}

      {/* 실물 사진 라이트박스 */}
      {lightboxIdx !== null && auction && (() => {
        const photos = (auction.imageUrls || []).filter(Boolean);
        if (!photos.length) return null;
        const cur = Math.max(0, Math.min(lightboxIdx, photos.length - 1));
        return (
          <div className="fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center"
            onClick={() => setLightboxIdx(null)}>
            <img src={photos[cur]} className="max-w-full max-h-full object-contain select-none"
              style={{ maxHeight: '90vh', maxWidth: '95vw' }}
              onClick={e => e.stopPropagation()} />
            <button onClick={() => setLightboxIdx(null)}
              className="absolute top-4 right-4 w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
            {photos.length > 1 && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); setLightboxIdx(Math.max(0, cur - 1)); }}
                  disabled={cur === 0}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30 disabled:opacity-20 rounded-full flex items-center justify-center transition-colors">
                  <ChevronDown className="w-5 h-5 text-white rotate-90" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setLightboxIdx(Math.min(photos.length - 1, cur + 1)); }}
                  disabled={cur === photos.length - 1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30 disabled:opacity-20 rounded-full flex items-center justify-center transition-colors">
                  <ChevronDown className="w-5 h-5 text-white -rotate-90" />
                </button>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {photos.map((_, i) => (
                    <button key={i} onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${i === cur ? 'bg-white w-4' : 'bg-white/40'}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* 참여자 섹션 */}
      {auction && auction.status !== 'ended' && (
        <div className="px-5 pb-4 border-t border-orange-100 pt-3">
          {accessToken && !joined && (
            <button onClick={handleJoin} disabled={joining}
              className="w-full h-9 mb-3 rounded-xl border-2 border-orange-200 text-orange-600 text-sm font-semibold hover:bg-orange-50 active:scale-95 transition-all flex items-center justify-center gap-1.5 bg-white">
              {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '🙋 경매 참여하기'}
            </button>
          )}
          {participants.length > 0 && (
            <div>
              <p className="text-[11px] text-gray-400 font-medium mb-2">참여자 {participants.length}명</p>
              <div className="flex flex-wrap gap-1.5">
                {participants.map(p => {
                  const hasBid = bidderIds.includes(p.userId);
                  return (
                    <span key={p.userId}
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-all ${hasBid ? 'text-teal-700 bg-teal-50' : 'text-gray-500 bg-gray-100'}`}
                      style={hasBid ? { border: '1.5px solid #2dd4bf' } : { border: '1.5px solid transparent' }}>
                      {p.nickname}{hasBid ? ' 🎯' : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {participants.length === 0 && joined && (
            <p className="text-xs text-center text-teal-600 font-semibold">✓ 참여 중</p>
          )}
        </div>
      )}

      {/* 채팅창 */}
      {auction && accessToken && (
        <div className="border-t border-orange-100 px-5 pt-3 pb-5">
          <p className="text-[11px] font-semibold text-gray-400 mb-2">💬 대화</p>
          <div className="bg-white rounded-xl px-4 pt-3 pb-3">
            <div ref={chatContainerRef} className="h-[128px] overflow-y-auto space-y-2 mb-3 pr-1">
              {chatMessages.length === 0 ? (
                <p className="text-[11px] text-gray-300 text-center pt-8">첫 메시지를 남겨보세요</p>
              ) : (
                chatMessages.map((m, i) => (
                  <div key={m.msgId ?? i} className={`flex gap-2 ${m.userId === userId ? 'flex-row-reverse' : ''}`}>
                    <div className={`max-w-[75%] ${m.userId === userId ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                      {m.userId !== userId && (
                        <span className="text-[10px] text-gray-400 px-1">{m.nickname}</span>
                      )}
                      <div className={`px-3 py-1.5 rounded-2xl text-sm leading-snug ${
                        m.userId === userId
                          ? 'bg-orange-500 text-white rounded-tr-sm'
                          : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                      }`}>
                        {m.text}
                      </div>
                      <span className="text-[9px] text-gray-300 px-1">
                        {new Date(m.sentAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="메시지 입력..."
                className="flex-1 h-9 px-3 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
              <button onClick={sendChat} disabled={sendingChat || !chatInput.trim()}
                className="h-9 px-3 bg-orange-500 text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center gap-1 hover:bg-orange-600 transition-colors">
                {sendingChat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <AuctionCreateModal
          accessToken={accessToken!}
          ownedGames={ownedGames}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => loadAuction()}
        />
      )}
      {showRequestModal && accessToken && (
        <AuctionRequestModal
          accessToken={accessToken}
          userNickname={userNickname}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </div>
  );
}

function TrackingInput({ auctionId, accessToken, currentTracking, escrowStatus, onSubmitted }: {
  auctionId: string; accessToken: string; currentTracking?: string; escrowStatus?: string; onSubmitted: () => void;
}) {
  const API = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae`;
  const [trackingInput, setTrackingInput] = useState(currentTracking || '');
  const [submitting, setSubmitting] = useState(false);

  async function submitTracking() {
    if (!trackingInput.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/auction/${auctionId}/submit-tracking`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: trackingInput.trim() }),
      });
      if (r.ok) { toast.success('송장번호가 등록됐어요. 2일 후 카드가 지급됩니다.'); onSubmitted(); }
      else { const d = await r.json(); toast.error(d.error || '실패'); }
    } catch { toast.error('네트워크 오류'); }
    setSubmitting(false);
  }

  if (currentTracking || escrowStatus === 'tracking_submitted' || escrowStatus === 'released') {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1">🚚 송장번호</p>
        <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2">{currentTracking || trackingInput || '등록됨'}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1.5">🚚 송장번호 입력</p>
      <div className="flex gap-2">
        <input
          value={trackingInput}
          onChange={e => setTrackingInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitTracking()}
          placeholder="운송장 번호"
          className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <button onClick={submitTracking} disabled={submitting || !trackingInput.trim()}
          className="text-sm font-semibold text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
          {submitting ? '...' : '등록'}
        </button>
      </div>
    </div>
  );
}

function MyAuctionTrades({ accessToken, userId, isAdmin }: {
  accessToken: string; userId?: string; isAdmin?: boolean;
}) {
  const API = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae`;
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadTrades() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/my/auction-trades`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) { const d = await r.json(); setTrades(d.trades || []); }
    } catch {}
    setLoading(false);
  }

  async function deleteTrade(auctionId: string) {
    if (!confirm('이 거래 카드를 삭제할까요?')) return;
    setDeletingId(auctionId);
    try {
      const r = await fetch(`${API}/auction/result/${auctionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) { toast.success('삭제됐어요'); setTrades(prev => prev.filter(t => t.auctionId !== auctionId)); }
      else { const d = await r.json(); toast.error(d.error || '삭제 실패'); }
    } catch { toast.error('네트워크 오류'); }
    setDeletingId(null);
  }

  useEffect(() => { loadTrades(); }, [accessToken]);

  if (loading) return (
    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-400" /></div>
  );

  if (trades.length === 0) return (
    <div className="text-center py-10 text-sm text-gray-400 bg-white rounded-2xl shadow-sm">참여한 경매 거래가 없어요</div>
  );

  return (
    <div className="space-y-3 mb-4">
      {trades.map((t: any) => {
        const isWinner = userId && t.winnerUserId === userId;
        const isHost = userId && t.hostUserId === userId;
        const escrowStatus: string = t.escrowStatus || 'pending';
        return (
          <div key={t.auctionId} className="bg-white rounded-2xl shadow-sm border border-orange-100 p-4 space-y-3">
            {isAdmin && (
              <div className="flex justify-end">
                <button onClick={() => deleteTrade(t.auctionId)} disabled={deletingId === t.auctionId}
                  className="text-[11px] text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1">
                  {deletingId === t.auctionId ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  삭제
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              {t.imageUrl && <img src={t.imageUrl} className="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-100" />}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{t.title ?? t.gameName ?? '게임명 없음'}</p>
                <p className="text-xs text-orange-500 font-semibold mt-0.5">{t.finalBid ?? t.currentBid}장 낙찰</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  낙찰: {t.winnerNickname || '—'} · 주체: {t.hostNickname || '관리자'}
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                escrowStatus === 'released' ? 'bg-emerald-100 text-emerald-700' :
                escrowStatus === 'tracking_submitted' ? 'bg-blue-100 text-blue-600' :
                'bg-orange-100 text-orange-600'
              }`}>
                {escrowStatus === 'released' ? '완료' : escrowStatus === 'tracking_submitted' ? '배송중' : '대기중'}
              </span>
            </div>
            {/* 배송지: 낙찰자·주체자·관리자 */}
            {(isWinner || isHost || isAdmin) && (
              <div className="border-t border-gray-50 pt-3 space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <p className="text-[10px] text-gray-400">배송 정보는 낙찰자·주체자·관리자에게만 공개됩니다</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 mb-1">배송지</p>
                  {isWinner ? (
                    <WinnerAddressInput auctionId={t.auctionId} accessToken={accessToken} currentAddress={t.winnerAddress} onSubmitted={loadTrades} />
                  ) : t.winnerAddress ? (
                    <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2">{t.winnerAddress}</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">낙찰자 미입력</p>
                  )}
                </div>
                {(isHost || isAdmin) && (
                  <TrackingInput
                    auctionId={t.auctionId}
                    accessToken={accessToken}
                    currentTracking={t.trackingNumber}
                    escrowStatus={escrowStatus}
                    onSubmitted={loadTrades}
                  />
                )}
                {t.escrowAmount && (
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                    <span className="text-[11px] text-gray-400">에스크로:</span>
                    <span className={`text-[11px] font-bold ${escrowStatus === 'released' ? 'text-emerald-600' : 'text-orange-500'}`}>
                      {escrowStatus === 'released' ? `✓ 완료 (${t.escrowAmount}장 지급됨)` :
                       escrowStatus === 'tracking_submitted' ? `보유 ${t.escrowAmount}장 · 2일 후 지급` :
                       `보유 ${t.escrowAmount}장`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WinnerAddressInput({ auctionId, accessToken, currentAddress, onSubmitted }: {
  auctionId: string; accessToken: string; currentAddress?: string | null; onSubmitted: () => void;
}) {
  const API = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae`;
  const [editing, setEditing] = useState(!currentAddress);
  const [addressInput, setAddressInput] = useState(currentAddress || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (currentAddress) { setAddressInput(currentAddress); setEditing(false); }
  }, [currentAddress]);

  async function submit() {
    if (!addressInput.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/auction/${auctionId}/winner-address`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addressInput.trim() }),
      });
      if (r.ok) { toast.success(currentAddress ? '배송지가 수정됐어요' : '배송지가 등록됐어요'); setEditing(false); onSubmitted(); }
      else { const d = await r.json(); toast.error(d.error || '실패'); }
    } catch { toast.error('네트워크 오류'); }
    setSubmitting(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2">{currentAddress}</p>
        <button onClick={() => setEditing(true)} className="text-xs text-orange-500 hover:text-orange-700 font-semibold shrink-0">수정</button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        value={addressInput}
        onChange={e => setAddressInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="받으실 주소를 입력해주세요"
        className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300"
        autoFocus
      />
      <button onClick={submit} disabled={submitting || !addressInput.trim()}
        className="text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
        {submitting ? '...' : currentAddress ? '수정' : '등록'}
      </button>
      {currentAddress && (
        <button onClick={() => { setAddressInput(currentAddress); setEditing(false); }}
          className="text-xs text-gray-400 hover:text-gray-600 px-2 rounded-lg border border-gray-200 transition-colors">
          취소
        </button>
      )}
    </div>
  );
}

export function MarketPage({ accessToken, userId, userNickname, isAdmin, onCancelListing, ownedGames = [] }: {
  accessToken?: string; userId?: string; userNickname?: string; isAdmin?: boolean;
  onCancelListing?: (gameId: string) => void;
  ownedGames?: BoardGame[];
}) {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'sold' | 'all' | 'mine'>('active');
  const [showMyAuctions, setShowMyAuctions] = useState(false);
  const [search, setSearch] = useState('');
  const [showMyGamesModal, setShowMyGamesModal] = useState(false);
  const myAuctionsSectionRef = useRef<HTMLDivElement | null>(null);

  function goToMyAuctions() {
    setShowMyAuctions(true);
    setTimeout(() => myAuctionsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
  const [selectedListingGame, setSelectedListingGame] = useState<BoardGame | null>(null);
  const [gameSearch, setGameSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const token = accessToken || publicAnonKey;
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/market/listings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        setListings(Array.isArray(d.listings) ? d.listings : []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filtered = listings
    .filter(l => {
      if (filter === 'mine') return l.userId === userId;
      if (filter === 'all') return true;
      return l.status === filter;
    })
    .filter(l => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return l.game.koreanName.toLowerCase().includes(q) ||
        (l.game.englishName || '').toLowerCase().includes(q);
    });

  const FILTERS = [
    { key: 'active', label: '거래 중' },
    { key: 'sold', label: '거래 완료' },
    { key: 'all', label: '전체' },
    ...(userId ? [{ key: 'mine', label: '내 방출' }] : []),
  ] as const;

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {/* 경매 배너 섹션 */}
      <AuctionSection
        accessToken={accessToken}
        userId={userId}
        userNickname={userNickname}
        isAdmin={isAdmin}
        ownedGames={ownedGames}
        onGoToMyAuctions={accessToken ? goToMyAuctions : undefined}
      />

      {/* 헤더 + 검색 + 필터 */}
      <div className="bg-white rounded-2xl shadow-sm px-5 py-4 space-y-3">
        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2"><img src="data:image/webp;base64,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" className="w-7 h-7 object-contain" /> 방출 게임 마켓</h2>
        {/* 검색 */}
        <input
          type="text"
          placeholder="게임 이름으로 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-10 px-4 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50"
        />
        {/* 필터 탭 */}
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => { setFilter(f.key as any); setShowMyAuctions(false); }}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${filter === f.key && !showMyAuctions ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.label}
            </button>
          ))}
          {accessToken && (
            <button onClick={() => setShowMyAuctions(v => !v)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${showMyAuctions ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-600 hover:bg-orange-200'}`}>
              내 경매
            </button>
          )}
          <span className="ml-auto text-sm text-gray-400">{!showMyAuctions ? filtered.length : ''}개</span>
        </div>
      </div>

      {/* 내 경매 거래 섹션 */}
      <div ref={myAuctionsSectionRef}>
        {showMyAuctions && accessToken && (
          <MyAuctionTrades accessToken={accessToken} userId={userId} isAdmin={isAdmin} />
        )}
      </div>

      {/* 내 게임 방출 및 판매 버튼 */}
      {accessToken && ownedGames.length > 0 && (
        <button
          onClick={() => { setGameSearch(''); setShowMyGamesModal(true); }}
          className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-400 bg-white hover:border-gray-400 hover:text-gray-600 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          내 게임 방출 및 판매
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-16 bg-white rounded-2xl shadow-sm"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border-2 border-dashed border-gray-200">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-gray-500 font-medium">
            {search ? `"${search}" 검색 결과가 없어요` : '등록된 방출 게임이 없어요'}
          </p>
          {!search && <p className="text-sm text-gray-400 mt-1">보유 게임 카드의 📦 버튼을 눌러 등록해보세요</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(l => (
            <ListingCard key={l.id} listing={l} accessToken={accessToken}
              userId={userId} userNickname={userNickname} isAdmin={isAdmin}
              onCancelListing={onCancelListing}/>
          ))}
        </div>
      )}

      {/* 내 게임 선택 모달 */}
      {showMyGamesModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[9998]" onClick={() => setShowMyGamesModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 lg:left-[72px] bg-white rounded-t-3xl z-[9999] shadow-2xl flex flex-col max-h-[80vh]">
            <div className="px-6 pt-5 pb-3 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-gray-900">방출할 게임 선택</h3>
                <button onClick={() => setShowMyGamesModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="게임 이름으로 검색..."
                  value={gameSearch}
                  onChange={e => setGameSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-6">
              {ownedGames
                .filter(g => {
                  if (!gameSearch.trim()) return true;
                  const q = gameSearch.toLowerCase();
                  return (g.koreanName || '').toLowerCase().includes(q) || (g.englishName || '').toLowerCase().includes(q);
                })
                .map(game => (
                  <button
                    key={game.id}
                    onClick={() => { setSelectedListingGame(game); setShowMyGamesModal(false); }}
                    className="w-full flex items-center gap-3 py-3 border-b border-gray-50 hover:bg-gray-50 rounded-xl px-2 transition-colors text-left"
                  >
                    {game.imageUrl
                      ? <img src={game.imageUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
                      : <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-xl">🎲</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{game.koreanName || game.englishName}</p>
                      {game.koreanName && game.englishName && (
                        <p className="text-xs text-gray-400 truncate">{game.englishName}</p>
                      )}
                      {game.boxCondition && (
                        <p className="text-xs text-gray-400">상태: {game.boxCondition}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                ))
              }
              {ownedGames.filter(g => {
                if (!gameSearch.trim()) return true;
                const q = gameSearch.toLowerCase();
                return (g.koreanName || '').toLowerCase().includes(q) || (g.englishName || '').toLowerCase().includes(q);
              }).length === 0 && (
                <div className="text-center py-10 text-sm text-gray-400">검색 결과가 없어요</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ListingModal */}
      {selectedListingGame && accessToken && (
        <ListingModal
          game={selectedListingGame}
          accessToken={accessToken}
          userNickname={userNickname || '회원'}
          onClose={() => setSelectedListingGame(null)}
          onSuccess={() => {
            setSelectedListingGame(null);
            const token = accessToken;
            fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/market/listings`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.json()).then(d => {
              if (Array.isArray(d.listings)) setListings(d.listings);
            });
          }}
        />
      )}
    </div>
  );
}