-- 마이리스트 "내 글"(community/posts/by-user) 가속용 인덱스.
-- by-user는 value->>'userId' 로 필터링하므로, beta_post_ 키에 한정한 표현식 부분 인덱스를 만든다.
-- 이 인덱스가 없어도 동작하지만(서버측 필터), 있으면 조회가 O(log n)으로 빨라진다.
create index if not exists idx_kv_beta_post_userid
  on public.kv_store_0b7d3bae ((value->>'userId'))
  where key like 'beta_post_%';
