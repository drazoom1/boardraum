import { useState, useEffect, useRef } from 'react';
import { Loader2, Camera, X, Lock, Eye, EyeOff, BarChart2, Share2, Trophy, Info, PenLine, Settings } from 'lucide-react';
import { ChessRankBadge, RankInfoModal } from './ChessRankBadge';
import { getRankByStats } from './chessRank';
import { toast } from 'sonner';
import { getSupabaseClient } from '../lib/supabase';
import { projectId } from '/utils/supabase/info';
import { BoardGame } from '../App';
import { BoardGameList } from './BoardGameList';
import { PlayStatsModal } from './PlayStatsModal';
import { PostComposer } from './PostComposer';
import { FeedCard, type FeedPost } from './FeedPage';
import { ReferralLinkModal } from './ReferralLinkModal';

const supabase = getSupabaseClient();

interface UserProfile {
  userId: string;
  email: string;
  name: string;
  username: string;
  phone: string;
  birthdate: string;
  profileImage?: string;
  bio?: string;
  favoriteGames?: string;
  createdAt?: string;
}

interface MyPageProps {
  accessToken: string;
  onClose: () => void;
  onLogout?: () => void;
  ownedGames?: BoardGame[];
  wishlistGames?: BoardGame[];
  onOwnedGamesChange?: (games: BoardGame[]) => void;
  onWishlistGamesChange?: (games: BoardGame[]) => void;
  userId?: string;
  userEmail?: string;
  onNavigateToRanking?: () => void;
  onMoveToOwned?: (game: any) => void;
  onNavigateToWiki?: (category: string, game: any) => void;
  readOnly?: boolean;
  scrollToTopTrigger?: number;
}

type MyPageTab = 'owned' | 'wishlist' | 'posts';


function ShareButton({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/shared/${userId}`;
    // Web Share API (모바일 네이티브 공유)
    if (navigator.share) {
      try {
        await navigator.share({ title: '보드라움 컬렉션', url });
        return;
      } catch {}
    }
    // Clipboard API
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    } catch {}
    // 최후 fallback
    const el = document.createElement('textarea');
    el.value = url;
    el.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button title="자랑하기" onClick={handleShare}
      className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors relative
        ${copied ? 'bg-cyan-500 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900'}`}>
      <Share2 className="w-4 h-4" />
      {copied && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap">
          링크 복사됨!
        </span>
      )}
    </button>
  );
}

