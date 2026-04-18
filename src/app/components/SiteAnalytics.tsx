import { useState, useEffect } from 'react';
import { projectId } from '/utils/supabase/info';
import { toast } from 'sonner';
import { Loader2, Users, Activity, TrendingUp, Calendar } from 'lucide-react';
import { Button } from './ui/button';

interface AnalyticsStats {
  period: string;
  currentActiveUsers: number;
  uniqueVisitors: number;
  totalVisits: number;
  totalActions: number;
  dailyStats: Array<{
    date: string;
    uniqueVisitors: number;
    totalVisits: number;
  }>;
  actionStats: { [key: string]: number };
  recentActions: Array<{
    userId: string;
    userEmail: string;
    action: string;
    details?: any;
    timestamp: string;
  }>;
}

interface SiteAnalyticsProps {
  accessToken: string;
}

export function SiteAnalytics({ accessToken }: SiteAnalyticsProps) {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'24hours' | '7days' | '30days'>('7days');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadStats();

    // Auto refresh every 30 seconds if enabled
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadStats();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [accessToken, period, autoRefresh]);

  const loadStats = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/analytics/stats?period=${period}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        const error = await response.json();
        toast.error(error.error || '통계 조회 실패');
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
      toast.error('통계를 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
  };

  const getActionLabel = (action: string) => {
    const labels: { [key: string]: string } = {
      'game_add': '게임 추가',
      'game_remove': '게임 삭제',
      'game_edit': '게임 수정',
      'list_view': '리스트 조회',
      'search': '검색',
      'filter': '필터',
      'login': '로그인',
      'logout': '로그아웃',
    };
    return labels[action] || action;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-cyan-500" />
          <p className="text-gray-500 text-sm">통계 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>통계 데이터를 불러올 수 없습니다</p>
        <Button onClick={loadStats} variant="outline" size="sm" className="mt-4">
          다시 시도
        </Button>
      </div>
    );
  }

  // 안전성 체크: stats 객체의 필수 속성들이 있는지 확인
  const safeStats = {
    currentActiveUsers: stats.currentActiveUsers ?? 0,
    uniqueVisitors: stats.uniqueVisitors ?? 0,
    totalVisits: stats.totalVisits ?? 0,
    totalActions: stats.totalActions ?? 0,
    dailyStats: Array.isArray(stats.dailyStats) ? stats.dailyStats : [],
    actionStats: stats.actionStats && typeof stats.actionStats === 'object' ? stats.actionStats : {},
    recentActions: Array.isArray(stats.recentActions) ? stats.recentActions : [],
    period: stats.period || period,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">사이트 방문 통계</h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 border border-gray-300 rounded-lg p-1">
            {[
              { value: '24hours', label: '24시간' },
              { value: '7days', label: '7일' },
              { value: '30days', label: '30일' },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value as '24hours' | '7days' | '30days')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  period === p.value
                    ? 'bg-cyan-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            className={autoRefresh ? 'bg-cyan-500 hover:bg-cyan-600' : ''}
          >
            {autoRefresh ? '자동 새로고침 ON' : '자동 새로고침 OFF'}
          </Button>
          <Button onClick={loadStats} variant="outline" size="sm">
            새로고침
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-green-600" />
            <h3 className="text-sm font-medium text-green-900">실시간 접속자</h3>
          </div>
          <p className="text-3xl font-bold text-green-700">{safeStats.currentActiveUsers}</p>
          <p className="text-xs text-green-600 mt-1">현재 5분 이내 활동</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-medium text-blue-900">순방문자</h3>
          </div>
          <p className="text-3xl font-bold text-blue-700">{safeStats.uniqueVisitors}</p>
          <p className="text-xs text-blue-600 mt-1">
            {period === '24hours' ? '지난 24시간' : period === '7days' ? '지난 7일' : '지난 30일'}
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <h3 className="text-sm font-medium text-purple-900">총 방문</h3>
          </div>
          <p className="text-3xl font-bold text-purple-700">{safeStats.totalVisits}</p>
          <p className="text-xs text-purple-600 mt-1">전체 방문 수</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5 text-orange-600" />
            <h3 className="text-sm font-medium text-orange-900">유저 행동</h3>
          </div>
          <p className="text-3xl font-bold text-orange-700">{safeStats.totalActions}</p>
          <p className="text-xs text-orange-600 mt-1">기록된 행동 수</p>
        </div>
      </div>

      {/* Daily Stats Chart */}
      {safeStats.dailyStats.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-cyan-600" />
            <h3 className="text-lg font-semibold text-gray-900">일별 방문 통계</h3>
          </div>
          <div className="space-y-2">
            {safeStats.dailyStats.map((day) => {
              const maxVisits = Math.max(...safeStats.dailyStats.map((d) => d.totalVisits));
              const percentage = maxVisits > 0 ? (day.totalVisits / maxVisits) * 100 : 0;

              return (
                <div key={day.date} className="flex items-center gap-3">
                  <div className="w-20 text-sm text-gray-600">{formatDate(day.date)}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-400 to-cyan-600 h-full rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-3 text-sm font-medium">
                      <span className={percentage > 30 ? 'text-white' : 'text-gray-700'}>
                        순방문: {day.uniqueVisitors}명 / 총 방문: {day.totalVisits}회
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Stats */}
      {Object.keys(safeStats.actionStats).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-cyan-600" />
            <h3 className="text-lg font-semibold text-gray-900">유저 행동 통계</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(safeStats.actionStats)
              .sort(([, a], [, b]) => b - a)
              .map(([action, count]) => (
                <div key={action} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-sm text-gray-600 mb-1">{getActionLabel(action)}</p>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent Actions */}
      {safeStats.recentActions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-cyan-600" />
            <h3 className="text-lg font-semibold text-gray-900">최근 유저 행동</h3>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {safeStats.recentActions.map((action, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {getActionLabel(action.action)}
                    </p>
                    <p className="text-xs text-gray-500">{action.userEmail}</p>
                  </div>
                </div>
                <div className="text-xs text-gray-400">{formatTimestamp(action.timestamp)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}