-- Hardening for pre-existing advisor findings on the live database.
-- This migration is conditional because the historical drifted migrations were pruned.

do $$
declare
  fn_signature text;
  fn regprocedure;
  public_only_functions text[] := array[
    'public.execute_sql(text)',
    'public.fn_truncate_app_tables()',
    'public.fn_reset_ingredient_ecosystem()',
    'public.reset_queue(text,text)',
    'public.dev_create_experiment(text,text,text,public.subscription_tier[],boolean,numeric,uuid)',
    'public.cleanup_unverified_users()',
    'public.cleanup_old_store_locations()',
    'public.calculate_unit_weight_estimates()',
    'public.scheduled_update_unit_estimates()',
    'public.snapshot_ingredient_queue_health()',
    'public.claim_embedding_queue(integer,integer,text)',
    'public.claim_ingredient_match_queue(integer,text,integer,text,text)',
    'public.requeue_expired_embedding_queue(integer,text)',
    'public.requeue_expired_ingredient_match_queue(integer,text)'
  ];
  backup_functions text[] := array[
    'public.fn_restore_from_backup()',
    'public.fn_backup_ingredient_ecosystem(text)',
    'public.fn_restore_ingredient_ecosystem(text)',
    'public.fn_ingredient_ecosystem(text,text)',
    'public.fn_sync_backup_tables()'
  ];
begin
  foreach fn_signature in array public_only_functions loop
    fn := to_regprocedure(fn_signature);
    if fn is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
      execute format('alter function %s set search_path = public, pg_temp', fn);
    end if;
  end loop;

  foreach fn_signature in array backup_functions loop
    fn := to_regprocedure(fn_signature);
    if fn is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
      execute format('alter function %s set search_path = public, backups, pg_temp', fn);
    end if;
  end loop;
end $$;

alter view if exists public.user_meal_type_statistics set (security_invoker = true);
alter view if exists public.v_canonical_double_check_drift_daily set (security_invoker = true);
alter view if exists public.v_unit_conversion_coverage set (security_invoker = true);
alter view if exists public.vw_product_ingredient_summary set (security_invoker = true);

revoke all on table public.user_meal_type_statistics from anon, authenticated;
revoke all on table public.v_canonical_double_check_drift_daily from anon, authenticated;
revoke all on table public.v_unit_conversion_coverage from anon, authenticated;
revoke all on table public.vw_product_ingredient_summary from anon, authenticated;

grant select on table public.user_meal_type_statistics to anon, authenticated;
grant select on table public.v_canonical_double_check_drift_daily to anon, authenticated;
grant select on table public.v_unit_conversion_coverage to anon, authenticated;
grant select on table public.vw_product_ingredient_summary to anon, authenticated;

grant select on table public.user_meal_type_statistics to service_role;
grant select on table public.v_canonical_double_check_drift_daily to service_role;
grant select on table public.v_unit_conversion_coverage to service_role;
grant select on table public.vw_product_ingredient_summary to service_role;
