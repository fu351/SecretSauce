-- Shared product foundation for budget, verification/streaks, social projections,
-- and pantry AI workflows. This migration is intentionally additive.

do $$
begin
  create type public.foundation_media_purpose as enum (
    'receipt',
    'meal_verification',
    'pantry_scan',
    'social_post_derivative'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.foundation_media_status as enum (
    'active',
    'retention_pending',
    'deleted'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.foundation_verification_status as enum (
    'pending',
    'auto_accepted',
    'needs_confirmation',
    'user_confirmed',
    'user_rejected',
    'expired'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.foundation_feature_area as enum (
    'budget',
    'streaks',
    'social',
    'pantry',
    'recipe',
    'shopping'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.foundation_verification_source_type as enum (
    'manual',
    'receipt',
    'meal_photo',
    'pantry_photo',
    'recipe_try',
    'system'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.foundation_confirmation_item_status as enum (
    'pending',
    'confirmed',
    'edited',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.foundation_social_visibility as enum (
    'private',
    'followers',
    'public'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.foundation_recipe_try_status as enum (
    'attempted',
    'succeeded',
    'needs_tweaks'
  );
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_feature_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  budget_tracking_enabled boolean not null default true,
  streaks_enabled boolean not null default true,
  social_enabled boolean not null default false,
  pantry_enabled boolean not null default true,
  social_visibility_default public.foundation_social_visibility not null default 'private',
  auto_draft_social_enabled boolean not null default false,
  show_reaction_counts boolean not null default true,
  raw_media_retention_days integer not null default 7
    check (raw_media_retention_days between 1 and 30),
  confirmation_mode text not null default 'ask_when_uncertain'
    check (confirmation_mode in ('ask_when_uncertain', 'always_ask', 'auto_accept_high_confidence')),
  pantry_auto_deduct_enabled boolean not null default false,
  nudges_enabled boolean not null default true,
  haptics_enabled boolean not null default true,
  audio_enabled boolean not null default false,
  respect_reduced_motion boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_feature_preferences_updated_at on public.user_feature_preferences;
create trigger trg_user_feature_preferences_updated_at
  before update on public.user_feature_preferences
  for each row execute procedure public.set_updated_at();

alter table public.user_feature_preferences enable row level security;

drop policy if exists "user_feature_preferences_select_own" on public.user_feature_preferences;
create policy "user_feature_preferences_select_own"
  on public.user_feature_preferences for select
  using (profile_id = public.current_profile_id());

drop policy if exists "user_feature_preferences_insert_own" on public.user_feature_preferences;
create policy "user_feature_preferences_insert_own"
  on public.user_feature_preferences for insert to authenticated
  with check (profile_id = public.current_profile_id());

drop policy if exists "user_feature_preferences_update_own" on public.user_feature_preferences;
create policy "user_feature_preferences_update_own"
  on public.user_feature_preferences for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  source text not null default 'server',
  idempotency_key text,
  entity_type text,
  entity_id uuid,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint product_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_product_events_actor_occurred
  on public.product_events (actor_profile_id, occurred_at desc);

create unique index if not exists idx_product_events_idempotency
  on public.product_events (actor_profile_id, event_type, idempotency_key)
  where idempotency_key is not null;

alter table public.product_events enable row level security;

drop policy if exists "product_events_select_own" on public.product_events;
create policy "product_events_select_own"
  on public.product_events for select
  using (actor_profile_id = public.current_profile_id());

drop policy if exists "product_events_insert_own" on public.product_events;
create policy "product_events_insert_own"
  on public.product_events for insert to authenticated
  with check (actor_profile_id = public.current_profile_id());

insert into storage.buckets (id, name, public)
values ('private-product-media', 'private-product-media', false)
on conflict (id) do nothing;

drop policy if exists "private_product_media_select_own" on storage.objects;
create policy "private_product_media_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'private-product-media'
    and split_part(name, '/', 1) = public.current_profile_id()::text
  );

drop policy if exists "private_product_media_insert_own" on storage.objects;
create policy "private_product_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'private-product-media'
    and split_part(name, '/', 1) = public.current_profile_id()::text
  );

drop policy if exists "private_product_media_delete_own" on storage.objects;
create policy "private_product_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'private-product-media'
    and split_part(name, '/', 1) = public.current_profile_id()::text
  );

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  purpose public.foundation_media_purpose not null,
  bucket text not null default 'private-product-media',
  storage_path text not null,
  mime_type text,
  byte_size integer check (byte_size is null or byte_size >= 0),
  status public.foundation_media_status not null default 'active',
  retention_expires_at timestamptz,
  deleted_at timestamptz,
  derived_metadata jsonb not null default '{}'::jsonb,
  source_product_event_id uuid references public.product_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_metadata_object check (jsonb_typeof(derived_metadata) = 'object'),
  constraint media_assets_owner_path check (storage_path like owner_profile_id::text || '/%')
);

create index if not exists idx_media_assets_owner_created
  on public.media_assets (owner_profile_id, created_at desc);

create index if not exists idx_media_assets_source_product_event
  on public.media_assets (source_product_event_id)
  where source_product_event_id is not null;

alter table public.media_assets enable row level security;

drop policy if exists "media_assets_select_own" on public.media_assets;
create policy "media_assets_select_own"
  on public.media_assets for select
  using (owner_profile_id = public.current_profile_id());

drop policy if exists "media_assets_insert_own" on public.media_assets;
create policy "media_assets_insert_own"
  on public.media_assets for insert to authenticated
  with check (owner_profile_id = public.current_profile_id());

drop policy if exists "media_assets_update_own" on public.media_assets;
create policy "media_assets_update_own"
  on public.media_assets for update to authenticated
  using (owner_profile_id = public.current_profile_id())
  with check (owner_profile_id = public.current_profile_id());

drop trigger if exists trg_media_assets_updated_at on public.media_assets;
create trigger trg_media_assets_updated_at
  before update on public.media_assets
  for each row execute procedure public.set_updated_at();

create table if not exists public.verification_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  feature_area public.foundation_feature_area not null,
  source_type public.foundation_verification_source_type not null,
  status public.foundation_verification_status not null default 'pending',
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  media_asset_id uuid references public.media_assets(id) on delete set null,
  source_product_event_id uuid references public.product_events(id) on delete set null,
  proposed_output jsonb not null default '{}'::jsonb,
  ai_metadata jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  reviewer_profile_id uuid references public.profiles(id) on delete set null,
  user_decision jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_tasks_proposed_object check (jsonb_typeof(proposed_output) = 'object'),
  constraint verification_tasks_ai_metadata_object check (jsonb_typeof(ai_metadata) = 'object'),
  constraint verification_tasks_user_decision_object check (jsonb_typeof(user_decision) = 'object')
);

create index if not exists idx_verification_tasks_owner_created
  on public.verification_tasks (owner_profile_id, created_at desc);

create index if not exists idx_verification_tasks_media_asset
  on public.verification_tasks (media_asset_id)
  where media_asset_id is not null;

create index if not exists idx_verification_tasks_reviewer_profile
  on public.verification_tasks (reviewer_profile_id)
  where reviewer_profile_id is not null;

create index if not exists idx_verification_tasks_source_product_event
  on public.verification_tasks (source_product_event_id)
  where source_product_event_id is not null;

create unique index if not exists idx_verification_tasks_idempotency
  on public.verification_tasks (owner_profile_id, feature_area, source_type, idempotency_key)
  where idempotency_key is not null;

alter table public.verification_tasks enable row level security;

drop policy if exists "verification_tasks_select_own" on public.verification_tasks;
create policy "verification_tasks_select_own"
  on public.verification_tasks for select
  using (owner_profile_id = public.current_profile_id());

drop policy if exists "verification_tasks_insert_own" on public.verification_tasks;
create policy "verification_tasks_insert_own"
  on public.verification_tasks for insert to authenticated
  with check (owner_profile_id = public.current_profile_id());

drop policy if exists "verification_tasks_update_own" on public.verification_tasks;
create policy "verification_tasks_update_own"
  on public.verification_tasks for update to authenticated
  using (owner_profile_id = public.current_profile_id())
  with check (owner_profile_id = public.current_profile_id());

drop trigger if exists trg_verification_tasks_updated_at on public.verification_tasks;
create trigger trg_verification_tasks_updated_at
  before update on public.verification_tasks
  for each row execute procedure public.set_updated_at();

create table if not exists public.confirmation_items (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  verification_task_id uuid not null references public.verification_tasks(id) on delete cascade,
  item_type text not null,
  label text,
  status public.foundation_confirmation_item_status not null default 'pending',
  proposed_value jsonb not null default '{}'::jsonb,
  confirmed_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint confirmation_items_proposed_object check (jsonb_typeof(proposed_value) = 'object'),
  constraint confirmation_items_confirmed_object check (jsonb_typeof(confirmed_value) = 'object')
);

create index if not exists idx_confirmation_items_task
  on public.confirmation_items (verification_task_id);

create index if not exists idx_confirmation_items_owner
  on public.confirmation_items (owner_profile_id);

alter table public.confirmation_items enable row level security;

drop policy if exists "confirmation_items_select_own" on public.confirmation_items;
create policy "confirmation_items_select_own"
  on public.confirmation_items for select
  using (owner_profile_id = public.current_profile_id());

drop policy if exists "confirmation_items_insert_own" on public.confirmation_items;
create policy "confirmation_items_insert_own"
  on public.confirmation_items for insert to authenticated
  with check (owner_profile_id = public.current_profile_id());

drop policy if exists "confirmation_items_update_own" on public.confirmation_items;
create policy "confirmation_items_update_own"
  on public.confirmation_items for update to authenticated
  using (owner_profile_id = public.current_profile_id())
  with check (owner_profile_id = public.current_profile_id());

drop trigger if exists trg_confirmation_items_updated_at on public.confirmation_items;
create trigger trg_confirmation_items_updated_at
  before update on public.confirmation_items
  for each row execute procedure public.set_updated_at();

create or replace function public.jsonb_has_any_key_recursive(
  payload jsonb,
  blocked_keys text[]
)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  entry_key text;
  entry_value jsonb;
  array_item jsonb;
begin
  if payload is null then
    return false;
  end if;

  if jsonb_typeof(payload) = 'object' then
    for entry_key, entry_value in
      select key, value from jsonb_each(payload)
    loop
      if entry_key = any(blocked_keys) then
        return true;
      end if;

      if public.jsonb_has_any_key_recursive(entry_value, blocked_keys) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for array_item in
      select value from jsonb_array_elements(payload)
    loop
      if public.jsonb_has_any_key_recursive(array_item, blocked_keys) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$$;

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
        'deficit',
        'jarBalance',
        'jar_balance',
        'savingsGoal',
        'savings_goal',
        'aiConfidence',
        'ai_confidence',
        'confidence',
        'stagnation',
        'nudgeState',
        'nudge_state',
        'pantryInventory',
        'pantry_inventory',
        'receiptTotal',
        'receipt_total'
      ]
    );
