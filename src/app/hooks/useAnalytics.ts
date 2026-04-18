import { useEffect, useRef } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const devLog = (...args: any[]) => console.log('[Analytics]', ...args);
const devError = (...args: any[]) => console.error('[Analytics]', ...args);

interface VisitData {
  timestamp: number;
  userId: string;
  userEmail: string | null;
  sessionId: string;
  pathname: string;
  userAgent: string;
  isAnonymous: boolean; // ==================== NEW: 익명 사용자 플래그 ====================
}

/**
 * 사용자 방문을 트래킹하는 훅
 * - 모든 사용자 트래킹 (로그인/익명 모두) ==================== UPDATED ====================
 * - 익명 사용자는 localStorage에 고유 ID 저장
 * - 세션당 1번만 기록 (중복 방지)
 */
export function useAnalytics(
  userId: string | null,
  userEmail: string | null,
  accessToken: string | null
) {
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    // 이미 트래킹했으면 스킵
    if (hasTrackedRef.current) {
      return;
    }

    // ==================== REMOVED: 로그인 체크 제거 (익명 사용자도 트래킹) ====================

    // 방문 기록
    const trackVisit = async () => {
      try {
        // 세션 ID 생성 (브라우저 세션당 고유)
        let sessionId = sessionStorage.getItem('analytics_session_id');
        if (!sessionId) {
          sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          sessionStorage.setItem('analytics_session_id', sessionId);
        }

        // ==================== NEW: 익명 사용자 ID 생성/조회 ====================
        let anonymousId = localStorage.getItem('anonymous_user_id');
        if (!anonymousId) {
          anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          localStorage.setItem('anonymous_user_id', anonymousId);
        }

        const isAnonymous = !userId;
        const visitData: VisitData = {
          timestamp: Date.now(),
          userId: userId || anonymousId, // ==================== UPDATED: 익명 ID 사용 ====================
          userEmail: userEmail || null,
          sessionId,
          pathname: window.location.pathname,
          userAgent: navigator.userAgent,
          isAnonymous, // ==================== NEW ====================
        };

        devLog('📊 Recording visit:', visitData);

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/analytics/visit`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken || publicAnonKey}`, // ==================== UPDATED: 익명은 public key ====================
            },
            body: JSON.stringify(visitData),
          }
        );

        if (response.ok) {
          devLog('✅ Visit recorded successfully');
          hasTrackedRef.current = true;
        } else {
          const error = await response.text();
          devError('❌ Failed to record visit:', response.status, error);
        }
      } catch (error) {
        devError('❌ Error recording visit:', error);
      }
    };

    trackVisit();
  }, [userId, userEmail, accessToken]);
}

/**
 * 관리자용 통계 데이터 조회 함수
 */
export async function fetchAnalyticsData(accessToken: string) {
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/analytics/stats`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch analytics: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    devError('❌ Error fetching analytics:', error);
    throw error;
  }
}