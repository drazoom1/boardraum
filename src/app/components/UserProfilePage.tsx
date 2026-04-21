import { useState, useEffect } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { BoardGameList } from './BoardGameList';
import { ChessRankBadge } from './ChessRankBadge';
import { getRankByStats } from './chessRank';
import type { BoardGame } from '../App';

interface UserProfilePageProps {
  targetUserId: string;
  accessToken: string;
  onBack: () => void;
}

export function UserProfilePage({ targetUserId, accessToken, onBack }: UserProfilePageProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{
    userName: string;
    profileImage: string | null;
    games: BoardGame[];
    wishlistGames: BoardGame[];
    bio: string | null;
    posts: any[];
  } | null>(null);
  const [privacy, setPrivacy] = useState<{ showOwnedList: boolean; showWishList: boolean; showPlayRecords: boolean; showGameManagement: boolean } | null>(null);
  const [playStats, setPlayStats] = useState<any>(null);
  const [managementStats, setManagementStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'owned' | 'wishlist' | 'posts'>('owned');
  const [points, setPoints] = useState({ points: 0, posts: 0, comments: 0, likesReceived: 0 });
  const [followStats, setFollowStats] = useState({ followerCount: 0, followingCount: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // 프로필 + 게임 목록
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/shared/${targetUserId}`,
          { headers: { Authorization: `Bearer ${accessToken || publicAnonKey}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setProfile({
            userName: data.userName,
            profileImage: data.profileImage,
            games: data.games || [],
            wishlistGames: data.wishlistGames || [],
            bio: data.bio || null,
            posts: data.posts || [],
          });
          if (data.privacy) setPrivacy(data.privacy);
          if (data.playStats) setPlayStats(data.playStats);
          if (data.managementStats) setManagementStats(data.managementStats);
        }

        // 포인트
        const ptRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/points/${targetUserId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (ptRes.ok) setPoints(await ptRes.json());

        // 팔로우 통계
        const fsRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/follow/stats/${targetUserId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (fsRes.ok) {
          const fs = await fsRes.json();
          setFollowStats({ followerCount: fs.followerCount || 0, followingCount: fs.followingCount || 0 });
          setIsFollowing(fs.isFollowing || false);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [targetUserId, accessToken]);

  const toggleFollow = async () => {
    setFollowLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/follow/${targetUserId}`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.following);
        setFollowStats(prev => ({
          ...prev,
          followerCount: prev.followerCount + (data.following ? 1 : -1),
        }));
      }
    } catch {}
    setFollowLoading(false);
  };

  const openFollowModal = (type: 'followers' | 'following') => {
    // 팔로워/팔로잉 모달 열기 로직 구현
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-3 px-1">
          <ArrowLeft className="w-4 h-4" /> 피드로
        </button>
        <div className="bg-white rounded-2xl shadow-sm flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-3 px-1">
          <ArrowLeft className="w-4 h-4" /> 피드로
        </button>
        <div className="bg-white rounded-2xl shadow-sm text-center py-16 text-gray-400 text-sm">
          프로필을 불러올 수 없어요
        </div>
      </div>
    );
  }

  const rank = getRankByStats(points.points, points.posts, points.comments, points.likesReceived);

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {/* 뒤로가기 */}
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 px-1 transition-colors">
        <ArrowLeft className="w-4 h-4" /> 피드로
      </button>

      {/* 프로필 카드 */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xl font-bold text-gray-900">{profile.userName}</p>
              <ChessRankBadge rank={rank} showLabel={true} />
            </div>
            {/* 소개글 */}
            {profile.bio && (
              <p className="text-sm text-gray-600 mb-3 leading-relaxed">{profile.bio}</p>
            )}

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
            </div>
          </div>
          {/* 프로필 이미지 */}
          <div className="w-16 h-16 rounded-full bg-gray-100 flex-shrink-0 ml-4 overflow-hidden border-2 border-gray-100">
            {profile.profileImage
              ? <img src={profile.profileImage} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-400">
                  {profile.userName[0]?.toUpperCase()}
                </div>
            }
          </div>
        </div>

        {/* 팔로우 버튼 */}
        <button onClick={toggleFollow} disabled={followLoading}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            isFollowing
              ? 'border border-gray-200 text-gray-700 hover:bg-gray-50'
              : 'bg-gray-900 text-white hover:bg-gray-700'
          }`}>
          {followLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : isFollowing ? '팔로잉' : '팔로우'}
        </button>
      </div>

      {/* 탭 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button onClick={() => setActiveTab('owned')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${activeTab === 'owned' ? 'text-gray-900' : 'text-gray-400'}`}>
            보유<span className="text-xs font-bold ml-1 opacity-70">({profile.games.length})</span>
            {activeTab === 'owned' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />}
          </button>
          <button onClick={() => setActiveTab('wishlist')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${activeTab === 'wishlist' ? 'text-gray-900' : 'text-gray-400'}`}>
            위시<span className="text-xs font-bold ml-1 opacity-70">({profile.wishlistGames.length})</span>
            {activeTab === 'wishlist' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />}
          </button>
          <button onClick={() => setActiveTab('posts')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors relative ${activeTab === 'posts' ? 'text-gray-900' : 'text-gray-400'}`}>
            게시물<span className="text-xs font-bold ml-1 opacity-70">({(profile.posts || []).length})</span>
            {activeTab === 'posts' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full" />}
          </button>
        </div>

        <div className="p-4">
          {activeTab === 'owned' && (
            privacy?.showOwnedList === false
              ? <p className="text-center text-gray-400 text-sm py-8">🔒 비공개 설정된 리스트예요</p>
              : profile.games.length === 0
                ? <p className="text-center text-gray-400 text-sm py-8">보유 게임이 없어요</p>
                : <BoardGameList
                    games={profile.games}
                    onGamesChange={() => {}}
                    listType="보유"
                    accessToken={accessToken}
                    readOnly={true}
                  />
          )}
          {activeTab === 'wishlist' && (
            privacy?.showWishList === false
              ? <p className="text-center text-gray-400 text-sm py-8">🔒 비공개 설정된 리스트예요</p>
              : profile.wishlistGames.length === 0
                ? <p className="text-center text-gray-400 text-sm py-8">위시리스트가 없어요</p>
                : <BoardGameList
                    games={profile.wishlistGames}
                    onGamesChange={() => {}}
                    listType="구매 예정"
                    accessToken={accessToken}
                    readOnly={true}
                  />
          )}
          {activeTab === 'posts' && (
            (profile.posts || []).length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                <p>아직 작성한 게시물이 없어요</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {(profile.posts || []).map((post: any) => (
                  <div key={post.id} className="py-3 px-1">
                    <div className="flex gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
                        {profile.profileImage
                          ? <img src={profile.profileImage} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-500">{profile.userName[0]}</div>
                        }
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-800">{profile.userName}</p>
                        <p className="text-xs text-gray-400">{new Date(post.createdAt).toLocaleDateString('ko-KR')}</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap px-1">{post.content}</p>
                    {post.images?.length > 0 && (
                      <img src={post.images[0]} className="mt-2 w-full object-cover rounded-xl max-h-60" />
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* 플레이 기록 섹션 */}
      {playStats && privacy?.showPlayRecords && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-900">🎮 플레이 기록</p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: '총 플레이', value: `${playStats.totalPlays}회` },
                { label: '플레이한 게임', value: `${playStats.gamesWithPlays}개` },
                { label: '총 플레이 시간', value: playStats.totalMinutes >= 60 ? `${Math.round(playStats.totalMinutes / 60)}시간` : `${playStats.totalMinutes}분` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                  <p className="text-base font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
            {playStats.topGames?.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-gray-400">많이 플레이한 게임</p>
                {playStats.topGames.map((g: any, i: number) => {
                  const maxPlay = playStats.topGames[0]?.playCount || 1;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4 text-center font-bold">{i + 1}</span>
                      {g.imageUrl
                        ? <img src={g.imageUrl} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-7 h-7 rounded-lg bg-gray-100 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{g.name}</p>
                        <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full"
                            style={{ width: `${Math.round((g.playCount / maxPlay) * 100)}%` }} />
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-gray-600 flex-shrink-0">{g.playCount}회</span>
                    </div>
                  );
                })}
              </div>
            )}
            {playStats.totalPlays === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">아직 플레이 기록이 없어요</p>
            )}
          </div>
        </div>
      )}

      {/* 게임 관리 현황 섹션 */}
      {managementStats && privacy?.showGameManagement && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-900">🔧 게임 관리 현황</p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: '슬리브 완료', done: managementStats.sleeved },
                { label: '박스 정리', done: managementStats.stored },
                { label: '컴포 업그레이드', done: managementStats.upgraded },
              ].map(({ label, done }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                  <p className="text-base font-bold text-gray-900">{done}<span className="text-xs font-normal text-gray-400"> / {managementStats.total}</span></p>
                  <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: managementStats.total > 0 ? `${Math.round((done / managementStats.total) * 100)}%` : '0%', backgroundColor: '#00C4CC' }} />
                  </div>
                </div>
              ))}
            </div>
            {Object.values(managementStats.condition as Record<string, number>).some(v => v > 0) && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-400 mb-2">박스 상태</p>
                <div className="flex gap-2 flex-wrap">
                  {(['S', 'A', 'B', 'C'] as const).map(grade => managementStats.condition[grade] > 0 && (
                    <span key={grade} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-700">
                      {grade}등급 {managementStats.condition[grade]}개
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}