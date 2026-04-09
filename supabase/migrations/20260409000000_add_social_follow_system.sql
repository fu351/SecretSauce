-- ============================================================
-- Social Follow System
-- Adds a directed-graph follow relationship between profiles.
-- Public accounts auto-accept; private accounts require approval.
-- A materialized view tracks follower/following counts.
-- ============================================================

-- 1. Enum for follow request status
create type public.follow_request_status as enum ('pending', 'accepted', 'rejected');

-- 2. Add is_private column to profiles (default false = public)
alter table public.profiles
  add column if not exists is_private boolean not null default false;

-- 3. follow_requests table (the digraph edges)
create table public.follow_requests (
  id           uuid        primary key default gen_random_uuid(),
  follower_id  uuid        not null references public.profiles(id) on delete cascade,
  following_id uuid        not null references public.profiles(id) on delete cascade,
  status       public.follow_request_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint follow_requests_no_self_follow check (follower_id <> following_id),
  constraint follow_requests_unique_pair    unique (follower_id, following_id)
);

create index idx_follow_requests_follower_id  on public.follow_requests (follower_id);
create index idx_follow_requests_following_id on public.follow_requests (following_id);
-- Partial index for fast accepted-relationship lookups (counts, feeds)
create index idx_follow_requests_accepted     on public.follow_requests (following_id, follower_id)
  where status = 'accepted';

-- 4. updated_at trigger on follow_requests
create or replace function public.set_follow_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_follow_requests_updated_at
  before update on public.follow_requests
  for each row execute procedure public.set_follow_requests_updated_at();

-- 5. Materialized view: follower_counts
--    Counts only accepted relationships to avoid leaking pending request info.
create materialized view public.follower_counts as
select
  p.id                                                                           as profile_id,
  count(distinct fr_in.follower_id)  filter (where fr_in.status  = 'accepted')  as follower_count,
  count(distinct fr_out.following_id) filter (where fr_out.status = 'accepted') as following_count
from public.profiles p
left join public.follow_requests fr_in  on fr_in.following_id  = p.id
left join public.follow_requests fr_out on fr_out.follower_id   = p.id
group by p.id
with data;

-- Unique index required for REFRESH CONCURRENTLY (reads never blocked during refresh)
create unique index idx_follower_counts_profile_id on public.follower_counts (profile_id);

-- 6. Auto-refresh trigger on follow_requests
--    Fires per-statement (batches multiple row changes into one refresh).
create or replace function public.refresh_follower_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.follower_counts;
  return null;
end;
$$;

create trigger trg_refresh_follower_counts
  after insert or update or delete on public.follow_requests
  for each statement execute procedure public.refresh_follower_counts();

-- 7. Row Level Security on follow_requests
alter table public.follow_requests enable row level security;

-- Helper function: resolve Clerk JWT sub claim → Supabase profile UUID.
-- Used in RLS policies to avoid repeating the subquery everywhere.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where clerk_user_id = (auth.jwt() ->> 'sub')
  limit 1;
$$;

-- Policy: Anyone (including anon) can read accepted rows (public follower counts/feeds)
create policy "follow_requests_select_accepted"
  on public.follow_requests
  for select
  using (status = 'accepted');

-- Policy: Authenticated users can also read their own pending/rejected rows
create policy "follow_requests_select_own"
  on public.follow_requests
  for select
  to authenticated
  using (
    follower_id  = public.current_profile_id()
    or following_id = public.current_profile_id()
  );

-- Policy: Can only INSERT rows where the authenticated user is the follower
create policy "follow_requests_insert_as_follower"
  on public.follow_requests
  for insert
  to authenticated
  with check (follower_id = public.current_profile_id());

-- Policy: The followed user (following_id) can accept or reject pending requests
create policy "follow_requests_update_as_following"
  on public.follow_requests
  for update
  to authenticated
  using   (following_id = public.current_profile_id())
  with check (following_id = public.current_profile_id());

-- Policy: The follower can unfollow or cancel a pending request
create policy "follow_requests_delete_as_follower"
  on public.follow_requests
  for delete
  to authenticated
  using (follower_id = public.current_profile_id());

-- Grant read access to the materialized view
grant select on public.follower_counts to anon, authenticated;
