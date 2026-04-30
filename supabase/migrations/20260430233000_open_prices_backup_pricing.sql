-- Make Open Prices imports usable as backup price coverage.
-- Exact preferred-store prices still win; same-banner prices are only used when
-- a preferred store has no usable exact row for the ingredient/product.

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

create index if not exists ingredients_recent_product_store_idx
  on public.ingredients_recent (product_mapping_id, grocery_store_id);

create index if not exists product_mappings_ingredient_store_idx
  on public.product_mappings (standardized_ingredient_id, store_brand);

create or replace function public.get_pricing(p_user_id uuid)
returns table(result jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    return query
    with raw_items as (
        select
            sli.id as sli_id,
            coalesce(
                sli.ingredient_id,
                (
                    select si.id
                    from public.standardized_ingredients si
                    where si.search_vector @@ websearch_to_tsquery('english', sli.name)
                       or si.canonical_name % sli.name
                    order by
                        ts_rank(si.search_vector, websearch_to_tsquery('english', sli.name)) desc,
                        similarity(si.canonical_name, sli.name) desc
                    limit 1
                )
            ) as ingredient_id,
            greatest(coalesce(sli.quantity, 1), 0.0001)::numeric as quantity,
            nullif(lower(trim(coalesce(sli.unit, ''))), '') as unit
        from public.shopping_list_items sli
        where sli.user_id = p_user_id
          and sli.checked = false
    ),
    ingredient_base_unit as (
        select distinct on (ri.ingredient_id)
            ri.ingredient_id,
            coalesce(ri.unit, si.default_unit::text, 'unit') as base_unit
        from raw_items ri
        left join public.standardized_ingredients si on si.id = ri.ingredient_id
        where ri.ingredient_id is not null
        order by ri.ingredient_id, ri.sli_id
    ),
    normalized_items as (
        select
            ri.sli_id,
            ri.ingredient_id,
            ibu.base_unit as requested_unit,
            case
                when ri.unit is null then ri.quantity
                when ri.unit = ibu.base_unit then ri.quantity
                else coalesce(
                    public.convert_units(ri.quantity, ri.unit, ibu.base_unit, ri.ingredient_id),
                    ri.quantity
                )
            end as converted_quantity
        from raw_items ri
        inner join ingredient_base_unit ibu
            on ibu.ingredient_id = ri.ingredient_id
    ),
    consolidated_items as (
        select
            ni.ingredient_id,
            sum(ni.converted_quantity) as total_amount,
            ni.requested_unit,
            jsonb_agg(ni.sli_id order by ni.sli_id) as item_ids
        from normalized_items ni
        group by ni.ingredient_id, ni.requested_unit
    ),
    preferred_store_context as (
        select
            ups.profile_id,
            ups.grocery_store_id as preferred_grocery_store_id,
            ups.store_enum,
            ups.distance_miles,
            gs.name as store_name,
            gs.zip_code
        from public.user_preferred_stores ups
        left join public.grocery_stores gs on gs.id = ups.grocery_store_id
        where ups.profile_id = p_user_id
    ),
    user_overrides as (
        select uo.ingredient_id, uo.grocery_store_id, uo.product_mapping_id
        from public.user_product_overrides uo
        where uo.user_id = p_user_id
    ),
    candidate_products as (
        select
            ci.ingredient_id,
            ci.total_amount,
            ci.requested_unit,
            ci.item_ids,
            psc.preferred_grocery_store_id,
            ir.grocery_store_id as price_grocery_store_id,
            psc.store_enum,
            psc.store_name,
            coalesce(psc.zip_code, price_gs.zip_code) as zip_code,
            psc.distance_miles,
            pm.id as product_mapping_id,
            pm.raw_product_name as product_name,
            pm.image_url,
            pm.standardized_quantity as product_quantity,
            pm.standardized_unit::text as product_unit,
            ir.price as package_price,
            ir.unit_price,
            coalesce(price_source.source, 'internal') as price_source,
            (ir.grocery_store_id = psc.preferred_grocery_store_id) as is_exact_store_price,
            (uo.product_mapping_id is not null) as is_user_override,
            case
                when pm.standardized_unit::text = ci.requested_unit then pm.standardized_quantity
                else public.convert_units(
                    pm.standardized_quantity,
                    pm.standardized_unit::text,
                    ci.requested_unit,
                    ci.ingredient_id
                )
            end as converted_quantity
        from consolidated_items ci
        inner join preferred_store_context psc on true
        inner join public.product_mappings pm
            on pm.standardized_ingredient_id = ci.ingredient_id
           and pm.store_brand = psc.store_enum
        inner join public.ingredients_recent ir
            on ir.product_mapping_id = pm.id
        left join public.grocery_stores price_gs
            on price_gs.id = ir.grocery_store_id
        left join lateral (
            select ih.source
            from public.ingredients_history ih
            where ih.product_mapping_id = ir.product_mapping_id
              and ih.grocery_store_id is not distinct from ir.grocery_store_id
            order by ih.created_at desc
            limit 1
        ) price_source on true
        left join user_overrides uo
            on uo.ingredient_id = ci.ingredient_id
           and uo.grocery_store_id = psc.preferred_grocery_store_id
           and uo.product_mapping_id = pm.id
        where ir.price is not null
          and ir.price > 0
          and (
            (pm.standardized_quantity is not null and pm.standardized_quantity > 0)
            or uo.product_mapping_id is not null
          )
    ),
    ranked_candidates as (
        select
            cp.*,
            (cp.converted_quantity is null or cp.converted_quantity <= 0) as conversion_error,
            case
                when cp.converted_quantity is not null and cp.converted_quantity > 0
                    then ceil(cp.total_amount / cp.converted_quantity)
                else 1
            end::integer as packages_to_buy,
            case
                when cp.converted_quantity is not null and cp.converted_quantity > 0 then false
                else true
            end as used_estimate,
            row_number() over (
                partition by cp.ingredient_id, cp.preferred_grocery_store_id
                order by
                    case when cp.is_user_override then 0 else 1 end,
                    case when cp.is_exact_store_price then 0 else 1 end,
                    case
                        when cp.converted_quantity is not null and cp.converted_quantity > 0 then 0
                        else 1
                    end,
                    (
                        cp.package_price
                        * case
                            when cp.converted_quantity is not null and cp.converted_quantity > 0
                                then ceil(cp.total_amount / cp.converted_quantity)
                            else 1
                          end
                    ) asc,
                    cp.package_price asc
            ) as row_rank
        from candidate_products cp
    ),
    best_per_store as (
        select
            rc.*,
            round((rc.package_price * rc.packages_to_buy)::numeric, 2) as total_price
        from ranked_candidates rc
        where rc.row_rank = 1
    ),
    ingredient_offers as (
        select
            bps.ingredient_id,
            bps.total_amount,
            bps.requested_unit,
            bps.item_ids,
            jsonb_agg(
                jsonb_build_object(
                    'store', bps.store_enum::text,
                    'store_id', bps.preferred_grocery_store_id,
                    'store_name', coalesce(bps.store_name, bps.store_enum::text),
                    'product_mapping_id', bps.product_mapping_id,
                    'unit_price', case
                        when bps.unit_price is null then null
                        else round(bps.unit_price::numeric, 2)
                    end,
                    'package_price', round(bps.package_price::numeric, 2),
                    'total_price', bps.total_price,
                    'product_name', bps.product_name,
                    'image_url', bps.image_url,
                    'zip_code', bps.zip_code,
                    'distance', bps.distance_miles,
                    'product_unit', bps.product_unit,
                    'product_quantity', bps.product_quantity,
                    'converted_quantity', bps.converted_quantity,
                    'packages_to_buy', bps.packages_to_buy,
                    'conversion_error', bps.conversion_error,
                    'used_estimate', bps.used_estimate,
                    'price_source', bps.price_source,
                    'price_store_id', bps.price_grocery_store_id,
                    'used_price_backup', not bps.is_exact_store_price
                )
                order by bps.total_price asc
            ) as offers
        from best_per_store bps
        group by bps.ingredient_id, bps.total_amount, bps.requested_unit, bps.item_ids
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'standardized_ingredient_id', io.ingredient_id,
                'total_amount', io.total_amount,
                'requested_unit', io.requested_unit,
                'item_ids', io.item_ids,
                'offers', io.offers
            )
        ),
        '[]'::jsonb
    )
    from ingredient_offers io;
