-- Social Sprint 2: Recipe Try Feedback + Peer Success Score
-- Adds structured post-cook feedback tied to recipe_tries.
-- Intentionally separate from legacy public.recipe_reviews (star rating + free-text),
-- which continues to operate unchanged. Peer Success Score is computed on read
-- from this table; no aggregate snapshot table is introduced in Sprint 2.

do $$
begin
  create type public.recipe_feedback_outcome as enum (
    'succeeded',
    'needed_tweaks',
    'skipped_feedback'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.recipe_try_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recipe_try_id uuid not null references public.recipe_tries(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  outcome public.recipe_feedback_outcome not null,
  feedback_tags text[] not null default array[]::text[],
  visibility public.foundation_social_visibility not null default 'private',
  share_approved boolean not null default false,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One feedback record per recipe_try. Updates go through the same row.
  constraint recipe_try_feedback_unique_try unique (recipe_try_id),
  -- Skipped feedback should never carry tags.
  constraint recipe_try_feedback_tags_when_outcome check (
    (outcome = 'skipped_feedback' and coalesce(array_length(feedback_tags, 1), 0) = 0)
    or outcome <> 'skipped_feedback'
  )
);

create index if not exists idx_recipe_try_feedback_recipe_outcome
  on public.recipe_try_feedback (recipe_id, outcome)
  where recipe_id is not null;

create index if not exists idx_recipe_try_feedback_profile_created
  on public.recipe_try_feedback (profile_id, created_at desc);

create unique index if not exists idx_recipe_try_feedback_idempotency
  on public.recipe_try_feedback (profile_id, idempotency_key)
  where idempotency_key is not null;

drop trigger if exists trg_recipe_try_feedback_updated_at on public.recipe_try_feedback;
create trigger trg_recipe_try_feedback_updated_at before update on public.recipe_try_feedback
for each row execute procedure public.set_updated_at();

alter table public.recipe_try_feedback enable row level security;

-- Individual feedback is private to its author. Aggregate peer scores are served
-- via server-side computation only, never by exposing raw rows to other profiles.
drop policy if exists "recipe_try_feedback_select_own" on public.recipe_try_feedback;
create policy "recipe_try_feedback_select_own"
  on public.recipe_try_feedback for select to authenticated
  using (profile_id = public.current_profile_id());

drop policy if exists "recipe_try_feedback_insert_own" on public.recipe_try_feedback;
create policy "recipe_try_feedback_insert_own"
  on public.recipe_try_feedback for insert to authenticated
  with check (
    profile_id = public.current_profile_id()
    and exists (
      select 1 from public.recipe_tries rt
      where rt.id = recipe_try_feedback.recipe_try_id
        and rt.profile_id = public.current_profile_id()
    )
  );

drop policy if exists "recipe_try_feedback_update_own" on public.recipe_try_feedback;
create policy "recipe_try_feedback_update_own"
  on public.recipe_try_feedback for update to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

drop policy if exists "recipe_try_feedback_delete_own" on public.recipe_try_feedback;
create policy "recipe_try_feedback_delete_own"
  on public.recipe_try_feedback for delete to authenticated
  using (profile_id = public.current_profile_id());
