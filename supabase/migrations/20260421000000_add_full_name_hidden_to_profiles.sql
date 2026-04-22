-- ============================================================
-- Profile name visibility
-- Adds a flag allowing users to hide their full name publicly
-- while keeping the rest of the profile intact.
-- ============================================================

alter table public.profiles
  add column if not exists full_name_hidden boolean not null default false;
