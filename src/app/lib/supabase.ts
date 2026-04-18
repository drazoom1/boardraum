import { createBrowserClient } from '@supabase/ssr';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// 🧹 기존 쿠키 세션 데이터 정리 (한 번만 실행)
function cleanupOldCookieSessions() {
  console.log('🧹 [Migration] Cleaning up old cookie-based sessions...');
  
  // Supabase 관련 쿠키 모두 삭제
  const cookies = document.cookie.split(';');
  let cleanedCount = 0;
  
  for (let cookie of cookies) {
    const cookieName = cookie.split('=')[0].trim();
    
    // sb- 로 시작하는 모든 Supabase 쿠키 삭제
    if (cookieName.startsWith('sb-')) {
      document.cookie = `${cookieName}=; path=/; max-age=0`;
      document.cookie = `${cookieName}=; path=/; domain=${window.location.hostname}; max-age=0`;
      document.cookie = `${cookieName}=; path=/; domain=.${window.location.hostname}; max-age=0`;
      cleanedCount++;
      console.log(`🧹 [Migration] Deleted cookie: ${cookieName}`);
    }
  }
  
  console.log(`✅ [Migration] Cleaned up ${cleanedCount} cookie(s)`);
  
  // 마이그레이션 완료 표시 (localStorage에 저장하여 한 번만 실행)
  if (cleanedCount > 0) {
    localStorage.setItem('supabase-migration-done', 'true');
  }
}

// Create a singleton Supabase client with localStorage-based session persistence
let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient() {
  if (!supabaseInstance) {
    console.log('🔧 [Supabase] Initializing client...');
    
    // 마이그레이션이 아직 안 됐으면 실행
    if (!localStorage.getItem('supabase-migration-done')) {
      cleanupOldCookieSessions();
      // 쿠키가 없어도 한 번만 실행되도록 마킹
      localStorage.setItem('supabase-migration-done', 'true');
    }
    
    // localStorage 상태 확인
    console.log('💾 [Supabase] localStorage keys:', Object.keys(localStorage));
    console.log('💾 [Supabase] supabase-auth-token exists:', !!localStorage.getItem('supabase-auth-token'));
    
    supabaseInstance = createBrowserClient(
      `https://${projectId}.supabase.co`,
      publicAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'supabase-auth-token',
          storage: window.localStorage,
          detectSessionInUrl: false,
          // flowType 제거: 비밀번호 로그인에는 pkce 불필요, implicit 사용
        }
      }
    );
    
    console.log('✅ [Supabase] Client initialized with localStorage-based session management');
    console.log('📦 [Supabase] Storage key: supabase-auth-token');
    console.log('💾 [Supabase] Storage type: localStorage');
  }
  return supabaseInstance;
}

// 🔐 세션 복원 함수
export async function restoreSession() {
  const supabase = getSupabaseClient();
  
  console.log('🔐 [Session] Attempting to restore session...');
  console.log('💾 [Session] localStorage.length:', localStorage.length);
  console.log('💾 [Session] localStorage keys:', Object.keys(localStorage));
  
  try {
    // 1. 먼저 현재 세션 확인
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ [Session] Error getting session:', error);
      return null;
    }
    
    if (session) {
      console.log('✅ [Session] Session found!');
      console.log('👤 [Session] User:', session.user.email);
      console.log('🔑 [Session] Token length:', session.access_token.length);
      return session;
    }
    
    console.log('⚠️ [Session] No session found, trying to refresh...');
    
    // 2. 세션이 없으면 리프레시 시도
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError) {
      console.error('❌ [Session] Refresh failed:', refreshError);
      return null;
    }
    
    if (refreshData.session) {
      console.log('✅ [Session] Session refreshed successfully!');
      console.log('👤 [Session] User:', refreshData.session.user.email);
      return refreshData.session;
    }
    
    console.log('ℹ️ [Session] No session available');
    return null;
    
  } catch (error) {
    console.error('❌ [Session] Restore error:', error);
    return null;
  }
}

// Helper function to normalize email (대소문자, 공백 제거)
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

// 관리자 이메일 체크 (정규화된 이메일로 비교)
export function isAdminEmail(email: string | null | undefined): boolean {
  const adminEmail = 'sityplanner2@naver.com';
  const normalized = normalizeEmail(email);
  const isAdmin = normalized === normalizeEmail(adminEmail);
  console.log(`👤 [Admin Check] Email: "${normalized}", IsAdmin: ${isAdmin}`);
  return isAdmin;
}