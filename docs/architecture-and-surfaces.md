# Architecture and Surfaces

Last verified: 2026-03-20.

## Stack snapshot

- Web app: Next.js App Router (`app/`) with React + TypeScript.
- Data layer: Supabase (`lib/database/*`, `supabase/migrations/*`).
- Auth and identity: Clerk + Supabase profile bridge.
- Billing: Stripe subscription checkout + webhooks.
- Ingredient intelligence: queue workers + standardizer + embedding-backed scoring.
- Scraping: store-specific scraper modules in `scrapers/stores/*` plus orchestration routes/scripts.
- Auxiliary backend: FastAPI service in `python-api/main.py` for recipe import/parsing.

## Current top-level ownership map

- `app/`: UI pages and API routes.
- `components/`: domain UI components.
- `hooks/`: client hooks (shopping, recipe, analytics, auth, subscription, experiments).
- `lib/`: database wrappers, auth helpers, analytics, parsing helpers, shared types/utilities.
- `backend/workers/`: long-running worker modules (ingredient, embedding, vector double-check, canonical consolidation, scraper, store maintenance).
- `backend/workers/standardizer-worker/`: ingredient/unit standardizer services + prompts.
- `scrapers/`: scraper adapters, store implementations, and scraper utilities.
- `backend/scripts/`: one-off and scheduled operational scripts.
- `python-api/`: FastAPI service for URL/Instagram/OCR recipe import.
- `supabase/migrations/`: applied SQL migrations for live data behavior.
- `.github/workflows/`: scheduled/manual automation.

## Product/runtime surfaces

### User-facing pages (selected)

- Core routes: `app/page.tsx`, `app/home/page.tsx`, `app/dashboard/page.tsx`.
- Meal/shopping/pantry/store: `app/meal-planner/page.tsx`, `app/shopping/page.tsx`, `app/pantry/page.tsx`, `app/store/page.tsx`.
- Recipes: `app/recipes/page.tsx`, `app/recipes/[id]/page.tsx`, `app/upload-recipe/page.tsx`, `app/edit-recipe/[id]/page.tsx`.
- Subscription and checkout: `app/pricing/page.tsx`, `app/checkout/*`.
- Auth/onboarding/tutorial entry points: `app/auth/*`, `app/welcome/page.tsx`, `app/onboarding/page.tsx`.
- Admin/dev surfaces: `app/dev/*` (experiments, feature flags, users, database tools).

### API surface

Current API routes are under `app/api/*` and documented in [`api-and-integrations.md`](./api-and-integrations.md).

### Worker/runtime surface

- Ingredient queue worker: `backend/workers/ingredient-worker/*`.
- Embedding queue worker: `backend/workers/embedding-worker/*`.
- Queue runner entry points:
  - `backend/scripts/resolve-ingredient-match-queue.ts`
  - `backend/workers/ingredient-worker/runner.ts`
  - `backend/scripts/resolve-embedding-queue.ts`
  - `backend/workers/embedding-worker/runner.ts`
- Vector double-check candidate worker (present in tree): `backend/workers/vector-double-check-worker/*`.

### Data/migrations surface

Recent migrations include:

- `0016_product_mapping_is_ingredient_flag.sql`
- `20260219110000_add_canonical_probation_and_confidence_calibration.sql`
- `20260223152000_add_queue_probation_status.sql`
- `20260307020000_wire_idf_cache.sql`
- `20260307030000_bigram_pmi_schema.sql`
- `20260307040000_bigram_pmi_refresh_fn.sql`
- `20260307050000_wire_collocation_scoring.sql`

These are actively relevant to current queue matching/scoring behavior.

## Important path corrections (post-consolidation)

The current code uses:

- `scrapers/*` (not `lib/scrapers/*`)
- `backend/workers/standardizer-worker/*` (not `lib/ingredient-standardizer.ts` / `lib/unit-standardizer.ts`)
- `backend/workers/ingredient-worker/*` and `backend/workers/embedding-worker/*` (not `queue/worker/*`)
