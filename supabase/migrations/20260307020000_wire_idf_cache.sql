-- Phase 1 of the IDF/PPMI cache plan.
--
-- (a) Fix fn_refresh_canonical_token_idf_cache: source is now a UNION of
--     standardized_ingredients (the authoritative promoted vocabulary that
--     fn_word_weighted_similarity scores against) and
--     canonical_creation_probation_events (proposed candidates whose tokens
--     appear in the live product stream). Tokens exclusive to probation were
--     previously scored as OOV, giving them artificially high IDF and
--     distorting containment/high_word_fuzzy tiebreaks.
--
-- (b) Rewrite fn_word_weighted_similarity to read IDF stats from
--     canonical_token_idf_cache instead of the inline word_df CTE that scans
--     and aggregates standardized_ingredients on every call. STABLE and
--     PARALLEL SAFE are preserved (cache is read-only from this function).
--
-- (c) Warm the cache at migration time so the rewritten function never hits
--     the empty-cache degraded path immediately after deployment.

-- ── 1a. Fix refresh source ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_refresh_canonical_token_idf_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document_count integer;
BEGIN
  -- Count distinct canonical names across both corpora. UNION deduplicates
  -- names that appear in both tables so each name counts once.
  SELECT COUNT(DISTINCT canonical_name)::integer
  INTO v_document_count
  FROM (
    SELECT canonical_name FROM standardized_ingredients
    UNION
    SELECT canonical_name FROM canonical_creation_probation_events
  ) t;

  DELETE FROM canonical_token_idf_cache;

  -- ts_stat tokenises each distinct canonical name with the 'simple' dictionary
  -- (lowercase, no stemming, no stop-word removal for ingredient terms).
  -- ndoc = number of distinct names containing that token.
  INSERT INTO canonical_token_idf_cache (token, doc_freq, document_count, refreshed_at)
  SELECT s.word, s.ndoc, v_document_count, now()
  FROM ts_stat(
    'SELECT to_tsvector(''simple'', canonical_name)
     FROM (
       SELECT DISTINCT canonical_name FROM standardized_ingredients
       UNION
       SELECT DISTINCT canonical_name FROM canonical_creation_probation_events
     ) t'
  ) AS s;
END;
$$;

COMMENT ON FUNCTION public.fn_refresh_canonical_token_idf_cache() IS
  'Recomputes token IDF vocabulary from standardized_ingredients UNION '
  'canonical_creation_probation_events and stores in canonical_token_idf_cache. '
  'UNION ensures accepted and probation-stage tokens share the same IDF space, '
  'preventing probation-only tokens from scoring as OOV in fn_word_weighted_similarity.';

-- ── 1b. Rewrite fn_word_weighted_similarity to read from cache ───────────────
--
-- Replaces corpus_size CTE (COUNT(*) on standardized_ingredients) and word_df
-- CTE (GROUP BY scan across standardized_ingredients) with a single point-
-- lookup per query token against canonical_token_idf_cache.
--
-- document_count is read once via MAX(document_count) — all cache rows share
-- the same value from the last refresh. If the cache is empty, document_count
-- resolves to 0, idf_i resolves to 0, and the function returns 0 (degraded
-- mode). The migration warms the cache below so this path is never hit.
--
-- STABLE and PARALLEL SAFE are preserved: the function only reads tables.

CREATE OR REPLACE FUNCTION public.fn_word_weighted_similarity(
  p_query     text,
  p_candidate text,
  p_cap_oov   boolean DEFAULT true
)
RETURNS numeric
LANGUAGE sql
STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH doc_count AS (
    -- All cache rows carry the same document_count; MAX is a safe aggregate
    -- whether the table has 1 row or 10 000. Returns 0 when cache is empty.
    SELECT COALESCE(MAX(document_count), 0)::numeric AS n
    FROM canonical_token_idf_cache
  ),
  query_words AS (
    SELECT unnest(string_to_array(lower(trim(p_query)), ' ')) AS word
  ),
  per_word AS (
    SELECT
      qw.word,
      -- p_cap_oov=true:  floor OOV doc_freq at 1 → IDF = n/2 instead of n.
      --   Prevents brand names / units / quantities from distorting tiebreaks.
      -- p_cap_oov=false: original behaviour; OOV words keep max IDF, which is
      --   desirable when an unknown token like "hoisin" should surface niche matches.
      (dc.n / (
        CASE WHEN p_cap_oov
          THEN GREATEST(COALESCE(c.doc_freq, 0), 1)
          ELSE             COALESCE(c.doc_freq, 0)
        END + 1
      ))                                                         AS idf_i,
      strict_word_similarity(qw.word, lower(p_candidate))::numeric AS a_i
    FROM query_words qw
    CROSS JOIN doc_count dc
    LEFT JOIN canonical_token_idf_cache c ON c.token = qw.word
    WHERE length(qw.word) > 0
  )
  SELECT
    CASE
      WHEN SUM(ln(idf_i + 1)) = 0 THEN 0
      ELSE SQRT(
        SUM(POWER(a_i, 2) * ln(idf_i + 1))
        / SUM(ln(idf_i + 1))
      )
    END
  FROM per_word;
$$;

COMMENT ON FUNCTION public.fn_word_weighted_similarity(text, text, boolean) IS
  'IDF-weighted RMS word similarity. Reads token frequencies from '
  'canonical_token_idf_cache (refreshed hourly) instead of scanning '
  'standardized_ingredients inline. STABLE, PARALLEL SAFE.';

-- ── 1c. Warm the cache ───────────────────────────────────────────────────────
-- Populate immediately so fn_word_weighted_similarity is never in degraded mode
-- after this migration is applied.

SELECT fn_refresh_canonical_token_idf_cache();
