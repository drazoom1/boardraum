-- ============================================
-- BOARDRAUM 백업 시스템 SQL 쿼리 모음
-- ============================================
-- Supabase Dashboard → SQL Editor에서 사용하세요
-- ============================================

-- 📊 1. 백업 전체 통계
SELECT 
    COUNT(*) as "총 백업 수",
    COUNT(DISTINCT (value->>'user_id')) as "백업 있는 유저 수",
    pg_size_pretty(SUM(octet_length(value::text))) as "총 백업 용량"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%';

-- 📋 2. 최근 백업 20개 보기
SELECT 
    key as "백업 키",
    (value->>'created_at') as "생성 시간",
    (value->>'user_id') as "유저 ID",
    (value->>'game_count') as "총 게임 수",
    (value->'backup_data'->'ownedGames') as "보유 게임 (JSON)",
    (value->'backup_data'->'wishlistGames') as "위시리스트 (JSON)"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
ORDER BY (value->>'created_at') DESC
LIMIT 20;

-- 👤 3. 특정 사용자의 백업 찾기 (USER_ID 교체 필요)
-- 사용자 ID는 Supabase Auth에서 확인하거나
-- SELECT DISTINCT (value->>'user_id') FROM kv_store_0b7d3bae WHERE key LIKE 'user_%_owned';
SELECT 
    key,
    (value->>'created_at') as "백업 시간",
    (value->>'game_count') as "게임 수",
    jsonb_array_length(value->'backup_data'->'ownedGames') as "보유 게임 수",
    jsonb_array_length(value->'backup_data'->'wishlistGames') as "위시리스트 수"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_user_YOUR_USER_ID_HERE_%'
ORDER BY key DESC;

-- 🔍 4. 모든 사용자 목록과 백업 상태
WITH user_list AS (
    SELECT DISTINCT 
        SUBSTRING(key FROM 'user_([0-9a-f-]+)_') as user_id
    FROM kv_store_0b7d3bae
    WHERE key LIKE 'user_%_owned'
),
backup_count AS (
    SELECT 
        (value->>'user_id') as user_id,
        COUNT(*) as backup_count,
        MAX((value->>'created_at')::timestamp) as last_backup
    FROM kv_store_0b7d3bae
    WHERE key LIKE 'backup_%'
    GROUP BY (value->>'user_id')
)
SELECT 
    u.user_id,
    COALESCE(b.backup_count, 0) as "백업 개수",
    b.last_backup as "마지막 백업 시간",
    CASE 
        WHEN b.backup_count IS NULL THEN '⚠️ 백업 없음'
        WHEN b.backup_count >= 3 THEN '✅ 정상 (3개)'
        ELSE '⚠️ ' || b.backup_count || '개만 있음'
    END as "상태"
FROM user_list u
LEFT JOIN backup_count b ON u.user_id = b.user_id
ORDER BY b.last_backup DESC NULLS LAST;

-- 📅 5. 오늘 생성된 백업
SELECT 
    key,
    (value->>'created_at') as "백업 시간",
    (value->>'user_id') as "유저 ID",
    (value->>'game_count') as "게임 수"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
  AND (value->>'created_at')::timestamp >= CURRENT_DATE
ORDER BY (value->>'created_at') DESC;

-- 🕐 6. 최근 24시간 내 백업
SELECT 
    key,
    (value->>'created_at') as "백업 시간",
    (value->>'game_count') as "게임 수"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
  AND (value->>'created_at')::timestamp > NOW() - INTERVAL '24 hours'
ORDER BY (value->>'created_at') DESC;

-- 🗑️ 7. 오래된 백업 찾기 (30일 이상)
SELECT 
    key,
    (value->>'created_at') as "백업 시간",
    (value->>'user_id') as "유저 ID",
    AGE(NOW(), (value->>'created_at')::timestamp) as "경과 시간"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
  AND (value->>'created_at')::timestamp < NOW() - INTERVAL '30 days'
ORDER BY (value->>'created_at') ASC;

-- 🔢 8. 유저별 백업 개수 확인
SELECT 
    (value->>'user_id') as "유저 ID",
    COUNT(*) as "백업 개수",
    MIN((value->>'created_at')::timestamp) as "가장 오래된 백업",
    MAX((value->>'created_at')::timestamp) as "가장 최근 백업"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
GROUP BY (value->>'user_id')
ORDER BY "백업 개수" DESC;

