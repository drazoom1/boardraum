import { useState } from 'react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

export function AdminDebug({ accessToken: initialToken }: { accessToken: string }) {
  const [roleInfo, setRoleInfo] = useState<any>(null);
  const [allPosts, setAllPosts] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSettingAdmin, setIsSettingAdmin] = useState(false);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const getValidToken = async (): Promise<string | null> => {
    try {
      // ⚡ FIXED: 먼저 props로 전달받은 토큰 사용
      if (initialToken) {
        console.log('✅ [Token] Using token from props');
        return initialToken;
      }

      // 그래도 없으면 세션에서 조회
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        console.error('❌ [Auth Debug] No valid session');
        toast.error('로그인이 필요합니다');
        return null;
      }
      
      console.log('✅ [Token] Using token from session');
      return session.access_token;
    } catch (error) {
      console.error('❌ [Auth Debug] Error getting token:', error);
      return null;
    }
  };

  const checkRole = async () => {
    setIsChecking(true);
    try {
      const token = await getValidToken();
      if (!token) {
        setIsChecking(false);
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/check-role`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRoleInfo(data);
        console.log('Role info:', data);
        
        if (data.isAdmin) {
          toast.success('관리자 권한 확인됨!');
        } else {
          toast.info(`현재 역할: ${data.role}`);
        }
      } else {
        const errorData = await response.json();
        console.error('Failed to check role:', errorData);
        toast.error('역할 확인 실패');
      }
    } catch (error) {
      console.error('Check role error:', error);
      toast.error('네트워크 오류');
    } finally {
      setIsChecking(false);
    }
  };

  const setupAdmin = async () => {
    setIsSettingAdmin(true);
    try {
      const token = await getValidToken();
      if (!token) {
        setIsSettingAdmin(false);
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/setup-admin`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('Admin setup result:', data);
        toast.success('관리자 권한이 설정되었습니다!');
        // Check role again after setting
        setTimeout(() => checkRole(), 500);
      } else {
        const errorData = await response.json();
        console.error('Failed to setup admin:', errorData);
        toast.error(`관리자 설정 실패: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Setup admin error:', error);
      toast.error('네트워크 오류');
    } finally {
      setIsSettingAdmin(false);
    }
  };

  const loadAllPosts = async () => {
    setIsLoadingPosts(true);
    try {
      const token = await getValidToken();
      if (!token) {
        setIsLoadingPosts(false);
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/debug/all-customs`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAllPosts(data);
        console.log('📊 All custom posts:', data);
        console.log('Total:', data.total);
        console.log('By status:', data.byStatus);
        console.log('Posts:', data.posts);
        toast.success(`총 ${data.total}개 게시물 발견 (Pending: ${data.byStatus.pending})`);
      } else {
        const errorData = await response.json();
        console.error('Failed to load posts:', errorData);
        toast.error('게시물 조회 실패');
      }
    } catch (error) {
      console.error('Load posts error:', error);
      toast.error('네트워크 오류');
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const fixPendingStatus = async () => {
    if (!confirm('Unknown 상태의 모든 게시물을 pending으로 변경하시겠습니까?')) {
      return;
    }

    setIsLoadingPosts(true);
    try {
      const token = await getValidToken();
      if (!token) {
        setIsLoadingPosts(false);
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/fix-pending-status`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Fix result:', data);
        toast.success(data.message || `${data.fixed}개 게시물 수정 완료!`);
        // Reload posts after fixing
        setTimeout(() => loadAllPosts(), 500);
      } else {
        const errorData = await response.json();
        console.error('Failed to fix posts:', errorData);
        toast.error('게시물 수정 실패');
      }
    } catch (error) {
      console.error('Fix posts error:', error);
      toast.error('네트워크 오류');
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const testKvStore = async () => {
    setIsLoadingPosts(true);
    try {
      console.log('🧪 [Test] Testing KV Store write/read...');
      const token = await getValidToken();
      if (!token) {
        setIsLoadingPosts(false);
        return;
      }

      // Test 1: Write a test post
      const testPost = {
        gameId: 'TEST_GAME',
        gameName: 'Test Game',
        category: 'sleeve',
        title: 'Test Sleeve Info',
        description: 'This is a test post',
        postType: 'info',
        status: 'pending',
        data: { cards: [{ width: 100, height: 150, count: 50 }] }
      };

      console.log('→ Step 1: Creating test post...');
      const createResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(testPost),
        }
      );

      if (!createResponse.ok) {
        const error = await createResponse.json();
        console.error('❌ Test post creation failed:', error);
        toast.error(`테스트 등록 실패: ${error.error}`);
        setIsLoadingPosts(false);
        return;
      }

      const createData = await createResponse.json();
      console.log('✅ Test post created:', createData);
      const testPostId = createData.post.id;

      // Test 2: Verify KV Store contains the post
      console.log('→ Step 2: Verifying in KV Store...');
      const debugResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/debug/all-customs`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (debugResponse.ok) {
        const debugData = await debugResponse.json();
        const foundPost = debugData.posts.find((p: any) => p.value?.id === testPostId);
        
        if (foundPost) {
          console.log('✅ Test post found in KV Store:', foundPost);
          console.log('  → Key:', foundPost.key);
          console.log('  → Status:', foundPost.value.status);
        } else {
          console.error('❌ Test post NOT found in KV Store!');
          console.log('All posts:', debugData.posts);
        }
      }

      // Test 3: Check if it appears in pending list
      console.log('→ Step 3: Checking pending list...');
      const pendingResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/customs/pending/all`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (pendingResponse.ok) {
        const pendingData = await pendingResponse.json();
        const foundInPending = pendingData.posts.find((p: any) => p.id === testPostId);
        
        if (foundInPending) {
          console.log('✅ Test post found in pending list!');
          toast.success('✅ KV Store 테스트 성공! 모든 단계 통과!');
        } else {
          console.error('❌ Test post NOT in pending list!');
          console.log('Pending posts:', pendingData.posts);
          toast.error('❌ Pending 필터링 문제 발견!');
        }
      } else {
        const error = await pendingResponse.json();
        console.error('❌ Failed to fetch pending list:', error);
        toast.error(`Pending 조회 실패: ${error.error}`);
      }

      // Reload all posts to show updated state
      setTimeout(() => loadAllPosts(), 1000);
      
    } catch (error) {
      console.error('❌ KV Store test error:', error);
      toast.error('테스트 실패');
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const backupAllUsers = async () => {
    if (!confirm('⚠️ 전체 회원 데이터를 백업하시겠습니까?\n\n승인된 모든 베타 테스터(168명)의 게임 데이터를 백업합니다.\n각 유저당 최대 3개의 백업을 유지합니다.')) {
      return;
    }

    setIsBackingUp(true);
    toast.loading('전체 회원 백업 중...', { id: 'backup-all' });
    
    try {
      const token = await getValidToken();
      if (!token) {
        toast.dismiss('backup-all');
        toast.error('인증 토큰이 없습니다');
        setIsBackingUp(false);
        return;
      }

      console.log('💾 [Backup] Starting full backup...');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/admin-backup-all`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      toast.dismiss('backup-all');

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Backup result:', data);
        console.log('📊 Full response data:', JSON.stringify(data, null, 2));
        
        if (data.success === false) {
          toast.error(data.message);
          console.log('📊 Backup Stats:', {
            totalUsers: data.totalUsers,
            successCount: data.successCount,
            errorCount: data.errorCount
          });
        } else {
          // 승인된 베타 테스터 정보 표시
          const approvedCount = data.approvedTesters || data.totalUsers;
          const successCount = data.successCount;
          const errorCount = data.errorCount || 0;
          
          console.log('🎉 백업 성공 데이터:', {
            approvedTesters: approvedCount,
            totalUsers: data.totalUsers,
            successCount: successCount,
            errorCount: errorCount,
          });
          
          toast.success(
            `✅ 백업 완료!\n승인된 ${approvedCount}명 중 ${successCount}명 백업 성공`,
            { duration: 5000 }
          );
          if (errorCount > 0) {
            toast.warning(`⚠️ ${errorCount}명 백업 실패`, { duration: 5000 });
          }
          
          // 백업 완료 후 통계 표시
          console.log('📊 백업 완료 통계:', {
            '승인된 베타 테스터': approvedCount,
            '데이터가 있는 유저': data.totalUsers,
            '성공': successCount,
            '실패': errorCount,
          });

          // 🎉 백업 완료 후 자동으로 전체 백업 확인
          setTimeout(() => {
            console.log('🔍 [Auto Check] Checking all backups after successful backup...');
            checkAllBackups();
          }, 1000);
        }
      } else {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        console.error('Failed to backup:', errorData);
        console.error('Response status:', response.status);
        toast.error(`백업 실패 (${response.status}): ${errorData.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      toast.dismiss('backup-all');
      console.error('Backup error:', error);
      toast.error('백업 실패: ' + (error instanceof Error ? error.message : '네트워크 오류'));
    } finally {
      setIsBackingUp(false);
    }
  };

  const checkKvStore = async () => {
    setIsLoadingPosts(true);
    try {
      const token = await getValidToken();
      if (!token) {
        setIsLoadingPosts(false);
        return;
      }

      console.log('🔍 [KV Store Check] Fetching all keys...');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/emergency/diagnose`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('📊 KV Store Full Diagnosis:', data);
        console.log('📊 Stats:', data.stats);
        console.log('📊 User Data:', data.userDataSummary);
        toast.success(`총 ${data.stats.totalKeys}개 키 발견 (유저 ${data.stats.users.length}명)`);
      } else {
        const error = await response.json();
        console.error('KV Store check error:', error);
        toast.error('KV Store 조회 실패');
      }
    } catch (error) {
      console.error('KV Store check error:', error);
      toast.error('네트워크 오류');
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const checkAllBackups = async () => {
    setIsLoadingPosts(true);
    try {
      const token = await getValidToken();
      if (!token) {
        setIsLoadingPosts(false);
        return;
      }

      console.log('🔍 [Check All Backups] Fetching all backup keys...');
      
      // 백업 전용 API 사용
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/data/admin-backup-list`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        console.log('📊 [All Backups] Response:', data);
        console.log('📊 [All Backups] Total backup keys:', data.totalBackups);
        console.log('📊 [All Backups] Users with backups:', data.usersWithBackups);
        console.log('📋 [All Backups] Backup details:', data.backupsByUser);

        if (data.totalBackups === 0) {
          toast.warning(
            '⚠️ 백업이 없습니다!\\n' +
            '먼저 "전체 회원 데이터 백업" 버튼을 눌러주세요.',
            { duration: 5000 }
          );
          setAllPosts(null);
        } else {
          toast.success(
            `✅ 전체 백업 확인 완료!\\n` +
            `총 ${data.usersWithBackups}명의 유저\\n` +
            `총 ${data.totalBackups}개의 백업`,
            { duration: 5000 }
          );

          // 상세 정보를 allPosts 상태에 저장하여 화면에 표시
          setAllPosts({
            total: data.totalBackups,
            usersWithBackups: data.usersWithBackups,
            backupsByUser: data.backupsByUser
          });
        }
      } else {
        const error = await response.json();
        console.error('Failed to check backups:', error);
        toast.error('백업 조회 실패');
      }
    } catch (error) {
      console.error('Check all backups error:', error);
      toast.error('네트워크 오류');
    } finally {
      setIsLoadingPosts(false);
    }
  };

  if (!showDebug) {
    return (
      <button
        onClick={() => setShowDebug(true)}
        className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg shadow-lg"
      >
        🔧 디버그
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 max-w-2xl max-h-[80vh] overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">🔧 관리자 디버그</h3>
        <button
          onClick={() => setShowDebug(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>
      
      <div className="space-y-2 mb-4">
        <Button
          onClick={checkRole}
          disabled={isChecking}
          className="w-full"
          variant="outline"
        >
          {isChecking ? '확인 중...' : '내 권한 확인'}
        </Button>
        
        <Button
          onClick={setupAdmin}
          disabled={isSettingAdmin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isSettingAdmin ? '설정 중...' : 'sityplanner2@naver.com 관리자 설정'}
        </Button>

        <Button
          onClick={loadAllPosts}
          disabled={isLoadingPosts}
          className="w-full bg-green-600 hover:bg-green-700 text-white"
        >
          {isLoadingPosts ? '조회 중...' : 'KV Store 전체 게시물 조회'}
        </Button>

        <Button
          onClick={fixPendingStatus}
          disabled={isLoadingPosts}
          className="w-full bg-red-600 hover:bg-red-700 text-white"
        >
          {isLoadingPosts ? '수정 중...' : 'Unknown 상태 수정'}
        </Button>

        <Button
          onClick={testKvStore}
          disabled={isLoadingPosts}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
        >
          {isLoadingPosts ? '테스트 중...' : 'KV Store 테스트'}
        </Button>

        <Button
          onClick={backupAllUsers}
          disabled={isBackingUp}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold shadow-lg text-lg py-6"
        >
          {isBackingUp ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              백업 진행 중... 잠시만 기다려주세요!
            </>
          ) : (
            <>
              💾 전체 회원 데이터 백업 (클릭!)
            </>
          )}
        </Button>

        <div className="bg-cyan-50 border-2 border-cyan-300 rounded-lg p-4 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-2xl">ℹ️</span>
            <div className="space-y-1">
              <p className="font-bold text-cyan-900">전체 회원 백업 기능</p>
              <ul className="list-disc list-inside text-cyan-800 space-y-0.5">
                <li><strong>승인된 모든 베타 테스터(현재 168명)</strong>의 게임 데이터를 백업합니다</li>
                <li>각 유저당 최대 3개의 백업을 유지합니다 (오래된 백업 자동 삭제)</li>
                <li>보유 게임, 위시리스트, 플레이 기록을 모두 백업합니다</li>
                <li>앞으로 추가 승인된 인원도 자동으로 포함됩니다</li>
                <li>백업 완료 후 성공/실패 개수를 알려드립니다</li>
              </ul>
              <p className="text-xs text-cyan-700 mt-2 font-semibold">
                ⚡ 언제든지 안전하게 실행할 수 있습니다!
              </p>
            </div>
          </div>
        </div>

        <Button
          onClick={checkKvStore}
          disabled={isLoadingPosts}
          className="w-full bg-gray-600 hover:bg-gray-700 text-white"
        >
          {isLoadingPosts ? '조회 중...' : 'KV Store 키 조회'}
        </Button>

        <Button
          onClick={checkAllBackups}
          disabled={isLoadingPosts}
          className="w-full bg-gray-600 hover:bg-gray-700 text-white"
        >
          {isLoadingPosts ? '조회 중...' : '전체 백업 조회'}
        </Button>
      </div>

      {roleInfo && (
        <div className="bg-gray-50 p-3 rounded text-xs font-mono space-y-1 mb-4">
          <div><strong>Email:</strong> {roleInfo.email}</div>
          <div><strong>User ID:</strong> {roleInfo.userId}</div>
          <div><strong>Role:</strong> {roleInfo.role}</div>
          <div><strong>Is Admin:</strong> {roleInfo.isAdmin ? '✅ Yes' : '❌ No'}</div>
          <div><strong>Profile:</strong> {JSON.stringify(roleInfo.profile)}</div>
        </div>
      )}

      {allPosts && (
        <div className="bg-yellow-50 p-3 rounded text-xs space-y-2 border border-yellow-200">
          {allPosts.backupsByUser ? (
            // 백업 정보 표시
            <>
              <div className="font-bold text-sm mb-2 text-cyan-900">💾 전체 백업 통계</div>
              <div className="bg-cyan-100 p-2 rounded space-y-1">
                <div><strong>총 백업 개수:</strong> <span className="text-cyan-700 font-bold">{allPosts.total}개</span></div>
                <div><strong>백업된 유저:</strong> <span className="text-cyan-700 font-bold">{allPosts.usersWithBackups}명</span></div>
                <div className="text-[10px] text-cyan-600 mt-1">
                  ℹ️ 각 유저당 최대 3개의 백업을 유지합니다
                </div>
              </div>
              
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">
                  📋 유저별 백업 상세 보기 ({allPosts.usersWithBackups}명)
                </summary>
                <div className="mt-2 space-y-2 max-h-80 overflow-auto">
                  {allPosts.backupsByUser.map((userBackup: any, index: number) => (
                    <div key={index} className="bg-white p-2 rounded border border-cyan-200 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-semibold text-cyan-900">유저 {index + 1}</div>
                        <div className="text-[10px] bg-cyan-100 px-2 py-0.5 rounded">
                          {userBackup.backupCount}개 백업
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-500 mb-2 font-mono truncate">
                        ID: {userBackup.userId}
                      </div>
                      <div className="space-y-1">
                        {userBackup.backups.map((backup: any, bIndex: number) => (
                          <div key={bIndex} className="text-[10px] bg-gray-50 p-2 rounded border border-gray-200">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-green-700">🎲 {backup.gameCount}개 게임</div>
                              <div className="text-[9px] text-gray-400">백업 #{bIndex + 1}</div>
                            </div>
                            <div className="text-gray-500 mt-0.5">
                              ⏰ {new Date(backup.createdAt).toLocaleString('ko-KR')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : (
            // 게시물 정보 표시 (기존)
            <>
              <div className="font-bold text-sm">📊 KV Store 통계</div>
              <div><strong>총 게시물:</strong> {allPosts.total}</div>
              <div><strong>Pending:</strong> {allPosts.byStatus?.pending}</div>
              <div><strong>Approved:</strong> {allPosts.byStatus?.approved}</div>
              <div><strong>Rejected:</strong> {allPosts.byStatus?.rejected}</div>
              <div><strong>Unknown:</strong> {allPosts.byStatus?.unknown}</div>
              
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">전체 게시물 보기 ({allPosts.posts?.length || 0})</summary>
                <div className="mt-2 space-y-2 max-h-60 overflow-auto">
                  {allPosts.posts?.map((post: any, index: number) => (
                    <div key={index} className="bg-white p-2 rounded border border-gray-200">
                      <div><strong>Key:</strong> {post.key}</div>
                      <div><strong>Title:</strong> {post.value?.title || 'N/A'}</div>
                      <div><strong>Category:</strong> {post.value?.category || 'N/A'}</div>
                      <div><strong>Status:</strong> <span className={`px-1 rounded ${
                        post.value?.status === 'pending' ? 'bg-yellow-200' :
                        post.value?.status === 'approved' ? 'bg-green-200' :
                        post.value?.status === 'rejected' ? 'bg-red-200' : 'bg-gray-200'
                      }`}>{post.value?.status || 'N/A'}</span></div>
                      <div><strong>Created by:</strong> {post.value?.created_by_email || 'N/A'}</div>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );
}