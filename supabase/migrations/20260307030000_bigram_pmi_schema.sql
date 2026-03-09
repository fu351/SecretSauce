-- Phase 2 of the IDF/PPMI cache plan.
--
-- Adds the canonical_bigram_pmi_cache table schema. No refresh function and no
-- consumer wiring yet — those are Phase 3 and 4, gated on confirming that
-- collocations are actually causing misscoring in fn_match_ingredient output.
--
-- Schema notes:
--   (token_a, token_b) — positional order from the canonical name. "hot sauce"
--     and "sauce hot" are distinct rows. Lookups in fn_word_weighted_similarity
--     will be point lookups on both columns.
--   doc_freq_a / doc_freq_b — denormalized from canonical_token_idf_cache at
--     refresh time. Query-time path needs no join back to the IDF cache.
--   joint_freq — number of distinct canonical names in which token_a appears
--     immediately followed by token_b.
--   document_count — corpus size snapshot at the time of the last refresh.
--   ppmi_score — Positive PMI: GREATEST(0, ln(P(A,B) / (P(A)*P(B))))).
--     Raw PMI is unbounded negative for non-co-occurring pairs; PPMI collapses
--     those to zero, the correct value for "not a collocation."
--   is_collocation — the only field fn_word_weighted_similarity reads at query
--     time. Decouples Phase 4 consumer wiring from Phase 3 threshold tuning.

CREATE TABLE public.canonical_bigram_pmi_cache (
  token_a        text        NOT NULL,
  token_b        text        NOT NULL,
  doc_freq_a     integer     NOT NULL,
  doc_freq_b     integer     NOT NULL,
  joint_freq     integer     NOT NULL,
  document_count integer     NOT NULL,
  ppmi_score     numeric     NOT NULL,
  is_collocation boolean     NOT NULL DEFAULT false,
  refreshed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_a, token_b)
);

CREATE INDEX idx_canonical_bigram_pmi_cache_is_collocation
  ON public.canonical_bigram_pmi_cache (is_collocation)
  WHERE is_collocation = true;

GRANT SELECT ON public.canonical_bigram_pmi_cache TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.canonical_bigram_pmi_cache TO service_role;

COMMENT ON TABLE public.canonical_bigram_pmi_cache IS
  'Stores Positive PMI scores for adjacent token pairs (bigrams) extracted from '
  'canonical ingredient names. Populated by fn_refresh_canonical_bigram_pmi_cache '
  '(Phase 3, deferred). Consumer wiring in fn_word_weighted_similarity is Phase 4.';

COMMENT ON COLUMN public.canonical_bigram_pmi_cache.is_collocation IS
  'True when ppmi_score >= 2.0 AND joint_freq >= 3. The only column read at '
  'query time by fn_word_weighted_similarity — thresholds are tunable in the '
  'refresh function without touching the consumer.';