end;
$$;

create or replace function public.get_pricing_gaps(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    result jsonb;
begin
    with user_context as (
        select p.id as profile_id, p.zip_code, ups.store_enum, ups.grocery_store_id
        from public.profiles p
        join public.user_preferred_stores ups on p.id = ups.profile_id
        where p.id = p_user_id
    ),
    required_ingredients as (
        select distinct on (si.id)
            si.id as ingredient_id, si.canonical_name as search_term
        from public.shopping_list_items sli
        join public.standardized_ingredients si on sli.ingredient_id = si.id
        where sli.user_id = p_user_id and sli.ingredient_id is not null
    ),
    ideal_coverage as (
        select ri.ingredient_id, ri.search_term,
               uc.store_enum, uc.grocery_store_id,
               coalesce(uc.zip_code, gs.zip_code) as zip_code
        from required_ingredients ri cross join user_context uc
        left join public.grocery_stores gs on gs.id = uc.grocery_store_id
    ),
    missing_items as (
        select ic.store_enum, ic.grocery_store_id, ic.zip_code,
               jsonb_build_object('id', ic.ingredient_id, 'name', ic.search_term) as ingredient_info
        from ideal_coverage ic
        where not exists (
            select 1
            from public.product_mappings pm
            join public.ingredients_recent ir on ir.product_mapping_id = pm.id
            where pm.standardized_ingredient_id = ic.ingredient_id
              and pm.store_brand = ic.store_enum
              and ir.price is not null
              and ir.price > 0
        )
    )
    select jsonb_agg(jsonb_build_object(
        'store', store_enum, 'grocery_store_id', grocery_store_id,
        'zip_code', zip_code, 'ingredients', ingredients
    ))
    from (
        select store_enum, grocery_store_id, zip_code, jsonb_agg(ingredient_info) as ingredients
        from missing_items group by store_enum, grocery_store_id, zip_code
    ) grouped_results
    into result;

    return coalesce(result, '[]'::jsonb);
end;
$$;

create or replace function public.get_ingredient_price_details(
    p_user_id uuid,
    p_standardized_ingredient_id uuid,
    p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    result jsonb;
begin
    with preferred_store_context as (
        select ups.grocery_store_id as preferred_grocery_store_id,
               ups.store_enum,
               ups.distance_miles,
               gs.name as store_name,
               gs.zip_code
        from public.user_preferred_stores ups
        left join public.grocery_stores gs on gs.id = ups.grocery_store_id
        where ups.profile_id = p_user_id
    ),
    candidates as (
        select
            pm.standardized_ingredient_id,
            psc.preferred_grocery_store_id,
            ir.grocery_store_id as price_grocery_store_id,
            psc.store_enum,
            coalesce(psc.store_name, psc.store_enum::text) as store_name,
            psc.zip_code,
            psc.distance_miles,
            ir.product_mapping_id,
            ir.unit_price,
            ir.price,
            pm.standardized_quantity,
            pm.raw_product_name,
            pm.image_url,
            (ir.grocery_store_id = psc.preferred_grocery_store_id) as is_exact_store_price,
            coalesce(price_source.source, 'internal') as price_source,
            row_number() over (
                partition by psc.preferred_grocery_store_id
                order by
                    case when ir.grocery_store_id = psc.preferred_grocery_store_id then 0 else 1 end,
                    (ir.price * ceil(p_quantity / nullif(pm.standardized_quantity, 0))) asc,
                    ir.price asc
            ) as row_rank
        from preferred_store_context psc
        inner join public.product_mappings pm
            on pm.standardized_ingredient_id = p_standardized_ingredient_id
           and pm.store_brand = psc.store_enum
        inner join public.ingredients_recent ir
            on ir.product_mapping_id = pm.id
        left join lateral (
            select ih.source
            from public.ingredients_history ih
            where ih.product_mapping_id = ir.product_mapping_id
              and ih.grocery_store_id is not distinct from ir.grocery_store_id
            order by ih.created_at desc
            limit 1
        ) price_source on true
        where ir.price is not null
          and ir.price > 0
          and pm.standardized_quantity is not null
          and pm.standardized_quantity > 0
    ),
    best_per_store as (
        select * from candidates where row_rank = 1
    )
    select jsonb_agg(jsonb_build_object(
        'standardized_ingredient_id', standardized_ingredient_id,
        'total_amount', p_quantity,
        'item_ids', '[]'::jsonb,
        'offers', price_options
    ))
    into result
    from (
        select standardized_ingredient_id,
            jsonb_agg(jsonb_build_object(
                'store',               store_enum,
                'store_id',            preferred_grocery_store_id,
                'store_name',          store_name,
                'product_mapping_id',  product_mapping_id,
                'unit_price',          round(unit_price::numeric, 2),
                'package_price',       round(price::numeric, 2),
                'total_price',         round((price * ceil(p_quantity / nullif(standardized_quantity, 0)))::numeric, 2),
                'packages_to_buy',     ceil(p_quantity / nullif(standardized_quantity, 0)),
                'product_name',        raw_product_name,
                'image_url',           image_url,
                'distance',            distance_miles,
                'zip_code',            zip_code,
                'price_source',        price_source,
                'price_store_id',      price_grocery_store_id,
                'used_price_backup',   not is_exact_store_price
            ) order by
                case when is_exact_store_price then 0 else 1 end,
                (price * ceil(p_quantity / nullif(standardized_quantity, 0))) asc
            ) as price_options
        from best_per_store
        group by standardized_ingredient_id
    ) ingredient_prices;

    return coalesce(result, '[]'::jsonb);
end;
$$;

create or replace function public.get_replacement(
    p_user_id uuid,
    p_store_brand public.grocery_store,
    p_raw_ingredient_name text
)
returns table(replacement_results jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with search_params as (
    select
      plainto_tsquery('english', coalesce(p_raw_ingredient_name, '')) as ts_q,
      lower(trim(coalesce(p_raw_ingredient_name, '')))                as raw_q
  ),
  scored_ingredients as (
    select
      si.id,
      si.canonical_name,
      si.category,
      si.default_unit,
      (
        coalesce(ts_rank(si.search_vector, sp.ts_q), 0) * 1.0
      ) + (
        coalesce(public.fn_word_commonness_similarity(sp.raw_q, si.canonical_name), 0) * 1.6
      ) + (
        case
          when sp.raw_q <> ''
           and sp.raw_q like '%' || lower(si.canonical_name) || '%'
          then 0.75
          else 0
        end
      ) + (
        case
          when sp.raw_q <> ''
           and lower(si.canonical_name) like '%' || sp.raw_q || '%'
          then 0.15
          else 0
        end
      ) as match_score
    from public.standardized_ingredients si
    cross join search_params sp
    where
      coalesce(si.search_vector @@ sp.ts_q, false)
      or si.canonical_name % sp.raw_q
      or (
        sp.raw_q <> ''
        and lower(si.canonical_name) like '%' || sp.raw_q || '%'
      )
      or (
        sp.raw_q <> ''
        and sp.raw_q like '%' || lower(si.canonical_name) || '%'
      )
    order by match_score desc
    limit 25
  ),
  preferred_store_context as (
    select ups.grocery_store_id, ups.distance_miles
    from public.user_preferred_stores ups
    where p_user_id is not null
      and ups.profile_id = p_user_id
      and ups.store_enum = p_store_brand
  ),
  candidate_products as (
    select
      si.id         as ingredient_id,
      si.canonical_name,
      si.category,
      si.match_score,
      pm.raw_product_name as product_name,
      ir.price,
      pm.standardized_unit::text as unit,
      pm.standardized_quantity   as quantity,
      pm.image_url,
      ir.unit_price,
      (lower(coalesce(pm.standardized_unit::text, '')) =
       lower(coalesce(si.default_unit::text, ''))) as is_standard_unit,
      psc.distance_miles,
      ir.grocery_store_id,
      (psc.grocery_store_id is not null) as is_exact_store_price,
      coalesce(price_source.source, 'internal') as price_source
    from scored_ingredients si
    inner join public.product_mappings pm
      on pm.standardized_ingredient_id = si.id
     and pm.store_brand = p_store_brand
    inner join public.ingredients_recent ir
      on ir.product_mapping_id = pm.id
    left join preferred_store_context psc
      on psc.grocery_store_id = ir.grocery_store_id
    left join lateral (
      select ih.source
      from public.ingredients_history ih
      where ih.product_mapping_id = ir.product_mapping_id
        and ih.grocery_store_id is not distinct from ir.grocery_store_id
      order by ih.created_at desc
      limit 1
    ) price_source on true
    where si.match_score > 0.1
      and coalesce(ir.price, 0) > 0
      and (
        p_user_id is null
        or not exists (select 1 from preferred_store_context)
        or psc.grocery_store_id is not null
        or not exists (
          select 1
          from public.product_mappings pm_exact
          join public.ingredients_recent ir_exact on ir_exact.product_mapping_id = pm_exact.id
          join preferred_store_context psc_exact on psc_exact.grocery_store_id = ir_exact.grocery_store_id
          where pm_exact.standardized_ingredient_id = si.id
            and pm_exact.store_brand = p_store_brand
            and coalesce(ir_exact.price, 0) > 0
        )
      )
  ),
  deduped_products as (
    select distinct on (cp.ingredient_id, cp.product_name)
      cp.*
    from candidate_products cp
    order by cp.ingredient_id, cp.product_name,
             cp.is_exact_store_price desc, cp.distance_miles asc nulls last, cp.price asc
  ),
  formatted_results as (
    select
      dp.ingredient_id,
      dp.canonical_name,
      dp.category,
      jsonb_agg(
        jsonb_build_object(
          'product_name',       dp.product_name,
          'price',              dp.price,
          'unit_price',         case
                                  when dp.unit_price is null then null
                                  else round(dp.unit_price::numeric, 2)
                                end,
          'quantity',           dp.quantity,
          'unit',               dp.unit,
          'image_url',          dp.image_url,
          'is_standard_unit',   dp.is_standard_unit,
          'price_source',       dp.price_source,
          'used_price_backup',  not dp.is_exact_store_price
        )
        order by dp.is_exact_store_price desc, dp.is_standard_unit desc, dp.price asc, dp.distance_miles asc nulls last
      ) as offers
    from deduped_products dp
    group by dp.ingredient_id, dp.canonical_name, dp.category
    order by max(dp.match_score) desc
    limit 100
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ingredient_id',  ingredient_id,
        'canonical_name', canonical_name,
        'category',       category,
        'offers',         offers
      )
    ),
    '[]'::jsonb
  ) as replacement_results
  from formatted_results;
end;
$$;

create or replace function public.get_replacement(
    p_raw_ingredient_name text,
    p_store_brand public.grocery_store
)
returns table(replacement_results jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select *
  from public.get_replacement(null::uuid, p_store_brand, p_raw_ingredient_name);
end;
$$;

create or replace function public.calculate_recipe_cost(
    p_recipe_id uuid,
    p_store_id public.grocery_store,
    p_zip_code text,
    p_servings integer,
    p_user_id uuid default null::uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    result jsonb;
begin
    with user_stores as (
      select ups.grocery_store_id
      from public.user_preferred_stores ups
      where ups.profile_id = p_user_id
        and ups.store_enum = p_store_id
    ),
    ranked_prices as (
        select
            ri.standardized_ingredient_id,
            ri.display_name as ingredient_name,
            ri.quantity as amount_needed,
            ir.price as package_price,
            pm.standardized_quantity as package_qty,
            ceil(
              (ri.quantity * p_servings / nullif(r_base.servings, 1))
              / nullif(pm.standardized_quantity, 0)
            ) as packages_needed,
            row_number() over (
                partition by ri.standardized_ingredient_id
                order by
                    case
                      when exists (select 1 from user_stores)
                       and ir.grocery_store_id in (select grocery_store_id from user_stores)
                      then 0
                      when exists (select 1 from user_stores) then 1
                      else 0
                    end,
                    (
                        ceil(
                            (ri.quantity * p_servings / nullif(r_base.servings, 1))
                            / nullif(pm.standardized_quantity, 0)
                        ) * ir.price
                    ) asc,
                    ir.price asc
            ) as row_rank
        from public.recipe_ingredients ri
        inner join public.recipes r_base on r_base.id = ri.recipe_id
        inner join public.product_mappings pm
            on pm.standardized_ingredient_id = ri.standardized_ingredient_id
           and pm.store_brand = p_store_id
        inner join public.ingredients_recent ir on ir.product_mapping_id = pm.id
        where ri.recipe_id = p_recipe_id
          and ri.standardized_ingredient_id is not null
          and ir.price is not null
          and ir.price > 0
          and pm.standardized_quantity is not null
          and pm.standardized_quantity > 0
    ),
    priced as (
        select *
        from ranked_prices
        where row_rank = 1
    )
    select jsonb_build_object(
        'recipeId',       p_recipe_id,
        'totalCost',      coalesce(round(sum(packages_needed * package_price)::numeric, 2), 0),
        'costPerServing', coalesce(round((sum(packages_needed * package_price) / nullif(p_servings, 0))::numeric, 2), 0),
        'ingredients',    coalesce(jsonb_object_agg(ingredient_name, round((packages_needed * package_price)::numeric, 2)), '{}'::jsonb)
    ) into result from priced;

    return coalesce(result, jsonb_build_object(
        'recipeId', p_recipe_id, 'totalCost', 0, 'costPerServing', 0, 'ingredients', '{}'::jsonb
    ));
end;
$$;

create or replace function public.calculate_weekly_basket(
    p_user_id uuid,
    p_recipe_configs jsonb,
    p_store_id public.grocery_store,
    p_zip_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    result jsonb;
begin
    with
    user_stores as (
      select ups.grocery_store_id
      from public.user_preferred_stores ups
      where ups.profile_id = p_user_id
        and ups.store_enum = p_store_id
    ),
    recipe_demand as (
        select (d).* from (
            select public.get_recipe_demand(
                (conf->>'id')::uuid, (conf->>'servings')::integer
            ) as d
            from jsonb_array_elements(p_recipe_configs) as conf
        ) sub
    ),
    aggregated_demand as (
        select standardized_ingredient_id, ingredient_name, protein_tag,
               sum(amount_needed) as total_qty_needed
        from recipe_demand group by 1, 2, 3
    ),
    net_demand as (
        select ad.standardized_ingredient_id, ad.ingredient_name, ad.protein_tag,
               greatest(0, ad.total_qty_needed - coalesce(sum(p.quantity), 0)) as qty_to_buy
        from aggregated_demand ad
        left join public.pantry_items p on ad.standardized_ingredient_id = p.standardized_ingredient_id
            and p.user_id = p_user_id
        group by ad.standardized_ingredient_id, ad.ingredient_name, ad.protein_tag, ad.total_qty_needed
    ),
    ranked_prices as (
        select
            nd.ingredient_name,
            nd.protein_tag,
            nd.qty_to_buy,
            ir.price as package_price,
            pm.standardized_quantity as package_qty,
            ceil(nd.qty_to_buy / nullif(pm.standardized_quantity, 0)) as packages_needed,
            row_number() over (
                partition by nd.standardized_ingredient_id
                order by
                    case
                      when exists (select 1 from user_stores)
                       and ir.grocery_store_id in (select grocery_store_id from user_stores)
                      then 0
                      when exists (select 1 from user_stores) then 1
                      else 0
                    end,
                    (ceil(nd.qty_to_buy / nullif(pm.standardized_quantity, 0)) * ir.price) asc,
                    ir.price asc
            ) as row_rank
        from net_demand nd
        inner join public.product_mappings pm
            on pm.standardized_ingredient_id = nd.standardized_ingredient_id
           and pm.store_brand = p_store_id
        inner join public.ingredients_recent ir on ir.product_mapping_id = pm.id
        where nd.qty_to_buy > 0
          and ir.price is not null
          and ir.price > 0
          and pm.standardized_quantity is not null
          and pm.standardized_quantity > 0
    ),
    priced_items as (
        select *
        from ranked_prices
        where row_rank = 1
    )
    select jsonb_build_object(
        'totalCost', coalesce(round(sum(packages_needed * package_price)::numeric, 2), 0),
        'perIngredientCost', coalesce(jsonb_object_agg(ingredient_name, round((packages_needed * package_price)::numeric, 2)), '{}'::jsonb),
        'perIngredientUnused', coalesce(jsonb_object_agg(ingredient_name, round((packages_needed * package_qty - qty_to_buy)::numeric, 2)), '{}'::jsonb),
        'mainProteinCounts', (
            select coalesce(jsonb_object_agg(protein_tag, count), '{}'::jsonb)
            from (select protein_tag, count(*) as count from aggregated_demand group by protein_tag) psub
        )
    ) into result from priced_items;

    insert into public.shopping_calculation_logs (user_id, store_id, zip_code, total_cost, input_configs, output_results)
    values (p_user_id, p_store_id, p_zip_code, coalesce((result->>'totalCost')::numeric, 0), p_recipe_configs, result);

    return coalesce(result, '{"totalCost": 0, "mainProteinCounts": {}}'::jsonb);
end;
$$;

grant execute on function public.get_pricing(uuid) to authenticated, service_role;
grant execute on function public.get_pricing_gaps(uuid) to authenticated, service_role;
grant execute on function public.get_ingredient_price_details(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.get_replacement(uuid, public.grocery_store, text) to authenticated, service_role;
grant execute on function public.get_replacement(text, public.grocery_store) to authenticated, service_role;
grant execute on function public.calculate_recipe_cost(uuid, public.grocery_store, text, integer, uuid) to authenticated, service_role;
grant execute on function public.calculate_weekly_basket(uuid, jsonb, public.grocery_store, text) to authenticated, service_role;
