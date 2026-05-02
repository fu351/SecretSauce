do $$
begin
  create type public.post_flag_status as enum (
    'open',
    'reviewing',
    'resolved',
    'dismissed'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.post_flag_severity as enum (
    'low',
    'medium',
    'high'
  );
exception when duplicate_object then null;
end $$;

alter table public.posts
  add column if not exists deleted_at timestamptz;

create index if not exists idx_posts_deleted_at_created
  on public.posts (deleted_at, created_at desc);

create table if not exists public.post_flags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_profile_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  details text,
  severity public.post_flag_severity not null default 'medium',
  status public.post_flag_status not null default 'open',
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_flags_reason_not_blank check (length(trim(reason)) > 0),
  constraint post_flags_resolution_check check (
    (status in ('resolved', 'dismissed') and resolved_at is not null)
    or status not in ('resolved', 'dismissed')
  )
);

create index if not exists idx_post_flags_post_created
  on public.post_flags (post_id, created_at desc);

create index if not exists idx_post_flags_status_created
  on public.post_flags (status, created_at desc);

create index if not exists idx_post_flags_reporter_created
  on public.post_flags (reporter_profile_id, created_at desc)
  where reporter_profile_id is not null;

alter table public.post_flags enable row level security;

drop policy if exists "post_flags_select_own" on public.post_flags;
create policy "post_flags_select_own"
  on public.post_flags for select
  using (reporter_profile_id = public.current_profile_id());

drop policy if exists "post_flags_insert_own" on public.post_flags;
create policy "post_flags_insert_own"
  on public.post_flags for insert to authenticated
  with check (reporter_profile_id = public.current_profile_id());

drop trigger if exists trg_post_flags_updated_at on public.post_flags;
create trigger trg_post_flags_updated_at
  before update on public.post_flags
  for each row execute procedure public.set_updated_at();
