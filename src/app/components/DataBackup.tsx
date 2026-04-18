import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Loader2, Database, Download, Clock, HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';

interface BackupData {
  slot: string;
  timestamp: number;
  ownedCount: number;
  wishlistCount: number;
  playRecordsCount: number;
  key: string; // 백업 키 추가
}

interface DataBackupProps {
  accessToken: string;
}

export function DataBackup({ accessToken }: DataBackupProps) {
  const [backups, setBackups] = useState<BackupData[]>([]);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const tokenToUse = session?.access_token || accessToken;

      if (!tokenToUse) {
        console.error('❌ [Backup] No access token available');
        toast.error('인증 토큰이 없습니다. 다시 로그인해주세요.');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/backups`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('📋 [Backup] Loaded backups:', data);
        
        // 에러가 있어도 빈 배열로 처리 (서버가 200 + error 반환하는 경우)
        if (data.error) {
          console.warn('⚠️ [Backup] Server returned error with 200:', data.error);
          setBackups([]);
        } else {
          setBackups(data.backups || []);
        }
      } else {
        const errorData = await response.json();
        console.error('❌ [Backup] Failed to load backups:', response.status, errorData);
        setBackups([]); // 에러 시 빈 배열
        if (response.status === 401) {
          toast.error('인증이 만료되었습니다. 다시 로그인해주세요.');
        } else {
          toast.error('백업 목록을 불러올 수 없습니다.');
        }
      }
    } catch (error) {
      console.error('Load backups error:', error);
      setBackups([]); // 에러 시 빈 배열
      toast.error('백업 목록 로딩 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const createBackup = async () => {
    console.log('🔵 [DEBUG] createBackup function called!');
    setIsBackingUp(true);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const tokenToUse = session?.access_token || accessToken;

      console.log('💾 [Backup] Creating backup...', { tokenToUse: tokenToUse ? 'EXISTS' : 'MISSING' });

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
        console.log('✅ [Backup] Backup created:', result);

        toast.success(
          `✅ 백업 완료!\n` +
          `보유: ${result.ownedCount}개\n` +
          `위시: ${result.wishlistCount}개\n` +
          `플레이 기록: ${result.playRecordsCount}개`,
          { duration: 7000 }
        );

        await loadBackups();
      } else {
        const errorText = await response.text();
        console.error('❌ [Backup] Failed:', response.status);
        console.error('❌ [Backup] Error Response Text:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
          console.error('❌ [Backup] Parsed JSON:', errorData);
        } catch (parseError) {
          console.error('❌ [Backup] Failed to parse JSON:', parseError);
          errorData = { error: errorText };
        }
        
        // Show detailed error message
        const errorMsg = errorData.error || errorData.details || errorText || '백업 생성 실패';
        toast.error(`백업 실패: ${errorMsg.substring(0, 200)}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Create backup error:', error);
      toast.error('백업 생성에 실패했습니다');
    } finally {
      setIsBackingUp(false);
    }
  };

  const restoreBackup = async (slot: string) => {
    if (!confirm(`${slot}에서 데이터를 복구하시겠습니까?\n\n현재 데이터는 임시 백업으로 저장됩니다.`)) {
      return;
    }

    setIsRestoring(true);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const tokenToUse = session?.access_token || accessToken;

      console.log(`🔄 [Restore] Restoring from slot: ${slot}...`);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/restore-backup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenToUse}`,
          },
          body: JSON.stringify({ 
            slot,
            key: backups.find(b => b.slot === slot)?.key // 백업 키도 함께 전달
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log('✅ [Restore] Restore completed:', result);

        toast.success(
          `✅ 복구 완료!\n` +
          `보유: ${result.ownedCount}개\n` +
          `위시: ${result.wishlistCount}개\n` +
          `플레이 기록: ${result.playRecordsCount}개\n\n` +
          `페이지를 새로고침(F5)하세요.`,
          { duration: 10000 }
        );

        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || '복구 실패');
      }
    } catch (error) {
      console.error('Restore backup error:', error);
      toast.error('백업 복구에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsRestoring(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
  };

  return (
    <Card className="border-2 border-blue-500 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-700">
          <HardDrive className="w-5 h-5" />
          💾 데이터 백업 관리
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 도움말 */}
        <div className="bg-blue-100 border border-blue-300 rounded-lg p-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">💡</span>
            <div className="text-blue-900 space-y-1">
              <p className="font-semibold">자동 백업 시스템</p>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-blue-800">
                <li>게임을 추가하거나 삭제하면 <strong>자동으로 백업</strong>됩니다</li>
                <li>최근 3개의 백업만 보관됩니다 (오래된 백업은 자동 삭제)</li>
                <li>백업은 Supabase 데이터베이스에 안전하게 저장됩니다</li>
                <li>언제든지 이전 상태로 복구할 수 있습니다</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-blue-200">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Button
              onClick={createBackup}
              disabled={isBackingUp}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {isBackingUp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  백업 중...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  💾 지금 백업 생성
                </>
              )}
            </Button>
            <Button
              onClick={loadBackups}
              disabled={isLoadingBackups}
              variant="outline"
              className="flex-1 border-blue-500 text-blue-700 hover:bg-blue-50"
            >
              {isLoadingBackups ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                '🔄 '
              )}
              백업 목록 새로고침
            </Button>
          </div>

          {/* 백업 목록 */}
          {backups.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm mb-2">백업 목록 (최대 3개 유지)</h3>
              {backups.map((backup) => (
                <div
                  key={backup.slot}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="font-medium text-sm text-gray-900">
                          {formatDate(backup.timestamp)}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({getRelativeTime(backup.timestamp)})
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                        <div>
                          <span className="font-medium">보유:</span> {backup.ownedCount}개
                        </div>
                        <div>
                          <span className="font-medium">위시:</span> {backup.wishlistCount}개
                        </div>
                        <div>
                          <span className="font-medium">기록:</span> {backup.playRecordsCount}개
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => restoreBackup(backup.slot)}
                      disabled={isRestoring}
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 border-green-500 text-green-700 hover:bg-green-50"
                    >
                      {isRestoring ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <Download className="w-3 h-3 mr-1" />
                          복구
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500 text-sm">
              {isLoadingBackups ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  백업 목록 불러오는 중...
                </div>
              ) : (
                '아직 백업이 없습니다. 백업을 생성하세요.'
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}