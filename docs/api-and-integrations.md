# API and Integrations

Last verified: 2026-03-20.

## Route index (`app/api/*`)

### Auth and profile bridge

- `GET /api/auth/admin-status`
  - Resolves current user/profile and checks admin analytics RPC gates.
- `POST /api/auth/ensure-profile`
  - Ensures a deterministic `profiles` row exists and links `clerk_user_id`.
- `PATCH /api/auth/update-profile`
  - Allowlisted profile updates only (identity/billing fields blocked).

### Billing and subscription

- `POST /api/checkout`
  - Creates Stripe subscription checkout session.
  - Ensures customer linkage in `profiles`.
- `POST /api/stripe/checkout`
  - Backward-compatible alias to `/api/checkout`.
- `GET /api/stripe/checkout`
  - Redirects legacy endpoint hits to `/checkout`.
- `POST /api/webhooks/stripe`
  - Verifies Stripe signature and syncs profile subscription fields.
  - On successful checkout, can write purchased cart metadata into delivery log.
- `POST /api/webhooks/clerk`
  - Verifies Clerk webhook and upserts profile identity fields.

### Grocery/search/comparison

- `GET /api/grocery-search`
  - Main search endpoint; cache-first with scraper fallback/force refresh.
- `POST /api/grocery-search/cache-selection`
  - Persists user manual item selection into ingredient history/mapping path.
- `POST /api/shopping/comparison`
  - Returns store comparison from `shopping_item_price_cache`.
- `POST /api/batch-scraper`
  - CRON-protected batch scraping endpoint for many ingredients.
- `GET /api/batch-scraper`
  - Health/status response.
- `GET /api/user-store-metadata`
  - Returns preferred-store metadata with location hydration.

### Ingredient and recipe import/parsing

- `POST /api/ingredients/standardize`
  - Pantry-context ingredient standardization only.
- `POST /api/recipe-import/url`
  - Proxies URL import to Python service.
- `POST /api/recipe-import/instagram`
  - Validates/normalizes IG URL and proxies to Python service.
- `POST /api/recipe-import/image`
  - Sends OCR text to Python parser endpoint.
- `POST /api/recipe-import/paragraph`
  - Premium-gated paragraph parsing with structured extraction.

### Maps proxy

- `POST /api/maps`
  - Proxies Google APIs for geocode/place search/routes actions.

## Integration contracts

### Supabase

- Browser/session and service-role access split across `lib/database/supabase.ts` and `lib/database/supabase-server.ts`.
- Queue and matching rely on RPCs/tables used via `lib/database/*` wrappers.

### Clerk

- Auth checks done via `@clerk/nextjs/server` in API/server code.
- Profile linkage anchored by `clerk_user_id` and deterministic fallback ID logic.

### Stripe

- Checkout session created in `/api/checkout`.
- Subscription state synchronized in `/api/webhooks/stripe` to `profiles`.

### Python import service

Next routes proxy to FastAPI (`python-api/main.py`) endpoints:

- `POST /recipe-import/url`
- `POST /recipe-import/instagram`
- `POST /recipe-import/text`

Configured by `PYTHON_SERVICE_URL` (or `NEXT_PUBLIC_PYTHON_SERVICE_URL`).

### OpenAI

- Ingredient/unit standardization and embeddings use OpenAI keys/models in worker/standardizer code.

## Minimal environment checklist (integration-critical)

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Clerk: server keys + webhook secret (for webhook route)
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_PREMIUM_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- Python import service: `PYTHON_SERVICE_URL` (or public fallback var)
- OpenAI (backend/workers/standardizer-worker): `OPENAI_API_KEY`, optional model vars
- Maps proxy: one of `GOOGLE_MAPS_SERVER_KEY`, `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