$$;

create table if not exists public.social_activity_projections (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  source_product_event_id uuid references public.product_events(id) on delete set null,
  event_type text not null,
  visibility public.foundation_social_visibility not null default 'private',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint social_projection_payload_safe check (public.social_projection_payload_is_safe(payload)),
  constraint social_projection_no_budget_events check (event_type not like 'budget.%')
);

create index if not exists idx_social_activity_projections_owner_occurred
  on public.social_activity_projections (owner_profile_id, occurred_at desc);

create index if not exists idx_social_activity_projections_source_product_event
  on public.social_activity_projections (source_product_event_id)
  where source_product_event_id is not null;

alter table public.social_activity_projections enable row level security;

drop policy if exists "social_activity_projections_select_visible" on public.social_activity_projections;
create policy "social_activity_projections_select_visible"
  on public.social_activity_projections for select
  using (
    owner_profile_id = public.current_profile_id()
    or visibility = 'public'
    or (
      visibility = 'followers'
      and exists (
        select 1
        from public.follow_requests fr
        where fr.follower_id = public.current_profile_id()
          and fr.following_id = owner_profile_id
          and fr.status = 'accepted'
      )
    )
  );

drop policy if exists "social_activity_projections_insert_own" on public.social_activity_projections;
create policy "social_activity_projections_insert_own"
  on public.social_activity_projections for insert to authenticated
  with check (owner_profile_id = public.current_profile_id());

