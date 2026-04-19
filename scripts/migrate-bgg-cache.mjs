/**
 * BGG 캐시 마이그레이션 스크립트
 * 보드위키에 등록된 모든 게임의 BGG 데이터를 Supabase에 영구 캐싱합니다.
 *
 * 실행 방법:
 *   1. 아래 ADMIN_EMAIL / ADMIN_PASSWORD 를 실제 관리자 계정으로 채워넣기
 *   2. node scripts/migrate-bgg-cache.mjs
 */

const SUPABASE_URL = 'https://wwpvntmueafieessgnbu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cHZudG11ZWFmaWVlc3NnbmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MDczMjUsImV4cCI6MjA3MDI4MzMyNX0.KG4yuo02jACcVOlG7av3bMFmRcfHK6lzu0x78RMhz0c';
const SERVER_BASE = `${SUPABASE_URL}/functions/v1/make-server-0b7d3bae`;

// ✏️ 여기에 관리자 계정 입력
const ADMIN_EMAIL = '';
const ADMIN_PASSWORD = '';

async function getAdminToken() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL 과 ADMIN_PASSWORD 를 스크립트에 입력해주세요.');
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`로그인 실패: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function main() {
  console.log('🚀 BGG 캐시 마이그레이션 시작...');

  let token;
  try {
    token = await getAdminToken();
    console.log('✅ 관리자 로그인 성공');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  }

  console.log('📡 서버에 마이그레이션 요청 중... (게임 수에 따라 수 분 소요될 수 있습니다)');

  const res = await fetch(`${SERVER_BASE}/bgg-cache/migrate-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ 서버 오류 (${res.status}):`, err);
    process.exit(1);
  }

  const result = await res.json();
  console.log('\n✅ 마이그레이션 완료!');
  console.log(`   전체 게임: ${result.total}개`);
  console.log(`   새로 캐싱: ${result.cached}개`);
  console.log(`   이미 존재: ${result.skipped}개`);
  console.log(`   실패:      ${result.failed}개`);
  if (result.errors?.length) {
    console.log(`   실패한 BGG ID: ${result.errors.join(', ')}`);
  }
}

main();
