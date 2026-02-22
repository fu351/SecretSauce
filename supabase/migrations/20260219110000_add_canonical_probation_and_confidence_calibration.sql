-- Canonical creation probation + confidence calibration telemetry
-- 1) Probation: require multiple distinct sources before creating a new canonical.
-- 2) Calibration: log accepted/rejected outcomes and expose confidence-bin aggregates.

CREATE TABLE IF NOT EXISTS public.canonical_creation_probation_events (
  canonical_name text NOT NULL,
  source_signature text NOT NULL,
  source text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  seen_count integer NOT NULL DEFAULT 1 CHECK (seen_count > 0),
  CONSTRAINT canonical_creation_probation_events_pkey
    PRIMARY KEY (canonical_name, source_signature)
);

CREATE INDEX IF NOT EXISTS idx_canonical_creation_probation_events_canonical
  ON public.canonical_creation_probation_events (canonical_name);

CREATE INDEX IF NOT EXISTS idx_canonical_creation_probation_events_last_seen
  ON public.canonical_creation_probation_events (last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.fn_track_canonical_creation_probation(
  p_canonical_name text,
  p_source_signature text,
  p_source text DEFAULT NULL,
  p_event_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  distinct_sources integer,
  total_events integer,
  first_seen_at timestamptz,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical text := lower(regexp_replace(coalesce(p_canonical_name, ''), '\s+', ' ', 'g'));
  v_signature text := trim(coalesce(p_source_signature, ''));
  v_source text := nullif(trim(coalesce(p_source, '')), '');
  v_event_at timestamptz := coalesce(p_event_at, now());
BEGIN
  v_canonical := trim(v_canonical);
  IF v_canonical = '' OR v_signature = '' THEN
    RETURN QUERY
    SELECT 0::integer, 0::integer, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  INSERT INTO public.canonical_creation_probation_events (
    canonical_name,
    source_signature,
    source,
    first_seen_at,
    last_seen_at,
    seen_count
  )
  VALUES (
    v_canonical,
    v_signature,
    v_source,
    v_event_at,
    v_event_at,
    1
  )
  ON CONFLICT (canonical_name, source_signature)
  DO UPDATE
  SET
    source = coalesce(v_source, public.canonical_creation_probation_events.source),
    last_seen_at = GREATEST(public.canonical_creation_probation_events.last_seen_at, v_event_at),
    seen_count = public.canonical_creation_probation_events.seen_count + 1;

  RETURN QUERY
  SELECT
    COUNT(*)::integer AS distinct_sources,
    COALESCE(SUM(seen_count), 0)::integer AS total_events,
    MIN(first_seen_at) AS first_seen_at,
    MAX(last_seen_at) AS last_seen_at
  FROM public.canonical_creation_probation_events
  WHERE canonical_name = v_canonical;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_track_canonical_creation_probation(
  text,
  text,
  text,
  timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_track_canonical_creation_probation(
  text,
  text,
  text,
  timestamptz
) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.ingredient_confidence_outcomes (
  id bigserial PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  raw_confidence numeric(6, 3) NOT NULL CHECK (raw_confidence >= 0 AND raw_confidence <= 1),
  calibrated_confidence numeric(6, 3) CHECK (
    calibrated_confidence IS NULL OR
    (calibrated_confidence >= 0 AND calibrated_confidence <= 1)
  ),
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  reason text NOT NULL DEFAULT 'none',
  category text,
  canonical_name text,
  token_count integer CHECK (token_count IS NULL OR token_count >= 0),
  is_new_canonical boolean NOT NULL DEFAULT false,
  source text,
  resolver text,
  context text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ingredient_confidence_outcomes_recorded_at
  ON public.ingredient_confidence_outcomes (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingredient_confidence_outcomes_outcome
  ON public.ingredient_confidence_outcomes (outcome);

CREATE INDEX IF NOT EXISTS idx_ingredient_confidence_outcomes_canonical
  ON public.ingredient_confidence_outcomes (canonical_name);

CREATE OR REPLACE FUNCTION public.fn_log_ingredient_confidence_outcome(
  p_raw_confidence numeric,
  p_calibrated_confidence numeric DEFAULT NULL,
  p_outcome text DEFAULT 'rejected',
  p_reason text DEFAULT 'none',
  p_category text DEFAULT NULL,
  p_canonical_name text DEFAULT NULL,
  p_token_count integer DEFAULT NULL,
  p_is_new_canonical boolean DEFAULT false,
  p_source text DEFAULT NULL,
  p_resolver text DEFAULT NULL,
  p_context text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_recorded_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw numeric := p_raw_confidence;
  v_cal numeric := p_calibrated_confidence;
  v_outcome text := lower(trim(coalesce(p_outcome, 'rejected')));
  v_reason text := lower(trim(coalesce(p_reason, 'none')));
  v_canonical text := nullif(lower(regexp_replace(coalesce(p_canonical_name, ''), '\s+', ' ', 'g')), '');
BEGIN
  IF v_raw IS NULL THEN
    RETURN;
  END IF;

  v_raw := LEAST(1, GREATEST(0, v_raw));
  IF v_cal IS NOT NULL THEN
    v_cal := LEAST(1, GREATEST(0, v_cal));
  END IF;

  IF v_outcome NOT IN ('accepted', 'rejected') THEN
    v_outcome := 'rejected';
  END IF;

  IF v_reason = '' THEN
    v_reason := 'none';
  END IF;

  INSERT INTO public.ingredient_confidence_outcomes (
    recorded_at,
    raw_confidence,
    calibrated_confidence,
    outcome,
    reason,
    category,
    canonical_name,
    token_count,
    is_new_canonical,
    source,
    resolver,
    context,
    metadata
  )
  VALUES (
    coalesce(p_recorded_at, now()),
    v_raw,
    v_cal,
    v_outcome,
    v_reason,
    nullif(trim(coalesce(p_category, '')), ''),
    v_canonical,
    p_token_count,
    coalesce(p_is_new_canonical, false),
    nullif(trim(coalesce(p_source, '')), ''),
    nullif(trim(coalesce(p_resolver, '')), ''),
    nullif(trim(coalesce(p_context, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_log_ingredient_confidence_outcome(
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  integer,
  boolean,
  text,
  text,
  text,
  jsonb,
  timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_log_ingredient_confidence_outcome(
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  integer,
  boolean,
  text,
  text,
  text,
  jsonb,
  timestamptz
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_get_ingredient_confidence_calibration(
  p_days_back integer DEFAULT 30,
  p_bin_size numeric DEFAULT 0.1,
  p_min_samples integer DEFAULT 10
)
RETURNS TABLE (
  bin_start numeric(4, 3),
  sample_count integer,
  accepted_count integer,
  acceptance_rate numeric(6, 4)
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounded AS (
  SELECT
    GREATEST(1, LEAST(COALESCE(p_days_back, 30), 365)) AS days_back,
    GREATEST(0.01::numeric, LEAST(COALESCE(p_bin_size, 0.1), 0.5::numeric)) AS bin_size,
    GREATEST(1, COALESCE(p_min_samples, 10)) AS min_samples
),
bucketed AS (
  SELECT
    (floor(o.raw_confidence / b.bin_size) * b.bin_size) AS bin_start,
    COUNT(*)::integer AS sample_count,
    COUNT(*) FILTER (WHERE o.outcome = 'accepted')::integer AS accepted_count
  FROM public.ingredient_confidence_outcomes o
  CROSS JOIN bounded b
  WHERE o.recorded_at >= now() - make_interval(days => b.days_back)
  GROUP BY 1
)
SELECT
  ROUND(bucketed.bin_start::numeric, 3)::numeric(4, 3) AS bin_start,
  bucketed.sample_count,
  bucketed.accepted_count,
  ROUND(
    CASE
      WHEN bucketed.sample_count = 0 THEN 0
      ELSE (bucketed.accepted_count::numeric / bucketed.sample_count::numeric)
    END,
    4
  )::numeric(6, 4) AS acceptance_rate
FROM bucketed
CROSS JOIN bounded b
WHERE bucketed.sample_count >= b.min_samples
ORDER BY bucketed.bin_start;
$$;

REVOKE ALL ON FUNCTION public.fn_get_ingredient_confidence_calibration(
  integer,
  numeric,
  integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_get_ingredient_confidence_calibration(
  integer,
  numeric,
  integer
) TO authenticated, service_role;

COMMENT ON TABLE public.canonical_creation_probation_events IS
  'Tracks distinct-source observations for candidate canonicals before creation.';

COMMENT ON FUNCTION public.fn_track_canonical_creation_probation(
  text,
  text,
  text,
  timestamptz
) IS
  'Upserts canonical/source observation and returns current distinct-source probation stats.';

COMMENT ON TABLE public.ingredient_confidence_outcomes IS
  'Accepted/rejected ingredient confidence outcomes used for runtime confidence calibration.';

COMMENT ON FUNCTION public.fn_log_ingredient_confidence_outcome(
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  integer,
  boolean,
  text,
  text,
  text,
  jsonb,
  timestamptz
) IS
  'Logs one ingredient confidence outcome event for calibration.';

COMMENT ON FUNCTION public.fn_get_ingredient_confidence_calibration(
  integer,
  numeric,
  integer
) IS
  'Returns confidence-bin acceptance metrics for runtime calibration.';