drop policy if exists "social_activity_projections_update_own" on public.social_activity_projections;
create policy "social_activity_projections_update_own"
  on public.social_activity_projections for update to authenticated
  using (owner_profile_id = public.current_profile_id())
  with check (owner_profile_id = public.current_profile_id());

create table if not exists public.recipe_tries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  occurred_on date not null,
  status public.foundation_recipe_try_status not null default 'attempted',
  source_verification_task_id uuid references public.verification_tasks(id) on delete set null,
  feedback_tags text[] not null default array[]::text[],
  eligible_for_streak boolean not null default false,
  eligible_for_social boolean not null default false,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recipe_tries_profile_date
  on public.recipe_tries (profile_id, occurred_on desc);

create index if not exists idx_recipe_tries_recipe
  on public.recipe_tries (recipe_id)
  where recipe_id is not null;

create index if not exists idx_recipe_tries_source_verification_task
  on public.recipe_tries (source_verification_task_id)
  where source_verification_task_id is not null;

create unique index if not exists idx_recipe_tries_idempotency
  on public.recipe_tries (profile_id, idempotency_key)
  where idempotency_key is not null;

alter table public.recipe_tries enable row level security;

drop policy if exists "recipe_tries_select_own" on public.recipe_tries;
create policy "recipe_tries_select_own"
  on public.recipe_tries for select
  using (profile_id = public.current_profile_id());

drop policy if exists "recipe_tries_insert_own" on public.recipe_tries;
create policy "recipe_tries_insert_own"
  on public.recipe_tries for insert to authenticated
  with check (profile_id = public.current_profile_id());

drop policy if exists "recipe_tries_update_own" on public.recipe_tries;
create policy "recipe_tries_update_own"
  on public.recipe_tries for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop trigger if exists trg_recipe_tries_updated_at on public.recipe_tries;
create trigger trg_recipe_tries_updated_at
  before update on public.recipe_tries
  for each row execute procedure public.set_updated_at();
