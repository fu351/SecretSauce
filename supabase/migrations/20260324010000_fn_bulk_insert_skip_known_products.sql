-- Optimise fn_bulk_insert_ingredient_history by checking product_mappings first.
--
-- Before this change the function called fn_match_ingredient (up to 6 trigram
-- queries against standardized_ingredients) for every row, even when the product
-- was already in product_mappings with a resolved ingredient and unit. Those
-- results were then immediately overwritten by the cached mapping values.
--
-- New order of operations:
--   1. Look up product_mappings first.
--   2a. Known product, known ingredient & unit → skip all matching, fast path.
--   2b. Known product, known ingredient only → skip fn_match_ingredient, still
--       parse unit if it was previously unresolved.
--   2c. New product or unresolved ingredient → run full matching pipeline.
--   3. manual_override always clears review flags regardless of path taken.

CREATE OR REPLACE FUNCTION public.fn_bulk_insert_ingredient_history(p_items jsonb)
RETURNS TABLE(status text, product_name text, inserted_id uuid, error_msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $function$
DECLARE
    item                JSONB;
    v_product_name      text;
    v_product_id        text;
    v_store             public.grocery_store;
    v_store_id          uuid;
    v_zip               text;
    v_price             numeric;
    v_image_url         text;

    v_match_id          uuid;
    v_match_conf        numeric;
    v_match_strategy    text;
    v_needs_ingredient_review boolean;

    v_parsed            RECORD;
    v_unit_result       RECORD;
    v_standard_unit     public.unit_label;
    v_unit_confidence   numeric(4,3) := 0;
    v_needs_unit_review boolean;
    v_extracted_qty     numeric;

    v_mapping_id        uuid;
    v_existing_mapping  RECORD;

    v_unit_price        numeric;
    v_history_id        uuid;
    v_queue_raw_unit    text;

    c_verified_floor    constant numeric := 0.4;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        BEGIN
            v_product_name := item->>'productName';
            v_product_id   := item->>'productId';
            v_store        := (item->>'store')::public.grocery_store;
            v_store_id     := (item->>'store_id')::uuid;
            v_zip          := COALESCE(item->>'zipCode', '');
            v_price        := (item->>'price')::numeric;
            v_image_url    := item->>'imageUrl';

            IF v_price IS NULL OR v_price <= 0 OR v_price > 100 THEN
                status := 'SKIPPED'; product_name := v_product_name;
                inserted_id := NULL; error_msg := 'Price out of range: ' || COALESCE(v_price::text, 'NULL');
                RETURN NEXT; CONTINUE;
            END IF;

            -- STEP 1: CHECK EXISTING PRODUCT MAPPING (moved first to short-circuit matching)
            SELECT id, standardized_ingredient_id, standardized_unit, standardized_quantity,
                   unit_confidence, manual_override
            INTO v_existing_mapping
            FROM public.product_mappings
            WHERE external_product_id = v_product_id AND store_brand = v_store
            LIMIT 1;

            -- STEP 2: INGREDIENT MATCHING — skip if already resolved
            v_needs_ingredient_review := false;

            IF v_existing_mapping.id IS NOT NULL
               AND v_existing_mapping.standardized_ingredient_id IS NOT NULL THEN
                -- Fast path: product already has a matched ingredient
                v_match_id       := v_existing_mapping.standardized_ingredient_id;
                v_match_conf     := 1.0;
                v_match_strategy := 'cached';
            ELSE
                -- Full path: run fuzzy matching pipeline
                SELECT m.matched_id, m.confidence, m.match_strategy
                INTO v_match_id, v_match_conf, v_match_strategy
                FROM public.fn_match_ingredient(v_product_name) m;

                IF v_match_id IS NULL OR v_match_strategy IN ('low_fuzzy', 'none') OR v_match_conf < c_verified_floor THEN
                    v_needs_ingredient_review := true;
                END IF;
            END IF;

            -- STEP 3: UNIT PARSING — skip if mapping already has a resolved unit
            IF v_existing_mapping.id IS NOT NULL
               AND v_existing_mapping.standardized_unit IS NOT NULL
               AND v_existing_mapping.standardized_unit != 'unit'::public.unit_label THEN
                -- Fast path: use cached unit data
                v_standard_unit   := v_existing_mapping.standardized_unit;
                v_extracted_qty   := COALESCE(v_existing_mapping.standardized_quantity, 0);
                v_unit_confidence := COALESCE(v_existing_mapping.unit_confidence, 0);
                v_needs_unit_review := false;
                v_queue_raw_unit  := COALESCE(
                    NULLIF(trim(item->>'unit'), ''),
                    NULLIF(trim(COALESCE(item->>'rawUnit', '')), '')
                );
            ELSE
                -- Full path: parse unit from product text
                SELECT * INTO v_parsed
                FROM public.fn_parse_unit_from_text(
                    COALESCE(NULLIF(trim(item->>'unit'), ''), ''),
                    NULLIF(trim(COALESCE(item->>'rawUnit', '')), ''),
                    v_product_name
                );
                v_extracted_qty := v_parsed.extracted_qty;

                -- STEP 4: UNIT MAPPING
                SELECT * INTO v_unit_result
                FROM public.fn_standardize_unit_lookup(
                    v_parsed.search_term,
                    public.fn_clean_product_name(v_product_name)
                );
                v_standard_unit   := COALESCE(v_unit_result.standard_unit, 'unit'::public.unit_label);
                v_unit_confidence := COALESCE(v_unit_result.unit_confidence, 0);
                v_needs_unit_review := v_unit_result.needs_unit_review;

                -- Apply any cached unit overrides from existing mapping
                IF v_existing_mapping.id IS NOT NULL THEN
                    v_standard_unit   := COALESCE(v_existing_mapping.standardized_unit, v_standard_unit);
                    v_extracted_qty   := COALESCE(v_existing_mapping.standardized_quantity, v_extracted_qty);
                    v_unit_confidence := COALESCE(v_existing_mapping.unit_confidence, v_unit_confidence);
                    v_needs_unit_review := v_needs_unit_review
                        AND (v_existing_mapping.standardized_unit IS NULL
                             OR v_existing_mapping.standardized_unit = 'unit');
                END IF;

                v_queue_raw_unit := COALESCE(
                    NULLIF(v_parsed.search_term, ''),
                    NULLIF(trim(item->>'unit'), ''),
                    NULLIF(trim(COALESCE(item->>'rawUnit', '')), '')
                );
            END IF;

            -- manual_override always wins: clear all review flags
            IF v_existing_mapping.manual_override = true THEN
                v_needs_ingredient_review := false;
                v_needs_unit_review := false;
            END IF;

            -- STEP 5: CREATE OR UPDATE PRODUCT MAPPING
            IF v_existing_mapping.id IS NOT NULL THEN
                v_mapping_id := v_existing_mapping.id;
                UPDATE public.product_mappings
                SET last_seen_at = now(), exchange_count = exchange_count + 1
                WHERE id = v_mapping_id;
            ELSE
                INSERT INTO public.product_mappings (
                    external_product_id, store_brand, raw_product_name,
                    standardized_ingredient_id, ingredient_confidence,
                    standardized_unit, standardized_quantity, unit_confidence, image_url
                ) VALUES (
                    v_product_id, v_store, v_product_name,
                    v_match_id, COALESCE(v_match_conf, 0),
                    v_standard_unit, v_extracted_qty, v_unit_confidence, v_image_url
                )
                ON CONFLICT (external_product_id, store_brand) DO UPDATE
                  SET last_seen_at = now(), exchange_count = product_mappings.exchange_count + 1
                RETURNING id INTO v_mapping_id;
            END IF;

            -- STEP 6: CALCULATE UNIT PRICE
            v_unit_price := public.fn_calculate_unit_price(v_price, v_extracted_qty, v_standard_unit);

            -- STEP 7: QUEUE FOR LLM REVIEW
            PERFORM public.fn_enqueue_for_review(
                p_product_mapping_id      := v_mapping_id,
                p_raw_product_name        := v_product_name,
                p_cleaned_name            := public.fn_clean_product_name(v_product_name),
                p_match_id                := v_match_id,
                p_match_conf              := COALESCE(v_match_conf, 0),
                p_source                  := 'scraper',
                p_needs_ingredient_review := v_needs_ingredient_review,
                p_needs_unit_review       := v_needs_unit_review,
                p_raw_unit                := v_queue_raw_unit
            );

            -- STEP 8: INSERT INTO INGREDIENTS_HISTORY
            INSERT INTO public.ingredients_history (product_mapping_id, grocery_store_id, price)
            VALUES (v_mapping_id, v_store_id, v_price)
            RETURNING id INTO v_history_id;

            -- STEP 9: UPSERT INTO INGREDIENTS_RECENT
            IF v_mapping_id IS NOT NULL AND v_match_id IS NOT NULL AND v_extracted_qty > 0 AND v_unit_price IS NOT NULL THEN
                INSERT INTO public.ingredients_recent (id, product_mapping_id, grocery_store_id, price, unit_price)
                VALUES (gen_random_uuid(), v_mapping_id, v_store_id, v_price, v_unit_price)
                ON CONFLICT (product_mapping_id)
                DO UPDATE SET price = EXCLUDED.price, unit_price = EXCLUDED.unit_price,
                    grocery_store_id = EXCLUDED.grocery_store_id, updated_at = now();
            END IF;

            status := 'SUCCESS'; product_name := v_product_name; inserted_id := v_history_id; error_msg := NULL;
            RETURN NEXT;

        EXCEPTION WHEN OTHERS THEN
            INSERT INTO public.failed_scrapes_log (raw_payload, error_code, error_detail, created_at)
            VALUES (item, SQLSTATE, SQLERRM, NOW());
            status := 'FAILED'; product_name := v_product_name; inserted_id := NULL; error_msg := SQLERRM;
            RETURN NEXT;
        END;
    END LOOP;
END;
$function$;
