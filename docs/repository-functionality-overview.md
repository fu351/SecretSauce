# Repository Functionality Overview

## Agent Metadata

- `Doc Kind`: `orientation`
- `Canonicality`: `reference`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `app/`, `lib/database/`, `lib/scrapers/`, `scripts/`, `python-api/`
- `Update Trigger`: Major architecture, subsystem ownership, or repository layout changes.

## Agent Use

- `Read this when`: you need broad repository context before domain deep dives.
- `Stop reading when`: the relevant subsystem has been identified.
- `Escalate to`: `docs/agent-directory.md` and the selected domain directory doc.


## Purpose

This document provides a broad, implementation-grounded map of what this repository does, where the major systems live, and how the pieces fit together.

## Snapshot

- App type: Next.js App Router web app with a Supabase-backed data model.
- Frontend stack: React 19, TypeScript, Tailwind, Radix UI.
- Backend pattern: Next.js API routes plus Supabase RPC/functions and table access.
- Auxiliary backend: FastAPI service in `python-api/main.py` for recipe import/parsing tasks.
- Key scale points:
  - `32` page routes (`app/**/page.tsx`)
  - `15` API routes (`app/api/**/route.ts`)
  - `21` database module files (`lib/database`)
  - `18` scraper modules (`lib/scrapers`)
  - `16` top-level maintenance scripts (`scripts/`)

## System Architecture

- `app/`: user and admin route surface (UI pages + API endpoints).
- `components/`: UI composition by domain (recipes, meal planner, store/shopping, tutorial, auth gates).
- `contexts/`: global state/providers (`auth`, `theme`, `query`, `tutorial`).
- `hooks/`: domain hooks for recipes, meal planning, shopping, delivery, subscription.
- `lib/database/`: singleton table/RPC wrappers around Supabase.
  - `lib/database/supabase.ts`: browser client + schema types.
  - `lib/database/supabase-server.ts`: `server-only` service-role client factory.
- `lib/scrapers/`: grocery store scraper implementations and scraper runtime config.
- `lib/ingredient-pipeline.ts`: cache-first + scraper fallback pricing pipeline.
- `python-api/`: FastAPI import service for URL/Instagram/OCR recipe parsing.
- `scripts/`: operational automation for scraping/backfills/data hygiene.
- `supabase/migrations/` and `migrations/`: schema/RPC evolution.

## Core Product Functionality

## 1. Authentication And Identity

- Supabase email/password auth with client session management in `contexts/auth-context.tsx`.
- Email verification callback flow in `app/auth/callback/route.ts`.
- Sign-up/sign-in/check-email/forgot-password pages under `app/auth/*`.
- Session cookies are synced (`sb-access-token`, `sb-refresh-token`) for server-side auth checks.

## 2. Onboarding, Personalization, And Tutorial

- Multi-step onboarding captures goals, skill level, budget, diet/cuisine prefs, cooking time, and address/location.
- Tutorial path is selected from user goal (`cooking`, `budgeting`, `health`) and managed by `contexts/tutorial-context.tsx`.
- Welcome flow starts or skips guided tour; tutorial completion is persisted to profile.

## 3. Recipes (Creation, Discovery, Interaction)

- Recipe discovery with filters/sorting/pagination/favorites in `app/recipes/page.tsx`.
- Recipe detail in `app/recipes/[id]/page.tsx` with:
  - favorites
  - reviews
  - pricing panel
  - add-to-shopping-list flow
  - cooking mode step navigation
- Recipe authoring:
  - manual entry and import in `app/upload-recipe/page.tsx`
  - edit/update/delete in `app/edit-recipe/[id]/page.tsx`
- Recipe import channels:
  - URL import
  - Instagram import
  - image/OCR-to-structured recipe

## 4. Ingredient Standardization And Mapping

- `/api/ingredients/standardize` standardizes ingredient names for `recipe` and `pantry` contexts.
- AI-backed normalization in `lib/ingredient-standardizer.ts`.
- Canonical ingredient entities are reused across pricing, comparison, and shopping flows.

## 5. Pantry Management

- Pantry CRUD in `app/pantry/page.tsx` with:
  - category filters
  - expiration tracking
  - optional standardization
  - recipe suggestions based on pantry match percentage

## 6. Meal Planning

- Weekly planner in `app/meal-planner/page.tsx` (auth-gated).
- Drag/drop meal assignment, week navigation, nutrition summary, recipe search sidebar.
- Heuristic weekly plan generation via hook/API path and week-level persistence in `meal_schedule`.
- Export flow into shopping list/cart.

## 7. Shopping And Price Comparison

- Shopping list state and persistence in `hooks/shopping/use-shopping-list.ts` + `lib/database/store-list-db.ts`.
- Compare across stores using cached and real-time prices:
  - `/api/grocery-search`
  - `hooks/shopping/use-store-comparison.ts`
  - `/api/shopping/comparison`
