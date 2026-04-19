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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'sityplanner2@naver.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

async function getAdminToken() {
  if (!ADMIN_PASSWORD) {
    throw new Error('비밀번호를 환경변수로 전달해주세요: ADMIN_PASSWORD=비밀번호 node scripts/migrate-bgg-cache.mjs');
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

  let offset = 0;
  const limit = 10;
  let totalCached = 0, totalSkipped = 0, totalFailed = 0;
  const allErrors = [];
  let total = '?';

  while (true) {
    process.stdout.write(`\r📡 처리 중... offset=${offset} | 캐싱=${totalCached} 스킵=${totalSkipped} 실패=${totalFailed} / 전체=${total}   `);

    const res = await fetch(`${SERVER_BASE}/bgg-cache/migrate-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset, limit }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`\n❌ 서버 오류 (${res.status}):`, err);
      process.exit(1);
    }

    const result = await res.json();
    total = result.total;
    totalCached += result.cached;
    totalSkipped += result.skipped;
    totalFailed += result.failed;
    if (result.errors?.length) allErrors.push(...result.errors);

    if (result.done) break;
    offset = result.nextOffset;
  }

  console.log('\n\n✅ 마이그레이션 완료!');
  console.log(`   전체 게임: ${total}개`);
  console.log(`   새로 캐싱: ${totalCached}개`);
  console.log(`   이미 존재: ${totalSkipped}개`);
  console.log(`   실패:      ${totalFailed}개`);
  if (allErrors.length) {
    console.log(`   실패한 BGG ID: ${allErrors.join(', ')}`);
  }
}

main();
