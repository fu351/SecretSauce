do $$
begin
  create type public.streak_status as enum ('active', 'paused', 'archived');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.streak_day_status as enum ('counted', 'grace', 'frozen', 'pending', 'skipped');
exception when duplicate_object then null;
end $$;

create table if not exists public.user_streaks (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  current_count integer not null default 0 check (current_count >= 0),
  longest_count integer not null default 0 check (longest_count >= 0),
  freeze_tokens integer not null default 0 check (freeze_tokens >= 0),
  grace_used_week_start date,
  last_counted_on date,
  streak_status public.streak_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.streak_days (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  streak_date date not null,
  source_recipe_try_id uuid references public.recipe_tries(id) on delete set null,
  source_verification_task_id uuid references public.verification_tasks(id) on delete set null,
  status public.streak_day_status not null,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint streak_days_unique_profile_date unique (profile_id, streak_date)
);

create unique index if not exists idx_streak_days_profile_idempotency
  on public.streak_days (profile_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_streak_days_profile_date_desc
  on public.streak_days (profile_id, streak_date desc);

create table if not exists public.streak_milestones (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  milestone integer not null check (milestone in (7, 21, 45, 90)),
  reached_on date not null,
  streak_count integer not null check (streak_count >= 0),
  reward_key text,
  reward_metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now(),
  source_streak_profile_id uuid references public.user_streaks(profile_id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_streak_milestones_profile_milestone
  on public.streak_milestones (profile_id, milestone);

create unique index if not exists idx_streak_milestones_profile_idempotency
  on public.streak_milestones (profile_id, idempotency_key)
  where idempotency_key is not null;

drop trigger if exists trg_user_streaks_updated_at on public.user_streaks;
create trigger trg_user_streaks_updated_at before update on public.user_streaks
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_streak_days_updated_at on public.streak_days;
create trigger trg_streak_days_updated_at before update on public.streak_days
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_streak_milestones_updated_at on public.streak_milestones;
create trigger trg_streak_milestones_updated_at before update on public.streak_milestones
for each row execute procedure public.set_updated_at();

alter table public.user_streaks enable row level security;
alter table public.streak_days enable row level security;
alter table public.streak_milestones enable row level security;

drop policy if exists "user_streaks_select_own" on public.user_streaks;
create policy "user_streaks_select_own" on public.user_streaks for select
using (profile_id = public.current_profile_id());
drop policy if exists "user_streaks_insert_own" on public.user_streaks;
create policy "user_streaks_insert_own" on public.user_streaks for insert to authenticated
with check (profile_id = public.current_profile_id());
drop policy if exists "user_streaks_update_own" on public.user_streaks;
create policy "user_streaks_update_own" on public.user_streaks for update to authenticated
using (profile_id = public.current_profile_id()) with check (profile_id = public.current_profile_id());
drop policy if exists "user_streaks_delete_own" on public.user_streaks;
create policy "user_streaks_delete_own" on public.user_streaks for delete to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "streak_days_select_own" on public.streak_days;
create policy "streak_days_select_own" on public.streak_days for select
using (profile_id = public.current_profile_id());
drop policy if exists "streak_days_insert_own" on public.streak_days;
create policy "streak_days_insert_own" on public.streak_days for insert to authenticated
with check (profile_id = public.current_profile_id());
drop policy if exists "streak_days_update_own" on public.streak_days;
create policy "streak_days_update_own" on public.streak_days for update to authenticated
using (profile_id = public.current_profile_id()) with check (profile_id = public.current_profile_id());
drop policy if exists "streak_days_delete_own" on public.streak_days;
create policy "streak_days_delete_own" on public.streak_days for delete to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "streak_milestones_select_own" on public.streak_milestones;
create policy "streak_milestones_select_own" on public.streak_milestones for select
using (profile_id = public.current_profile_id());
drop policy if exists "streak_milestones_insert_own" on public.streak_milestones;
create policy "streak_milestones_insert_own" on public.streak_milestones for insert to authenticated
with check (profile_id = public.current_profile_id());
drop policy if exists "streak_milestones_update_own" on public.streak_milestones;
create policy "streak_milestones_update_own" on public.streak_milestones for update to authenticated
using (profile_id = public.current_profile_id()) with check (profile_id = public.current_profile_id());
drop policy if exists "streak_milestones_delete_own" on public.streak_milestones;
create policy "streak_milestones_delete_own" on public.streak_milestones for delete to authenticated
using (profile_id = public.current_profile_id());
