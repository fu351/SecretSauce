-- Staging table for cart items during Stripe checkout.
--
-- Problem: Stripe session metadata is limited to 500 characters per value,
-- which silently drops cart items for orders with 4+ products (each UUID-based
-- item is ~150 chars). This table stores the full cart server-side before
-- checkout so the webhook can retrieve it via a UUID reference (cart_id).
--
-- Flow:
--   1. /api/checkout inserts cart items here, returns the row id as cart_id.
--   2. cart_id is stored in Stripe session metadata (36 chars — always fits).
--   3. /api/webhooks/stripe reads items by cart_id, calls bulkAddToDeliveryLog,
--      then sets stripe_session_id to prevent double-processing on replay.

create table if not exists public.pending_cart_items (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.profiles(id) on delete cascade,
  items             jsonb       not null,
  stripe_session_id text        unique,
  expires_at        timestamptz not null default now() + interval '2 hours',
  created_at        timestamptz not null default now(),
  constraint pending_cart_items_is_array check (jsonb_typeof(items) = 'array')
);

create index if not exists idx_pending_cart_items_expires_at
  on public.pending_cart_items (expires_at);

create index if not exists idx_pending_cart_items_user_id
  on public.pending_cart_items (user_id);

alter table public.pending_cart_items enable row level security;

-- Users can insert their own pending carts (needed for the checkout page RLS context).
-- Reads and updates are done server-side via service_role — no user SELECT needed.
drop policy if exists "pending_cart_items_insert_own" on public.pending_cart_items;
create policy "pending_cart_items_insert_own"
  on public.pending_cart_items
  for insert
  to authenticated
  with check (user_id = public.current_profile_id());
