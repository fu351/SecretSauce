-- ============================================================
-- Posts System
-- Food photo posts with captions, likes, and reposts.
-- ============================================================

-- 1. posts table
create table public.posts (
  id         uuid        primary key default gen_random_uuid(),
  author_id  uuid        not null references public.profiles(id) on delete cascade,
  image_url  text        not null,
  title      text        not null,
  caption    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_posts_author_id  on public.posts (author_id);
create index idx_posts_created_at on public.posts (created_at desc);

-- 2. post_likes table
create table public.post_likes (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.posts(id) on delete cascade,
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_likes_unique unique (post_id, profile_id)
);

create index idx_post_likes_post_id    on public.post_likes (post_id);
create index idx_post_likes_profile_id on public.post_likes (profile_id);

-- 3. post_reposts table
create table public.post_reposts (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.posts(id) on delete cascade,
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_reposts_unique unique (post_id, profile_id)
);

create index idx_post_reposts_post_id    on public.post_reposts (post_id);
create index idx_post_reposts_profile_id on public.post_reposts (profile_id);

-- 4. updated_at trigger for posts
create or replace function public.set_posts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_posts_updated_at
  before update on public.posts
  for each row execute procedure public.set_posts_updated_at();

-- 5. RLS on posts
alter table public.posts enable row level security;

-- Anyone can read posts
create policy "posts_select_public"
  on public.posts for select
  using (true);

-- Authenticated users can insert their own posts
create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check (author_id = public.current_profile_id());

-- Authors can update their own posts
create policy "posts_update_own"
  on public.posts for update
  to authenticated
  using   (author_id = public.current_profile_id())
  with check (author_id = public.current_profile_id());

-- Authors can delete their own posts
create policy "posts_delete_own"
  on public.posts for delete
  to authenticated
  using (author_id = public.current_profile_id());

-- 6. RLS on post_likes
alter table public.post_likes enable row level security;

create policy "post_likes_select_public"
  on public.post_likes for select
  using (true);

create policy "post_likes_insert_own"
  on public.post_likes for insert
  to authenticated
  with check (profile_id = public.current_profile_id());

create policy "post_likes_delete_own"
  on public.post_likes for delete
  to authenticated
  using (profile_id = public.current_profile_id());

-- 7. RLS on post_reposts
alter table public.post_reposts enable row level security;

create policy "post_reposts_select_public"
  on public.post_reposts for select
  using (true);

create policy "post_reposts_insert_own"
  on public.post_reposts for insert
  to authenticated
  with check (profile_id = public.current_profile_id());

create policy "post_reposts_delete_own"
  on public.post_reposts for delete
  to authenticated
  using (profile_id = public.current_profile_id());

-- 8. Storage bucket for post images
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to post-images
create policy "post_images_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-images');

-- Allow public read of post images
create policy "post_images_select"
  on storage.objects for select
  using (bucket_id = 'post-images');

-- Allow owners to delete their own post images
create policy "post_images_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-images' and owner = auth.uid());
