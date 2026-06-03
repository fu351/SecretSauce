-- Precomputed Epicure ingredient swaps ("Both" integration fast-read cache).
-- The FastAPI /epicure/swap endpoint is the dynamic path; this table is the
-- materialized cache, populated by python-api/export_ingredient_swaps.py.
-- The independent fallback substitution data in canonical_substitution_proposals
-- is intentionally left untouched so the app can revert if Epicure underperforms.

create table if not exists public.ingredient_swaps (
  id uuid primary key default gen_random_uuid(),
  standardized_ingredient_id uuid not null
    references public.standardized_ingredients(id) on delete cascade,
  swap_standardized_ingredient_id uuid
    references public.standardized_ingredients(id) on delete set null,
  swap_token text not null,
  swap_display_name text not null,
  score double precision not null,
  rank integer not null,
  source text not null default 'epicure',
  model_version text,
  created_at timestamptz not null default now(),
  constraint ingredient_swaps_unique_swap unique (standardized_ingredient_id, swap_token)
);

create index if not exists ingredient_swaps_by_source_rank
  on public.ingredient_swaps (standardized_ingredient_id, rank);

create index if not exists ingredient_swaps_swap_fk
  on public.ingredient_swaps (swap_standardized_ingredient_id);

comment on table public.ingredient_swaps is
  'Precomputed ingredient swap suggestions from the Epicure embedding models (blended core+chem neighbours), keyed by standardized ingredient. Fast-read cache for the "Both" integration; the FastAPI /epicure/swap endpoint is the dynamic path. Independent fallback substitution data lives in canonical_substitution_proposals.';

alter table public.ingredient_swaps enable row level security;

create policy "ingredient_swaps_public_read"
  on public.ingredient_swaps for select
  to anon, authenticated
  using (true);
