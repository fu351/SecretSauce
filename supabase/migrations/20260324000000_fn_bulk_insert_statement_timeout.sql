-- Increase statement_timeout on fn_bulk_insert_ingredient_history.
-- The default service_role timeout (inherited from authenticator) is ~8s,
-- which is too tight for bulk inserts of 100+ rows via this RPC.
-- Setting 60s at the function level overrides the role-level default only
-- for this function, leaving all other queries unaffected.

DO $$
DECLARE
  v_args text;
BEGIN
  SELECT pg_catalog.pg_get_function_identity_arguments(oid)
  INTO v_args
  FROM pg_catalog.pg_proc
  WHERE proname = 'fn_bulk_insert_ingredient_history'
  LIMIT 1;

  IF v_args IS NULL THEN
    RAISE EXCEPTION 'Function fn_bulk_insert_ingredient_history not found';
  END IF;

  EXECUTE format(
    'ALTER FUNCTION public.fn_bulk_insert_ingredient_history(%s) SET statement_timeout = ''60s''',
    v_args
  );

  RAISE NOTICE 'Set statement_timeout=60s on fn_bulk_insert_ingredient_history(%)', v_args;
END;
$$;
