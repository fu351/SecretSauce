-- Social Sprint 3: meal plan sharing and cooking journeys.
-- Additive only. Shared payloads are sanitized snapshots; raw budget,
-- pantry, receipt, and private verification data stay out of public surfaces.

create or replace function public.social_projection_payload_is_safe(payload jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(payload) = 'object'
    and not public.jsonb_has_any_key_recursive(
      payload,
      array[
        'budget',
        'budgetAmount',
        'budget_amount',
        'rawBudget',
        'raw_budget',
        'deficit',
        'jarBalance',
        'jar_balance',
        'savingsGoal',
        'savings_goal',
        'spend',
        'spendLog',
        'spendLogs',
        'spend_log',
        'spend_logs',
        'aiConfidence',
        'ai_confidence',
        'confidence',
        'privateVerificationMetadata',
        'private_verification_metadata',
        'stagnation',
        'nudgeState',
        'nudge_state',
        'receipt',
        'receipts',
        'receiptItems',
        'receipt_items',
        'pantryInventory',
        'pantry_inventory',
        'pantryItems',
        'pantry_items',
        'receiptTotal',
        'receipt_total'
      ]
    );
$$;

create table if not exists public.meal_plan_shares (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  source_week_index integer not null,
  title text not null,
  sanitized_summary jsonb not null default '{}'::jsonb,
  visibility public.foundation_social_visibility not null default 'private',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  projection_id uuid references public.social_activity_projections(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_plan_shares_summary_object check (jsonb_typeof(sanitized_summary) = 'object'),
  constraint meal_plan_shares_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint meal_plan_shares_summary_safe check (public.social_projection_payload_is_safe(sanitized_summary))
);

create unique index if not exists idx_meal_plan_shares_owner_idempotency
  on public.meal_plan_shares (owner_profile_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_meal_plan_shares_owner_created
  on public.meal_plan_shares (owner_profile_id, created_at desc);

create index if not exists idx_meal_plan_shares_published
  on public.meal_plan_shares (status, published_at desc)
  where status = 'published';

drop trigger if exists trg_meal_plan_shares_updated_at on public.meal_plan_shares;
create trigger trg_meal_plan_shares_updated_at before update on public.meal_plan_shares
for each row execute procedure public.set_updated_at();

alter table public.meal_plan_shares enable row level security;

drop policy if exists "meal_plan_shares_select_visible" on public.meal_plan_shares;
create policy "meal_plan_shares_select_visible" on public.meal_plan_shares for select to authenticated
using (
  owner_profile_id = public.current_profile_id()
  or (
    status = 'published'
    and (
      visibility = 'public'
      or (
        visibility = 'followers'
        and exists (
          select 1
          from public.follow_requests fr
          where fr.follower_id = public.current_profile_id()
            and fr.following_id = meal_plan_shares.owner_profile_id
            and fr.status = 'accepted'
        )
      )
    )
  )
);

drop policy if exists "meal_plan_shares_insert_own" on public.meal_plan_shares;
create policy "meal_plan_shares_insert_own" on public.meal_plan_shares for insert to authenticated
with check (owner_profile_id = public.current_profile_id());

drop policy if exists "meal_plan_shares_update_own" on public.meal_plan_shares;
create policy "meal_plan_shares_update_own" on public.meal_plan_shares for update to authenticated
using (owner_profile_id = public.current_profile_id())
with check (owner_profile_id = public.current_profile_id());

create table if not exists public.meal_plan_remixes (
  id uuid primary key default gen_random_uuid(),
  original_share_id uuid not null references public.meal_plan_shares(id) on delete cascade,
  remixer_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_week_index integer not null,
  created_meal_ids uuid[] not null default array[]::uuid[],
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint meal_plan_remixes_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists idx_meal_plan_remixes_profile_idempotency
  on public.meal_plan_remixes (remixer_profile_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_meal_plan_remixes_original_share
  on public.meal_plan_remixes (original_share_id, created_at desc);

alter table public.meal_plan_remixes enable row level security;

drop policy if exists "meal_plan_remixes_select_own" on public.meal_plan_remixes;
create policy "meal_plan_remixes_select_own" on public.meal_plan_remixes for select to authenticated
using (remixer_profile_id = public.current_profile_id());

drop policy if exists "meal_plan_remixes_insert_own" on public.meal_plan_remixes;
create policy "meal_plan_remixes_insert_own" on public.meal_plan_remixes for insert to authenticated
with check (remixer_profile_id = public.current_profile_id());

create table if not exists public.cooking_journeys (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  journey_type text not null check (journey_type in (
    'cooking_rhythm',
    'meal_prep',
    'budget_friendly',
    'high_protein',
    'recipe_exploration',
    'custom'
  )),
  target_count integer not null check (target_count > 0 and target_count <= 365),
  current_progress integer not null default 0 check (current_progress >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  visibility public.foundation_social_visibility not null default 'private',
  projection_id uuid references public.social_activity_projections(id) on delete set null,
  completed_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cooking_journeys_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_cooking_journeys_profile_status
  on public.cooking_journeys (profile_id, status, created_at desc);

drop trigger if exists trg_cooking_journeys_updated_at on public.cooking_journeys;
create trigger trg_cooking_journeys_updated_at before update on public.cooking_journeys
for each row execute procedure public.set_updated_at();

alter table public.cooking_journeys enable row level security;

drop policy if exists "cooking_journeys_select_visible" on public.cooking_journeys;
create policy "cooking_journeys_select_visible" on public.cooking_journeys for select to authenticated
using (
  profile_id = public.current_profile_id()
  or (
    status = 'completed'
    and (
      visibility = 'public'
      or (
        visibility = 'followers'
        and exists (
          select 1
          from public.follow_requests fr
          where fr.follower_id = public.current_profile_id()
            and fr.following_id = cooking_journeys.profile_id
            and fr.status = 'accepted'
        )
      )
    )
  )
);

drop policy if exists "cooking_journeys_insert_own" on public.cooking_journeys;
create policy "cooking_journeys_insert_own" on public.cooking_journeys for insert to authenticated
with check (profile_id = public.current_profile_id());

drop policy if exists "cooking_journeys_update_own" on public.cooking_journeys;
create policy "cooking_journeys_update_own" on public.cooking_journeys for update to authenticated
using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

create table if not exists public.journey_events (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.cooking_journeys(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('recipe_try', 'streak_day', 'meal_plan', 'manual_progress')),
  source_recipe_try_id uuid references public.recipe_tries(id) on delete set null,
  source_product_event_id uuid references public.product_events(id) on delete set null,
  source_meal_plan_share_id uuid references public.meal_plan_shares(id) on delete set null,
  source_week_index integer,
  progress_delta integer not null default 1 check (progress_delta > 0 and progress_delta <= 31),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint journey_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists idx_journey_events_idempotency
  on public.journey_events (journey_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_journey_events_journey_created
  on public.journey_events (journey_id, created_at desc);

alter table public.journey_events enable row level security;

drop policy if exists "journey_events_select_own" on public.journey_events;
create policy "journey_events_select_own" on public.journey_events for select to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "journey_events_insert_own" on public.journey_events;
create policy "journey_events_insert_own" on public.journey_events for insert to authenticated
with check (profile_id = public.current_profile_id());
