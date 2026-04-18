import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';

interface SyncOptions {
  accessToken: string;
  userId: string;
  onDataUpdate?: (data: { ownedGames: any[]; wishlistGames: any[] }) => void;
  pollingInterval?: number; // 기본 30초
  autoBackupInterval?: number; // 기본 5분
}

export function useSyncManager({
  accessToken,
  userId,
  onDataUpdate,
  pollingInterval = 30000, // 30초
  autoBackupInterval = 300000, // 5분
}: SyncOptions) {
  const pollingTimerRef = useRef<number | null>(null);
  const backupTimerRef = useRef<number | null>(null);
  const lastKnownTimestampRef = useRef<number>(0);
  const isSyncingRef = useRef<boolean>(false);

  // 서버 타임스탬프 확인 및 데이터 동기화
  const checkAndSync = useCallback(async () => {
    if (isSyncingRef.current) {
      console.log('🔄 [Sync] Already syncing, skipping...');
      return;
    }

    isSyncingRef.current = true;
    
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const tokenToUse = session?.access_token || accessToken;

      if (!tokenToUse) {
        console.warn('⚠️ [Sync] No access token available');
        return;
      }

      // 서버 동기화 상태 확인
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/sync-status`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Sync status check failed');
      }

      const syncStatus = await response.json();
      
      console.log('🔄 [Sync] Server timestamp:', syncStatus.timestamp, 'Local:', lastKnownTimestampRef.current);

      // 서버 데이터가 더 최신이면 데이터 가져오기
      if (syncStatus.timestamp > lastKnownTimestampRef.current) {
        console.log('📥 [Sync] Server has newer data, fetching...');
        
        const dataResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/load`,
          {
            headers: {
              Authorization: `Bearer ${tokenToUse}`,
            },
          }
        );

        if (dataResponse.ok) {
          const data = await dataResponse.json();
          
          lastKnownTimestampRef.current = syncStatus.timestamp;
          
          if (onDataUpdate) {
            onDataUpdate({
              ownedGames: data.ownedGames || [],
              wishlistGames: data.wishlistGames || [],
            });
          }

          console.log('✅ [Sync] Data updated from server');
          console.log(`   보유: ${data.ownedGames?.length || 0}개, 위시: ${data.wishlistGames?.length || 0}개`);
        }
      } else {
        console.log('✅ [Sync] Data is up to date');
      }
    } catch (error) {
      console.error('❌ [Sync] Error:', error);
      // 동기화 오류는 사용자에게 알리지 않음 (백그라운드 작업)
    } finally {
      isSyncingRef.current = false;
    }
  }, [accessToken, userId, onDataUpdate]);

  // 자동 백업 실행
  const performAutoBackup = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const tokenToUse = session?.access_token || accessToken;

      if (!tokenToUse) {
        return;
      }

      console.log('💾 [Auto Backup] Starting...');

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/auto-backup`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log('✅ [Auto Backup] Completed:', result);
        console.log(`   슬롯: ${result.slot}, 보유: ${result.ownedCount}개, 위시: ${result.wishlistCount}개`);
      }
    } catch (error) {
      console.error('❌ [Auto Backup] Error:', error);
    }
  }, [accessToken]);

  // 동기화 시작
  useEffect(() => {
    console.log('🚀 [Sync Manager] Starting sync manager...');
    console.log(`   폴링 간격: ${pollingInterval / 1000}초`);
    console.log(`   백업 간격: ${autoBackupInterval / 60000}분`);

    // 초기 동기화
    checkAndSync();

    // 폴링 타이머 설정
    pollingTimerRef.current = window.setInterval(() => {
      checkAndSync();
    }, pollingInterval);

    // 자동 백업 타이머 설정
    backupTimerRef.current = window.setInterval(() => {
      performAutoBackup();
    }, autoBackupInterval);

    // 클린업
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        console.log('🛑 [Sync Manager] Polling stopped');
      }
      if (backupTimerRef.current) {
        clearInterval(backupTimerRef.current);
        console.log('🛑 [Sync Manager] Auto backup stopped');
      }
    };
  }, [checkAndSync, performAutoBackup, pollingInterval, autoBackupInterval]);

  // 수동 동기화 함수
  const manualSync = useCallback(async () => {
    toast.info('데이터 동기화 중...', { duration: 2000 });
    await checkAndSync();
    toast.success('동기화 완료!', { duration: 2000 });
  }, [checkAndSync]);

  // 수동 백업 함수
  const manualBackup = useCallback(async () => {
    toast.info('데이터 백업 중...', { duration: 2000 });
    await performAutoBackup();
    toast.success('백업 완료!', { duration: 2000 });
  }, [performAutoBackup]);

  return {
    manualSync,
    manualBackup,
    checkAndSync,
  };
}