export function MyPage({ accessToken, onClose, onLogout, ownedGames = [], wishlistGames = [], onOwnedGamesChange, onWishlistGamesChange, userId, userEmail, onNavigateToRanking, onMoveToOwned, onNavigateToWiki, readOnly = false, scrollToTopTrigger }: MyPageProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<MyPageTab>('owned');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showRankModal, setShowRankModal] = useState(false);
  const [staffLevel, setStaffLevel] = useState<number | null>(null);
  const [showPwSection, setShowPwSection] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacySettings, setPrivacySettings] = useState({ showOwnedList: true, showOwnedTotal: false, showWishList: true, showWishTotal: false, showPlayRecords: false, showGameManagement: false });
  const [privacyDraft, setPrivacyDraft] = useState({ showOwnedList: true, showOwnedTotal: false, showWishList: true, showWishTotal: false, showPlayRecords: false, showGameManagement: false });
  const [privacySaving, setPrivacySaving] = useState(false);

  useEffect(() => {
    if (scrollToTopTrigger === undefined) return;
    document.getElementById('root')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [scrollToTopTrigger]);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/user/privacy`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.settings) setPrivacySettings(d.settings);
    }).catch(() => {});
  }, [accessToken]);

  const savePrivacySettings = async (next: typeof privacySettings) => {
    setPrivacySaving(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/user/privacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error('저장 실패');
      setPrivacySettings(next);
      setShowPrivacyModal(false);
    } catch (e: any) {
      toast.error(e.message || '저장에 실패했어요');
    }
    setPrivacySaving(false);
  };

  const handleWithdraw = async () => {
    if (!confirm('정말 탈퇴하시겠어요? 모든 데이터가 삭제되며 복구할 수 없어요.')) return;
    setWithdrawLoading(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/user/withdraw`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '탈퇴 처리 실패');
      toast.success('탈퇴가 완료되었어요.');
      onLogout?.();
    } catch (e: any) {
      toast.error(e.message || '탈퇴 처리 중 오류가 발생했어요.');
    } finally {
      setWithdrawLoading(false);
      setShowWithdrawModal(false);
    }
  };
  const [userPoints, setUserPoints] = useState({ points: 0, posts: 0, comments: 0, likesReceived: 0 });
  const [showComposer, setShowComposer] = useState(false);
  const [composerCategory, setComposerCategory] = useState<string | undefined>(undefined);
  const [hwCategories, setHwCategories] = useState<any[]>([]);
  const [hwSlideIndex, setHwSlideIndex] = useState(0);
  const [followModal, setFollowModal] = useState<{ type: 'followers' | 'following'; users: {userId:string;username:string;profileImage:string|null}[] } | null>(null);
  const [followModalLoading, setFollowModalLoading] = useState(false);
  const [followStats, setFollowStats] = useState({ followerCount: 0, followingCount: 0 });
  
  // 게시물 관리
  const [myPosts, setMyPosts] = useState<FeedPost[]>([]);
  const [savedPosts, setSavedPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsSubTab, setPostsSubTab] = useState<'mine' | 'saved'>('mine');
  const [displayedPostsCount, setDisplayedPostsCount] = useState(20);

  // 숙제 현황
  const [showHomeworkModal, setShowHomeworkModal] = useState(false);
  const [homeworkData, setHomeworkData] = useState<{ categories: any[]; submissions: any[] } | null>(null);
  const [homeworkLoading, setHomeworkLoading] = useState(false);

  const loadHomework = async () => {
    if (!accessToken) return;
    setHomeworkLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/homework/my`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) setHomeworkData(await res.json());
    } catch {}
    setHomeworkLoading(false);
  };
  const [bioExpanded, setBioExpanded] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });

  const [formData, setFormData] = useState({
    name: '', username: '', phone: '', birthdate: '', profileImage: '', bio: '', favoriteGames: '',
  });

  useEffect(() => { loadProfile(); }, []);

  const loadFollowStats = () => {
    if (!userId || !accessToken) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/follow/stats/${userId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setFollowStats({ followerCount: d.followerCount || 0, followingCount: d.followingCount || 0 });
    }).catch(() => {});
  };

  useEffect(() => { loadFollowStats(); }, [userId]);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/points/me`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setUserPoints(d);
    }).catch(() => {});
  }, [accessToken]);

  // 마운트 시 게시물 로드 (숫자 표시용), 탭 전환 시 재로드
  useEffect(() => {
    loadMyPosts();
  }, []);

  useEffect(() => {
    if (activeTab === 'posts') {
      loadMyPosts();
    }
  }, [activeTab]);

  // 숙제 카테고리 로딩
  useEffect(() => {
    if (!accessToken) return;
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/homework/categories`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.categories) setHwCategories(d.categories.filter((c: any) => c.active));
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

  const loadMyPosts = async () => {
    if (!userId || !accessToken) return;
    setPostsLoading(true);
    try {
      const [postsRes, savedRes] = await Promise.all([
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/community/posts/by-user/${userId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/bookmarks`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
      ]);
      if (postsRes.ok) {
        const data = await postsRes.json();
        setMyPosts(data.posts || []);
      }
      if (savedRes.ok) {
        const data = await savedRes.json();
        setSavedPosts(data.posts || []);
      }
    } catch (err) {
      console.error('Failed to load posts:', err);
    }
    setPostsLoading(false);
  };

  const openFollowModal = async (type: 'followers' | 'following') => {
    if (!userId || !accessToken) return;
    setFollowModalLoading(true);
    setFollowModal({ type, users: [] });
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/follow/list/${userId}?type=${type}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setFollowModal({ type, users: data.users || [] });
      }
    } catch {}
    setFollowModalLoading(false);
  };

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser(accessToken);
      if (!user?.id) return;
      const [res, staffRes] = await Promise.all([
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/user/profile`,
          { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/staff/me`,
          { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      if (staffRes.ok) {
        const sd = await staffRes.json();
        if (sd.member) setStaffLevel(sd.member.level ?? 1);
      }
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
        if (data.profile) {
          setFormData({
            name: data.profile.name || '',
            username: data.profile.username || '',
            phone: data.profile.phone || '',
            birthdate: data.profile.birthdate || '',
            profileImage: data.profile.profileImage || '',
            bio: data.profile.bio || '',
            favoriteGames: data.profile.favoriteGames || '',
          });
        }
      }
    } catch { toast.error('프로필을 불러오지 못했습니다'); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('이름을 입력해주세요'); return; }
    if (!formData.username.trim()) { toast.error('닉네임을 입력해주세요'); return; }
    setSaving(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/user/profile`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(formData) }
      );
      if (!res.ok) throw new Error((await res.json()).error || '저장 실패');
      toast.success('프로필이 저장되었습니다! ✨');
      setShowEditModal(false);
      await loadProfile();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg','image/jpg','image/png','image/webp'].includes(file.type)) { toast.error('JPEG, PNG, WebP만 가능합니다'); return; }
    if (file.size > 5*1024*1024) { toast.error('5MB 이하만 가능합니다'); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/upload-image`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: fd });
      if (!res.ok) throw new Error((await res.json()).error || '업로드 실패');
      const data = await res.json();
      setFormData(p => ({ ...p, profileImage: data.imageUrl }));
      toast.success('프로필 이미지가 업로드되었습니다!');
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const handlePasswordChange = async () => {
    if (!pwForm.next || pwForm.next.length < 8) { toast.error('비밀번호는 8자 이상이어야 합니다'); return; }
    if (pwForm.next !== pwForm.confirm) { toast.error('새 비밀번호가 일치하지 않습니다'); return; }
    if (!pwForm.current) { toast.error('현재 비밀번호를 입력해주세요'); return; }
    setPwSaving(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/user/change-password`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '비밀번호 변경 실패');
      toast.success('비밀번호가 변경되었습니다! 다시 로그인해주세요.');
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => onLogout?.(), 1500);
    } catch (e: any) { toast.error(e.message); }
    finally { setPwSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
    </div>
  );

  const displayName = profile?.username || profile?.name || userEmail?.split('@')[0] || '회원';
  const displayId = profile?.email || userEmail || '';
  const avatarUrl = formData.profileImage || profile?.profileImage;

  return (
    <div className="max-w-2xl mx-auto">
      {/* 프로필 카드 */}
      <div className="bg-white rounded-2xl p-5 mb-3 shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xl font-bold text-gray-900 truncate">{displayName}</p>
              {/* 등급 배지 */}
              {(() => {
                const rank = getRankByStats(userPoints.points, userPoints.posts, userPoints.comments, userPoints.likesReceived);
                return (
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* 체스 등급 아이콘 + 당근 아이콘 + 등급명 묶음 */}
                    <span className="inline-flex items-end" style={{ gap: '0px' }}>
                      <ChessRankBadge rank={rank} showLabel={false} />
                      {staffLevel && (
                        <img
                          src={`/staff-grade-${staffLevel}.webp`}
                          className="object-contain flex-shrink-0"
                          style={{ width: '15px', height: '15px', marginLeft: '-3px' }}
                          title="운영진 등급"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <span className="text-xs font-semibold text-gray-600" style={{ marginLeft: '3px' }}>{rank.label}</span>
                    </span>
                    <button onClick={() => setShowRankModal(true)}
                      className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors flex-shrink-0"
                      title="등급 정보">
                      <Info className="w-3 h-3 text-gray-500" />
                    </button>
                  </div>
                );
              })()}
            </div>
            <p className="text-xs text-gray-400 truncate mt-0.5">{displayId}</p>
            {profile?.bio ? (
              <div className="mt-0.5">
                <p className={`text-sm text-gray-500 break-words ${bioExpanded ? '' : 'line-clamp-1'}`}>
                  {profile.bio}
                </p>
                {profile.bio.length > 20 && (
                  <button onClick={() => setBioExpanded(v => !v)}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    {bioExpanded ? '접기' : '더보기'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm mt-0.5"><span className="text-gray-300 italic">소개글이 없어요</span></p>
            )}
          </div>
          {/* 프로필 이미지 */}
          <div className="w-16 h-16 rounded-full bg-gray-100 flex-shrink-0 ml-4 overflow-hidden border-2 border-gray-100">
            {avatarUrl
              ? <img src={avatarUrl} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-2xl">🎲</div>
            }
          </div>
        </div>

        {/* 통계 행 */}
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => openFollowModal('followers')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <span className="font-bold text-gray-900">{followStats.followerCount}</span> 팔로워
          </button>
          <button onClick={() => openFollowModal('following')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <span className="font-bold text-gray-900">{followStats.followingCount}</span> 팔로잉
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {/* 플레이 통계 */}
            <button onClick={() => setShowStatsModal(true)} title="플레이 통계"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors">
              <BarChart2 className="w-4 h-4" />
            </button>
            {/* 자랑하기 */}
            {userId && (
<ShareButton userId={userId} />
            )}
            {/* 랭킹 */}
            {onNavigateToRanking && (
              <button onClick={onNavigateToRanking} title="랭킹"
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors">
                <Trophy className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 추천 링크 버튼 (상단) */}
        {!readOnly && (
          <button onClick={() => setShowReferralModal(true)}
            className="w-full py-2.5 mb-2 rounded-xl text-sm font-bold text-white bg-cyan-500 hover:bg-cyan-600 transition-colors flex items-center justify-center gap-2">
            <Share2 className="w-4 h-4" /> 내 추천 링크 공유
          </button>
        )}

        {/* 프로필 편집 + 공개 설정 버튼 */}
        {!readOnly && (
          <div className="flex gap-2">
            <button onClick={() => setShowEditModal(true)}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              프로필 편집
            </button>
            <button onClick={() => { setPrivacyDraft(privacySettings); setShowPrivacyModal(true); }}
              className="w-11 flex items-center justify-center border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors"
              title="공개 설정">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-3">
        <div className="flex border-b border-gray-100">
          <button onClick={() => setActiveTab('owned')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${activeTab === 'owned' ? 'text-gray-900' : 'text-gray-400'}`}>
            보유<span className="text-xs font-bold ml-1 opacity-70">({ownedGames.length})</span>
            {activeTab === 'owned' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />}
          </button>
          <button onClick={() => setActiveTab('wishlist')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${activeTab === 'wishlist' ? 'text-gray-900' : 'text-gray-400'}`}>
            위시<span className="text-xs font-bold ml-1 opacity-70">({wishlistGames.length})</span>
            {activeTab === 'wishlist' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />}
          </button>
          <button onClick={() => setActiveTab('posts')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${activeTab === 'posts' ? 'text-gray-900' : 'text-gray-400'}`}>
            게시물<span className="text-xs font-bold ml-1 opacity-70">({myPosts.length})</span>
            {activeTab === 'posts' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />}
          </button>
        </div>

        {/* 숙제 슬라이드 */}
        {hwCategories.length > 0 && (
          <div className="border-b border-gray-50 px-4 py-2">
            <p className="text-xs text-gray-400 font-medium mb-2">글 작성하고 상품도 받아보세요 : )</p>
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
              {/* 오른쪽: 제출 상태 버튼 */}
              {(() => {
                const submitted = myPosts.some(p => p.category === hwCategories[hwSlideIndex].name);
                return submitted ? (
                  <span className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 bg-green-100 text-green-700 rounded-xl">
                    ✅ 작성완료
                  </span>
                ) : (
                  <button
                    onClick={() => { setComposerCategory(hwCategories[hwSlideIndex].name); setShowComposer(true); }}
                    className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors">
                    작성하기
                  </button>
                );
              })()}
            </div>
          </div>
        )}

        {/* 서브탭 (posts 탭, 본인만) */}
        {activeTab === 'posts' && !readOnly && (
          <div className="px-4 py-2 border-b border-gray-50">
            {/* 내 글 / 저장한 글 서브탭 */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setPostsSubTab('mine')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${postsSubTab === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                내 글 ({myPosts.length})
              </button>
              <button onClick={() => setPostsSubTab('saved')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${postsSubTab === 'saved' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                저장한 글 ({savedPosts.length})
              </button>
            </div>
          </div>
        )}

        {/* 리스트 */}
        <div className="p-4">

          {/* 온보딩 카드 - 본인 페이지, 보유 0개, 게시물 0개일 때 */}
          {!readOnly && ownedGames.length === 0 && myPosts.length === 0 && activeTab === 'owned' && !postsLoading && (
            <div className="mb-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('openAddGameDialog'))}
                className="flex flex-col items-center gap-3 p-5 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900">보드게임 리스트 등록</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">보유한 보드게임을<br/>추가해보세요</p>
                </div>
              </button>
              <button
                onClick={() => setShowComposer(true)}
                className="flex flex-col items-center gap-3 p-5 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <PenLine className="w-6 h-6 text-gray-600" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900">첫 게시물 남기기</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">커뮤니티에 보드게임<br/>이야기를 공유해보세요</p>
                </div>
              </button>
            </div>
          )}

          {activeTab === 'owned' ? (
            ownedGames.length === 0
              ? <p className="text-center text-gray-400 text-sm py-8">보유 게임이 없어요</p>
              : <BoardGameList
                  games={ownedGames}
                  onGamesChange={onOwnedGamesChange || (() => {})}
                  listType="보유"
                  accessToken={accessToken}
                  userId={userId}
                  userEmail={userEmail}
                  onNavigateToWiki={onNavigateToWiki}
                />
          ) : activeTab === 'wishlist' ? (
            wishlistGames.length === 0
              ? <p className="text-center text-gray-400 text-sm py-8">위시리스트가 없어요</p>
              : <BoardGameList
                  games={wishlistGames}
                  onGamesChange={onWishlistGamesChange || (() => {})}
                  listType="구매 예정"
                  accessToken={accessToken}
                  onMoveToOwned={onMoveToOwned}
                  onNavigateToWiki={onNavigateToWiki}
                />
          ) : postsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
          ) : postsSubTab === 'saved' && !readOnly ? (
            savedPosts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-3xl mb-2">🔖</div>
                <p className="text-sm text-gray-400">저장한 글이 없어요</p>
                <p className="text-xs text-gray-400 mt-1">피드에서 북마크 버튼을 눌러 저장해보세요</p>
              </div>
            ) : (
              <div className="-mx-4">
                {savedPosts.slice(0, displayedPostsCount).map(post => (
                  <FeedCard
                    key={post.id}
                    post={post}
                    accessToken={accessToken}
                    userId={userId || ''}
                    userName={displayName}
                    myAvatarUrl={avatarUrl}
                    myRankPoints={userPoints}
                    onUpdate={loadMyPosts}
                    onFollowToggle={() => {}}
                    onOptimisticLike={(postId, uid) => setSavedPosts(prev => prev.map(p => {
                      if (p.id !== postId) return p;
                      const likes = p.likes || [];
                      return { ...p, likes: likes.includes(uid) ? likes.filter(id => id !== uid) : [...likes, uid] };
                    }))}
                    onOptimisticComment={(postId, comment) => setSavedPosts(prev => prev.map(p =>
                      p.id !== postId ? p : { ...p, comments: [...(p.comments || []), comment] }
                    ))}
                    onOptimisticDeleteComment={(commentId) => setSavedPosts(prev => prev.map(p => ({
                      ...p, comments: (p.comments || []).filter(c => c.id !== commentId)
                    })))}
                    bookmarkedPostIds={new Set(savedPosts.map(p => p.id))}
                    onBookmarkChange={(postId, bookmarked) => {
                      if (!bookmarked) setSavedPosts(prev => prev.filter(p => p.id !== postId));
                    }}
                  />
                ))}
                {savedPosts.length > displayedPostsCount && (
                  <div className="py-4 px-4 text-center">
                    <button onClick={() => setDisplayedPostsCount(prev => prev + 20)}
                      className="px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
                      더보기 ({savedPosts.length - displayedPostsCount}개 남음)
                    </button>
                  </div>
                )}
              </div>
            )
          ) : myPosts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">✏️</div>
              <p className="text-sm text-gray-400">{readOnly ? '아직 작성한 게시물이 없어요' : '아직 작성한 게시물이 없어요'}</p>
              {!readOnly && <p className="text-xs text-gray-400 mt-1">첫 번째 게시물을 작성해보세요!</p>}
            </div>
          ) : (
            <div className="-mx-4">
              {myPosts.slice(0, displayedPostsCount).map(post => (
                <FeedCard
                  key={post.id}
                  post={post}
                  accessToken={accessToken}
                  userId={userId || ''}
                  userName={displayName}
                  myAvatarUrl={avatarUrl}
                  myRankPoints={userPoints}
                  onUpdate={loadMyPosts}
                  onFollowToggle={() => {}}
                  onDelete={loadMyPosts}
                  onOptimisticDelete={(postId) => setMyPosts(prev => prev.filter(p => p.id !== postId))}
                  onOptimisticLike={(postId, uid) => setMyPosts(prev => prev.map(p => {
                    if (p.id !== postId) return p;
                    const likes = p.likes || [];
                    return { ...p, likes: likes.includes(uid) ? likes.filter(id => id !== uid) : [...likes, uid] };
                  }))}
                  onOptimisticComment={(postId, comment) => setMyPosts(prev => prev.map(p =>
                    p.id !== postId ? p : { ...p, comments: [...(p.comments || []), comment] }
                  ))}
                  onOptimisticDeleteComment={(commentId) => setMyPosts(prev => prev.map(p => ({
                    ...p, comments: (p.comments || []).filter(c => c.id !== commentId)
                  })))}
                />
              ))}
              {myPosts.length > displayedPostsCount && (
                <div className="py-4 px-4 text-center">
                  <button
                    onClick={() => setDisplayedPostsCount(prev => prev + 20)}
                    className="px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    더보기 ({myPosts.length - displayedPostsCount}개 남음)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 플레이 기록 섹션 */}
      {privacySettings.showPlayRecords && ownedGames.length > 0 && (() => {
        const totalPlays = ownedGames.reduce((s, g) => s + (g.playCount || 0), 0);
        const gamesWithPlays = ownedGames.filter(g => (g.playCount || 0) > 0).length;
        const totalMinutes = ownedGames.reduce((s, g) =>
          s + ((g.playRecords || []) as any[]).reduce((t: number, r: any) => t + (r.totalTime || 0), 0), 0);
        const topGames = [...ownedGames]
          .filter(g => (g.playCount || 0) > 0)
          .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
          .slice(0, 5);
        const maxPlay = topGames[0]?.playCount || 1;
        return (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-3">
            <div className="px-4 pt-4 pb-2 border-b border-gray-50">
              <p className="text-sm font-bold text-gray-900">🎮 플레이 기록</p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: '총 플레이', value: `${totalPlays}회` },
                  { label: '플레이한 게임', value: `${gamesWithPlays}개` },
                  { label: '총 플레이 시간', value: totalMinutes >= 60 ? `${Math.round(totalMinutes / 60)}시간` : `${totalMinutes}분` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                    <p className="text-base font-bold text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
              {topGames.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-gray-400">많이 플레이한 게임</p>
                  {topGames.map((g, i) => (
                    <div key={g.id} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4 text-center font-bold">{i + 1}</span>
                      {g.imageUrl
                        ? <img src={g.imageUrl} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-7 h-7 rounded-lg bg-gray-100 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{g.koreanName || g.englishName}</p>
                        <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full"
                            style={{ width: `${Math.round(((g.playCount || 0) / maxPlay) * 100)}%` }} />
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-gray-600 flex-shrink-0">{g.playCount}회</span>
                    </div>
                  ))}
                </div>
              )}
              {totalPlays === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">아직 플레이 기록이 없어요</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* 게임 관리 현황 섹션 */}
      {privacySettings.showGameManagement && ownedGames.length > 0 && (() => {
        const total = ownedGames.length;
        const sleeved = ownedGames.filter(g => g.hasSleeve).length;
        const stored = ownedGames.filter(g => g.hasStorage).length;
        const upgraded = ownedGames.filter(g => g.hasComponentUpgrade).length;
        const condition: Record<string, number> = { S: 0, A: 0, B: 0, C: 0 };
        ownedGames.forEach(g => { if (g.boxCondition && condition[g.boxCondition] !== undefined) condition[g.boxCondition]++; });
        const hasCondition = Object.values(condition).some(v => v > 0);
        return (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-3">
            <div className="px-4 pt-4 pb-2 border-b border-gray-50">
              <p className="text-sm font-bold text-gray-900">🔧 게임 관리 현황</p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: '슬리브 완료', done: sleeved },
                  { label: '박스 정리', done: stored },
                  { label: '컴포 업그레이드', done: upgraded },
                ].map(({ label, done }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                    <p className="text-base font-bold text-gray-900">{done}<span className="text-xs font-normal text-gray-400"> / {total}</span></p>
                    <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: total > 0 ? `${Math.round((done / total) * 100)}%` : '0%', backgroundColor: '#00C4CC' }} />
                    </div>
                  </div>
                ))}
              </div>
              {hasCondition && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-400 mb-2">박스 상태</p>
                  <div className="flex gap-2 flex-wrap">
                    {(['S', 'A', 'B', 'C'] as const).map(grade => condition[grade] > 0 && (
                      <span key={grade} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-700">
                        {grade}등급 {condition[grade]}개
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 숙제 현황 모달 */}
      {showHomeworkModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:w-[min(100vw-2rem,480px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">📚 숙제 현황</h2>
              <button onClick={() => setShowHomeworkModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {homeworkLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
              ) : !homeworkData || homeworkData.categories.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-sm text-gray-400">진행 중인 숙제가 없어요</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {homeworkData.categories.filter((c: any) => c.active).map((cat: any) => {
                    const sub = homeworkData.submissions.find((s: any) => s.categoryId === cat.id || s.categoryName === cat.name);
                    const done = !!sub;
                    const rewarded = sub?.rewardGranted;
                    return (
                      <div key={cat.id}
                        onClick={() => {
                          if (!done) {
                            setShowHomeworkModal(false);
                            setComposerCategory(cat.name);
                            setShowComposer(true);
                          }
                        }}
                        className={`rounded-xl border p-4 transition-all ${
                          done
                            ? 'border-green-200 bg-green-50'
                            : 'border-gray-200 bg-gray-50 cursor-pointer hover:border-orange-300 hover:bg-orange-50 active:scale-[0.98]'
                        }`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1">
                            <p className="font-bold text-gray-900 text-sm">📚 {cat.name}</p>
                            {(cat.startDate || cat.endDate) && (
                              <p className="text-xs text-blue-400 mt-0.5">📅 {cat.startDate ? cat.startDate.replace(/-/g, '.') : '?'} ~ {cat.endDate ? cat.endDate.replace(/-/g, '.') : '?'}</p>
                            )}
                            {cat.guideline && (
                              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{cat.guideline}</p>
                            )}
                            {/* 보상 표시 */}
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {cat.pointReward > 0 && (
                                <span className="text-xs text-amber-500 font-semibold">+{cat.pointReward}pt</span>
                              )}
                              {cat.prizeReward && (
                                <span className="text-xs text-purple-600 font-semibold">🎁 {cat.prizeReward}</span>
                              )}
                            </div>
                          </div>
                          <span className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded-full ${
                            rewarded ? 'bg-yellow-100 text-yellow-700' :
                            done ? 'bg-green-100 text-green-700' :
                            'bg-gray-200 text-gray-500'
                          }`}>
                            {rewarded ? '✅ 포인트 지급' : done ? '✅ 제출 완료' : '⏳ 미제출'}
                          </span>
                        </div>
                        {rewarded && (
                          <p className="text-xs text-yellow-600 font-semibold mt-1">🎉 +{sub.rewardAmount}pt 획득!</p>
                        )}
                        {done && sub.submittedAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(sub.submittedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 제출
                          </p>
                        )}
                        {!done && (
                          <p className="text-xs text-orange-400 font-medium mt-2">✏️ 눌러서 작성하기</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 팔로워/팔로잉 모달 */}
      {followModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:w-[min(100vw-2rem,420px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                {followModal.type === 'followers' ? '팔로워' : '팔로잉'}
              </h2>
              <button onClick={() => setFollowModal(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {followModalLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
              ) : followModal.users.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400">
                  {followModal.type === 'followers' ? '팔로워가 없어요' : '팔로잉이 없어요'}
                </div>
              ) : followModal.users.map(u => (
                <button key={u.userId}
                  onClick={() => {
                    setFollowModal(null);
                    window.open(`${window.location.origin}/shared/${u.userId}`, '_blank');
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {u.profileImage
                      ? <img src={u.profileImage} className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold text-gray-500">{u.username[0]?.toUpperCase()}</span>
                    }
                  </div>
                  <span className="font-semibold text-gray-900 text-sm">{u.username}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 등급 모달 */}
      {showRankModal && (
        <RankInfoModal
          onClose={() => setShowRankModal(false)}
          userPoints={userPoints.points}
          userPosts={userPoints.posts}
          userComments={userPoints.comments}
          userLikes={userPoints.likesReceived}
        />
      )}

      {/* 플레이 통계 모달 */}
      <PlayStatsModal
        open={showStatsModal}
        onOpenChange={setShowStatsModal}
        games={[...ownedGames, ...wishlistGames]}
      />

      {/* 글 작성 모달 */}
      {showComposer && (
        <PostComposer
          accessToken={accessToken}
          userId={userId || ''}
          userEmail={userEmail || ''}
          userProfile={{ username: displayName, profileImage: avatarUrl, staffLevel }}
          ownedGames={ownedGames}
          onClose={() => { setShowComposer(false); setComposerCategory(undefined); }}
          onPosted={() => {
            setShowComposer(false);
            setComposerCategory(undefined);
            loadMyPosts();
            toast.success('게시물이 등록되었습니다!');
          }}
          initialCategory={composerCategory}
        />
      )}

      {/* 프로필 편집 모달 */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:w-[min(100vw-2rem,480px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <button onClick={() => setShowEditModal(false)} className="text-sm text-gray-500">취소</button>
              <h2 className="text-base font-bold text-gray-900">프로필 편집</h2>
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-bold text-cyan-500 disabled:text-gray-300">
                {saving ? '저장중...' : '완료'}
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* 프로필 이미지 */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gray-100 overflow-hidden border-2 border-gray-200">
                    {formData.profileImage
                      ? <img src={formData.profileImage} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl">🎲</div>
                    }
                  </div>
                  <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center cursor-pointer">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Camera className="w-3.5 h-3.5 text-white" />}
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                </div>
              </div>
              {/* 이메일 (읽기 전용) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500">이메일</label>
                <div className="relative">
                  <input type="text" value={profile?.email || userEmail || ''}
                    readOnly
                    className="w-full border border-gray-100 rounded-xl px-4 py-2.5 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-300">변경불가</span>
                </div>
              </div>
              {/* 이름/닉네임 */}
              {[['이름','name','홍길동'],['닉네임','username','보드게임고수']].map(([label, field, ph]) => (
                <div key={field} className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500">
                    {label}
                    {field === 'username' && <span className="ml-1 text-cyan-500">· 글·댓글에 표시됩니다</span>}
                  </label>
                  <input type="text" value={(formData as any)[field]} onChange={e => setFormData(p => ({...p, [field]: e.target.value}))}
                    placeholder={ph}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-900" />
                </div>
              ))}
              {/* 소개 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-500">소개</label>
                  <span className={`text-xs ${formData.bio.length > 50 ? 'text-red-500' : 'text-gray-400'}`}>{formData.bio.length}/50</span>
                </div>
                <textarea value={formData.bio}
                  onChange={e => setFormData(p => ({...p, bio: e.target.value.slice(0, 50)}))}
                  placeholder="자기소개를 입력해주세요 (50자 이내)" rows={3}
                  maxLength={50}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-900 resize-none" />
              </div>
              {/* 좋아하는 게임 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500">좋아하는 게임</label>
                <input type="text" value={formData.favoriteGames} onChange={e => setFormData(p => ({...p, favoriteGames: e.target.value}))}
                  placeholder="아그리콜라, 브라스 버밍엄..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-900" />
              </div>
              {/* 비밀번호 변경 */}
              <div className="border-t border-gray-100 pt-4">
                <button onClick={() => setShowPwSection(!showPwSection)}
                  className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                  <Lock className="w-4 h-4" />
                  비밀번호 변경
                </button>
                {showPwSection && (
                  <div className="mt-3 space-y-3">
                    {(['current','next','confirm'] as const).map((field) => {
                      const labels = { current: '현재 비밀번호', next: '새 비밀번호', confirm: '새 비밀번호 확인' };
                      return (
                        <div key={field} className="relative">
                          <input type={showPw[field] ? 'text' : 'password'}
                            value={pwForm[field]} onChange={e => setPwForm(p => ({...p, [field]: e.target.value}))}
                            placeholder={labels[field]}
                            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-900 pr-10" />
                          <button onClick={() => setShowPw(p => ({...p, [field]: !p[field]}))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            {showPw[field] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      );
                    })}
                    <button onClick={handlePasswordChange} disabled={pwSaving}
                      className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold disabled:bg-gray-200">
                      {pwSaving ? '변경중...' : '비밀번호 변경'}
                    </button>
                  </div>
                )}
              </div>

              {/* 추천인 링크 */}
              <div className="border-t border-gray-100 pt-4">
                <button onClick={() => setShowReferralModal(true)}
                  className="flex items-center gap-2 text-sm text-cyan-500 font-medium hover:text-cyan-700 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                  내 추천 링크 공유
                </button>
                <p className="text-xs text-gray-400 mt-1">친구가 링크로 가입하면 보너스카드 3장!</p>
              </div>

              {/* 회원탈퇴 */}
              <div className="border-t border-gray-100 pt-4">
                <button onClick={() => setShowWithdrawModal(true)}
                  className="flex items-center gap-2 text-sm text-red-400 font-medium hover:text-red-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  회원탈퇴
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 회원탈퇴 확인 모달 */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-gray-900">정말 탈퇴하시겠어요?</h3>
            <p className="text-sm text-gray-500">탈퇴 시 모든 데이터(게임 컬렉션, 게시글, 댓글 등)가 삭제되며 복구할 수 없어요.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowWithdrawModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                취소
              </button>
              <button onClick={handleWithdraw} disabled={withdrawLoading}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 disabled:opacity-50">
                {withdrawLoading ? '처리중...' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 추천 링크 모달 */}
      {showReferralModal && (
        <ReferralLinkModal
          accessToken={accessToken}
          onClose={() => setShowReferralModal(false)}
        />
      )}

      {/* 공개 설정 모달 */}
      {showPrivacyModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowPrivacyModal(false)}>
          <div className="bg-white w-full sm:w-[min(100vw-2rem,480px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">프로필 공개 설정</h2>
              <button onClick={() => setShowPrivacyModal(false)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-2">
              <p className="text-xs text-gray-400 py-3">다른 사람이 내 프로필을 볼 때 표시되는 항목을 설정해요.</p>
              {([
                { key: 'showOwnedList', label: '보유 리스트 공개', sub: undefined, dep: undefined },
                { key: 'showOwnedTotal', label: '보유 리스트 금액 공개', sub: '보유 게임의 구매 금액을 공개해요', dep: 'showOwnedList' },
                { key: 'showWishList', label: '위시 리스트 공개', sub: undefined, dep: undefined },
                { key: 'showWishTotal', label: '위시 리스트 금액 공개', sub: '위시 게임의 구매 금액을 공개해요', dep: 'showWishList' },
                { key: 'showPlayRecords', label: '플레이 기록 공개', sub: undefined, dep: undefined },
                { key: 'showGameManagement', label: '게임 관리 현황 공개', sub: undefined, dep: undefined },
              ] as { key: keyof typeof privacyDraft; label: string; sub?: string; dep?: keyof typeof privacyDraft }[]).map(({ key, label, sub, dep }) => {
                const disabled = dep ? !privacyDraft[dep] : false;
                const checked = privacyDraft[key];
                return (
                  <div key={key} className={`flex items-center justify-between py-3.5 border-b border-gray-50 last:border-0 ${disabled ? 'opacity-40' : ''}`}>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
                    </div>
                    <button
                      onClick={() => { if (!disabled) setPrivacyDraft(prev => ({ ...prev, [key]: !prev[key] })); }}
                      disabled={disabled}
                      style={{ backgroundColor: checked ? '#00C4CC' : '#D1D5DB' }}
                      className="relative flex-shrink-0 w-12 h-7 rounded-full transition-colors duration-200">
                      <span style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
                        className="absolute top-[3px] w-[22px] h-[22px] bg-white rounded-full shadow-md transition-transform duration-200 block" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={() => savePrivacySettings(privacyDraft)}
                disabled={privacySaving}
                className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {privacySaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}