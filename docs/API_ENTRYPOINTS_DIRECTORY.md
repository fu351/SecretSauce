# API Entrypoints Directory

## Purpose

Quick routing for `app/api/`: which endpoint owns what, request contracts, auth expectations, and key dependencies.

## Auth and Safety Notes

- `CRON_SECRET` protected endpoints:
  - `POST /api/batch-scraper` (required)
  - `GET|POST /api/daily-scraper` (required in production when `CRON_SECRET` is set)
- Session-auth endpoint:
  - `POST /api/tutorial/complete` (requires logged-in Supabase user from cookies)
- Most remaining routes are app-internal utility endpoints with input validation but no explicit auth guard in-route.
- Endpoints that proxy external services should be treated as server-only surfaces:
  - Maps proxy (`/api/maps`)
  - Recipe import proxy endpoints (`/api/recipe-import/*`)

## Endpoint Catalog

| Route | Method(s) | Auth | Primary Responsibility | Key Dependencies |
|---|---|---|---|---|
| `/api/batch-scraper` | `POST`, `GET` | `POST` requires `Authorization: Bearer $CRON_SECRET`; `GET` is health check | Batch scrape many ingredients across stores; returns per-ingredient/per-store success stats | `lib/ingredient-pipeline`, `lib/database/recipe-ingredients-db.ts`, `lib/database/ingredients-db.ts` |
| `/api/daily-scraper` | `GET`, `POST` | Cron secret in production (when configured) | Legacy daily scraper loop over all standardized ingredients and stores; caches cheapest results | `lib/database/standardized-ingredients-db.ts`, `lib/database/ingredients-db.ts`, `lib/scrapers/` |
| `/api/grocery-search` | `GET` | Optional Supabase token/cookies used for user zip + preferred stores | Search ingredient prices using cache-first pipeline with live scraper fallback | `lib/ingredient-pipeline`, `lib/database/ingredients-db.ts`, `lib/store/user-preferred-stores`, `lib/scrapers/` |
| `/api/grocery-search/cache-selection` | `POST` | None in-route | Persist user-selected product as cached ingredient/store price | `lib/database/ingredients-db.ts` |
| `/api/ingredients/standardize` | `POST` | None in-route | Normalize ingredient inputs, run AI standardization, and update recipe/pantry links | `lib/ingredient-standardizer.ts`, `lib/database/standardized-ingredients-db.ts`, `lib/database/recipe-ingredients-db.ts`, `lib/database/pantry-items-db.ts` |
| `/api/maps` | `POST` | None in-route (server API key required) | Proxy Google Maps geocode/places/routes requests | Google Maps HTTP APIs via `fetch` |
| `/api/product-mappings/metrics` | `POST` | None in-route | Increment product mapping interaction metrics (shown/exchanged counts) | `lib/database/product-mappings-db.ts` |
| `/api/recipe-import/image` | `POST` | None in-route (python service URL required) | Send OCR text to Python import service | `PYTHON_SERVICE_URL` + Python backend `/recipe-import/text` |
| `/api/recipe-import/instagram` | `POST` | None in-route (python service URL required) | Validate/normalize Instagram URL and proxy import request with timeout/error mapping | `PYTHON_SERVICE_URL` + Python backend `/recipe-import/instagram` |
| `/api/recipe-import/url` | `POST` | None in-route (python service URL required) | Validate generic URL and proxy recipe import request | `PYTHON_SERVICE_URL` + Python backend `/recipe-import/url` |
| `/api/recipe-pricing` | `GET` | None in-route | Return per-store recipe totals and cheapest store from cached pricing/RPC | `lib/database/supabase`, RPC `calculate_recipe_cost` |
| `/api/shopping/comparison` | `POST` | None in-route | Build per-store shopping-list totals from cached item prices | `lib/database/base-db` (`shopping_item_price_cache`) |
| `/api/tutorial/complete` | `POST` | Supabase session user required | Mark tutorial completion/path in `profiles` | `lib/database/supabase` |
| `/api/user-store-metadata` | `GET` | None in-route | Return user-preferred store metadata, hydrating coordinates when needed | `lib/store/user-preferred-stores`, `lib/database/grocery-stores-db.ts`, `lib/utils/store-metadata.ts` |
| `/api/weekly-dinner-plan` | `POST` | None in-route | Generate weekly meal plan via heuristic planner | `hooks/meal-planner/use-heuristic-plan` |

## Request Contract Quick Notes

- `/api/grocery-search` (`GET`):
  - required: `searchTerm`
  - zip resolution order: `zipCode` query -> user profile zip -> `ZIP_CODE`/`DEFAULT_ZIP_CODE`
  - optional controls: `store`, `standardizedIngredientId`, `forceRefresh=true`, `liveActivation=true`
- `/api/recipe-pricing` (`GET`):
  - required: `recipeId`
  - optional: `zipCode`, `stores` (CSV), `servings` (defaults to `2`)
- `/api/user-store-metadata` (`GET`):
  - required: `userId`
  - optional fallback: `zipCode`
- `/api/ingredients/standardize` (`POST`):
  - required: non-empty `ingredients[]`
  - `context="recipe"` requires `recipeId`
  - `context="pantry"` requires `pantryItemId` and `userId`

## Environment Variables Used by API Routes

- Scraper/pricing fallback ZIP:
  - `ZIP_CODE`, `DEFAULT_ZIP_CODE`
- Scheduled scraper auth:
  - `CRON_SECRET`
- Maps proxy:
  - `GOOGLE_MAPS_SERVER_KEY` (preferred), `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- Recipe import proxy:
  - `PYTHON_SERVICE_URL` (preferred), `NEXT_PUBLIC_PYTHON_SERVICE_URL`

## Where To Start By Task

- Ingredient price lookup behavior:
  - `app/api/grocery-search/route.ts`
  - `lib/ingredient-pipeline.ts`
  - `docs/SCRAPERS_DIRECTORY.md`
- Scheduled scraping and cron auth:
  - `app/api/batch-scraper/route.ts`
  - `app/api/daily-scraper/route.ts`
  - `docs/SCRIPTS_DIRECTORY.md`
- Ingredient standardization and canonical IDs:
  - `app/api/ingredients/standardize/route.ts`
  - `lib/ingredient-standardizer.ts`
  - `docs/PROMPT_MAINTENANCE_GUIDE.md`
- Recipe import failures:
  - `app/api/recipe-import/instagram/route.ts`
  - `app/api/recipe-import/url/route.ts`
  - `app/api/recipe-import/image/route.ts`
- Store metadata and user location behavior:
  - `app/api/user-store-metadata/route.ts`
  - `lib/store/user-preferred-stores.ts`