-- 💾 9. 백업 용량 분석 (유저별)
SELECT 
    (value->>'user_id') as "유저 ID",
    COUNT(*) as "백업 개수",
    pg_size_pretty(SUM(octet_length(value::text))) as "총 용량",
    pg_size_pretty(AVG(octet_length(value::text))::bigint) as "평균 용량"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
GROUP BY (value->>'user_id')
ORDER BY SUM(octet_length(value::text)) DESC;

-- ⚠️ 10. 백업 없는 사용자 찾기
SELECT DISTINCT 
    SUBSTRING(key FROM 'user_([0-9a-f-]+)_') as "백업 없는 유저 ID"
FROM kv_store_0b7d3bae
WHERE key LIKE 'user_%_owned'
  AND NOT EXISTS (
      SELECT 1 
      FROM kv_store_0b7d3bae b
      WHERE b.key LIKE 'backup_user_' || SUBSTRING(key FROM 'user_([0-9a-f-]+)_') || '_%'
  );

-- 🔎 11. 특정 백업의 상세 내용 보기 (백업 키 교체 필요)
SELECT 
    key as "백업 키",
    (value->>'user_id') as "유저 ID",
    (value->>'created_at') as "생성 시간",
    (value->>'game_count') as "총 게임 수",
    jsonb_pretty(value->'backup_data'->'ownedGames') as "보유 게임 (읽기 쉬운 형태)",
    jsonb_pretty(value->'backup_data'->'wishlistGames') as "위시리스트 (읽기 쉬운 형태)"
FROM kv_store_0b7d3bae
WHERE key = 'backup_user_YOUR_BACKUP_KEY_HERE';

-- 📈 12. 백업 생성 추세 (날짜별)
SELECT 
    DATE((value->>'created_at')::timestamp) as "날짜",
    COUNT(*) as "백업 생성 수",
    COUNT(DISTINCT (value->>'user_id')) as "백업한 유저 수"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
  AND (value->>'created_at')::timestamp > NOW() - INTERVAL '30 days'
GROUP BY DATE((value->>'created_at')::timestamp)
ORDER BY "날짜" DESC;

-- 🎯 13. 건강 체크: 시스템 전체 상태
SELECT 
    '전체 키 수' as "항목",
    COUNT(*)::text as "값"
FROM kv_store_0b7d3bae
UNION ALL
SELECT 
    '백업 키 수',
    COUNT(*)::text
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
UNION ALL
SELECT 
    '유저 데이터 키 수',
    COUNT(*)::text
FROM kv_store_0b7d3bae
WHERE key LIKE 'user_%'
UNION ALL
SELECT 
    '최근 24시간 백업',
    COUNT(*)::text
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
  AND (value->>'created_at')::timestamp > NOW() - INTERVAL '24 hours';

-- 🧹 14. 정리 필요한 유저 (백업 3개 초과)
SELECT 
    (value->>'user_id') as "유저 ID",
    COUNT(*) as "백업 개수",
    '⚠️ ' || (COUNT(*) - 3)::text || '개 삭제 필요' as "조치 필요"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
GROUP BY (value->>'user_id')
HAVING COUNT(*) > 3
ORDER BY "백업 개수" DESC;

-- 🔐 15. 백업 데이터 무결성 체크
SELECT 
    key,
    CASE 
        WHEN value->>'user_id' IS NULL THEN '❌ user_id 없음'
        WHEN value->>'created_at' IS NULL THEN '❌ created_at 없음'
        WHEN value->>'game_count' IS NULL THEN '❌ game_count 없음'
        WHEN value->'backup_data' IS NULL THEN '❌ backup_data 없음'
        ELSE '✅ 정상'
    END as "무결성 상태"
FROM kv_store_0b7d3bae
WHERE key LIKE 'backup_%'
  AND (
      value->>'user_id' IS NULL OR
      value->>'created_at' IS NULL OR
      value->>'game_count' IS NULL OR
      value->'backup_data' IS NULL
  );

-- ============================================
-- 사용 팁:
-- 1. YOUR_USER_ID_HERE 또는 YOUR_BACKUP_KEY_HERE를 실제 값으로 교체하세요
-- 2. 결과가 너무 많으면 LIMIT 추가: SELECT ... LIMIT 100;
-- 3. 날짜 범위 조정: NOW() - INTERVAL '7 days'
-- ============================================
