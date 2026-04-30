import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';
import {
  Shield, Users, BarChart3, Database, ChevronDown, ChevronUp, SlidersHorizontal,
  CheckCircle, XCircle, X, RefreshCw, Loader2,
  Check, HardDrive, TrendingUp, Plus,
  Activity, Clock, AlertCircle, Gamepad2, List, Calendar,
  Eye, MessageSquare, Trophy, Megaphone, Save, ToggleLeft, ToggleRight, Star, Trash2, Gift, Camera, Heart, Link
} from 'lucide-react';
import type { BoardGame } from '../App';

const supabase = getSupabaseClient();

// ─── Types ─────────────────────────────────────────────────────────────────

interface CustomPost {
  id: string; gameId: string; gameName: string; category: string;
  postType: 'info' | 'post'; title: string; description: string;
  link: string; sizeInfo: string; images: string[]; data: any;
  status: 'pending' | 'approved' | 'rejected';
  created_by: string; created_by_email: string; created_at: string;
  likes: number; liked_by: string[]; rejectionReason?: string;
}

interface BetaTester {
  userId: string; email: string; name: string; username: string;
  phone: string; reason: string; status: 'pending' | 'approved' | 'rejected';
  created_at: string; reviewed_at?: string; rejection_reason?: string;
  ownedCount?: number; wishlistCount?: number; signup_ip?: string | null;
}

interface AnalyticsStats {
  totalVisits: number; uniqueVisitors: number;
  todayVisitsCount: number; todayUniqueVisitors: number;
  totalUsers: number; approvedUsers: number; pendingUsers: number;
  todayUsersCount: number;
  totalOwnedGames: number; totalWishlistGames: number;
}

interface BackupEntry {
  key: string; gameCount: number; createdAt: string;
  userData: { ownedCount: number; wishlistCount: number; playRecordsCount: number; };
}

interface BackupData {
  userId: string;
  userName?: string;
  userEmail?: string;
  backupCount: number;
  backups: BackupEntry[];
}

function fmtSleepHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const CATEGORIES: { [key: string]: string } = {
  sleeve: '슬리브', organizer: '오거나이저', component: '컴포 업그레이드',
  rulebook: '설명서/룰북', '3dprint': '3D프린팅', storage: '보관/케이스',
  gallery: '커스텀 작업 갤러리',
};

