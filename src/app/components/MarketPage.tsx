import { useState, useEffect } from 'react';
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
export function MarketPage({ accessToken, userId, userNickname, isAdmin, onCancelListing, ownedGames = [] }: {
  accessToken?: string; userId?: string; userNickname?: string; isAdmin?: boolean;
  onCancelListing?: (gameId: string) => void;
  ownedGames?: BoardGame[];
}) {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'sold' | 'all' | 'mine'>('active');
  const [search, setSearch] = useState('');
  const [showMyGamesModal, setShowMyGamesModal] = useState(false);
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
      {/* 헤더 + 검색 + 필터 */}
      <div className="bg-white rounded-2xl shadow-sm px-5 py-4 space-y-3">
        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2"><img src="data:image/webp;base64,UklGRvIXAABXRUJQVlA4WAoAAAAwAAAApgIA/wEASUNDUMAPAAAAAA/AYXBwbAIQAABtbnRyUkdCIFhZWiAH6gABABQADwAZABVhY3NwQVBQTAAAAABBUFBMAAAAAAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWFwcGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABFkZXNjAAABUAAAAGJkc2NtAAABtAAABJxjcHJ0AAAGUAAAACN3dHB0AAAGdAAAABRyWFlaAAAGiAAAABRnWFlaAAAGnAAAABRiWFlaAAAGsAAAABRyVFJDAAAGxAAACAxhYXJnAAAO0AAAACB2Y2d0AAAO8AAAADBuZGluAAAPIAAAAD5tbW9kAAAPYAAAACh2Y2dwAAAPiAAAADhiVFJDAAAGxAAACAxnVFJDAAAGxAAACAxhYWJnAAAO0AAAACBhYWdnAAAO0AAAACBkZXNjAAAAAAAAAAhEaXNwbGF5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbWx1YwAAAAAAAAAmAAAADGhySFIAAAAUAAAB2GtvS1IAAAAMAAAB7G5iTk8AAAASAAAB+GlkAAAAAAASAAACCmh1SFUAAAAUAAACHGNzQ1oAAAAWAAACMGRhREsAAAAcAAACRm5sTkwAAAAWAAACYmZpRkkAAAAQAAACeGl0SVQAAAAYAAACiGVzRVMAAAAWAAACoHJvUk8AAAASAAACtmZyQ0EAAAAWAAACyGFyAAAAAAAUAAAC3nVrVUEAAAAcAAAC8mhlSUwAAAAWAAADDnpoVFcAAAAKAAADJHZpVk4AAAAOAAADLnNrU0sAAAAWAAADPHpoQ04AAAAKAAADJHJ1UlUAAAAkAAADUmVuR0IAAAAUAAADdmZyRlIAAAAWAAADim1zAAAAAAASAAADoGhpSU4AAAASAAADsnRoVEgAAAAMAAADxGNhRVMAAAAYAAAD0GVuQVUAAAAUAAADdmVzWEwAAAASAAACtmRlREUAAAAQAAAD6GVuVVMAAAASAAAD+HB0QlIAAAAYAAAECnBsUEwAAAASAAAEImVsR1IAAAAiAAAENHN2U0UAAAAQAAAEVnRyVFIAAAAUAAAEZnB0UFQAAAAWAAAEemphSlAAAAAMAAAEkABMAEMARAAgAHUAIABiAG8AagBpzuy37AAgAEwAQwBEAEYAYQByAGcAZQAtAEwAQwBEAEwAQwBEACAAVwBhAHIAbgBhAFMAegDtAG4AZQBzACAATABDAEQAQgBhAHIAZQB2AG4A/QAgAEwAQwBEAEwAQwBEAC0AZgBhAHIAdgBlAHMAawDmAHIAbQBLAGwAZQB1AHIAZQBuAC0ATABDAEQAVgDkAHIAaQAtAEwAQwBEAEwAQwBEACAAYQAgAGMAbwBsAG8AcgBpAEwAQwBEACAAYQAgAGMAbwBsAG8AcgBMAEMARAAgAGMAbwBsAG8AcgBBAEMATAAgAGMAbwB1AGwAZQB1AHIgDwBMAEMARAAgBkUGRAZIBkYGKQQaBD4EOwRMBD4EQAQ+BDIEOAQ5ACAATABDAEQgDwBMAEMARAAgBeYF0QXiBdUF4AXZX2mCcgBMAEMARABMAEMARAAgAE0A4AB1AEYAYQByAGUAYgBuAP0AIABMAEMARAQmBDIENQRCBD0EPgQ5ACAEFgQaAC0ENAQ4BEEEPwQ7BDUEOQBDAG8AbABvAHUAcgAgAEwAQwBEAEwAQwBEACAAYwBvAHUAbABlAHUAcgBXAGEAcgBuAGEAIABMAEMARAkwCQIJFwlACSgAIABMAEMARABMAEMARAAgDioONQBMAEMARAAgAGUAbgAgAGMAbwBsAG8AcgBGAGEAcgBiAC0ATABDAEQAQwBvAGwAbwByACAATABDAEQATABDAEQAIABDAG8AbABvAHIAaQBkAG8ASwBvAGwAbwByACAATABDAEQDiAOzA8cDwQPJA7wDtwAgA78DuAPMA70DtwAgAEwAQwBEAEYA5AByAGcALQBMAEMARABSAGUAbgBrAGwAaQAgAEwAQwBEAEwAQwBEACAAYQAgAGMAbwByAGUAczCrMOkw/ABMAEMARHRleHQAAAAAQ29weXJpZ2h0IEFwcGxlIEluYy4sIDIwMjYAAFhZWiAAAAAAAADzUQABAAAAARbMWFlaIAAAAAAAAIPfAAA9v////7tYWVogAAAAAAAASr8AALE3AAAKuVhZWiAAAAAAAAAoOAAAEQsAAMi5Y3VydgAAAAAAAAQAAAAABQAKAA8AFAAZAB4AIwAoAC0AMgA2ADsAQABFAEoATwBUAFkAXgBjAGgAbQByAHcAfACBAIYAiwCQAJUAmgCfAKMAqACtALIAtwC8AMEAxgDLANAA1QDbAOAA5QDrAPAA9gD7AQEBBwENARMBGQEfASUBKwEyATgBPgFFAUwBUgFZAWABZwFuAXUBfAGDAYsBkgGaAaEBqQGxAbkBwQHJAdEB2QHhAekB8gH6AgMCDAIUAh0CJgIvAjgCQQJLAlQCXQJnAnECegKEAo4CmAKiAqwCtgLBAssC1QLgAusC9QMAAwsDFgMhAy0DOANDA08DWgNmA3IDfgOKA5YDogOuA7oDxwPTA+AD7AP5BAYEEwQgBC0EOwRIBFUEYwRxBH4EjASaBKgEtgTEBNME4QTwBP4FDQUcBSsFOgVJBVgFZwV3BYYFlgWmBbUFxQXVBeUF9gYGBhYGJwY3BkgGWQZqBnsGjAadBq8GwAbRBuMG9QcHBxkHKwc9B08HYQd0B4YHmQesB78H0gflB/gICwgfCDIIRghaCG4IggiWCKoIvgjSCOcI+wkQCSUJOglPCWQJeQmPCaQJugnPCeUJ+woRCicKPQpUCmoKgQqYCq4KxQrcCvMLCwsiCzkLUQtpC4ALmAuwC8gL4Qv5DBIMKgxDDFwMdQyODKcMwAzZDPMNDQ0mDUANWg10DY4NqQ3DDd4N+A4TDi4OSQ5kDn8Omw62DtIO7g8JDyUPQQ9eD3oPlg+zD88P7BAJECYQQxBhEH4QmxC5ENcQ9RETETERTxFtEYwRqhHJEegSBxImEkUSZBKEEqMSwxLjEwMTIxNDE2MTgxOkE8UT5RQGFCcUSRRqFIsUrRTOFPAVEhU0FVYVeBWbFb0V4BYDFiYWSRZsFo8WshbWFvoXHRdBF2UXiReuF9IX9xgbGEAYZRiKGK8Y1Rj6GSAZRRlrGZEZtxndGgQaKhpRGncanhrFGuwbFBs7G2MbihuyG9ocAhwqHFIcexyjHMwc9R0eHUcdcB2ZHcMd7B4WHkAeah6UHr4e6R8THz4faR+UH78f6iAVIEEgbCCYIMQg8CEcIUghdSGhIc4h+yInIlUigiKvIt0jCiM4I2YjlCPCI/AkHyRNJHwkqyTaJQklOCVoJZclxyX3JicmVyaHJrcm6CcYJ0kneierJ9woDSg/KHEooijUKQYpOClrKZ0p0CoCKjUqaCqbKs8rAis2K2krnSvRLAUsOSxuLKIs1y0MLUEtdi2rLeEuFi5MLoIuty7uLyQvWi+RL8cv/jA1MGwwpDDbMRIxSjGCMbox8jIqMmMymzLUMw0zRjN/M7gz8TQrNGU0njTYNRM1TTWHNcI1/TY3NnI2rjbpNyQ3YDecN9c4FDhQOIw4yDkFOUI5fzm8Ofk6Njp0OrI67zstO2s7qjvoPCc8ZTykPOM9Ij1hPaE94D4gPmA+oD7gPyE/YT+iP+JAI0BkQKZA50EpQWpBrEHuQjBCckK1QvdDOkN9Q8BEA0RHRIpEzkUSRVVFmkXeRiJGZ0arRvBHNUd7R8BIBUhLSJFI10kdSWNJqUnwSjdKfUrESwxLU0uaS+JMKkxyTLpNAk1KTZNN3E4lTm5Ot08AT0lPk0/dUCdQcVC7UQZRUFGbUeZSMVJ8UsdTE1NfU6pT9lRCVI9U21UoVXVVwlYPVlxWqVb3V0RXklfgWC9YfVjLWRpZaVm4WgdaVlqmWvVbRVuVW+VcNVyGXNZdJ114XcleGl5sXr1fD19hX7NgBWBXYKpg/GFPYaJh9WJJYpxi8GNDY5dj62RAZJRk6WU9ZZJl52Y9ZpJm6Gc9Z5Nn6Wg/aJZo7GlDaZpp8WpIap9q92tPa6dr/2xXbK9tCG1gbbluEm5rbsRvHm94b9FwK3CGcOBxOnGVcfByS3KmcwFzXXO4dBR0cHTMdSh1hXXhdj52m3b4d1Z3s3gReG54zHkqeYl553pGeqV7BHtje8J8IXyBfOF9QX2hfgF+Yn7CfyN/hH/lgEeAqIEKgWuBzYIwgpKC9INXg7qEHYSAhOOFR4Wrhg6GcobXhzuHn4gEiGmIzokziZmJ/opkisqLMIuWi/yMY4zKjTGNmI3/jmaOzo82j56QBpBukNaRP5GokhGSepLjk02TtpQglIqU9JVflcmWNJaflwqXdZfgmEyYuJkkmZCZ/JpomtWbQpuvnByciZz3nWSd0p5Anq6fHZ+Ln/qgaaDYoUehtqImopajBqN2o+akVqTHpTilqaYapoum/adup+CoUqjEqTepqaocqo+rAqt1q+msXKzQrUStuK4trqGvFq+LsACwdbDqsWCx1rJLssKzOLOutCW0nLUTtYq2AbZ5tvC3aLfguFm40blKucK6O7q1uy67p7whvJu9Fb2Pvgq+hL7/v3q/9cBwwOzBZ8Hjwl/C28NYw9TEUcTOxUvFyMZGxsPHQce/yD3IvMk6ybnKOMq3yzbLtsw1zLXNNc21zjbOts83z7jQOdC60TzRvtI/0sHTRNPG1EnUy9VO1dHWVdbY11zX4Nhk2OjZbNnx2nba+9uA3AXcit0Q3ZbeHN6i3ynfr+A24L3hROHM4lPi2+Nj4+vkc+T85YTmDeaW5x/nqegy6LzpRunQ6lvq5etw6/vshu0R7ZzuKO6070DvzPBY8OXxcvH/8ozzGfOn9DT0wvVQ9d72bfb794r4Gfio+Tj5x/pX+uf7d/wH/Jj9Kf26/kv+3P9t//9wYXJhAAAAAAADAAAAAmZmAADypwAADVkAABPQAAAKW3ZjZ3QAAAAAAAAAAQABAAAAAAAAAAEAAAABAAAAAAAAAAEAAAABAAAAAAAAAAEAAG5kaW4AAAAAAAAANgAArhQAAFHsAABD1wAAsKQAACZmAAAPXAAAUA0AAFQ5AAIzMwACMzMAAjMzAAAAAAAAAABtbW9kAAAAAAAABhAAAKBJ/WJtYgAAAAAAAAAAAAAAAAAAAAAAAAAAdmNncAAAAAAAAwAAAAJmZgADAAAAAmZmAAMAAAACZmYAAAACMzM0AAAAAAIzMzQAAAAAAjMzNABWUDhMDAgAAC+mwn8QpyAQSMLYn3WIGZkKhW3btqnsdFcJacAxMAAGBgYGAACOw1Hctm1k7T927qT9R8QEaDtE/FZ5UO8LhGHLUgqy7cQVowfIWDEhwoT9b7b9e5aTpx6I6P8EyHJsO26jx5kgQUx4+19tT35MotP6iuj/BGD7f/t/+3/7f/t/+3/7f/t/+3/7f/t/+3/7/3/+hljqtV/aV7NvrbUvIiKRxeWhX/Cw56bPVZ5L2HD16PdsHy99PuQ5B4V09Kc67bnrR/mYKNf1B3/bc9PnUz4yauijtY+XPld5Lnzp+uynfdSPhzwnNlSl87bnrh/lI2xR+V3z173+usRfB5YWQJ8/c45aIjxZQV8tgTNJU9XTEzReed/VEVOAUz3V8TKQUz0VlwWd6o6wKPjNvaR0hZeUnviSUs2cbPg0YzLo00xJxU8zJIE/TYzI5u8ERjJ/uhwisvnTzkj6D6AJEen/AY5DxC3+tCEibvGnHhFxk7/OiEjFTz0k4id9nRIR3zZ66jAREZ+q1U5UIcUyUYupCZR6pBpRBalE1ETKEaVIySIqItWJKkhlohpSnqiJlBygNlMDKGWqvKXCW0qIikzNt1QFKjAVgRKm3VtK1luq4TSpyjgNqjxOlSrZNCWsOk0eqwLTFqwDTJ0rOSxlsCZLHqyK0hKwI0qNLEEpoTVJcmg1kJagnUCqbDmQIluyORK4O0aTroxRpStgFOiSA9ERvAdEg68CUeErQhT4Eoa2AD4R6oRVhDJhCSFPmCNoC+ILoM5YAygxlgFyjHl+lkC+8WmUDXwSZQUfR1mgZwrm9FTOJjyRswqPcB7ZGaAJO4W0hU4grZFzhPREzkDNk1NQkw2OZ61zs4X1zE2HLXCTYZODjadtULOF9kpNwy1Sk3ATahxvk5klvDdmGnCJmQicY0aIX8RM5DoxFblMTETOA3OE+cPLgG7wUqArvAToAi5HqMdlYDdpydhVWjx2EZYt2DtYOneyWMngNVYceBmVJeB7VBp5sklJ6HVSHHoFlCXoB1Aqe3I4ifBNTgT+ismkL2JS6RNMAn4TkiP4N0gGfwmS8+efg6T8/JONyA0CdkQaAzIilQEBkcwAOYDcoOAApHGgAHJwIAKSOCB8DJBw4nGxoOJxsCDhARY6OowGsuBQHjQ4hAcZDvDQs9GJIBuNkwkDjcKEQsYNJgYyGhWEjIMLk4sbXKxcKBkiF4kMgkUDGxcVmQ4NigY6JiZm4oNn4gQhNxEGRnYgZqZEBqKCkoGHBlIeGgysHDCMRIvKwkigZURhJBCThJHAzMlBAzcbBifImSAYBex0DCgIugCwDIb2x2cCjuaH1wQs9U9unAlEPQ/t7jWDq+NpDbNLJYOv5flMM7tUq4iAueGRDLOuqiKSweOHMM3sUq0iAlbPH9swa6oqIhkUrz+oaWaqWkUKCB9/NsOsqaqIJLDf/TSmmalqFSkIhuv7G2ZNVUUkITK272iamapWkYI4mb+JYdZUVUQSgqb/sqaZqWoVKYih+wsZZk1VRSQhoParppmpahUpCK/F2jBrqioiCbE2mPiuqlWkIPQeCwsReJqQCFRNaASKJiwCiYkVgqaJEoGaiTMCJRM9AjkTdwSSbWHlCNRN1AiUTbQIFEyMCCTHwkoRaJg4IlAxoREomrAIJCZWCJomJAJVE2cESiZ6BHImZgSSZWGVCNRM1AiUTbQI5E3cEUi2hZUi0DBxRKBi4opAwcSIQGJihaBpQiJQNaERKJqwCCQmZghaFlaJQM3EGYGSiRaBvIk7Asm2sHIE6iZqBMommvzgciSY+PGd/cz0kEPAL1thx6BgrStxo3Kw7kKNCMKalRlCwlrCjInCLMRoKKxBjMTCOnnhYJiJFrJYWCcvOgyDFxmGlWnhaai0kAOD8mLAYLwob6nwlpLX1GShE6OyoMSILBzEcCwkYsgioYOZjQShRgbBQE0PgnBDNgYXyNkpGGBngWAkegQGRgI/DwEXGDqfnwkoWp9eF5A0zCevR8L2//Y/QaVqMzNTPfI7yYeqmdmlVWhXdKxfP3tN7yLVPtevNy18S3Ws37XJe5C2ftdRE9WSzvW7m7wDsfW7TyXaca8/tCX/Ul9/6C0kc0M/PQ/v0tFPt8SwsNTg5VtXg6PwKxw1ackvN9XkLOzKanUkr9xSo7NyK6jdkXxyS83OwqxwDK3mU1fDs/DKLTV9elTV9Ei06mq8+BPU+MWqpNaHP9vaElJtc0u9qWr+5lRV+zP54o69dTLKnQuW+lL1wptRWW+crrhzw6qEWles6knWKwefgt7ZPRl3rEyncslKfji99KTTvOXwI91idNJbLz/aLYtN8RrzY15TyJSvmX7otQeZ6jXr/WgUKF7Et8C8R15Pj1L27xz9uSiZ6j3JC//6gJv3nGSK1ww/9jVCJn9N92Nck8gk+5bTj3rLDTb3W4of4ZZGp3zJDUf3JQed3Lnj8qTdMcHnfkf2JNzRCBWuMLg6r8iEknmD+BJvMDA6XGBwdl6QKSXdXvEm2LvAaXesKdxt1mYilSRjA/66ZUxA62pqZockHFMKYndLApeTpQZmu2WnwulsZ4DbblqpcDtb6YlcIt3EFDgej4kGghcDI8P1sD43Kyge1qcU7tdPjQKWl/MJK3iBYX5iVhDd1f2vTPAS4/xXtyaQPY9/cF8ZL9K3/Q/6AcqnOs/vRj8LXmcoY/1umh6gvo8xCl5tjFEytv+3/7f/t/+3/7f/t/+3/7f/t/+3/7f//+Mf" className="w-7 h-7 object-contain" /> 방출 게임 마켓</h2>
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
            <button key={f.key} onClick={() => setFilter(f.key as any)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${filter === f.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-sm text-gray-400">{filtered.length}개</span>
        </div>
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