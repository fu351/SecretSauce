-- Fix fn_refresh_canonical_token_idf_cache: add WHERE TRUE to DELETE so
-- PostgREST does not reject it as an unbounded delete when called via RPC.

CREATE OR REPLACE FUNCTION public.fn_refresh_canonical_token_idf_cache()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_document_count integer;
BEGIN
  SELECT COUNT(DISTINCT canonical_name)::integer
  INTO v_document_count
  FROM (
    SELECT canonical_name FROM standardized_ingredients
    UNION
    SELECT canonical_name FROM canonical_creation_probation_events
  ) t;

  DELETE FROM canonical_token_idf_cache WHERE TRUE;

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
$function$;
