-- Recipe Likes
-- Stores public "likes" on recipes, separate from recipe_favorites (which is a private save/bookmark).
-- profile_id references profiles(id); current_profile_id() helper is already defined.

create table if not exists public.recipe_likes (
  id          uuid        primary key default gen_random_uuid(),
  recipe_id   uuid        not null references public.recipes(id) on delete cascade,
  profile_id  uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint recipe_likes_unique unique (recipe_id, profile_id)
);

create index if not exists idx_recipe_likes_recipe_id  on public.recipe_likes (recipe_id);
create index if not exists idx_recipe_likes_profile_id on public.recipe_likes (profile_id);

alter table public.recipe_likes enable row level security;

-- Anyone can read (public counts + friend-who-liked queries)
create policy "recipe_likes_select_all"
  on public.recipe_likes for select
  using (true);

-- Authenticated users can insert their own like
create policy "recipe_likes_insert_own"
  on public.recipe_likes for insert to authenticated
  with check (profile_id = public.current_profile_id());

-- Can only delete your own like
create policy "recipe_likes_delete_own"
  on public.recipe_likes for delete to authenticated
  using (profile_id = public.current_profile_id());
