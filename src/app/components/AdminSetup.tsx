import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Loader2, UserCog, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info';
import { getSupabaseClient } from '../lib/supabase';
import { safeFetch, checkSupabaseConfig } from '../utils/safeFetch';

interface AdminSetupProps {
  accessToken: string;
}

export function AdminSetup({ accessToken }: AdminSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisReport, setDiagnosisReport] = useState<any>(null);
  const [hongyaDataReport, setHongyaDataReport] = useState<any>(null);

  const checkCurrentRole = async () => {
    setIsChecking(true);
    try {
      // Supabase 설정 확인
      const config = checkSupabaseConfig();
      
      let tokenToUse = accessToken;
      
      try {
        const supabase = getSupabaseClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && session?.access_token) {
          tokenToUse = session.access_token;
        }
      } catch (authError) {
        console.warn('⚠️ Auth failed, using fallback token:', authError);
      }
      
      const result = await safeFetch(
        `https://${config.projectId || projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/check-role`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (result.success && result.data) {
        setCurrentRole(result.data.role);
        
        console.log('현재 권한:', result.data);
        
        toast.success(
          `현재 권한: ${result.data.role}\n` +
          `이메일: ${result.data.email}\n` +
          `관리자: ${result.data.isAdmin ? '예' : '아니오'}`
        );
      } else {
        throw new Error(result.error || '권한 확인 실패');
      }
    } catch (error) {
      console.error('Check role error:', error);
      toast.error('권한 확인에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsChecking(false);
    }
  };

  const diagnoseHongya = async () => {
    setIsDiagnosing(true);
    setDiagnosisReport(null);
    
    try {
      let tokenToUse = accessToken;
      
      try {
        const supabase = getSupabaseClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && session?.access_token) {
          tokenToUse = session.access_token;
        }
      } catch (authError) {
        console.warn('⚠️ Auth failed, using fallback token:', authError);
      }
      
      toast.loading('🔍 홍야님 데이터 진단 중...', { duration: 10000 });
      
      const result = await safeFetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/emergency/diagnose-hongya`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (result.success && result.data) {
        const report = result.data;
        setDiagnosisReport(report);
        
        console.log('📊 [Hongya Diagnosis Report]', report);
        
        const { summary } = report;
        if (summary.ownedGames === 0 && summary.backupsFound > 0) {
          toast.error(
            `⚠️ 데이터 손실 발견!\n` +
            `보유 게임: ${summary.ownedGames}개\n` +
            `백업: ${summary.backupsFound}개 발견\n` +
            `복구 가능합니다!`,
            { duration: 10000 }
          );
        } else if (summary.ownedGames > 0) {
          toast.success(
            `✅ 데이터 정상!\n` +
            `보유 게임: ${summary.ownedGames}개\n` +
            `위시리스트: ${summary.wishlistGames}개`,
            { duration: 5000 }
          );
        } else {
          toast.warning(
            `⚠️ 데이터 없음\n` +
            `키 발견: ${summary.keysFound}개\n` +
            `백업: ${summary.backupsFound}개`,
            { duration: 7000 }
          );
        }
      } else {
        throw new Error(result.error || '진단 실패');
      }
    } catch (error) {
      console.error('Diagnosis error:', error);
      toast.error('진단에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsDiagnosing(false);
    }
  };

  const forceLoadHongya = async () => {
    if (!confirm('🔥 홍야님 데이터를 강제로 로드하시겠습니까?\n\n모든 로딩 방법을 시도합니다.')) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      let tokenToUse = accessToken;
      
      try {
        const supabase = getSupabaseClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && session?.access_token) {
          tokenToUse = session.access_token;
        }
      } catch (authError) {
        console.warn('⚠️ Auth failed, using fallback token:', authError);
      }
      
      toast.loading('🔥 홍야님 데이터 강제 로드 중...', { duration: 15000 });
      
      const result = await safeFetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/emergency/force-load-hongya`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (result.success && result.data) {
        console.log('🔥 [Force Load Result]', result.data);
        
        if (result.data.success) {
          toast.success(
            `✅ 데이터 로드 성공!\n` +
            `방법: ${result.data.method}\n` +
            `보유: ${result.data.ownedGames?.length || 0}개\n` +
            `위시: ${result.data.wishlistGames?.length || 0}개`,
            { duration: 10000 }
          );
          
          if (result.data.warning) {
            toast.warning(result.data.warning, { duration: 7000 });
          }
        } else {
          toast.error(
            `❌ 로드 실패\n${result.data.error || '알 수 없는 오류'}`,
            { duration: 10000 }
          );
        }
      } else {
        throw new Error(result.error || '강제 로드 실패');
      }
    } catch (error) {
      console.error('Force load error:', error);
      toast.error('강제 로드에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const checkHongyaRawData = async () => {
    setIsDiagnosing(true);
    setHongyaDataReport(null);
    
    try {
      let tokenToUse = accessToken;
      
      try {
        const supabase = getSupabaseClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && session?.access_token) {
          tokenToUse = session.access_token;
        }
      } catch (authError) {
        console.warn('⚠️ Auth failed, using fallback token:', authError);
      }
      
      toast.loading('🔍 홍야님 RAW 데이터 조회 중...', { duration: 10000 });
      
      const result = await safeFetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/debug/hongya-data`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (result.success && result.data) {
        const report = result.data;
        setHongyaDataReport(report);
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 [Hongya Raw Data Report]', report);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // 메인 키 확인
        const mainKey = `user_${report.userId}_owned`;
        const mainKeyData = report.keys[mainKey];
        
        if (mainKeyData?.exists) {
          let message = `✅ 데이터 발견!\\n`;
          message += `길이: ${mainKeyData.length}개\\n`;
          
          if (mainKeyData.isNestedArray) {
            message += `⚠️ 중첩 배열 감지!\\n`;
            message += `실제 게임: ${mainKeyData.totalIfFlattened}개`;
            toast.warning(message, { duration: 10000 });
          } else {
            toast.success(message, { duration: 5000 });
          }
        } else {
          toast.error('❌ 메인 키 데이터 없음', { duration: 5000 });
        }
      } else {
        throw new Error(result.error || 'RAW 데이터 조회 실패');
      }
    } catch (error) {
      console.error('Check hongya raw data error:', error);
      toast.error('RAW 데이터 조회에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsDiagnosing(false);
    }
  };

  const recoverHongyaData = async () => {
    if (!confirm('🚑 홍야님 데이터를 백업에서 복구하시겠습니까?\\n\\n모든 백업을 스캔하여 가장 많은 게임 데이터를 찾아 복구합니다.\\n백업 데이터는 삭제되지 않습니다.')) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      let tokenToUse = accessToken;
      
      try {
        const supabase = getSupabaseClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && session?.access_token) {
          tokenToUse = session.access_token;
        }
      } catch (authError) {
        console.warn('⚠️ Auth failed, using fallback token:', authError);
      }
      
      toast.loading('🚑 홍야님 데이터 복구 중...', { duration: 20000 });
      
      const result = await safeFetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/hongya-recovery`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (result.success && result.data) {
        console.log('🚑 [Recovery Result]', result.data);
        
        if (result.data.success) {
          toast.success(
            `🎉 복구 성공!\\n` +
            `복구된 게임: ${result.data.gamesRestored}개\\n` +
            `검증: ${result.data.verifiedCount}개\\n` +
            `출처: ${result.data.sourceBackup}`,
            { duration: 15000 }
          );
        } else {
          toast.error(
            `❌ 복구 실패\\n${result.data.error || '알 수 없는 오류'}`,
            { duration: 10000 }
          );
        }
      } else {
        throw new Error(result.error || '복구 실패');
      }
    } catch (error) {
      console.error('Recovery error:', error);
      toast.error('데이터 복구에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const superScanHongya = async () => {
    setIsDiagnosing(true);
    
    try {
      let tokenToUse = accessToken;
      
      try {
        const supabase = getSupabaseClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && session?.access_token) {
          tokenToUse = session.access_token;
        }
      } catch (authError) {
        console.warn('⚠️ Auth failed, using fallback token:', authError);
      }
      
      toast.loading('🔍 전체 DB 슈퍼 스캔 중... (327개 데이터 찾는 중)', { duration: 15000 });
      
      const result = await safeFetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/hongya-super-scan`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        }
      );

      if (result.success && result.data) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 [SUPER SCAN RESULT]', result.data);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (result.data.targetFound) {
          toast.success(
            `🎯 327개 데이터 발견!\\n` +
            `키: ${result.data.targetData.key}\\n` +
            `실제 개수: ${result.data.targetData.actualCount}개\\n` +
            `${result.data.targetData.isNested ? '⚠️ 중첩 배열' : ''}`,
            { duration: 15000 }
          );
        } else if (result.data.suspiciousOtherKeys.length > 0) {
          toast.warning(
            `⚠️ 홍야님 키에는 없지만\\n` +
            `다른 키에서 ${result.data.suspiciousOtherKeys.length}개 발견!\\n` +
            `Console 확인 필요`,
            { duration: 15000 }
          );
        } else if (result.data.theoryMatch) {
          toast.error(
            `🚨 546개 이론 검증 성공!\\n` +
            `등록된 게임: ${result.data.expectedTotal}개\\n` +
            `로드된 게임: ${result.data.totalOwnedGames}개\\n` +
            `누락: ${result.data.missingGames}개 (홍야님 327개!)\\n\\n` +
            `✅ 홍야님 데이터가 로드 안 되는 것 확인됨!`,
            { duration: 20000 }
          );
        } else {
          toast.error(
            `❌ 327개 데이터를 찾을 수 없습니다\\n` +
            `DB 전체: ${result.data.totalKeysScanned}개 키 스캔\\n` +
            `홍야님 관련: ${result.data.hongyaKeysFound}개`,
            { duration: 10000 }
          );
        }
        
        // Update diagnosis report with super scan results
        setDiagnosisReport({
          summary: {
            keysFound: result.data.hongyaKeysFound,
            ownedGames: result.data.targetFound ? result.data.targetData.actualCount : 0,
            wishlistGames: 0,
            backupsFound: result.data.analysis.length,
            hasData: result.data.targetFound,
            canRestore: result.data.targetFound
          },
          recommendations: [
            result.data.recommendation,
            result.data.theoryMatch 
              ? `🎯 546개 이론 검증: ${result.data.missingGames}개 게임이 누락 (홍야님 327개와 일치!)`
              : ''
          ].filter(Boolean),
          checks: result.data.analysis.map((item: any) => ({
            check: item.key,
            status: item.hasTarget ? 'TARGET_FOUND' : item.actualCount > 0 ? 'HAS_DATA' : 'EMPTY',
            count: item.actualCount
          })),
          raw: result.data,
          userStats: result.data.userStats
        });
      } else {
        throw new Error(result.error || '슈퍼 스캔 실패');
      }
    } catch (error) {
      console.error('Super scan error:', error);
      toast.error('슈퍼 스캔에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsDiagnosing(false);
    }
  };

  const preciseDiagnoseAndRecover = async () => {
    if (!confirm('🔬 홍야님 데이터를 초정밀 진단하고 자동 복구하시겠습니까?\\n\\n7단계 완전 진단 + 백업에서 자동 복구를 수행합니다.')) {
      return;
    }
    
    setIsLoading(true);
    setDiagnosisReport(null);
    
    try {
      let tokenToUse = accessToken;
      
      try {
        const supabase = getSupabaseClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && session?.access_token) {
          tokenToUse = session.access_token;
        }
      } catch (authError) {
        console.warn('⚠️ Auth failed, using fallback token:', authError);
      }
      
      toast.loading('🔬 초정밀 진단 + 자동 복구 중...', { duration: 20000 });
      
      const result = await safeFetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/emergency/precise-diagnose-hongya`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
          timeoutMs: 30000,
        }
      );

      if (result.success && result.data) {
        console.log('🔬 [Precise Diagnosis + Recovery Report]', result.data);
        
        const report = result.data;
        
        // 특별한 진단 리포트 형태로 변환
        const transformedReport = {
          summary: {
            keysFound: report.keyCheck?.allKeys?.length || 0,
            ownedGames: report.finalResult?.length || 0,
            wishlistGames: 0,
            backupsFound: report.backupCheck?.validBackups || 0,
            hasData: report.finalResult?.valid || false,
            canRestore: report.backupCheck?.validBackups > 0
          },
          recommendations: [],
          checks: [
            {
              check: 'Key Naming',
              status: report.keyCheck?.exists ? 'SUCCESS' : 'NOT_FOUND',
              count: report.keyCheck?.allKeys?.length
            },
            {
              check: 'Raw Data',
              status: report.rawDataCheck?.found ? 'SUCCESS' : 'NOT_FOUND',
              count: report.rawDataCheck?.length
            },
            {
              check: 'JSON Parsing',
              status: report.parseCheck?.success ? 'SUCCESS' : 'ERROR',
              error: report.parseCheck?.error
            },
            {
              check: 'Backup Available',
              status: report.backupCheck?.validBackups > 0 ? 'FOUND' : 'NOT_FOUND',
              count: report.backupCheck?.validBackups
            },
            {
              check: 'Auto Recovery',
              status: report.recoveryAttempt?.success ? 'SUCCESS' : 
                     report.recoveryAttempt?.performed ? 'ERROR' : 'SKIPPED',
              count: report.recoveryAttempt?.gamesRestored
            },
            {
              check: 'Final State',
              status: report.finalResult?.valid ? 'SUCCESS' : 'ERROR',
              count: report.finalResult?.length
            }
          ],
          raw: report
        };
        
        setDiagnosisReport(transformedReport);
        
        if (report.recoveryAttempt?.success) {
          toast.success(
            `🎉 자동 복구 성공!\\n` +
            `${report.recoveryAttempt.gamesRestored}개 게임 복구됨\\n` +
            `출처: ${report.recoveryAttempt.sourceBackup}`,
            { duration: 10000 }
          );
        } else if (report.finalResult?.valid) {
          toast.success(
            `✅ 데이터 정상!\\n${report.finalResult.length}개 게임`,
            { duration: 5000 }
          );
        } else {
          toast.error(
            `❌ 복구 실패\\n상세 로그를 확인하세요`,
            { duration: 10000 }
          );
        }
      } else {
        throw new Error(result.error || '서버 요청 실패');
      }
    } catch (error) {
      console.error('Precise diagnosis error:', error);
      toast.error(
        '초정밀 진단에 실패했습니다.\\n' + 
        (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const setupAdmin = async () => {
    if (!confirm('sityplanner2@naver.com을 관리자로 설정하시겠습니까?')) {
      return;
    }
    
    setIsLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const tokenToUse = session?.access_token || accessToken;
      
      console.log('🔧 [Admin Setup] Setting admin role for sityplanner2@naver.com...');
      
      const result = await safeFetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/set-role`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenToUse}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'sityplanner2@naver.com',
            role: 'admin'
          }),
        }
      );

      if (result.success && result.data) {
        console.log('✅ [Admin Setup] Success:', result.data);
        
        toast.success(
          `✅ 관리자 설정 완료!\n` +
          `이메일: ${result.data.email}\n` +
          `역할: ${result.data.role}\n` +
          `사용자 ID: ${result.data.userId}`,
          { duration: 7000 }
        );
        
        // Check role again
        setTimeout(() => checkCurrentRole(), 1000);
      } else {
        throw new Error(result.error || '관리자 설정 실패');
      }
    } catch (error) {
      console.error('Setup admin error:', error);
      toast.error('관리자 설정에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const migrateToIndividualKeys = async () => {
    if (!confirm('🔄 전체 사용자 데이터를 개별 키 방식으로 마이그레이션하시겠습니까?\n\n✅ 기존 데이터는 삭제되지 않습니다 (fallback 유지)\n✅ 게임 하나당 키 하나로 저장되어 데이터 유실 방지\n✅ 모든 사용자에게 자동 적용')) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const tokenToUse = session?.access_token || accessToken;
      
      toast.loading('🔄 개별 키 마이그레이션 중...', { duration: 30000 });
      
      const result = await safeFetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-0b7d3bae/admin/migrate-individual-keys`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
          timeoutMs: 60000,
        }
      );

      if (result.success && result.data) {
        console.log('🔄 [Migration Result]', result.data);
        
        const { results } = result.data;
        
        toast.success(
          `✅ 마이그레이션 완료!\n` +
          `총 ${results.total}명\n` +
          `성공: ${results.successful}명\n` +
          `스킵: ${results.skipped}명\n` +
          `실패: ${results.failed}명`,
          { duration: 15000 }
        );
        
        console.log('📊 [Migration Details]', results.details);
      } else {
        throw new Error(result.error || '마이그레이션 실패');
      }
    } catch (error) {
      console.error('Migration error:', error);
      toast.error('마이그레이션에 실패했습니다: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-2 border-blue-500 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-700">
          <UserCog className="w-5 h-5" />
          👤 관리자 설정
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-white rounded-lg p-4 border border-blue-200">
          <p className="text-sm text-gray-700 mb-4">
            sityplanner2@naver.com 계정을 관리자로 설정합니다.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={checkCurrentRole}
              variant="outline"
              disabled={isChecking}
              className="flex-1 border-blue-500 text-blue-700 hover:bg-blue-50"
            >
              {isChecking ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                '🔍 '
              )}
              현재 권한 확인
            </Button>
            
            <Button
              onClick={setupAdmin}
              disabled={isLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                '⚡ '
              )}
              관리자로 설정
            </Button>
          </div>
        </div>

        {currentRole && (
          <div className="bg-white rounded-lg p-4 border border-green-200">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <div className="font-semibold text-green-700">현재 권한</div>
                <div className="text-lg font-bold text-gray-900">{currentRole}</div>
                {currentRole === 'admin' && (
                  <div className="text-sm text-green-600 mt-1">✅ 관리자 권한이 활성화되었습니다</div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <strong>ℹ️ 참고사항:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>서버는 sityplanner2@naver.com을 자동으로 관리자로 인식합니다</li>
            <li>"현재 권한 확인"을 먼저 클릭하여 현재 상태를 확인하세요</li>
            <li>관리자 권한이 없다면 "관리자로 설정" 버튼을 클릭하세요</li>
            <li>설정 완료 후 브라우저를 새로고침(F5)하세요</li>
          </ul>
        </div>

        {/* 🚨 홍야님 데이터 진단 */}
        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4">
          <h3 className="font-bold text-red-900 mb-2">
            🚨 홍야님 데이터 긴급 진단 + 복구
          </h3>
          <p className="text-sm text-red-700 mb-3">
            User ID: cc50eac9-0d05-43fa-bc62-0ea1eb712565
          </p>
          
          <div className="grid grid-cols-1 gap-2">
            <Button
              onClick={preciseDiagnoseAndRecover}
              disabled={isDiagnosing || isLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  진단+복구 중...
                </>
              ) : (
                '🔬 초정밀 진단 + 자동 복구 (권장)'
              )}
            </Button>
            
            <Button
              onClick={recoverHongyaData}
              disabled={isDiagnosing || isLoading}
              className="bg-green-600 hover:bg-green-700 text-white font-bold"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  복구 중...
                </>
              ) : (
                '🚑 백업에서 데이터 복구 (자동 스캔)'
              )}
            </Button>
            
            <Button
              onClick={checkHongyaRawData}
              disabled={isDiagnosing || isLoading}
              className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold"
            >
              {isDiagnosing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  조회 중...
                </>
              ) : (
                '📊 RAW 데이터 직접 조회 (실제 저장 데이터)'
              )}
            </Button>
            
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={diagnoseHongya}
                disabled={isDiagnosing || isLoading}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {isDiagnosing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    진단 중...
                  </>
                ) : (
                  '🔍 완전 진단'
                )}
              </Button>
              
              <Button
                onClick={forceLoadHongya}
                disabled={isDiagnosing || isLoading}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    로드 중...
                  </>
                ) : (
                  '🔥 강제 로드'
                )}
              </Button>
            </div>
            
            <Button
              onClick={superScanHongya}
              disabled={isDiagnosing || isLoading}
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold"
            >
              {isDiagnosing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  스캔 중...
                </>
              ) : (
                '🔍 전체 DB 슈퍼 스캔 (327개 데이터)'
              )}
            </Button>
            
            <Button
              onClick={migrateToIndividualKeys}
              disabled={isDiagnosing || isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  마이그레이션 중...
                </>
              ) : (
                '🔄 개별 키 방식으로 마이그레이션 (데이터 유실 방지)'
              )}
            </Button>
          </div>
          
          <div className="mt-3 p-3 bg-purple-100 border border-purple-300 rounded text-xs text-purple-900">
            <strong>💡 사용 가이드:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li><strong>🔄 개별 키 방식 마이그레이션</strong>: 전체 사용자 데이터를 게임 하나당 키 하나로 저장 (데이터 유실 완전 방지, 기존 데이터 삭제 안 함)</li>
              <li><strong>초정밀 진단 + 자동 복구</strong>: 7단계 완전 진단 후 문제 발견 시 백업에서 자동 복구 (권장)</li>
              <li><strong>🚑 백업에서 데이터 복구</strong>: 모든 백업 스캔 후 최대 데이터 복구 (백업 삭제 안 함)</li>
              <li><strong>📊 RAW 데이터 직접 조회</strong>: DB에 실제 저장된 데이터 확인 (중첩 배열 체크)</li>
              <li><strong>완전 진단</strong>: 6단계 진단만 수행 (복구 없음)</li>
              <li><strong>강제 로드</strong>: 4가지 로딩 방법 시도</li>
              <li><strong>🔍 전체 DB 슈퍼 스캔</strong>: 327개 데이터를 찾아 복구 가능 여부 확인</li>
            </ul>
          </div>

          {hongyaDataReport && (
            <div className="mt-4 bg-cyan-50 rounded-lg p-4 border-2 border-cyan-500">
              <h4 className="font-bold text-cyan-900 mb-3">📊 RAW 데이터 조회 결과</h4>
              
              {Object.entries(hongyaDataReport.keys).map(([key, data]: [string, any]) => {
                if (!data.exists) return null;
                
                return (
                  <div key={key} className="bg-white rounded p-3 mb-2 border border-cyan-200">
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-mono text-xs text-gray-600 break-all flex-1">{key}</div>
                      {data.isNestedArray && (
                        <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded whitespace-nowrap">
                          중첩 배열!
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">타입:</span>
                        <span className="ml-2 font-semibold">{data.isArray ? 'Array' : data.type}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">길이:</span>
                        <span className="ml-2 font-bold text-green-600">{data.length || 0}개</span>
                      </div>
                      
                      {data.isNestedArray && (
                        <>
                          <div className="col-span-2 bg-red-50 border border-red-200 rounded p-2">
                            <div className="text-red-700 font-semibold text-xs mb-1">⚠️ 중첩 배열 감지!</div>
                            <div className="text-red-600 text-xs">
                              첫 번째 배열 길이: <strong>{data.nestedLength}</strong>개
                            </div>
                            <div className="text-red-600 text-xs">
                              평탄화 시 총 개수: <strong>{data.totalIfFlattened}</strong>개
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    
                    {data.firstItemPreview && (
                      <details className="mt-2 pt-2 border-t border-gray-200">
                        <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-900 font-semibold">
                          첫 번째 아이템 미리보기
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                          {data.firstItemPreview}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}
              
              {hongyaDataReport.allUserKeys && hongyaDataReport.allUserKeys.length > 0 && (
                <details className="mt-3 pt-3 border-t border-cyan-300">
                  <summary className="cursor-pointer text-sm text-cyan-700 hover:text-cyan-900 font-semibold">
                    전체 키 목록 ({hongyaDataReport.allUserKeys.length}개)
                  </summary>
                  <div className="mt-2 space-y-1">
                    {hongyaDataReport.allUserKeys.map((keyInfo: any, idx: number) => (
                      <div key={idx} className="text-xs bg-white rounded p-2 border border-gray-200">
                        <div className="font-mono text-gray-600">{keyInfo.key}</div>
                        <div className="text-gray-500 mt-1">
                          {keyInfo.isArray ? `Array[${keyInfo.length}]` : keyInfo.type}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {diagnosisReport && (
            <div className="mt-4 bg-white rounded-lg p-4 border border-gray-200">
              <h4 className="font-bold text-gray-900 mb-2">📊 진단 결과</h4>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">키 발견:</span>
                  <span className="font-bold">{diagnosisReport.summary.keysFound}개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">보유 게임:</span>
                  <span className="font-bold text-green-600">{diagnosisReport.summary.ownedGames}개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">위시리스트:</span>
                  <span className="font-bold text-blue-600">{diagnosisReport.summary.wishlistGames}개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">백업:</span>
                  <span className="font-bold text-orange-600">{diagnosisReport.summary.backupsFound}개</span>
                </div>
              </div>

              {diagnosisReport.recommendations && diagnosisReport.recommendations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <h5 className="font-semibold text-gray-900 mb-2">💡 권장 사항:</h5>
                  <ul className="space-y-1 text-xs">
                    {diagnosisReport.recommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="text-gray-700">{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              <details className="mt-3 pt-3 border-t border-gray-200">
                <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-900 font-semibold">
                  상세 체크 내역 보기
                </summary>
                <div className="mt-2 space-y-2 text-xs">
                  {diagnosisReport.checks.map((check: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 rounded p-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">{check.check}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          check.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                          check.status === 'ERROR' ? 'bg-red-100 text-red-700' :
                          check.status === 'NOT_FOUND' ? 'bg-yellow-100 text-yellow-700' :
                          check.status === 'EMPTY' ? 'bg-gray-100 text-gray-700' :
                          check.status === 'FOUND' || check.status === 'AVAILABLE' || check.status === 'VALID' ? 'bg-green-100 text-green-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {check.status}
                        </span>
                      </div>
                      {check.count !== undefined && (
                        <div className="text-gray-600 mt-1">Count: {check.count}</div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}