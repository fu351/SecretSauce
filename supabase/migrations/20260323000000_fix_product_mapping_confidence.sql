-- ============================================================
-- Fix product_mapping confidence inflation
-- ============================================================
--
-- Root cause 1: fn_backfill_resolved_ingredient trigger
--   Hardcoded ingredient_confidence = 1.0 on every queue resolution.
--   Fix: use NEW.fuzzy_score, which markResolved() already writes
--   with the TypeScript-computed calibrated confidence.
--
-- Root cause 2: fn_match_ingredient containment pass (Pass 2)
--   Used word_similarity(canonical, product) as confidence.
--   word_similarity measures only the canonical's trigram coverage —
--   short canonicals like "tuna" or "garlic" score 1.0 for any product
--   name that mentions them, regardless of how coarse the match is.
--   Fix: average with bidirectional similarity() so short canonicals
--   matching long product names are penalised.
--
-- Fix 3: fn_matching_confidence_distribution
--   generate_series(0.0, 0.9, 0.1) never produces a 1.0 bucket, so
--   the ~92% of mappings at exactly 1.0 were invisible. Added
--   explicit 1.0 band.
--
-- Backfill: updates existing rows that were inflated by the two bugs.
-- ============================================================


-- ── Fix 1: fn_backfill_resolved_ingredient trigger ────────────────────────

