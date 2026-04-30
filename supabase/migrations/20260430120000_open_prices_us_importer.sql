-- Expand grocery store parents used by the Open Food Facts Open Prices importer.
-- Subsidiary banners are mapped to parent brands in application code before insert.

alter type public.grocery_store add value if not exists 'albertsons';
alter type public.grocery_store add value if not exists 'costco';
alter type public.grocery_store add value if not exists 'groceryoutlet';
alter type public.grocery_store add value if not exists 'sprouts';
alter type public.grocery_store add value if not exists 'smartandfinal';
alter type public.grocery_store add value if not exists 'raleys';
alter type public.grocery_store add value if not exists 'savemart';
alter type public.grocery_store add value if not exists 'shoprite';
alter type public.grocery_store add value if not exists 'publix';
alter type public.grocery_store add value if not exists 'winco';
alter type public.grocery_store add value if not exists 'heb';
alter type public.grocery_store add value if not exists 'weismarkets';
alter type public.grocery_store add value if not exists 'aholddelhaize';
alter type public.grocery_store add value if not exists 'hmart';
alter type public.grocery_store add value if not exists 'marketbasket';
alter type public.grocery_store add value if not exists 'bjs';
alter type public.grocery_store add value if not exists 'samsclub';
alter type public.grocery_store add value if not exists 'dollartree';
alter type public.grocery_store add value if not exists 'keyfood';
alter type public.grocery_store add value if not exists 'eataly';
alter type public.grocery_store add value if not exists 'ikea';
alter type public.grocery_store add value if not exists 'cvs';
alter type public.grocery_store add value if not exists 'independent';

alter table public.ingredients_history
  add column if not exists source text not null default 'internal',
  add column if not exists source_price_id text,
  add column if not exists source_location_id integer,
  add column if not exists source_price_date date,
  add column if not exists source_currency text,
  add column if not exists source_proof_id integer,
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

create unique index if not exists ingredients_history_open_prices_source_price_id_idx
  on public.ingredients_history (source, source_price_id)
  where source = 'open_prices' and source_price_id is not null;

create index if not exists ingredients_history_source_location_idx
  on public.ingredients_history (source, source_location_id)
  where source = 'open_prices';

create index if not exists grocery_stores_open_prices_location_id_idx
  on public.grocery_stores ((metadata #>> '{open_prices,location_id}'))
  where metadata ? 'open_prices';
