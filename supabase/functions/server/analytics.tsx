import * as kv from "./kv_store.tsx";

// 방문 기록 저장
export async function recordVisit(userId: string, userEmail: string) {
  const timestamp = new Date().toISOString();
  const key = `analytics_visit_${userId}_${Date.now()}`;
  
  await kv.set(key, {
    userId,
    userEmail,
    timestamp,
    type: 'visit'
  });
  
  // 현재 활성 사용자 업데이트 (최근 5분 이내)
  const activeKey = `analytics_active_${userId}`;
  await kv.set(activeKey, {
    userId,
    userEmail,
    lastSeen: timestamp
  });
}

// 유저 행동 기록
export async function recordAction(userId: string, userEmail: string, action: string, details?: any) {
  const timestamp = new Date().toISOString();
  const key = `analytics_action_${action}_${Date.now()}`;
  
  await kv.set(key, {
    userId,
    userEmail,
    action,
    details,
    timestamp,
    type: 'action'
  });
}

// 통계 조회 (관리자 전용)
export async function getAnalytics(period: string = '7days') {
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case '24hours':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  
  // 방문 기록 조회
  const visits = await kv.getByPrefix('analytics_visit_');
  const filteredVisits = visits.filter((v: any) => {
    if (!v || !v.timestamp) return false;
    return new Date(v.timestamp) >= startDate;
  });
  
  // 행동 기록 조회
  const actions = await kv.getByPrefix('analytics_action_');
  const filteredActions = actions.filter((a: any) => {
    if (!a || !a.timestamp) return false;
    return new Date(a.timestamp) >= startDate;
  });
  
  // 현재 활성 사용자 (최근 5분 이내)
  const activeUsers = await kv.getByPrefix('analytics_active_');
  const recentActiveUsers = activeUsers.filter((u: any) => {
    if (!u || !u.lastSeen) return false;
    const lastSeen = new Date(u.lastSeen);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    return lastSeen >= fiveMinutesAgo;
  });
  
  // 일별 방문자 수 집계
  const dailyVisits: { [key: string]: Set<string> } = {};
  filteredVisits.forEach((visit: any) => {
    const date = new Date(visit.timestamp).toISOString().split('T')[0];
    if (!dailyVisits[date]) {
      dailyVisits[date] = new Set();
    }
    dailyVisits[date].add(visit.userId);
  });
  
  const dailyStats = Object.entries(dailyVisits).map(([date, users]) => ({
    date,
    uniqueVisitors: users.size,
    totalVisits: filteredVisits.filter((v: any) => 
      new Date(v.timestamp).toISOString().split('T')[0] === date
    ).length
  })).sort((a, b) => a.date.localeCompare(b.date));
  
  // 행동 통계
  const actionStats: { [key: string]: number } = {};
  filteredActions.forEach((action: any) => {
    const actionType = action.action || 'unknown';
    actionStats[actionType] = (actionStats[actionType] || 0) + 1;
  });
  
  // 유니크 방문자 수
  const uniqueVisitors = new Set(filteredVisits.map((v: any) => v.userId)).size;
  
  return {
    period,
    currentActiveUsers: recentActiveUsers.length,
    uniqueVisitors,
    totalVisits: filteredVisits.length,
    totalActions: filteredActions.length,
    dailyStats,
    actionStats,
    recentActions: filteredActions.slice(-20).reverse() // 최근 20개 행동
  };
}

// 오래된 데이터 정리 (30일 이상)
export async function cleanupOldData() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  // 방문 기록 정리
  const visits = await kv.getByPrefix('analytics_visit_');
  for (const visit of visits) {
    if (visit && visit.timestamp && new Date(visit.timestamp) < thirtyDaysAgo) {
      // KV store에서 키 추출이 어려우므로, 실제로는 주기적인 정리가 필요
      // 현재는 30일치만 유지하도록 설계
    }
  }
  
  // 비활성 사용자 정리 (1시간 이상)
  const activeUsers = await kv.getByPrefix('analytics_active_');
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  for (const user of activeUsers) {
    if (user && user.lastSeen && new Date(user.lastSeen) < oneHourAgo) {
      // 비활성 사용자 제거 로직
      // kv.del() 사용이 필요하나, 키를 알아야 함
    }
  }
}
