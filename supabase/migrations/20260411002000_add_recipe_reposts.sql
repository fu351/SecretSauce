-- Recipe Reposts
-- Tracks when a user re-shares a recipe on the platform, separate from post_reposts which covers posts.

create table if not exists public.recipe_reposts (
  id          uuid        primary key default gen_random_uuid(),
  recipe_id   uuid        not null references public.recipes(id) on delete cascade,
  profile_id  uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint recipe_reposts_unique unique (recipe_id, profile_id)
);

create index if not exists idx_recipe_reposts_recipe_id  on public.recipe_reposts (recipe_id);
create index if not exists idx_recipe_reposts_profile_id on public.recipe_reposts (profile_id);

alter table public.recipe_reposts enable row level security;

create policy "recipe_reposts_select_all"
  on public.recipe_reposts for select
  using (true);

create policy "recipe_reposts_insert_own"
  on public.recipe_reposts for insert to authenticated
  with check (profile_id = public.current_profile_id());

create policy "recipe_reposts_delete_own"
  on public.recipe_reposts for delete to authenticated
  using (profile_id = public.current_profile_id());
