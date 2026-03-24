-- Phase 4: Vector-based double-check candidate discovery
--
-- fn_find_vector_double_check_candidates returns canonical pairs whose
-- embeddings are within p_threshold cosine similarity but have no existing
-- row in canonical_double_check_daily_stats (checked in either direction).
-- The caller (vector-double-check-worker) logs each pair via
-- fn_log_canonical_double_check_daily so they surface in the review pipeline.

CREATE OR REPLACE FUNCTION public.fn_find_vector_double_check_candidates(
  p_threshold  numeric  DEFAULT 0.88,
  p_limit      integer  DEFAULT 100,
  p_model      text     DEFAULT 'nomic-embed-text'
)
RETURNS TABLE (
  source_canonical  text,
  target_canonical  text,
  source_category   text,
  target_category   text,
  similarity        numeric
)
LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path = public
SET statement_timeout = '300000'
AS $$
  SELECT
    a.canonical_name                                    AS source_canonical,
    b.canonical_name                                    AS target_canonical,
    a.category                                          AS source_category,
    b.category                                          AS target_category,
    (1 - (ae.embedding <=> be.embedding))::numeric      AS similarity
  FROM ingredient_embeddings ae
  JOIN ingredient_embeddings be
    ON  ae.standardized_ingredient_id < be.standardized_ingredient_id
    AND ae.model = p_model
    AND be.model = p_model
  JOIN standardized_ingredients a ON a.id = ae.standardized_ingredient_id
  JOIN standardized_ingredients b ON b.id = be.standardized_ingredient_id
  WHERE (1 - (ae.embedding <=> be.embedding)) >= p_threshold
    AND NOT EXISTS (
      SELECT 1
      FROM canonical_double_check_daily_stats s
      WHERE (s.source_canonical = a.canonical_name AND s.target_canonical = b.canonical_name)
         OR (s.source_canonical = b.canonical_name AND s.target_canonical = a.canonical_name)
    )
  ORDER BY similarity DESC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;
