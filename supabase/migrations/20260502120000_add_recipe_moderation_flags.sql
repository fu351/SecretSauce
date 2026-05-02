do $$
begin
  create type public.recipe_flag_status as enum (
    'open',
    'reviewing',
    'resolved',
    'dismissed'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.recipe_flag_severity as enum (
    'low',
    'medium',
    'high'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.recipe_flags (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  reporter_profile_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  details text,
  severity public.recipe_flag_severity not null default 'medium',
  status public.recipe_flag_status not null default 'open',
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_flags_reason_not_blank check (length(trim(reason)) > 0),
  constraint recipe_flags_resolution_check check (
    (status in ('resolved', 'dismissed') and resolved_at is not null)
    or status not in ('resolved', 'dismissed')
  )
);

create index if not exists idx_recipe_flags_recipe_created
  on public.recipe_flags (recipe_id, created_at desc);

create index if not exists idx_recipe_flags_status_created
  on public.recipe_flags (status, created_at desc);

create index if not exists idx_recipe_flags_reporter_created
  on public.recipe_flags (reporter_profile_id, created_at desc)
  where reporter_profile_id is not null;

alter table public.recipe_flags enable row level security;

drop policy if exists "recipe_flags_select_own" on public.recipe_flags;
create policy "recipe_flags_select_own"
  on public.recipe_flags for select
  using (reporter_profile_id = public.current_profile_id());

drop policy if exists "recipe_flags_insert_own" on public.recipe_flags;
create policy "recipe_flags_insert_own"
  on public.recipe_flags for insert to authenticated
  with check (reporter_profile_id = public.current_profile_id());

drop trigger if exists trg_recipe_flags_updated_at on public.recipe_flags;
create trigger trg_recipe_flags_updated_at
  before update on public.recipe_flags
  for each row execute procedure public.set_updated_at();
