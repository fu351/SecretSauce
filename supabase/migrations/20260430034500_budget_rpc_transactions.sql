create or replace function public.budget_switch_goal_transactional(
  p_profile_id uuid,
  p_name text,
  p_category public.budget_goal_category,
  p_target_cents integer
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_active_goal public.budget_goals%rowtype;
  v_new_goal public.budget_goals%rowtype;
  v_completed_now boolean := false;
begin
  if p_target_cents <= 0 then
    return jsonb_build_object('validationError', 'targetCents must be positive');
  end if;

  select *
    into v_active_goal
    from public.budget_goals
    where profile_id = p_profile_id
      and status = 'active'
    order by started_at desc
    limit 1
    for update;

  if v_active_goal.id is null then
    return jsonb_build_object('validationError', 'No active goal to switch from.');
  end if;

  update public.budget_goals
    set status = 'archived',
        updated_at = now()
    where id = v_active_goal.id;

  insert into public.budget_goals (
    profile_id,
    name,
    category,
    target_cents,
    current_balance_cents,
    status,
    switched_from_goal_id
  )
  values (
    p_profile_id,
    p_name,
    p_category,
    p_target_cents,
    v_active_goal.current_balance_cents,
    'active',
    v_active_goal.id
  )
  returning * into v_new_goal;

  if v_new_goal.current_balance_cents >= v_new_goal.target_cents then
    update public.budget_goals
      set status = 'completed',
          completed_at = now(),
          updated_at = now()
      where id = v_new_goal.id
      returning * into v_new_goal;
    v_completed_now := true;
  end if;

  return jsonb_build_object(
    'goal', to_jsonb(v_new_goal),
    'previousGoalId', v_active_goal.id,
    'completedNow', v_completed_now,
    'transferredBalanceCents', v_active_goal.current_balance_cents
  );
end;
$$;

grant execute on function public.budget_switch_goal_transactional(uuid, text, public.budget_goal_category, integer)
to authenticated, service_role;

create or replace function public.budget_allocate_surplus_transactional(
  p_profile_id uuid,
  p_week_start_date date,
  p_idempotency_key text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_summary public.budget_weekly_summaries%rowtype;
  v_active_goal public.budget_goals%rowtype;
  v_updated_goal public.budget_goals%rowtype;
  v_contribution public.budget_contributions%rowtype;
  v_next_balance integer;
  v_completed_now boolean := false;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    return jsonb_build_object('validationError', 'idempotencyKey is required.');
  end if;

  select *
    into v_contribution
    from public.budget_contributions
    where profile_id = p_profile_id
      and idempotency_key = p_idempotency_key
    limit 1;

  if v_contribution.id is not null then
    select *
      into v_updated_goal
      from public.budget_goals
      where id = v_contribution.goal_id
      limit 1;

    return jsonb_build_object(
      'duplicate', true,
      'contribution', to_jsonb(v_contribution),
      'goal', to_jsonb(v_updated_goal)
    );
  end if;

  select *
    into v_summary
    from public.budget_weekly_summaries
    where profile_id = p_profile_id
      and week_start_date = p_week_start_date
    limit 1
    for update;

  if v_summary.id is null then
    return jsonb_build_object('validationError', 'Weekly summary not found.');
  end if;

  if v_summary.bankable_surplus_cents <= 0 then
    return jsonb_build_object('validationError', 'No bankable surplus available for this week.');
  end if;

  if v_summary.status = 'allocated' then
    return jsonb_build_object('validationError', 'Surplus already allocated for this week.');
  end if;

  select *
    into v_active_goal
    from public.budget_goals
    where profile_id = p_profile_id
      and status = 'active'
    order by started_at desc
    limit 1
    for update;

  if v_active_goal.id is null then
    return jsonb_build_object('validationError', 'No active goal available for allocation.');
  end if;

  v_next_balance := v_active_goal.current_balance_cents + v_summary.bankable_surplus_cents;

  update public.budget_goals
    set current_balance_cents = v_next_balance,
        updated_at = now()
    where id = v_active_goal.id
    returning * into v_updated_goal;

  insert into public.budget_contributions (
    profile_id,
    goal_id,
    weekly_summary_id,
    amount_cents,
    idempotency_key
  )
  values (
    p_profile_id,
    v_active_goal.id,
    v_summary.id,
    v_summary.bankable_surplus_cents,
    p_idempotency_key
  )
  returning * into v_contribution;

  update public.budget_weekly_summaries
    set status = 'allocated',
        allocation_idempotency_key = p_idempotency_key,
        allocated_at = now(),
        updated_at = now()
    where id = v_summary.id
    returning * into v_summary;

  if v_updated_goal.current_balance_cents >= v_updated_goal.target_cents then
    update public.budget_goals
      set status = 'completed',
          completed_at = now(),
          updated_at = now()
      where id = v_updated_goal.id
      returning * into v_updated_goal;
    v_completed_now := true;
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'contribution', to_jsonb(v_contribution),
    'goal', to_jsonb(v_updated_goal),
    'summary', to_jsonb(v_summary),
    'completedNow', v_completed_now
  );
end;
$$;

grant execute on function public.budget_allocate_surplus_transactional(uuid, date, text)
to authenticated, service_role;
