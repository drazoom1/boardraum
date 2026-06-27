-- 관계형 이관 1단계: site_game_ (KV) → games 테이블
-- Supabase 브랜치/스테이징에서 먼저 실행해 검증한 뒤 운영에 적용한다.
-- 멱등(create if not exists)이라 재실행 안전.

create table if not exists public.games (
  id             text primary key,
  bgg_id         text,
  korean_name    text,
  english_name   text,
  name           text,
  image_url      text,
  year_published text,
  registered_at  bigint,
  created_at     timestamptz default now()
);

-- 이름 검색(보드위키/게임정보) 가속용 인덱스
create index if not exists idx_games_korean_name  on public.games (lower(korean_name));
create index if not exists idx_games_english_name on public.games (lower(english_name));
create index if not exists idx_games_bgg_id       on public.games (bgg_id);

-- 서비스 롤(Edge Function)만 접근하므로 RLS는 켜되 정책은 두지 않는다
-- (anon/authenticated 직접 접근 차단; Edge Function은 service_role로 우회)
alter table public.games enable row level security;

-- ── 백필: KV(kv_store_0b7d3bae의 site_game_*) → games (멱등) ──────────
insert into public.games (id, bgg_id, korean_name, english_name, name, image_url, year_published, registered_at)
select
  value->>'id',
  nullif(value->>'bggId', ''),
  nullif(value->>'koreanName', ''),
  nullif(value->>'englishName', ''),
  coalesce(nullif(value->>'name', ''), nullif(value->>'koreanName', '')),
  nullif(value->>'imageUrl', ''),
  nullif(value->>'yearPublished', ''),
  case when (value->>'registeredAt') ~ '^[0-9]+$' then (value->>'registeredAt')::bigint else null end
from public.kv_store_0b7d3bae
where key like 'site_game_%'
  and coalesce(value->>'id', '') <> ''
on conflict (id) do nothing;

-- 확인용: select count(*) from public.games;
