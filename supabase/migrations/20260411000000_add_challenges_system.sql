-- ============================================================
-- Challenges system
-- ============================================================

-- 1. challenges table
create table public.challenges (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  description text,
  points      int         not null default 100,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  constraint challenges_dates_check check (ends_at > starts_at)
);

-- 2. challenge_entries — one row per (challenge, profile)
create table public.challenge_entries (
  id           uuid        primary key default gen_random_uuid(),
  challenge_id uuid        not null references public.challenges(id) on delete cascade,
  profile_id   uuid        not null references public.profiles(id)   on delete cascade,
  post_id      uuid        references public.posts(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint challenge_entries_unique unique (challenge_id, profile_id)
);

create index idx_challenge_entries_challenge on public.challenge_entries (challenge_id);
create index idx_challenge_entries_profile   on public.challenge_entries (profile_id);
create index idx_challenge_entries_post      on public.challenge_entries (post_id) where post_id is not null;

-- 3. RLS
alter table public.challenges       enable row level security;
alter table public.challenge_entries enable row level security;

-- challenges: public read, no client writes
create policy "challenges_select_public"
  on public.challenges for select using (true);

-- entries: public read
create policy "challenge_entries_select_public"
  on public.challenge_entries for select using (true);

-- entries: authenticated users can insert their own row
create policy "challenge_entries_insert_own"
  on public.challenge_entries for insert to authenticated
  with check (profile_id = public.current_profile_id());

-- entries: authenticated users can update their own row (e.g. link a post)
create policy "challenge_entries_update_own"
  on public.challenge_entries for update to authenticated
  using   (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- entries: authenticated users can delete their own row
create policy "challenge_entries_delete_own"
  on public.challenge_entries for delete to authenticated
  using (profile_id = public.current_profile_id());

-- 4. Leaderboard function — returns ranked entries with like counts
create or replace function public.fn_challenge_leaderboard(
  p_challenge_id uuid,
  p_viewer_id    uuid    default null,
  p_scope        text    default 'global',
  p_limit        int     default 10
) returns table (
  profile_id   uuid,
  full_name    text,
  avatar_url   text,
  username     text,
  post_id      uuid,
  like_count   bigint,
  total_points bigint,
  is_viewer    boolean
) language sql stable security definer set search_path = public as $$
  select
    ce.profile_id,
    pr.full_name,
    pr.avatar_url,
    pr.username,
    ce.post_id,
    coalesce(lc.cnt, 0)                          as like_count,
    (c.points + coalesce(lc.cnt, 0))::bigint     as total_points,
    (p_viewer_id is not null and ce.profile_id = p_viewer_id) as is_viewer
  from public.challenge_entries ce
  join public.profiles pr on pr.id = ce.profile_id
  join public.challenges c on c.id  = ce.challenge_id
  left join (
    select post_id, count(*)::bigint as cnt
    from public.post_likes
    group by post_id
  ) lc on lc.post_id = ce.post_id
  where ce.challenge_id = p_challenge_id
    and (
      p_scope = 'global'
      or p_viewer_id is null
      or ce.profile_id = p_viewer_id
      or ce.profile_id in (
        select fr.follower_id
        from public.follow_requests fr
        where fr.following_id = p_viewer_id
          and fr.status = 'accepted'
      )
    )
  order by total_points desc, ce.created_at asc
  limit p_limit;
$$;

-- 5. Viewer rank function
create or replace function public.fn_challenge_viewer_rank(
  p_challenge_id uuid,
  p_viewer_id    uuid,
  p_scope        text default 'global'
) returns int language sql stable security definer set search_path = public as $$
  select (count(*)::int + 1)
  from public.challenge_entries ce
  join public.challenges c on c.id = ce.challenge_id
  left join (
    select post_id, count(*)::bigint as cnt
    from public.post_likes
    group by post_id
  ) lc on lc.post_id = ce.post_id
  where ce.challenge_id = p_challenge_id
    and (c.points + coalesce(lc.cnt, 0)) > (
      select c2.points + coalesce(lc2.cnt, 0)
      from public.challenge_entries ce2
      join public.challenges c2 on c2.id = ce2.challenge_id
      left join (
        select post_id, count(*)::bigint as cnt
        from public.post_likes
        group by post_id
      ) lc2 on lc2.post_id = ce2.post_id
      where ce2.challenge_id = p_challenge_id
        and ce2.profile_id = p_viewer_id
    )
    and (
      p_scope = 'global'
      or ce.profile_id = p_viewer_id
      or ce.profile_id in (
        select fr.follower_id
        from public.follow_requests fr
        where fr.following_id = p_viewer_id
          and fr.status = 'accepted'
      )
    );
$$;

-- 6. Seed initial challenges
insert into public.challenges (title, description, points, starts_at, ends_at) values
  (
    'Pantry Rescue',
    'Cook a delicious meal using only ingredients you already have at home. Get creative with what's in your pantry!',
    100,
    '2026-04-07 00:00:00+00',
    '2026-04-13 23:59:59+00'
  ),
  (
    'One-Pan Wonder',
    'Create an impressive meal using just a single pan or pot. Less mess, more flavor.',
    150,
    '2026-04-14 00:00:00+00',
    '2026-04-20 23:59:59+00'
  );
