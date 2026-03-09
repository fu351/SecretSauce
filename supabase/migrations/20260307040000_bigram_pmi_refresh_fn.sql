-- Phase 3 of the IDF/PPMI cache plan.
--
-- Adds fn_refresh_canonical_bigram_pmi_cache(), which computes Positive PMI
-- for adjacent token pairs (bigrams) across the canonical ingredient vocabulary
-- and populates canonical_bigram_pmi_cache.
--
-- Gate condition confirmed: the vocabulary contains ~35 genuine collocations
-- (ppmi >= 2.0, joint_freq >= 3) including "peanut butter", "ice cream",
-- "sweet potato", "brown sugar", "green tea", "oat milk", "almond milk", and
-- "dark chocolate". These currently score as independent tokens, causing IDF
-- contributions from each token to be double-counted — e.g., "sweet" in
-- "sweet potato" scores against "sweet corn" and "sweet onion" independently.
--
-- Design notes:
--   - Corpus is the same UNION as fn_refresh_canonical_token_idf_cache.
--   - Refresh asserts the IDF cache is fresh (< 1 hour) before running;
--     if stale, it refreshes it first.
--   - "and" is excluded from bigram position A and B — it is a conjunction
--     in names like "macaroni and cheese", not a meaningful ingredient token.
--   - Min-count gates: doc_freq_a >= 5, doc_freq_b >= 5, joint_freq >= 3.
--     Prevents combinatorial explosion and keeps only statistically reliable pairs.
--   - is_collocation = ppmi_score >= 2.0 AND joint_freq >= 3. Threshold is
--     intentionally named in a constant so it can be tuned without schema change.
--   - Full DELETE + re-INSERT. The corpus is small; incremental complexity
--     is not justified.
--   - Refresh cadence: daily, called after fn_refresh_canonical_token_idf_cache.

CREATE OR REPLACE FUNCTION public.fn_refresh_canonical_bigram_pmi_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collocation_ppmi_threshold  numeric  := 2.0;
  v_collocation_joint_freq_min  integer  := 3;
  v_min_token_doc_freq          integer  := 5;
  v_inserted                    integer;
BEGIN
  -- Ensure IDF cache is fresh. If stale, refresh it now — bigram PPMI
  -- depends on the individual token doc_freq values.
  IF NOT EXISTS (
    SELECT 1 FROM canonical_token_idf_cache
    WHERE refreshed_at > NOW() - INTERVAL '1 hour'
    LIMIT 1
  ) THEN
    PERFORM fn_refresh_canonical_token_idf_cache();
  END IF;

  DELETE FROM canonical_bigram_pmi_cache;

  WITH corpus AS (
    SELECT DISTINCT canonical_name FROM standardized_ingredients
    UNION
    SELECT DISTINCT canonical_name FROM canonical_creation_probation_events
  ),
  document_count AS (
    SELECT COUNT(*)::integer AS n FROM corpus
  ),
  -- Generate adjacent token pairs (positional bigrams). Exclude "and" from
  -- either position — it is a conjunction, not an ingredient token.
  bigrams AS (
    SELECT
      tokens[i]     AS token_a,
      tokens[i + 1] AS token_b
    FROM (
      SELECT string_to_array(canonical_name, ' ') AS tokens
      FROM corpus
      WHERE canonical_name LIKE '% %'
    ) t,
    generate_series(1, array_length(tokens, 1) - 1) AS i
    WHERE tokens[i]     IS NOT NULL
      AND tokens[i + 1] IS NOT NULL
      AND tokens[i]     <> 'and'
      AND tokens[i + 1] <> 'and'
  ),
  joint_freq AS (
    SELECT token_a, token_b, COUNT(*)::integer AS joint_freq
    FROM bigrams
    GROUP BY token_a, token_b
  ),
  ppmi AS (
    SELECT
      j.token_a,
      j.token_b,
      j.joint_freq,
      a.doc_freq                              AS doc_freq_a,
      b.doc_freq                              AS doc_freq_b,
      dc.n                                    AS document_count,
      GREATEST(0,
        LN(
          (j.joint_freq::numeric / dc.n) /
          ((a.doc_freq::numeric / dc.n) * (b.doc_freq::numeric / dc.n))
        )
      )::numeric                              AS ppmi_score
    FROM joint_freq j
    JOIN canonical_token_idf_cache a ON a.token = j.token_a
    JOIN canonical_token_idf_cache b ON b.token = j.token_b
    CROSS JOIN document_count dc
    WHERE
      a.doc_freq >= v_min_token_doc_freq
      AND b.doc_freq >= v_min_token_doc_freq
      AND j.joint_freq >= v_collocation_joint_freq_min
  )
  INSERT INTO canonical_bigram_pmi_cache
    (token_a, token_b, doc_freq_a, doc_freq_b, joint_freq, document_count, ppmi_score, is_collocation, refreshed_at)
  SELECT
    token_a,
    token_b,
    doc_freq_a,
    doc_freq_b,
    joint_freq,
    document_count,
    ROUND(ppmi_score, 3),
    ppmi_score >= v_collocation_ppmi_threshold
      AND joint_freq >= v_collocation_joint_freq_min AS is_collocation,
    now()
  FROM ppmi;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RAISE NOTICE '[fn_refresh_canonical_bigram_pmi_cache] inserted=%, collocations=%',
    v_inserted,
    (SELECT COUNT(*) FROM canonical_bigram_pmi_cache WHERE is_collocation = true);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_refresh_canonical_bigram_pmi_cache() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_refresh_canonical_bigram_pmi_cache() TO service_role;

COMMENT ON FUNCTION public.fn_refresh_canonical_bigram_pmi_cache() IS
  'Recomputes Positive PMI for adjacent token pairs in the canonical ingredient '
  'vocabulary and populates canonical_bigram_pmi_cache. Requires IDF cache to be '
  'fresh (refreshes it if stale). Collocations (is_collocation=true) are pairs '
  'with ppmi_score >= 2.0 AND joint_freq >= 3. Phase 4 will wire is_collocation '
  'into fn_word_weighted_similarity.';

-- Warm the cache immediately.
SELECT fn_refresh_canonical_bigram_pmi_cache();
