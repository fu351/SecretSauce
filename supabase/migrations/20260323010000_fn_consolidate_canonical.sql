-- Canonical consolidation worker support
--
-- fn_consolidate_canonical: atomically merges a loser canonical into a survivor
-- across all downstream tables, then deletes the loser.
-- canonical_consolidation_log: audit trail for every merge performed.

-- Audit table
CREATE TABLE IF NOT EXISTS canonical_consolidation_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  survivor_canonical text       NOT NULL,
  loser_canonical   text        NOT NULL,
  direction         text        NOT NULL,
  similarity        numeric,
  dry_run           boolean     NOT NULL DEFAULT false,
  rows_updated      jsonb       NOT NULL DEFAULT '{}',
  worker_name       text
);

-- Atomic merge function
CREATE OR REPLACE FUNCTION public.fn_consolidate_canonical(
  p_loser_canonical    text,
  p_survivor_canonical text,
  p_dry_run            boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loser_id    uuid;
  v_survivor_id uuid;
  v_counts      jsonb := '{}';
  v_n           integer;
BEGIN
  SELECT id INTO v_survivor_id FROM standardized_ingredients WHERE canonical_name = p_survivor_canonical;
  SELECT id INTO v_loser_id    FROM standardized_ingredients WHERE canonical_name = p_loser_canonical;

  IF v_survivor_id IS NULL THEN
    RAISE EXCEPTION 'Survivor canonical not found: %', p_survivor_canonical;
  END IF;
  IF v_loser_id IS NULL THEN
    RAISE EXCEPTION 'Loser canonical not found: %', p_loser_canonical;
  END IF;
  IF v_survivor_id = v_loser_id THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'same_id');
  END IF;

  IF p_dry_run THEN
    SELECT COUNT(*) INTO v_n FROM recipe_ingredients       WHERE standardized_ingredient_id = v_loser_id;
    v_counts := v_counts || jsonb_build_object('recipe_ingredients', v_n);
    SELECT COUNT(*) INTO v_n FROM ingredient_match_queue   WHERE resolved_ingredient_id = v_loser_id;
    v_counts := v_counts || jsonb_build_object('ingredient_match_queue', v_n);
    SELECT COUNT(*) INTO v_n FROM pantry_items             WHERE standardized_ingredient_id = v_loser_id;
    v_counts := v_counts || jsonb_build_object('pantry_items', v_n);
    SELECT COUNT(*) INTO v_n FROM product_mappings         WHERE standardized_ingredient_id = v_loser_id;
    v_counts := v_counts || jsonb_build_object('product_mappings', v_n);
    SELECT COUNT(*) INTO v_n FROM purchases                WHERE standardized_ingredient_id = v_loser_id;
    v_counts := v_counts || jsonb_build_object('purchases', v_n);
    SELECT COUNT(*) INTO v_n FROM manual_shopping_history  WHERE standardized_ingredient_id = v_loser_id;
    v_counts := v_counts || jsonb_build_object('manual_shopping_history', v_n);
    SELECT COUNT(*) INTO v_n FROM shopping_list_items      WHERE ingredient_id = v_loser_id;
    v_counts := v_counts || jsonb_build_object('shopping_list_items', v_n);
    SELECT COUNT(*) INTO v_n FROM waste_analytics          WHERE standardized_ingredient_id = v_loser_id;
    v_counts := v_counts || jsonb_build_object('waste_analytics', v_n);
    SELECT COUNT(*) INTO v_n FROM ingredient_embeddings    WHERE standardized_ingredient_id = v_loser_id;
    v_counts := v_counts || jsonb_build_object('ingredient_embeddings', v_n);
    SELECT COUNT(*) INTO v_n FROM embedding_queue          WHERE source_type = 'ingredient' AND source_id = v_loser_id;
    v_counts := v_counts || jsonb_build_object('embedding_queue', v_n);
    RETURN jsonb_build_object('dry_run', true, 'rows_updated', v_counts);
  END IF;

  UPDATE recipe_ingredients      SET standardized_ingredient_id = v_survivor_id WHERE standardized_ingredient_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('recipe_ingredients', v_n);

  UPDATE ingredient_match_queue  SET resolved_ingredient_id = v_survivor_id WHERE resolved_ingredient_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ingredient_match_queue', v_n);

  UPDATE pantry_items            SET standardized_ingredient_id = v_survivor_id WHERE standardized_ingredient_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('pantry_items', v_n);

  UPDATE product_mappings        SET standardized_ingredient_id = v_survivor_id WHERE standardized_ingredient_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('product_mappings', v_n);

  UPDATE purchases               SET standardized_ingredient_id = v_survivor_id WHERE standardized_ingredient_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('purchases', v_n);

  UPDATE manual_shopping_history SET standardized_ingredient_id = v_survivor_id WHERE standardized_ingredient_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('manual_shopping_history', v_n);

  UPDATE shopping_list_items     SET ingredient_id = v_survivor_id WHERE ingredient_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('shopping_list_items', v_n);

  UPDATE waste_analytics         SET standardized_ingredient_id = v_survivor_id WHERE standardized_ingredient_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('waste_analytics', v_n);

  -- embedding_queue: unique on (source_type, source_id) — delete loser if survivor already has a row
  IF EXISTS (SELECT 1 FROM embedding_queue WHERE source_type = 'ingredient' AND source_id = v_survivor_id) THEN
    DELETE FROM embedding_queue WHERE source_type = 'ingredient' AND source_id = v_loser_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    UPDATE embedding_queue SET source_id = v_survivor_id WHERE source_type = 'ingredient' AND source_id = v_loser_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  v_counts := v_counts || jsonb_build_object('embedding_queue', v_n);

  -- ingredient_embeddings: unique on (standardized_ingredient_id, model)
  IF EXISTS (SELECT 1 FROM ingredient_embeddings WHERE standardized_ingredient_id = v_survivor_id) THEN
    DELETE FROM ingredient_embeddings WHERE standardized_ingredient_id = v_loser_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    UPDATE ingredient_embeddings SET standardized_ingredient_id = v_survivor_id WHERE standardized_ingredient_id = v_loser_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  v_counts := v_counts || jsonb_build_object('ingredient_embeddings', v_n);

  -- canonical_double_check_daily_stats: delete all loser rows rather than
  -- renaming them, to avoid primary-key conflicts when the survivor name already
  -- exists in the same (event_date, decision, reason, direction) bucket.
  -- The caller logs a fresh "remapped" event after this function returns.
  DELETE FROM canonical_double_check_daily_stats
    WHERE source_canonical = p_loser_canonical OR target_canonical = p_loser_canonical;

  DELETE FROM canonical_creation_probation_events WHERE canonical_name = p_loser_canonical;
  DELETE FROM standardized_ingredients WHERE id = v_loser_id;

  PERFORM fn_refresh_canonical_token_idf_cache();

  RETURN jsonb_build_object('dry_run', false, 'rows_updated', v_counts);
END;
$function$;
