import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { Download, RefreshCw, Database, Users, HardDrive, ChevronDown, ChevronUp } from 'lucide-react';

interface BackupData {
  userId: string;
  backupCount: number;
  backups: Array<{
    key: string;
    gameCount: number;
    createdAt: string;
    userData: {
      ownedCount: number;
      wishlistCount: number;
      playRecordsCount: number;
    };
  }>;
}

interface BackupListResponse {
  success: boolean;
  totalBackups: number;
  usersWithBackups: number;
  backupsByUser: BackupData[];
}

export function BackupManagement({ accessToken }: { accessToken: string | null }) {
  const [backupData, setBackupData] = useState<BackupListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const loadBackupList = async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      console.log('🔍 [Backup Management] Fetching backup list...');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/admin-backup-list`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('📊 [Backup Management] Loaded:', data);
        setBackupData(data);
        
        if (data.totalBackups === 0) {
          toast.info('백업이 없습니다. 먼저 백업을 생성해주세요.');
        } else {
          toast.success(`${data.usersWithBackups}명의 백업 로드 완료!`);
        }
      } else {
        const error = await response.json();
        console.error('Failed to load backups:', error);
        toast.error('백업 목록 조회 실패');
      }
    } catch (error) {
      console.error('Load backup list error:', error);
      toast.error('네트워크 오류');
    } finally {
      setIsLoading(false);
    }
  };

  const performBackup = async () => {
    if (!confirm('⚠️ 전체 회원 데이터를 백업하시겠습니까?\n\n승인된 모든 베타 테스터의 게임 데이터를 백업합니다.\n각 유저당 최대 3개의 백업을 유지합니다.')) {
      return;
    }

    setIsBackingUp(true);
    toast.loading('전체 회원 백업 중...', { id: 'backup-all' });
    
    try {
      console.log('💾 [Backup Management] Starting full backup...');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/admin-backup-all`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      toast.dismiss('backup-all');

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Backup result:', data);
        
        if (data.success === false) {
          toast.error(data.message);
        } else {
          const approvedCount = data.approvedTesters || data.totalUsers;
          const successCount = data.successCount;
          const errorCount = data.errorCount || 0;
          
          toast.success(
            `✅ 백업 완료!\n승인된 ${approvedCount}명 중 ${successCount}명 백업 성공`,
            { duration: 5000 }
          );
          
          if (errorCount > 0) {
            toast.warning(`⚠️ ${errorCount}명 백업 실패`, { duration: 5000 });
          }
          
          // 백업 완료 후 목록 새로고침
          setTimeout(() => loadBackupList(), 1000);
        }
      } else {
        const errorData = await response.json();
        console.error('Failed to backup:', errorData);
        toast.error(`백업 실패: ${errorData.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      toast.dismiss('backup-all');
      console.error('Backup error:', error);
      toast.error('백업 실패: ' + (error instanceof Error ? error.message : '네트워크 오류'));
    } finally {
      setIsBackingUp(false);
    }
  };

  const downloadBackup = async (userBackup: BackupData, backupIndex: number) => {
    const backup = userBackup.backups[backupIndex];
    
    try {
      console.log(`📥 [Backup Download] Fetching full backup data for: ${backup.key}`);
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/admin-backup-download/${encodeURIComponent(backup.key)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download backup');
      }

      const data = await response.json();
      console.log(`✅ [Backup Download] Full data retrieved`);
      
      // 다운로드할 데이터 구성
      const downloadData = {
        userId: userBackup.userId,
        backupKey: backup.key,
        createdAt: backup.createdAt,
        gameCount: backup.gameCount,
        fullData: data.data // 전체 백업 데이터
      };
      
      const blob = new Blob([JSON.stringify(downloadData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${userBackup.userId.substring(0, 8)}_${new Date(backup.createdAt).getTime()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('백업 파일 다운로드 완료!');
    } catch (error) {
      console.error('Download backup error:', error);
      toast.error('백업 다운로드 실패');
    }
  };

  const downloadAllBackups = () => {
    if (!backupData) return;
    
    const allBackupsData = {
      exportedAt: new Date().toISOString(),
      totalUsers: backupData.usersWithBackups,
      totalBackups: backupData.totalBackups,
      backups: backupData.backupsByUser,
    };
    
    const blob = new Blob([JSON.stringify(allBackupsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boardraum_all_backups_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('전체 백업 파일 다운로드 완료!');
  };

  const toggleUserExpand = (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedUsers(newExpanded);
  };

  useEffect(() => {
    loadBackupList();
  }, [accessToken]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-100 rounded-lg">
            <Database className="w-6 h-6 text-cyan-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">백업 관리</h2>
            <p className="text-sm text-gray-500">전체 회원 데이터 백업 및 다운로드</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={loadBackupList}
            disabled={isLoading}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          
          <Button
            onClick={performBackup}
            disabled={isBackingUp}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white gap-2"
          >
            {isBackingUp ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                백업 진행 중...
              </>
            ) : (
              <>
                <HardDrive className="w-4 h-4" />
                전체 백업 실행
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-cyan-50 border-2 border-cyan-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">ℹ️</span>
          <div className="space-y-2 flex-1">
            <p className="font-bold text-cyan-900">백업 정책</p>
            <ul className="list-disc list-inside text-sm text-cyan-800 space-y-1">
              <li>승인된 모든 베타 테스터의 게임 데이터를 백업합니다</li>
              <li>각 유저당 최대 3개의 백업을 유지합니다 (오래된 백업 자동 삭제)</li>
              <li>보유 게임, 위시리스트, 플레이 기록을 모두 백업합니다</li>
              <li>백업 파일은 JSON 형식으로 다운로드할 수 있습니다</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Stats */}
      {backupData && backupData.totalBackups > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <HardDrive className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">총 백업</p>
                <p className="text-2xl font-bold text-gray-900">{backupData.totalBackups}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">백업된 유저</p>
                <p className="text-2xl font-bold text-gray-900">{backupData.usersWithBackups}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Download className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-500 mb-2">전체 다운로드</p>
                <Button
                  onClick={downloadAllBackups}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white w-full gap-1"
                >
                  <Download className="w-3 h-3" />
                  전체 다운로드
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backup List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-cyan-600" />
        </div>
      ) : backupData && backupData.totalBackups > 0 ? (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-gray-900">
            유저별 백업 목록 ({backupData.usersWithBackups}명)
          </h3>
          
          <div className="space-y-2">
            {backupData.backupsByUser.map((userBackup, index) => (
              <div key={index} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {/* User Header */}
                <button
                  onClick={() => toggleUserExpand(userBackup.userId)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">유저 {index + 1}</p>
                      <p className="text-xs text-gray-500 font-mono">{userBackup.userId}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-cyan-600">{userBackup.backupCount}개 백업</p>
                      <p className="text-xs text-gray-500">
                        최근: {new Date(userBackup.backups[0]?.createdAt).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    {expandedUsers.has(userBackup.userId) ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>
                
                {/* Expanded Content */}
                {expandedUsers.has(userBackup.userId) && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-2">
                    {userBackup.backups.map((backup, bIndex) => (
                      <div key={bIndex} className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 text-xs font-semibold rounded">
                                백업 #{bIndex + 1}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(backup.createdAt).toLocaleString('ko-KR')}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div className="bg-blue-50 rounded p-2">
                                <p className="text-xs text-gray-600">보유 게임</p>
                                <p className="font-bold text-blue-600">{backup.userData.ownedCount}</p>
                              </div>
                              <div className="bg-pink-50 rounded p-2">
                                <p className="text-xs text-gray-600">위시리스트</p>
                                <p className="font-bold text-pink-600">{backup.userData.wishlistCount}</p>
                              </div>
                              <div className="bg-purple-50 rounded p-2">
                                <p className="text-xs text-gray-600">플레이 기록</p>
                                <p className="font-bold text-purple-600">{backup.userData.playRecordsCount}</p>
                              </div>
                            </div>
                            
                            <p className="text-xs text-gray-500 font-mono truncate">
                              {backup.key}
                            </p>
                          </div>
                          
                          <Button
                            onClick={() => downloadBackup(userBackup, bIndex)}
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white gap-1 shrink-0"
                          >
                            <Download className="w-3 h-3" />
                            다운로드
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <HardDrive className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">아직 백업이 없습니다.</p>
          <p className="text-sm text-gray-400 mb-6">
            "전체 백업 실행" 버튼을 눌러 백업을 생성하세요.
          </p>
          <Button
            onClick={performBackup}
            disabled={isBackingUp}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white gap-2"
          >
            <HardDrive className="w-4 h-4" />
            첫 백업 만들기
          </Button>
        </div>
      )}
    </div>
  );
}