import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { BarChart3, Users, UserCheck, Activity, Gamepad2, ShoppingCart, RefreshCw, ExternalLink, TrendingUp, Calendar, Database } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { BackupManagement } from './BackupManagement';

const devLog = (...args: any[]) => console.log('[Analytics]', ...args);
const devError = (...args: any[]) => console.error('[Analytics]', ...args);

// API 호출 함수
async function fetchAnalyticsData(accessToken: string): Promise<AnalyticsStats> {
  const url = `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/analytics/stats`;
  
  devLog('🌐 Fetching from:', url);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  devLog('📡 Response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    devError('❌ API Error:', errorText);
    throw new Error(`Failed to fetch analytics: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  devLog('📊 Raw API Response:', data);
  
  // 에러 응답 체크
  if (data.error) {
    throw new Error(data.error);
  }
  
  return data;
}

interface AnalyticsProps {
  accessToken: string | null;
}

interface AnalyticsStats {
  // 방문자 통계
  totalVisits: number;
  uniqueVisitors: number;
  todayVisitsCount: number;
  todayUniqueVisitors: number;
  // 사용자 통계
  totalUsers: number;
  approvedUsers: number;
  pendingUsers: number;
  todayUsersCount: number;
  // 게임 리스트 통계
  totalOwnedGames: number;
  totalWishlistGames: number;
  todayOwnedGames: number;
  todayWishlistGames: number;
}

export function Analytics({ accessToken }: AnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'stats' | 'backup'>('stats');

  const loadStats = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError(null);
      devLog('📊 Loading analytics data...');
      const data = await fetchAnalyticsData(accessToken);
      setStats(data);
      devLog('✅ Analytics data loaded:', data);
    } catch (err) {
      devError('❌ Failed to load analytics:', err);
      setError('통계 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [accessToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-[#00BCD4]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <Button onClick={loadStats} className="bg-[#00BCD4] hover:bg-[#00ACC1]">
          다시 시도
        </Button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-gray-500">
        통계 데이터가 없습니다.
      </div>
    );
  }

  // Safe defaults for stats
  const totalVisits = stats.totalVisits ?? 0;
  const uniqueVisitors = stats.uniqueVisitors ?? 0;
  const todayVisitsCount = stats.todayVisitsCount ?? 0;
  const todayUniqueVisitors = stats.todayUniqueVisitors ?? 0;
  
  const totalUsers = stats.totalUsers ?? 0;
  const approvedUsers = stats.approvedUsers ?? 0;
  const pendingUsers = stats.pendingUsers ?? 0;
  const todayUsersCount = stats.todayUsersCount ?? 0;
  
  const totalOwnedGames = stats.totalOwnedGames ?? 0;
  const totalWishlistGames = stats.totalWishlistGames ?? 0;
  const todayOwnedGames = stats.todayOwnedGames ?? 0;
  const todayWishlistGames = stats.todayWishlistGames ?? 0;

  // 통계 카드 데이터 구성
  const statCards = [
    // Row 1: 방문자 통계
    {
      icon: Activity,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      title: '전체 방문',
      value: totalVisits,
      todayValue: todayVisitsCount,
      description: '누적 페이지뷰',
    },
    {
      icon: Users,
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      title: '고유 방문자',
      value: uniqueVisitors,
      todayValue: todayUniqueVisitors,
      description: '순 방문자 수',
    },
    // Row 2: 가입자 통계
    {
      icon: Users,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      title: '전체 가입자',
      value: totalUsers,
      todayValue: todayUsersCount,
      description: '베타 신청자',
    },
    {
      icon: UserCheck,
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      title: '승인된 테스터',
      value: approvedUsers,
      todayValue: 0, // 승인은 오늘 통계 X
      description: '활성 사용자',
      hideToday: true,
    },
    // Row 3: 게임 통계
    {
      icon: Gamepad2,
      iconBg: 'bg-cyan-100',
      iconColor: 'text-cyan-600',
      title: '보유 게임',
      value: totalOwnedGames,
      todayValue: todayOwnedGames,
      description: '등록된 게임',
    },
    {
      icon: ShoppingCart,
      iconBg: 'bg-pink-100',
      iconColor: 'text-pink-600',
      title: '구매 예정',
      value: totalWishlistGames,
      todayValue: todayWishlistGames,
      description: '위시리스트',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-[#00BCD4]" />
          <h2 className="text-2xl font-bold">관리자 통계 대시보드</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => window.open('https://analytics.google.com', '_blank')}
            variant="outline"
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Google Analytics
          </Button>
          <Button 
            onClick={loadStats}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </Button>
        </div>
      </div>

      {/* Summary Cards - 6개 (2열 레이아웃) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div key={index} className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 ${card.iconBg} rounded-lg`}>
                    <Icon className={`w-5 h-5 ${card.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-600">{card.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{card.description}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-3xl font-bold text-gray-900">{card.value.toLocaleString()}</p>
                  {!card.hideToday && (
                    <div className="flex items-center gap-1 mt-1">
                      <Calendar className="w-3.5 h-3.5 text-[#00BCD4]" />
                      <span className="text-sm text-gray-600">
                        오늘: <span className="font-semibold text-[#00BCD4]">{card.todayValue.toLocaleString()}</span>
                      </span>
                    </div>
                  )}
                </div>
                {!card.hideToday && card.todayValue > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 rounded text-emerald-700">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">+{card.todayValue}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Additional Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 승인 대기 */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="text-sm font-medium text-orange-900">승인 대기 중</h3>
          </div>
          <p className="text-2xl font-bold text-orange-900">{pendingUsers.toLocaleString()}</p>
          <p className="text-sm text-orange-700 mt-1">검토가 필요한 신청</p>
        </div>

        {/* 총 게임 수 */}
        <div className="bg-gradient-to-br from-[#00BCD4] to-[#00ACC1] rounded-lg p-5 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/20 rounded-lg">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-sm font-medium">총 게임 수</h3>
          </div>
          <p className="text-2xl font-bold">{(totalOwnedGames + totalWishlistGames).toLocaleString()}</p>
          <p className="text-sm text-white/80 mt-1">보유 + 구매 예정 합계</p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <ExternalLink className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-blue-900 mb-1">📊 상세 분석</h3>
            <p className="text-sm text-blue-700 mb-2">
              Google Tag Manager (GTM-WWSC2GF2)를 통해 더 상세한 방문자 행동 분석이 수집됩니다. 
              사용자 흐름, 이탈률, 세션 시간 등의 심층 분석은 Google Analytics에서 확인하세요.
            </p>
            <Button 
              onClick={() => window.open('https://analytics.google.com', '_blank')}
              variant="link"
              className="text-blue-600 hover:text-blue-800 p-0 h-auto"
            >
              Google Analytics에서 상세 통계 보기 →
            </Button>
          </div>
        </div>
      </div>

      {/* Backup Management */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
          <div className="w-full">
            <h3 className="font-medium text-gray-900 mb-1">💾 백업 관리</h3>
            <p className="text-sm text-gray-700 mb-4">
              승인된 모든 베타 테스터의 데이터를 백업하고 다운로드할 수 있습니다.
            </p>
            <BackupManagement accessToken={accessToken} />
          </div>
        </div>
      </div>
    </div>
  );
}