- Manual replacement flow:
  - `get_replacement` RPC returns cached replacement candidates (store-scoped).
  - Falls back to live scraper search when no replacement candidates are available.
  - User-selected scraper items are persisted via `POST /api/grocery-search/cache-selection`, which writes through `fn_bulk_standardize_and_match` (with direct insert fallback).
- Store metadata (store IDs, location, distance, zip) is hydrated via `/api/user-store-metadata`.

## 8. Delivery And Order Logging

- Checkout-like flow writes selected products into delivery log via `store_list_history`.
- Delivery list and detail pages:
  - `app/delivery/page.tsx`
  - `app/delivery/[id]/page.tsx`
- Delivery status and totals are grouped by order/date/store.

## 9. Subscription And Access Gates

- Canonical tiers are `free` and `premium` only.
- Server-side enforcement in `lib/auth/subscription.ts` (`requireAuth`, `requireTier`, access checks).
- Client gates in `components/auth/tier-gate.tsx` (`AuthGate`, `TierGate`, show/hide helpers).

## 10. A/B Testing And Admin Tooling

- A/B schema under `ab_testing` supports experiments, variants, assignments, events, admin roles.
- Admin-only tools in `/dev`:
  - experiments
  - feature flags
  - user management
  - database inspector
  - auth/admin debugging
- Admin enforcement in `lib/auth/admin.ts`.

## 11. Geospatial Store Intelligence And Scraper Platform

- PostGIS-enabled `grocery_stores` lookups via `lib/database/grocery-stores-db.ts`.
- User-preferred store resolution with RPC + zip fallback in `lib/store/user-preferred-stores.ts`.
- Store scrapers for major chains in `lib/scrapers/*.js`.
- Ingredient pipeline does cache-first retrieval and selective scraper refresh.
- Target scraper store routing is driven by `targetStoreId`/`store_id` metadata and ZIP fallback.

## API Surface (By Domain)

## Shopping, Pricing, And Search

- `GET /api/grocery-search`
- `POST /api/grocery-search/cache-selection`
- `POST /api/shopping/comparison`
- `GET /api/recipe-pricing`
- `GET|POST /api/daily-scraper`
- `GET|POST /api/batch-scraper`

## Recipe Import And Parsing

- `POST /api/recipe-import/url`
- `POST /api/recipe-import/instagram`
- `POST /api/recipe-import/image`
- `POST /api/ingredients/standardize`

## Supporting Services

- `POST /api/maps` (Google Maps proxy actions)
- `POST /api/tutorial/complete`
- `GET /api/user-store-metadata`
- `POST /api/product-mappings/metrics`
- `POST /api/weekly-dinner-plan`

## Data Layer Model (Practical View)

- Base abstraction: `lib/database/base-db.ts` for typed table helpers.
- Supabase access boundary:
  - Browser/session client access goes through `lib/database/supabase.ts`.
  - Service-role access goes through `lib/database/supabase-server.ts` only.
- Domain table wrappers include:
  - profiles/admin roles
  - recipes + related entities
  - standardized ingredients/history/recent prices/product mappings
  - meal schedule/cache
  - pantry items
  - shopping list and store list history
  - grocery stores and geospatial queries
- Heavy business logic relies on RPC/functions (examples in migrations and database wrappers), including:
  - recipe upsert helpers
  - preferred store resolution
  - geospatial proximity lookup
  - batch ingredient history inserts
  - recipe cost calculation
  - order completion and delivery log insertion
  - admin and experimentation helper RPCs

## Automation And Operations

- `scripts/` contains data engineering and scraper operations:
  - daily scraper orchestration
  - geoscraper/import scripts for store data
  - queue/mapping maintenance scripts
- `.github/workflows/` contains scheduled and manual pipelines for scraping, cleanup, and mapping regeneration.
- `python-api/main.py` provides FastAPI endpoints consumed by Next API routes for import parsing tasks.

## Testing And Quality Infrastructure

- Test runner: Vitest (`npm run test`, domain-specific test scripts in `package.json`).
- Test support:
  - `test/setup.ts`
  - mock server/handlers/data in `test/mocks/`
- React Query provider defaults are centralized in `contexts/query-provider.tsx`.

## Known Implementation Notes

- `app/checkout/page.tsx` is currently empty (0 lines), so checkout behavior is effectively routed through shopping/delivery flows.
- `app/dev/page.tsx` links to `/dev/api-tester`, but no corresponding route is present in current tree.
- Repository currently contains additional TypeScript issues outside this documentation work; do not assume full `tsc --noEmit` clean state.

## Agent Guidance

- Start here for broad orientation.
- For tier/access decisions, defer to `docs/agent-canonical-context.md`.
- For auth/subscription specifics, pair docs with source of truth:
  - `lib/auth/subscription.ts`
  - `components/auth/tier-gate.tsx`
  - `hooks/use-subscription.ts`
- For shopping/scraping changes, read:
  - `lib/ingredient-pipeline.ts`
  - `hooks/shopping/use-store-comparison.ts`
  - `app/api/grocery-search/route.ts`
