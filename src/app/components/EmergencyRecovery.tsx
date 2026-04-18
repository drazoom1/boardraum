import { useState } from 'react';
import { AlertTriangle, Database, RefreshCw, Eye, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';

interface EmergencyRecoveryProps {
  accessToken: string;
}

export function EmergencyRecovery({ accessToken }: EmergencyRecoveryProps) {
  const [isLoadingDiagnose, setIsLoadingDiagnose] = useState(false);
  const [isLoadingAllKeys, setIsLoadingAllKeys] = useState(false);
  const [isLoadingRecover, setIsLoadingRecover] = useState(false);
  const [diagnoseData, setDiagnoseData] = useState<any>(null);
  const [allKeysData, setAllKeysData] = useState<any>(null);
  const [showAllKeys, setShowAllKeys] = useState(false);

  const runDiagnose = async () => {
    setIsLoadingDiagnose(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/emergency/diagnose`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDiagnoseData(data);
        console.log('📊 [Diagnose] Full data:', data);
        toast.success('진단 완료!');
      } else {
        toast.error('진단에 실패했습니다');
      }
    } catch (error) {
      console.error('Diagnose error:', error);
      toast.error('진단 중 오류가 발생했습니다');
    } finally {
      setIsLoadingDiagnose(false);
    }
  };

  const runAllKeys = async () => {
    setIsLoadingAllKeys(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/emergency/all-keys`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAllKeysData(data);
        console.log('🔍 [All Keys] Full data:', data);
        console.log('🔍 [All Keys] Total keys:', data.totalKeys);
        console.log('🔍 [All Keys] All keys list:', data.allKeys);
        console.log('🔍 [All Keys] Prefix groups:', data.prefixGroups);
        console.log('🔍 [All Keys] Key details:', data.keyDetails);
        console.log('🔍 [All Keys] Analysis:', data.analysis);
        console.log('');
        console.log('📊 [Key Analysis Summary]');
        console.log('   Total Keys:', data.totalKeys);
        console.log('   User Owned Keys:', data.analysis?.userOwnedKeys);
        console.log('   User Wishlist Keys:', data.analysis?.userWishlistKeys);
        console.log('   Beta User Keys:', data.analysis?.betaUserKeys);
        console.log('   Game Custom Keys:', data.analysis?.gameCustomKeys);
        console.log('   Beta Post Keys:', data.analysis?.betaPostKeys);
        console.log('   Play Record Keys:', data.analysis?.playRecordKeys);
        console.log('');
        console.log('🔑 Missing Keys:', data.totalKeys - (
          (data.analysis?.userOwnedKeys || 0) +
          (data.analysis?.userWishlistKeys || 0) +
          (data.analysis?.betaUserKeys || 0) +
          (data.analysis?.gameCustomKeys || 0) +
          (data.analysis?.betaPostKeys || 0) +
          (data.analysis?.playRecordKeys || 0)
        ));
        
        toast.success(`전체 ${data.totalKeys}개 키 조회 완료! 콘솔을 확인하세요 (F12)`);
      } else {
        toast.error('키 목록 조회에 실패했습니다');
      }
    } catch (error) {
      console.error('All keys error:', error);
      toast.error('키 목록 조회 중 오류가 발생했습니다');
    } finally {
      setIsLoadingAllKeys(false);
    }
  };

  const runRecover = async () => {
    if (!confirm('⚠️ 데이터 복구를 실행하시겠습니까? 모든 사용자 데이터를 검증하고 정리합니다.')) {
      return;
    }

    setIsLoadingRecover(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/emergency/recover`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [Recover] Full data:', data);
        toast.success(data.message);
        
        // 복구 후 다시 진단
        setTimeout(() => runDiagnose(), 1000);
      } else {
        const errorData = await response.json();
        toast.error(`복구에 실패했습니다: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Recover error:', error);
      toast.error('복구 중 오류가 발생했습니다');
    } finally {
      setIsLoadingRecover(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold text-red-900 mb-2">🚨 긴급 데이터 복구 시스템</h2>
            <p className="text-red-700 text-sm">
              KV Store의 전체 데이터를 진단하고 복구할 수 있습니다. 
              데이터 유실이 의심될 때 사용하세요.
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1: Diagnose */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
              1
            </div>
            <h3 className="font-semibold text-gray-900">전체 데이터 진단</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            KV Store의 모든 키를 분석하고 통계를 출력합니다.
          </p>
          <Button
            onClick={runDiagnose}
            disabled={isLoadingDiagnose}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Database className="w-4 h-4 mr-2" />
            {isLoadingDiagnose ? '진단 중...' : '1단계: 진단 실행'}
          </Button>
        </div>

        {/* Step 2: All Keys */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold">
              2
            </div>
            <h3 className="font-semibold text-gray-900">전체 키 목록 조회</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            394개 키 전체를 prefix별로 분류해서 콘솔에 출력합니다.
          </p>
          <Button
            onClick={runAllKeys}
            disabled={isLoadingAllKeys}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            <Eye className="w-4 h-4 mr-2" />
            {isLoadingAllKeys ? '조회 중...' : '2단계: 전체 키 조회'}
          </Button>
        </div>

        {/* Step 3: Recover */}
        <div className="bg-white border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center font-bold">
              3
            </div>
            <h3 className="font-semibold text-gray-900">데이터 복구 실행</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            모든 사용자 데이터를 검증하고 정리합니다.
          </p>
          <Button
            onClick={runRecover}
            disabled={isLoadingRecover}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {isLoadingRecover ? '복구 중...' : '3단계: 데이터 복구'}
          </Button>
        </div>
      </div>

      {/* Diagnose Results */}
      {diagnoseData && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5" />
            진단 결과
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{diagnoseData.stats?.totalKeys || 0}</div>
              <div className="text-sm text-gray-600">총 키 개수</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{diagnoseData.stats?.userOwnedGames || 0}</div>
              <div className="text-sm text-gray-600">보유 게임 키</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{diagnoseData.stats?.uniqueUsers || 0}</div>
              <div className="text-sm text-gray-600">사용자 수</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-600">{diagnoseData.stats?.betaUsers || 0}</div>
              <div className="text-sm text-gray-600">베타 사용자</div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-900 mb-2">⚠️ 문제 분석</h4>
            {diagnoseData.stats?.userOwnedGames < 30 ? (
              <div className="space-y-2 text-sm text-yellow-800">
                <p>
                  • 보유 게임 키가 {diagnoseData.stats?.userOwnedGames}개밖에 없습니다. 
                  총 {diagnoseData.stats?.totalKeys}개 키 중 나머지 {diagnoseData.stats?.totalKeys - diagnoseData.stats?.userOwnedGames - diagnoseData.stats?.betaUsers}개가 
                  다른 형식의 키일 가능성이 높습니다.
                </p>
                <p>
                  • <strong>2단계: 전체 키 조회</strong>를 실행해서 어떤 prefix들이 있는지 확인하세요.
                </p>
                <p>
                  • 키 형식이 확인되면 <strong>3단계: 데이터 복구</strong>를 실행하세요.
                </p>
                <div className="mt-3 pt-3 border-t border-yellow-300">
                  <p className="font-semibold text-yellow-900 mb-1">🔍 전체 키 미리보기 (처음 20개):</p>
                  <div className="bg-white rounded p-2 max-h-48 overflow-y-auto">
                    <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                      {diagnoseData.allKeys?.slice(0, 20).join('\n')}
                    </pre>
                  </div>
                  <p className="text-xs text-yellow-700 mt-2">
                    💡 전체 키 목록을 보려면 <strong>2단계: 전체 키 조회</strong> 버튼을 클릭하세요.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-green-800">
                ✅ 데이터가 정상적으로 보입니다.
              </p>
            )}
          </div>

          {diagnoseData.userDataSummary && diagnoseData.userDataSummary.length > 0 && (
            <div className="mt-6">
              <h4 className="font-semibold text-gray-900 mb-3">사용자별 게임 수 (처음 10명)</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {diagnoseData.userDataSummary.slice(0, 10).map((user: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-50 rounded p-3 text-sm">
                    <div>
                      <span className="font-mono text-xs text-gray-600">{user.userId.substring(0, 8)}...</span>
                      <span className="ml-2 text-gray-700">
                        {user.type === 'owned' ? '보유' : '위시리스트'}
                      </span>
                    </div>
                    <div className="font-semibold text-gray-900">{user.count}개</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Keys Results */}
      {allKeysData && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Eye className="w-5 h-5" />
              전체 키 목록 ({allKeysData.totalKeys}개)
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllKeys(!showAllKeys)}
            >
              {showAllKeys ? '숨기기' : '전체 보기'}
            </Button>
          </div>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-3">Prefix별 분류</h4>
              <div className="space-y-2">
                {allKeysData.prefixGroups?.slice(0, 10).map((group: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-gray-700">{group.prefix}_*</span>
                    <span className="font-semibold text-blue-600">{group.count}개</span>
                  </div>
                ))}
              </div>
            </div>

            {allKeysData.analysis && (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 mb-3">📊 데이터 분석</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-700">보유 게임 키:</span>
                      <span className="ml-2 font-semibold text-green-700">{allKeysData.analysis.userOwnedKeys}개</span>
                    </div>
                    <div>
                      <span className="text-gray-700">위시리스트 키:</span>
                      <span className="ml-2 font-semibold text-green-700">{allKeysData.analysis.userWishlistKeys}개</span>
                    </div>
                    <div>
                      <span className="text-gray-700">베타 유저 키:</span>
                      <span className="ml-2 font-semibold text-green-700">{allKeysData.analysis.betaUserKeys}개</span>
                    </div>
                    <div>
                      <span className="text-gray-700">게임 커스텀 키:</span>
                      <span className="ml-2 font-semibold text-green-700">{allKeysData.analysis.gameCustomKeys}개</span>
                    </div>
                    <div>
                      <span className="text-gray-700">커뮤니티 포스트:</span>
                      <span className="ml-2 font-semibold text-green-700">{allKeysData.analysis.betaPostKeys}개</span>
                    </div>
                    <div>
                      <span className="text-gray-700">플레이 기록:</span>
                      <span className="ml-2 font-semibold text-green-700">{allKeysData.analysis.playRecordKeys}개</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-green-300">
                    <div className="text-sm">
                      <span className="text-gray-700">분류되지 않은 키:</span>
                      <span className="ml-2 font-semibold text-red-600">
                        {allKeysData.totalKeys - (
                          (allKeysData.analysis.userOwnedKeys || 0) +
                          (allKeysData.analysis.userWishlistKeys || 0) +
                          (allKeysData.analysis.betaUserKeys || 0) +
                          (allKeysData.analysis.gameCustomKeys || 0) +
                          (allKeysData.analysis.betaPostKeys || 0) +
                          (allKeysData.analysis.playRecordKeys || 0)
                        )}개
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* 상세 키 목록 */}
                {allKeysData.analysis.allOwnedKeys && allKeysData.analysis.allOwnedKeys.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <h4 className="font-semibold text-orange-900 mb-3">🎮 모든 보유 게임 키 ({allKeysData.analysis.allOwnedKeys.length}개)</h4>
                    <div className="max-h-64 overflow-y-auto">
                      <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                        {allKeysData.analysis.allOwnedKeys.join('\n')}
                      </pre>
                    </div>
                  </div>
                )}
                
                {allKeysData.analysis.allUserKeys && allKeysData.analysis.allUserKeys.length > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h4 className="font-semibold text-purple-900 mb-3">👤 모든 user_ 키 ({allKeysData.analysis.allUserKeys.length}개)</h4>
                    <div className="max-h-64 overflow-y-auto">
                      <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                        {allKeysData.analysis.allUserKeys.join('\n')}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}

            {showAllKeys && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">모든 키 (콘솔에도 출력됨)</h4>
                <div className="max-h-96 overflow-y-auto">
                  <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                    {allKeysData.allKeys?.join('\n')}
                  </pre>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 text-sm text-gray-600">
            💡 브라우저 콘솔(F12)에서 더 자세한 정보를 확인할 수 있습니다.
          </div>
        </div>
      )}
    </div>
  );
}