CREATE OR REPLACE FUNCTION public.fn_backfill_resolved_ingredient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN

        IF NEW.source = 'recipe' AND NEW.recipe_ingredient_id IS NOT NULL THEN
            IF NEW.resolved_ingredient_id IS NOT NULL THEN
                UPDATE public.recipe_ingredients
                SET standardized_ingredient_id = NEW.resolved_ingredient_id
                WHERE id = NEW.recipe_ingredient_id
                  AND standardized_ingredient_id IS NULL;
            END IF;

        ELSIF NEW.source = 'scraper' AND NEW.product_mapping_id IS NOT NULL THEN
            -- Ingredient resolution → product_mappings.
            -- Use the calibrated confidence the TypeScript worker wrote to
            -- fuzzy_score via markResolved(), floored at 0.75 so that even
            -- uncertain LLM confirmations stay meaningfully positive.
            -- Never hardcode 1.0 — exact-match confidence is set at ingestion
            -- by fn_bulk_insert_ingredient_history / fn_relink_product_mappings.
            IF NEW.resolved_ingredient_id IS NOT NULL THEN
                UPDATE public.product_mappings
                SET standardized_ingredient_id = NEW.resolved_ingredient_id,
                    ingredient_confidence       = GREATEST(COALESCE(NEW.fuzzy_score, 0.85), 0.75)
                WHERE id = NEW.product_mapping_id;
            END IF;

            -- Unit resolution → product_mappings.
            -- unit_confidence is owned by fn_backfill_resolved_confidence (AFTER #2).
            IF NEW.resolved_unit IS NOT NULL THEN
                UPDATE public.product_mappings
                SET standardized_unit     = NEW.resolved_unit,
                    standardized_quantity = COALESCE(NEW.resolved_quantity, standardized_quantity)
                WHERE id = NEW.product_mapping_id;
            END IF;
        END IF;

        NEW.resolved_at := now();
    END IF;

    RETURN NEW;
END;
$$;


-- ── Fix 2: fn_match_ingredient — containment pass confidence ─────────────

CREATE OR REPLACE FUNCTION public.fn_match_ingredient(
    p_product_name text,
    OUT matched_id      uuid,
    OUT confidence      numeric,
    OUT match_strategy  text
)
RETURNS record
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_cleaned        text;
    v_best_id        uuid;
    v_best_name      text;
    v_sim            numeric;
    v_containment    numeric;
    v_pos            int;
    v_tail_boundary  int;

    -- Thresholds
    c_containment    constant numeric := 0.85;
    c_high_sim       constant numeric := 0.50;
    c_mid_sim        constant numeric := 0.43;  -- trigram floor for b(x) tiebreak
    c_medium_sim     constant numeric := 0.25;
    c_low_sim        constant numeric := 0.15;
    c_tail_margin    constant int     := 5;
    c_tiebreak_n     constant int     := 10;    -- max rows b(x) ever scores
BEGIN
    v_cleaned := public.fn_clean_product_name(p_product_name);

    -- ── Pass 1: Exact match ────────────────────────────────────────
    SELECT id INTO v_best_id
    FROM public.standardized_ingredients
    WHERE canonical_name = v_cleaned
    LIMIT 1;

    IF FOUND THEN
        matched_id     := v_best_id;
        confidence     := 1.0;
        match_strategy := 'exact';
        RETURN;
    END IF;

    -- ── Pass 2: Containment ────────────────────────────────────────
    -- word_similarity(canonical, input) >= 0.85 means the canonical's
    -- trigrams are ~85% covered by the raw product name.
    -- <% operator uses the GiST index (fast pre-filter).
    -- Among survivors, rank by b(x) — called on at most a handful of rows.
    --
    -- Confidence = average of word_similarity (canonical coverage) and
    -- bidirectional similarity() so that short canonicals like "tuna" or
    -- "garlic" matching long product names are penalised instead of
    -- scoring 1.0 purely because all their trigrams fit inside the string.
    SELECT
        si.id,
        si.canonical_name,
        word_similarity(si.canonical_name, v_cleaned)
    INTO v_best_id, v_best_name, v_containment
    FROM public.standardized_ingredients si
    WHERE si.canonical_name <% v_cleaned
      AND word_similarity(si.canonical_name, v_cleaned) >= c_containment
    ORDER BY
        public.fn_word_weighted_similarity(v_cleaned, si.canonical_name) DESC
    LIMIT 1;

    IF FOUND THEN
        matched_id     := v_best_id;
        confidence     := ROUND(
            (v_containment + similarity(v_best_name, v_cleaned)) / 2.0,
            3
        );
        match_strategy := 'containment';
        RETURN;
    END IF;

    -- ── Pass 3: High trigram similarity >= 0.5 ────────────────────
    -- <-> operator uses GiST index — no full scan.
    SELECT id, canonical_name, similarity(canonical_name, v_cleaned)
    INTO v_best_id, v_best_name, v_sim
    FROM public.standardized_ingredients
    ORDER BY canonical_name <-> v_cleaned
    LIMIT 1;

    IF v_sim >= c_high_sim THEN
        matched_id     := v_best_id;
        confidence     := v_sim;
        match_strategy := 'high_fuzzy';
        RETURN;
    END IF;

    -- ── Pass 4: Mid trigram range — b(x) tiebreak on top-N ────────
    -- Fetch the top-N by trigram distance (index), then apply b(x)
    -- only to those rows. b(x) is never called on the full table.
    IF v_sim >= c_mid_sim THEN
        SELECT si.id, si.canonical_name,
               public.fn_word_weighted_similarity(v_cleaned, si.canonical_name)
        INTO v_best_id, v_best_name, v_sim
        FROM (
            SELECT id, canonical_name
            FROM public.standardized_ingredients
            ORDER BY canonical_name <-> v_cleaned
            LIMIT c_tiebreak_n
        ) si
        ORDER BY public.fn_word_weighted_similarity(v_cleaned, si.canonical_name) DESC
        LIMIT 1;

        matched_id     := v_best_id;
        confidence     := v_sim;
        match_strategy := 'high_word_fuzzy';
        RETURN;
    END IF;

    -- ── Pass 5: Tail / substring ───────────────────────────────────
    v_tail_boundary := length(v_cleaned) - c_tail_margin;

    -- Check if the top trigram match appears near the end of the input
    v_pos := position(v_best_name in v_cleaned);
    IF v_pos > 0 AND (v_pos + length(v_best_name) - 1) >= v_tail_boundary THEN
        matched_id     := v_best_id;
        confidence     := GREATEST(v_sim, 0.4);
        match_strategy := 'tail';
        RETURN;
    END IF;

    -- Scan for any canonical that appears as a substring near the tail
    SELECT si.id, si.canonical_name, similarity(si.canonical_name, v_cleaned)
    INTO v_best_id, v_best_name, v_sim
    FROM public.standardized_ingredients si
    WHERE position(si.canonical_name in v_cleaned) > 0
      AND (position(si.canonical_name in v_cleaned) + length(si.canonical_name) - 1)
          >= v_tail_boundary
    ORDER BY length(si.canonical_name) DESC
    LIMIT 1;

    IF FOUND THEN
        matched_id     := v_best_id;
        confidence     := GREATEST(v_sim, 0.4);
        match_strategy := 'tail';
        RETURN;
    END IF;

    -- ── Pass 6: Medium / low / none fallback ──────────────────────
    -- Re-fetch best trigram result (already have it unless pass 4 ran)
    SELECT id, canonical_name, similarity(canonical_name, v_cleaned)
    INTO v_best_id, v_best_name, v_sim
    FROM public.standardized_ingredients
    ORDER BY canonical_name <-> v_cleaned
    LIMIT 1;

    matched_id := v_best_id;
    confidence := COALESCE(v_sim, 0);

    IF v_sim >= c_medium_sim THEN
        match_strategy := 'medium_fuzzy';
    ELSIF v_sim >= c_low_sim THEN
        match_strategy := 'low_fuzzy';
    ELSE
        match_strategy := 'none';
    END IF;
END;
$$;


-- ── Fix 3: fn_matching_confidence_distribution — expose 1.0 band ─────────

CREATE OR REPLACE FUNCTION public.fn_matching_confidence_distribution(
    p_store     grocery_store       DEFAULT NULL,
    p_category  item_category_enum  DEFAULT NULL
)
RETURNS TABLE(
    conf_band        text,
    band_floor       numeric,
    ingredient_count bigint,
    ingredient_pct   numeric,
    unit_count       bigint,
    unit_pct         numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
WITH base AS (
    SELECT pm.ingredient_confidence, pm.unit_confidence
    FROM product_mappings pm
    LEFT JOIN standardized_ingredients si ON si.id = pm.standardized_ingredient_id
    WHERE (p_store    IS NULL OR pm.store_brand = p_store)
      AND (p_category IS NULL OR si.category   = p_category)
      AND pm.standardized_ingredient_id IS NOT NULL
),
total AS (SELECT COUNT(*) AS n FROM base),
-- Bands 0.0–0.9 in 0.1 steps, plus explicit 1.0 band
bands AS (
    SELECT generate_series(0.0, 0.9, 0.1)::numeric AS band_floor
    UNION ALL SELECT 1.0
)
SELECT
    CASE
        WHEN b.band_floor = 1.0 THEN '1.0 (exact)'
        ELSE ROUND(b.band_floor, 1)::text || '–' || ROUND(b.band_floor + 0.1, 1)::text
    END,
    ROUND(b.band_floor, 1),
    COUNT(base.ingredient_confidence) FILTER (
        WHERE CASE
            WHEN b.band_floor = 1.0 THEN base.ingredient_confidence = 1.0
            ELSE FLOOR(base.ingredient_confidence * 10) / 10 = b.band_floor
                 AND base.ingredient_confidence < 1.0
        END
    ),
    ROUND(100.0 * COUNT(base.ingredient_confidence) FILTER (
        WHERE CASE
            WHEN b.band_floor = 1.0 THEN base.ingredient_confidence = 1.0
            ELSE FLOOR(base.ingredient_confidence * 10) / 10 = b.band_floor
                 AND base.ingredient_confidence < 1.0
        END
    ) / NULLIF(t.n, 0), 1),
    COUNT(base.unit_confidence) FILTER (
        WHERE CASE
            WHEN b.band_floor = 1.0 THEN base.unit_confidence = 1.0
            ELSE FLOOR(base.unit_confidence * 10) / 10 = b.band_floor
                 AND base.unit_confidence < 1.0
        END
    ),
    ROUND(100.0 * COUNT(base.unit_confidence) FILTER (
        WHERE CASE
            WHEN b.band_floor = 1.0 THEN base.unit_confidence = 1.0
            ELSE FLOOR(base.unit_confidence * 10) / 10 = b.band_floor
                 AND base.unit_confidence < 1.0
        END
    ) / NULLIF(t.n, 0), 1)
FROM bands b
CROSS JOIN total t
LEFT JOIN base ON true
GROUP BY b.band_floor, t.n
ORDER BY b.band_floor DESC;
$func$;


-- ── Backfill: fix existing inflated rows ─────────────────────────────────

-- Part A: queue-resolved rows (3,841 affected)
-- These were resolved via the trigger, which hardcoded 1.0.
-- markResolved() already wrote the real calibrated confidence to fuzzy_score,
-- so we can recover it directly.
UPDATE public.product_mappings pm
SET ingredient_confidence = GREATEST(COALESCE(q.fuzzy_score, 0.85), 0.75)
FROM (
    SELECT DISTINCT ON (product_mapping_id)
        product_mapping_id,
        fuzzy_score
    FROM public.ingredient_match_queue
    WHERE status = 'resolved'
      AND product_mapping_id IS NOT NULL
    ORDER BY product_mapping_id, resolved_at DESC NULLS LAST
) q
WHERE pm.id = q.product_mapping_id
  AND pm.ingredient_confidence = 1.0
  AND pm.manual_override IS NOT true;


-- Part B: containment/direct-path rows with no queue evidence (5,040 affected)
-- ingredient_confidence = 1.0 but the cleaned product name ≠ canonical name
-- (i.e., not a true exact match). Recalculate using the fixed bidirectional score.
UPDATE public.product_mappings pm
SET ingredient_confidence = ROUND(
    (
        word_similarity(si.canonical_name, public.fn_clean_product_name(pm.raw_product_name))
        + similarity(si.canonical_name,    public.fn_clean_product_name(pm.raw_product_name))
    ) / 2.0,
    3
)
FROM public.standardized_ingredients si
WHERE si.id = pm.standardized_ingredient_id
  AND pm.ingredient_confidence = 1.0
  AND pm.manual_override IS NOT true
  AND public.fn_clean_product_name(pm.raw_product_name) <> si.canonical_name
  AND NOT EXISTS (
      SELECT 1 FROM public.ingredient_match_queue q
      WHERE q.product_mapping_id = pm.id
        AND q.status = 'resolved'
  );
