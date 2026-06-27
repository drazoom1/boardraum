-- 관계형 이관 2단계: 게시물(beta_post_) → posts, 보드위키(game_custom_) → game_wiki
-- Supabase 대시보드 SQL Editor에 붙여넣고 Run. 멱등(create if not exists / on conflict do nothing).
-- Edge Function은 service_role로 접근(RLS 우회). anon/authenticated 직접 접근 차단.

-- ────────────────────────── posts ──────────────────────────
create table if not exists public.posts (
  id            text primary key,
  user_id       text,
  category      text,
  title         text,
  content       text,
  format        text,
  images        jsonb default '[]'::jsonb,
  linked_games  jsonb default '[]'::jsonb,
  talent_data   jsonb,
  poll          jsonb,
  likes         jsonb default '[]'::jsonb,
  comments      jsonb default '[]'::jsonb,
  is_draft      boolean default false,
  is_private    boolean default false,
  is_first_post boolean default false,
  pinned        boolean default false,
  is_homework   boolean default false,
  created_at    timestamptz,
  updated_at    timestamptz,
  data          jsonb
);
create index if not exists idx_posts_feed         on public.posts (created_at desc) where is_draft = false and is_private = false;
create index if not exists idx_posts_cat          on public.posts (category, created_at desc) where is_draft = false and is_private = false;
create index if not exists idx_posts_user         on public.posts (user_id, created_at desc);
create index if not exists idx_posts_linked_games on public.posts using gin (linked_games);
alter table public.posts enable row level security;

insert into public.posts (id, user_id, category, title, content, format, images, linked_games, talent_data, poll, likes, comments, is_draft, is_private, is_first_post, pinned, is_homework, created_at, updated_at, data)
select
  value->>'id', value->>'userId', value->>'category', value->>'title', value->>'content', value->>'format',
  coalesce(value->'images','[]'::jsonb),
  coalesce(value->'linkedGames',
    case when value->'linkedGame' is not null and (value->>'linkedGame') <> 'null'
         then jsonb_build_array(value->'linkedGame') else '[]'::jsonb end),
  value->'talentData', value->'poll',
  coalesce(value->'likes','[]'::jsonb), coalesce(value->'comments','[]'::jsonb),
  coalesce((value->>'isDraft')::boolean,false), coalesce((value->>'isPrivate')::boolean,false),
  coalesce((value->>'isFirstPost')::boolean,false), coalesce((value->>'pinned')::boolean,false),
  coalesce((value->>'isHomework')::boolean,false),
  case when (value->>'createdAt') ~ '^\d{4}-\d{2}-\d{2}' then (value->>'createdAt')::timestamptz else null end,
  case when (value->>'updatedAt') ~ '^\d{4}-\d{2}-\d{2}' then (value->>'updatedAt')::timestamptz else null end,
  value
from public.kv_store_0b7d3bae
where key like 'beta_post_%' and coalesce(value->>'id','') <> ''
on conflict (id) do nothing;

-- ────────────────────────── game_wiki (보드위키 게임설명) ──────────────────────────
create table if not exists public.game_wiki (
  id              text primary key,
  game_id         text,
  category        text,
  post_type       text,
  title           text,
  description     text,
  link            text,
  size_info       jsonb,
  images          jsonb,
  status          text,
  created_by      text,
  created_by_name text,
  created_at      text,
  updated_at      text,
  likes           integer default 0,
  liked_by        jsonb default '[]'::jsonb,
  data            jsonb
);
create index if not exists idx_game_wiki_game on public.game_wiki (game_id, status, created_at desc);
alter table public.game_wiki enable row level security;

insert into public.game_wiki (id, game_id, category, post_type, title, description, link, size_info, images, status, created_by, created_by_name, created_at, updated_at, likes, liked_by, data)
select
  value->>'id', value->>'gameId', value->>'category', value->>'postType',
  value->>'title', value->>'description', value->>'link',
  value->'sizeInfo', coalesce(value->'images','[]'::jsonb),
  value->>'status', value->>'created_by', value->>'created_by_name',
  value->>'created_at', value->>'updated_at',
  coalesce((value->>'likes')::int,0), coalesce(value->'liked_by','[]'::jsonb),
  value
from public.kv_store_0b7d3bae
where key like 'game_custom_%' and coalesce(value->>'id','') <> ''
on conflict (id) do nothing;

-- 확인: select count(*) from public.posts; select count(*) from public.game_wiki;
