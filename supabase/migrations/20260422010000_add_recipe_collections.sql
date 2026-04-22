-- Recipe Collections
-- Replaces the single favorites flag with user-named folders.

create table if not exists public.recipe_collections (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  name        text        not null,
  sort_order  integer     not null default 0,
  is_default  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists idx_recipe_collections_user_name
  on public.recipe_collections (user_id, name);

create unique index if not exists idx_recipe_collections_user_default
  on public.recipe_collections (user_id)
  where is_default;

create index if not exists idx_recipe_collections_user_sort
  on public.recipe_collections (user_id, sort_order);

alter table public.recipe_collections enable row level security;

create policy "recipe_collections_select_own"
  on public.recipe_collections for select
  using (user_id = public.current_profile_id());

create policy "recipe_collections_insert_own"
  on public.recipe_collections for insert to authenticated
  with check (user_id = public.current_profile_id());

create policy "recipe_collections_update_own"
  on public.recipe_collections for update to authenticated
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id());

create policy "recipe_collections_delete_own"
  on public.recipe_collections for delete to authenticated
  using (user_id = public.current_profile_id());

create table if not exists public.recipe_collection_items (
  id             uuid        primary key default gen_random_uuid(),
  collection_id  uuid        not null references public.recipe_collections(id) on delete cascade,
  recipe_id      uuid        not null references public.recipes(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint recipe_collection_items_unique unique (collection_id, recipe_id)
);

create index if not exists idx_recipe_collection_items_collection_id
  on public.recipe_collection_items (collection_id);

create index if not exists idx_recipe_collection_items_recipe_id
  on public.recipe_collection_items (recipe_id);

alter table public.recipe_collection_items enable row level security;

create policy "recipe_collection_items_select_own"
  on public.recipe_collection_items for select
  using (
    exists (
      select 1
      from public.recipe_collections collections
      where collections.id = collection_id
        and collections.user_id = public.current_profile_id()
    )
  );

create policy "recipe_collection_items_insert_own"
  on public.recipe_collection_items for insert to authenticated
  with check (
    exists (
      select 1
      from public.recipe_collections collections
      where collections.id = collection_id
        and collections.user_id = public.current_profile_id()
    )
  );

create policy "recipe_collection_items_delete_own"
  on public.recipe_collection_items for delete to authenticated
  using (
    exists (
      select 1
      from public.recipe_collections collections
      where collections.id = collection_id
        and collections.user_id = public.current_profile_id()
    )
  );

-- Backfill existing favorites into the default Saved Recipes folder.
insert into public.recipe_collections (user_id, name, sort_order, is_default)
select distinct
  user_id,
  'Saved Recipes',
  0,
  true
from public.recipe_favorites
on conflict (user_id, name) do nothing;

insert into public.recipe_collection_items (collection_id, recipe_id, created_at)
select
  collections.id,
  favorites.recipe_id,
  favorites.created_at
from public.recipe_favorites favorites
join public.recipe_collections collections
  on collections.user_id = favorites.user_id
 and collections.name = 'Saved Recipes'
on conflict (collection_id, recipe_id) do nothing;
