/**
 * 🛡️ Safe Fetch with detailed logging and HTML response handling
 * 🔐 Includes automatic JWT token refresh on expiration
 */

interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retryOnTokenExpired?: boolean; // 기본값 true
}

interface SafeFetchResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  contentType?: string;
  rawResponse?: string;
  tokenRefreshed?: boolean;
}

/**
 * 🔐 JWT 토큰 자동 갱신 함수
 */
async function refreshAccessToken(): Promise<string | null> {
  console.log('🔐 [TOKEN REFRESH] Attempting to refresh expired token...');
  
  try {
    // Dynamic import to avoid circular dependency
    const { getSupabaseClient } = await import('../lib/supabase');
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      console.error('❌ [TOKEN REFRESH] Failed:', error.message);
      return null;
    }
    
    if (data?.session?.access_token) {
      console.log('✅ [TOKEN REFRESH] Success! New token obtained');
      console.log(`   Token length: ${data.session.access_token.length}`);
      console.log(`   Expires at: ${new Date(data.session.expires_at! * 1000).toISOString()}`);
      return data.session.access_token;
    }
    
    console.warn('⚠️ [TOKEN REFRESH] No session returned');
    return null;
  } catch (error) {
    console.error('❌ [TOKEN REFRESH] Exception:', error);
    return null;
  }
}

/**
 * 🔍 JWT 만료 감지 함수
 */
function isTokenExpiredError(status: number, data: any, contentType: string): boolean {
  // 403 + bad_jwt 또는 token is expired
  if (status === 403 && contentType.includes('application/json')) {
    const errorMsg = JSON.stringify(data).toLowerCase();
    return errorMsg.includes('bad_jwt') || 
           errorMsg.includes('token is expired') ||
           errorMsg.includes('invalid jwt');
  }
  return false;
}

