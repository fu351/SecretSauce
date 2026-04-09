-- ============================================================
-- Add usernames to profiles
-- Usernames are public-facing handles used in app routes.
-- Existing profiles may remain null until backfilled.
-- ============================================================

alter table public.profiles
  add column if not exists username text;

update public.profiles
set username = lower(nullif(trim(username), ''))
where username is not null;

do $$
begin
  alter table public.profiles
    add constraint profiles_username_format
    check (
      username is null
      or (
        username = lower(username)
        and username ~ '^[a-z0-9_]{3,30}$'
      )
    );
exception
  when duplicate_object then null;
end
$$;

create unique index if not exists idx_profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;
