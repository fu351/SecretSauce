create table if not exists public.llm_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null check (event in ('llm.request.completed', 'llm.request.failed', 'llm.request.skipped')),
  task text not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('success', 'failed', 'skipped')),
  duration_ms integer not null check (duration_ms >= 0),
  input_chars integer not null check (input_chars >= 0),
  output_chars integer check (output_chars is null or output_chars >= 0),
  message_count integer not null check (message_count >= 0),
  prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens is null or completion_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  error_type text,
  error_message text,
  skip_reason text,
  request_id text,
  route text,
  user_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_llm_usage_events_created_at
  on public.llm_usage_events (created_at desc);

create index if not exists idx_llm_usage_events_task_created_at
  on public.llm_usage_events (task, created_at desc);

create index if not exists idx_llm_usage_events_route_created_at
  on public.llm_usage_events (route, created_at desc)
  where route is not null;

create index if not exists idx_llm_usage_events_request_id
  on public.llm_usage_events (request_id)
  where request_id is not null;

create table if not exists public.llm_usage_daily (
  usage_date date not null,
  task text not null,
  provider text not null,
  model text not null,
  route text not null default '',
  status text not null check (status in ('success', 'failed', 'skipped')),
  request_count integer not null default 0 check (request_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  total_duration_ms bigint not null default 0 check (total_duration_ms >= 0),
  avg_duration_ms numeric(12,2) not null default 0,
  p50_duration_ms numeric(12,2),
  p95_duration_ms numeric(12,2),
  max_duration_ms integer,
  total_input_chars bigint not null default 0 check (total_input_chars >= 0),
  total_output_chars bigint not null default 0 check (total_output_chars >= 0),
  total_prompt_tokens bigint not null default 0 check (total_prompt_tokens >= 0),
  total_completion_tokens bigint not null default 0 check (total_completion_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_date, task, provider, model, route, status)
);

create index if not exists idx_llm_usage_daily_date
  on public.llm_usage_daily (usage_date desc);

create or replace function public.fn_rollup_llm_usage_daily(p_usage_date date default (current_date - 1))
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  delete from public.llm_usage_daily
  where usage_date = p_usage_date;

  insert into public.llm_usage_daily (
    usage_date,
    task,
    provider,
    model,
    route,
    status,
    request_count,
    success_count,
    failed_count,
    skipped_count,
    total_duration_ms,
    avg_duration_ms,
    p50_duration_ms,
    p95_duration_ms,
    max_duration_ms,
    total_input_chars,
    total_output_chars,
    total_prompt_tokens,
    total_completion_tokens,
    total_tokens,
    updated_at
  )
  select
    p_usage_date,
    task,
    provider,
    model,
    coalesce(route, '') as route,
    status,
    count(*)::integer as request_count,
    count(*) filter (where status = 'success')::integer as success_count,
    count(*) filter (where status = 'failed')::integer as failed_count,
    count(*) filter (where status = 'skipped')::integer as skipped_count,
    coalesce(sum(duration_ms), 0)::bigint as total_duration_ms,
    round(avg(duration_ms)::numeric, 2) as avg_duration_ms,
    round(percentile_cont(0.50) within group (order by duration_ms)::numeric, 2) as p50_duration_ms,
    round(percentile_cont(0.95) within group (order by duration_ms)::numeric, 2) as p95_duration_ms,
    max(duration_ms)::integer as max_duration_ms,
    coalesce(sum(input_chars), 0)::bigint as total_input_chars,
    coalesce(sum(output_chars), 0)::bigint as total_output_chars,
    coalesce(sum(prompt_tokens), 0)::bigint as total_prompt_tokens,
    coalesce(sum(completion_tokens), 0)::bigint as total_completion_tokens,
    coalesce(sum(total_tokens), 0)::bigint as total_tokens,
    now()
  from public.llm_usage_events
  where created_at >= p_usage_date::timestamptz
    and created_at < (p_usage_date + 1)::timestamptz
  group by task, provider, model, coalesce(route, ''), status;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.fn_purge_llm_usage_events(p_older_than_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if p_older_than_days < 1 then
    raise exception 'p_older_than_days must be >= 1';
  end if;

  delete from public.llm_usage_events
  where created_at < now() - make_interval(days => p_older_than_days);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

alter table public.llm_usage_events enable row level security;
alter table public.llm_usage_daily enable row level security;

revoke all on table public.llm_usage_events from anon, authenticated;
revoke all on table public.llm_usage_daily from anon, authenticated;

grant all on table public.llm_usage_events to service_role;
grant all on table public.llm_usage_daily to service_role;
grant execute on function public.fn_rollup_llm_usage_daily(date) to service_role;
grant execute on function public.fn_purge_llm_usage_events(integer) to service_role;