export async function safeFetch<T = any>(
  url: string, 
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult<T>> {
  const startTime = Date.now();
  const retryOnTokenExpired = options.retryOnTokenExpired !== false; // 기본값 true
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌐 [SAFE FETCH] Request starting...');
  console.log(`   URL: ${url}`);
  console.log(`   Method: ${options.method || 'GET'}`);
  console.log(`   Headers:`, options.headers);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log(`   Auto-retry on token expired: ${retryOnTokenExpired}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Timeout handling
    const timeout = options.timeoutMs || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const duration = Date.now() - startTime;
    
    console.log('\n📥 [SAFE FETCH] Response received');
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Content-Type: ${response.headers.get('content-type') || 'not set'}`);
    console.log(`   Content-Length: ${response.headers.get('content-length') || 'unknown'}`);
    
    const contentType = response.headers.get('content-type') || '';
    
    // ========================================
    // Check if response is JSON
    // ========================================
    if (contentType.includes('application/json')) {
      console.log('   ✅ Response is JSON');
      
      try {
        const jsonData = await response.json();
        
        console.log('   ✅ JSON parse successful');
        console.log(`   Response preview:`, JSON.stringify(jsonData).substring(0, 200));
        
        // ========================================
        // 🔐 JWT 만료 감지 및 자동 갱신
        // ========================================
        if (retryOnTokenExpired && isTokenExpiredError(response.status, jsonData, contentType)) {
          console.warn('⚠️ [TOKEN EXPIRED] Detected expired JWT token!');
          console.warn(`   Error: ${JSON.stringify(jsonData)}`);
          
          const newToken = await refreshAccessToken();
          
          if (newToken && options.headers?.Authorization) {
            console.log('🔄 [RETRY] Retrying request with new token...');
            
            // 새 토큰으로 재시도
            const retryOptions = {
              ...options,
              headers: {
                ...options.headers,
                Authorization: `Bearer ${newToken}`
              },
              retryOnTokenExpired: false // 무한 루프 방지
            };
            
            const retryResult = await safeFetch<T>(url, retryOptions);
            
            if (retryResult.success) {
              console.log('✅ [RETRY] Request succeeded with new token!');
              return {
                ...retryResult,
                tokenRefreshed: true
              };
            } else {
              console.error('❌ [RETRY] Request failed even with new token');
            }
          } else {
            console.error('❌ [TOKEN REFRESH] Failed to obtain new token');
            console.error('   User needs to log in again');
          }
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        return {
          success: response.ok,
          data: jsonData,
          status: response.status,
          contentType
        };
      } catch (parseError) {
        console.error('   ❌ JSON parse failed!');
        console.error(`   Error:`, parseError);
        
        // Try to get raw text
        const rawText = await response.text().catch(() => '[unable to read response text]');
        console.error(`   Raw response (first 500 chars):`, rawText.substring(0, 500));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        return {
          success: false,
          error: `JSON parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          status: response.status,
          contentType,
          rawResponse: rawText.substring(0, 1000)
        };
      }
    }
    
    // ========================================
    // Response is HTML or other format
    // ========================================
    else if (contentType.includes('text/html')) {
      console.log('   ⚠️ Response is HTML (not JSON!)');
      
      const htmlText = await response.text();
      console.log(`   HTML preview (first 200 chars):`);
      console.log(`   ${htmlText.substring(0, 200)}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      return {
        success: false,
        error: 'Server returned HTML instead of JSON. This usually means:\n' +
               '1. The endpoint URL is incorrect\n' +
               '2. The request is being redirected to an HTML page\n' +
               '3. There is a proxy/rewrite rule interfering\n' +
               '4. Supabase Auth configuration is incorrect',
        status: response.status,
        contentType,
        rawResponse: htmlText.substring(0, 1000)
      };
    }
    
    // ========================================
    // Unknown content type
    // ========================================
    else {
      console.log(`   ⚠️ Unexpected content-type: ${contentType}`);
      
      const rawText = await response.text();
      console.log(`   Raw response (first 200 chars):`);
      console.log(`   ${rawText.substring(0, 200)}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      return {
        success: false,
        error: `Unexpected content-type: ${contentType}`,
        status: response.status,
        contentType,
        rawResponse: rawText.substring(0, 1000)
      };
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ [SAFE FETCH] Request failed!');
    console.error(`   Duration: ${duration}ms`);
    console.error(`   Error:`, error);
    console.error(`   Error type:`, error instanceof Error ? error.constructor.name : typeof error);
    
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      console.error(`   Stack:`, error.stack);
    }
    
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network request failed'
    };
  }
}

/**
 * 🔐 Check Supabase configuration
 */
export function checkSupabaseConfig() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 [CONFIG CHECK] Supabase Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Check multiple sources for config
  const sources = {
    importMeta: {
      projectId: import.meta.env?.VITE_SUPABASE_PROJECT_ID,
      url: import.meta.env?.VITE_SUPABASE_URL,
      anonKey: import.meta.env?.VITE_SUPABASE_ANON_KEY,
    },
    window: typeof window !== 'undefined' ? {
      projectId: (window as any).SUPABASE_PROJECT_ID,
      url: (window as any).SUPABASE_URL,
      anonKey: (window as any).SUPABASE_ANON_KEY,
    } : null,
    processEnv: typeof process !== 'undefined' && process.env ? {
      publicUrl: (process.env as any).NEXT_PUBLIC_SUPABASE_URL,
      publicKey: (process.env as any).NEXT_PUBLIC_SUPABASE_ANON_KEY,
    } : null
  };
  
  console.log('📋 Environment Variable Sources:');
  console.log('   import.meta.env:', sources.importMeta);
  console.log('   window globals:', sources.window);
  console.log('   process.env (NEXT_PUBLIC_*):', sources.processEnv);
  
  const projectId = sources.importMeta.projectId || sources.window?.projectId;
  const supabaseUrl = sources.importMeta.url || sources.window?.url || sources.processEnv?.publicUrl;
  const anonKey = sources.importMeta.anonKey || sources.window?.anonKey || sources.processEnv?.publicKey;
  
  console.log('\n🎯 Final Configuration (after fallbacks):');
  console.log(`   Project ID: ${projectId || '❌ NOT SET'}`);
  console.log(`   Supabase URL: ${supabaseUrl || '❌ NOT SET'}`);
  console.log(`   Anon Key: ${anonKey ? `${anonKey.substring(0, 20)}...` : '❌ NOT SET'}`);
  console.log(`   Anon Key length: ${anonKey?.length || 0}`);
  
  const expectedUrl = projectId ? `https://${projectId}.supabase.co` : 'unknown';
  const urlMatches = supabaseUrl === expectedUrl;
  
  console.log(`\n   Expected URL format: ${expectedUrl}`);
  console.log(`   Actual URL: ${supabaseUrl || 'not set'}`);
  console.log(`   URL matches: ${urlMatches ? '✅ YES' : '❌ NO'}`);
  
  // Check for common issues
  const issues: string[] = [];
  if (!projectId) issues.push('Project ID is missing');
  if (!supabaseUrl) issues.push('Supabase URL is missing');
  if (!anonKey) issues.push('Anon Key is missing');
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    issues.push('Supabase URL must start with https://');
  }
  if (supabaseUrl && supabaseUrl.includes('localhost')) {
    issues.push('⚠️ Using localhost - Auth may not work');
  }
  
  const allSet = projectId && supabaseUrl && anonKey;
  console.log(`\n   Configuration: ${allSet ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);
  
  if (issues.length > 0) {
    console.log('\n   ⚠️ Configuration Issues:');
    issues.forEach(issue => console.log(`      - ${issue}`));
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return {
    projectId,
    supabaseUrl,
    anonKey,
    allSet,
    urlMatches,
    issues
  };
}
