create table if not exists public.cook_checks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('recipe_try', 'streak', 'verification', 'manual_meal')),
  source_recipe_try_id uuid references public.recipe_tries(id) on delete set null,
  source_verification_task_id uuid references public.verification_tasks(id) on delete set null,
  source_product_event_id uuid references public.product_events(id) on delete set null,
  status text not null check (status in ('draft', 'published', 'skipped', 'expired')) default 'draft',
  visibility public.foundation_social_visibility not null default 'private',
  caption text,
  projection_id uuid references public.social_activity_projections(id) on delete set null,
  published_at timestamptz,
  expires_at timestamptz,
  skipped_at timestamptz,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cook_checks_source_reference_required check (
    source_recipe_try_id is not null
    or source_verification_task_id is not null
    or source_product_event_id is not null
  )
);

create unique index if not exists idx_cook_checks_profile_idempotency
  on public.cook_checks (profile_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists idx_cook_checks_profile_source_recipe_try
  on public.cook_checks (profile_id, source_recipe_try_id)
  where source_recipe_try_id is not null;

create unique index if not exists idx_cook_checks_profile_source_verification
  on public.cook_checks (profile_id, source_verification_task_id)
  where source_verification_task_id is not null;

create index if not exists idx_cook_checks_profile_status_created
  on public.cook_checks (profile_id, status, created_at desc);

create table if not exists public.cook_check_reactions (
  id uuid primary key default gen_random_uuid(),
  cook_check_id uuid not null references public.cook_checks(id) on delete cascade,
  reactor_profile_id uuid not null references public.profiles(id) on delete cascade,
  reaction_key text not null check (reaction_key in ('fire', 'yum', 'clap', 'chefkiss')),
  created_at timestamptz not null default now(),
  unique (cook_check_id, reactor_profile_id, reaction_key)
);

create index if not exists idx_cook_check_reactions_cook_check
  on public.cook_check_reactions (cook_check_id, created_at desc);

drop trigger if exists trg_cook_checks_updated_at on public.cook_checks;
create trigger trg_cook_checks_updated_at before update on public.cook_checks
for each row execute procedure public.set_updated_at();

alter table public.cook_checks enable row level security;
alter table public.cook_check_reactions enable row level security;

drop policy if exists "cook_checks_select_visible" on public.cook_checks;
create policy "cook_checks_select_visible" on public.cook_checks for select to authenticated
using (
  profile_id = public.current_profile_id()
  or visibility = 'public'
  or (
    visibility = 'followers'
    and exists (
      select 1
      from public.follow_requests fr
      where fr.follower_id = public.current_profile_id()
        and fr.following_id = cook_checks.profile_id
        and fr.status = 'accepted'
    )
  )
);

drop policy if exists "cook_checks_insert_own" on public.cook_checks;
create policy "cook_checks_insert_own" on public.cook_checks for insert to authenticated
with check (profile_id = public.current_profile_id());

drop policy if exists "cook_checks_update_own" on public.cook_checks;
create policy "cook_checks_update_own" on public.cook_checks for update to authenticated
using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

drop policy if exists "cook_checks_delete_own" on public.cook_checks;
create policy "cook_checks_delete_own" on public.cook_checks for delete to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "cook_check_reactions_select_visible" on public.cook_check_reactions;
create policy "cook_check_reactions_select_visible" on public.cook_check_reactions for select to authenticated
using (
  exists (
    select 1
    from public.cook_checks cc
    where cc.id = cook_check_reactions.cook_check_id
      and (
        cc.profile_id = public.current_profile_id()
        or cc.visibility = 'public'
        or (
          cc.visibility = 'followers'
          and exists (
            select 1
            from public.follow_requests fr
            where fr.follower_id = public.current_profile_id()
              and fr.following_id = cc.profile_id
              and fr.status = 'accepted'
          )
        )
      )
  )
);

drop policy if exists "cook_check_reactions_insert_own" on public.cook_check_reactions;
create policy "cook_check_reactions_insert_own" on public.cook_check_reactions for insert to authenticated
with check (reactor_profile_id = public.current_profile_id());

drop policy if exists "cook_check_reactions_delete_own" on public.cook_check_reactions;
create policy "cook_check_reactions_delete_own" on public.cook_check_reactions for delete to authenticated
using (reactor_profile_id = public.current_profile_id());
