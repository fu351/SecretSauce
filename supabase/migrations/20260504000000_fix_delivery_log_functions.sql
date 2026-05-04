-- Fix delivery log RPC functions.
--
-- Root causes fixed:
--   1. Two conflicting overloads of fn_add_to_delivery_log existed:
--      - Version 1 (returns uuid): omits price validation entirely.
--      - Version 2 (returns boolean): has price validation but omits
--        week_index (NOT NULL, no default) → every insert fails silently.
--   2. fn_bulk_add_to_delivery_log never generated or set order_id, so
--      all purchases had order_id = NULL → "View Details" unreachable.
--   3. complete_order referenced non-existent tables (store_list_history,
--      shopping_item_price_cache) and is dead code — never called by the app.

-- ── Drop stale functions ─────────────────────────────────────────────────────

drop function if exists public.fn_add_to_delivery_log(uuid, uuid, numeric, numeric, date);
drop function if exists public.fn_add_to_delivery_log(uuid, uuid, integer, numeric, date);
drop function if exists public.complete_order(jsonb, date);

-- ── Single clean fn_add_to_delivery_log ─────────────────────────────────────

create or replace function public.fn_add_to_delivery_log(
  p_shopping_list_item_id uuid,
  p_product_mapping_id    uuid,
  p_num_packages          numeric,
  p_frontend_price        numeric,
  p_delivery_date         date,
  p_order_id              uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid;
  v_ingredient_id  uuid;
  v_store_id       uuid;
  v_actual_price   numeric;
  v_price_match    boolean := true;
  v_week_index     integer;
begin
  -- Resolve user and ingredient from shopping list item
  select user_id, ingredient_id
    into v_user_id, v_ingredient_id
    from public.shopping_list_items
   where id = p_shopping_list_item_id;

  if not found then
    raise exception 'Shopping list item % not found', p_shopping_list_item_id;
  end if;

  -- Fetch authoritative store and price from recent price cache
  select grocery_store_id, price
    into v_store_id, v_actual_price
    from public.ingredients_recent
   where product_mapping_id = p_product_mapping_id
   limit 1;

  if not found then
    raise exception 'No recent pricing found for product mapping %', p_product_mapping_id;
  end if;

  -- Price integrity check: 1-cent tolerance for numeric rounding.
  -- Always stores the backend price regardless of match result.
  if abs(coalesce(p_frontend_price, 0) - coalesce(v_actual_price, 0)) > 0.01 then
    v_price_match := false;
  end if;

  -- Compute ISO week index from delivery date
  v_week_index := extract(week from coalesce(p_delivery_date, current_date))::integer;

  begin
    insert into public.purchases (
      user_id,
      grocery_store_id,
      standardized_ingredient_id,
      product_mapping_id,
      price_at_selection,
      quantity_needed,
      delivery_date,
      expires_at,
      week_index,
      order_id
    ) values (
      v_user_id,
      v_store_id,
      v_ingredient_id,
      p_product_mapping_id,
      v_actual_price,
      p_num_packages,
      coalesce(p_delivery_date, current_date),
      now() + interval '7 days',
      v_week_index,
      p_order_id
    )
    on conflict (user_id, grocery_store_id, standardized_ingredient_id, delivery_date)
    do update set
      product_mapping_id = excluded.product_mapping_id,
      price_at_selection = excluded.price_at_selection,
      quantity_needed    = purchases.quantity_needed + excluded.quantity_needed,
      order_id           = coalesce(purchases.order_id, excluded.order_id),
      updated_at         = now();

  exception when others then
    raise notice 'Failed to log delivery for item %: %', p_shopping_list_item_id, sqlerrm;
    return false;
  end;

  return v_price_match;
end;
$$;

-- ── Updated fn_bulk_add_to_delivery_log ─────────────────────────────────────
-- Generates a single order_id shared by all items in one bulk call so every
-- purchase from a single checkout session is grouped under the same order.

create or replace function public.fn_bulk_add_to_delivery_log(
  p_entries              jsonb,
  p_default_delivery_date date default null
)
returns table (
  shopping_list_item_id uuid,
  success               boolean,
  price_matched         boolean,
  error_message         text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r          record;
  v_order_id uuid := gen_random_uuid();
begin
  for r in
    select * from jsonb_to_recordset(p_entries) as x(
      item_id        uuid,
      product_id     uuid,
      num_pkgs       numeric,
      frontend_price numeric,
      delivery_date  date
    )
  loop
    shopping_list_item_id := r.item_id;
    error_message         := null;

    begin
      price_matched := public.fn_add_to_delivery_log(
        r.item_id,
        r.product_id,
        r.num_pkgs,
        r.frontend_price,
        coalesce(r.delivery_date, p_default_delivery_date),
        v_order_id
      );
      success := true;
      return next;

    exception when others then
      success       := false;
      price_matched := false;
      error_message := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

-- Grant execute to service_role only (called from server-side webhook)
revoke execute on function public.fn_add_to_delivery_log(uuid, uuid, numeric, numeric, date, uuid) from public, anon, authenticated;
grant  execute on function public.fn_add_to_delivery_log(uuid, uuid, numeric, numeric, date, uuid) to service_role;

revoke execute on function public.fn_bulk_add_to_delivery_log(jsonb, date) from public, anon, authenticated;
grant  execute on function public.fn_bulk_add_to_delivery_log(jsonb, date) to service_role;
