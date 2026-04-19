import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// 🔥 홍야님 데이터 강제 로드 (모든 파싱 방법 시도)
export async function forceLoadHongyaData() {
  const userId = 'cc50eac9-0d05-43fa-bc62-0ea1eb712565';
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔥 [HONGYA FORCE LOAD] Starting...');
  console.log(`   User ID: ${userId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const ownedKey = `user_${userId}_owned`;
  const wishlistKey = `user_${userId}_wishlist`;
  
  // Method 1: kv.get 시도
  console.log('\n📥 [Method 1] Trying kv.get...');
  try {
    const ownedData = await kv.get(ownedKey);
    console.log(`   Result type: ${typeof ownedData}`);
    console.log(`   Is Array: ${Array.isArray(ownedData)}`);
    console.log(`   Length: ${Array.isArray(ownedData) ? ownedData.length : 'N/A'}`);
    
    if (Array.isArray(ownedData) && ownedData.length > 0) {
      console.log('✅ [Method 1] SUCCESS! Data loaded via kv.get');
      console.log(`   Sample game:`, JSON.stringify(ownedData[0]).substring(0, 200));
      return {
        success: true,
        method: 'kv.get',
        ownedGames: ownedData,
        wishlistGames: await kv.get(wishlistKey) || []
      };
    } else {
      console.log('⚠️ [Method 1] kv.get returned empty or non-array');
    }
  } catch (e) {
    console.error('❌ [Method 1] kv.get failed:', e);
  }
  
  // Method 2: Direct Supabase query
  console.log('\n📥 [Method 2] Trying direct Supabase query...');
  try {
    const { data, error } = await supabase
      .from("kv_store_0b7d3bae")
      .select("value")
      .eq("key", ownedKey)
      .single();
    
    if (error) {
      console.error('❌ [Method 2] Query error:', error);
    } else if (data) {
      console.log(`   Result type: ${typeof data.value}`);
      console.log(`   Is Array: ${Array.isArray(data.value)}`);
      console.log(`   Length: ${Array.isArray(data.value) ? data.value.length : 'N/A'}`);
      
      if (Array.isArray(data.value) && data.value.length > 0) {
        console.log('✅ [Method 2] SUCCESS! Data loaded via direct query');
        
        const { data: wishlistData } = await supabase
          .from("kv_store_0b7d3bae")
          .select("value")
          .eq("key", wishlistKey)
          .single();
        
        return {
          success: true,
          method: 'direct-query',
          ownedGames: data.value,
          wishlistGames: wishlistData?.value || []
        };
      } else {
        console.log('⚠️ [Method 2] Direct query returned empty or non-array');
      }
    }
  } catch (e) {
    console.error('❌ [Method 2] Direct query failed:', e);
  }
  
  // Method 3: Raw SQL query (JSONB를 TEXT로 캐스팅)
  console.log('\n📥 [Method 3] Trying raw SQL with TEXT cast...');
  try {
    const { data: rawData, error: rawError } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key, value")
      .eq("key", ownedKey);
    
    if (rawError) {
      console.error('❌ [Method 3] Raw query error:', rawError);
    } else if (rawData && rawData.length > 0) {
      const row = rawData[0];
      console.log(`   Key found: ${row.key}`);
      console.log(`   Value type: ${typeof row.value}`);
      console.log(`   Is Array: ${Array.isArray(row.value)}`);
      
      if (Array.isArray(row.value)) {
        console.log('✅ [Method 3] SUCCESS! Data loaded via raw query');
        console.log(`   Count: ${row.value.length}`);
        
        const { data: wishlistRaw } = await supabase
          .from("kv_store_0b7d3bae")
          .select("value")
          .eq("key", wishlistKey);
        
        return {
          success: true,
          method: 'raw-query',
          ownedGames: row.value,
          wishlistGames: wishlistRaw?.[0]?.value || []
        };
      }
      
      // 문자열인 경우 파싱 시도
      if (typeof row.value === 'string') {
        console.log('   Value is string, trying to parse...');
        try {
          const parsed = JSON.parse(row.value);
          if (Array.isArray(parsed)) {
            console.log('✅ [Method 3] SUCCESS! Data parsed from string');
            console.log(`   Count: ${parsed.length}`);
            return {
              success: true,
              method: 'raw-query-parsed',
              ownedGames: parsed,
              wishlistGames: []
            };
          }
        } catch (parseError) {
          console.error('❌ [Method 3] Parse failed:', parseError);
        }
      }
    } else {
      console.log('❌ [Method 3] No data found with key:', ownedKey);
    }
  } catch (e) {
    console.error('❌ [Method 3] Raw query failed:', e);
  }
  
  // Method 4: Check if key exists at all
  console.log('\n📥 [Method 4] Checking if key exists...');
  try {
    const { data: allKeys, error: keysError } = await supabase
      .from("kv_store_0b7d3bae")
      .select("key")
      .like("key", `user_${userId}%`);
    
    if (keysError) {
      console.error('❌ [Method 4] Keys query error:', keysError);
    } else if (allKeys) {
      console.log(`   Found ${allKeys.length} keys for user:`);
      allKeys.forEach(k => console.log(`      - ${k.key}`));
      
      // 백업이 있는지 확인
      const backupKeys = allKeys.filter(k => k.key.includes('_backup') && k.key.includes('_owned'));
      if (backupKeys.length > 0) {
        console.log(`\n   ⚠️ OWNED key not found, but ${backupKeys.length} backups exist!`);
        console.log(`   Latest backup: ${backupKeys[0].key}`);
        
        // 백업에서 로드 시도
        const { data: backupData } = await supabase
          .from("kv_store_0b7d3bae")
          .select("value")
          .eq("key", backupKeys[0].key)
          .single();
        
        if (backupData && Array.isArray(backupData.value)) {
          console.log('✅ [Method 4] Found data in backup!');
          console.log(`   Count: ${backupData.value.length}`);
          
          return {
            success: true,
            method: 'backup-fallback',
            ownedGames: backupData.value,
            wishlistGames: [],
            warning: 'Loaded from backup! Original owned key is missing.'
          };
        }
      }
    }
  } catch (e) {
    console.error('❌ [Method 4] Keys check failed:', e);
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('❌ [HONGYA FORCE LOAD] ALL METHODS FAILED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return {
    success: false,
    error: 'All load methods failed',
    ownedGames: [],
    wishlistGames: []
  };
}
