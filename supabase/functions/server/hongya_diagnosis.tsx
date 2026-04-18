import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// 🔍 홍야님 데이터 완전 진단 시스템
export async function diagnoseHongyaData(userId: string) {
  const report = {
    userId,
    userName: '홍야님',
    timestamp: new Date().toISOString(),
    checks: [] as any[],
    summary: {
      keysFound: 0,
      ownedGames: 0,
      wishlistGames: 0,
      backupsFound: 0,
      hasData: false,
      canRestore: false,
      errors: [] as string[]
    }
  };

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 [HONGYA DIAGNOSIS] Starting comprehensive check...');
  console.log(`   User ID: ${userId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ✅ Check 1: 모든 키 조회
  console.log('\n📋 [CHECK 1] Scanning all keys for user...');
  try {
    const { data: allKeys, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key")
      .like("key", `user_${userId}%`);

    if (error) {
      report.checks.push({
        check: 'Key Scan',
        status: 'ERROR',
        error: error.message
      });
      report.summary.errors.push(`Key scan failed: ${error.message}`);
    } else if (allKeys) {
      const keys = allKeys.map(k => k.key);
      report.summary.keysFound = keys.length;
      report.checks.push({
        check: 'Key Scan',
        status: 'SUCCESS',
        keysFound: keys.length,
        keys: keys
      });
      console.log(`   ✅ Found ${keys.length} keys:`);
      keys.forEach(k => console.log(`      - ${k}`));
    }
  } catch (e) {
    report.summary.errors.push(`Key scan exception: ${e}`);
  }

  // ✅ Check 2: owned 키 상태 확인
  console.log('\n🎮 [CHECK 2] Checking owned games key...');
  const ownedKey = `user_${userId}_owned`;
  try {
    const { data, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value")
      .eq("key", ownedKey)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        report.checks.push({
          check: 'Owned Games',
          status: 'NOT_FOUND',
          key: ownedKey,
          message: 'Key does not exist in database'
        });
        console.log(`   ⚠️ Key not found: ${ownedKey}`);
      } else {
        report.checks.push({
          check: 'Owned Games',
          status: 'ERROR',
          error: error.message
        });
        report.summary.errors.push(`Owned key error: ${error.message}`);
        console.log(`   ❌ Error: ${error.message}`);
      }
    } else if (data) {
      const valueType = typeof data.value;
      const isArray = Array.isArray(data.value);
      const count = isArray ? data.value.length : 0;
      
      report.summary.ownedGames = count;
      report.summary.hasData = count > 0;
      
      report.checks.push({
        check: 'Owned Games',
        status: count > 0 ? 'SUCCESS' : 'EMPTY',
        key: ownedKey,
        valueType,
        isArray,
        count,
        sample: isArray && data.value.length > 0 ? data.value[0] : null
      });
      
      console.log(`   ✅ Key exists: ${ownedKey}`);
      console.log(`      Type: ${valueType}, Is Array: ${isArray}, Count: ${count}`);
    }
  } catch (e) {
    report.summary.errors.push(`Owned key exception: ${e}`);
  }

  // ✅ Check 3: wishlist 키 상태 확인
  console.log('\n🎯 [CHECK 3] Checking wishlist games key...');
  const wishlistKey = `user_${userId}_wishlist`;
  try {
    const { data, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value")
      .eq("key", wishlistKey)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        report.checks.push({
          check: 'Wishlist Games',
          status: 'NOT_FOUND',
          key: wishlistKey
        });
        console.log(`   ⚠️ Key not found: ${wishlistKey}`);
      } else {
        report.checks.push({
          check: 'Wishlist Games',
          status: 'ERROR',
          error: error.message
        });
        console.log(`   ❌ Error: ${error.message}`);
      }
    } else if (data) {
      const isArray = Array.isArray(data.value);
      const count = isArray ? data.value.length : 0;
      
      report.summary.wishlistGames = count;
      
      report.checks.push({
        check: 'Wishlist Games',
        status: count > 0 ? 'SUCCESS' : 'EMPTY',
        key: wishlistKey,
        count
      });
      
      console.log(`   ✅ Key exists: ${wishlistKey}`);
      console.log(`      Count: ${count}`);
    }
  } catch (e) {
    report.summary.errors.push(`Wishlist key exception: ${e}`);
  }

  // ✅ Check 4: 백업 키 스캔
  console.log('\n💾 [CHECK 4] Scanning backup keys...');
  try {
    const { data: allKeys } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key")
      .like("key", `user_${userId}%`);

    if (allKeys) {
      const backupKeys = allKeys
        .map(k => k.key)
        .filter(k => k.includes('_backup'));

      report.summary.backupsFound = backupKeys.length;
      report.summary.canRestore = backupKeys.length > 0;

      if (backupKeys.length > 0) {
        report.checks.push({
          check: 'Backup Keys',
          status: 'FOUND',
          count: backupKeys.length,
          keys: backupKeys
        });
        console.log(`   ✅ Found ${backupKeys.length} backup keys:`);
        backupKeys.forEach(k => console.log(`      - ${k}`));

        // 가장 최신 백업 확인
        const sortedBackups = backupKeys
          .filter(k => k.includes('_owned'))
          .sort((a, b) => {
            const aTime = a.match(/_backup[_]?(\d+)?/)?.[1] || '0';
            const bTime = b.match(/_backup[_]?(\d+)?/)?.[1] || '0';
            return parseInt(bTime) - parseInt(aTime);
          });

        if (sortedBackups.length > 0) {
          const latestBackup = sortedBackups[0];
          console.log(`\n   🔍 Checking latest backup: ${latestBackup}`);
          
          const { data: backupData, error: backupError } = await supabase
            .from("kv_store_0b7d3bae")
            .select("value")
            .eq("key", latestBackup)
            .single();

          if (!backupError && backupData) {
            const backupCount = Array.isArray(backupData.value) ? backupData.value.length : 0;
            report.checks.push({
              check: 'Latest Backup',
              status: 'AVAILABLE',
              key: latestBackup,
              gameCount: backupCount
            });
            console.log(`      ✅ Contains ${backupCount} games`);
          }
        }
      } else {
        report.checks.push({
          check: 'Backup Keys',
          status: 'NOT_FOUND',
          message: 'No backup keys found'
        });
        console.log(`   ⚠️ No backup keys found`);
      }
    }
  } catch (e) {
    report.summary.errors.push(`Backup scan exception: ${e}`);
  }

  // ✅ Check 5: RLS 및 권한 확인
  console.log('\n🔒 [CHECK 5] Checking permissions...');
  try {
    // Service role로 조회하므로 RLS는 우회됨
    report.checks.push({
      check: 'Permissions',
      status: 'BYPASS',
      message: 'Using service role key (RLS bypassed)'
    });
    console.log(`   ✅ Using service role (RLS bypassed)`);
  } catch (e) {
    report.summary.errors.push(`Permission check exception: ${e}`);
  }

  // ✅ Check 6: 데이터 형식 검증
  console.log('\n🔍 [CHECK 6] Validating data format...');
  if (report.summary.ownedGames > 0) {
    try {
      const { data } = await supabase
        .from("kv_store_0b7d3bae")
        .select("value")
        .eq("key", ownedKey)
        .single();

      if (data && Array.isArray(data.value)) {
        const firstGame = data.value[0];
        const hasRequiredFields = firstGame && 
          typeof firstGame === 'object' &&
          'id' in firstGame;

        report.checks.push({
          check: 'Data Format',
          status: hasRequiredFields ? 'VALID' : 'INVALID',
          sampleGame: firstGame,
          hasRequiredFields
        });

        if (hasRequiredFields) {
          console.log(`   ✅ Data format is valid`);
          console.log(`      Sample game:`, JSON.stringify(firstGame, null, 2).substring(0, 200));
        } else {
          console.log(`   ⚠️ Data format may be invalid`);
          report.summary.errors.push('Data format validation failed');
        }
      }
    } catch (e) {
      report.summary.errors.push(`Format validation exception: ${e}`);
    }
  }

  // 최종 요약
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 [DIAGNOSIS SUMMARY]');
  console.log(`   Keys Found: ${report.summary.keysFound}`);
  console.log(`   Owned Games: ${report.summary.ownedGames}`);
  console.log(`   Wishlist Games: ${report.summary.wishlistGames}`);
  console.log(`   Backups Available: ${report.summary.backupsFound}`);
  console.log(`   Has Data: ${report.summary.hasData}`);
  console.log(`   Can Restore: ${report.summary.canRestore}`);
  console.log(`   Errors: ${report.summary.errors.length}`);
  
  if (report.summary.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    report.summary.errors.forEach(err => console.log(`   - ${err}`));
  }
  
  // 권장 사항
  const recommendations: string[] = [];
  
  if (report.summary.ownedGames === 0 && report.summary.backupsFound > 0) {
    recommendations.push('⚠️ OWNED 게임이 0개입니다. 백업에서 복구를 권장합니다.');
  }
  if (report.summary.keysFound === 0) {
    recommendations.push('❌ 사용자 키가 전혀 없습니다. 새로운 사용자이거나 데이터가 완전히 삭제되었습니다.');
  }
  if (report.summary.ownedGames > 0) {
    recommendations.push('✅ 데이터가 정상적으로 존재합니다.');
  }
  
  report.recommendations = recommendations;
  
  console.log('\n💡 [RECOMMENDATIONS]');
  recommendations.forEach(rec => console.log(`   ${rec}`));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return report;
}
