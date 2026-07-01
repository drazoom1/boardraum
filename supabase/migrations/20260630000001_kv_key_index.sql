-- KV 프리픽스 조회 가속용 인덱스.
-- getByPrefix()가 쓰는 `key LIKE 'prefix%'` + `ORDER BY key` 를
-- 전체 테이블 순차 스캔(seq scan) 대신 btree 인덱스 range 스캔으로 처리하게 한다.
-- (기본 collation에서는 LIKE 'x%' 가 일반 btree 인덱스를 못 쓰므로 text_pattern_ops 가 필요)
--
-- 효과: 사이트 전체의 모든 목록 조회(커뮤니티 피드 postsAll, 관리자 user_/spam_/game_custom_ 스캔,
--       게임 site_game_, 위시/보유, 랭킹 등)가 즉시 빨라진다. 코드 변경 없음. 비파괴/멱등.
--
-- 실행: Supabase 대시보드 SQL Editor에 붙여넣고 Run.

create index if not exists idx_kv_store_key_pattern
  on public.kv_store_0b7d3bae (key text_pattern_ops);

-- (선택) 라이브 쓰기 잠금이 신경 쓰이면 위 대신 아래를 "단독 실행":
-- create index concurrently if not exists idx_kv_store_key_pattern
--   on public.kv_store_0b7d3bae (key text_pattern_ops);

analyze public.kv_store_0b7d3bae;
