-- Phase 4 of the IDF/PPMI cache plan.
--
-- Rewrites fn_word_weighted_similarity to detect collocation pairs in the
-- query and score them as atomic units instead of independent tokens.
--
-- Motivation: tokens like "peanut" and "butter" each carry independent IDF
-- weights, causing "peanut butter" to partially match "butter chicken" (high
-- "butter" similarity) or "peanut oil" (high "peanut" similarity). Treating
-- the bigram as a unit via strict_word_similarity("peanut butter", candidate)
-- scores the compound against the candidate holistically.
--
-- Algorithm:
--   1. Tokenise p_query with positions (WITH ORDINALITY).
--   2. Check each adjacent pair against canonical_bigram_pmi_cache
--      WHERE is_collocation = true.
--   3. Greedy left-to-right: if position i is the suppressed token_b of a
--      preceding collocation, skip any collocation starting at i — prevents
--      double-counting when two collocations share a token (rare in practice
--      for ingredient names, but handled correctly).
--   4. Individual tokens not absorbed into a collocation score as before.
--   5. Each active collocation scores as one unit:
--        a_i  = strict_word_similarity(token_a || ' ' || token_b, candidate)
--        idf_i = GREATEST(idf_a, idf_b) — the more distinctive component drives
--                the weight; prevents the common token from diluting the score.
--   6. All scores (individual + compound) feed the same IDF-weighted RMS formula.
--
-- STABLE and PARALLEL SAFE are preserved — only reads canonical_token_idf_cache
-- and canonical_bigram_pmi_cache.

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
    SELECT COALESCE(MAX(document_count), 0)::numeric AS n
    FROM canonical_token_idf_cache
  ),
  -- Positional tokenisation — required to identify adjacent pairs.
  query_tokens AS (
    SELECT word, pos::integer
    FROM unnest(string_to_array(lower(trim(p_query)), ' '))
         WITH ORDINALITY AS t(word, pos)
    WHERE length(word) > 0
  ),
  -- Adjacent pairs that are known collocations.
  raw_collocation_pairs AS (
    SELECT
      t1.pos  AS pos_a,
      t2.pos  AS pos_b,
      t1.word AS token_a,
      t2.word AS token_b
    FROM query_tokens t1
    JOIN query_tokens t2
      ON t2.pos = t1.pos + 1
    JOIN canonical_bigram_pmi_cache bm
      ON bm.token_a = t1.word
     AND bm.token_b = t2.word
     AND bm.is_collocation = true
  ),
  -- Greedy left-to-right: discard a collocation whose pos_a is already
  -- suppressed as the pos_b of an earlier collocation.
  active_collocations AS (
    SELECT *
    FROM raw_collocation_pairs cp
    WHERE NOT EXISTS (
      SELECT 1 FROM raw_collocation_pairs prev
      WHERE prev.pos_b = cp.pos_a
    )
  ),
  suppressed_pos AS (
    SELECT pos_b AS pos FROM active_collocations
  ),
  -- Individual tokens not consumed by a collocation.
  individual_scores AS (
    SELECT
      (dc.n / (
        CASE WHEN p_cap_oov
          THEN GREATEST(COALESCE(c.doc_freq, 0), 1)
          ELSE             COALESCE(c.doc_freq, 0)
        END + 1
      ))                                                              AS idf_i,
      strict_word_similarity(qt.word, lower(p_candidate))::numeric   AS a_i
    FROM query_tokens qt
    CROSS JOIN doc_count dc
    LEFT JOIN canonical_token_idf_cache c ON c.token = qt.word
    -- Exclude: suppressed right-hand tokens and left-hand tokens of collocations.
    WHERE NOT EXISTS (SELECT 1 FROM suppressed_pos       sp WHERE sp.pos   = qt.pos)
      AND NOT EXISTS (SELECT 1 FROM active_collocations  ac WHERE ac.pos_a = qt.pos)
  ),
  -- Collocation pairs scored as single compound units.
  collocation_scores AS (
    SELECT
      -- Use the higher IDF so the more distinctive component drives the weight.
      -- (e.g., for "peanut butter": idf_peanut > idf_butter → weight = idf_peanut)
      GREATEST(
        dc.n / (CASE WHEN p_cap_oov THEN GREATEST(COALESCE(ca.doc_freq, 0), 1) ELSE COALESCE(ca.doc_freq, 0) END + 1),
        dc.n / (CASE WHEN p_cap_oov THEN GREATEST(COALESCE(cb.doc_freq, 0), 1) ELSE COALESCE(cb.doc_freq, 0) END + 1)
      )                                                                             AS idf_i,
      strict_word_similarity(
        ac.token_a || ' ' || ac.token_b,
        lower(p_candidate)
      )::numeric                                                                    AS a_i
    FROM active_collocations ac
    CROSS JOIN doc_count dc
    LEFT JOIN canonical_token_idf_cache ca ON ca.token = ac.token_a
    LEFT JOIN canonical_token_idf_cache cb ON cb.token = ac.token_b
  ),
  all_scores AS (
    SELECT idf_i, a_i FROM individual_scores
    UNION ALL
    SELECT idf_i, a_i FROM collocation_scores
  )
  SELECT
    CASE
      WHEN SUM(ln(idf_i + 1)) = 0 THEN 0
      ELSE SQRT(
        SUM(POWER(a_i, 2) * ln(idf_i + 1))
        / SUM(ln(idf_i + 1))
      )
    END
  FROM all_scores;
$$;

COMMENT ON FUNCTION public.fn_word_weighted_similarity(text, text, boolean) IS
  'IDF-weighted RMS word similarity with collocation-aware scoring. Adjacent '
  'token pairs flagged in canonical_bigram_pmi_cache (is_collocation=true) are '
  'scored as atomic units via strict_word_similarity on the compound bigram, '
  'weighted by the higher of the two component IDF values. Individual tokens '
  'not part of a collocation score as before. STABLE, PARALLEL SAFE.';