// ─── Shared ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string | number; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${color}`}>{icon}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function UserDataModal({ isOpen, onClose, userId, userName, accessToken }: {
  isOpen: boolean; onClose: () => void; userId: string; userName: string; accessToken: string;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [ownedGames, setOwnedGames] = useState<BoardGame[]>([]);
  const [wishlistGames, setWishlistGames] = useState<BoardGame[]>([]);
  const [activeTab, setActiveTab] = useState<'owned' | 'wishlist'>('owned');

  useEffect(() => {
    if (isOpen && userId) { setIsLoading(true); loadData(); }
  }, [isOpen, userId]);

  const loadData = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/user-data/${userId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) { const d = await res.json(); setOwnedGames(d.ownedGames || []); setWishlistGames(d.wishlistGames || []); }
    } finally { setIsLoading(false); }
  };

  if (!isOpen) return null;
  const games = activeTab === 'owned' ? ownedGames : wishlistGames;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{userName}님의 게임 목록</h2>
            <p className="text-xs text-gray-400 mt-0.5">{userId}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-3 border-b flex gap-3">
          {(['owned', 'wishlist'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeTab === t ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t === 'owned' ? `보유 (${ownedGames.length})` : `위시리스트 (${wishlistGames.length})`}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? <div className="flex justify-center h-32 items-center"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>
            : games.length === 0 ? <div className="text-center py-12 text-gray-400">게임이 없습니다</div>
            : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {games.map((game: any) => (
                  <div key={game.id} className="bg-gray-50 rounded-xl p-3 text-center">
                    {game.imageUrl && <img src={game.imageUrl} alt={game.koreanName} className="w-16 h-16 object-contain mx-auto mb-2 rounded" />}
                    <p className="text-xs font-medium text-gray-800 line-clamp-2">{game.koreanName}</p>
                    {game.rating && <p className="text-xs text-yellow-500 mt-0.5">★ {game.rating}</p>}
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// ─── Approval ───────────────────────────────────────────────────────────────

function renderPostPreview(post: CustomPost) {
  // 슬리브: 카드 크기 시각화
  if (post.postType === 'info' && post.category === 'sleeve' && post.data?.cards) {
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">슬리브 카드 정보</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {post.data.cards.map((card: any, idx: number) => {
            const max = Math.max(card.width, card.height);
            const s = 100 / max;
            return (
              <div key={idx} className="flex flex-col items-center p-3 bg-gray-50 rounded-xl">
                <div className="bg-white border-2 border-gray-300 rounded flex items-center justify-center shadow-sm mb-2"
                  style={{ width: `${card.width * s}px`, height: `${card.height * s}px`, minWidth: 40, minHeight: 40 }}>
                  <div className="text-center text-xs text-gray-500">
                    <div className="font-medium">{card.width}×{card.height}mm</div>
                    <div>{card.quantity}장</div>
                  </div>
                </div>
                <p className="text-xs font-medium text-gray-800">{card.name}</p>
              </div>
            );
          })}
        </div>
        {post.data.recommendedProduct && (
          <p className="text-sm text-gray-700"><span className="font-medium">추천 제품:</span> {post.data.recommendedProduct}</p>
        )}
        {post.data.purchaseLinks?.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">구매 링크</p>
            {post.data.purchaseLinks.map((l: any, i: number) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm block ml-2">🔗 {l.name || `링크 ${i + 1}`}</a>
            ))}
          </div>
        )}
        {post.data.purchaseLink && !post.data.purchaseLinks && (
          <a href={post.data.purchaseLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm block">🔗 구매 링크</a>
        )}
      </div>
    );
  }

  // 일반 / 기타 정보형
  const allImages = [...(post.images || []), ...(post.data?.images || [])].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* 게임 이름 */}
      {post.gameName && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-sm text-slate-700 font-medium">
          🎲 {post.gameName}
        </div>
      )}

      {/* 내용 */}
      {post.description && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">내용</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3">{post.description}</p>
        </div>
      )}

      {/* 정보형 데이터 */}
      {post.postType === 'info' && post.data && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            ['제품명', post.data.productName],
            ['브랜드', post.data.brand],
            ['컴포 종류', post.data.componentType],
            ['기본 수량', post.data.originalQuantity],
            ['특이사항', post.data.notes],
            ['후기', post.data.review],
          ].filter(([, v]) => v !== undefined && v !== null && v !== '').map(([label, val]) => (
            <div key={label as string} className={`bg-gray-50 rounded-lg p-2.5 ${String(val).length > 30 ? 'col-span-2' : ''}`}>
              <p className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">{label}</p>
              <p className="text-gray-800">{String(val)}</p>
            </div>
          ))}
        </div>
      )}

      {/* 링크 */}
      {(post.link || post.data?.purchaseLinks?.length > 0 || post.data?.purchaseLink || post.data?.printFileLink) && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">링크</p>
          <div className="space-y-1">
            {post.link && <a href={post.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">🔗 게시물 링크</a>}
            {post.data?.purchaseLinks?.map((l: any, i: number) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">🔗 {l.name || `구매 링크 ${i + 1}`}</a>
            ))}
            {post.data?.purchaseLink && !post.data?.purchaseLinks && (
              <a href={post.data.purchaseLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">🔗 구매 링크</a>
            )}
            {post.data?.printFileLink && (
              <a href={post.data.printFileLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">📄 3D프린트 파일</a>
            )}
          </div>
        </div>
      )}

      {/* 사이즈 정보 */}
      {post.sizeInfo && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">사이즈 정보</p>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{post.sizeInfo}</p>
        </div>
      )}

      {/* 태그 */}
      {post.data?.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {post.data.tags.map((tag: string, i: number) => (
            <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs rounded-full font-medium">#{tag}</span>
          ))}
        </div>
      )}

      {/* 이미지 */}
      {allImages.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">이미지 ({allImages.length})</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {allImages.map((img: string, i: number) => (
              <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                <img src={img} alt={`이미지 ${i + 1}`} className="w-full h-32 object-cover rounded-xl hover:opacity-90 transition-opacity cursor-zoom-in" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalSection({ accessToken }: { accessToken: string }) {
  const [posts, setPosts] = useState<CustomPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/pending/all`,
        { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) { const d = await res.json(); setPosts(d.posts || []); }
    } finally { setLoading(false); }
  };

  const handle = async (postId: string, status: 'approved' | 'rejected') => {
    let reason: string | undefined;
    if (status === 'rejected') { const r = prompt('반려 사유:'); if (!r) return; reason = r; }
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/${postId}/status`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ status, rejectionReason: reason }) });
    if (res.ok) { toast.success(status === 'approved' ? '승인되었습니다' : '반려되었습니다'); setExpandedId(null); load(); }
    else toast.error('처리 실패');
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>;

  if (posts.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <CheckCircle className="w-12 h-12 text-green-400 mb-3" />
      <p className="font-medium text-gray-600">승인 대기 게시물 없음</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">대기 중 <span className="font-semibold text-orange-500">{posts.length}건</span></span>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"><RefreshCw className="w-3.5 h-3.5" /> 새로고침</button>
      </div>
      {posts.map(post => (
        <div key={post.id} className={`bg-white rounded-xl border transition-all ${expandedId === post.id ? 'border-orange-300 shadow-md' : 'border-gray-200 shadow-sm'}`}>
          {/* 헤더 */}
          <button className="w-full p-5 text-left" onClick={() => setExpandedId(expandedId === post.id ? null : post.id)}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">대기중</span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{CATEGORIES[post.category] || post.category}</span>
                  {post.postType === 'info' && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">정보형</span>}
                  {post.postType === 'post' && <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded-full">게시글</span>}
                </div>
                <h3 className="font-semibold text-gray-900">{post.title}</h3>
                <p className="text-sm text-gray-500 mt-1">{post.created_by_email} · {new Date(post.created_at).toLocaleDateString('ko-KR')}</p>
              </div>
              {expandedId === post.id
                ? <ChevronUp className="w-5 h-5 text-gray-400 shrink-0 mt-1" />
                : <ChevronDown className="w-5 h-5 text-gray-400 shrink-0 mt-1" />}
            </div>
          </button>

          {/* 펼침: 상세 내용 */}
          {expandedId === post.id && (
            <div className="border-t border-gray-100">
              <div className="p-5">
                {renderPostPreview(post)}
              </div>
              <div className="flex gap-2 justify-end p-4 bg-gray-50 rounded-b-xl border-t border-gray-100">
                <button onClick={() => handle(post.id, 'rejected')} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                  <XCircle className="w-4 h-4" /> 반려
                </button>
                <button onClick={() => handle(post.id, 'approved')} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors">
                  <CheckCircle className="w-4 h-4" /> 승인
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Members ────────────────────────────────────────────────────────────────

function MembersSection({ accessToken }: { accessToken: string }) {
  const [testers, setTesters] = useState<BetaTester[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'games' | 'cards'>('newest');
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const [expandedReason, setExpandedReason] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [grantTarget, setGrantTarget] = useState<{ userId: string; userName: string; currentCards?: number } | null>(null);
  const [grantAmount, setGrantAmount] = useState(1);
  const [grantLoading, setGrantLoading] = useState(false);
  // 유저별 보너스카드 수 캐시 (userId → count)
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({});
  const [cardCountsLoading, setCardCountsLoading] = useState(false);
  // 카드 이력 모달
  const [cardHistoryTarget, setCardHistoryTarget] = useState<{ userId: string; userName: string } | null>(null);
  const [cardHistory, setCardHistory] = useState<any[]>([]);
  const [cardHistoryLoading, setCardHistoryLoading] = useState(false);

  const [displayCount, setDisplayCount] = useState(10);
  const PAGE_SIZE = 10;
  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      // ✅ 게임 데이터 제외하고 빠르게 로드 (includeGameData=false)
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/beta-testers?limit=1000&offset=0&includeGameData=false`,
        { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const d = await res.json();
        const testerList: BetaTester[] = d.testers || [];
        setTesters(testerList);
        // 승인된 유저들의 카드 수를 병렬로 로드
        loadAllCardCounts(testerList.filter(t => t.status === 'approved').map(t => t.userId));
      } else {
        toast.error('가입자 목록 로드 실패');
      }
    } finally { setLoading(false); }
  };

  // 여러 유저의 카드 수를 bulk API로 한 번에 조회
  const loadAllCardCounts = async (userIds: string[]) => {
    if (userIds.length === 0) return;
    setCardCountsLoading(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/users/bulk-bonus-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ userIds }),
      });
      if (res.ok) {
        const d = await res.json();
        setCardCounts(prev => ({ ...prev, ...(d.cards || {}) }));
      }
    } catch {}
    setCardCountsLoading(false);
  };

  // 카드 이력 모달 열기
  const openCardHistory = async (userId: string, userName: string) => {
    setCardHistoryTarget({ userId, userName });
    setCardHistory([]);
    setCardHistoryLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/users/${userId}/card-history`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const d = await res.json();
        setCardHistory(d.history || []);
      } else {
        toast.error('카드 이력 조회 실패');
      }
    } catch (e) {
      toast.error('카드 이력 조회 오류');
    } finally {
      setCardHistoryLoading(false);
    }
  };

  // 특정 유저 카드 수 갱신
  const refreshCardCount = async (userId: string) => {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/users/${userId}/bonus-cards`,
        { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const d = await res.json();
        setCardCounts(prev => ({ ...prev, [userId]: typeof d.cards === 'number' ? d.cards : 0 }));
      }
    } catch {}
  };

  const approve = async (userId: string) => {
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/beta-testers/${userId}/status`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ status: 'approved' }) });
    if (res.ok) { toast.success('승인되었습니다'); load(); } else { const d = await res.json().catch(() => ({})); toast.error(`처리 실패: ${d.error || res.status}`); }
  };

  const reject = async (userId: string) => {
    const reason = prompt('반려 사유:');
    if (!reason) return;
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/beta-testers/${userId}/status`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ status: 'rejected', reason }) });
    if (res.ok) { toast.success('반려되었습니다'); load(); } else { const d = await res.json().catch(() => ({})); toast.error(`처리 실패: ${d.error || res.status}`); }
  };

  const suspend = async (userId: string, userName: string) => {
    if (!confirm(`${userName}님을 3일 정지하시겠어요?`)) return;
    const until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/users/${userId}/suspend`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ until }) });
    if (res.ok) { toast.success(`${userName}님을 3일 정지했어요`); load(); }
    else { const d = await res.json().catch(() => ({})); toast.error(`처리 실패: ${d.error || res.status}`); }
  };

  const openGrantModal = async (userId: string, userName: string) => {
    setGrantAmount(1);
    setGrantTarget({ userId, userName, currentCards: undefined });
    // 현재 보유 카드 수 조회
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/users/${userId}/bonus-cards`,
        { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const d = await res.json();
        const cards = typeof d.cards === 'number' ? d.cards : 0;
        setGrantTarget({ userId, userName, currentCards: cards });
        // 목록 캐시도 동기화
        setCardCounts(prev => ({ ...prev, [userId]: cards }));
      }
    } catch {}
  };

  const handleGrantCards = async () => {
    if (!grantTarget) return;
    setGrantLoading(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/users/${grantTarget.userId}/grant-bonus-cards`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ amount: grantAmount }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`🃏 ${grantTarget.userName}님에게 보너스카드 ${grantAmount}장 지급 완료! (지급 전 ${d.before ?? '?'}장 → 현재 ${d.cards}장)`);
        // 목록의 카드 수 즉시 갱신
        if (typeof d.cards === 'number') {
          setCardCounts(prev => ({ ...prev, [grantTarget.userId]: d.cards }));
        }
        setGrantTarget(null);
      } else {
        console.error('보너스카드 지급 실패:', res.status, d);
        toast.error(d.error || `지급 실패 (${res.status})`);
      }
    } catch (e) {
      console.error('보너스카드 지급 오류:', e);
      toast.error('카드 지급 중 오류가 발생했어요');
    } finally {
      setGrantLoading(false);
    }
  };

  const forceWithdraw = async (userId: string, userName: string) => {
    if (!confirm(`${userName}님을 강제탈퇴 시키겠어요? 이 작업은 되돌릴 수 없어요.`)) return;
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/users/${userId}/force-withdraw`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) { toast.success(`${userName}님을 강제탈퇴 했어요`); load(); }
    else { const d = await res.json().catch(() => ({})); toast.error(`처리 실패: ${d.error || res.status}`); }
  };

  const filtered = testers
    .filter(t => filter === 'all' || t.status === filter)
    .filter(t => !searchQuery || 
      t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.username?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === 'cards') return (cardCounts[b.userId] ?? 0) - (cardCounts[a.userId] ?? 0);
      return 0;
    });


  const paginated = filtered.slice(0, displayCount);
  const hasMore = displayCount < filtered.length;
  const counts = {
    all: testers.length,
    pending: testers.filter(t => t.status === 'pending').length,
    approved: testers.filter(t => t.status === 'approved').length,
    rejected: testers.filter(t => t.status === 'rejected').length,
  };

  const statusStyle = { pending: 'bg-orange-100 text-orange-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700' };
  const statusLabel = { pending: '대기중', approved: '승인됨', rejected: '반려됨' };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>;

  return (
    <>
      {selectedUser && <UserDataModal isOpen={true} onClose={() => setSelectedUser(null)} userId={selectedUser.id} userName={selectedUser.name} accessToken={accessToken} />}

      {/* 카드 획득 이력 모달 */}
      {cardHistoryTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setCardHistoryTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center gap-3 p-5 border-b border-gray-100">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <span className="text-lg">🃏</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900">카드 획득 이력</h3>
                <p className="text-sm text-gray-500 truncate">{cardHistoryTarget.userName}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-orange-50 text-orange-600 rounded-full text-xs font-bold border border-orange-200">
                  현재 {cardCounts[cardHistoryTarget.userId] ?? '?'}장
                </span>
                <button onClick={() => setCardHistoryTarget(null)} className="text-gray-400 hover:text-gray-600 ml-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 본문 */}
            <div className="overflow-y-auto flex-1 p-4">
              {cardHistoryLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                </div>
              ) : cardHistory.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <div className="text-3xl mb-2">🃏</div>
                  <p className="text-sm">카드 획득 이력이 없습니다</p>
                  <p className="text-xs text-gray-300 mt-1">이전 지급 내역은 기록되지 않았을 수 있어요</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cardHistory.map((h: any, i: number) => {
                    const isAdminGrant = h.type === 'admin_grant';
                    const isActivityPost = h.type === 'activity_post';
                    const isActivityComment = h.type === 'activity_comment';
                    const isReferral = h.type === 'referral';
                    const isLevelup = h.type === 'levelup';

                    const iconEmoji = isAdminGrant ? '🎁'
                      : isActivityPost ? '✍️'
                      : isActivityComment ? '💬'
                      : isReferral ? '🤝'
                      : isLevelup ? '🏆'
                      : '🃏';

                    const colorClass = isAdminGrant ? 'bg-purple-50 border-purple-100'
                      : isActivityPost ? 'bg-blue-50 border-blue-100'
                      : isActivityComment ? 'bg-green-50 border-green-100'
                      : isReferral ? 'bg-cyan-50 border-cyan-100'
                      : isLevelup ? 'bg-yellow-50 border-yellow-100'
                      : 'bg-gray-50 border-gray-100';

                    const textColor = isAdminGrant ? 'text-purple-700'
                      : isActivityPost ? 'text-blue-700'
                      : isActivityComment ? 'text-green-700'
                      : isReferral ? 'text-cyan-700'
                      : isLevelup ? 'text-yellow-700'
                      : 'text-gray-700';

                    const subText = isAdminGrant && h.grantedBy
                      ? `지급자: ${h.grantedBy}`
                      : isReferral && h.refereeName
                      ? `초대 대상: ${h.refereeName}`
                      : isLevelup && h.tierName
                      ? `달성 등급: ${h.tierName}`
                      : '';

                    const dateStr = h.grantedAt
                      ? new Date(h.grantedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '-';

                    return (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${colorClass}`}>
                        <span className="text-xl shrink-0">{iconEmoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${textColor}`}>{h.source || h.type}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {dateStr}{subText ? ` · ${subText}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold text-gray-800">+{h.amount ?? 1}장</span>
                          {h.cardsAfter !== undefined && (
                            <p className="text-[10px] text-gray-400">{h.cardsBefore ?? '?'} → {h.cardsAfter}장</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 보너스카드 지급 모달 */}
      {grantTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <Gift className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">보너스카드 지급</h3>
                <p className="text-sm text-gray-500">{grantTarget.userName}님</p>
              </div>
              <button onClick={() => setGrantTarget(null)} className="ml-auto text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {grantTarget.currentCards !== undefined && (
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">현재 보유 카드</span>
                <span className="font-bold text-gray-900">🃏 {grantTarget.currentCards}장</span>
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">지급할 카드 수</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setGrantAmount(a => Math.max(1, a - 1))}
                  className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg font-bold"
                >−</button>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={grantAmount}
                  onChange={e => setGrantAmount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                  className="flex-1 text-center text-2xl font-bold border border-gray-200 rounded-xl py-2 focus:outline-none focus:border-cyan-400"
                  style={{ fontSize: '20px' }}
                />
                <button
                  onClick={() => setGrantAmount(a => Math.min(100, a + 1))}
                  className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg font-bold"
                >+</button>
              </div>
              <div className="flex gap-2 mt-3">
                {[1, 3, 5, 10].map(n => (
                  <button key={n} onClick={() => setGrantAmount(n)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${grantAmount === n ? 'bg-cyan-500 text-white border-cyan-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {n}장
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setGrantTarget(null)}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button onClick={handleGrantCards} disabled={grantLoading}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-yellow-400 rounded-xl hover:bg-yellow-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {grantLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                {grantAmount}장 지급
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 검색창 */}
      <div className="mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setDisplayCount(PAGE_SIZE); }}
          placeholder="이름, 이메일, 닉네임 검색..."
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400"
          style={{ fontSize: '16px' }}
        />
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setDisplayCount(PAGE_SIZE); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f === 'all' ? '전체' : statusLabel[f]} ({counts[f]})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <select value={sort} onChange={e => { setSort(e.target.value as any); setDisplayCount(PAGE_SIZE); }}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-cyan-400">
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="cards">🃏 카드 많은순</option>
            </select>
            {cardCountsLoading && sort === 'cards' && (
              <span className="text-[10px] text-orange-400 animate-pulse">카드 로딩중...</span>
            )}
          </div>
          <button onClick={load} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100">
            <RefreshCw className="w-3.5 h-3.5" /> 새로고침
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">해당하는 사용자가 없습니다</div>
        ) : paginated.map(t => (
          <div key={t.userId} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow">
            {/* ── 상단: 아바타 + 기본 정보 ── */}
            <div className="p-3 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm shrink-0 mt-0.5">
                {t.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{t.name}</span>
                  {t.username && <span className="text-xs text-gray-400">@{t.username}</span>}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusStyle[t.status]}`}>{statusLabel[t.status]}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{t.email}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] text-gray-400">{new Date(t.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })} 가입</span>
                  {t.signup_ip && <span className="text-[10px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">IP: {t.signup_ip}</span>}
                  {t.ownedCount !== undefined && t.ownedCount > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-gray-500 font-medium">
                      <Trophy className="w-3 h-3 text-yellow-400" />{t.ownedCount}보유
                    </span>
                  )}
                  {t.status === 'approved' && (
                    <button
                      onClick={() => openCardHistory(t.userId, t.name)}
                      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-all hover:scale-105 active:scale-95 ${(cardCounts[t.userId] ?? 0) > 0 ? 'bg-orange-50 text-orange-500 border-orange-200 hover:bg-orange-100' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}
                      title="카드 획득 이력 보기"
                    >
                      🃏 {cardCounts[t.userId] !== undefined ? `${cardCounts[t.userId]}장` : '…'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── 하단: 액션 버튼들 (wrap) ── */}
            <div className="px-3 pb-3 pt-2 flex items-center gap-1.5 flex-wrap border-t border-gray-100">
              {t.reason && (
                <button onClick={() => setExpandedReason(expandedReason === t.userId ? null : t.userId)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${expandedReason === t.userId ? 'bg-amber-50 text-amber-600 border-amber-200' : 'text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                  <MessageSquare className="w-3.5 h-3.5" />사유
                </button>
              )}
              {t.status === 'approved' && (
                <button onClick={() => setSelectedUser({ id: t.userId, name: t.name })}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <Eye className="w-3.5 h-3.5" />게임
                </button>
              )}
              {t.status === 'pending' && (
                <>
                  <button onClick={() => reject(t.userId)} className="px-2.5 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">반려</button>
                  <button onClick={() => approve(t.userId)} className="px-2.5 py-1.5 text-xs text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors">승인</button>
                </>
              )}
              <button onClick={() => openGrantModal(t.userId, t.name || t.username || t.email)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-yellow-600 border border-yellow-200 rounded-lg hover:bg-yellow-50 transition-colors">
                <Gift className="w-3.5 h-3.5" />카드지급
              </button>
              <button onClick={() => suspend(t.userId, t.name || t.username || t.email)}
                className="px-2.5 py-1.5 text-xs text-orange-500 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors">
                3일정지
              </button>
              <button onClick={() => forceWithdraw(t.userId, t.name || t.username || t.email)}
                className="px-2.5 py-1.5 text-xs text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors">
                강제탈퇴
              </button>
            </div>

            {/* 신청 이유 */}
            {expandedReason === t.userId && t.reason && (
              <div className="border-t border-amber-100 bg-amber-50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 mb-1">베타 신청 이유</p>
                    <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">{t.reason}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 더보기 버튼 */}
      {hasMore && (
        <div className="flex flex-col items-center gap-3 mt-6">
          <div className="text-sm text-gray-500">
            {paginated.length}명 표시 중 / 전체 {filtered.length}명
          </div>
          <button 
            onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}
            className="flex items-center gap-2 px-6 py-2.5 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            더보기 (10명)
          </button>
        </div>
      )}

      {/* 전체 표시됨 메시지 */}
      {!hasMore && filtered.length > 0 && (
        <div className="text-center text-sm text-gray-400 mt-6">
          전체 {filtered.length}명 표시 완료
        </div>
      )}

      {/* 카드 마이그레이션 버튼 (구 userId 기반 ���드를 이메일 기반으로 이전) */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <button
          onClick={async () => {
            if (!confirm('기존 카드 데이터를 이메일 기반으로 마이그레이션합니다.\n지급됐지만 배너에 안 보이는 카드를 복구할 수 있습니다.\n계속할까요?')) return;
            try {
              const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/migrate-bonus-cards`,
                { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
              const d = await res.json().catch(() => ({}));
              if (res.ok) {
                toast.success(`✅ 카드 마이그레이션 완료! 이전됨: ${d.migrated}명, 스킵: ${d.skipped}명`);
                // 카드 수 새로고침
                const approvedIds = testers.filter(t => t.status === 'approved').map(t => t.userId);
                loadAllCardCounts(approvedIds);
              } else {
                toast.error(d.error || '마이그레이션 실패');
              }
            } catch (e) {
              toast.error('마이그레이션 오류');
            }
          }}
          className="w-full py-2 text-xs text-purple-600 border border-purple-200 rounded-xl hover:bg-purple-50 transition-colors"
        >
          🔧 카드 마이그레이션 실행 (구 userId→이메일 기반 이전)
        </button>
      </div>
    </>
  );
}

// ─── Analytics ──────────────────────────────────────────────────────────────

// ── 미니 바 차트 ──
function MiniBarChart({ data, color = '#06b6d4', height = 80 }: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  const barZone = height - 18;
  return (
    <div className="flex items-end gap-0.5 w-full" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center justify-end flex-1 min-w-0 h-full gap-0.5">
          <div
            title={`${d.label}: ${d.value}`}
            style={{ height: d.value > 0 ? Math.max(2, (d.value / max) * barZone) : 1, backgroundColor: d.value > 0 ? color : '#e5e7eb' }}
            className="w-full rounded-t-sm transition-all duration-300"
          />
          <span className="text-[8px] text-gray-400 truncate w-full text-center leading-tight">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── 수평 바 차트 ──
function HBarChart({ data }: { data: { label: string; value: number; color?: string }[] }) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map(d => d.value), 1);
  return (
    <div className="space-y-2.5">
      {sorted.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-16 flex-shrink-0 truncate text-right">{d.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden">
            <div
              style={{ width: `${Math.max(d.value > 0 ? 1 : 0, (d.value / max) * 100)}%`, backgroundColor: d.color || '#06b6d4' }}
              className="h-full rounded-full transition-all duration-500"
            />
          </div>
          <span className="text-xs font-bold text-gray-700 w-7 text-right">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── 기간별 카운트 헬퍼 ──
function getDailyCounts(items: any[], dateField: string, days = 14): { label: string; value: number }[] {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(now); day.setDate(day.getDate() - (days - 1 - i)); day.setHours(0, 0, 0, 0);
    const next = new Date(day); next.setDate(next.getDate() + 1);
    return {
      label: `${day.getMonth() + 1}/${day.getDate()}`,
      value: items.filter(item => { const t = new Date(item[dateField] || 0).getTime(); return !isNaN(t) && t >= day.getTime() && t < next.getTime(); }).length,
    };
  });
}
function getWeeklyCounts(items: any[], dateField: string, weeks = 8): { label: string; value: number }[] {
  const now = new Date(); now.setHours(23, 59, 59, 999);
  return Array.from({ length: weeks }, (_, i) => {
    const end = new Date(now); end.setDate(end.getDate() - (weeks - 1 - i) * 7);
    const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
    return {
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      value: items.filter(item => { const t = new Date(item[dateField] || 0).getTime(); return !isNaN(t) && t >= start.getTime() && t <= end.getTime(); }).length,
    };
  });
}
function getMonthlyCounts(items: any[], dateField: string, months = 6): { label: string; value: number }[] {
  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return {
      label: `${d.getMonth() + 1}월`,
      value: items.filter(item => { const t = new Date(item[dateField] || 0).getTime(); return !isNaN(t) && t >= d.getTime() && t < next.getTime(); }).length,
    };
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  '이벤트': '#ef4444', '자유': '#06b6d4', '정보': '#8b5cf6', '게임리뷰': '#f59e0b',
  '질문': '#10b981', '보드게임 소식': '#3b82f6', '보드게임 정보등록': '#6366f1',
  '재능판매': '#ec4899', '살래말래': '#14b8a6', '보드게임 QnA': '#f97316',
};

function AnalyticsSection({ accessToken }: { accessToken: string }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'posts' | 'ga4'>('overview');
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlineData, setOnlineData] = useState<{ count: number; users: { email: string; lastSeen: number }[] }>({ count: 0, users: [] });
  const [betaUsers, setBetaUsers] = useState<any[]>([]);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userPeriod, setUserPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // GA4 상태
  const [ga4PropId, setGa4PropId] = useState(() => localStorage.getItem('ga4_property_id') || '');
  const [ga4PropInput, setGa4PropInput] = useState(() => localStorage.getItem('ga4_property_id') || '');
  const [ga4TokenInput, setGa4TokenInput] = useState('');
  const [ga4Token, setGa4Token] = useState(() => localStorage.getItem('ga4_access_token') || '');
  const [ga4Data, setGa4Data] = useState<any>(null);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Error, setGa4Error] = useState<string | null>(null);

  const loadOnline = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/presence/online`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) setOnlineData(await res.json());
      else if (res.status === 403) {
        await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/setup-admin`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
        const r2 = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/presence/online`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (r2.ok) setOnlineData(await r2.json());
      }
    } catch {}
  };

  const loadStats = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/analytics/stats`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const d = await res.json();
        setStats({
          totalVisits: d.totalVisits ?? 0, uniqueVisitors: d.uniqueVisitors ?? 0,
          todayVisitsCount: d.todayVisitsCount ?? 0, todayUniqueVisitors: d.todayUniqueVisitors ?? 0,
          totalUsers: d.totalUsers ?? 0, approvedUsers: d.approvedUsers ?? 0,
          pendingUsers: d.pendingUsers ?? 0, todayUsersCount: d.todayUsersCount ?? 0,
          totalOwnedGames: d.totalOwnedGames ?? 0, totalWishlistGames: d.totalWishlistGames ?? 0,
        });
      } else { const e = await res.json().catch(() => ({})); setError(e.error || `오류 (${res.status})`); }
    } catch { setError('네트워크 오류'); }
    finally { setLoading(false); }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/beta-testers`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) { const d = await res.json(); setBetaUsers(Array.isArray(d) ? d : (d.testers ?? d.users ?? [])); }
    } catch {}
    finally { setUsersLoading(false); }
  };

  const loadPosts = async () => {
    setPostsLoading(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) { const d = await res.json(); setRecentPosts((Array.isArray(d) ? d : (d.posts ?? [])).filter((p: any) => !p.isDraft)); }
    } catch {}
    finally { setPostsLoading(false); }
  };

  const loadGA4 = async (token: string, propId: string) => {
    if (!token || !propId) return;
    setGa4Loading(true); setGa4Error(null);
    try {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const base = `https://analyticsdata.googleapis.com/v1beta/properties/${propId}`;

      const [rtRes, srcRes, pvRes] = await Promise.all([
        fetch(`${base}:runRealtimeReport`, { method: 'POST', headers, body: JSON.stringify({ metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }], dimensions: [{ name: 'unifiedScreenName' }], limit: 10 }) }),
        fetch(`${base}:runReport`, { method: 'POST', headers, body: JSON.stringify({ dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics: [{ name: 'sessions' }], dimensions: [{ name: 'sessionSource' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 }) }),
        fetch(`${base}:runReport`, { method: 'POST', headers, body: JSON.stringify({ dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], dimensions: [{ name: 'date' }], orderBys: [{ dimension: { dimensionName: 'date' } }] }) }),
      ]);

      if (!rtRes.ok) { const e = await rtRes.json().catch(() => ({})); throw new Error(e.error?.message || `GA4 오류 (${rtRes.status})`); }
      const rt = await rtRes.json();
      const src = srcRes.ok ? await srcRes.json() : null;
      const pv = pvRes.ok ? await pvRes.json() : null;

      setGa4Data({
        activeUsers: (rt.rows || []).reduce((s: number, r: any) => s + parseInt(r.metricValues?.[0]?.value || '0'), 0),
        topPages: (rt.rows || []).map((r: any) => ({ page: r.dimensionValues?.[0]?.value || '/', users: parseInt(r.metricValues?.[0]?.value || '0') })),
        sources: (src?.rows || []).map((r: any) => ({ source: r.dimensionValues?.[0]?.value || '(direct)', sessions: parseInt(r.metricValues?.[0]?.value || '0') })),
        pvTrend: (pv?.rows || []).map((r: any) => ({ date: r.dimensionValues?.[0]?.value || '', views: parseInt(r.metricValues?.[0]?.value || '0'), users: parseInt(r.metricValues?.[1]?.value || '0') })),
      });
    } catch (e: any) { setGa4Error(e.message || 'GA4 데이터를 불러올 수 없습니다'); }
    finally { setGa4Loading(false); }
  };

  const connectGA4 = () => {
    const t = ga4TokenInput || ga4Token;
    const p = ga4PropInput;
    if (p) localStorage.setItem('ga4_property_id', p);
    if (t) localStorage.setItem('ga4_access_token', t);
    setGa4PropId(p); setGa4Token(t);
    loadGA4(t, p);
  };

  useEffect(() => {
    loadStats();
    setTimeout(() => loadOnline(), 500);
    setTimeout(() => loadUsers(), 1000);
    setTimeout(() => loadPosts(), 1500);
    const interval = setInterval(loadOnline, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'ga4' && ga4PropId && ga4Token && !ga4Data && !ga4Loading) loadGA4(ga4Token, ga4PropId);
  }, [activeTab]);

  // ── 계산된 통계 ──
  const totalLikes = recentPosts.reduce((s, p) => s + (Array.isArray(p.likes) ? p.likes.length : 0), 0);
  const totalComments = recentPosts.reduce((s, p) => s + (Array.isArray(p.comments) ? p.comments.length : 0), 0);
  const categoryDist = recentPosts.reduce((acc: Record<string, number>, p) => { const c = p.category || '기타'; acc[c] = (acc[c] || 0) + 1; return acc; }, {});
  const categoryData = Object.entries(categoryDist).map(([label, value]) => ({ label, value: value as number, color: CATEGORY_COLORS[label] || '#9ca3af' }));
  const dailyPosts = getDailyCounts(recentPosts, 'createdAt', 14);
  const todayPosts = dailyPosts[dailyPosts.length - 1]?.value ?? 0;
  const dailyUsers = getDailyCounts(betaUsers, 'created_at', 14);
  const weeklyUsers = getWeeklyCounts(betaUsers, 'created_at', 8);
  const monthlyUsers = getMonthlyCounts(betaUsers, 'created_at', 6);
  const userPeriodData = userPeriod === 'daily' ? dailyUsers : userPeriod === 'weekly' ? weeklyUsers : monthlyUsers;
  const newUsersThisWeek = weeklyUsers[weeklyUsers.length - 1]?.value ?? 0;
  const newUsersThisMonth = monthlyUsers[monthlyUsers.length - 1]?.value ?? 0;

  // GA4 차트 데이터 변환
  const ga4PvChart = (ga4Data?.pvTrend ?? []).slice(-14).map((d: any) => ({
    label: `${parseInt(d.date.slice(4, 6))}/${parseInt(d.date.slice(6, 8))}`,
    value: d.views,
  }));
  const ga4SrcData = (ga4Data?.sources ?? []).map((s: any) => ({
    label: s.source, value: s.sessions,
    color: s.source === 'google' ? '#4285F4' : s.source === '(direct)' ? '#34A853' : s.source === 'naver' ? '#03C75A' : s.source === 'kakao' ? '#FEE500' : '#9ca3af',
  }));

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>;
  if (error && !stats) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="text-gray-600 font-medium">통계를 불러올 수 없습니다</p>
      <p className="text-sm text-gray-400">{error}</p>
      <button onClick={loadStats} className="flex items-center gap-2 px-4 py-2 text-sm bg-cyan-500 text-white rounded-lg hover:bg-cyan-600"><RefreshCw className="w-4 h-4" /> 다시 시도</button>
    </div>
  );

  const tabs = [{ id: 'overview', label: '종합' }, { id: 'users', label: '사용자' }, { id: 'posts', label: '게시물' }, { id: 'ga4', label: 'GA4' }] as const;

  return (
    <div className="space-y-5">
      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── 종합 탭 ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* 현재 접속자 */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="relative"><div className="w-2.5 h-2.5 bg-green-500 rounded-full" /><div className="absolute inset-0 w-2.5 h-2.5 bg-green-500 rounded-full animate-ping opacity-60" /></div>
                <span className="text-sm font-bold text-green-800">현재 접속 중</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-green-700">{onlineData.count}</span>
                <span className="text-sm text-green-600">명</span>
                <button onClick={loadOnline} className="text-green-500 hover:text-green-700"><RefreshCw className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {onlineData.users.length > 0 && (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {onlineData.users.map((u, i) => { const sec = Math.floor((Date.now() - u.lastSeen) / 1000); return (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-green-800 font-medium">{u.email || '익명'}</span>
                    <span className="text-green-500">{sec < 60 ? `${sec}초 전` : `${Math.floor(sec / 60)}분 전`}</span>
                  </div>
                ); })}
              </div>
            )}
            <p className="text-xs text-green-500 mt-1.5">3분 이내 활동 기준 · 30초 자동 갱신</p>
          </div>

          {/* 방문 통계 */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">방문</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={<Activity className="w-5 h-5 text-blue-600" />} label="총 방문 수" value={stats!.totalVisits.toLocaleString()} color="bg-blue-50" />
              <StatCard icon={<Users className="w-5 h-5 text-purple-600" />} label="순 방문자" value={stats!.uniqueVisitors.toLocaleString()} color="bg-purple-50" />
              <StatCard icon={<TrendingUp className="w-5 h-5 text-green-600" />} label="오늘 방문" value={stats!.todayVisitsCount.toLocaleString()} color="bg-green-50" />
              <StatCard icon={<Eye className="w-5 h-5 text-orange-600" />} label="오늘 순방문자" value={stats!.todayUniqueVisitors.toLocaleString()} color="bg-orange-50" />
            </div>
          </div>

          {/* 주요 지표 */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">주요 지표</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 p-3.5 shadow-sm text-center">
                <div className="text-xl font-black text-cyan-600">{stats!.totalUsers}</div>
                <div className="text-xs text-gray-500 mt-0.5">전체 회원</div>
                <div className="text-xs text-green-500 font-medium">+{stats!.todayUsersCount} 오늘</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-3.5 shadow-sm text-center">
                <div className="text-xl font-black text-indigo-600">{postsLoading ? '…' : recentPosts.length === 100 ? '100+' : recentPosts.length}</div>
                <div className="text-xs text-gray-500 mt-0.5">최근 게시물</div>
                <div className="text-xs text-green-500 font-medium">+{postsLoading ? '…' : todayPosts} 오늘</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-3.5 shadow-sm text-center">
                <div className="text-xl font-black text-amber-600">{stats!.totalOwnedGames.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-0.5">게임 등록</div>
                <div className="text-xs text-purple-500 font-medium">위시 {stats!.totalWishlistGames.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* 신규 가입 추이 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">신규 가입 (최근 14일)</span>
              {usersLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
            </div>
            <MiniBarChart data={dailyUsers} color="#06b6d4" height={80} />
          </div>

          {/* 게시물 작성 추이 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">게시물 작성 (최근 14일)</span>
              {postsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
            </div>
            <MiniBarChart data={dailyPosts} color="#8b5cf6" height={80} />
          </div>

          <div className="flex justify-end">
            <button onClick={() => { loadStats(); loadUsers(); loadPosts(); }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
              <RefreshCw className="w-3.5 h-3.5" /> 새로고침
            </button>
          </div>
        </div>
      )}

      {/* ─── 사용자 탭 ─── */}
      {activeTab === 'users' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Users className="w-5 h-5 text-cyan-600" />} label="전체 가입자" value={stats!.totalUsers} color="bg-cyan-50" />
            <StatCard icon={<Check className="w-5 h-5 text-green-600" />} label="승인된 회원" value={stats!.approvedUsers} color="bg-green-50" />
            <StatCard icon={<AlertCircle className="w-5 h-5 text-orange-600" />} label="승인 대기" value={stats!.pendingUsers} color="bg-orange-50" />
            <StatCard icon={<Calendar className="w-5 h-5 text-blue-600" />} label="오늘 신규" value={stats!.todayUsersCount} color="bg-blue-50" />
          </div>

          {/* 이번 주 / 이번 달 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-cyan-50 rounded-xl border border-cyan-100 p-3.5 text-center">
              <div className="text-xl font-black text-cyan-700">{newUsersThisWeek}</div>
              <div className="text-xs text-cyan-500 mt-0.5">이번 주 신규</div>
            </div>
            <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-3.5 text-center">
              <div className="text-xl font-black text-indigo-700">{newUsersThisMonth}</div>
              <div className="text-xs text-indigo-500 mt-0.5">이번 달 신규</div>
            </div>
          </div>

          {/* 기간별 신규 가입 차트 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">신규 가입 추이</span>
              <div className="flex gap-1">
                {(['daily', 'weekly', 'monthly'] as const).map(p => (
                  <button key={p} onClick={() => setUserPeriod(p)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${userPeriod === p ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {p === 'daily' ? '일별' : p === 'weekly' ? '주별' : '월별'}
                  </button>
                ))}
              </div>
            </div>
            {usersLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-cyan-400" /></div>
              : <MiniBarChart data={userPeriodData} color="#06b6d4" height={96} />}
            <p className="text-xs text-gray-400 mt-2 text-right">{userPeriod === 'daily' ? '최근 14일' : userPeriod === 'weekly' ? '최근 8주' : '최근 6개월'}</p>
          </div>

          {/* 회원 상태 분포 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <span className="text-sm font-semibold text-gray-700">회원 상태 분포</span>
            <div className="mt-3">
              <HBarChart data={[
                { label: '승인', value: stats!.approvedUsers, color: '#10b981' },
                { label: '대기', value: stats!.pendingUsers, color: '#f59e0b' },
                { label: '거절', value: Math.max(0, stats!.totalUsers - stats!.approvedUsers - stats!.pendingUsers), color: '#ef4444' },
              ]} />
            </div>
          </div>

          {/* 최근 가입 회원 */}
          {!usersLoading && betaUsers.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <span className="text-sm font-semibold text-gray-700">최근 가입 회원 (최근 10명)</span>
              <div className="mt-3 space-y-2.5">
                {[...betaUsers].filter(u => u.created_at)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, 10).map((u, i) => {
                    const d = new Date(u.created_at);
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 font-medium truncate flex-1">{u.name || u.username || u.email || '이름없음'}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.status === 'approved' ? 'bg-green-100 text-green-700' : u.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                            {u.status === 'approved' ? '승인' : u.status === 'pending' ? '대기' : '거절'}
                          </span>
                          <span className="text-xs text-gray-400">{`${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 게시물 탭 ─── */}
      {activeTab === 'posts' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<MessageSquare className="w-5 h-5 text-indigo-600" />} label="수집된 게시물" value={postsLoading ? '…' : recentPosts.length} color="bg-indigo-50" />
            <StatCard icon={<Calendar className="w-5 h-5 text-green-600" />} label="오늘 게시물" value={postsLoading ? '…' : todayPosts} color="bg-green-50" />
            <StatCard icon={<Heart className="w-5 h-5 text-red-500" />} label="총 좋아요" value={postsLoading ? '…' : totalLikes.toLocaleString()} color="bg-red-50" />
            <StatCard icon={<MessageSquare className="w-5 h-5 text-blue-500" />} label="총 댓글" value={postsLoading ? '…' : totalComments.toLocaleString()} color="bg-blue-50" />
          </div>

          {/* 평균 참여율 */}
          {!postsLoading && recentPosts.length > 0 && (
            <div className="bg-gradient-to-r from-cyan-50 to-indigo-50 rounded-xl border border-cyan-100 p-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">게시물당 평균 참여</p>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xl font-black text-cyan-700">{(totalLikes / recentPosts.length).toFixed(1)}</div>
                  <div className="text-xs text-cyan-500">좋아요 / 게시물</div>
                </div>
                <div>
                  <div className="text-xl font-black text-indigo-700">{(totalComments / recentPosts.length).toFixed(1)}</div>
                  <div className="text-xs text-indigo-500">댓글 / 게시물</div>
                </div>
              </div>
            </div>
          )}

          {/* 일별 게시물 차트 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">일별 게시물 (최근 14일)</span>
              {postsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
            </div>
            <MiniBarChart data={dailyPosts} color="#8b5cf6" height={96} />
          </div>

          {/* 카테고리 분포 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">카테고리별 분포</span>
              {postsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
            </div>
            {postsLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-purple-400" /></div>
              : categoryData.length > 0 ? <HBarChart data={categoryData} />
              : <p className="text-center text-sm text-gray-400 py-4">데이터 없음</p>}
          </div>

          {/* 좋아요 TOP 5 */}
          {!postsLoading && recentPosts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <span className="text-sm font-semibold text-gray-700">좋아요 TOP 5</span>
              <div className="mt-3 space-y-3">
                {[...recentPosts]
                  .sort((a, b) => (Array.isArray(b.likes) ? b.likes.length : 0) - (Array.isArray(a.likes) ? a.likes.length : 0))
                  .slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="text-xs font-black text-gray-300 w-4 flex-shrink-0 mt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{p.content?.replace(/\n/g, ' ').slice(0, 45) || '(내용없음)'}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-400">{p.userName}</span>
                          <span className="text-xs text-red-400 font-medium">♥ {Array.isArray(p.likes) ? p.likes.length : 0}</span>
                          <span className="text-xs text-blue-400 font-medium">💬 {Array.isArray(p.comments) ? p.comments.length : 0}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center">* 최근 100개 게시물 기준</p>
        </div>
      )}

      {/* ─── GA4 탭 ─── */}
      {activeTab === 'ga4' && (
        <div className="space-y-5">
          {/* 연결 설정 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-bold text-blue-800">GA4 Data API 연결</span>
              {ga4Data && <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">연결됨</span>}
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-blue-700 block mb-1">GA4 속성 ID (숫자형)</label>
                <input value={ga4PropInput} onChange={e => setGa4PropInput(e.target.value)} placeholder="예: 123456789"
                  className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <p className="text-xs text-blue-400 mt-1">GA4 → 관리 → 속성 설정 → 속성 ID (측정 ID G-XXXX 와 다름)</p>
              </div>
              <div>
                <label className="text-xs font-medium text-blue-700 block mb-1">OAuth 2.0 액세스 토큰</label>
                <input type="password" value={ga4TokenInput} onChange={e => setGa4TokenInput(e.target.value)} placeholder="ya29.A0... (1시간 유효)"
                  className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline mt-1 inline-flex items-center gap-1">
                  <Link className="w-3 h-3" /> OAuth Playground에서 토큰 발급 → Step 1: analytics.readonly 선택
                </a>
              </div>
              <button onClick={connectGA4} disabled={!ga4PropInput || ga4Loading}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {ga4Loading ? <><Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...</> : <><RefreshCw className="w-4 h-4" /> 데이터 불러오기</>}
              </button>
            </div>
          </div>

          {/* 에러 */}
          {ga4Error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700">{ga4Error}</p>
                <p className="text-xs text-red-400 mt-1">토큰 만료 시 OAuth Playground에서 새 토큰을 발급하세요.</p>
              </div>
            </div>
          )}

          {/* GA4 데이터 */}
          {ga4Data && (
            <div className="space-y-4">
              {/* 실시간 활성 사용자 */}
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="relative"><div className="w-2.5 h-2.5 bg-orange-500 rounded-full" /><div className="absolute inset-0 bg-orange-500 rounded-full animate-ping opacity-60" /></div>
                  <span className="text-sm font-bold text-orange-800">실시간 활성 사용자</span>
                </div>
                <div className="text-3xl font-black text-orange-700">{ga4Data.activeUsers}<span className="text-lg font-semibold text-orange-500 ml-1">명</span></div>
              </div>

              {/* 유입 경로 */}
              {ga4SrcData.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <span className="text-sm font-semibold text-gray-700">유입 경로 (최근 7일)</span>
                  <div className="mt-3"><HBarChart data={ga4SrcData} /></div>
                </div>
              )}

              {/* 페이지뷰 추이 */}
              {ga4PvChart.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <span className="text-sm font-semibold text-gray-700">페이지뷰 추이 (최근 30일)</span>
                  <div className="mt-3"><MiniBarChart data={ga4PvChart} color="#4285F4" height={96} /></div>
                </div>
              )}

              {/* 실시간 인기 페이지 */}
              {ga4Data.topPages?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <span className="text-sm font-semibold text-gray-700">실시간 인기 페이지</span>
                  <div className="mt-3 space-y-2">
                    {ga4Data.topPages.slice(0, 8).map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 truncate flex-1">{p.page}</span>
                        <span className="text-xs font-bold text-blue-600 ml-2 flex-shrink-0">{p.users}명</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => loadGA4(ga4Token, ga4PropId)} disabled={ga4Loading}
                className="w-full py-2 text-sm text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                <RefreshCw className={`w-3.5 h-3.5 ${ga4Loading ? 'animate-spin' : ''}`} /> 새로고침
              </button>
            </div>
          )}

          {!ga4Data && !ga4Loading && !ga4Error && (
            <div className="text-center py-10 text-gray-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">위에서 GA4 속성 ID와 액세스 토큰을 입력하면<br />실시간 방문자·페이지뷰·유입경로를 확인할 수 있습니다.</p>
            </div>
          )}

          {/* GA4 대시보드 바로가기 */}
          <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl p-3 hover:bg-gray-100 transition-all">
            <span className="text-sm text-gray-600">Google Analytics 전체 대시보드</span>
            <span className="text-xs text-blue-500 font-medium flex items-center gap-1"><Link className="w-3 h-3" /> 열기</span>
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Backup ──────────────────────────────────────────────────────────────────

function BackupSection({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<{ totalBackups: number; usersWithBackups: number; backupsByUser: BackupData[] } | null>(null);
  const [betaUsers, setBetaUsers] = useState<Record<string, { name: string; email: string }>>({});
  const [loading, setLoading] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [nextBackupTime, setNextBackupTime] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 다음 KST 정오(12:00) 계산 → UTC Date 반환
  const getNextNoonKST = () => {
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 3600000);
    const noon = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 3, 0, 0)); // KST 12:00 = UTC 03:00
    if (now >= noon) noon.setUTCDate(noon.getUTCDate() + 1);
    return noon;
  };

  const updateLabel = () => {
    const next = getNextNoonKST();
    const diff = next.getTime() - Date.now();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    setNextBackupTime(`${h}시간 ${m}분 후 (매일 오후 12:00 KST 자동 실행)`);
  };

  useEffect(() => {
    updateLabel();
    const labelTimer = setInterval(updateLabel, 60000);

    const scheduleAuto = () => {
      const delay = getNextNoonKST().getTime() - Date.now();
      timerRef.current = setTimeout(async () => {
        const today = new Date().toISOString().split('T')[0];
        const done = localStorage.getItem('adminAutoBackupDate');
        if (done !== today) {
          console.log('🕛 [AutoBackup] Running scheduled noon backup');
          await runBackupAll(true);
          localStorage.setItem('adminAutoBackupDate', today);
        }
        scheduleAuto(); // 내일 다시 예약
      }, delay);
    };

    scheduleAuto();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearInterval(labelTimer);
    };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [backupRes, usersRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/admin-backup-list`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/beta-testers`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      if (backupRes.ok) setData(await backupRes.json());
      if (usersRes.ok) {
        const ud = await usersRes.json();
        const map: Record<string, { name: string; email: string }> = {};
        (ud.testers || []).forEach((t: any) => { map[t.userId] = { name: t.name, email: t.email }; });
        setBetaUsers(map);
      }
    } finally { setLoading(false); }
  };

  const runBackupAll = async (silent = false) => {
    setIsRunning(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/admin-backup-all`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) { if (!silent) toast.success('전체 백업 완료!'); load(); }
      else { if (!silent) toast.error('백업 실패'); }
    } finally { setIsRunning(false); }
  };

  const toggleUser = (id: string) => {
    setExpandedUsers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <div className="space-y-4">
      {/* 자동 백업 상태 */}
      <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm">
        <Clock className="w-4 h-4 text-blue-500 shrink-0" />
        <p className="flex-1 text-blue-700">{nextBackupTime}</p>
        <span className="text-xs text-blue-400 bg-blue-100 px-2 py-0.5 rounded-full">자동</span>
      </div>

      {/* 버튼 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} 목록 조회
          </button>
          <button onClick={() => runBackupAll(false)} disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-cyan-500 rounded-lg hover:bg-cyan-600 disabled:opacity-50">
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} 지금 백업
          </button>
        </div>
        {data && <p className="text-sm text-gray-500">총 <b className="text-gray-700">{data.totalBackups}</b>개 · <b className="text-gray-700">{data.usersWithBackups}</b>명</p>}
      </div>

      {/* 목록 */}
      {!data ? (
        <div className="text-center py-16 text-gray-400">
          <HardDrive className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>목록 조회 버튼을 눌러주세요</p>
        </div>
      ) : data.backupsByUser.length === 0 ? (
        <div className="text-center py-12 text-gray-400">백업이 없습니다</div>
      ) : data.backupsByUser.map(user => {
        const info = betaUsers[user.userId];
        const name = info?.name || '알 수 없음';
        const email = info?.email || '';
        const isExpanded = expandedUsers.has(user.userId);

        return (
          <div key={user.userId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
              onClick={() => toggleUser(user.userId)}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {name !== '알 수 없음' ? name[0].toUpperCase() : '?'}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">{name}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">백업 {user.backupCount}개</span>
                </div>
                <p className="text-xs text-gray-400 truncate">{email || user.userId}</p>
              </div>
              {user.backups[0] && (
                <div className="text-right shrink-0 hidden sm:block mr-1">
                  <p className="text-xs text-gray-400">최근 백업</p>
                  <p className="text-xs font-medium text-gray-700">{new Date(user.backups[0].createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</p>
                </div>
              )}
              {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
            </button>
            {isExpanded && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {user.backups.map((b, idx) => (
                  <div key={b.key} className="px-4 py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] flex items-center justify-center font-bold">{idx + 1}</span>
                      <div>
                        <p className="font-medium text-gray-700">{new Date(b.createdAt).toLocaleString('ko-KR')}</p>
                        <p className="text-xs text-gray-400">보유 {b.userData?.ownedCount || 0} · 위시 {b.userData?.wishlistCount || 0} · 총 {b.gameCount}게임</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs rounded-full font-medium">{b.gameCount}게임</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Popup Management Section (append before Main component) ─────────────────

// 팝업 설정 로컬 키
const POPUP_STORAGE_KEY = 'adminPopupConfig';

interface PopupButton {
  label: string;
  url: string;
  style: 'primary' | 'outline' | 'kakao';
}

interface PopupConfig {
  title: string;
  content: string;
  isActive: boolean;
  updatedAt: string;
  buttons?: PopupButton[];
}

const DEFAULT_POPUP: PopupConfig = {
  title: '보드라움에 오신 것을 환영합니다.',
  content: '보드게임 컬렉션을 체계적으로 관리하고 다양한 정보를 공유하는 서비스입니다.\n\n오픈 초기 단계로 부족한 점이 많습니다.\n좌측 하단 말풍선 버튼을 통해 피드백을 남겨주시면 감사하겠습니다.\n\n응원의 한마디도 큰 힘이 됩니다!',
  isActive: true,
  updatedAt: '',
  buttons: [],
};

function PopupSection({ accessToken }: { accessToken: string }) {
  const [config, setConfig] = useState<PopupConfig>(DEFAULT_POPUP);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/popup-config`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const d = await res.json();
        setConfig(d.config || DEFAULT_POPUP);
      } else {
        // 서버 미지원 시 localStorage fallback
        const saved = localStorage.getItem(POPUP_STORAGE_KEY);
        if (saved) setConfig(JSON.parse(saved));
      }
    } catch {
      const saved = localStorage.getItem(POPUP_STORAGE_KEY);
      if (saved) setConfig(JSON.parse(saved));
    } finally { setLoading(false); }
  };

  const saveConfig = async () => {
    setSaving(true);
    const updated = { ...config, updatedAt: new Date().toISOString() };
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/popup-config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ config: updated }),
        }
      );
      if (res.ok) {
        setConfig(updated);
        toast.success('팝업이 저장되었습니다');
      } else {
        // 서버 미지원 시 localStorage fallback
        localStorage.setItem(POPUP_STORAGE_KEY, JSON.stringify(updated));
        setConfig(updated);
        toast.success('팝업이 저장되었습니다 (로컬)');
      }
    } catch {
      localStorage.setItem(POPUP_STORAGE_KEY, JSON.stringify(updated));
      setConfig(updated);
      toast.success('팝업이 저장되었습니다 (로컬)');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>;

  return (
    <div className="space-y-5">
      {/* 상태 토글 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900">팝업 활성화</h3>
            <p className="text-sm text-gray-400 mt-0.5">사용자 로그인 시 팝업 표시 여부</p>
          </div>
          <button onClick={() => setConfig(c => ({ ...c, isActive: !c.isActive }))}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${config.isActive ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
            {config.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {config.isActive ? '활성화됨' : '비활성화됨'}
          </button>
        </div>
        {config.updatedAt && (
          <p className="text-xs text-gray-400">마지막 수정: {new Date(config.updatedAt).toLocaleString('ko-KR')}</p>
        )}
      </div>

      {/* 내용 편집 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">팝업 내용 편집</h3>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">제목</label>
          <input type="text" value={config.title} onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 text-gray-800"
            placeholder="팝업 제목" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">내용</label>
          <textarea value={config.content} onChange={e => setConfig(c => ({ ...c, content: e.target.value }))}
            rows={6}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 text-gray-800 resize-y leading-relaxed"
            placeholder="팝업 내용 (줄바꿈 지원)" />
          <p className="text-xs text-gray-400 mt-1">줄바꿈은 Enter로 입력하세요</p>
        </div>
      </div>

      {/* 버튼 설정 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">버튼 추가</h3>
          <button
            onClick={() => setConfig(c => ({ ...c, buttons: [...(c.buttons || []), { label: '', url: '', style: 'primary' }] }))}
            className="flex items-center gap-1.5 text-sm text-cyan-600 hover:text-cyan-700 font-medium">
            <Plus className="w-4 h-4" /> 버튼 추가
          </button>
        </div>
        <p className="text-xs text-gray-400">팝업 하단에 링크 버튼을 표시합니다. (최대 3개)</p>

        {(config.buttons || []).length === 0 && (
          <p className="text-sm text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-lg">버튼 없음 — 위 버튼 추가를 눌러보세요</p>
        )}

        <div className="space-y-3">
          {(config.buttons || []).map((btn, idx) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">버튼 {idx + 1}</span>
                <button onClick={() => setConfig(c => ({ ...c, buttons: (c.buttons || []).filter((_, i) => i !== idx) }))}
                  className="text-xs text-red-400 hover:text-red-600">삭제</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">버튼 텍스트</label>
                  <input type="text" value={btn.label}
                    onChange={e => setConfig(c => ({ ...c, buttons: (c.buttons || []).map((b, i) => i === idx ? { ...b, label: e.target.value } : b) }))}
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    placeholder="예: 채팅방 참여" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">스타일</label>
                  <select value={btn.style}
                    onChange={e => setConfig(c => ({ ...c, buttons: (c.buttons || []).map((b, i) => i === idx ? { ...b, style: e.target.value as any } : b) }))}
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white">
                    <option value="primary">파란색</option>
                    <option value="outline">흰색 테두리</option>
                    <option value="kakao">카카오 노란색</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">링크 URL</label>
                <input type="url" value={btn.url}
                  onChange={e => setConfig(c => ({ ...c, buttons: (c.buttons || []).map((b, i) => i === idx ? { ...b, url: e.target.value } : b) }))}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  placeholder="https://open.kakao.com/..." />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 미리보기 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">미리보기</h3>
          <button onClick={() => setPreview(v => !v)}
            className="text-sm text-cyan-600 hover:text-cyan-700 font-medium">
            {preview ? '닫기' : '펼치기'}
          </button>
        </div>

        {preview && (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="h-1.5 bg-blue-600" />
            <div className="px-5 py-4">
              <h4 className="text-base font-semibold text-blue-700 mb-2">{config.title || '제목 없음'}</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{config.content || '내용 없음'}</p>
            </div>
            <div className="h-1 bg-blue-600" />
            <div className="px-4 py-3 bg-gray-50 space-y-3">
              {(config.buttons || []).filter(b => b.label).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {(config.buttons || []).filter(b => b.label).map((btn, i) => (
                    <div key={i} className={`px-4 py-2 text-sm rounded-lg font-medium ${
                      btn.style === 'kakao' ? 'bg-yellow-400 text-gray-900' :
                      btn.style === 'outline' ? 'border border-blue-600 text-blue-600' :
                      'bg-blue-600 text-white'
                    }`}>{btn.label}</div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-400">
                  <input type="checkbox" className="w-4 h-4 rounded" disabled />
                  오늘 하루 보지 않기
                </label>
                <div className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg">확인</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 저장 버튼 */}
      <button onClick={saveConfig} disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-xl transition-colors disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        저장
      </button>
    </div>
  );
}



// ─── Wiki Migration Section ───────────────────────────────────────────────────
function WikiMigrationSection({ accessToken }: { accessToken: string }) {
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/migrate-wiki/preview`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const d = await res.json();
      setPreview(d);
    } catch (e) {
      toast.error('미리보기 실패');
    } finally {
      setLoading(false);
    }
  };

  const runMigration = async () => {
    if (!confirm(`${preview?.needsMigration}개의 위키 포스트를 마이그레이션합니다. 계속하시겠습니까?`)) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/migrate-wiki/run`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const d = await res.json();
      setResult(d.results);
      toast.success(`마이그레이션 완료: ${d.results?.migrated}개 이전`);
      loadPreview(); // 미리보기 갱신
    } catch (e) {
      toast.error('마이그레이션 실패');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 설명 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1">
        <p className="font-bold">⚠️ 보드위키 게임ID 마이그레이션</p>
        <p>기존 위키 포스트들이 개인 카드 UUID로 저장되어 있어 다른 회원의 같은 게임 카드에서 보이지 않는 문제를 해결합니다.</p>
        <p className="text-xs text-amber-600 mt-1">BGG ID 또는 게임 이름 기반의 공통 키로 변환합니다. 이미 변환된 항목은 건너뜁니다.</p>
      </div>

      {/* 미리보기 버튼 */}
      {!preview && (
        <button onClick={loadPreview} disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          현황 미리보기
        </button>
      )}

      {/* 미리보기 결과 */}
      {preview && (
        <div className="space-y-4">
          {/* 요약 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '전체 포스트', value: preview.total, color: 'gray' },
              { label: '마이그레이션 필요', value: preview.needsMigration, color: 'amber' },
              { label: '이미 완료', value: preview.alreadyDone, color: 'green' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-xl p-3 text-center`}>
                <div className={`text-2xl font-black text-${color}-700`}>{value}</div>
                <div className={`text-xs text-${color}-600 mt-0.5`}>{label}</div>
              </div>
            ))}
          </div>

          {/* 게임별 그룹 */}
          {preview.groupedByNewId?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                게임별 현황
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {preview.groupedByNewId.map((g: any) => (
                  <div key={g.newGameId} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{g.gameName || '(이름 없음)'}</p>
                      <p className="text-xs text-gray-400 font-mono truncate">{g.newGameId}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-500">{g.postCount}개</span>
                      {g.allMigrated
                        ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">완료</span>
                        : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">대기</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 실행/갱신 버튼 */}
          <div className="flex gap-3">
            <button onClick={loadPreview} disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              갱신
            </button>
            {preview.needsMigration > 0 && (
              <button onClick={runMigration} disabled={running}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl transition-colors disabled:opacity-50">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                마이��레이션 실행 ({preview.needsMigration}개)
              </button>
            )}
            {preview.needsMigration === 0 && (
              <div className="flex-1 flex items-center justify-center py-3 bg-green-100 text-green-700 font-medium rounded-xl">
                ✅ 모두 완료됨
              </div>
            )}
          </div>

          {/* 결과 */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm space-y-1">
              <p className="font-bold text-green-800">마이그레이션 완료</p>
              <p className="text-green-700">이전: {result.migrated}개 · 건너뜀: {result.skipped}개 · 실패: {result.failed}개</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

type Tab = 'approval' | 'members' | 'analytics' | 'backup' | 'popup' | 'migration' | 'player-migration' | 'calculators' | 'homework' | 'sallae' | 'image-review' | 'last-event' | 'notices' | 'recommended' | 'spam' | 'activity-cards' | 'bulk-mail' | 'site-games' | 'operator' | 'auction-results';


// ── 이미지 검수 섹션 ──
function ImageReviewSection({ accessToken }: { accessToken: string }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/game/image-requests`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) setRequests(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const review = async (requestId: string, action: 'approve' | 'reject') => {
    setProcessing(requestId);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/game/image-requests/${requestId}/review`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action }) }
      );
      if (res.ok) {
        toast.success(action === 'approve' ? '승인했어요!' : '거부했어요');
        setRequests(prev => prev.filter(r => r.id !== requestId));
      } else toast.error('처리 실패');
    } catch { toast.error('오류 발생'); }
    setProcessing(null);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  if (requests.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <p className="text-lg mb-1">✅</p>
      <p className="text-sm">대기 중인 이미지 변경 요청이 없어요</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">총 {requests.length}건의 검수 요청이 있어요.</p>
      {requests.map(req => (
        <div key={req.id} className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-start gap-4">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="font-bold text-gray-900">{req.koreanName || req.gameId || '알 수 없는 게임'}</p>
              <p className="text-xs text-gray-400">요청일: {new Date(req.requestedAt).toLocaleString('ko-KR')}</p>
            </div>
          </div>
          {/* 이미지 비교 */}
          <div className="flex gap-3 mt-4">
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1 text-center">변경 요청 이미지</p>
              <img src={req.newImageUrl} className="w-full h-40 object-cover rounded-xl border-2 border-cyan-300"
                onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
            </div>
          </div>
          {/* 액션 버튼 */}
          <div className="flex gap-2 mt-4">
            <button onClick={() => review(req.id, 'approve')} disabled={processing === req.id}
              className="flex-1 py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50 flex items-center justify-center gap-1">
              {processing === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              승인 (전체 반영)
            </button>
            <button onClick={() => review(req.id, 'reject')} disabled={processing === req.id}
              className="flex-1 py-2 rounded-xl bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-1">
              <XCircle className="w-4 h-4" />
              거부
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}



// ── 카드 사용 내역 블록 ──
function CardUsageLogBlock({ log, compact = false }: { log: any[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!log || log.length === 0) return null;
  return (
    <div className={`${compact ? 'mt-1' : 'mt-2 pt-2 border-t border-gray-100'}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold"
      >
        🃏 카드 사용 내역 {log.length}건
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg bg-indigo-50 border border-indigo-100 overflow-hidden">
          <div className="max-h-48 overflow-y-auto divide-y divide-indigo-100">
            {[...log].reverse().map((entry: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-indigo-700">{entry.userName || entry.email || entry.userId}</span>
                  {entry.email && entry.userName !== entry.email && (
                    <span className="text-[10px] text-indigo-400">{entry.email}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-indigo-500 font-mono">잔여 {entry.cardsAfter}장</span>
                  <span className="text-[10px] text-indigo-300">
                    {new Date(entry.usedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 이벤트 카드 (FeedPage와 동일한 실시간 타이머) ──
function AdminEventCard({ event, posts, onStop, saving, accessToken }: { event: any; posts: any[]; onStop: (id?: string) => void; saving: boolean; accessToken: string }) {
  const [remaining, setRemaining] = useState(-999);
  const [initialized, setInitialized] = useState(false);
  const [showSleepEdit, setShowSleepEdit] = useState(false);
  const [editSleepStartH, setEditSleepStartH] = useState(Math.floor(event.sleepStart ?? 0));
  const [editSleepStartM, setEditSleepStartM] = useState(Math.round(((event.sleepStart ?? 0) % 1) * 60));
  const [editSleepEndH, setEditSleepEndH] = useState(Math.floor(event.sleepEnd ?? 8));
  const [editSleepEndM, setEditSleepEndM] = useState(Math.round(((event.sleepEnd ?? 8) % 1) * 60));
  const editSleepStart = editSleepStartH + editSleepStartM / 60;
  const editSleepEnd = editSleepEndH + editSleepEndM / 60;
  const [sleepSaving, setSleepSaving] = useState(false);
  const [showDurationEdit, setShowDurationEdit] = useState(false);
  const [editDuration, setEditDuration] = useState(event.durationMinutes ?? 60);
  const [durationSaving, setDurationSaving] = useState(false);
  const [showCardReductionEdit, setShowCardReductionEdit] = useState(false);
  const [editCardReduction, setEditCardReduction] = useState(event.cardReductionSeconds ?? 300);
  const [cardReductionSaving, setCardReductionSaving] = useState(false);
  const [showSuccessRateEdit, setShowSuccessRateEdit] = useState(false);
  const [editSuccessRate, setEditSuccessRate] = useState(event.cardSuccessRate ?? 100);
  const [successRateSaving, setSuccessRateSaving] = useState(false);
  const [showDescEdit, setShowDescEdit] = useState(false);
  const [editDesc, setEditDesc] = useState(event.description ?? '');
  const [descSaving, setDescSaving] = useState(false);
  const [cardGift, setCardGift] = useState('');
  const [cardGiftImageUrl, setCardGiftImageUrl] = useState('');
  const [cardGiftSaving, setCardGiftSaving] = useState(false);
  const [cardGiftImageUploading, setCardGiftImageUploading] = useState(false);
  const [cardGiftLoaded, setCardGiftLoaded] = useState(false);
  const [cardRanking, setCardRanking] = useState<{ userId: string; userName: string; count: number }[]>([]);
  const [manualCardName, setManualCardName] = useState(event?.manualCardUser?.userName || '');
  const [manualCardCount, setManualCardCount] = useState(String(event?.manualCardUser?.count ?? ''));
  const [manualCardSaving, setManualCardSaving] = useState(false);

  // 서버에서 전체 집계(현재+히스토리) 카드 스탯 로드
  useEffect(() => {
    if (!event?.id) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event/card-stats?eventId=${event.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(r => r.json()).then(d => {
      setCardGift(d.gift || '');
      setCardGiftImageUrl(d.cardGiftImageUrl || '');
      setCardRanking(d.ranking || []);
      setCardGiftLoaded(true);
    }).catch(() => setCardGiftLoaded(true));
  }, [event?.id]);

  const uploadCardGiftImage = async (file: File) => {
    setCardGiftImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData }
      );
      const data = await res.json();
      if (data.imageUrl) { setCardGiftImageUrl(data.imageUrl); toast.success('이미지 업로드 완료!'); }
      else toast.error('업로드 실패');
    } catch { toast.error('업로드 오류'); }
    setCardGiftImageUploading(false);
  };

  const saveCardGift = async () => {
    setCardGiftSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event/card-gift`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ eventId: event.id, gift: cardGift, cardGiftImageUrl }) }
      );
      if (res.ok) toast.success(cardGift.trim() ? '선물 내용 저장!' : '선물 내용 삭제됨');
      else toast.error('저장 실패');
    } catch { toast.error('오류'); }
    setCardGiftSaving(false);
  };

  const saveDuration = async () => {
    const mins = Number(editDuration);
    if (!mins || mins < 1) { toast.error('1분 이상 입력해주세요'); return; }

    // ── 즉시 종료 위험 경고 ──
    // 마지막 글(또는 이벤트 시작) 기준으로 이미 경과한 시간 계산
    const baseTime = lastPost
      ? new Date(lastPost.createdAt).getTime()
      : new Date(event.startedAt).getTime();
    const reduction = (event.reductionSeconds || 0) * 1000;
    const newEndTime = baseTime + mins * 60 * 1000 - reduction;
    const newRemainingSec = Math.floor((newEndTime - Date.now()) / 1000);
    if (newRemainingSec <= 0) {
      const proceed = window.confirm(
        `⚠️ 주의: ${mins}분으로 변경하면 이미 경과 시간(${Math.round((Date.now() - baseTime) / 60000)}분)을 초과해 이벤트가 즉시 종료될 수 있습니다!\n\n정말 저장할까요?`
      );
      if (!proceed) return;
    } else if (newRemainingSec < 120) {
      const proceed = window.confirm(
        `⚠️ 주의: ${mins}분으로 변경하면 남은 시간이 ${Math.floor(newRemainingSec / 60)}분 ${newRemainingSec % 60}초 밖에 없습니다.\n\n계속할까요?`
      );
      if (!proceed) return;
    }

    setDurationSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'update', eventId: event.id, durationMinutes: mins }) }
      );
      if (res.ok) { toast.success(`타이머 ${mins}분으로 변경 완료!`); setShowDurationEdit(false); }
      else toast.error('저장 실패');
    } catch { toast.error('오류'); }
    setDurationSaving(false);
  };

  const saveSleepTime = async () => {
    setSleepSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'update', eventId: event.id, sleepStart: editSleepStart, sleepEnd: editSleepEnd }) }
      );
      if (res.ok) { toast.success('휴식 시간 저장 완료!'); setShowSleepEdit(false); }
      else toast.error('저장 실패');
    } catch { toast.error('오류'); }
    setSleepSaving(false);
  };

  const saveCardReduction = async () => {
    const secs = Number(editCardReduction);
    if (!secs || secs < 1) { toast.error('1초 이상 입력해주세요'); return; }
    setCardReductionSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'update', eventId: event.id, cardReductionSeconds: secs }) }
      );
      if (res.ok) { toast.success(`보너스카드 감소 ${secs >= 60 ? `${secs / 60}분` : `${secs}초`}으로 변경!`); setShowCardReductionEdit(false); }
      else toast.error('저장 실패');
    } catch { toast.error('오류'); }
    setCardReductionSaving(false);
  };

  const saveSuccessRate = async () => {
    setSuccessRateSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'update', eventId: event.id, cardSuccessRate: editSuccessRate }) }
      );
      if (res.ok) { toast.success(`성공 확률 ${editSuccessRate}%로 변경!`); setShowSuccessRateEdit(false); }
      else toast.error('저장 실패');
    } catch { toast.error('오류'); }
    setSuccessRateSaving(false);
  };

  const saveDesc = async () => {
    setDescSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'update', eventId: event.id, description: editDesc }) }
      );
      if (res.ok) { toast.success('규칙 저장됨!'); setShowDescEdit(false); }
      else toast.error('저장 실패');
    } catch { toast.error('오류'); }
    setDescSaving(false);
  };

  const disqualified: string[] = event?.disqualified || [];
  const eventStartTime = event?.startedAt ? new Date(event.startedAt).getTime() : 0;
  const lastPost = posts.length > 0
    ? [...posts]
        .filter((p: any) => 
          new Date(p.createdAt).getTime() >= eventStartTime && 
          !disqualified.includes(p.userId) &&
          p.category === '이벤트'
        )
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null
    : null;

  useEffect(() => {
    const calc = () => {
      const now0 = new Date();
      const kstDecimal = ((now0.getUTCHours() + 9) % 24) + now0.getUTCMinutes() / 60;
      const sleepStartH = event.sleepStart ?? 0;
      const sleepEndH = event.sleepEnd ?? 8;
      const isSleepTime = sleepStartH < sleepEndH
        ? kstDecimal >= sleepStartH && kstDecimal < sleepEndH
        : kstDecimal >= sleepStartH || kstDecimal < sleepEndH;
      if (isSleepTime) {
        const now = new Date();
        const nextWake = new Date();
        const wakeUTCDecimal = (sleepEndH - 9 + 24) % 24;
        nextWake.setUTCHours(Math.floor(wakeUTCDecimal), Math.round((wakeUTCDecimal % 1) * 60), 0, 0);
        if (nextWake <= now) nextWake.setUTCDate(nextWake.getUTCDate() + 1);
        setRemaining(-Math.floor((nextWake.getTime() - now.getTime()) / 1000));
        setInitialized(true);
        return;
      }
      const baseTime = lastPost
        ? new Date(lastPost.createdAt).getTime()
        : new Date(event.startedAt).getTime();
      const reduction = (event.reductionSeconds || 0) * 1000;
      const endTime = baseTime + (event.durationMinutes || 60) * 60 * 1000 - reduction;
      const diff = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setRemaining(diff);
      setInitialized(true);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [event, lastPost]);

  if (!initialized) return <div className="rounded-2xl p-4 border border-gray-200 bg-white h-24 animate-pulse" />;

  const isSleep = remaining < 0;
  const displaySecs = Math.abs(remaining);
  const h = Math.floor(displaySecs / 3600);
  const m = Math.floor((displaySecs % 3600) / 60);
  const s = displaySecs % 60;
  const timerStr = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const urgent = !isSleep && remaining <= 300;
  const borderColor = isSleep ? '#94a3b8' : urgent ? '#ef4444' : '#00BCD4';
  const timerColor = isSleep ? '#94a3b8' : urgent ? '#ef4444' : '#00BCD4';

  return (
    <div className={`rounded-2xl p-4 border-2 bg-white ${urgent ? 'animate-pulse' : ''}`} style={{ borderColor }}>
      <div className="flex items-start gap-3">
        {event.prizeImageUrl && (
          <img src={event.prizeImageUrl} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-gray-200" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-bold text-gray-900 text-sm truncate">🏆 {event.prize}</span>
            <button onClick={() => onStop(event.id)} disabled={saving}
              className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-50">
              이벤트 종료
            </button>
          </div>

          {isSleep ? (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">😴 휴식중</span>
              <span className="text-xs text-gray-400">재개까지</span>
              <span className="font-mono font-bold text-sm text-gray-500">{timerStr}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">남은 시간</span>
              <span className="font-mono font-bold text-lg" style={{ color: timerColor }}>{timerStr}</span>
              <span className="text-xs text-gray-400">/ {event.durationMinutes}분</span>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-1">시작: {new Date(event.startedAt).toLocaleString('ko-KR')}</p>

          {lastPost ? (
            <p className="text-xs mt-0.5 font-medium" style={{ color: '#00BCD4' }}>
              🏅 현재 선두: <span className="font-bold">{lastPost.userName}</span>
              <span className="text-gray-400 font-normal ml-1">({new Date(lastPost.createdAt).toLocaleString('ko-KR')})</span>
            </p>
          ) : (
            <p className="text-xs mt-0.5 text-gray-400">📭 이벤트 시작 이후 아직 글 없음</p>
          )}

          {event.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">📋 {event.description}</p>}
          {(event.reductionSeconds || 0) > 0 && (
            <p className="text-xs mt-1 text-indigo-500">⏬ 보너스카드 -{Math.floor((event.reductionSeconds||0)/60) > 0 ? `${Math.floor((event.reductionSeconds||0)/60)}분 ` : ''}{(event.reductionSeconds||0)%60 > 0 ? `${(event.reductionSeconds||0)%60}초` : (Math.floor((event.reductionSeconds||0)/60) > 0 ? '' : '0초')} 적용됨</p>
          )}

          {/* 🃏 카드 사용 내역 */}
          {(event.cardUsageLog?.length > 0) && (
            <CardUsageLogBlock log={event.cardUsageLog} />
          )}

          {/* 🏆 카드 사용 순위 + 선물 설정 (항상 표시) */}
          <div className="mt-2 pt-2 border-t border-gray-100">
            {cardRanking.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-indigo-600 mb-1.5">🏆 카드 사용 순위 (전체 누적)</p>
                <div className="space-y-1 mb-2">
                  {cardRanking.slice(0, 5).map((entry, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 font-medium">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {entry.userName}
                      </span>
                      <span className="text-indigo-500 font-bold">{entry.count}회</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400 mb-2">
                {cardGiftLoaded ? '🃏 아직 카드 사용 내역 없음' : '🃏 카드 순위 로딩중...'}
              </p>
            )}
            {/* 최다 카드 수동 지정 */}
            <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
              <p className="text-xs font-semibold text-amber-700">🃏 최다 카드 수동 지정 (로그 누락 시)</p>
              {event?.manualCardUser && (
                <p className="text-xs text-amber-600">현재: {event.manualCardUser.userName} ({event.manualCardUser.count}회)</p>
              )}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={manualCardName}
                  onChange={e => setManualCardName(e.target.value)}
                  placeholder="사용자명"
                  className="flex-1 border border-amber-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-400 bg-white"
                />
                <input
                  type="number"
                  value={manualCardCount}
                  onChange={e => setManualCardCount(e.target.value)}
                  placeholder="횟수"
                  min="1"
                  className="w-16 border border-amber-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-amber-400 bg-white"
                />
              </div>
              <div className="flex gap-1.5">
                <button
                  disabled={manualCardSaving || !manualCardName.trim() || !manualCardCount}
                  onClick={async () => {
                    setManualCardSaving(true);
                    try {
                      const res = await fetch(
                        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
                        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                          body: JSON.stringify({ action: 'update', eventId: event.id, manualCardUser: { userName: manualCardName.trim(), count: Number(manualCardCount) } }) }
                      );
                      if (res.ok) toast.success('최다 카드 사용자 지정 완료!');
                      else toast.error('저장 실패');
                    } catch { toast.error('저장 오류'); }
                    setManualCardSaving(false);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {manualCardSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  지정
                </button>
                {event?.manualCardUser && (
                  <button
                    disabled={manualCardSaving}
                    onClick={async () => {
                      setManualCardSaving(true);
                      try {
                        const res = await fetch(
                          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
                          { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                            body: JSON.stringify({ action: 'update', eventId: event.id, manualCardUser: null }) }
                        );
                        if (res.ok) { setManualCardName(''); setManualCardCount(''); toast.success('지정 해제됨'); }
                      } catch { toast.error('해제 오류'); }
                      setManualCardSaving(false);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                  >
                    해제
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-600">
                🎁 최다 카드 사용자 선물 내용
              </p>
              {/* 선물 이미지 */}
              <div className="flex items-center gap-2">
                {cardGiftImageUrl ? (
                  <div className="relative flex-shrink-0">
                    <img src={cardGiftImageUrl} className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
                    <button onClick={() => setCardGiftImageUrl('')}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-white flex items-center justify-center">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : null}
                <label className="flex-1 flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                  {cardGiftImageUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" /> : <Camera className="w-3.5 h-3.5 text-gray-400" />}
                  <span className="text-xs text-gray-500">{cardGiftImageUploading ? '업로드 중...' : '선물 이미지'}</span>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadCardGiftImage(f); }} />
                </label>
              </div>
              <textarea
                value={cardGift}
                onChange={e => setCardGift(e.target.value)}
                placeholder="선물 내용 (배너에 표시)"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
              <button onClick={saveCardGift} disabled={cardGiftSaving || !cardGiftLoaded}
                className="w-full py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                {cardGiftSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                {cardGiftSaving ? '저장중...' : '선물 저장'}
              </button>
            </div>
          </div>

          {/* 타이머 시간 수정 */}
          <div className="mt-2 pt-2 border-t border-gray-100">
            {!showDurationEdit ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  ⏱ 타이머: <span className="font-semibold text-gray-600">{event.durationMinutes || 60}분</span>
                </p>
                <button onClick={() => { setShowDurationEdit(true); setEditDuration(event.durationMinutes ?? 60); }}
                  className="text-xs px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 font-semibold">
                  수정
                </button>
              </div>
            ) : (() => {
              // 새 duration으로 예상 남은 시간 계산 (미리보기)
              const baseTime = lastPost
                ? new Date(lastPost.createdAt).getTime()
                : new Date(event.startedAt).getTime();
              const reduction = (event.reductionSeconds || 0) * 1000;
              const previewRemainSec = Math.floor((baseTime + (editDuration || 0) * 60 * 1000 - reduction - Date.now()) / 1000);
              const isImmediateClose = previewRemainSec <= 0;
              const isNearClose = previewRemainSec > 0 && previewRemainSec < 120;
              return (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700">⏱ 타이머 시간 수정</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={editDuration}
                    onChange={e => setEditDuration(Number(e.target.value))}
                    className={`flex-1 h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 ${isImmediateClose ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 focus:ring-cyan-300'}`}
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0">분</span>
                </div>
                {/* 예상 남은 시간 미리보기 */}
                {isImmediateClose ? (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-xs font-bold text-red-600">⚠️ 이 시간으로 저장하면 이벤트가 즉시 종료됩니다!</span>
                  </div>
                ) : isNearClose ? (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                    <span className="text-xs font-semibold text-amber-600">
                      ⚠️ 저장 시 남은 시간: {Math.floor(previewRemainSec / 60)}분 {previewRemainSec % 60}초
                    </span>
                  </div>
                ) : editDuration > 0 ? (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="text-xs text-gray-500">
                      저장 시 남은 시간: <span className="font-semibold text-gray-700">{Math.floor(previewRemainSec / 3600) > 0 ? `${Math.floor(previewRemainSec / 3600)}시간 ` : ''}{Math.floor((previewRemainSec % 3600) / 60)}분 {previewRemainSec % 60}초</span>
                    </span>
                  </div>
                ) : null}
                <div className="flex gap-1.5 flex-wrap">
                  {[10, 20, 30, 60, 90, 120].map(m => (
                    <button key={m} onClick={() => setEditDuration(m)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-semibold border transition-colors ${editDuration === m ? 'text-white border-transparent' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                      style={editDuration === m ? { background: '#00BCD4', borderColor: '#00BCD4' } : {}}>
                      {m}분
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={saveDuration} disabled={durationSaving}
                    className={`flex-1 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1 ${isImmediateClose ? 'bg-red-500 hover:bg-red-600' : ''}`}
                    style={!isImmediateClose ? { background: '#00BCD4' } : {}}>
                    {durationSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {isImmediateClose ? '⚠️ 저장 (종료 위험)' : '저장'}
                  </button>
                  <button onClick={() => { setShowDurationEdit(false); setEditDuration(event.durationMinutes ?? 60); }}
                    className="flex-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold">
                    취소
                  </button>
                </div>
              </div>
              );
            })()}
          </div>

          {/* 휴식 시간 표시 + 수정 */}
          <div className="mt-2 pt-2 border-t border-gray-100">
            {!showSleepEdit ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  💤 휴식: {fmtSleepHour(event.sleepStart ?? 0)} ~ {fmtSleepHour(event.sleepEnd ?? 8)} (KST)
                </p>
                <button onClick={() => setShowSleepEdit(true)}
                  className="text-xs px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 font-semibold">
                  수정
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700">💤 휴식 시간 수정</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    <select value={editSleepStartH} onChange={e => setEditSleepStartH(Number(e.target.value))}
                      className="flex-1 h-9 px-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}시</option>
                      ))}
                    </select>
                    <select value={editSleepStartM} onChange={e => setEditSleepStartM(Number(e.target.value))}
                      className="w-14 h-9 px-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                      {[0, 10, 15, 20, 30, 40, 45, 50].map(m => (
                        <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-gray-400 text-xs flex-shrink-0">~</span>
                  <div className="flex-1 flex gap-1">
                    <select value={editSleepEndH} onChange={e => setEditSleepEndH(Number(e.target.value))}
                      className="flex-1 h-9 px-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}시</option>
                      ))}
                    </select>
                    <select value={editSleepEndM} onChange={e => setEditSleepEndM(Number(e.target.value))}
                      className="w-14 h-9 px-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                      {[0, 10, 15, 20, 30, 40, 45, 50].map(m => (
                        <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveSleepTime} disabled={sleepSaving}
                    className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                    {sleepSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    저장
                  </button>
                  <button onClick={() => { setShowSleepEdit(false); setEditSleepStartH(Math.floor(event.sleepStart ?? 0)); setEditSleepStartM(Math.round(((event.sleepStart ?? 0) % 1) * 60)); setEditSleepEndH(Math.floor(event.sleepEnd ?? 8)); setEditSleepEndM(Math.round(((event.sleepEnd ?? 8) % 1) * 60)); }}
                    className="flex-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold">
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 보너스카드 감소 시간 수정 */}
          <div className="mt-2 pt-2 border-t border-gray-100">
            {!showCardReductionEdit ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  🃏 카드 1장: <span className="font-semibold text-gray-600">{(event.cardReductionSeconds ?? 300) >= 60 ? `${(event.cardReductionSeconds ?? 300) / 60}분` : `${event.cardReductionSeconds ?? 300}초`} 감소</span>
                </p>
                <button onClick={() => { setShowCardReductionEdit(true); setEditCardReduction(event.cardReductionSeconds ?? 300); }}
                  className="text-xs px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 font-semibold">
                  수정
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700">🃏 보너스카드 감소 시간 수정</p>
                <div className="flex gap-1.5 flex-wrap">
                  {[60, 120, 180, 300, 600].map(s => (
                    <button key={s} onClick={() => setEditCardReduction(s)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-semibold border transition-colors ${editCardReduction === s ? 'text-white border-transparent bg-indigo-600' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                      {s >= 60 ? `${s / 60}분` : `${s}초`}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={saveCardReduction} disabled={cardReductionSaving}
                    className="flex-1 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1 bg-indigo-600">
                    {cardReductionSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    저장
                  </button>
                  <button onClick={() => setShowCardReductionEdit(false)}
                    className="flex-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold">
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 보너스카드 성공 확률 수정 */}
          <div className="mt-2 pt-2 border-t border-gray-100">
            {!showSuccessRateEdit ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  🎲 카드 성공 확률: <span className="font-semibold text-gray-600">{event.cardSuccessRate ?? 100}%</span>
                </p>
                <button onClick={() => { setShowSuccessRateEdit(true); setEditSuccessRate(event.cardSuccessRate ?? 100); }}
                  className="text-xs px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 font-semibold">
                  수정
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700">🎲 보너스카드 성공 확률 수정</p>
                <div className="flex gap-1.5 flex-wrap">
                  {[100, 80, 60, 50, 30].map(rate => (
                    <button key={rate} onClick={() => setEditSuccessRate(rate)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-semibold border transition-colors ${editSuccessRate === rate ? 'text-white border-transparent bg-indigo-600' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                      {rate}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="range" min={1} max={100} value={editSuccessRate}
                    onChange={e => setEditSuccessRate(Number(e.target.value))}
                    className="flex-1 accent-indigo-600" />
                  <span className="text-xs font-bold text-indigo-600 w-8 text-right">{editSuccessRate}%</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveSuccessRate} disabled={successRateSaving}
                    className="flex-1 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1 bg-indigo-600">
                    {successRateSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    저장
                  </button>
                  <button onClick={() => setShowSuccessRateEdit(false)}
                    className="flex-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold">
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 이벤트 규칙 수정 */}
          <div className="mt-2 pt-2 border-t border-gray-100">
            {!showDescEdit ? (
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-gray-400 flex-1 line-clamp-2">
                  📋 규칙: <span className="text-gray-500">{event.description ? event.description.slice(0, 60) + (event.description.length > 60 ? '…' : '') : '없음'}</span>
                </p>
                <button onClick={() => { setShowDescEdit(true); setEditDesc(event.description ?? ''); }}
                  className="flex-shrink-0 text-xs px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 font-semibold">
                  수정
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700">📋 이벤트 규칙 수정</p>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={8}
                  placeholder="이벤트 규칙을 입력하세요"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none leading-relaxed"
                />
                <div className="flex gap-2">
                  <button onClick={saveDesc} disabled={descSaving}
                    className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                    {descSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    저장
                  </button>
                  <button onClick={() => { setShowDescEdit(false); setEditDesc(event.description ?? ''); }}
                    className="flex-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold">
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 이벤트 히스토리 섹션 (당첨자 수정 포함) ──
function HistorySection({ history, saving, accessToken, onResume, onReload }: { history: any[]; saving: boolean; accessToken: string; onResume: (ev: any) => void; onReload: () => void }) {
  const [showHistory, setShowHistory] = useState(false);
  const [editingWinner, setEditingWinner] = useState<string | null>(null);
  const [editWinnerName, setEditWinnerName] = useState('');
  const [winnerSaving, setWinnerSaving] = useState(false);

  const saveWinner = async (eventId: string) => {
    setWinnerSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-events-history/${eventId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ winnerUserName: editWinnerName.trim() || null }) }
      );
      if (res.ok) { toast.success('당첨자 저장 완료!'); setEditingWinner(null); onReload(); }
      else toast.error('저장 실패');
    } catch { toast.error('오류'); }
    setWinnerSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setShowHistory(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
          <span className="text-base">📋</span>
          과거 이벤트 기록
          <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{history.length}건</span>
        </h3>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
      </button>

      {showHistory && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {history.map((ev: any, idx: number) => (
            <div key={ev.id || idx} className="px-5 py-4">
              <div className="flex items-start gap-3">
                {ev.prizeImageUrl && (
                  <img src={ev.prizeImageUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${ev.autoClose ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                      {ev.autoClose ? '⏰ 자동종료' : '✅ 수동종료'}
                    </span>
                    {ev.eventTitle && (
                      <span className="text-xs font-bold text-gray-700 truncate">{ev.eventTitle}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">🏆 {ev.prize || '상품'}</p>

                  {/* 당첨자 표시 + 수정 */}
                  {editingWinner === (ev.id || String(idx)) ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        value={editWinnerName}
                        onChange={e => setEditWinnerName(e.target.value)}
                        placeholder="당첨자 닉네임 입력"
                        className="flex-1 h-7 px-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                      <button onClick={() => saveWinner(ev.id)} disabled={winnerSaving}
                        className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">
                        {winnerSaving ? '...' : '저장'}
                      </button>
                      <button onClick={() => setEditingWinner(null)} className="px-2 py-1 rounded-lg bg-gray-100 text-gray-500 text-xs">취소</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-0.5">
                      {ev.winnerUserName ? (
                        <p className="text-[11px] font-medium text-gray-700">🥇 당첨자: {ev.winnerUserName}</p>
                      ) : (
                        <p className="text-[11px] text-gray-400">당첨자 없음</p>
                      )}
                      <button onClick={() => { setEditingWinner(ev.id || String(idx)); setEditWinnerName(ev.winnerUserName || ''); }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 hover:bg-gray-200 font-semibold">
                        수정
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    <p className="text-[11px] text-gray-400">⏱ {ev.durationMinutes || 60}분 타이머</p>
                    <p className="text-[11px] text-gray-400">🚀 시작: {ev.startedAt ? new Date(ev.startedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                    {ev.stoppedAt && (
                      <p className="text-[11px] text-gray-400">🏁 종료: {new Date(ev.stoppedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    )}
                    {(ev.reductionSeconds || 0) > 0 && (
                      <p className="text-[11px] text-indigo-500">⏬ 보너스카드 -{Math.floor((ev.reductionSeconds||0)/60) > 0 ? `${Math.floor((ev.reductionSeconds||0)/60)}분 ` : ''}{(ev.reductionSeconds||0)%60 > 0 ? `${(ev.reductionSeconds||0)%60}초` : ''}</p>
                    )}
                  </div>
                  {ev.description && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">📋 {ev.description}</p>}
                  {(ev.cardUsageLog?.length > 0) && (
                    <div className="mt-2"><CardUsageLogBlock log={ev.cardUsageLog} compact /></div>
                  )}
                  <button onClick={() => onResume(ev)} disabled={saving}
                    className="mt-2 text-xs px-3 py-1 rounded-lg font-bold text-white disabled:opacity-50 flex items-center gap-1"
                    style={{ background: '#00BCD4' }}>
                    ▶ 재개
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 마지막글 이벤트 관리 섹션 ──
function LastPostEventSection({ accessToken }: { accessToken: string }) {
  const [events, setEvents] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [recentWinners, setRecentWinners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [prize, setPrize] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [description, setDescription] = useState('');
  const [prizeImageUrl, setPrizeImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sleepStartH, setSleepStartH] = useState(0);
  const [sleepStartM, setSleepStartM] = useState(0);
  const [sleepEndH, setSleepEndH] = useState(8);
  const [sleepEndM, setSleepEndM] = useState(0);
  const sleepStart = sleepStartH + sleepStartM / 60;
  const sleepEnd = sleepEndH + sleepEndM / 60;
  const [cardReductionSeconds, setCardReductionSeconds] = useState(300);
  const [cardSuccessRate, setCardSuccessRate] = useState(100);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [noticeTitle, setNoticeTitle] = useState('규칙사항');
  const [noticeContent, setNoticeContent] = useState('');
  const [savingNotice, setSavingNotice] = useState(false);
  const [noticeLoaded, setNoticeLoaded] = useState(false);

  // FeedPage와 동일: 공개 /last-post-event + /community/posts 조합으로 정확한 타이머 계산
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [evRes, postRes, histRes, winnerRes] = await Promise.all([
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-events-history`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event/winner`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
      ]);
      if (evRes.ok) {
        const data = await evRes.json();
        const evList = Array.isArray(data)
          ? data.filter((e: any) => e.active || e.scheduled)
          : (data?.active ? [data] : []);
        console.log('[AdminLastPostEvent] active/scheduled events:', evList.length);
        setEvents(evList);
      } else {
        console.error('[AdminLastPostEvent] event fetch failed:', evRes.status);
      }
      if (postRes.ok) {
        const data = await postRes.json();
        setPosts(data.posts || []);
      }
      if (histRes.ok) {
        const data = await histRes.json();
        setHistory(Array.isArray(data) ? data : []);
      }
      if (winnerRes.ok) {
        const data = await winnerRes.json();
        setRecentWinners(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('[AdminLastPostEvent] loadData error:', e);
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 30000);
    return () => clearInterval(interval);
  }, []);

  // 이벤트 카테고리 공지 로딩
  useEffect(() => {
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/event-category-notice`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.notice) {
        setNoticeTitle(d.notice.title || '규칙사항');
        setNoticeContent(d.notice.content || '');
      }
      setNoticeLoaded(true);
    }).catch(() => setNoticeLoaded(true));
  }, []);

  const saveNotice = async () => {
    setSavingNotice(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/event-category-notice`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ title: noticeTitle, content: noticeContent }) }
      );
      if (res.ok) toast.success('공지가 저장됐어요!');
      else toast.error('저장 실패');
    } catch { toast.error('오류 발생'); }
    setSavingNotice(false);
  };

  const uploadImage = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData }
      );
      const data = await res.json();
      if (data.imageUrl) { setPrizeImageUrl(data.imageUrl); toast.success('이미지 업로드 완료!'); }
      else toast.error('업로드 실패');
    } catch { toast.error('업로드 오류'); }
    setUploadingImage(false);
  };

  const startEvent = async () => {
    setSaving(true);
    try {
      const body: any = { action: 'start', prize, eventTitle, durationMinutes, description, prizeImageUrl, sleepStart, sleepEnd, cardReductionSeconds, cardSuccessRate };
      if (scheduleEnabled && scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body) }
      );
      if (res.ok) {
        await loadData();
        toast.success(scheduleEnabled && scheduledAt ? '이벤트 예약 완료!' : '이벤트 시작!');
        setPrize(''); setEventTitle(''); setDescription(''); setPrizeImageUrl('');
        setSleepStartH(0); setSleepStartM(0); setSleepEndH(8); setSleepEndM(0);
        setScheduleEnabled(false); setScheduledAt('');
      } else toast.error('실패');
    } catch { toast.error('오류'); }
    setSaving(false);
  };

  const cancelSchedule = async (eventId: string) => {
    if (!confirm('예약된 이벤트를 취소할까요?')) return;
    setSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'cancel-schedule', eventId }) }
      );
      if (res.ok) { await loadData(); toast.success('예약 취소됨'); }
    } catch {}
    setSaving(false);
  };

  const stopEvent = async (eventId?: string) => {
    if (!confirm(eventId ? '이 이벤트를 종료할까요?' : '모든 이벤트를 종료할까요?')) return;
    setSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'stop', eventId }) }
      );
      if (res.ok) { await loadData(); toast.success('이벤트 종료'); }
    } catch {}
    setSaving(false);
  };

  const resumeEvent = async (eventData: any) => {
    if (!confirm(`"${eventData.eventTitle || eventData.prize || '이벤트'}"를 새로 재개할까요?\n(타이머는 처음부터 다시 시작됩니다)`)) return;
    setSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'resume', eventData }) }
      );
      if (res.ok) {
        await loadData();
        toast.success('이벤트가 재개됐어요!');
      } else {
        const d = await res.json();
        toast.error('재개 실패: ' + (d.error || res.status));
      }
    } catch (e) { toast.error('오류: ' + String(e)); }
    setSaving(false);
  };

  const resetEvent = async () => {
    if (!confirm('⚠️ 이벤트를 완전 리셋할까요?\n\n현재 진행중인 이벤트, 당첨 배너, 실격자 목록이 모두 초기화됩니다.\n이 작업은 되돌릴 수 없습니다.')) return;
    setSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/last-post-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'reset' }) }
      );
      const data = await res.json();
      if (res.ok) {
        await loadData();
        toast.success(`이벤트 완전 리셋 완료! (${data.clearedEvents || 0}개 이벤트 초기화)`);
      } else {
        toast.error('리셋 실패: ' + (data.error || res.status));
      }
    } catch (e) { toast.error('오류: ' + String(e)); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

  return (
    <div className="space-y-5">

      {/* 🔴 이벤트 완전 리셋 버튼 (항상 표시) */}
      <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-orange-700">🔄 이벤트 완전 리셋</p>
            <p className="text-xs text-orange-500 mt-0.5">서버 오류 등으로 이벤트가 꼬였을 때 사용하세요. 진행중 이벤트·당첨 배너·실격자 목록이 모두 초기화됩니다.</p>
          </div>
          <button
            onClick={resetEvent}
            disabled={saving}
            className="ml-3 flex-shrink-0 px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {saving ? '처리중...' : '완전 리셋'}
          </button>
        </div>
      </div>

      {/* 예약된 이벤트 목록 */}
      {events.filter((e: any) => e.scheduled).map((ev: any) => (
        <div key={ev.id} className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-blue-600 text-sm">🕐</span>
              <p className="text-sm font-bold text-blue-700">예약된 이벤트</p>
            </div>
            <button onClick={() => cancelSchedule(ev.id)} disabled={saving}
              className="text-xs px-3 py-1 rounded-lg bg-red-100 text-red-600 font-bold hover:bg-red-200 disabled:opacity-50">
              예약 취소
            </button>
          </div>
          <p className="text-xs text-blue-600">
            ⏰ 시작: {new Date(ev.scheduledAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-xs text-gray-600 font-semibold">{ev.eventTitle || ev.prize}</p>
          <p className="text-xs text-gray-500">타이머 {ev.durationMinutes}분 · 카드 {ev.cardReductionSeconds >= 60 ? `${ev.cardReductionSeconds/60}분` : `${ev.cardReductionSeconds}초`} 감소 · 성공률 {ev.cardSuccessRate ?? 100}%</p>
        </div>
      ))}

      {/* 진행중 이벤트 목록 */}
      {events.filter((e: any) => e.active).length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
              진행중 이벤트 {events.filter((e: any) => e.active).length}개
            </h3>
            {events.filter((e: any) => e.active).length > 1 && (
              <button onClick={() => stopEvent(undefined)} disabled={saving}
                className="text-xs px-3 py-1 rounded-lg bg-red-100 text-red-600 font-bold hover:bg-red-200 disabled:opacity-50">
                전체 종료
              </button>
            )}
          </div>
          {events.filter((e: any) => e.active).map((ev: any) => (
            <AdminEventCard key={ev.id || ev.startedAt} event={ev} posts={posts} onStop={stopEvent} saving={saving} accessToken={accessToken} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl p-4 border-2 border-gray-200 bg-gray-50 text-center">
          <p className="text-sm text-gray-400">진행중인 이벤트 없음</p>
        </div>
      )}

      {/* 새 이벤트 추가 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-bold text-gray-900">새 이벤트 추가</h3>

        {/* 상품 이미지 */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">상품 이미지 <span className="text-gray-400 text-xs">(선택)</span></label>
          <div className="flex items-center gap-3">
            {prizeImageUrl ? (
              <div className="relative">
                <img src={prizeImageUrl} className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
                <button onClick={() => setPrizeImageUrl('')}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : null}
            <label className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
              {uploadingImage
                ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                : <Camera className="w-4 h-4 text-gray-400" />}
              <span className="text-sm text-gray-500">{uploadingImage ? '업로드 중...' : '이미지 선택'}</span>
              <input type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
            </label>
          </div>
        </div>

        {/* 이벤트 타이틀 */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            이벤트 제목 <span className="text-gray-400 text-xs">(피드 배너에 표시)</span>
          </label>
          <input value={eventTitle} onChange={e => setEventTitle(e.target.value)}
            placeholder="예: 마지막글 이벤트 · 봄맞이 이벤트"
            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <p className="text-[11px] text-gray-400 mt-1">비워두면 '마지막글 이벤트'로 표시됩니다.</p>
        </div>

        {/* 상품명 */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">상품명</label>
          <input value={prize} onChange={e => setPrize(e.target.value)}
            placeholder="예: 버건디의 성 20주년판"
            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>

        {/* 설명/규칙 */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">이벤트 설명/규칙 <span className="text-gray-400 text-xs">(선택)</span></label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="예: 마지막으로 글을 쓴 사람이 상품을 받아요! 글 삭제 시 실격 처리됩니다."
            rows={3}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
        </div>

        {/* 타이머 */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">타이머 (분)</label>
          <div className="flex gap-2">
            {[30, 60, 120, 180].map(m => (
              <button key={m} onClick={() => setDurationMinutes(m)}
                className={`flex-1 min-w-[60px] py-2 rounded-xl text-sm font-semibold border transition-colors ${durationMinutes === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                {m >= 60 ? `${m / 60}시간` : `${m}분`}
              </button>
            ))}
          </div>
        </div>

        {/* 보너스카드 감소 시간 */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            🃏 보너스카드 1장 감소 시간
          </label>
          <div className="flex gap-2 items-center">
            {[60, 120, 180, 300, 600].map(s => (
              <button key={s} onClick={() => setCardReductionSeconds(s)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${cardReductionSeconds === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                {s >= 60 ? `${s / 60}분` : `${s}초`}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">카드 1장 사용 시 타이머가 <span className="font-semibold text-indigo-600">{cardReductionSeconds >= 60 ? `${cardReductionSeconds / 60}분` : `${cardReductionSeconds}초`}</span> 줄어듭니다.</p>
        </div>

        {/* 보너스카드 성공 확률 */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            🎲 보너스카드 성공 확률
          </label>
          <div className="flex gap-2 flex-wrap">
            {[100, 80, 60, 50, 30].map(rate => (
              <button key={rate} onClick={() => setCardSuccessRate(rate)}
                className={`flex-1 min-w-[48px] py-2 rounded-xl text-sm font-semibold border transition-colors ${cardSuccessRate === rate ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                {rate}%
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input type="range" min={1} max={100} value={cardSuccessRate}
              onChange={e => setCardSuccessRate(Number(e.target.value))}
              className="flex-1 accent-indigo-600" />
            <span className="text-sm font-bold text-indigo-600 w-10 text-right">{cardSuccessRate}%</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            {cardSuccessRate === 100
              ? '카드 사용 시 항상 성공합니다.'
              : `카드 사용 시 ${cardSuccessRate}% 확률로 타이머가 줄어듭니다. 실패해도 카드는 소모됩니다.`}
          </p>
        </div>

        {/* 휴식 시간 */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            💤 휴식 시간 <span className="text-gray-400 text-xs">(KST 기준, 해당 시간대 타이머 자동 멈춤)</span>
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-[11px] text-gray-400 mb-1">시작</p>
              <div className="flex gap-1">
                <select value={sleepStartH} onChange={e => setSleepStartH(Number(e.target.value))}
                  className="flex-1 h-10 px-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}시</option>
                  ))}
                </select>
                <select value={sleepStartM} onChange={e => setSleepStartM(Number(e.target.value))}
                  className="w-16 h-10 px-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                  {[0, 10, 15, 20, 30, 40, 45, 50].map(m => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
                  ))}
                </select>
              </div>
            </div>
            <span className="text-gray-400 text-sm mt-4">~</span>
            <div className="flex-1">
              <p className="text-[11px] text-gray-400 mb-1">종료</p>
              <div className="flex gap-1">
                <select value={sleepEndH} onChange={e => setSleepEndH(Number(e.target.value))}
                  className="flex-1 h-10 px-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}시</option>
                  ))}
                </select>
                <select value={sleepEndM} onChange={e => setSleepEndM(Number(e.target.value))}
                  className="w-16 h-10 px-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                  {[0, 10, 15, 20, 30, 40, 45, 50].map(m => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            현재 설정: {fmtSleepHour(sleepStart)} ~ {fmtSleepHour(sleepEnd)} 휴식
            {sleepStart === sleepEnd && <span className="text-amber-500 ml-1">⚠ 시작=종료 시 휴식 없음</span>}
          </p>
        </div>

        {/* 예약 시작 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">⏰ 예약 시작</label>
            <button
              type="button"
              onClick={() => { setScheduleEnabled(v => !v); setScheduledAt(''); }}
              className={`relative w-10 h-5 rounded-full transition-colors ${scheduleEnabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${scheduleEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {scheduleEnabled && (
            <div className="space-y-1.5">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />
              {scheduledAt && (
                <p className="text-[11px] text-indigo-500">
                  {new Date(scheduledAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}에 자동 시작
                </p>
              )}
            </div>
          )}
        </div>

        <button onClick={startEvent} disabled={saving || !prize.trim() || (scheduleEnabled && !scheduledAt)}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : scheduleEnabled ? <Clock className="w-4 h-4" /> : <Trophy className="w-4 h-4" />}
          {scheduleEnabled ? '이벤트 예약' : '이벤트 시작'}
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-xs text-amber-800 font-semibold mb-1">⚠️ 어뷰징 방지 안내</p>
        <p className="text-xs text-amber-700">설정된 휴식 시간(KST) 동안 타이머 자동 멈춤. 글 삭제 시 해당 유저 자동 실격 처리됩니다.</p>
      </div>

      {events.length > 0 && <DisqualifiedList accessToken={accessToken} />}

      {/* 참여 제외 관리 */}
      <EventExcludeSection accessToken={accessToken} />

      {/* 추천인 랭킹 이벤트 관리 */}
      <ReferralRankEventSection accessToken={accessToken} />

      {/* 이벤트 카테고리 공지(규칙사항) 관리 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <h3 className="font-bold text-gray-900 text-sm">이벤트 카테고리 공지 (규칙사항)</h3>
        </div>
        <p className="text-xs text-gray-400 -mt-2">피드의 이벤트 카테고리에 표시되는 규칙 안내문입니다.</p>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">공지 제목</label>
          <input
            value={noticeTitle}
            onChange={e => setNoticeTitle(e.target.value)}
            placeholder="예: 규칙사항"
            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">공지 내용</label>
          <textarea
            value={noticeContent}
            onChange={e => setNoticeContent(e.target.value)}
            placeholder={"예:\n1. 마지막으로 글을 쓴 사람이 이벤트에 참여됩니다.\n2. 글 삭제 시 자동 실격 처리됩니다.\n3. 중복 참여는 허용되지 않습니다."}
            rows={6}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 resize-none"
          />
        </div>

        <button
          onClick={saveNotice}
          disabled={savingNotice || !noticeLoaded}
          className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 text-white transition-colors"
          style={{ background: '#00BCD4' }}>
          {savingNotice ? <Loader2 className="w-4 h-4 animate-spin" /> : '💾'}
          공지 저장
        </button>
      </div>

      {/* 과거 이벤트 히스토리 */}
      {history.length > 0 && (
        <HistorySection history={history} saving={saving} accessToken={accessToken} onResume={resumeEvent} onReload={() => loadData(true)} />
      )}

      {/* 현재 활성 당첨 배너 (3시간 이내 자동 표시 중) */}
      {recentWinners.length > 0 && (
        <div className="bg-white rounded-2xl border border-yellow-200 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between">
            <h3 className="font-bold text-yellow-700 text-sm flex items-center gap-2">
              <span className="text-base">🏆</span>
              이벤트 마감 현황
              <span className="text-xs font-normal text-yellow-500 bg-yellow-50 px-2 py-0.5 rounded-full">{recentWinners.length}건</span>
            </h3>
          </div>
          <div className="border-t border-yellow-100 divide-y divide-yellow-50">
            {recentWinners.map((w: any, idx: number) => {
              const isPending = w.approved === false;
              return (
                <div key={w.eventId || idx} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    {w.prizeImageUrl && (
                      <img src={w.prizeImageUrl} className={`w-12 h-12 rounded-xl object-cover flex-shrink-0 border ${isPending ? 'border-yellow-200' : 'border-green-100'}`} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold">
                            🔍 검토 중
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                            📢 배너 표시 중
                          </span>
                        )}
                        {w.eventTitle && (
                          <span className="text-xs font-bold text-gray-700 truncate">{w.eventTitle}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900">🏆 {w.prize || '상품'}</p>
                      {w.winnerUserName ? (
                        <p className="text-[11px] text-gray-700 mt-0.5 font-medium">당첨자: {w.winnerUserName}</p>
                      ) : (
                        <p className="text-[11px] text-amber-500 mt-0.5">당첨자 없음</p>
                      )}
                      {w.closedAt && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          종료: {new Date(w.closedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {!isPending && <span className="ml-1 text-gray-300">(3시간 후 자동 사라짐)</span>}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        {isPending && (
                          <button
                            onClick={async () => {
                              if (!confirm(`"${w.winnerUserName || '당첨자 없음'}"을 당첨자로 공개할까요?\n모든 유저에게 당첨 배너가 표시됩니다.`)) return;
                              const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/event-winner/${w.eventId}/approve`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${accessToken}` },
                              });
                              if (res.ok) { await loadData(true); toast.success('당첨자를 공개했어요! 🎉'); }
                              else toast.error('실패했어요.');
                            }}
                            className="text-xs px-3 py-1 rounded-lg font-bold text-white bg-cyan-500 hover:bg-cyan-600 flex items-center gap-1"
                          >
                            🎉 당첨자 공개
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm(isPending ? '검토를 취소하고 이 이벤트 결과를 삭제할까요?' : '이 당첨 배너를 지금 내릴까요?')) return;
                            const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/event-winner/${w.eventId}`, {
                              method: 'DELETE',
                              headers: { Authorization: `Bearer ${accessToken}` },
                            });
                            if (res.ok) { await loadData(true); toast.success(isPending ? '이벤트 결과를 삭제했어요.' : '배너를 내렸어요.'); }
                            else toast.error('실패했어요.');
                          }}
                          className="text-xs px-3 py-1 rounded-lg font-bold text-white flex items-center gap-1 bg-red-400 hover:bg-red-500"
                        >
                          {isPending ? '결과 삭제' : '배너 내리기'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 추천인 랭킹 이벤트 관리 ──
function ReferralRankEventSection({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState(false);
  const [editingPrize, setEditingPrize] = useState(false);
  // 새 이벤트 시작 폼 필드
  const [prize, setPrize] = useState('');
  const [prizeCards, setPrizeCards] = useState(0);
  const [description, setDescription] = useState('');
  const [prizeImageUrl, setPrizeImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  // 진행중 이벤트 상품 수정 필드
  const [editPrize, setEditPrize] = useState('');
  const [editPrizeCards, setEditPrizeCards] = useState(0);
  const [editDescription, setEditDescription] = useState('');
  const [editPrizeImageUrl, setEditPrizeImageUrl] = useState('');
  const [uploadingEditImage, setUploadingEditImage] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/referral-rank-event`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // 날짜 입력값(YYYY-MM-DD) → ISO 변환 (KST 기준 시작/종료)
  const toStartISO = (d: string) => d ? new Date(`${d}T00:00:00+09:00`).toISOString() : null;
  const toEndISO   = (d: string) => d ? new Date(`${d}T23:59:59+09:00`).toISOString() : null;
  // ISO → YYYY-MM-DD (input value용)
  const isoToDate  = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) : '';

  const startEvent = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/referral-rank-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'start', prize, prizeCards, description, prizeImageUrl,
            eventStartDate: toStartISO(eventStartDate),
            eventEndDate:   toEndISO(eventEndDate) }) }
      );
      if (res.ok) { await load(); toast.success('추천인 랭킹 이벤트 시작!'); setPrize(''); setPrizeCards(0); setDescription(''); setPrizeImageUrl(''); setEventStartDate(''); setEventEndDate(''); }
      else toast.error('시작 실패');
    } catch { toast.error('오류'); }
    setSaving(false);
  };

  const updatePeriod = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/referral-rank-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'update',
            eventStartDate: toStartISO(eventStartDate),
            eventEndDate:   toEndISO(eventEndDate) }) }
      );
      if (res.ok) { await load(); toast.success('기간 업데이트 완료!'); setEditingPeriod(false); }
      else toast.error('업데이트 실패');
    } catch { toast.error('오류'); }
    setSaving(false);
  };

  const updatePrize = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/referral-rank-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            action: 'update',
            prize: editPrize,
            prizeCards: editPrizeCards,
            description: editDescription,
            prizeImageUrl: editPrizeImageUrl,
          }) }
      );
      if (res.ok) { await load(); toast.success('상품 정보 업데이트 완료!'); setEditingPrize(false); }
      else toast.error('업데이트 실패');
    } catch { toast.error('오류'); }
    setSaving(false);
  };

  const uploadEditImage = async (file: File) => {
    setUploadingEditImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData });
      const d = await res.json();
      if (d.imageUrl) { setEditPrizeImageUrl(d.imageUrl); toast.success('이미지 업로드 완료!'); }
      else toast.error('업로드 실패');
    } catch { toast.error('업로드 오류'); }
    setUploadingEditImage(false);
  };

  const stopEvent = async () => {
    if (!confirm('추천인 랭킹 이벤트를 종료할까요?')) return;
    setSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/referral-rank-event`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'stop' }) }
      );
      if (res.ok) { await load(); toast.success('이벤트 종료'); }
      else toast.error('종료 실패');
    } catch { toast.error('오류'); }
    setSaving(false);
  };

  const uploadImage = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: formData });
      const d = await res.json();
      if (d.imageUrl) { setPrizeImageUrl(d.imageUrl); toast.success('이미지 업로드 완료!'); }
      else toast.error('업로드 실패');
    } catch { toast.error('업로드 오류'); }
    setUploadingImage(false);
  };

  const event = data?.event;
  const ranking: any[] = data?.ranking || [];
  const history: any[] = data?.history || [];
  const isActive = event?.active;

  return (
    <div className="bg-white rounded-2xl border-2 overflow-hidden" style={{ borderColor: '#FFB300' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-amber-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🏅</span>
          <h3 className="font-bold text-gray-900 text-sm">추천인 랭킹 이벤트</h3>
          {isActive && (
            <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />진행중
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-amber-100 p-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
          ) : (
            <>
              {/* 진행중 이벤트 현황 */}
              {isActive && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: '#FFFDE7', border: '1.5px solid #FFE082' }}>

                  {/* 상품 정보 표시 */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-700 mb-0.5">진행중인 이벤트</p>
                      <p className="font-black text-gray-900 truncate">🏆 {event.prize || '상품 없음'}
                        {event.prizeCards > 0 && <span className="ml-2 text-sm font-bold" style={{ color: '#00BCD4' }}>+ 🃏×{event.prizeCards}</span>}
                      </p>
                      {event.description && <p className="text-xs text-gray-400 mt-1">{event.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {event.prizeImageUrl && !editingPrize && (
                        <img src={event.prizeImageUrl} className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                          style={{ border: '2px solid #00BCD4' }} />
                      )}
                      <button
                        onClick={() => {
                          if (editingPrize) { setEditingPrize(false); }
                          else {
                            setEditPrize(event.prize || '');
                            setEditPrizeCards(event.prizeCards || 0);
                            setEditDescription(event.description || '');
                            setEditPrizeImageUrl(event.prizeImageUrl || '');
                            setEditingPrize(true);
                            setEditingPeriod(false);
                          }
                        }}
                        className="text-[11px] text-amber-700 underline font-semibold whitespace-nowrap"
                      >
                        {editingPrize ? '취소' : '상품 수정'}
                      </button>
                    </div>
                  </div>

                  {/* 상품 수정 폼 */}
                  {editingPrize && (
                    <div className="bg-white rounded-xl p-4 space-y-3 border border-amber-200">
                      {/* 이미지 */}
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 block mb-1.5">상품 이미지</label>
                        <div className="flex items-center gap-3">
                          {editPrizeImageUrl && (
                            <div className="relative flex-shrink-0">
                              <img src={editPrizeImageUrl} className="w-14 h-14 rounded-xl object-cover"
                                style={{ border: '2px solid #00BCD4' }} />
                              <button onClick={() => setEditPrizeImageUrl('')}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white flex items-center justify-center">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          )}
                          <label className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-amber-300 hover:bg-amber-50 transition-colors">
                            {uploadingEditImage
                              ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                              : <Camera className="w-4 h-4 text-gray-400" />}
                            <span className="text-xs text-gray-500">{uploadingEditImage ? '업로드 중...' : (editPrizeImageUrl ? '이미지 교체' : '이미지 선택')}</span>
                            <input type="file" accept="image/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) uploadEditImage(f); e.target.value = ''; }} />
                          </label>
                        </div>
                      </div>

                      {/* 상품명 */}
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 block mb-1">상품명</label>
                        <input value={editPrize} onChange={e => setEditPrize(e.target.value)}
                          placeholder="예: 카탄 10주년판"
                          className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      </div>

                      {/* 보너스카드 */}
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 block mb-1">추가 보너스카드 장수</label>
                        <div className="flex gap-1.5">
                          {[0, 3, 5, 10].map(n => (
                            <button key={n} onClick={() => setEditPrizeCards(n)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${editPrizeCards === n ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                              style={editPrizeCards === n ? { background: '#00BCD4', borderColor: '#00BCD4' } : {}}>
                              {n === 0 ? '없음' : `🃏 ${n}장`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 설명 */}
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 block mb-1">이벤트 설명 <span className="text-gray-400">(선택)</span></label>
                        <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)}
                          placeholder="예: 이벤트 기간 동안 가장 많은 친구를 초대한 분께 상품 증정!"
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
                      </div>

                      <button onClick={updatePrize} disabled={saving}
                        className="w-full py-2 rounded-lg text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
                        style={{ background: '#FFB300' }}>
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : '✅'} 상품 정보 저장
                      </button>
                    </div>
                  )}

                  {/* 기간 표시 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-amber-600">
                        📅 집계 기간: {event.eventStartDate ? isoToDate(event.eventStartDate) : '이벤트 시작일'} ~ {event.eventEndDate ? isoToDate(event.eventEndDate) : '미설정'}
                      </p>
                      <button onClick={() => { setEditingPeriod(v => !v); setEventStartDate(isoToDate(event.eventStartDate)); setEventEndDate(isoToDate(event.eventEndDate)); setEditingPrize(false); }}
                        className="text-[11px] text-amber-700 underline font-semibold">
                        {editingPeriod ? '취소' : '기간 수정'}
                      </button>
                    </div>
                    {editingPeriod && (
                      <div className="bg-white rounded-xl p-3 space-y-2.5 border border-amber-200">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-medium text-gray-500 block mb-1">시작일</label>
                            <input type="date" value={eventStartDate} onChange={e => setEventStartDate(e.target.value)}
                              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300" />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-gray-500 block mb-1">종료일</label>
                            <input type="date" value={eventEndDate} onChange={e => setEventEndDate(e.target.value)}
                              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300" />
                          </div>
                        </div>
                        <button onClick={updatePeriod} disabled={saving}
                          className="w-full py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1"
                          style={{ background: '#FFB300' }}>
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null} 저장
                        </button>
                      </div>
                    )}
                    <p className="text-[11px] text-amber-600">
                      🚀 등록일: {new Date(event.startedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      &nbsp;·&nbsp;총 추천 {data?.totalLogs || 0}건 로그
                    </p>
                    {data?.expired && (
                      <p className="text-[11px] font-bold text-red-500">⚠️ 집계 기간이 종료됐습니다. 이벤트를 닫아주세요.</p>
                    )}
                  </div>
                  <button onClick={stopEvent} disabled={saving}
                    className="w-full py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    이벤트 종료
                  </button>
                </div>
              )}

              {/* 현재 랭킹 */}
              {isActive && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-600">현재 랭킹 ({ranking.length}명)</p>
                  {ranking.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-xl">아직 추천인 없음</div>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {ranking.map((r: any, i: number) => (
                        <div key={r.referrerId} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${i === 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                          <span className="text-sm font-black w-6 text-center flex-shrink-0"
                            style={{ color: i === 0 ? '#FFB300' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : '#d1d5db' }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{r.referrerName || '익명'}</p>
                            <p className="text-[10px] text-gray-400 truncate">{r.recruits?.map((rc: any) => rc.name).join(', ')}</p>
                          </div>
                          <span className="text-lg font-black flex-shrink-0" style={{ color: i === 0 ? '#FFB300' : '#374151' }}>
                            {r.count}<span className="text-xs font-normal text-gray-400">명</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 새 이벤트 시작 폼 */}
              {!isActive && (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-gray-700">새 이벤트 시작</p>

                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1.5">상품 이미지 <span className="text-gray-400">(선택)</span></label>
                    <div className="flex items-center gap-3">
                      {prizeImageUrl && (
                        <div className="relative">
                          <img src={prizeImageUrl} className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
                          <button onClick={() => setPrizeImageUrl('')} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white flex items-center justify-center">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                      <label className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-amber-300 hover:bg-amber-50 transition-colors">
                        {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Camera className="w-4 h-4 text-gray-400" />}
                        <span className="text-xs text-gray-500">{uploadingImage ? '업로드 중...' : '이미지 선택'}</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">상품명</label>
                    <input value={prize} onChange={e => setPrize(e.target.value)}
                      placeholder="예: 카탄 10주년판"
                      className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">추가 보너스카드 장수</label>
                    <div className="flex gap-2">
                      {[0, 3, 5, 10].map(n => (
                        <button key={n} onClick={() => setPrizeCards(n)}
                          className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${prizeCards === n ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                          style={prizeCards === n ? { background: '#00BCD4', borderColor: '#00BCD4' } : {}}>
                          {n === 0 ? '없음' : `🃏 ${n}장`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">이벤트 설명 <span className="text-gray-400">(선택)</span></label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="예: 이벤트 기간 동안 가장 많은 친구를 초대한 분께 상품 증정!"
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
                  </div>

                  {/* 기간 설정 */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1.5">📅 집계 기간 <span className="text-gray-400">(선택 — 미설정 시 이벤트 시작일부터 종료까지)</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">시작일</label>
                        <input type="date" value={eventStartDate} onChange={e => setEventStartDate(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">종료일</label>
                        <input type="date" value={eventEndDate} onChange={e => setEventEndDate(e.target.value)}
                          min={eventStartDate || undefined}
                          className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      </div>
                    </div>
                    {eventStartDate && eventEndDate && (
                      <p className="text-[11px] text-amber-600 mt-1.5">
                        📅 {eventStartDate} ~ {eventEndDate} ({Math.ceil((new Date(eventEndDate).getTime() - new Date(eventStartDate).getTime()) / 86400000) + 1}일간)
                      </p>
                    )}
                  </div>

                  <button onClick={startEvent} disabled={saving || !prize.trim()}
                    className="w-full py-3 rounded-xl text-white font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    style={{ background: '#FFB300' }}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>🏅</span>}
                    추천인 랭킹 이벤트 시작
                  </button>
                </div>
              )}

              {/* 과거 이벤트 히스토리 */}
              {history.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <button onClick={() => setShowHistory(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-xs font-bold text-gray-600">
                    📋 과거 이벤트 기록 ({history.length}건)
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                  </button>
                  {showHistory && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {history.map((h: any, i: number) => (
                        <div key={i} className="px-4 py-3">
                          <p className="text-xs font-bold text-gray-700">🏆 {h.prize || '상품 없음'}{h.prizeCards > 0 && ` + 🃏×${h.prizeCards}`}</p>
                          {(h.eventStartDate || h.eventEndDate) && (
                            <p className="text-[11px] text-amber-600 mt-0.5">
                              📅 집계: {h.eventStartDate ? new Date(h.eventStartDate).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '?'}
                              &nbsp;~&nbsp;
                              {h.eventEndDate ? new Date(h.eventEndDate).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '?'}
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            등록: {h.startedAt ? new Date(h.startedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                            &nbsp;/&nbsp;
                            종료: {h.stoppedAt ? new Date(h.stoppedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}


function DisqualifiedList({ accessToken }: { accessToken: string }) {
  const [list, setList] = useState<string[]>([]);
  const load = async () => {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event/disqualified`,
        { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) setList(await res.json());
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const reinstate = async (userId: string) => {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/last-post-event/disqualified`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ userId }) });
      if (res.ok) setList(prev => prev.filter(id => id !== userId));
    } catch {}
  };

  if (list.length === 0) return (
    <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-400 text-center">실격자 없음</div>
  );

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <p className="text-xs font-bold text-red-700 mb-2">🚫 실격자 목록 ({list.length}명)</p>
      <div className="space-y-1.5">
        {list.map(uid => (
          <div key={uid} className="flex items-center justify-between">
            <span className="text-xs text-gray-700 font-mono">{uid.slice(0, 12)}...</span>
            <button onClick={() => reinstate(uid)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-red-300 text-red-600 hover:bg-red-50">
              실격 해제
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 이벤트 참여 제외 관리 ──
function EventExcludeSection({ accessToken }: { accessToken: string }) {
  const [excluded, setExcluded] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);

  const loadExcluded = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/event-excluded-users`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) { const d = await res.json(); setExcluded(d.list || []); }
    } catch {}
  };

  const loadMembers = async () => {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/beta-testers?limit=1000&offset=0&includeGameData=false`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) { const d = await res.json(); setMembers((d.testers || []).filter((t: any) => t.status === 'approved')); }
    } catch {}
  };

  useEffect(() => {
    Promise.all([loadExcluded(), loadMembers()]).finally(() => setLoading(false));
  }, []);

  const addExclude = async (member: any) => {
    setAdding(member.userId);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/event-excluded-users`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ userId: member.userId, email: member.email, userName: member.name || member.username || member.nickname || '', reason }),
        }
      );
      if (res.ok) { await loadExcluded(); setSearch(''); setReason(''); toast.success(`${member.name || member.email} 참여 제외 등록`); }
      else toast.error('등록 실패');
    } catch { toast.error('오류'); }
    setAdding(null);
  };

  const removeExclude = async (userId: string, name: string) => {
    setRemoving(userId);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/event-excluded-users`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ userId }) }
      );
      if (res.ok) { setExcluded(prev => prev.filter(e => e.userId !== userId)); toast.success(`${name} 제외 해제`); }
      else toast.error('해제 실패');
    } catch { toast.error('오류'); }
    setRemoving(null);
  };

  const excludedIds = new Set(excluded.map(e => e.userId));
  const filteredMembers = members.filter(m => {
    if (excludedIds.has(m.userId)) return false;
    const q = search.toLowerCase();
    return q && (
      (m.name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q) ||
      (m.nickname || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-white rounded-2xl border border-orange-200 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-orange-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🚷</span>
          <h3 className="font-bold text-gray-900 text-sm">이벤트 참여 제외 관리</h3>
          {excluded.length > 0 && (
            <span className="text-xs font-semibold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">{excluded.length}명</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-orange-100 p-5 space-y-4">
          <p className="text-xs text-gray-400">제외된 유저의 글은 이벤트 마지막 글 계산에서 제외됩니다. 이벤트가 종료되어도 설정은 유지됩니다.</p>

          {/* 현재 제외 목록 */}
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
          ) : excluded.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-xl">제외된 참가자 없음</div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-orange-700">🚷 제외 목록 ({excluded.length}명)</p>
              {excluded.map(entry => (
                <div key={entry.userId} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{entry.userName || entry.email?.split('@')[0]}</span>
                      <span className="text-xs text-gray-400">{entry.email}</span>
                    </div>
                    {entry.reason && (
                      <p className="text-[11px] text-orange-500 mt-0.5">사유: {entry.reason}</p>
                    )}
                    <p className="text-[10px] text-gray-300 mt-0.5">
                      {new Date(entry.excludedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 등록
                    </p>
                  </div>
                  <button
                    onClick={() => removeExclude(entry.userId, entry.userName || entry.email)}
                    disabled={removing === entry.userId}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-white border border-orange-300 text-orange-600 hover:bg-orange-50 font-semibold disabled:opacity-50"
                  >
                    {removing === entry.userId ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    제외 해제
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 유저 검색 & 추가 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600">유저 검색 후 추가</p>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="이름·이메일·닉네임 검색..."
              className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="제외 사유 (선택)"
              className="w-full h-9 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            {search.length >= 1 && filteredMembers.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-52 overflow-y-auto">
                {filteredMembers.slice(0, 10).map(m => (
                  <div key={m.userId} className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50">
                    <div>
                      <span className="text-sm font-semibold text-gray-800">{m.name || m.nickname || m.username}</span>
                      <span className="text-xs text-gray-400 ml-1.5">{m.email}</span>
                    </div>
                    <button
                      onClick={() => addExclude(m)}
                      disabled={adding === m.userId}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-orange-500 text-white hover:bg-orange-600 font-semibold disabled:opacity-50"
                    >
                      {adding === m.userId ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>+ 제외 등록</span>}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {search.length >= 1 && filteredMembers.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">검색 결과 없음 (이미 제외됐거나 존재하지 않는 유저)</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 살래말래 관리 섹션 ──
function SallaeAdminSection({ accessToken }: { accessToken: string }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, { buy: number; pass: number }>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts?category=${encodeURIComponent('살래말래')}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const sallae = (data.posts || []).filter((p: any) => p.category === '살래말래');
          setPosts(sallae);
          const init: Record<string, { buy: number; pass: number; think: number }> = {};
          sallae.forEach((p: any) => {
            const adminBuy = (p.sallae?.buy || []).filter((id: string) => id.startsWith('admin_')).length;
            const adminPass = (p.sallae?.pass || []).filter((id: string) => id.startsWith('admin_')).length;
            const adminThink = (p.sallae?.think || []).filter((id: string) => id.startsWith('admin_')).length;
            init[p.id] = { buy: adminBuy, pass: adminPass, think: adminThink };
          });
          setInputs(init);
        }
      } catch { toast.error('로드 실패'); }
      setLoading(false);
    };
    load();
  }, [accessToken]);

  const save = async (postId: string) => {
    setSaving(postId);
    try {
      const { buy, pass, think } = inputs[postId] || { buy: 0, pass: 0, think: 0 };
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/${postId}/sallae/admin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ buyCount: buy, passCount: pass, thinkCount: think }),
        }
      );
      if (res.ok) toast.success('저장됐어요!');
      else toast.error('저장 실패');
    } catch { toast.error('저장 실패'); }
    setSaving(null);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  if (posts.length === 0) return <p className="text-center text-gray-400 py-12">살래말래 게시물이 없어요</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">실제 유저 투표는 유지되며, 관리자 추가 카운트만 조작돼요.</p>
      {posts.map(post => {
        const realBuy = (post.sallae?.buy || []).filter((id: string) => !id.startsWith('admin_')).length;
        const realPass = (post.sallae?.pass || []).filter((id: string) => !id.startsWith('admin_')).length;
        const realThink = (post.sallae?.think || []).filter((id: string) => !id.startsWith('admin_')).length;
        const adminBuy = inputs[post.id]?.buy ?? 0;
        const adminPass = inputs[post.id]?.pass ?? 0;
        const adminThink = inputs[post.id]?.think ?? 0;
        const totalBuy = realBuy + adminBuy;
        const totalPass = realPass + adminPass;
        const totalThink = realThink + adminThink;
        const voteTotal = totalBuy + totalPass;
        const total = voteTotal + totalThink;
        const buyPct = voteTotal > 0 ? Math.round(totalBuy / voteTotal * 100) : 50;

        return (
          <div key={post.id} className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-start gap-3 mb-4">
              {post.linkedGame?.imageUrl && (
                <img src={post.linkedGame.imageUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{post.linkedGame?.name || '게임 미지정'}</p>
                <p className="text-xs text-gray-400 truncate">{post.content || ''}</p>
              </div>
            </div>

            {/* 현재 통계 */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
              <div className="flex justify-between mb-1 flex-wrap gap-1">
                <span className="text-[#00AAEE] font-bold">살래 {totalBuy}명 ({realBuy}+{adminBuy}관리자)</span>
                <span className="font-bold" style={{ color: '#4CAF50' }}>고민중 {totalThink}명 ({realThink}+{adminThink}관리자)</span>
                <span className="text-[#FF3355] font-bold">말래 {totalPass}명 ({realPass}+{adminPass}관리자)</span>
              </div>
              <div className="flex rounded-lg overflow-hidden h-4 mt-2">
                <div style={{ width: `${buyPct}%`, backgroundColor: '#00AAEE' }} className="transition-all duration-300" />
                <div style={{ width: `${100 - buyPct}%`, backgroundColor: '#FF3355' }} className="transition-all duration-300" />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-center">{buyPct}% 살래 | 총 {total}명 참여</p>
            </div>

            {/* 관리자 카운트 입력 */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[80px]">
                <label className="text-xs text-[#00AAEE] font-semibold mb-1 block">살래 추가</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => setInputs(p => ({ ...p, [post.id]: { ...p[post.id], buy: Math.max(0, (p[post.id]?.buy ?? 0) - 1) } }))}
                    className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-600">−</button>
                  <input type="number" min={0} value={inputs[post.id]?.buy ?? 0}
                    onChange={e => setInputs(p => ({ ...p, [post.id]: { ...p[post.id], buy: Math.max(0, parseInt(e.target.value) || 0) } }))}
                    className="flex-1 h-7 text-center text-sm border border-gray-200 rounded-lg" />
                  <button onClick={() => setInputs(p => ({ ...p, [post.id]: { ...p[post.id], buy: (p[post.id]?.buy ?? 0) + 1 } }))}
                    className="w-7 h-7 rounded-lg bg-[#00AAEE]/10 hover:bg-[#00AAEE]/20 flex items-center justify-center font-bold text-[#00AAEE]">+</button>
                </div>
              </div>
              <div className="flex-1 min-w-[80px]">
                <label className="text-xs font-semibold mb-1 block" style={{ color: '#4CAF50' }}>고민중 추가</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => setInputs(p => ({ ...p, [post.id]: { ...p[post.id], think: Math.max(0, (p[post.id]?.think ?? 0) - 1) } }))}
                    className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-600">−</button>
                  <input type="number" min={0} value={inputs[post.id]?.think ?? 0}
                    onChange={e => setInputs(p => ({ ...p, [post.id]: { ...p[post.id], think: Math.max(0, parseInt(e.target.value) || 0) } }))}
                    className="flex-1 h-7 text-center text-sm border border-gray-200 rounded-lg" />
                  <button onClick={() => setInputs(p => ({ ...p, [post.id]: { ...p[post.id], think: (p[post.id]?.think ?? 0) + 1 } }))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold"
                    style={{ backgroundColor: 'rgba(76,175,80,0.1)', color: '#4CAF50' }}>+</button>
                </div>
              </div>
              <div className="flex-1 min-w-[80px]">
                <label className="text-xs text-[#FF3355] font-semibold mb-1 block">말래 추가</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => setInputs(p => ({ ...p, [post.id]: { ...p[post.id], pass: Math.max(0, (p[post.id]?.pass ?? 0) - 1) } }))}
                    className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-600">−</button>
                  <input type="number" min={0} value={inputs[post.id]?.pass ?? 0}
                    onChange={e => setInputs(p => ({ ...p, [post.id]: { ...p[post.id], pass: Math.max(0, parseInt(e.target.value) || 0) } }))}
                    className="flex-1 h-7 text-center text-sm border border-gray-200 rounded-lg" />
                  <button onClick={() => setInputs(p => ({ ...p, [post.id]: { ...p[post.id], pass: (p[post.id]?.pass ?? 0) + 1 } }))}
                    className="w-7 h-7 rounded-lg bg-[#FF3355]/10 hover:bg-[#FF3355]/20 flex items-center justify-center font-bold text-[#FF3355]">+</button>
                </div>
              </div>
              <div className="pt-5">
                <button onClick={() => save(post.id)} disabled={saving === post.id}
                  className="h-7 px-4 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1">
                  {saving === post.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  저장
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AdminPage({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('approval');

  const tabs: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'approval', label: '게시물 승인', icon: <Shield className="w-4 h-4" />, desc: '커스텀 게시물 승인' },
    { id: 'members', label: '가입자 관리', icon: <Users className="w-4 h-4" />, desc: '사용자 목록 및 승인' },
    { id: 'analytics', label: '통계', icon: <BarChart3 className="w-4 h-4" />, desc: '방문자 및 현황' },
    { id: 'backup', label: '백업 관리', icon: <Database className="w-4 h-4" />, desc: '데이터 백업' },
    { id: 'popup', label: '팝업 관리', icon: <Megaphone className="w-4 h-4" />, desc: '공지 팝업 편집' },
    { id: 'migration', label: 'DB 마이그레이션', icon: <RefreshCw className="w-4 h-4" />, desc: '위키 게임ID 통합' },
    { id: 'player-migration', label: '인원 업데이트', icon: <Users className="w-4 h-4" />, desc: '가능 인원 일괄 변경' },
    { id: 'notices', label: '공지 관리', icon: <Star className="w-4 h-4" />, desc: '후원/피드백 카드' },
    { id: 'recommended', label: '추천 게임', icon: <Gamepad2 className="w-4 h-4" />, desc: '이런 게임 어때요?' },
    { id: 'homework', label: '숙제 관리', icon: <Trophy className="w-4 h-4" />, desc: '숙제 카테고리 및 검사' },
    { id: 'calculators', label: '계산기 검수', icon: <Shield className="w-4 h-4" />, desc: '공개 요청 계산기 검수' },
    { id: 'sallae', label: '살래말래 관리', icon: <SlidersHorizontal className="w-4 h-4" />, desc: '투표 카운트 조작' },
    { id: 'image-review', label: '이미지 검수', icon: <Shield className="w-4 h-4" />, desc: '게임 이미지 변경 요청' },
    { id: 'last-event', label: '마지막글 이벤트', icon: <Trophy className="w-4 h-4" />, desc: '이벤트 켜기/끄기' },
    { id: 'spam', label: '도배·어뷰징', icon: <AlertCircle className="w-4 h-4" />, desc: '스팸 회원 관리' },
    { id: 'activity-cards', label: '활동 카드 로그', icon: <span className="text-base leading-none">🃏</span>, desc: '글·댓글 카드 획득 내역' },
    { id: 'bulk-mail', label: '단체 메일', icon: <span className="text-base leading-none">📧</span>, desc: '전체 회원 메일 발송' },
    { id: 'site-games', label: '게임 DB 관리', icon: <span className="text-base leading-none">🎲</span>, desc: '등록 게임 수정·삭제·통합' },
    { id: 'operator', label: '운영자 페이지', icon: <span className="text-base leading-none">🛠</span>, desc: '운영진 관리 및 수익 정산' },
    { id: 'auction-results', label: '경매 관리', icon: <span className="text-base leading-none">🔨</span>, desc: '경매 요청 검토 및 낙찰 결과' },
  ];

  const menuGroups: { label: string; ids: Tab[] }[] = [
    { label: '콘텐츠 관리', ids: ['approval', 'image-review', 'calculators', 'popup', 'notices', 'recommended'] },
    { label: '회원 관리',   ids: ['members', 'spam', 'bulk-mail'] },
    { label: '커뮤니티',    ids: ['homework', 'sallae', 'last-event'] },
    { label: '게임 · DB',   ids: ['site-games', 'migration', 'player-migration'] },
    { label: '통계 · 데이터', ids: ['analytics', 'backup', 'activity-cards'] },
    { label: '운영',         ids: ['operator', 'auction-results'] },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* 헤더 */}
        <div className="mb-5 sm:mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">관리자 페이지</h1>
              <p className="text-sm text-gray-400 hidden sm:block">BOARDRAUM Admin Dashboard</p>
            </div>
          </div>
          <button onClick={onBack} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm">
            <X className="w-4 h-4" /> 닫기
          </button>
        </div>

        {/* 그룹형 메뉴 */}
        <div className="space-y-4 mb-6">
          {menuGroups.map(group => (
            <div key={group.label}>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{group.label}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.ids.map(id => {
                  const tab = tabs.find(t => t.id === id);
                  if (!tab) return null;
                  const isActive = activeTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                        isActive
                          ? 'bg-white border-cyan-300 shadow-md ring-1 ring-cyan-200'
                          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>{tab.icon}</div>
                      <div className="min-w-0">
                        <span className={`text-xs font-semibold block truncate leading-tight ${isActive ? 'text-cyan-700' : 'text-gray-700'}`}>{tab.label}</span>
                        <span className="text-[10px] text-gray-400 block truncate mt-0.5 hidden sm:block">{tab.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="min-h-[400px]">
          {activeTab === 'approval' && <ApprovalSection accessToken={accessToken} />}
          {activeTab === 'members' && <MembersSection accessToken={accessToken} />}
          {activeTab === 'analytics' && <AnalyticsSection accessToken={accessToken} />}
          {activeTab === 'backup' && <BackupSection accessToken={accessToken} />}
          {activeTab === 'popup' && <PopupSection accessToken={accessToken} />}
          {activeTab === 'migration' && <WikiMigrationSection accessToken={accessToken} />}
          {activeTab === 'player-migration' && <PlayerMigrationSection accessToken={accessToken} />}
          {activeTab === 'notices' && <NoticesSection accessToken={accessToken} />}
          {activeTab === 'recommended' && <RecommendedGamesAdminSection accessToken={accessToken} />}
          {activeTab === 'calculators' && <CalculatorReviewSection accessToken={accessToken} />}
          {activeTab === 'homework' && <HomeworkSection accessToken={accessToken} />}
          {activeTab === 'sallae' && <SallaeAdminSection accessToken={accessToken} />}
          {activeTab === 'image-review' && <ImageReviewSection accessToken={accessToken} />}
          {activeTab === 'last-event' && <LastPostEventSection accessToken={accessToken} />}
          {activeTab === 'spam' && <SpamManagementSection accessToken={accessToken} />}
          {activeTab === 'activity-cards' && <ActivityCardLogSection accessToken={accessToken} />}
          {activeTab === 'bulk-mail' && <BulkMailSection accessToken={accessToken} />}
          {activeTab === 'site-games' && <SiteGamesSection accessToken={accessToken} />}
          {activeTab === 'operator' && <OperatorSection accessToken={accessToken} />}
          {activeTab === 'auction-results' && <AuctionResultsSection accessToken={accessToken} />}
        </div>
      </div>
    </div>
  );
}

// ─── 도배·어뷰징 관리 섹션 ──────────────────────────────────────────────────

interface SpamLog {
  userId: string;
  userEmail: string;
  userName: string;
  count: number;
  firstAt: string;
  lastAt: string;
  restricted: boolean;
  actions: { type: string; at: string; preview: string }[];
}

function SpamManagementSection({ accessToken }: { accessToken: string }) {
  const [logs, setLogs] = useState<SpamLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SpamLog | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/spam-logs`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
    } catch (e) {
      toast.error('도배 로그 로딩 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleRestrict = async (log: SpamLog) => {
    setActing(log.userId);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/users/${log.userId}/community-restrict`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ restrict: !log.restricted, reason: '도배·어뷰징 감지' }),
        }
      );
      if (!res.ok) throw new Error();
      toast.success(log.restricted ? `${log.userName} 제한 해제 완료` : `${log.userName} 커뮤니티 제한 완료`);
      setLogs(prev => prev.map(l => l.userId === log.userId ? { ...l, restricted: !l.restricted } : l));
    } catch {
      toast.error('처리 실패');
    } finally {
      setActing(null);
    }
  };

  const removeLog = async (log: SpamLog) => {
    setActing(log.userId);
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/spam-logs/${log.userId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      toast.success('로그 삭제 완료');
      setLogs(prev => prev.filter(l => l.userId !== log.userId));
    } catch {
      toast.error('삭제 실패');
    } finally {
      setActing(null);
      setConfirmDelete(null);
    }
  };

  const forceWithdraw = async (log: SpamLog) => {
    if (!window.confirm(`정말로 ${log.userName}(${log.userEmail}) 계정을 강제 삭제하시겠습니까?`)) return;
    setActing(log.userId);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/users/${log.userId}/force-withdraw`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error();
      toast.success(`${log.userName} 계정 강제 삭제 완료`);
      setLogs(prev => prev.filter(l => l.userId !== log.userId));
    } catch {
      toast.error('강제 삭제 실패');
    } finally {
      setActing(null);
    }
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const actionTypeColor: Record<string, string> = {
    '글작성': 'bg-blue-100 text-blue-700',
    '댓글': 'bg-green-100 text-green-700',
    '대댓글': 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" /> 도배·어뷰징 관리
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">3초 이내 연속 작성이 감지된 회원 목록입니다.</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">감지된 도배 기록이 없습니다</p>
          <p className="text-xs text-gray-400 mt-1">커뮤니티가 건강하게 운영되고 있어요 🎉</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map(log => (
            <div key={log.userId}
              className={`bg-white rounded-2xl border ${log.restricted ? 'border-red-200 bg-red-50/30' : 'border-gray-200'} overflow-hidden`}>
              {/* 헤더 */}
              <div className="px-5 py-4 flex items-center gap-3">
                {/* 아바타 자리 */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {log.userName?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 text-sm">{log.userName}</span>
                    <span className="text-xs text-gray-400">{log.userEmail}</span>
                    {log.restricted && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">🚫 커뮤니티 제한</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-red-500 font-semibold">⚡ 도배 감지 {log.count}회</span>
                    <span className="text-xs text-gray-400">최근: {fmtDate(log.lastAt)}</span>
                    <span className="text-xs text-gray-400">최초: {fmtDate(log.firstAt)}</span>
                  </div>
                </div>
                {/* 액션 버튼 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setExpandedId(expandedId === log.userId ? null : log.userId)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {expandedId === log.userId ? '접기' : '상세'}
                  </button>
                  <button
                    onClick={() => toggleRestrict(log)}
                    disabled={acting === log.userId}
                    className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 transition-colors ${
                      log.restricted
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    }`}>
                    {acting === log.userId ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {log.restricted ? '제한 해제' : '커뮤니티 제한'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(log)}
                    disabled={acting === log.userId}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-semibold flex items-center gap-1">
                    <Trash2 className="w-3 h-3" />
                    강제탈퇴
                  </button>
                </div>
              </div>

              {/* 상세 로그 */}
              {expandedId === log.userId && log.actions && log.actions.length > 0 && (
                <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3 space-y-1.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-600">도배 감지 상세 기록</p>
                    <button
                      onClick={() => removeLog(log)}
                      disabled={acting === log.userId}
                      className="text-[10px] text-gray-400 hover:text-red-500 underline">
                      로그 삭제
                    </button>
                  </div>
                  {[...log.actions].reverse().map((action, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${actionTypeColor[action.type] || 'bg-gray-100 text-gray-600'}`}>
                        {action.type}
                      </span>
                      <span className="text-gray-400 flex-shrink-0">{fmtDate(action.at)}</span>
                      {action.preview && (
                        <span className="text-gray-600 truncate">{action.preview}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 강제탈퇴 확인 모달 */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
          onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="font-bold text-gray-900 text-center text-base mb-2">강제 탈퇴 처리</h3>
            <p className="text-sm text-gray-600 text-center leading-relaxed mb-1">
              <span className="font-semibold text-gray-900">{confirmDelete.userName}</span> 회원을 강제 탈퇴 처리합니다.
            </p>
            <p className="text-xs text-red-500 text-center mb-6">이 작업은 되돌릴 수 없습니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button
                onClick={() => forceWithdraw(confirmDelete)}
                disabled={acting === confirmDelete.userId}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 flex items-center justify-center gap-1.5">
                {acting === confirmDelete.userId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                강제 탈퇴
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 계산기 검수 섹션 ────────────────────────────────────────────────────────

function CalculatorReviewSection({ accessToken }: { accessToken: string }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/calculators`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (res.ok) {
        setRequests(data.calculators || []);
      } else {
        setError(`${res.status}: ${JSON.stringify(data)}`);
      }
    } catch(e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const approve = async (calc: any) => {
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/calculators/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ calcId: calc.id, userId: calc.userId }),
        }
      );
      toast.success('승인 완료');
      load();
    } catch { toast.error('승인 실패'); }
  };

  const reject = async (calc: any) => {
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/calculators/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ calcId: calc.id, userId: calc.userId }),
        }
      );
      toast.success('반려 완료');
      load();
    } catch { toast.error('반려 실패'); }
  };

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pending = requests.filter(c => c.shareRequested && !c.approved);
  const approved = requests.filter(c => c.approved);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-2">
      <p className="font-bold">API 오류</p>
      <p className="font-mono text-xs break-all">{error}</p>
      <button onClick={load} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded-lg">재시도</button>
    </div>
  );

  const CalcCard = ({ calc, isPending }: { calc: any; isPending: boolean }) => {
    const isOpen = expandedId === calc.id;
    return (
      <div className={`bg-white rounded-xl border transition-all ${isOpen ? (isPending ? 'border-orange-300 shadow-md' : 'border-green-300 shadow-md') : (isPending ? 'border-orange-200' : 'border-green-200')}`}>
        {/* 헤더 - 클릭해서 펼침 */}
        <button className="w-full p-4 text-left" onClick={() => setExpandedId(isOpen ? null : calc.id)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isPending ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                  {isPending ? '대기중' : '공개중'}
                </span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{calc.gameName}</span>
                <span className="text-xs text-gray-400">{calc.items?.length}개 항목</span>
              </div>
              <p className="font-semibold text-gray-900">{calc.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">제출자: {calc.userId?.slice(0, 8)}...</p>
            </div>
            {isOpen
              ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
              : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
          </div>
        </button>

        {/* 펼침: 계산기 미리보기 */}
        {isOpen && (
          <div className="border-t border-gray-100">
            <div className="p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">계산기 항목 미리보기</p>
              {/* 계산기 시뮬레이션 UI */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                {calc.items?.map((item: any, idx: number) => (
                  <div key={item.id || idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">{item.name}</span>
                      {item.description && (
                        <span className="text-xs bg-cyan-100 text-cyan-600 px-2 py-0.5 rounded-full">{item.description}</span>
                      )}
                    </div>
                    <div className="w-16 h-8 border border-gray-200 rounded-lg bg-white flex items-center justify-center text-xs text-gray-400">
                      숫자입력
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t-2 border-cyan-400">
                  <span className="text-sm font-bold text-gray-900">합계</span>
                  <span className="text-sm font-bold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-lg">0점</span>
                </div>
              </div>
            </div>
            {isPending && (
              <div className="flex gap-2 p-4 bg-gray-50 border-t border-gray-100 rounded-b-xl">
                <button onClick={() => reject(calc)}
                  className="flex-1 py-2.5 text-sm border border-red-200 text-red-500 hover:bg-red-50 rounded-lg font-medium flex items-center justify-center gap-1.5">
                  <XCircle className="w-4 h-4" /> 반려
                </button>
                <button onClick={() => approve(calc)}
                  className="flex-1 py-2.5 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold flex items-center justify-center gap-1.5">
                  <CheckCircle className="w-4 h-4" /> 승인 · 공개
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 검수 대기 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-700">검수 대기 ({pending.length}건)</h3>
          <button onClick={load} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> 새로고침
          </button>
        </div>
        {pending.length === 0
          ? <div className="text-center py-8 bg-gray-50 rounded-xl text-gray-400 text-sm">대기 중인 요청이 없어요</div>
          : <div className="space-y-3">{pending.map(calc => <CalcCard key={calc.id} calc={calc} isPending={true} />)}</div>
        }
      </div>

      {/* 승인된 계산기 */}
      {approved.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">공개된 계산기 ({approved.length}개)</h3>
          <div className="space-y-3">{approved.map(calc => <CalcCard key={calc.id} calc={calc} isPending={false} />)}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 공지 배너 관리
function NoticesSection({ accessToken }: { accessToken: string }) {
  const [notices, setNotices] = useState<Array<{
    type: 'sponsor' | 'feedback'; name: string; amount?: string; content?: string;
  }>>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/notices`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).then(r => r.json()).then(d => {
      if (Array.isArray(d.notices)) setNotices(d.notices);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const addItem = () => { if (notices.length >= 10) return; setNotices(prev => [...prev, { type: 'sponsor', name: '', amount: '', content: '' }]); };
  const updateItem = (idx: number, field: string, value: string) => setNotices(prev => prev.map((n, i) => i === idx ? { ...n, [field]: value } : n));
  const removeItem = (idx: number) => setNotices(prev => prev.filter((_, i) => i !== idx));
  const moveItem = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= notices.length) return;
    setNotices(prev => { const a = [...prev]; [a[idx], a[next]] = [a[next], a[idx]]; return a; });
  };
  const save = async () => {
    setSaving(true);
    const clean = notices.filter(n => n.name.trim()).map(n => ({
      type: n.type, name: n.name.trim(),
      ...(n.amount?.trim() ? { amount: n.amount.trim() } : {}),
      ...(n.content?.trim() ? { content: n.content.trim() } : {}),
    }));
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/notices`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ notices: clean }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) toast.success(d.count + '개 저장 완료'); else toast.error(d.error || '저장 실패');
  };

  if (!loaded) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">공지 배너 관리</h3>
          <p className="text-sm text-gray-500 mt-0.5">사이트 상단에 순서대로 표시 (최대 10개, 3.5초마다 전환)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={addItem} disabled={notices.length >= 10} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"><Plus className="w-4 h-4" /> 추가</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 저장</button>
        </div>
      </div>
      {notices.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg"><Star className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-400 text-sm">추가 버튼을 눌러 항목을 등록하세요</p></div>
      ) : (
        <div className="space-y-3">
          {notices.map((item, idx) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4">{idx + 1}</span>
                <div className="flex rounded-lg overflow-hidden border border-gray-200">
                  {(['sponsor', 'feedback'] as const).map(t => (
                    <button key={t} onClick={() => updateItem(idx, 'type', t)} className={`text-xs px-2.5 py-1 transition-colors ${item.type === t ? 'bg-amber-500 text-white font-semibold' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>{t === 'sponsor' ? '💛 후원' : '💬 피드백'}</button>
                  ))}
                </div>
                <div className="flex-1" />
                <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs px-1">▲</button>
                <button onClick={() => moveItem(idx, 1)} disabled={idx === notices.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs px-1">▼</button>
                <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><label className="text-xs text-gray-500 mb-1 block">이름 *</label><input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="홍길동" className="w-full h-8 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" /></div>
                {item.type === 'sponsor' && (<div><label className="text-xs text-gray-500 mb-1 block">금액</label><input value={item.amount || ''} onChange={e => updateItem(idx, 'amount', e.target.value)} placeholder="5,000원" className="w-full h-8 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" /></div>)}
                <div className={item.type === 'sponsor' ? '' : 'sm:col-span-2'}><label className="text-xs text-gray-500 mb-1 block">{item.type === 'sponsor' ? '메시지' : '피드백 내용'}</label><input value={item.content || ''} onChange={e => updateItem(idx, 'content', e.target.value)} placeholder={item.type === 'sponsor' ? '응원 메시지...' : '피드백 내용...'} className="w-full h-8 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" /></div>
              </div>
              {item.name.trim() && (
                <div className="flex items-center gap-2 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs">
                  <span>{item.type === 'sponsor' ? '💛' : '💬'}</span>
                  <span className="font-semibold text-amber-900">{item.name}</span>
                  {item.amount && <span className="font-black text-amber-700">{item.amount}</span>}
                  {item.content && <><span className="text-amber-400">·</span><span className="text-amber-800">{item.content}</span></>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 가능 인원 일괄 업데이트 섹션
function PlayerMigrationSection({ accessToken }: { accessToken: string }) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  const runBatch = async (dryRun: boolean, offset: number, accStats: any, accPreview: any[]): Promise<void> => {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/migrate-player-counts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ dryRun, offset, limit: 50 }),
      }
    );
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 300) }; }
    if (data.error) throw new Error(data.error);

    // 누적
    accStats.checked = (accStats.checked || 0) + (data.stats?.checked || 0);
    accStats.updated = (accStats.updated || 0) + (data.stats?.updated || 0);
    accStats.skipped = (accStats.skipped || 0) + (data.stats?.skipped || 0);
    accStats.failed  = (accStats.failed  || 0) + (data.stats?.failed  || 0);
    accStats.total   = data.stats?.total || accStats.total;
    accPreview.push(...(data.preview || []));

    setProgress(`처리 중... ${offset + 50}/${accStats.total}개`);

    if (data.hasMore) {
      await runBatch(dryRun, data.nextOffset, accStats, accPreview);
    }
  };

  const run = async (dryRun: boolean) => {
    if (!dryRun && !confirm('모든 회원의 게임 인원 정보를 가능 인원으로 업데이트합니다.\n\n진행하시겠습니까?')) return;
    setLoading(true);
    setResult(null);
    setProgress('시작 중...');
    try {
      const accStats: any = {};
      const accPreview: any[] = [];
      await runBatch(dryRun, 0, accStats, accPreview);
      setResult({
        dryRun,
        message: dryRun
          ? `[미리보기] ${accStats.updated}개 게임이 변경될 예정입니다`
          : `${accStats.updated}개 게임을 업데이트했습니다`,
        stats: accStats,
        preview: accPreview.slice(0, 30),
      });
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">가능 인원 일괄 업데이트</h2>
        <p className="text-sm text-gray-500 mb-4">
          기존에 "최적 인원"으로 저장된 게임들을 BGG 기준 "가능 인원(min~max)"으로 업데이트해요.<br />
          bggId가 없는 게임은 건드리지 않으며, BGG 캐시가 있는 게임은 API 호출 없이 즉시 처리해요.
        </p>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => run(true)}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? '분석 중...' : '🔍 미리보기 (저장 안 함)'}
          </button>
          <button
            onClick={() => run(false)}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? '업데이트 중...' : '✅ 실제 적용'}
          </button>
          <button
            onClick={async () => {
              const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/debug-games`,
                { headers: { Authorization: `Bearer ${accessToken}` } });
              const data = await res.json();
              alert(JSON.stringify(data, null, 2));
            }}
            className="px-4 py-2 rounded-lg border border-blue-300 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            🔎 KV 현황 확인
          </button>
          {loading && progress && (
            <span className="text-sm text-gray-500 ml-2">{progress}</span>
          )}
        </div>
      </div>

      {result && (
        <div className={`rounded-xl border p-4 sm:p-6 ${result.error ? 'border-red-200 bg-red-50' : result.dryRun ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'}`}>
          {result.error ? (
            <p className="text-red-700 font-medium">❌ 오류: {result.error}</p>
          ) : (
            <>
              <p className={`font-bold mb-3 ${result.dryRun ? 'text-blue-800' : 'text-green-800'}`}>
                {result.dryRun ? '📋 미리보기 결과' : '✅ 업데이트 완료'}
              </p>
              <p className="text-sm mb-4">{result.message}</p>
              {result.stats && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                  {[
                    { label: '처리한 유저', value: result.stats.usersProcessed },
                    { label: '확인한 게임', value: result.stats.gamesChecked },
                    { label: '변경 대상', value: result.stats.gamesUpdated, highlight: true },
                    { label: 'bggId 없음', value: result.stats.gamesSkipped },
                    { label: 'API 실패', value: result.stats.gamesFailed },
                  ].map(({ label, value, highlight }) => (
                    <div key={label} className={`rounded-lg p-3 text-center ${highlight ? 'bg-yellow-100' : 'bg-white'}`}>
                      <p className="text-xl font-bold text-gray-900">{value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              {result.preview?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">변경 예시 (최대 30개)</p>
                  <div className="rounded-lg overflow-hidden border border-gray-200 bg-white overflow-x-auto">
                    <table className="w-full text-xs min-w-[280px]">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-600">게임</th>
                          <th className="px-3 py-2 text-left text-gray-600">기존</th>
                          <th className="px-3 py-2 text-left text-gray-600">변경 후</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {result.preview.map((p: any, i: number) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-medium text-gray-800">{p.game}</td>
                            <td className="px-3 py-2 text-gray-400 line-through">{p.before}</td>
                            <td className="px-3 py-2 text-green-700 font-medium">{p.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 추천 게임 관리 섹션 =====
function RecommendedGamesAdminSection({ accessToken }: { accessToken: string }) {
  const [games, setGames] = useState<Array<{
    bggId: string; name: string; imageUrl: string; purchaseUrl?: string;
  }>>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [bggSearch, setBggSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; yearPublished?: string }>>([]);

  useEffect(() => {
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/recommended-games`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).then(r => r.json()).then(d => {
      if (Array.isArray(d.games)) setGames(d.games);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const searchBgg = async () => {
    if (!bggSearch.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ query: bggSearch }),
      });
      const d = await res.json();
      setSearchResults(Array.isArray(d) ? d.slice(0, 8) : []);
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const addFromBgg = async (result: { id: string; name: string }) => {
    if (games.some(g => g.bggId === result.id)) return;
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ id: result.id }),
      });
      const d = res.ok ? await res.json() : {};
      setGames(prev => [...prev, { bggId: result.id, name: result.name, imageUrl: d.imageUrl || "", purchaseUrl: "" }]);
      setSearchResults([]);
      setBggSearch("");
    } catch {}
  };

  const updateGame = (idx: number, field: string, value: string) =>
    setGames(prev => prev.map((g, i) => i === idx ? { ...g, [field]: value } : g));
  const removeGame = (idx: number) => setGames(prev => prev.filter((_, i) => i !== idx));
  const moveGame = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= games.length) return;
    setGames(prev => { const a = [...prev]; [a[idx], a[next]] = [a[next], a[idx]]; return a; });
  };

  const save = async () => {
    setSaving(true);
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/recommended-games`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ games }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) toast.success(d.count + "개 저장 완료"); else toast.error(d.error || "저장 실패");
  };

  if (!loaded) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">추천 게임 관리</h3>
          <p className="text-sm text-gray-500 mt-0.5">구매예정 탭 상단 이런 게임 어때요? 섹션 (최대 20개)</p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 저장
        </button>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">BGG에서 게임 검색</label>
        <div className="flex gap-2">
          <input value={bggSearch} onChange={e => setBggSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && searchBgg()}
            placeholder="게임 이름 검색..." className="flex-1 h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
          <button onClick={searchBgg} disabled={searching}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "검색"}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto bg-white shadow-sm">
            {searchResults.map(r => (
              <button key={r.id} onClick={() => addFromBgg(r)}
                disabled={games.some(g => g.bggId === r.id)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed">
                <span className="font-medium">{r.name}{r.yearPublished && <span className="text-gray-400 ml-1">({r.yearPublished})</span>}</span>
                <span className="text-xs text-amber-600">{games.some(g => g.bggId === r.id) ? "추가됨" : "+ 추가"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {games.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
          <Gamepad2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">위에서 게임을 검색해 추가하세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-500 font-medium">{games.length}개 등록됨</p>
          {games.map((game, idx) => (
            <div key={idx} className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 bg-gray-50">
              {game.imageUrl && <img src={game.imageUrl} alt={game.name} className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />}
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-sm font-semibold text-gray-900 truncate">{game.name}</p>
                <input value={game.purchaseUrl || ""} onChange={e => updateGame(idx, "purchaseUrl", e.target.value)}
                  placeholder="구매 링크 (선택, https://...)" className="w-full h-7 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white" />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => moveGame(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs px-1">▲</button>
                <button onClick={() => moveGame(idx, 1)} disabled={idx === games.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs px-1">▼</button>
                <button onClick={() => removeGame(idx)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ─── 숙제 관리 섹션 ───
function HomeworkSection({ accessToken }: { accessToken: string }) {
  const [cats, setCats] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(false);
  const [tab, setTab] = useState<'categories' | 'submissions' | 'closed'>('categories');
  const [currentWinner, setCurrentWinner] = useState<any>(null);
  const [selectingWinner, setSelectingWinner] = useState<any>(null);
  const [closedWinners, setClosedWinners] = useState<any[]>([]);
  const [closingWinner, setClosingWinner] = useState(false);
  // 카테고리 폼
  const [showForm, setShowForm] = useState(false);
  const [editCat, setEditCat] = useState<any>(null);
  const [form, setForm] = useState({ name: '', guideline: '', pointReward: 0, prizeReward: '', startDate: '', endDate: '' });
  const [saving, setSaving] = useState(false);
  // 포인트 지급
  const [rewardModal, setRewardModal] = useState<{ post: any } | null>(null);
  const [rewardPt, setRewardPt] = useState('');
  const [rewarding, setRewarding] = useState(false);

  const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };

  const loadCats = async () => {
    const res = await fetch(`${BASE}/homework/categories`, { headers });
    if (res.ok) { const d = await res.json(); setCats(d.categories || []); }
  };
  const loadSubs = async () => {
    setSubLoading(true);
    const res = await fetch(`${BASE}/homework/submissions`, { headers });
    if (res.ok) { const d = await res.json(); setSubmissions(d.submissions || []); }
    setSubLoading(false);
    const wr = await fetch(`${BASE}/homework/winner`, { headers });
    if (wr.ok) { const d = await wr.json(); setCurrentWinner(d.winner || null); }
  };
  const loadClosed = async () => {
    const res = await fetch(`${BASE}/homework/closed-winners`, { headers });
    if (res.ok) { const d = await res.json(); setClosedWinners(d.closedWinners || []); }
  };
  const closeWinner = async () => {
    if (!window.confirm('숙제를 마감하면 당첨 배너가 내려가요. 마감하시겠어요?')) return;
    setClosingWinner(true);
    try {
      const res = await fetch(`${BASE}/homework/winner/close`, { method: 'POST', headers });
      if (!res.ok) throw new Error('마감 실패');
      toast.success('숙제가 마감됐어요');
      setCurrentWinner(null);
    } catch (e: any) { toast.error(e.message || '마감 실패'); }
    setClosingWinner(false);
  };

  useEffect(() => { (async () => { await loadCats(); setLoading(false); })(); }, []);
  useEffect(() => {
    if (tab === 'submissions') loadSubs();
    if (tab === 'closed') loadClosed();
  }, [tab]);

  const openCreate = () => { setEditCat(null); setForm({ name: '', guideline: '', pointReward: 0, prizeReward: '', startDate: '', endDate: '' }); setShowForm(true); };
  const openEdit = (cat: any) => { setEditCat(cat); setForm({ name: cat.name, guideline: cat.guideline || '', pointReward: cat.pointReward || 0, prizeReward: cat.prizeReward || '', startDate: cat.startDate || '', endDate: cat.endDate || '' }); setShowForm(true); };

  const saveCat = async () => {
    if (!form.name.trim()) { toast.error('이름을 입력해주세요'); return; }
    setSaving(true);
    try {
      if (editCat) {
        await fetch(`${BASE}/homework/categories/${editCat.id}`, { method: 'PATCH', headers, body: JSON.stringify(form) });
        toast.success('수정됐어요');
      } else {
        await fetch(`${BASE}/homework/categories`, { method: 'POST', headers, body: JSON.stringify(form) });
        toast.success('숙제 카테고리가 추가됐어요');
      }
      await loadCats(); setShowForm(false);
    } catch { toast.error('저장 실패'); }
    setSaving(false);
  };

  const deleteCat = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch(`${BASE}/homework/categories/${id}`, { method: 'DELETE', headers });
    toast.success('삭제됐어요'); await loadCats();
  };

  const toggleActive = async (cat: any) => {
    await fetch(`${BASE}/homework/categories/${cat.id}`, { method: 'PATCH', headers, body: JSON.stringify({ active: !cat.active }) });
    await loadCats();
  };

  const grantReward = async () => {
    if (!rewardModal || !rewardPt || parseInt(rewardPt) <= 0) { toast.error('포인트를 입력해주세요'); return; }
    setRewarding(true);
    try {
      const res = await fetch(`${BASE}/homework/submissions/${rewardModal.post.id}/reward`, {
        method: 'POST', headers, body: JSON.stringify({ points: parseInt(rewardPt) })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success(`+${rewardPt}pt 지급 완료!`);
      setRewardModal(null); setRewardPt('');
      await loadSubs();
    } catch (e: any) { toast.error(e.message || '지급 실패'); }
    setRewarding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">📚 숙제 관리</h2>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 flex-wrap">
        {(['categories', 'submissions', 'closed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t === 'categories' ? '숙제 카테고리' : t === 'submissions' ? '제출 검사' : '마감 목록'}
          </button>
        ))}
      </div>

      {tab === 'categories' && (
        <div className="space-y-4">
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" /> 숙제 카테고리 추가
          </button>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
          ) : cats.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">숙제 카테고리가 없어요</div>
          ) : (
            <div className="space-y-3">
              {cats.map(cat => (
                <div key={cat.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{cat.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {cat.active ? '활성' : '비활성'}
                        </span>
                      </div>
                      {cat.guideline && <p className="text-xs text-gray-500 mt-1 leading-relaxed whitespace-pre-wrap">{cat.guideline}</p>}
                      {(cat.startDate || cat.endDate) && (
                        <p className="text-xs text-blue-500 font-medium mt-1">📅 {cat.startDate || '?'} ~ {cat.endDate || '?'}</p>
                      )}
                      {cat.pointReward > 0 && <p className="text-xs text-orange-600 font-semibold mt-1">🎯 포인트 보상: {cat.pointReward}pt</p>}
                      {cat.prizeReward && <p className="text-xs text-purple-600 font-semibold mt-1">🎁 상품: {cat.prizeReward}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => toggleActive(cat)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" title={cat.active ? '비활성화' : '활성화'}>
                        {cat.active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEdit(cat)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><Save className="w-4 h-4" /></button>
                      <button onClick={() => deleteCat(cat.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'submissions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">숙제 카테고리에 제출된 게시물 목록이에요</p>
            <button onClick={loadSubs} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><RefreshCw className="w-4 h-4" /></button>
          </div>
          {currentWinner && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-yellow-700 font-semibold mb-0.5">🏆 현재 당첨 배너 활성</p>
                <p className="text-sm font-bold text-gray-900">{currentWinner.userName} · {currentWinner.category}</p>
                {currentWinner.emailClaimed && <p className="text-xs text-green-600 mt-0.5">📬 이메일 접수 완료: {currentWinner.email}</p>}
              </div>
              <button
                onClick={closeWinner}
                disabled={closingWinner}
                className="flex-shrink-0 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-xs font-bold transition-colors">
                {closingWinner ? '마감 중...' : '숙제 마감'}
              </button>
            </div>
          )}
          {subLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">제출된 숙제가 없어요</div>
          ) : (
            <div className="space-y-3">
              {submissions.map(sub => (
                <div key={sub.id} className={`bg-white rounded-xl border p-4 space-y-2 ${sub.rewardGranted ? 'border-green-200' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">📚 {sub.category}</span>
                        {sub.rewardGranted && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✅ +{sub.rewardAmount}pt 지급완료</span>}
                      </div>
                      <p className="font-semibold text-gray-900 text-sm">{sub.userName}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{sub.content}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(sub.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {!sub.rewardGranted && (
                        <button
                          onClick={() => { setRewardModal({ post: sub }); setRewardPt(String(sub.homeworkCategory?.pointReward || '')); }}
                          className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-colors">
                          포인트 지급
                        </button>
                      )}
                      <button
                        onClick={() => setSelectingWinner(sub)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${currentWinner?.postId === sub.id ? 'bg-yellow-400 text-yellow-900' : 'bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200'}`}>
                        {currentWinner?.postId === sub.id ? '🏆 당첨자' : '당첨 선정'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'closed' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">마감된 숙제 당첨 목록이에요</p>
            <button onClick={loadClosed} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><RefreshCw className="w-4 h-4" /></button>
          </div>
          {closedWinners.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">마감된 숙제가 없어요</div>
          ) : (
            <div className="space-y-3">
              {closedWinners.map((w, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">📚 {w.category}</span>
                    {w.emailClaimed && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">📬 이메일 접수</span>}
                  </div>
                  <p className="font-bold text-gray-900 text-sm">🏆 {w.userName}</p>
                  {w.prizeReward && <p className="text-xs text-purple-600 font-medium">🎁 {w.prizeReward}</p>}
                  {w.emailClaimed && w.email && <p className="text-xs text-gray-600 font-medium">✉️ {w.email}</p>}
                  <p className="text-xs text-gray-400">{new Date(w.closedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 당첨자 선정 확인 모달 */}
      {selectingWinner && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="font-bold text-gray-900">🏆 당첨자 선정</h3>
            <p className="text-sm text-gray-600">
              <span className="font-bold text-gray-900">{selectingWinner.userName}</span>님을 숙제 당첨자로 선정하시겠어요?<br />
              <span className="text-xs text-gray-400 mt-1 block">기존 당첨자가 있으면 교체됩니다.</span>
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setSelectingWinner(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button onClick={async () => {
                try {
                  const res = await fetch(`${BASE}/homework/submissions/${selectingWinner.id}/select-winner`, { method: 'POST', headers });
                  if (!res.ok) {
                    const text = await res.text();
                    let msg = '선정 실패';
                    try { msg = JSON.parse(text).error || msg; } catch {}
                    throw new Error(msg);
                  }
                  toast.success('당첨자가 선정됐어요 🎉');
                  setSelectingWinner(null);
                  await loadSubs();
                } catch (e: any) { toast.error(e.message || '선정 실패'); }
              }} className="flex-1 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-yellow-900 text-sm font-bold transition-colors">
                선정하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 카테고리 폼 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{editCat ? '숙제 카테고리 수정' : '숙제 카테고리 추가'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">카테고리 이름 *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="예) 5월 숙제, 이번주 미션"
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">가이드라인</label>
                <textarea value={form.guideline} onChange={e => setForm(f => ({ ...f, guideline: e.target.value }))}
                  placeholder="회원들에게 보여줄 숙제 안내 내용을 작성하세요..."
                  rows={5}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">기본 포인트 보상 (선택)</label>
                <input type="number" value={form.pointReward} onChange={e => setForm(f => ({ ...f, pointReward: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">🎁 상품 보상 (선택)</label>
                <input value={form.prizeReward} onChange={e => setForm(f => ({ ...f, prizeReward: e.target.value }))}
                  placeholder="예) 스타벅스 아메리카노, 보드게임 할인쿠폰"
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
                <p className="text-xs text-gray-400 mt-1">포인트와 상품 모두 설정하거나 하나만 설정할 수 있어요</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">📅 기간 (선택)</label>
                <div className="flex items-center gap-2">
                  <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="flex-1 h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  <span className="text-xs text-gray-400 flex-shrink-0">~</span>
                  <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="flex-1 h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={saveCat} disabled={saving}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (editCat ? '수정' : '추가')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 포인트 지급 모달 */}
      {rewardModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">포인트 지급</h3>
              <button onClick={() => setRewardModal(null)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm font-semibold text-gray-900">{rewardModal.post.userName}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{rewardModal.post.content}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">지급할 포인트</label>
              <input type="number" value={rewardPt} onChange={e => setRewardPt(e.target.value)}
                placeholder="포인트 입력"
                className="w-full h-11 px-4 rounded-xl border-2 border-gray-200 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRewardModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={grantReward} disabled={rewarding}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
                {rewarding ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '지급하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 활동 카드 지급 로그 섹션 ─────────────────────────────────────────────────

function ActivityCardLogSection({ accessToken }: { accessToken: string }) {
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'post' | 'comment'>('all');

  // ── 확률 설정 상태 ──
  const [probPost,    setProbPost]    = useState<number>(5);    // % 단위
  const [probComment, setProbComment] = useState<number>(1);    // % 단위
  const [probLoading, setProbLoading] = useState(false);
  const [probSaving,  setProbSaving]  = useState(false);
  const [probDirty,   setProbDirty]   = useState(false);
  // 저장된 원본 (비교용 - 되돌리기 버튼용)
  const [savedPost,    setSavedPost]    = useState<number>(5);
  const [savedComment, setSavedComment] = useState<number>(1);

  const loadProb = async () => {
    setProbLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/activity-card-prob`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const d = await res.json();
        const p = Math.round((d.post    ?? 0.05) * 1000) / 10; // 소수 → % (소수점 1자리)
        const co = Math.round((d.comment ?? 0.01) * 1000) / 10;
        setProbPost(p); setSavedPost(p);
        setProbComment(co); setSavedComment(co);
        setProbDirty(false);
      }
    } catch { toast.error('확률 불러오기 실패'); }
    setProbLoading(false);
  };

  const saveProb = async () => {
    const postVal    = parseFloat(probPost.toString());
    const commentVal = parseFloat(probComment.toString());
    if (isNaN(postVal) || isNaN(commentVal) || postVal < 0 || postVal > 100 || commentVal < 0 || commentVal > 100) {
      toast.error('0~100 사이 값을 입력해주세요'); return;
    }
    setProbSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/activity-card-prob`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ post: postVal / 100, comment: commentVal / 100 }),
        }
      );
      if (res.ok) {
        setSavedPost(postVal); setSavedComment(commentVal);
        setProbDirty(false);
        toast.success('확률이 저장됐어요!');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || '저장 실패');
      }
    } catch { toast.error('저장 중 오류 발생'); }
    setProbSaving(false);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/activity-card-grant-log`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (data.log) setLog(data.log);
    } catch {
      toast.error('로그 불러오기 실패');
    }
    setLoading(false);
  };

  useEffect(() => { load(); loadProb(); }, []);

  const filtered = filter === 'all' ? log : log.filter(e => e.type === filter);

  const byUser: Record<string, { userName: string; email: string; post: number; comment: number; total: number }> = {};
  log.forEach(e => {
    const key = e.email || e.userId;
    if (!byUser[key]) byUser[key] = { userName: e.userName || '', email: e.email || '', post: 0, comment: 0, total: 0 };
    if (e.type === 'post') byUser[key].post++;
    else if (e.type === 'comment') byUser[key].comment++;
    byUser[key].total++;
  });
  const userSummary = Object.values(byUser).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">🃏 활동 카드 지급 로그</h2>
          <p className="text-sm text-gray-400 mt-0.5">글·댓글 작성 시 랜덤 지급되는 보너스카드 내역 및 확률 설정</p>
        </div>
        <button
          onClick={() => { load(); loadProb(); }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* ── 확률 설정 카드 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-700">🎲 카드 지급 확률 설정</h3>
            <p className="text-xs text-gray-400 mt-0.5">이벤트 진행 중 글·댓글 작성 시 카드가 지급될 확률 (0~100%)</p>
          </div>
          {probLoading && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
        </div>

        <div className="px-5 py-5">
          <div className="grid grid-cols-2 gap-4 mb-5">
            {/* 글 확률 */}
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-sm">✍️</span>
                <div>
                  <p className="text-xs font-bold text-blue-700">게시글 작성 시</p>
                  <p className="text-[11px] text-blue-400">현재 저장값: {savedPost}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={probPost}
                  onChange={e => { setProbPost(parseFloat(e.target.value) || 0); setProbDirty(true); }}
                  className="w-full px-3 py-2 text-sm font-bold text-blue-700 bg-white border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-400 text-center"
                />
                <span className="text-sm font-bold text-blue-500 shrink-0">%</span>
              </div>
              {/* 프리셋 버튼 */}
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {[1, 3, 5, 10, 20].map(v => (
                  <button
                    key={v}
                    onClick={() => { setProbPost(v); setProbDirty(true); }}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${
                      probPost === v ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-500 hover:bg-blue-200'
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>

            {/* 댓글 확률 */}
            <div className="bg-emerald-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-sm">💬</span>
                <div>
                  <p className="text-xs font-bold text-emerald-700">댓글 작성 시</p>
                  <p className="text-[11px] text-emerald-400">현재 저장값: {savedComment}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={probComment}
                  onChange={e => { setProbComment(parseFloat(e.target.value) || 0); setProbDirty(true); }}
                  className="w-full px-3 py-2 text-sm font-bold text-emerald-700 bg-white border-2 border-emerald-200 rounded-lg focus:outline-none focus:border-emerald-400 text-center"
                />
                <span className="text-sm font-bold text-emerald-500 shrink-0">%</span>
              </div>
              {/* 프리셋 버튼 */}
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {[0.5, 1, 2, 5, 10].map(v => (
                  <button
                    key={v}
                    onClick={() => { setProbComment(v); setProbDirty(true); }}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${
                      probComment === v ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-500 hover:bg-emerald-200'
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 저장 버튼 */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              💡 저장 즉시 반영 · 이벤트 진행 중에도 변경 가능
            </p>
            <div className="flex items-center gap-2">
              {probDirty && (
                <button
                  onClick={() => { setProbPost(savedPost); setProbComment(savedComment); setProbDirty(false); }}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
                >
                  되돌리기
                </button>
              )}
              <button
                onClick={saveProb}
                disabled={probSaving || !probDirty}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all ${
                  probDirty
                    ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-sm'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {probSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {probSaving ? '저장 중...' : '확률 저장'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : log.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🃏</div>
          <p className="text-sm">아직 활동 카드 지급 내역이 없어요</p>
          <p className="text-xs text-gray-300 mt-1">이벤트 진행 중 글·댓글 작성 시 기록됩니다</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-bold text-gray-700">유저별 획득 현황</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {userSummary.map((u, i) => (
                <div key={u.email} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-cyan-50 text-cyan-600 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <div>
                      <span className="text-sm font-semibold text-gray-800">{u.userName || u.email.split('@')[0]}</span>
                      <span className="text-xs text-gray-400 ml-1.5">{u.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold">글 {u.post}회</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-semibold">댓글 {u.comment}회</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-cyan-500 text-white font-bold">총 {u.total}장</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">상세 지급 내역 ({filtered.length}건)</h3>
              <div className="flex gap-1.5">
                {(['all', 'post', 'comment'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      filter === f ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {f === 'all' ? '전체' : f === 'post' ? '글' : '댓글'}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-50">
              {filtered.map((entry, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-16 text-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      entry.type === 'post' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {entry.type === 'post' ? '✍️ 글' : '💬 댓글'}
                    </span>
                    <div>
                      <span className="text-sm font-semibold text-gray-800">{entry.userName || entry.email?.split('@')[0]}</span>
                      <span className="text-xs text-gray-400 ml-1.5">{entry.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-gray-400 font-mono">
                      {entry.cardsBefore}→<span className="text-cyan-600 font-bold">{entry.cardsAfter}</span>장
                    </span>
                    <span className="text-[11px] text-gray-300">
                      {new Date(entry.grantedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 단체 메일 발송 섹션 ──────────────────────────────────────────────────────
function BulkMailSection({ accessToken }: { accessToken: string }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isAd, setIsAd] = useState(true);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [result, setResult] = useState<{ success: number; fail: number; total?: number; remaining?: number; quotaExceeded?: boolean; nextOffset?: number; sentTo?: string[] } | null>(null);
  const [sampleEmails, setSampleEmails] = useState('');
  const [sendingSample, setSendingSample] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{ url: string; name: string }[]>([]);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [sendLimit, setSendLimit] = useState(99999);
  const [nextOffset, setNextOffset] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [planLimit, setPlanLimit] = useState(50000);
  const [sentThisMonth, setSentThisMonth] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<string[] | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);
  const [streamProgress, setStreamProgress] = useState<{
    items: { email: string; ok: boolean }[];
    success: number; fail: number; total: number; sent: number; done: boolean; quotaExceeded?: boolean; remaining?: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [unsubList, setUnsubList] = useState<string[]>([]);
  const [unsubInput, setUnsubInput] = useState('');
  const [unsubLoading, setUnsubLoading] = useState(false);

  const loadUnsub = () => {
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/bulk-mail/unsubscribe`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(r => r.json()).then(d => { if (d.emails) setUnsubList(d.emails); }).catch(() => {});
  };

  const addUnsub = async () => {
    const email = unsubInput.trim().toLowerCase();
    if (!email.includes('@')) { toast.error('유효한 이메일을 입력해주세요'); return; }
    setUnsubLoading(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/bulk-mail/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setUnsubList(d.emails);
      setUnsubInput('');
      toast.success('수신거부 등록 완료');
    } catch (e: any) { toast.error(e.message); } finally { setUnsubLoading(false); }
  };

  const removeUnsub = async (email: string) => {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/bulk-mail/unsubscribe`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setUnsubList(d.emails);
      toast.success('수신거부 해제 완료');
    } catch (e: any) { toast.error(e.message); }
  };

  // 회원 수 + 이번 달 발송량 + 수신거부 목록 조회
  useEffect(() => {
    loadUnsub();
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/bulk-mail/count`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then(d => { if (d.count !== undefined) setMemberCount(d.count); })
      .catch(() => {});

    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/bulk-mail/usage`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then(d => { if (d.sentThisMonth !== undefined) setSentThisMonth(d.sentThisMonth); })
      .catch(() => {});
  }, [accessToken]);

  // 이미지 업로드
  const handleImageUpload = async (file: File) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) { toast.error('JPG, PNG, WebP, GIF만 업로드 가능해요'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('5MB 이하 이미지만 가능해요'); return; }
    setUploadingImg(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/image/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || '업로드 실패');
      setUploadedImages(prev => [...prev, { url: data.url, name: file.name }]);
      toast.success('이미지 업로드 완료!');
    } catch (e: any) {
      toast.error(e.message || '이미지 업로드 실패');
    } finally {
      setUploadingImg(false);
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  };

  // 이미지 태그를 textarea 커서 위치에 삽입
  const insertImageTag = (url: string) => {
    const tag = `<img src="${url}" style="max-width:100%;border-radius:8px;margin:8px 0;" alt="이미지" />`;
    const el = textareaRef.current;
    if (!el) { setBody(prev => prev + '\n' + tag); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const newBody = body.slice(0, start) + tag + body.slice(end);
    setBody(newBody);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); }, 0);
    toast.success('본문에 이미지를 삽입했어요!');
  };

  const handleSampleSend = async () => {
    if (!subject.trim()) { toast.error('제목을 입력해주세요'); return; }
    if (!body.trim()) { toast.error('내용을 입력해주세요'); return; }
    const emailList = sampleEmails.split(/[\n,，]/).map(e => e.trim()).filter(e => e.includes('@')).slice(0, 10);
    if (emailList.length === 0) { toast.error('유효한 이메일 주소를 입력해주세요'); return; }
    setSendingSample(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/bulk-mail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ subject, body, isAd, sampleOnly: true, sampleEmails: emailList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '샘플 발송 실패');
      setResult(data);
      toast.success(`샘플 메일을 ${emailList.length}명에게 발송했어요!`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingSample(false);
    }
  };

  const handleStreamSend = async (offset = 0) => {
    if (!subject.trim()) { toast.error('제목을 입력해주세요'); return; }
    if (!body.trim()) { toast.error('내용을 입력해주세요'); return; }
    if (!confirm(`전체 회원에게 메일을 발송할까요?\n제목: ${isAd ? '(광고) ' : ''}${subject}`)) return;
    setSending(true);
    setShowRecipients(false);
    setStreamProgress({ items: [], success: 0, fail: 0, total: 0, sent: 0, done: false });
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/bulk-mail/stream`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ subject, body, isAd, offset }) }
      );
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || '발송 실패'); }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(part.slice(6));
            if (d.type === 'progress') {
              setStreamProgress(prev => prev ? {
                ...prev, success: d.success, fail: d.fail, sent: d.sent, total: d.total,
                items: [...prev.items.slice(-49), { email: d.email, ok: d.ok }],
              } : prev);
            } else if (d.type === 'done') {
              setStreamProgress(prev => prev ? { ...prev, ...d, done: true } : prev);
              setSentThisMonth(p => (p ?? 0) + d.success);
              setNextOffset(d.remaining > 0 ? offset + d.success + d.fail : 0);
              setRemaining(d.remaining > 0 ? d.remaining : null);
              if (d.quotaExceeded) toast.error(`⚠️ 한도 초과! ${d.success}건 발송 후 중단됐어요.`);
              else toast.success(`발송 완료! 성공 ${d.success}건 / 실패 ${d.fail}건`);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      toast.error(e.message);
      setStreamProgress(null);
    } finally {
      setSending(false);
    }
  };

  const handleLoadRecipients = async () => {
    setLoadingRecipients(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/bulk-mail/recipients`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setRecipients(data.emails || []);
      setShowRecipients(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingRecipients(false);
    }
  };

  const handleSend = async (offsetOverride?: number) => {
    if (!subject.trim()) { toast.error('제목을 입력해주세요'); return; }
    if (!body.trim()) { toast.error('내용을 입력해주세요'); return; }
    const currentOffset = offsetOverride ?? nextOffset;
    const isFirstSend = currentOffset === 0;
    if (isFirstSend && !confirm(`전체 회원에게 메일을 발송할까요?\n제목: ${isAd ? '(광고) ' : ''}${subject}`)) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/bulk-mail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ subject, body, isAd, offset: currentOffset, limit: sendLimit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발송 실패');
      setResult({ success: data.success, fail: data.fail, total: data.total, remaining: data.remaining, quotaExceeded: data.quotaExceeded, nextOffset: data.nextOffset });
      setNextOffset(data.nextOffset);
      setRemaining(data.remaining);
      setSentThisMonth(prev => (prev ?? 0) + (data.success || 0));
      if (data.quotaExceeded) {
        toast.error(`⚠️ Resend 일일 한도 초과! 성공 ${data.success}건 발송 후 중단됨. 내일 이어서 발송하세요.`);
      } else {
        toast.success(`발송 완료! 성공 ${data.success}건 / 실패 ${data.fail}건`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📧</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">단체 메일 발송</h2>
            <p className="text-xs text-gray-400">가입된 전체 회원에게 메일을 보냅니다</p>
          </div>
        </div>
        {memberCount !== null && (
          <div className="text-right">
            <p className="text-sm font-bold text-gray-700">수신 대상: {memberCount}명</p>
            {unsubList.length > 0 && <p className="text-xs text-red-400">{unsubList.length}명 수신거부 제외</p>}
          </div>
        )}
      </div>

      {/* 수신거부 관리 */}
      <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-3">
        <p className="text-sm font-bold text-red-700">🚫 수신거부 관리</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={unsubInput}
            onChange={e => setUnsubInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addUnsub()}
            placeholder="수신거부 이메일 입력"
            className="flex-1 text-sm border border-red-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-300 bg-white"
          />
          <button
            onClick={addUnsub}
            disabled={unsubLoading}
            className="px-3 py-2 text-sm font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            추가
          </button>
        </div>
        {unsubList.length === 0 ? (
          <p className="text-xs text-gray-400">수신거부 등록된 이메일이 없어요.</p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {unsubList.map(email => (
              <div key={email} className="flex items-center justify-between bg-white border border-red-100 rounded-lg px-3 py-1.5">
                <span className="text-xs text-gray-700 font-mono truncate">{email}</span>
                <button
                  onClick={() => removeUnsub(email)}
                  className="ml-2 text-xs text-gray-400 hover:text-red-500 flex-shrink-0"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resend 이번 달 발송 현황 */}
      {sentThisMonth !== null && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-700">📊 이번 달 Resend 발송 현황</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">플랜 한도</span>
              <input
                type="number"
                value={planLimit}
                onChange={e => setPlanLimit(Math.max(1, parseInt(e.target.value) || 50000))}
                className="w-24 text-xs border border-gray-300 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-cyan-300"
              />
              <span className="text-xs text-gray-500">통/월</span>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (sentThisMonth / planLimit) * 100)}%`,
                background: sentThisMonth / planLimit > 0.8 ? '#ef4444' : sentThisMonth / planLimit > 0.5 ? '#f59e0b' : '#06b6d4',
              }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">발송: <span className="font-bold text-gray-900">{sentThisMonth.toLocaleString()}통</span></span>
            <span className={`font-bold ${planLimit - sentThisMonth < planLimit * 0.2 ? 'text-red-500' : 'text-cyan-600'}`}>
              남은 한도: {Math.max(0, planLimit - sentThisMonth).toLocaleString()}통
            </span>
          </div>
        </div>
      )}

      {/* 광고 여부 */}
      <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-xl border border-yellow-200">
        <input type="checkbox" id="isAd" checked={isAd} onChange={e => setIsAd(e.target.checked)}
          className="w-4 h-4 accent-yellow-500" />
        <label htmlFor="isAd" className="text-sm font-medium text-yellow-800 cursor-pointer">
          광고성 메일 <span className="text-yellow-600 font-bold">(체크 시 제목 앞에 "(광고)" 자동 표시)</span>
        </label>
      </div>

      {/* 제목 */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700">제목</label>
        <div className="flex items-center gap-2">
          {isAd && <span className="text-xs bg-yellow-100 text-yellow-700 font-bold px-2 py-1 rounded-lg whitespace-nowrap">(광고)</span>}
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="메일 제목 입력"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
          />
        </div>
      </div>

      {/* 이미지 업로드 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">🖼️ 이미지 첨부</label>
          <span className="text-xs text-gray-400">JPG · PNG · WebP · GIF · 최대 5MB</span>
        </div>
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-cyan-400 hover:bg-cyan-50 transition-colors"
          onClick={() => imgInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleImageUpload(file); }}
        >
          {uploadingImg ? (
            <div className="flex items-center justify-center gap-2 text-cyan-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">업로드 중...</span>
            </div>
          ) : (
            <div className="text-gray-400">
              <Camera className="w-6 h-6 mx-auto mb-1 text-gray-300" />
              <p className="text-sm">클릭하거나 이미지를 드래그하세요</p>
            </div>
          )}
          <input ref={imgInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }} />
        </div>

        {uploadedImages.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-medium">「본문에 삽입」을 눌러 커서 위치에 이미지를 추가하세요</p>
            <div className="grid grid-cols-2 gap-2">
              {uploadedImages.map((img, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                  <img src={img.url} alt={img.name} className="w-full h-28 object-cover" />
                  <div className="p-2 space-y-1.5">
                    <p className="text-xs text-gray-500 truncate">{img.name}</p>
                    <div className="flex gap-1.5">
                      <button onClick={() => insertImageTag(img.url)}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-cyan-500 text-white font-bold hover:bg-cyan-600 transition-colors">
                        본문에 삽입
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(img.url); toast.success('URL 복사됨!'); }}
                        className="px-2 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-xs hover:bg-gray-200 transition-colors" title="URL 복사">
                        URL
                      </button>
                      <button onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== idx))}
                        className="px-2 py-1.5 rounded-lg bg-red-50 text-red-400 text-xs hover:bg-red-100 transition-colors" title="목록에서 제거">
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 내용 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">내용 (HTML 사용 가능)</label>
          <button onClick={() => setPreview(!preview)}
            className="text-xs text-cyan-600 underline">{preview ? '편집으로' : '미리보기'}</button>
        </div>
        {preview ? (
          <div className="border border-gray-200 rounded-xl p-4 min-h-[200px] text-sm prose max-w-none"
            dangerouslySetInnerHTML={{ __html: body }} />
        ) : (
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={"메일 내용을 입력하세요.\nHTML 태그 사용 가능합니다.\n예) <b>굵게</b>, <a href='...'>링크</a>\n\n이미지는 위에서 업로드 후 「본문에 삽입」을 눌러주세요."}
            rows={10}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 resize-y font-mono"
          />
        )}
      </div>

      {/* 수신거부 안내 */}
      {isAd && (
        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-600">📋 자동 추가 항목 (메일 하단)</p>
          <p>• 발신: 보드라움 (noreply@boardraum.site)</p>
          <p>• 수신거부: sityplanner2@naver.com으로 문의하시면 즉시 처리됩니다.</p>
        </div>
      )}

      {/* 이메일 확인 + 발송 */}
      <div className="space-y-2">
        <button
          onClick={handleLoadRecipients}
          disabled={loadingRecipients}
          className="w-full py-3 rounded-xl font-bold text-sm border-2 border-cyan-400 text-cyan-700 bg-cyan-50 hover:bg-cyan-100 transition-colors flex items-center justify-center gap-2"
        >
          {loadingRecipients ? <><Loader2 className="w-4 h-4 animate-spin" /> 조회 중...</> : `🔍 수신자 이메일 확인 (${memberCount ?? '?'}명)`}
        </button>
        {nextOffset > 0 && (
          <button onClick={() => { setNextOffset(0); setRemaining(null); setResult(null); }}
            className="w-full text-xs text-gray-400 underline text-center">처음부터 다시 발송</button>
        )}
      </div>

      {/* 실시간 발송 진행 */}
      {streamProgress && (
        <div className="border border-gray-200 rounded-2xl overflow-hidden">
          {/* 헤더 */}
          <div className={`px-4 py-3 flex items-center justify-between ${streamProgress.done ? (streamProgress.quotaExceeded ? 'bg-orange-50' : 'bg-green-50') : 'bg-cyan-50'}`}>
            <div className="flex items-center gap-2">
              {!streamProgress.done
                ? <Loader2 className="w-4 h-4 animate-spin text-cyan-600" />
                : streamProgress.quotaExceeded
                  ? <span className="text-base">⚠️</span>
                  : <span className="text-base">✅</span>
              }
              <span className="text-sm font-bold text-gray-800">
                {!streamProgress.done ? '발송 중...' : streamProgress.quotaExceeded ? '한도 초과로 중단됨' : '발송 완료!'}
              </span>
            </div>
            <span className="text-sm font-bold text-gray-700">
              {streamProgress.sent} / {streamProgress.total || '?'}명
            </span>
          </div>
          {/* 진행 바 */}
          {streamProgress.total > 0 && (
            <div className="h-2 bg-gray-100">
              <div
                className="h-2 transition-all duration-300"
                style={{
                  width: `${Math.min(100, (streamProgress.sent / streamProgress.total) * 100)}%`,
                  background: streamProgress.done && !streamProgress.quotaExceeded ? '#10b981' : '#06b6d4',
                }}
              />
            </div>
          )}
          {/* 통계 */}
          <div className="flex gap-4 px-4 py-2 bg-white text-xs border-b border-gray-100">
            <span className="text-green-600 font-semibold">✅ 성공 {streamProgress.success}건</span>
            {streamProgress.fail > 0 && <span className="text-red-500 font-semibold">❌ 실패 {streamProgress.fail}건</span>}
            {streamProgress.done && streamProgress.remaining != null && streamProgress.remaining > 0 && (
              <span className="text-orange-500 font-semibold ml-auto">미발송 {streamProgress.remaining}명 남음</span>
            )}
          </div>
          {/* 최근 발송 목록 */}
          <div className="max-h-48 overflow-y-auto divide-y divide-gray-50 bg-white">
            {[...streamProgress.items].reverse().map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-1.5">
                <span className="text-xs">{item.ok ? '✅' : '❌'}</span>
                <span className="text-xs text-gray-600 truncate">{item.email}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 결과 */}
      {result && !result.sample && (
        <div className={`rounded-xl p-4 text-sm space-y-2 ${result.quotaExceeded ? 'bg-orange-50 border border-orange-200 text-orange-900' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          <div className="flex items-center gap-2 font-bold">
            {result.quotaExceeded ? '⚠️ 한도 초과로 중단됨' : '✅ 발송 완료'}
          </div>
          <div className="flex gap-4 text-sm">
            <span>성공 <strong>{result.success}건</strong></span>
            <span>실패 <strong>{result.fail}건</strong></span>
            {result.total !== undefined && <span>전체 <strong>{result.total}명</strong></span>}
          </div>
          {result.remaining !== undefined && result.remaining > 0 && (
            <div className="pt-1 border-t border-current border-opacity-20">
              <p className="text-xs font-semibold">아직 {result.remaining}명에게 발송하지 못했어요.</p>
              {result.quotaExceeded
                ? <p className="text-xs mt-0.5">Resend 한도가 초과됐어요. 잠시 후 「수신자 이메일 확인」에서 이어서 발송하세요.</p>
                : <p className="text-xs mt-0.5">「수신자 이메일 확인」에서 이어서 발송하세요.</p>
              }
            </div>
          )}
        </div>
      )}

      {/* 수신자 이메일 확인 모달 */}
      {showRecipients && recipients && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowRecipients(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col"
            style={{ maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">수신자 목록</h3>
                <p className="text-xs text-gray-400 mt-0.5">총 {recipients.length}명에게 발송됩니다</p>
              </div>
              <button onClick={() => setShowRecipients(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {recipients.map((email, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-sm text-gray-700">{email}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 space-y-2">
              {sentThisMonth !== null && planLimit - sentThisMonth < recipients.length && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-800">
                  ⚠️ 이번 달 남은 한도({Math.max(0, planLimit - sentThisMonth).toLocaleString()}통)가 수신자 수({recipients.length}명)보다 적어요.
                  발송 가능한 인원까지만 발송되고 자동 중단됩니다.
                </div>
              )}
              {remaining !== null && remaining > 0 ? (
                <button
                  onClick={() => handleStreamSend(nextOffset)}
                  disabled={sending}
                  className="w-full py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: sending ? '#9ca3af' : 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                >
                  {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> 발송 중...</> : `▶️ 이어서 발송 (${remaining}명 남음)`}
                </button>
              ) : null}
              <button
                onClick={() => handleStreamSend(0)}
                disabled={sending}
                className="w-full py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2"
                style={{ background: sending ? '#9ca3af' : 'linear-gradient(135deg, #00BCD4, #0097A7)' }}
              >
                {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> 발송 중...</> : `📧 전체 발송 (${recipients.length}명)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 샘플 발송 */}
      <div className="border border-dashed border-indigo-200 bg-indigo-50/40 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">🧪 테스트 발송 (최대 10명)</p>
          <span className="text-xs text-indigo-500 font-medium">
            {sampleEmails.split(/[\n,，]/).filter(e => e.trim().includes('@')).length}/10명
          </span>
        </div>
        <textarea
          value={sampleEmails}
          onChange={e => setSampleEmails(e.target.value)}
          placeholder={"이메일 주소를 입력하세요 (줄바꿈 또는 쉼표로 구분)\nexample1@gmail.com\nexample2@naver.com"}
          rows={3}
          className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none bg-white"
          style={{ fontSize: '14px' }}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">실제 회원들에게 보내기 전 내용을 확인해보세요</p>
          <button
            onClick={handleSampleSend}
            disabled={sendingSample}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-1 whitespace-nowrap"
            style={{ background: sendingSample ? '#9ca3af' : '#6366f1' }}
          >
            {sendingSample ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 발송 중...</> : '📨 테스트 발송'}
          </button>
        </div>
        {result?.sample && result.sentTo && (
          <p className="text-xs text-indigo-600 font-medium">✅ {result.sentTo.join(', ')} 에게 발송 완료</p>
        )}
      </div>

    </div>
  );
}
// ─── 사이트 게임 DB 관리 섹션 ────────────────────────────────────────────────
// ─── 사이트 게임 DB 관리 섹션 ────────────────────────────────────────────────
function SiteGamesSection({ accessToken }: { accessToken: string }) {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showDirectOnly, setShowDirectOnly] = useState(false);
  const [editGame, setEditGame] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<{ koreanName: string; englishName: string; imageUrl: string; bggId: string; yearPublished: string }>({ koreanName: '', englishName: '', imageUrl: '', bggId: '', yearPublished: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // 소유자 모달
  const [ownersGame, setOwnersGame] = useState<any | null>(null);
  const [owners, setOwners] = useState<any[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  // 마이그레이션 상태
  const [migrateGame, setMigrateGame] = useState<any | null>(null);
  const [migrateBggQ, setMigrateBggQ] = useState('');
  const [migrateBggResults, setMigrateBggResults] = useState<any[]>([]);
  const [migrateBggLoading, setMigrateBggLoading] = useState(false);
  const [migrateBggTarget, setMigrateBggTarget] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/site-games`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '로드 실패');
      setGames(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const normalize = (s: string) => (s || '').trim().toLowerCase().replace(/[：:].*/g, '').replace(/\s+/g, ' ');

  // 직접등록 = numeric bggId 없는 게임
  const isCustom = (g: any) => !g.bggId || !/^\d+$/.test(String(g.bggId));

  // 중복의심: 직접등록 게임 이름이 BGG 게임 이름과 일치
  const bggGamesByName: Record<string, any> = {};
  for (const g of games) {
    if (!isCustom(g)) {
      const kn = normalize(g.koreanName || g.name || '');
      const en = normalize(g.englishName || '');
      if (kn) bggGamesByName[kn] = g;
      if (en) bggGamesByName[en] = g;
    }
  }
  const getDupSuspect = (g: any): any | null => {
    if (!isCustom(g)) return null;
    const kn = normalize(g.koreanName || g.name || '');
    const en = normalize(g.englishName || '');
    return bggGamesByName[kn] || bggGamesByName[en] || null;
  };

  // 중복 감지 (같은 이름 여러 개)
  const dupMap: Record<string, any[]> = {};
  for (const g of games) {
    const key = normalize(g.koreanName || g.englishName || g.name || '');
    if (!dupMap[key]) dupMap[key] = [];
    dupMap[key].push(g);
  }
  const dupGroups = Object.values(dupMap).filter(arr => arr.length > 1);

  const displayGames = games.filter(g => {
    const nameMatch = !q || normalize(g.koreanName || g.englishName || g.name || '').includes(q.toLowerCase());
    const directMatch = !showDirectOnly || isCustom(g);
    return nameMatch && directMatch;
  });

  const handleDelete = async (g: any) => {
    if (!confirm(`"${g.koreanName || g.name}" 을 삭제할까요?\n보유 회원 목록에서는 삭제되지 않아요.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/site-games/${g.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) { toast.success('삭제 완료'); load(); }
      else toast.error('삭제 실패');
    } catch { toast.error('오류'); }
    setSaving(false);
  };

  const handleSaveEdit = async () => {
    if (!editGame) return;
    setSaving(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/site-games/${editGame.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(editForm),
      });
      if (res.ok) { toast.success('수정 완료'); setEditGame(null); load(); }
      else toast.error('수정 실패');
    } catch { toast.error('오류'); }
    setSaving(false);
  };

  const loadOwners = async (g: any) => {
    setOwnersGame(g);
    setOwners([]);
    setOwnersLoading(true);
    try {
      const params = new URLSearchParams();
      if (g.bggId) params.set('bggId', String(g.bggId));
      if (g.koreanName) params.set('koreanName', g.koreanName);
      if (g.englishName) params.set('englishName', g.englishName);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/site-games/${g.id}/owners?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) { const data = await res.json(); setOwners(data.owners || []); }
    } catch {}
    setOwnersLoading(false);
  };

  const handleMerge = async (from: any, to: any) => {
    if (!from || !to || from.id === to.id) { toast.error('같은 게임이에요'); return; }
    if (!confirm(`"${from.koreanName || from.name}" 을 "${to.koreanName || to.name}" 으로 통합합니다.\n"${from.koreanName || from.name}" 은 삭제되고, 보유 회원과 게시물 태그가 모두 업데이트됩니다.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/site-games/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ fromId: from.id, toId: to.id }),
      });
      if (res.ok) {
        const data = await res.json();
        const suspect = getDupSuspect(to);
        toast.success(`통합 완료${data.updatedPosts ? ` (게시물 ${data.updatedPosts}개 태그 업데이트됨)` : ''}`);
        load();
        // BGG 중복 의심 게임이면 바로 마이그레이션 모달 열기
        if (suspect && isCustom(to)) {
          setTimeout(() => {
            setMigrateGame(to);
            setMigrateBggQ(to.koreanName || to.englishName || to.name || '');
            setMigrateBggTarget(suspect);
            setMigrateBggResults([]);
          }, 300);
        }
      } else toast.error('통합 실패');
    } catch { toast.error('오류'); }
    setSaving(false);
  };

  const handleMigrate = async () => {
    if (!migrateGame || !migrateBggTarget) return;
    const targetBggId = migrateBggTarget.bggId || migrateBggTarget.id;
    if (!targetBggId || !/^\d+$/.test(String(targetBggId))) { toast.error('유효한 BGG 게임을 선택해주세요'); return; }
    if (!confirm(`"${migrateGame.koreanName || migrateGame.name}" 을 BGG 게임 "${migrateBggTarget.name || migrateBggTarget.koreanName}" (ID: ${targetBggId}) 으로 마이그레이션합니다.\n\n보유 회원 데이터와 게시물 태그가 모두 교체됩니다.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/site-games/${migrateGame.id}/migrate-to-bgg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ bggId: targetBggId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`마이그레이션 완료 (유저 ${data.updatedUsers || 0}명, 게시물 ${data.updatedPosts || 0}개 업데이트됨)`);
        setMigrateGame(null); setMigrateBggTarget(null); setMigrateBggResults([]); setMigrateBggQ('');
        load();
      } else toast.error(data.error || '마이그레이션 실패');
    } catch { toast.error('오류'); }
    setSaving(false);
  };

  const searchBggForMigration = async (val: string) => {
    setMigrateBggQ(val);
    if (!val.trim()) { setMigrateBggResults([]); return; }
    setMigrateBggLoading(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bgg-search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ query: val }),
      });
      if (res.ok) {
        const data = await res.json();
        // BGG API 결과는 bggId 없이 id만 있음, site 결과는 bggId 있음
        setMigrateBggResults(data.filter((g: any) => {
          if (g.source === 'bgg') return /^\d+$/.test(String(g.id || ''));
          return /^\d+$/.test(String(g.bggId || ''));
        }).slice(0, 10));
      }
    } catch {}
    setMigrateBggLoading(false);
  };

  // 같은 이름 중복 게임: id → 통합 대상(TO) 매핑
  const dupPeerMap: Record<string, any> = {};
  for (const grp of dupGroups) {
    for (let i = 0; i < grp.length; i++) {
      const peer = grp.find((_: any, j: number) => j !== i);
      if (peer) dupPeerMap[grp[i].id] = peer;
    }
  }

  const directCount = games.filter(isCustom).length;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900">게임 DB 관리</h2>
          <button onClick={load} disabled={loading} className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50">
            {loading ? '로딩 중...' : '새로고침'}
          </button>
        </div>
        <p className="text-sm text-gray-400">총 {games.length}개 등록됨 · 직접등록 {directCount}개</p>

        {error && <div className="mt-3 p-3 bg-red-50 rounded-xl text-sm text-red-600">❌ {error}</div>}

        {dupGroups.length > 0 && (
          <p className="mt-2 text-xs text-amber-600">⚠️ 동일 이름 중복 {dupGroups.length}건 — 목록에서 🔀 통합 버튼으로 처리하세요</p>
        )}

        {/* 검색 + 필터 버튼 */}
        <div className="flex gap-2 mt-4">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="게임 이름 검색..."
            className="flex-1 h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30" />
          <button onClick={() => setShowDirectOnly(v => !v)}
            className={`px-3 py-1.5 text-sm rounded-xl font-medium transition-colors whitespace-nowrap ${showDirectOnly ? 'bg-purple-500 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
            직접등록만
          </button>
        </div>
      </div>


      {/* 게임 목록 */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-3xl mb-2">⏳</div>
            <p className="text-sm">게임 목록 로딩 중...</p>
          </div>
        ) : displayGames.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-3xl mb-2">🎲</div>
            <p className="text-sm">{q || showDirectOnly ? '검색 결과가 없어요' : '등록된 게임이 없어요'}</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[65vh] overflow-y-auto">
            {displayGames.map(g => {
              const custom = isCustom(g);
              const dupSuspect = getDupSuspect(g);
              return (
                <div key={g.id} className={`flex items-center gap-3 p-3 rounded-xl border hover:bg-gray-50 transition-colors ${custom ? 'border-purple-100 bg-purple-50/30' : 'border-cyan-100'}`}>
                  {g.imageUrl
                    ? <img src={g.imageUrl} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                    : <div className="w-11 h-11 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-xl">🎲</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{g.koreanName || g.englishName || g.name}</p>
                      {custom && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-medium flex-shrink-0">직접등록</span>}
                      {!custom && <span className="text-xs px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded font-medium flex-shrink-0">BGG</span>}
                      {dupSuspect && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium flex-shrink-0">⚠️ 중복의심</span>}
                    </div>
                    {g.koreanName && g.englishName && <p className="text-xs text-gray-400 truncate">{g.englishName}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      {g.yearPublished && <p className="text-xs text-gray-300">{g.yearPublished}년</p>}
                      {g.bggId && <p className="text-xs text-gray-300">BGG: {g.bggId}</p>}
                      {dupSuspect && <p className="text-xs text-red-400">BGG에 "{dupSuspect.koreanName || dupSuspect.englishName}" (ID: {dupSuspect.id || dupSuspect.bggId}) 이미 있음</p>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <div className="flex gap-1 items-center">
                      {g.ownerCount > 0 && (
                        <button onClick={() => loadOwners(g)}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium flex-shrink-0">
                          👤 {g.ownerCount}
                        </button>
                      )}
                      <button onClick={() => { setEditGame(g); setEditForm({ koreanName: g.koreanName || '', englishName: g.englishName || '', imageUrl: g.imageUrl || '', bggId: g.bggId || '', yearPublished: g.yearPublished || '' }); }}
                        className="px-2.5 py-1 text-xs bg-cyan-50 text-cyan-700 rounded-lg hover:bg-cyan-100">게임정보</button>
                      <button onClick={() => handleDelete(g)}
                        className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100">삭제</button>
                    </div>
                    {dupPeerMap[g.id] && (
                      <button onClick={() => handleMerge(g, dupPeerMap[g.id])} disabled={saving}
                        className="px-2.5 py-1 text-xs bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 w-full text-center disabled:opacity-50">
                        🔀 통합
                      </button>
                    )}
                    {custom && !dupPeerMap[g.id] && (
                      <button onClick={() => { setMigrateGame(g); setMigrateBggQ(g.koreanName || g.englishName || g.name || ''); setMigrateBggTarget(dupSuspect || null); setMigrateBggResults([]); }}
                        className="px-2.5 py-1 text-xs bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 w-full text-center">
                        BGG 마이그레이션
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 소유자 목록 모달 */}
      {ownersGame && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[70vh]">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
              {ownersGame.imageUrl
                ? <img src={ownersGame.imageUrl} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                : <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">🎲</div>}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{ownersGame.koreanName || ownersGame.name}</p>
                <p className="text-xs text-gray-400">보유 회원 {ownersLoading ? '...' : owners.length}명</p>
              </div>
              <button onClick={() => { setOwnersGame(null); setOwners([]); }} className="text-gray-400 hover:text-gray-600 flex-shrink-0">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {ownersLoading ? (
                <p className="text-center text-gray-400 text-sm py-8">로딩 중...</p>
              ) : owners.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">보유 회원이 없어요</p>
              ) : (
                <div className="space-y-1">
                  {owners.map((o, i) => (
                    <div key={o.userId || i} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50">
                      {o.userAvatar
                        ? <img src={o.userAvatar} className="w-8 h-8 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                        : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm flex-shrink-0">👤</div>}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{o.userName}</p>
                        {o.email && <p className="text-xs text-gray-400 truncate">{o.email}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 게임정보 수정 모달 */}
      {editGame && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              {editForm.imageUrl
                ? <img src={editForm.imageUrl} className="w-14 h-14 rounded-xl object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                : <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">🎲</div>
              }
              <div>
                <h3 className="font-bold text-gray-900">게임정보 수정</h3>
                <p className="text-xs text-gray-400 font-mono">ID: {editGame.id}</p>
                {isCustom(editGame) && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">직접등록</span>}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">한국어 이름</label>
                <input value={editForm.koreanName} onChange={e => setEditForm((f: any) => ({ ...f, koreanName: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">영어 이름</label>
                <input value={editForm.englishName} onChange={e => setEditForm((f: any) => ({ ...f, englishName: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">이미지 URL</label>
                <input value={editForm.imageUrl} onChange={e => setEditForm((f: any) => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">BGG ID</label>
                  <input value={editForm.bggId} onChange={e => setEditForm((f: any) => ({ ...f, bggId: e.target.value }))}
                    placeholder="숫자 ID (없으면 공백)"
                    className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">출판연도</label>
                  <input value={editForm.yearPublished} onChange={e => setEditForm((f: any) => ({ ...f, yearPublished: e.target.value }))}
                    placeholder="예: 2023"
                    className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSaveEdit} disabled={saving}
                className="flex-1 py-2.5 bg-cyan-500 text-white rounded-xl text-sm font-bold hover:bg-cyan-600 disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
              <button onClick={() => setEditGame(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* BGG 마이그레이션 모달 */}
      {migrateGame && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 mb-1">🔄 BGG 마이그레이션</h3>
              <p className="text-xs text-gray-400">직접등록 게임을 BGG 데이터 기반 게임으로 교체합니다. 보유 회원 데이터와 게시물 태그가 모두 업데이트됩니다.</p>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* FROM */}
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-xs font-semibold text-red-500 mb-2">삭제될 직접등록 게임</p>
                <div className="flex items-center gap-3">
                  {migrateGame.imageUrl
                    ? <img src={migrateGame.imageUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    : <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center text-xl flex-shrink-0">🎲</div>}
                  <div>
                    <p className="font-semibold text-red-800 text-sm">{migrateGame.koreanName || migrateGame.name}</p>
                    <p className="text-xs text-red-400 font-mono">{migrateGame.id}</p>
                  </div>
                </div>
              </div>

              {/* TO — BGG 게임 선택 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">교체될 BGG 게임 검색</p>
                <input
                  value={migrateBggQ}
                  onChange={e => searchBggForMigration(e.target.value)}
                  placeholder="BGG 게임 이름 검색..."
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 mb-2"
                />
                {migrateBggLoading && <p className="text-xs text-gray-400 text-center py-2">검색 중...</p>}
                {migrateBggResults.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto border border-gray-100 rounded-xl">
                    {migrateBggResults.map(g => {
                      const gId = String(g.id || g.bggId || '');
                      const thumb = (g.thumbnail || g.imageUrl || '').startsWith('//') ? 'https:' + (g.thumbnail || g.imageUrl) : (g.thumbnail || g.imageUrl || '');
                      const selected = migrateBggTarget && (String(migrateBggTarget.id) === gId || String(migrateBggTarget.bggId) === gId);
                      return (
                        <button key={gId} onClick={() => setMigrateBggTarget(g)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-50 transition-colors ${selected ? 'bg-orange-50 border-l-2 border-orange-400' : ''}`}>
                          {thumb ? <img src={thumb} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                            : <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-sm">🎲</div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{g.koreanName || g.name}</p>
                            {g.englishName && g.koreanName && <p className="text-xs text-gray-400 truncate">{g.englishName || g.name}</p>}
                            <p className="text-xs text-gray-300">BGG ID: {gId}{g.yearPublished ? ` · ${g.yearPublished}년` : ''}</p>
                          </div>
                          {selected && <span className="text-orange-500 text-sm flex-shrink-0">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* 선택된 대상 표시 */}
                {migrateBggTarget && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-xs font-semibold text-green-600 mb-1">선택된 BGG 게임 ✓</p>
                    <div className="flex items-center gap-2">
                      {(() => { const t = (migrateBggTarget.thumbnail || migrateBggTarget.imageUrl || '').replace(/^\/\//, 'https://'); return t ? <img src={t} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-lg flex-shrink-0">🎲</div>; })()}
                      <div>
                        <p className="text-sm font-semibold text-green-800">{migrateBggTarget.koreanName || migrateBggTarget.name}</p>
                        <p className="text-xs text-green-500">BGG ID: {migrateBggTarget.id || migrateBggTarget.bggId}</p>
                      </div>
                      <button onClick={() => setMigrateBggTarget(null)} className="ml-auto text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-2">
              <button onClick={handleMigrate} disabled={!migrateBggTarget || saving}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-40">
                {saving ? '마이그레이션 중...' : '마이그레이션 실행'}
              </button>
              <button onClick={() => { setMigrateGame(null); setMigrateBggTarget(null); setMigrateBggResults([]); setMigrateBggQ(''); }}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 운영자 페이지 ─────────────────────────────────────────────────────────────

type OperatorTab = 'staff-list' | 'activity' | 'revenue' | 'agreements';

const STAFF_ACTIVITY_CATEGORIES = [
  { key: 'tag',     label: '태그 매기기',    points: 2,  unit: '건', wip: false },
  { key: 'title',   label: '제목 작성',      points: 3,  unit: '건', wip: true  },
  { key: 'wiki',    label: '보드위키 등록',  points: 5,  unit: '건', wip: false },
  { key: 'report',  label: '신고 처리',      points: 10, unit: '건', wip: true  },
  { key: 'mediate', label: '분쟁 중재',      points: 15, unit: '건', wip: true  },
  { key: 'recruit', label: '신규 회원 유입', points: 20, unit: '명', wip: false },
  { key: 'event',   label: '이벤트 기획',    points: 30, unit: '건', wip: false },
  { key: 'meeting', label: '회의 참석',      points: 10, unit: '회', wip: false },
];

const STAFF_GRADES = [
  { level: 1, name: '노랑 당근', color: '#FACC15', baseEquity: 1.0 },
  { level: 2, name: '초록 당근', color: '#22C55E', baseEquity: 2.0 },
  { level: 3, name: '파랑 당근', color: '#3B82F6', baseEquity: 3.0 },
  { level: 4, name: '빨강 당근', color: '#EF4444', baseEquity: 4.0 },
  { level: 5, name: '보라 당근', color: '#A855F7', baseEquity: 4.5 },
  { level: 6, name: '검은 당근', color: '#1F2937', baseEquity: 5.0 },
];

interface StaffMember {
  userId: string;
  nickname: string;
  level: number;
  joinedAt: string;
}

interface StaffActivityLog {
  action: string;
  detail: string | null;
  recordedAt: string;
}

interface StaffRevenueEntry {
  id: string;
  amount: number;
  category: string;
  note: string;
  recordedAt: string;
  paid?: boolean;
}

function AuctionResultsSection({ accessToken }: { accessToken: string }) {
  const API = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae`;
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };

  const [tab, setTab] = useState<'requests' | 'results'>('requests');

  // 경매 요청
  const [requests, setRequests] = useState<any[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);
  const [entryFeeMap, setEntryFeeMap] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectInputId, setRejectInputId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deletingReqId, setDeletingReqId] = useState<string | null>(null);

  // 경매 결과
  const [results, setResults] = useState<any[]>([]);
  const [resLoading, setResLoading] = useState(false);

  const loadRequests = async () => {
    setReqLoading(true);
    try {
      const r = await fetch(`${API}/auction/requests`, { headers: authHeaders });
      if (r.ok) { const d = await r.json(); setRequests(d.requests ?? []); }
    } catch { /* silent */ }
    finally { setReqLoading(false); }
  };

  const loadResults = async () => {
    setResLoading(true);
    try {
      const r = await fetch(`${API}/auction/results`, { headers: authHeaders });
      if (r.ok) { const d = await r.json(); setResults(d.results ?? []); }
    } catch { /* silent */ }
    finally { setResLoading(false); }
  };

  useEffect(() => { loadRequests(); }, []);
  useEffect(() => { if (tab === 'results' && results.length === 0) loadResults(); }, [tab]);

  async function reviewRequest(requestId: string, status: 'approved' | 'rejected', reason?: string) {
    setReviewingId(requestId);
    const entryFee = Number(entryFeeMap[requestId] || '0') || 0;
    try {
      const r = await fetch(`${API}/auction/request/${requestId}`, {
        method: 'PATCH', headers: authHeaders,
        body: JSON.stringify({ status, rejectReason: reason || '', entryFee }),
      });
      if (r.ok) {
        setRequests(prev => prev.map(req => req.requestId === requestId
          ? { ...req, status, rejectReason: reason || '', entryFee, reviewedAt: new Date().toISOString() }
          : req));
        setRejectInputId(null); setRejectReason('');
        toast.success(status === 'approved' ? '승인됐어요' : '거절됐어요');
      } else toast.error('처리 실패');
    } catch { toast.error('네트워크 오류'); }
    setReviewingId(null);
  }

  async function deleteRequest(requestId: string) {
    setDeletingReqId(requestId);
    try {
      const r = await fetch(`${API}/auction/request/${requestId}`, { method: 'DELETE', headers: authHeaders });
      if (r.ok) { setRequests(prev => prev.filter(req => req.requestId !== requestId)); toast.success('삭제됐어요'); }
      else toast.error('삭제 실패');
    } catch { toast.error('네트워크 오류'); }
    setDeletingReqId(null);
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const statusBadge = (status: string) => {
    if (status === 'approved') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">승인</span>;
    if (status === 'rejected') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">거절</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">검토 대기</span>;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-800">경매 관리</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">회원 요청 검토 및 낙찰 결과 기록</p>
        </div>
        <button onClick={tab === 'requests' ? loadRequests : loadResults} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        <button onClick={() => setTab('requests')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'requests' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
          경매 요청
          {pendingCount > 0 && <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{pendingCount}</span>}
        </button>
        <button onClick={() => setTab('results')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === 'results' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
          경매 결과
        </button>
      </div>

      {/* 경매 요청 탭 */}
      {tab === 'requests' && (
        reqLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>
        ) : requests.length === 0 ? (
          <div className="py-8 text-center text-gray-300 text-sm">경매 요청이 없습니다.</div>
        ) : (
          <div className="space-y-3 max-h-[560px] overflow-y-auto">
            {[...requests].reverse().map((req) => {
              const isExpanded = expandedReqId === req.requestId;
              return (
                <div key={req.requestId} className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                  {/* 요약 헤더 (클릭으로 펼치기) */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-100 transition-colors"
                    onClick={() => setExpandedReqId(isExpanded ? null : req.requestId)}>
                    {req.imageUrl
                      ? <img src={req.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-100" />
                      : <div className="w-10 h-10 rounded-lg bg-gray-200 shrink-0 flex items-center justify-center text-base">🎲</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900 truncate">{req.title}</span>
                        {statusBadge(req.status)}
                        {req.entryFee > 0 && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-semibold">입장료 {req.entryFee}장</span>}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{req.nickname || req.userId} · {new Date(req.createdAt).toLocaleDateString('ko-KR')}</p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* 펼쳐진 상세 내용 */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-white">
                      {/* 실물 사진 */}
                      {(req.imageUrls?.length > 0 || req.imageUrl) && (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-400 mb-1.5">실물 사진</p>
                          <div className="flex gap-2 flex-wrap">
                            {(req.imageUrls?.length > 0 ? req.imageUrls : [req.imageUrl]).map((url: string, i: number) => (
                              <img key={i} src={url} className="w-16 h-16 rounded-lg object-cover border border-gray-100" />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 기본 정보 */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div><span className="text-gray-400">상품명</span><p className="font-semibold text-gray-800 mt-0.5">{req.title}</p></div>
                        {req.boxCondition && <div><span className="text-gray-400">게임 상태</span><p className="font-semibold text-gray-800 mt-0.5">{req.boxCondition}급</p></div>}
                        <div><span className="text-gray-400">시작가</span><p className="font-semibold text-gray-800 mt-0.5">{req.startPrice}장</p></div>
                        <div><span className="text-gray-400">입찰 단위</span><p className="font-semibold text-gray-800 mt-0.5">{req.bidUnit}장</p></div>
                        {req.prize && <div className="col-span-2"><span className="text-gray-400">상품 내용</span><p className="font-semibold text-gray-800 mt-0.5">{req.prize}</p></div>}
                        {req.description && <div className="col-span-2"><span className="text-gray-400">설명</span><p className="text-gray-700 mt-0.5 whitespace-pre-wrap">{req.description}</p></div>}
                      </div>

                      {/* 입장료 설정 (대기/승인 상태에서만) */}
                      {req.status !== 'rejected' && req.status !== 'launched' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">입장료 설정 (카드 수, 0 = 무료)</label>
                          <input
                            type="number" min="0"
                            value={entryFeeMap[req.requestId] ?? String(req.entryFee ?? 0)}
                            onChange={e => setEntryFeeMap(prev => ({ ...prev, [req.requestId]: e.target.value }))}
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                            placeholder="0"
                          />
                        </div>
                      )}
                      {req.status === 'approved' && req.entryFee > 0 && (
                        <p className="text-[11px] text-purple-600 font-semibold">✓ 입장료 {req.entryFee}장으로 승인됨</p>
                      )}

                      {req.status === 'rejected' && req.rejectReason && (
                        <p className="text-[11px] text-red-400">거절 사유: {req.rejectReason}</p>
                      )}

                      {/* 거절 사유 입력 */}
                      {rejectInputId === req.requestId && (
                        <div className="flex gap-2">
                          <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                            placeholder="거절 사유 (선택)"
                            className="flex-1 h-8 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200" />
                          <button onClick={() => reviewRequest(req.requestId, 'rejected', rejectReason)} disabled={reviewingId === req.requestId}
                            className="h-8 px-3 bg-red-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 hover:bg-red-600">
                            {reviewingId === req.requestId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '확인'}
                          </button>
                          <button onClick={() => { setRejectInputId(null); setRejectReason(''); }} className="h-8 px-2 text-xs text-gray-400 hover:text-gray-600">취소</button>
                        </div>
                      )}

                      {/* 액션 버튼 */}
                      <div className="flex items-center justify-between">
                        {req.status === 'pending' && rejectInputId !== req.requestId && (
                          <div className="flex gap-2">
                            <button onClick={() => reviewRequest(req.requestId, 'approved')} disabled={reviewingId === req.requestId}
                              className="h-8 px-4 bg-emerald-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 hover:bg-emerald-600 flex items-center gap-1">
                              {reviewingId === req.requestId ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3" /> 승인</>}
                            </button>
                            <button onClick={() => setRejectInputId(req.requestId)}
                              className="h-8 px-3 bg-red-100 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-200 flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> 거절
                            </button>
                          </div>
                        )}
                        {req.status !== 'pending' && <div />}
                        <button onClick={() => deleteRequest(req.requestId)} disabled={deletingReqId === req.requestId}
                          className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                          {deletingReqId === req.requestId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* 경매 결과 탭 */}
      {tab === 'results' && (
        resLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>
        ) : results.length === 0 ? (
          <div className="py-8 text-center text-gray-300 text-sm">경매 결과가 없습니다.</div>
        ) : (
          <div className="space-y-3 max-h-[560px] overflow-y-auto">
            {[...results].reverse().map((r, i) => (
              <div key={r.id ?? i} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  {r.imageUrl && (
                    <img src={r.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">{r.title ?? r.gameName ?? '게임명 없음'}</span>
                      {r.boxCondition && (
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">{r.boxCondition}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-gray-500">낙찰자:</span>
                      <span className="text-xs font-semibold text-emerald-600">{r.winnerNickname ?? r.winnerId ?? '유찰'}</span>
                      <span className="text-xs text-gray-400">|</span>
                      <span className="text-xs text-gray-500">낙찰가:</span>
                      <span className="text-xs font-bold text-gray-800">{(r.finalBid ?? r.currentBid)?.toLocaleString() ?? '—'}장</span>
                    </div>
                    {r.endedAt && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        {new Date(r.endedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                      </p>
                    )}
                    {(r.participantCount ?? 0) > 0 && (
                      <p className="text-[11px] text-gray-400 mt-1">참여자 {r.participantCount}명</p>
                    )}
                    {r.escrowAmount && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          r.escrowStatus === 'released' ? 'bg-emerald-100 text-emerald-700' :
                          r.escrowStatus === 'tracking_submitted' ? 'bg-blue-100 text-blue-600' :
                          'bg-orange-100 text-orange-600'
                        }`}>
                          {r.escrowStatus === 'released' ? `✓ 완료 (${r.escrowAmount}장)` :
                           r.escrowStatus === 'tracking_submitted' ? `배송중 · ${r.escrowAmount}장 보유 중` :
                           `보유 중 ${r.escrowAmount}장`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function OperatorSection({ accessToken }: { accessToken: string }) {
  const API = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae`;
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };

  const [opTab, setOpTab] = useState<OperatorTab>('staff-list');

  // 운영진 목록
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingLevelId, setUpdatingLevelId] = useState<string | null>(null);

  // 운영진 추가 (가입자 검색)
  const [showSearch, setShowSearch] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

  // 활동 점수
  const [actUserId, setActUserId] = useState('');
  const [actScores, setActScores] = useState<Record<string, string>>({});
  const [actNote, setActNote] = useState('');
  const [savingAct, setSavingAct] = useState(false);
  const [actLogs, setActLogs] = useState<StaffActivityLog[]>([]);
  const [actLogsLoading, setActLogsLoading] = useState(false);

  // 수익 등록
  const [revAmount, setRevAmount] = useState('');
  const [revCategory, setRevCategory] = useState('광고');
  const [revNote, setRevNote] = useState('');
  const [savingRev, setSavingRev] = useState(false);
  const [revList, setRevList] = useState<StaffRevenueEntry[]>([]);
  const [revLoading, setRevLoading] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  // 회의
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState('');
  const [savingMeeting, setSavingMeeting] = useState(false);
  // 이달 활동 점수 (수익 배분용)
  const [monthlyScores, setMonthlyScores] = useState<Record<string, number>>({});

  // 동의 현황
  const [agreementsLog, setAgreementsLog] = useState<any[]>([]);
  const [agreementsActiveIds, setAgreementsActiveIds] = useState<string[]>([]);
  const [agreementsLoading, setAgreementsLoading] = useState(false);
  const [resettingAgreementId, setResettingAgreementId] = useState<string | null>(null);
  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const r = await fetch(`${API}/staff/list`, { headers: authHeaders });
      const d = await r.json();
      setStaffList(d.members ?? []);
    } catch { /* silent */ }
    finally { setStaffLoading(false); }
  };

  const loadAllUsers = async () => {
    if (usersLoaded) return;
    setUsersLoading(true);
    try {
      const r = await fetch(
        `${API}/admin/beta-testers?limit=1000&offset=0&includeGameData=false`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (r.ok) {
        const d = await r.json();
        setAllUsers((d.testers ?? []).filter((u: any) => u.status === 'approved'));
        setUsersLoaded(true);
      }
    } catch { /* silent */ }
    finally { setUsersLoading(false); }
  };

  const loadRevList = async () => {
    setRevLoading(true);
    try {
      const r = await fetch(`${API}/staff/revenue/list`, { headers: authHeaders });
      if (r.ok) { const d = await r.json(); setRevList(d.list ?? []); }
    } catch { /* silent */ }
    finally { setRevLoading(false); }
  };

  const loadActLogs = async (userId: string) => {
    setActLogsLoading(true);
    try {
      const r = await fetch(`${API}/staff/activity/${userId}`, { headers: authHeaders });
      if (r.ok) { const d = await r.json(); setActLogs(d.logs ?? []); }
    } catch { /* silent */ }
    finally { setActLogsLoading(false); }
  };

  const loadMeetings = async () => {
    setMeetingsLoading(true);
    try {
      const r = await fetch(`${API}/staff/meetings`, { headers: authHeaders });
      if (r.ok) { const d = await r.json(); setMeetings(d.meetings ?? []); }
    } catch { }
    finally { setMeetingsLoading(false); }
  };

  const handleCreateMeeting = async () => {
    if (!newMeetingTitle.trim()) { toast.error('회의 제목을 입력하세요'); return; }
    setSavingMeeting(true);
    try {
      const r = await fetch(`${API}/staff/meeting`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ title: newMeetingTitle, date: newMeetingDate }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '생성 실패');
      setMeetings(d.meetings ?? []);
      setNewMeetingTitle('');
      setNewMeetingDate('');
      toast.success('회의가 생성됐습니다.');
    } catch (e: any) { toast.error(e.message); }
    setSavingMeeting(false);
  };

  const loadMonthlyScores = async () => {
    try {
      const month = new Date().toISOString().slice(0, 7);
      const r = await fetch(`${API}/staff/monthly-scores?month=${month}`, { headers: authHeaders });
      if (r.ok) { const d = await r.json(); setMonthlyScores(d.scores ?? {}); }
    } catch { }
  };

  const loadAgreements = async () => {
    setAgreementsLoading(true);
    try {
      const r = await fetch(`${API}/staff/agreements`, { headers: authHeaders });
      if (r.ok) {
        const d = await r.json();
        setAgreementsLog(d.log ?? []);
        setAgreementsActiveIds(d.activeIds ?? []);
      }
    } catch { /* silent */ }
    finally { setAgreementsLoading(false); }
  };

  const handleResetAgreement = async (userId: string) => {
    setResettingAgreementId(userId);
    try {
      const r = await fetch(`${API}/staff/agreement/${userId}`, { method: 'DELETE', headers: authHeaders });
      if (!r.ok) throw new Error('초기화 실패');
      setAgreementsActiveIds(prev => prev.filter(id => id !== userId));
      toast.success('동의서가 초기화됐습니다.');
    } catch (e: any) { toast.error(e.message); }
    setResettingAgreementId(null);
  };

  useEffect(() => { loadStaff(); }, []);
  useEffect(() => { if (opTab === 'revenue') { loadRevList(); loadMonthlyScores(); } }, [opTab]);
  useEffect(() => { if (opTab === 'activity') loadMeetings(); }, [opTab]);
  useEffect(() => { if (opTab === 'agreements') loadAgreements(); }, [opTab]);
  useEffect(() => { if (actUserId) loadActLogs(actUserId); }, [actUserId]);
  useEffect(() => { if (showSearch) loadAllUsers(); }, [showSearch]);

  const handleAddStaff = async (user: any) => {
    const nickname = user.name || user.username || user.email;
    setAddingId(user.userId);
    try {
      const r = await fetch(`${API}/staff/add`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ userId: user.userId, nickname, level: 1 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '등록 실패');
      setStaffList(d.members ?? []);
      setSearchQ('');
      setShowSearch(false);
      toast.success(`${nickname}님이 운영진 레벨1로 등록됐습니다.`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setAddingId(null);
  };

  const handleRemoveStaff = async (userId: string, nickname: string) => {
    if (!window.confirm(`${nickname}님을 운영진에서 제거할까요?`)) return;
    setRemovingId(userId);
    try {
      const r = await fetch(`${API}/staff/remove`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ userId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '제거 실패');
      setStaffList(d.members ?? []);
      toast.success('제거됐습니다.');
    } catch (e: any) {
      toast.error(e.message);
    }
    setRemovingId(null);
  };

  const handleUpdateLevel = async (userId: string, level: number) => {
    setUpdatingLevelId(userId);
    try {
      const r = await fetch(`${API}/staff/update-level`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ userId, level }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '저장 실패');
      setStaffList(d.members ?? []);
      toast.success('등급이 변경됐습니다.');
    } catch (e: any) {
      toast.error(e.message);
    }
    setUpdatingLevelId(null);
  };

  const handleSaveActivity = async () => {
    if (!actUserId) { toast.error('운영진을 선택하세요'); return; }
    const entries = STAFF_ACTIVITY_CATEGORIES
      .filter(cat => !cat.wip && (parseInt(actScores[cat.key] ?? '0') || 0) > 0)
      .map(cat => {
        const count = parseInt(actScores[cat.key] ?? '0') || 0;
        return { key: cat.key, label: cat.label, unit: cat.unit, count, earned: count * cat.points };
      });
    if (entries.length === 0) { toast.error('건수를 하나 이상 입력하세요'); return; }
    const totalPoints = entries.reduce((s, e) => s + e.earned, 0);
    const detail = [
      entries.map(e => `${e.label} ${e.count}${e.unit}(+${e.earned}점)`).join(' | '),
      actNote,
    ].filter(Boolean).join(' | ');
    const scores: Record<string, number> = {};
    entries.forEach(e => { scores[e.key] = e.count; });
    setSavingAct(true);
    try {
      const r = await fetch(`${API}/staff/activity`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ userId: actUserId, action: `활동점수 합계 ${totalPoints}점`, detail, totalPoints, scores }),
      });
      if (!r.ok) throw new Error('저장 실패');
      toast.success('활동 점수가 기록됐습니다.');
      setActScores({});
      setActNote('');
      loadActLogs(actUserId);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSavingAct(false);
  };

  const handleAddRevenue = async () => {
    if (!revAmount || isNaN(Number(revAmount))) { toast.error('금액을 입력하세요'); return; }
    setSavingRev(true);
    try {
      const r = await fetch(`${API}/staff/revenue`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ amount: Number(revAmount), category: revCategory, note: revNote }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '등록 실패');
      toast.success('수익이 등록됐습니다.');
      setRevAmount('');
      setRevNote('');
      loadRevList();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSavingRev(false);
  };

  const handlePayout = async (entry: StaffRevenueEntry) => {
    if (!window.confirm(`${entry.amount.toLocaleString()}원 지급완료 처리할까요?`)) return;
    setPayingId(entry.id);
    try {
      const net = Math.round(entry.amount * 0.9);
      await Promise.all(
        staffList.map(m => {
          const grade = STAFF_GRADES.find(g => g.level === (m.level ?? 1)) ?? STAFF_GRADES[0];
          const share = Math.round(net * grade.baseEquity / 100);
          return fetch(`${API}/staff/payout`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ userId: m.userId, amount: share, note: `${entry.category} 정산 (${entry.recordedAt.slice(0, 10)})` }),
          });
        })
      );
      setRevList(prev => prev.map(r => r.id === entry.id ? { ...r, paid: true } : r));
      toast.success('정산이 완료됐습니다.');
    } catch (e: any) {
      toast.error(e.message);
    }
    setPayingId(null);
  };

  const staffBaseEquitySum = staffList.reduce((s, m) => {
    const grade = STAFF_GRADES.find(g => g.level === (m.level ?? 1)) ?? STAFF_GRADES[0];
    return s + grade.baseEquity;
  }, 0);
  const staffIds = new Set(staffList.map(m => m.userId));
  const filteredUsers = allUsers.filter(u => {
    if (staffIds.has(u.userId)) return false;
    if (!searchQ.trim()) return false;
    const q = searchQ.toLowerCase();
    return (
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.username ?? '').toLowerCase().includes(q) ||
      (u.nickname ?? '').toLowerCase().includes(q)
    );
  });

  const opTabs: { id: OperatorTab; label: string }[] = [
    { id: 'staff-list',  label: '운영진 목록' },
    { id: 'activity',    label: '활동 점수' },
    { id: 'revenue',     label: '수익 등록' },
    { id: 'agreements',  label: '동의 현황' },
  ];

  return (
    <div className="space-y-4">
      {/* 헤더 + 탭 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🛠</span>
          <div>
            <h2 className="text-base font-bold text-gray-900">운영자 페이지</h2>
            <p className="text-xs text-gray-400">운영진 관리 및 수익 정산 도구</p>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {opTabs.map(t => (
            <button key={t.id} onClick={() => setOpTab(t.id)}
              className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
                opTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 운영진 목록 ── */}
      {opTab === 'staff-list' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">운영진 ({staffList.length}명)</h3>
              <div className="flex gap-2">
                <button onClick={() => setShowSearch(v => !v)}
                  className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700">
                  <Plus className="w-3.5 h-3.5" /> 운영진 추가
                </button>
                <button onClick={loadStaff} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 가입자 검색 패널 */}
            {showSearch && (
              <div className="bg-blue-50 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-blue-700">가입자 검색으로 등록</p>
                  <button onClick={() => { setShowSearch(false); setSearchQ(''); }}
                    className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
                </div>
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="이름, 닉네임, 이메일로 검색..."
                  className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white mb-2"
                  autoFocus
                />
                {usersLoading && (
                  <div className="py-3 flex justify-center">
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  </div>
                )}
                {!usersLoading && searchQ.trim() && filteredUsers.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">검색 결과가 없습니다.</p>
                )}
                {filteredUsers.slice(0, 8).map(u => {
                  const name = u.name || u.username || u.email;
                  return (
                    <div key={u.userId} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-blue-100 mb-1 last:mb-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{name}</p>
                        <p className="text-[10px] text-gray-400">{u.email}</p>
                      </div>
                      <button
                        onClick={() => handleAddStaff(u)}
                        disabled={addingId === u.userId}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                        {addingId === u.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '등록'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 운영진 목록 */}
            {staffLoading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>
            ) : staffList.length === 0 ? (
              <div className="py-8 text-center text-gray-300 text-sm">등록된 운영진이 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {staffList.map(m => {
                  const grade = STAFF_GRADES.find(g => g.level === (m.level ?? 1)) ?? STAFF_GRADES[0];
                  return (
                    <div key={m.userId} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: grade.color }}>
                        {(m.nickname ?? '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 truncate">{m.nickname}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: grade.color }}>
                            {grade.name}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">{(m.joinedAt ?? '').slice(0, 10)} 합류 · 기본지분 {grade.baseEquity}%</div>
                      </div>
                      <select
                        value={m.level ?? 1}
                        onChange={e => handleUpdateLevel(m.userId, Number(e.target.value))}
                        disabled={updatingLevelId === m.userId}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white mr-1">
                        {STAFF_GRADES.map(g => (
                          <option key={g.level} value={g.level}>Lv.{g.level}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleRemoveStaff(m.userId, m.nickname)}
                        disabled={removingId === m.userId}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        {removingId === m.userId
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 지분 현황 */}
          {staffList.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4">지분 현황</h3>
              <div className="space-y-0">
                <div className="flex justify-between text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-600">운영사 (프린스캣)</span>
                  <span className="font-semibold text-gray-900">51%</span>
                </div>
                <div className="flex justify-between text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-600">운영진 기본 지분 합계</span>
                  <span className="font-semibold text-gray-900">{staffBaseEquitySum.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-600">운영진 성과 지분</span>
                  <span className="text-[11px] text-gray-400">19% (활동점수 기반, 추후 반영)</span>
                </div>
                <div className="flex justify-between text-sm py-2">
                  <span className="text-gray-600">미충원분 (운영사 임시 보유)</span>
                  <span className="font-semibold text-orange-500">{Math.max(0, 30 - staffBaseEquitySum).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 활동 점수 ── */}
      {opTab === 'activity' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-4">활동 점수 입력</h3>
            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-1.5 block">운영진 선택</label>
              <select
                value={actUserId}
                onChange={e => { setActUserId(e.target.value); setActLogs([]); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="">-- 선택 --</option>
                {staffList.map(m => (
                  <option key={m.userId} value={m.userId}>{m.nickname} (Lv.{m.level ?? 1})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 mb-3">
              {STAFF_ACTIVITY_CATEGORIES.map(cat => {
                const count = parseInt(actScores[cat.key] ?? '0') || 0;
                return (
                  <div key={cat.key} className={`flex items-center gap-2 ${cat.wip ? 'opacity-40' : ''}`}>
                    <span className="text-sm text-gray-700 flex-1">{cat.label}</span>
                    {cat.wip ? (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">준비중</span>
                    ) : (
                      <>
                        <input
                          type="number" min="0" placeholder="0"
                          value={actScores[cat.key] ?? ''}
                          onChange={e => setActScores(prev => ({ ...prev, [cat.key]: e.target.value }))}
                          className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right"
                        />
                        <span className="text-xs text-gray-400 w-5">{cat.unit}</span>
                        <span className={`text-xs font-semibold w-14 text-right ${count > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                          {count > 0 ? `+${count * cat.points}점` : `${cat.points}점/${cat.unit}`}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 입력 합계 + 의무 달성 미리보기 */}
            {(() => {
              const total = STAFF_ACTIVITY_CATEGORIES
                .filter(c => !c.wip)
                .reduce((s, c) => s + ((parseInt(actScores[c.key] ?? '0') || 0) * c.points), 0);
              if (total === 0) return null;
              const tagTitle = (parseInt(actScores['tag'] ?? '0') || 0) + (parseInt(actScores['title'] ?? '0') || 0);
              const wiki = parseInt(actScores['wiki'] ?? '0') || 0;
              const meeting = parseInt(actScores['meeting'] ?? '0') || 0;
              return (
                <div className="bg-blue-50 rounded-xl p-3 mb-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-blue-700">이번 입력 합계</span>
                    <span className="text-sm font-black text-blue-700">+{total}점</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tagTitle >= 20 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>태그/제목 {tagTitle}/20건</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${wiki >= 5 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>위키 {wiki}/5건</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${meeting >= 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>회의 {meeting}/1회</span>
                    {total < 50 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">⚠ 50점 미만</span>}
                  </div>
                </div>
              );
            })()}

            <input
              value={actNote}
              onChange={e => setActNote(e.target.value)}
              placeholder="메모 (선택)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3"
            />
            <button onClick={handleSaveActivity} disabled={savingAct || !actUserId}
              className="w-full bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {savingAct ? '저장 중...' : '활동 기록 저장'}
            </button>
          </div>

          {actUserId && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">
                {staffList.find(m => m.userId === actUserId)?.nickname} 활동 로그
              </h3>
              {actLogsLoading ? (
                <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>
              ) : actLogs.length === 0 ? (
                <div className="py-6 text-center text-gray-300 text-sm">기록이 없습니다.</div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {actLogs.map((log, i) => (
                    <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{log.action}</p>
                        {log.detail && <p className="text-xs text-gray-400 mt-0.5">{log.detail}</p>}
                      </div>
                      <span className="text-[10px] text-gray-300 whitespace-nowrap">{(log.recordedAt ?? '').slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 회의 관리 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">회의 관리</h3>
              <button onClick={loadMeetings} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 mb-4">
              <input
                value={newMeetingTitle}
                onChange={e => setNewMeetingTitle(e.target.value)}
                placeholder="회의 제목"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={newMeetingDate}
                onChange={e => setNewMeetingDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700"
              />
              <button onClick={handleCreateMeeting} disabled={savingMeeting || !newMeetingTitle.trim()}
                className="w-full bg-gray-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-700 disabled:opacity-50">
                {savingMeeting ? '생성 중...' : '회의 생성'}
              </button>
            </div>
            {meetingsLoading ? (
              <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>
            ) : meetings.length === 0 ? (
              <div className="py-4 text-center text-gray-300 text-sm">등록된 회의가 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {meetings.map((m: any) => (
                  <div key={m.id} className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{m.title}</p>
                      <p className="text-xs text-gray-400">{m.date ?? ''} · 참석 {(m.attendees ?? []).length}명</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.status === 'open' ? '참석 가능' : '종료'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 수익 등록 ── */}
      {opTab === 'revenue' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-4">수익 등록</h3>
            <div className="space-y-2 mb-3">
              <div className="flex gap-2">
                <input
                  type="number" placeholder="금액 (원)"
                  value={revAmount}
                  onChange={e => setRevAmount(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                />
                <select
                  value={revCategory}
                  onChange={e => setRevCategory(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                  {['광고', '후원', '협찬', '판매', '기타'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <input
                placeholder="메모 (선택)"
                value={revNote}
                onChange={e => setRevNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>

            {revAmount && !isNaN(Number(revAmount)) && staffList.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <p className="text-xs text-gray-500 mb-2 font-medium">배분 미리보기 (부가세 10% 차감 후)</p>
                {(() => {
                  const net = Math.round(Number(revAmount) * 0.9);
                  const companyAmt = Math.round(net * 0.51);
                  const totalPts = Object.values(monthlyScores).reduce((s, p) => s + p, 0);
                  return (
                    <>
                      <div className="flex justify-between text-xs py-1 border-b border-gray-200 mb-1">
                        <span className="text-gray-400">순수익 (VAT 차감)</span>
                        <span className="text-gray-600">{net.toLocaleString()}원</span>
                      </div>
                      <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                        <span className="text-gray-500 font-medium">운영사 (프린스캣) 51%</span>
                        <span className="font-semibold text-gray-700">{companyAmt.toLocaleString()}원</span>
                      </div>
                      {staffList.map(m => {
                        const grade = STAFF_GRADES.find(g => g.level === (m.level ?? 1)) ?? STAFF_GRADES[0];
                        const baseAmt = Math.round(net * grade.baseEquity / 100);
                        const myPts = monthlyScores[m.userId] ?? 0;
                        const perfPct = totalPts > 0 ? 19 * myPts / totalPts : 0;
                        const perfAmt = Math.round(net * perfPct / 100);
                        return (
                          <div key={m.userId} className="flex justify-between text-xs py-1">
                            <span className="text-gray-600">
                              {m.nickname}
                              <span className="text-gray-400 ml-1">
                                기본{grade.baseEquity}%{totalPts > 0 ? `+성과${perfPct.toFixed(1)}%` : ''}
                              </span>
                            </span>
                            <span className="font-semibold text-gray-800">{(baseAmt + perfAmt).toLocaleString()}원</span>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            )}

            <button onClick={handleAddRevenue} disabled={savingRev}
              className="w-full bg-green-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-50">
              {savingRev ? '등록 중...' : '수익 등록'}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">수익 내역</h3>
              <button onClick={loadRevList} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {revLoading ? (
              <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>
            ) : revList.length === 0 ? (
              <div className="py-6 text-center text-gray-300 text-sm">등록된 수익이 없습니다.</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {revList.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{entry.amount.toLocaleString()}원</span>
                        <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{entry.category}</span>
                        {entry.paid && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">지급완료</span>
                        )}
                      </div>
                      {entry.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{entry.note}</p>}
                      <p className="text-[10px] text-gray-300 mt-0.5">{(entry.recordedAt ?? '').slice(0, 10)}</p>
                    </div>
                    {!entry.paid && (
                      <button
                        onClick={() => handlePayout(entry)}
                        disabled={payingId === entry.id}
                        className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
                        {payingId === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : '지급완료'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 동의 현황 ── */}
      {opTab === 'agreements' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800">동의 현황</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">운영진 동의서 법적 기록 · 동의 시각, IP, 기기 포함</p>
            </div>
            <button onClick={loadAgreements} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {agreementsLoading ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>
          ) : agreementsLog.length === 0 ? (
            <div className="py-8 text-center text-gray-300 text-sm">동의 기록이 없습니다.</div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto">
              {agreementsLog.map((entry, i) => {
                const isActive = agreementsActiveIds.includes(entry.userId);
                return (
                  <div key={i} className={`rounded-xl border px-4 py-3 ${isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-900">{entry.nickname}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                            {isActive ? '✓ 동의 유효' : '초기화됨'}
                          </span>
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{entry.documentVersion ?? 'v1'}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1 font-mono">
                          {new Date(entry.agreedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">IP: {entry.ip}</p>
                        <p className="text-[10px] text-gray-300 mt-0.5 truncate">{entry.userAgent}</p>
                      </div>
                      {isActive && (
                        <button
                          onClick={() => handleResetAgreement(entry.userId)}
                          disabled={resettingAgreementId === entry.userId}
                          className="shrink-0 text-[11px] text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors disabled:opacity-40">
                          {resettingAgreementId === entry.userId ? <Loader2 className="w-3 h-3 animate-spin inline" /> : '초기화'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
