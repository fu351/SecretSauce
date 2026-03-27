# API and Integrations

Last verified: 2026-03-26.

## Route Index (`app/api/*`)

### Auth and profile bridge

- `GET /api/auth/admin-status`
  - Returns the current user's admin and analytics access flags.
- `POST /api/auth/ensure-profile`
  - Ensures a deterministic `profiles` row exists for the current Clerk session.
- `PATCH /api/auth/update-profile`
  - Applies allowlisted profile updates from the settings and tutorial flows.

### Billing and subscription

- `POST /api/checkout`
  - Creates the Stripe checkout session for the client-side `/checkout` page.
- `POST /api/stripe/checkout`
  - Legacy alias that delegates to `/api/checkout`.
- `GET /api/stripe/checkout`
  - Legacy redirect to `/checkout`.
- `POST /api/webhooks/stripe`
  - Stripe webhook handler that syncs subscription state into profiles.
- `POST /api/webhooks/clerk`
  - Clerk webhook handler that upserts identity fields into profiles.

### Shopping, stores, and delivery

- `GET /api/grocery-search`
  - Main grocery search endpoint used by shopping and store comparison flows.
- `POST /api/grocery-search/cache-selection`
  - Persists a manual item/store selection back into the shopping pipeline.
- `POST /api/shopping/comparison`
  - Returns shopping-store comparison data for the current list.
- `POST /api/batch-scraper`
  - Protected batch search endpoint for larger grocery lookups.
- `GET /api/batch-scraper`
  - Health/status response.
- `GET /api/user-store-metadata`
  - Returns preferred-store metadata used by shopping and pricing hooks.

### Ingredient and recipe import/parsing

- `POST /api/ingredients/standardize`
  - Pantry-context ingredient standardization.
- `POST /api/recipe-import/url`
  - URL import path used by the recipe import form.
- `POST /api/recipe-import/instagram`
  - Instagram URL import path.
- `POST /api/recipe-import/image`
  - OCR text import path.
- `POST /api/recipe-import/paragraph`
  - Premium-gated paragraph parsing path.

### Location and maps

- `POST /api/location`
  - Saves browser geolocation into the current profile.
- `POST /api/maps`
  - Proxies Google Maps geocode/place/routing actions for the frontend.

## Frontend Callers

- `contexts/auth-context.tsx`, `app/auth/signin/page.tsx`, `app/auth/signup/page.tsx`, and `app/auth/check-email/page.tsx` call `/api/auth/ensure-profile`.
- `contexts/auth-context.tsx` calls `/api/auth/update-profile` for profile saves.
- `hooks/use-admin.ts` calls `/api/auth/admin-status`.
- `app/checkout/page.tsx` calls `/api/checkout`.
- `components/store/store-replacement.tsx` calls `/api/grocery-search/cache-selection`.
- `hooks/shopping/use-store-comparison.ts` and `hooks/shopping/use-real-time-pricing.ts` call `/api/user-store-metadata`.
- `lib/location-client.ts` calls `/api/maps` and `/api/location`.
- `app/pantry/page.tsx` calls `/api/ingredients/standardize`.
- `components/recipe/import/recipe-import-url.tsx`, `components/recipe/import/recipe-import-instagram.tsx`, `components/recipe/import/recipe-import-image.tsx`, and `components/recipe/import/recipe-import-paragraph.tsx` call the recipe-import routes.

## Integration Contracts

### Clerk

- Client auth is handled through Clerk React hooks.
- Server-side profile linkage relies on Clerk session identity plus `/api/auth/ensure-profile`.

### Supabase

- Browser/session access and service-role access are split across `lib/database/supabase.ts` and `lib/database/supabase-server.ts`.
- Frontend hooks and helpers read through `lib/database/*` wrappers rather than querying tables directly.

### Stripe

- `/checkout` collects cart summary data, then posts to `/api/checkout`.
- The success and cancel pages live under `/checkout/success` and `/checkout/cancel`.
- Webhook sync is handled server-side in `/api/webhooks/stripe`.

### Google Maps

- The root layout loads the Maps JS script when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set.
- Frontend geocode and location updates go through `/api/maps` and `/api/location`.

### Analytics and experiments

- `contexts/analytics-context.tsx` and `hooks/use-analytics.ts` provide route tracking and event dispatch.
- `hooks/use-experiment.ts` and `hooks/use-feature-flag.ts` wrap the A/B testing client.

## Minimal Environment Checklist

- Clerk client/server keys and webhook secret.
- Supabase URL and service-role key.
- Stripe secret key, premium price ID, and webhook secret.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for the Maps JS script.
- `PYTHON_SERVICE_URL` when using the recipe-import proxies.
