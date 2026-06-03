-- Harden the ingredient_swaps cache with data-integrity guards.
--
-- Follow-up to 20260603000000_create_ingredient_swaps_table.sql. That table is
-- already live in production, so every change here is additive and idempotent
-- (safe to run against both the existing table and a fresh database).
--
-- Scope was deliberately kept to constraints that are genuinely beneficial:
--   * a finite-value guard on `score` (it drives ORDER BY rank reads),
--   * a 1-based guard on `rank`, and
--   * an `updated_at` freshness column the export stamps on each upsert.
-- A `source IN (...)` check was intentionally NOT added: the column is designed
-- to grow additional sources, and a CHECK would force a migration per new source.

-- updated_at: the export stamps this per upsert so cache staleness is observable
-- (upsert-on-conflict does not re-apply a column default on the UPDATE path).
alter table public.ingredient_swaps
  add column if not exists updated_at timestamptz not null default now();

-- rank is 1-based (the export uses enumerate(..., start=1)); guard against an
-- off-by-one regression writing rank 0 / negative values.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ingredient_swaps_rank_positive'
  ) then
    alter table public.ingredient_swaps
      add constraint ingredient_swaps_rank_positive check (rank >= 1);
  end if;
end $$;

-- score drives ranked reads and minScore thresholds. Reject NaN / +/-Infinity,
-- which sort unpredictably in Postgres and would silently corrupt ordering.
-- This is a FINITENESS guard, NOT a [-1, 1] bound: blended core+chem swap scores
-- are a weighted sum across models and legitimately exceed 1.0.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ingredient_swaps_score_finite'
  ) then
    alter table public.ingredient_swaps
      add constraint ingredient_swaps_score_finite
      check (
        score <> 'NaN'::float8
        and score <> 'Infinity'::float8
        and score <> '-Infinity'::float8
      );
  end if;
end $$;
