import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// 🔬 홍야님 데이터 초정밀 진단 + 자동 복구
export async function diagnoseAndRecoverHongya() {
  const userId = 'cc50eac9-0d05-43fa-bc62-0ea1eb712565';
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 [HONGYA PRECISION DIAGNOSIS] Starting ultra-detailed check...');
  console.log(`   User ID: ${userId}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const report: any = {
    userId,
    timestamp: new Date().toISOString(),
    keyCheck: null,
    rawDataCheck: null,
    parseCheck: null,
    backupCheck: null,
    recoveryAttempt: null,
    finalResult: null
  };
  
  // ========================================
  // STEP 1: 키 생성 규칙 확인
  // ========================================
  console.log('\n📋 [STEP 1] KEY NAMING VERIFICATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const expectedOwnedKey = `user_${userId}_owned`;
  const expectedWishlistKey = `user_${userId}_wishlist`;
  const shortIdKey = `user_${userId.substring(0, 8)}_owned`; // 혹시 앞 8자리만 사용?
  
  console.log(`   Expected owned key (full UUID):  "${expectedOwnedKey}"`);
  console.log(`   Expected owned key (short ID):   "${shortIdKey}"`);
  console.log(`   Key length (full): ${expectedOwnedKey.length}`);
  console.log(`   Key length (short): ${shortIdKey.length}`);
  
  report.keyCheck = {
    fullKey: expectedOwnedKey,
    shortKey: shortIdKey,
    fullKeyLength: expectedOwnedKey.length,
    shortKeyLength: shortIdKey.length
  };
  
  // ========================================
  // STEP 2: 실제 키 존재 확인
  // ========================================
  console.log('\n🔍 [STEP 2] CHECKING KEY EXISTENCE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const { data: allUserKeys, error: keysError } = await supabase
    .from("kv_store_0b7d3bae")
    .select("key")
    .like("key", `user_${userId}%`);
  
  if (keysError) {
    console.error('❌ [STEP 2] Error querying keys:', keysError);
    report.keyCheck.error = keysError.message;
  } else if (allUserKeys) {
    const keyNames = allUserKeys.map(k => k.key);
    console.log(`   Found ${keyNames.length} keys for this user:`);
    keyNames.forEach((k, idx) => {
      const isMain = k === expectedOwnedKey;
      const isBackup = k.includes('_backup') || k.includes('_slot');
      console.log(`   ${idx + 1}. ${isMain ? '🎯 [MAIN]' : isBackup ? '💾 [BACKUP]' : '📝 [OTHER]'} "${k}"`);
    });
    
    const mainKeyExists = keyNames.includes(expectedOwnedKey);
    const backupKeys = keyNames.filter(k => k.includes('_owned') && (k.includes('_backup') || k.includes('_slot')));
    
    console.log(`\n   Main key exists: ${mainKeyExists ? '✅ YES' : '❌ NO'}`);
    console.log(`   Backup keys found: ${backupKeys.length}`);
    
    report.keyCheck.exists = mainKeyExists;
    report.keyCheck.allKeys = keyNames;
    report.keyCheck.backupKeys = backupKeys;
  }
  
  // ========================================
  // STEP 3: RAW 데이터 조회 (value 그대로)
  // ========================================
  console.log('\n📦 [STEP 3] RAW DATA RETRIEVAL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const { data: rawRow, error: rawError } = await supabase
    .from("kv_store_0b7d3bae")
    .select("key, value")
    .eq("key", expectedOwnedKey)
    .maybeSingle();
  
  if (rawError) {
    console.error('❌ [STEP 3] Error fetching raw data:', rawError);
    report.rawDataCheck = { error: rawError.message };
  } else if (!rawRow) {
    console.log('❌ [STEP 3] Key not found in database');
    report.rawDataCheck = { found: false };
  } else {
    console.log('✅ [STEP 3] Raw data retrieved successfully');
    console.log(`   Key: "${rawRow.key}"`);
    console.log(`   Value type: ${typeof rawRow.value}`);
    console.log(`   Value constructor: ${rawRow.value?.constructor?.name}`);
    console.log(`   Is Array: ${Array.isArray(rawRow.value)}`);
    
    if (Array.isArray(rawRow.value)) {
      console.log(`   Array length: ${rawRow.value.length}`);
      console.log(`   First element type: ${typeof rawRow.value[0]}`);
      
      // HEAD: 첫 100자
      const firstItemStr = JSON.stringify(rawRow.value[0] || null);
      console.log(`\n   📄 HEAD (first item, first 150 chars):`);
      console.log(`   ${firstItemStr.substring(0, 150)}${firstItemStr.length > 150 ? '...' : ''}`);
      
      // TAIL: 마지막 100자
      const lastItemStr = JSON.stringify(rawRow.value[rawRow.value.length - 1] || null);
      console.log(`\n   📄 TAIL (last item, first 150 chars):`);
      console.log(`   ${lastItemStr.substring(0, 150)}${lastItemStr.length > 150 ? '...' : ''}`);
      
      report.rawDataCheck = {
        found: true,
        isArray: true,
        length: rawRow.value.length,
        firstItem: rawRow.value[0],
        lastItem: rawRow.value[rawRow.value.length - 1],
        firstItemPreview: firstItemStr.substring(0, 200),
        lastItemPreview: lastItemStr.substring(0, 200)
      };
    } else if (typeof rawRow.value === 'string') {
      console.log(`   String length: ${rawRow.value.length}`);
      console.log(`\n   📄 HEAD (first 200 chars):`);
      console.log(`   ${rawRow.value.substring(0, 200)}`);
      console.log(`\n   📄 TAIL (last 200 chars):`);
      console.log(`   ${rawRow.value.substring(rawRow.value.length - 200)}`);
      
      report.rawDataCheck = {
        found: true,
        isString: true,
        length: rawRow.value.length,
        head: rawRow.value.substring(0, 200),
        tail: rawRow.value.substring(rawRow.value.length - 200)
      };
    } else {
      console.log(`   Unexpected type!`);
      report.rawDataCheck = {
        found: true,
        unexpectedType: typeof rawRow.value,
        value: rawRow.value
      };
    }
  }
  
  // ========================================
  // STEP 4: JSON 파싱 시도
  // ========================================
  console.log('\n🔧 [STEP 4] JSON PARSING ATTEMPT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (rawRow?.value) {
    if (Array.isArray(rawRow.value)) {
      console.log('✅ [STEP 4] Value is already an array (Postgres auto-parsed JSONB)');
      console.log(`   Length: ${rawRow.value.length}`);
      console.log(`   Sample game:`, rawRow.value[0]);
      
      report.parseCheck = {
        success: true,
        method: 'postgres-auto-parse',
        length: rawRow.value.length,
        parsedData: rawRow.value
      };
    } else if (typeof rawRow.value === 'string') {
      console.log('⚠️ [STEP 4] Value is string, attempting manual parse...');
      
      try {
        const parsed = JSON.parse(rawRow.value);
        console.log('✅ [STEP 4] Manual parse SUCCESS');
        console.log(`   Type: ${typeof parsed}`);
        console.log(`   Is Array: ${Array.isArray(parsed)}`);
        console.log(`   Length: ${Array.isArray(parsed) ? parsed.length : 'N/A'}`);
        
        report.parseCheck = {
          success: true,
          method: 'manual-parse',
          length: Array.isArray(parsed) ? parsed.length : 0,
          parsedData: parsed
        };
      } catch (parseError: any) {
        console.error('❌ [STEP 4] Manual parse FAILED');
        console.error(`   Error: ${parseError.message}`);
        console.error(`   Error position: ${parseError.message.match(/position (\d+)/)?.[1] || 'unknown'}`);
        
        // 에러 위치 주변 텍스트 출력
        const position = parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0');
        if (position > 0) {
          const start = Math.max(0, position - 50);
          const end = Math.min(rawRow.value.length, position + 50);
          console.error(`   Context around error (position ${position}):`);
          console.error(`   "${rawRow.value.substring(start, end)}"`);
        }
        
        report.parseCheck = {
          success: false,
          method: 'manual-parse',
          error: parseError.message,
          errorPosition: position
        };
      }
    }
  } else {
    console.log('❌ [STEP 4] No data to parse');
    report.parseCheck = { success: false, reason: 'no-data' };
  }
  
  // ========================================
  // STEP 5: kv.get() 시도
  // ========================================
  console.log('\n🔑 [STEP 5] KV.GET() ATTEMPT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const kvResult = await kv.get(expectedOwnedKey);
    console.log(`   Type: ${typeof kvResult}`);
    console.log(`   Is Array: ${Array.isArray(kvResult)}`);
    console.log(`   Length: ${Array.isArray(kvResult) ? kvResult.length : 'N/A'}`);
    
    if (Array.isArray(kvResult) && kvResult.length > 0) {
      console.log('✅ [STEP 5] kv.get() returned valid data!');
      report.kvGetCheck = {
        success: true,
        length: kvResult.length,
        sample: kvResult[0]
      };
    } else {
      console.log('⚠️ [STEP 5] kv.get() returned empty or invalid data');
      report.kvGetCheck = {
        success: false,
        result: kvResult
      };
    }
  } catch (kvError: any) {
    console.error('❌ [STEP 5] kv.get() threw error:', kvError.message);
    report.kvGetCheck = {
      success: false,
      error: kvError.message
    };
  }
  
  // ========================================
  // STEP 6: 백업 키 확인
  // ========================================
  console.log('\n💾 [STEP 6] BACKUP KEYS CHECK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const backupKeysToCheck = [
    `user_${userId}_owned_backup`,
    `user_${userId}_slot1_owned`,
    `user_${userId}_slot2_owned`,
    `user_${userId}_slot3_owned`,
  ];
  
  const backupResults: any[] = [];
  
  for (const backupKey of backupKeysToCheck) {
    try {
      const { data: backupData, error: backupError } = await supabase
        .from("kv_store_0b7d3bae")
        .select("value")
        .eq("key", backupKey)
        .maybeSingle();
      
      if (backupError || !backupData) {
        console.log(`   ⚪ "${backupKey}": Not found`);
        backupResults.push({ key: backupKey, found: false });
      } else {
        const isArray = Array.isArray(backupData.value);
        const length = isArray ? backupData.value.length : 0;
        console.log(`   ${length > 0 ? '✅' : '⚠️'} "${backupKey}": ${length} games`);
        backupResults.push({
          key: backupKey,
          found: true,
          length,
          hasData: length > 0,
          data: backupData.value
        });
      }
    } catch (e) {
      console.log(`   ❌ "${backupKey}": Error checking`);
      backupResults.push({ key: backupKey, error: String(e) });
    }
  }
  
  const validBackups = backupResults.filter(b => b.found && b.hasData);
  console.log(`\n   Valid backups found: ${validBackups.length}`);
  
  report.backupCheck = {
    checked: backupKeysToCheck,
    results: backupResults,
    validBackups: validBackups.length
  };
  
  // ========================================
  // STEP 7: 자동 복구 시도
  // ========================================
  console.log('\n🔧 [STEP 7] AUTO-RECOVERY ATTEMPT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const shouldRecover = report.parseCheck?.success === false || 
                        report.kvGetCheck?.success === false ||
                        (report.rawDataCheck?.isArray && report.rawDataCheck.length === 0);
  
  if (shouldRecover && validBackups.length > 0) {
    console.log('⚠️ [STEP 7] Main key has issues but backup exists!');
    console.log('🔄 [STEP 7] Starting automatic recovery...');
    
    // 가장 큰 백업 선택
    const bestBackup = validBackups.sort((a, b) => b.length - a.length)[0];
    console.log(`   Selected backup: "${bestBackup.key}" (${bestBackup.length} games)`);
    
    try {
      // 메인 키를 백업 데이터로 덮어쓰기
      await kv.set(expectedOwnedKey, bestBackup.data);
      console.log(`✅ [STEP 7] Main key restored from backup!`);
      
      // 복구 확인
      const verifyData = await kv.get(expectedOwnedKey);
      const verifyLength = Array.isArray(verifyData) ? verifyData.length : 0;
      console.log(`   Verification: ${verifyLength} games now in main key`);
      
      report.recoveryAttempt = {
        performed: true,
        success: verifyLength > 0,
        sourceBackup: bestBackup.key,
        gamesRestored: verifyLength,
        verifiedData: verifyData
      };
      
      if (verifyLength > 0) {
        console.log('🎉 [STEP 7] RECOVERY SUCCESSFUL!');
      }
    } catch (recoveryError: any) {
      console.error('❌ [STEP 7] Recovery failed:', recoveryError.message);
      report.recoveryAttempt = {
        performed: true,
        success: false,
        error: recoveryError.message
      };
    }
  } else if (!shouldRecover) {
    console.log('✅ [STEP 7] No recovery needed - data is OK');
    report.recoveryAttempt = {
      performed: false,
      reason: 'data-ok'
    };
  } else {
    console.log('❌ [STEP 7] Recovery needed but no valid backup found');
    report.recoveryAttempt = {
      performed: false,
      reason: 'no-backup'
    };
  }
  
  // ========================================
  // FINAL: 최종 상태 확인
  // ========================================
  console.log('\n🏁 [FINAL] FINAL STATE CHECK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const finalData = await kv.get(expectedOwnedKey);
    const finalLength = Array.isArray(finalData) ? finalData.length : 0;
    const finalIsValid = finalLength > 0;
    
    console.log(`   Main key: "${expectedOwnedKey}"`);
    console.log(`   Status: ${finalIsValid ? '✅ VALID' : '❌ INVALID'}`);
    console.log(`   Games: ${finalLength}`);
    
    report.finalResult = {
      valid: finalIsValid,
      length: finalLength,
      canLoad: finalIsValid
    };
    
    if (finalIsValid) {
      console.log('\n🎉🎉🎉 SUCCESS! Data is now loadable! 🎉🎉🎉');
    } else {
      console.log('\n❌ FAILED: Data still not loadable');
    }
  } catch (e) {
    console.error('❌ [FINAL] Error checking final state:', e);
    report.finalResult = {
      valid: false,
      error: String(e)
    };
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 [DIAGNOSIS COMPLETE]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return report;
}
