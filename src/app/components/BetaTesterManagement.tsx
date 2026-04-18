import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { User, Mail, Phone, Calendar, Check, X, Loader2, Eye, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';
import { DataBackup } from './DataBackup';
import { SiteAnalytics } from './SiteAnalytics';
import type { BoardGame } from '../App';

interface BetaTester {
  userId: string;
  email: string;
  name: string;
  username: string;
  phone: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at?: string;
  rejection_reason?: string;
  // Game data counts
  ownedCount?: number;
  wishlistCount?: number;
  wikiCount?: number;
}

interface BetaTesterManagementProps {
  accessToken: string;
}

interface UserDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  accessToken: string;
}

function UserDataModal({ isOpen, onClose, userId, userName, accessToken }: UserDataModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [ownedGames, setOwnedGames] = useState<BoardGame[]>([]);
  const [wishlistGames, setWishlistGames] = useState<BoardGame[]>([]);
  const [activeTab, setActiveTab] = useState<'owned' | 'wishlist'>('owned');

  useEffect(() => {
    if (isOpen && userId) {
      loadUserData();
    }
  }, [isOpen, userId]);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/user-data/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setOwnedGames(data.ownedGames || []);
        setWishlistGames(data.wishlistGames || []);
      } else {
        throw new Error('Failed to load user data');
      }
    } catch (error) {
      console.error('Load user data error:', error);
      toast.error('사용자 데이터를 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{userName}님의 보드게임 리스트</h2>
            <p className="text-sm text-gray-500 mt-1">User ID: {userId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-gray-200 flex gap-2">
          <button
            onClick={() => setActiveTab('owned')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'owned'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            보유 리스트 ({ownedGames.length})
          </button>
          <button
            onClick={() => setActiveTab('wishlist')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'wishlist'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            구매예정 리스트 ({wishlistGames.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(activeTab === 'owned' ? ownedGames : wishlistGames).map((game) => (
                <Card key={game.id} className="overflow-hidden">
                  <div className="aspect-video relative bg-gray-100">
                    {game.imageUrl ? (
                      <img
                        src={game.imageUrl}
                        alt={game.koreanName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <span className="text-4xl">🎲</span>
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-gray-900 mb-1">{game.koreanName}</h3>
                    <p className="text-sm text-gray-600 mb-2">{game.englishName}</p>
                    <div className="space-y-1 text-xs text-gray-500">
                      <p>👥 {game.recommendedPlayers}</p>
                      <p>⏱️ {game.playTime}</p>
                      <p>📊 난이도: {game.difficulty}</p>
                      {game.rating && (
                        <p className="text-yellow-600 font-medium">⭐ {game.rating}/10</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {(activeTab === 'owned' ? ownedGames : wishlistGames).length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-500">
                  {activeTab === 'owned' ? '보유한 게임이 없습니다' : '구매 예정 게임이 없습니다'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <Button onClick={onClose} variant="outline">
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BetaTesterManagement({ accessToken }: BetaTesterManagementProps) {
  const [currentTab, setCurrentTab] = useState<'users' | 'analytics'>('users'); // ==================== NEW: Tab state ====================
  const [testers, setTesters] = useState<BetaTester[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<{ [key: string]: string }>({});
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);
  const [isCheckingData, setIsCheckingData] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isCheckingAllData, setIsCheckingAllData] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [myUserId, setMyUserId] = useState<string>('');
  const [myDataDebug, setMyDataDebug] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<{ userId: string; userName: string } | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'owned'>('date'); // 정렬 기준 state 추가

  useEffect(() => {
    loadTesters();
    loadMyUserId();
  }, []);

  const loadMyUserId = async () => {
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        setMyUserId(user.id);
        console.log('👤 [My User ID]:', user.id);
      }
    } catch (error) {
      console.error('Failed to get my user ID:', error);
    }
  };

  const debugMyData = async () => {
    if (!myUserId) {
      toast.error('User ID를 불러올 수 없습니다');
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const tokenToUse = session?.access_token || accessToken;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/debug-user/${myUserId}`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMyDataDebug(data);
        console.log('================================================');
        console.log('🔍 [MY DATA DEBUG]');
        console.log('================================================');
        console.log('User ID:', data.userId);
        console.log('Owned Count:', data.ownedCount);
        console.log('Wishlist Count:', data.wishlistCount);
        console.log('Owned Type:', data.ownedType);
        console.log('Wishlist Type:', data.wishlistType);
        console.log('Owned Is Array:', data.ownedIsArray);
        console.log('Wishlist Is Array:', data.wishlistIsArray);
        console.log('Last Modified:', data.lastModified);
        console.log('');
        console.log('Owned Data:', data.owned);
        console.log('Wishlist Data:', data.wishlist);
        console.log('================================================');

        toast.success(
          `내 데이터 확인 완료\n` +
          `보유: ${data.ownedCount}개\n` +
          `구매예정: ${data.wishlistCount}개\n` +
          `콘솔(F12)에서 상세 정보를 확인하세요`,
          { duration: 7000 }
        );
      } else {
        throw new Error('Failed to debug my data');
      }
    } catch (error) {
      console.error('Debug my data error:', error);
      toast.error('내 데이터 확인에 실패했습니다');
    }
  };

  const loadTesters = async () => {
    setIsLoading(true);
    try {
      // Get fresh session token
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      const tokenToUse = session?.access_token || accessToken;
      
      if (!tokenToUse) {
        throw new Error('인증 토큰이 없습니다. 다시 로그인해주세요.');
      }
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/beta-testers`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load beta testers');
      }

      const data = await response.json();
      console.log('📊 [Beta Testers] Received data:', data);
      console.log('📊 [Beta Testers] Testers with counts:', data.testers?.map((t: BetaTester) => ({
        name: t.name,
        userId: t.userId,
        ownedCount: t.ownedCount,
        wishlistCount: t.wishlistCount,
        wikiCount: t.wikiCount
      })));
      setTesters(data.testers || []);
    } catch (error) {
      console.error('Load beta testers error:', error);
      toast.error('베타 테스터 목록을 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    setProcessingId(userId);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/beta-testers/${userId}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            status: 'approved',
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to approve');
      }

      toast.success('승인되었습니다! 🎉');
      await loadTesters();
    } catch (error) {
      console.error('Approve error:', error);
      toast.error('승인에 실패했습니다');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId: string) => {
    const reason = rejectionReason[userId] || '';
    setProcessingId(userId);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/beta-testers/${userId}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            status: 'rejected',
            reason,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to reject');
      }

      toast.success('반려되었습니다');
      setShowRejectInput(null);
      setRejectionReason({ ...rejectionReason, [userId]: '' });
      await loadTesters();
    } catch (error) {
      console.error('Reject error:', error);
      toast.error('반려에 실패했습니다');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const checkDataIntegrity = async () => {
    setIsCheckingData(true);
    try {
      // Get fresh session token
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      const tokenToUse = session?.access_token || accessToken;
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/kv-keys`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Show detailed information
        console.log('📊 [Data Check] Full details:', data);
        
        toast.success(
          `📊 데이터 확인 완료\n` +
          `베타 신청자: ${data.betaUsersCount}명\n` +
          `게임 데이터가 있는 사용자: ${data.uniqueUserIdsWithData}명\n` +
          `총 데이터 키: ${data.userDataKeysCount}개`,
          { duration: 5000 }
        );
        
        // Show warning if there are users with game data but no beta application
        if (data.uniqueUserIdsWithData > data.betaUsersCount) {
          toast.warning(
            `⚠️ ${data.uniqueUserIdsWithData - data.betaUsersCount}명의 사용자가 게임 데이터는 있지만 베타 신청 정보가 없습니다.\n콘솔(F12)에서 상세 정보를 확인하세요.`,
            { duration: 7000 }
          );
        }
      } else {
        throw new Error('데이터 확인 실패');
      }
    } catch (error) {
      console.error('Check data error:', error);
      toast.error('데이터 확인에 실패했습니다');
    } finally {
      setIsCheckingData(false);
    }
  };

  const checkAllKVData = async () => {
    setIsCheckingAllData(true);
    try {
      // Get fresh session token
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      const tokenToUse = session?.access_token || accessToken;
      
      console.log('🔍 [KV All Data] Fetching ALL KV Store data...');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/kv-all`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        console.log('================================================');
        console.log('📋 [KV All Data] COMPLETE KV STORE DUMP');
        console.log('================================================');
        console.log(`Total entries: ${data.totalEntries}`);
        console.log(`Prefixes found: ${data.prefixes.join(', ')}`);
        console.log('');
        console.log('All data:');
        data.allData.forEach((item: any, index: number) => {
          console.log(`${index + 1}. KEY: ${item.key}`);
          console.log(`   VALUE:`, item.value);
          console.log('---');
        });
        console.log('');
        console.log('Keys by prefix:');
        console.log(data.keysByPrefix);
        console.log('================================================');
        
        toast.success(
          `🔍 전체 KV Store 조회 완료\n` +
          `총 ${data.totalEntries}개 엔트리\n` +
          `프리픽스: ${data.prefixes.join(', ')}\n` +
          `콘솔(F12)에서 상세 정보를 확인하세요`,
          { duration: 7000 }
        );
      } else {
        throw new Error('전체 데이터 조회 실패');
      }
    } catch (error) {
      console.error('Check all KV data error:', error);
      toast.error('전체 데이터 조회에 실패했습니다');
    } finally {
      setIsCheckingAllData(false);
    }
  };

  const migrateUsers = async () => {
    if (!confirm('게임 데이터가 있지만 베타 신청 정보가 없는 사용자들을 자동으로 마이그레이션하시겠습니까?\n\n해당 사용자들은 자동으로 "승인됨" 상태로 등록됩니다.')) {
      return;
    }

    setIsMigrating(true);
    try {
      // Get fresh session token
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      const tokenToUse = session?.access_token || accessToken;
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/migrate-users`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '마이그레이션 실패');
      }

      const result = await response.json();
      
      console.log('🔄 [Migration] Result:', result);
      
      if (result.migratedCount > 0) {
        toast.success(
          `✅ 마이그레이션 완료!\n` +
          `총 unique 사용자 ID: ${result.totalUniqueUserIds}개\n` +
          `기존 베타 사용자: ${result.existingBetaUsers}명\n` +
          `새로 마이그레이션: ${result.migratedCount}명\n` +
          `건너뜀: ${result.skippedCount}명\n` +
          `실패: ${result.failedCount}명`,
          { duration: 10000 }
        );
      } else if (result.skippedCount > 0) {
        toast.info(
          `ℹ️ 마이그레이션 완료\n` +
          `모든 사용자가 이미 등록되어 있습니다.\n` +
          `총 ${result.existingBetaUsers}명`,
          { duration: 7000 }
        );
      } else {
        toast.info(
          `ℹ️ 마이그레이션 완료\n` +
          `새로 추가할 사용자가 없습니다.`,
          { duration: 5000 }
        );
      }
      
      // Reload testers list
      await loadTesters();
      
      // Show detailed logs
      console.log('📋 [Migration] All KV keys found:', result.allKeys);
      
      // Show migrated users
      if (result.migratedUsers && result.migratedUsers.length > 0) {
        console.log('✅ [Migration] Migrated users:', result.migratedUsers);
      }
      
      if (result.skippedUsers && result.skippedUsers.length > 0) {
        console.log('ℹ️ [Migration] Skipped users:', result.skippedUsers);
      }
      
      if (result.failedUsers && result.failedUsers.length > 0) {
        console.warn('⚠️ [Migration] Failed users:', result.failedUsers);
      }
    } catch (error) {
      console.error('Migration error:', error);
      toast.error('마이그레이션에 실패했습니다');
    } finally {
      setIsMigrating(false);
    }
  };

  const pendingTesters = testers.filter((t) => t.status === 'pending');
  const approvedTesters = testers.filter((t) => t.status === 'approved');
  const rejectedTesters = testers.filter((t) => t.status === 'rejected');

  // 정렬 함수
  const getSortedTesters = (testersToSort: BetaTester[]) => {
    const sorted = [...testersToSort];
    
    switch (sortBy) {
      case 'name':
        // 가나다 순 (한글 이름 기준)
        return sorted.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
      
      case 'date':
        // 가입 순서 (가장 오래된 순)
        return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      case 'owned':
        // 보유수 많은 순
        return sorted.sort((a, b) => (b.ownedCount || 0) - (a.ownedCount || 0));
      
      default:
        return sorted;
    }
  };

  const sortedApprovedTesters = getSortedTesters(approvedTesters);

  if (isLoading && currentTab === 'users') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ==================== NEW: Tab Navigation ==================== */}
      <div className="bg-white border border-gray-200 rounded-lg p-1 flex gap-1">
        <button
          onClick={() => setCurrentTab('users')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            currentTab === 'users'
              ? 'bg-cyan-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          👥 가입자 관리
        </button>
        <button
          onClick={() => setCurrentTab('analytics')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            currentTab === 'analytics'
              ? 'bg-cyan-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          📊 사이트 방문 통계
        </button>
      </div>

      {/* ==================== Analytics Tab (NEW) ==================== */}
      {currentTab === 'analytics' && (
        <SiteAnalytics accessToken={accessToken} />
      )}

      {/* ==================== Users Tab (Existing Code) ==================== */}
      {currentTab === 'users' && (
        <>
          {/* 📦 데이터 백업 도구 */}
          <DataBackup accessToken={accessToken} />
          
          <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">가입자 목록 및 관리</h2>
          <p className="text-sm text-gray-600 mt-1">베타 테스터 신청 현황을 확인하고 승인/반려할 수 있습니다</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={debugMyData}
            variant="outline"
            size="sm"
            className="bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
          >
            🔍 내 데이터 확인
          </Button>
          <Button
            onClick={checkDataIntegrity}
            variant="outline"
            size="sm"
            disabled={isCheckingData}
          >
            {isCheckingData ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              '📊 '
            )}
            데이터 확인
          </Button>
          <Button
            onClick={checkAllKVData}
            variant="outline"
            size="sm"
            disabled={isCheckingAllData}
          >
            {isCheckingAllData ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              '🔍 '
            )}
            전체 데이터 조회
          </Button>
          <Button
            onClick={migrateUsers}
            variant="outline"
            size="sm"
            disabled={isMigrating}
          >
            {isMigrating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              '🔄 '
            )}
            사용자 마이그레이션
          </Button>
          <div className="flex gap-4 text-sm">
            <span className="text-yellow-600 font-medium">대기: {pendingTesters.length}</span>
            <span className="text-green-600 font-medium">승인: {approvedTesters.length}</span>
            <span className="text-red-600 font-medium">반려: {rejectedTesters.length}</span>
          </div>
        </div>
      </div>

      {/* Pending Testers */}
      {pendingTesters.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">승인 대기 중 ({pendingTesters.length})</h3>
          <div className="space-y-4">
            {pendingTesters.map((tester) => (
              <Card key={tester.userId} className="border-yellow-200 bg-yellow-50">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="w-5 h-5 text-gray-600" />
                        <span className="font-semibold text-lg text-gray-900">{tester.name}</span>
                        <span className="px-2 py-1 text-xs font-medium bg-yellow-200 text-yellow-800 rounded">
                          대기중
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Mail className="w-4 h-4" />
                          <span>{tester.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Phone className="w-4 h-4" />
                          <span>{tester.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(tester.created_at)}</span>
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-1">신청 이유</p>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{tester.reason || '(작성 안함)'}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {showRejectInput === tester.userId ? (
                        <div className="space-y-2 min-w-[200px]">
                          <input
                            type="text"
                            placeholder="반려 사유 (선택)"
                            value={rejectionReason[tester.userId] || ''}
                            onChange={(e) =>
                              setRejectionReason({
                                ...rejectionReason,
                                [tester.userId]: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleReject(tester.userId)}
                              size="sm"
                              variant="destructive"
                              disabled={processingId === tester.userId}
                              className="flex-1"
                            >
                              {processingId === tester.userId ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                '확인'
                              )}
                            </Button>
                            <Button
                              onClick={() => setShowRejectInput(null)}
                              size="sm"
                              variant="outline"
                              disabled={processingId === tester.userId}
                              className="flex-1"
                            >
                              취소
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Button
                            onClick={() => handleApprove(tester.userId)}
                            size="sm"
                            disabled={processingId === tester.userId}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {processingId === tester.userId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="w-4 h-4 mr-1" /> 승인
                              </>
                            )}
                          </Button>
                          <Button
                            onClick={() => setShowRejectInput(tester.userId)}
                            size="sm"
                            variant="destructive"
                            disabled={processingId === tester.userId}
                          >
                            <X className="w-4 h-4 mr-1" /> 반려
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Approved Testers */}
      {approvedTesters.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">승인됨 ({approvedTesters.length})</h3>
            
            {/* 정렬 드롭다운 */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-gray-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'owned')}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
              >
                <option value="date">가입 순서</option>
                <option value="name">가나다 순</option>
                <option value="owned">보유수 많은 순</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedApprovedTesters.map((tester) => (
              <Card key={tester.userId} className="border-green-200 bg-green-50">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{tester.name}</span>
                      <span className="px-2 py-1 text-xs font-medium bg-green-200 text-green-800 rounded">
                        승인
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 break-all">{tester.email}</p>
                    
                    {/* 게임 데이터 수량 표시 */}
                    <div className="pt-2 border-t border-green-200">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white rounded-lg p-2">
                          <div className="text-lg font-bold text-cyan-600">{tester.ownedCount || 0}</div>
                          <div className="text-xs text-gray-600">보유</div>
                        </div>
                        <div className="bg-white rounded-lg p-2">
                          <div className="text-lg font-bold text-purple-600">{tester.wishlistCount || 0}</div>
                          <div className="text-xs text-gray-600">구매예정</div>
                        </div>
                        <div className="bg-white rounded-lg p-2">
                          <div className="text-lg font-bold text-orange-600">{tester.wikiCount || 0}</div>
                          <div className="text-xs text-gray-600">보드위키</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* 보유 리스트 보기 버튼 */}
                    <Button
                      onClick={() => setSelectedUser({ userId: tester.userId, userName: tester.name })}
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      보유 리스트 보기
                    </Button>
                    
                    <p className="text-xs text-gray-500 pt-2">{formatDate(tester.created_at)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Rejected Testers */}
      {rejectedTesters.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">반려됨 ({rejectedTesters.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rejectedTesters.map((tester) => (
              <Card key={tester.userId} className="border-red-200 bg-red-50">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{tester.name}</span>
                      <span className="px-2 py-1 text-xs font-medium bg-red-200 text-red-800 rounded">
                        반려
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{tester.email}</p>
                    {tester.rejection_reason && (
                      <p className="text-xs text-red-600">사유: {tester.rejection_reason}</p>
                    )}
                    <p className="text-xs text-gray-500">{formatDate(tester.created_at)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {testers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">아직 신청한 베타 테스터가 없습니다</p>
        </div>
      )}
      
      {/* User Data Modal */}
      {selectedUser && (
        <UserDataModal
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          userId={selectedUser.userId}
          userName={selectedUser.userName}
          accessToken={accessToken}
        />
      )}
        </>
      )}
    </div>
  );
}