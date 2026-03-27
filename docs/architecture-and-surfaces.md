# Architecture and Surfaces

Last verified: 2026-03-26.

## Stack snapshot

- Web app: Next.js App Router (`app/`) with React + TypeScript.
- Auth and identity: Clerk with a Supabase-backed profile bridge.
- Data layer: Supabase query wrappers in `lib/database/*` plus React Query via `contexts/query-provider.tsx`.
- Billing: Stripe checkout and webhook sync.
- Analytics and experiments: `contexts/analytics-context.tsx`, `hooks/use-analytics.ts`, `hooks/use-experiment.ts`, and `hooks/use-feature-flag.ts`.
- Tutorials and onboarding: `contexts/tutorial-context.tsx` and `components/tutorial/*`.
- Location and store support: `lib/location-client.ts`, `lib/store/*`, and shopping/store hooks.

## Frontend ownership map

- `app/`: route entrypoints and API routes.
- `components/`: feature UI, layout, shared shell, and tutorial surfaces.
- `contexts/`: auth, theme, analytics, tutorial, query, and carousel state.
- `hooks/`: barrel exports for recipe, shopping, meal-planner, delivery, UI, admin, subscription, experiment, and feature-flag hooks.
- `lib/`: frontend-facing auth helpers, analytics clients, location helpers, store metadata, and shared utilities/types.

## Global shell

- `app/layout.tsx` wraps the app in `ClerkProvider`, `ThemeProvider`, `QueryProvider`, `AuthProvider`, `AnalyticsProvider`, and `TutorialProvider`.
- The same layout renders `ThemeSync`, `TutorialOverlay`, `FeedbackWidget`, `Header`, `Toaster`, and `SpeedInsights` on every page.
- Google Maps JS is loaded in the layout when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is present.

## Current Route Surfaces

### Landing and home

- `/` renders the long-scroll marketing landing page from `components/landing/landing-page.tsx`.
- `/home` is the returning-user discovery page with recipe browsing and dashboard CTA.
- The header hides on `/` and on unauthenticated auth/onboarding pages.

### Core app

- `/dashboard` is the logged-in summary page with recipes, favorites, meal plan counts, shopping counts, tutorial prompts, and iOS web app prompts.
- `/recipes` is the searchable/filterable recipe index.
- `/recipes/[id]` is the recipe detail route.
- `/upload-recipe` supports manual recipe entry and import entry points.
- `/edit-recipe/[id]` is the edit flow for an existing recipe.
- `/meal-planner` is the weekly planner, guarded by `AuthGate`, with optional premium planning.
- `/shopping` is the shopping-list workspace and comparison launcher.
- `/store` is the receipt/comparison view with quick-add and replacement flows.
- `/pantry` is the pantry tracker, including ingredient standardization calls.
- `/delivery` lists current and past delivery orders.
- `/delivery/[id]` shows order details.

### Account and billing

- `/auth/signin`, `/auth/signup`, `/auth/check-email`, and `/auth/forgot-password` cover Clerk sign-in and email verification flows.
- `/onboarding` is the post-signup setup flow.
- `/welcome` is the lightweight authenticated welcome surface.
- `/settings` manages profile, preferences, theme, location, and tutorial state.
- `/pricing` is the plan selection page.
- `/checkout` is a client-side redirect page that posts to `/api/checkout`.
- `/checkout/success` and `/checkout/cancel` are the Stripe return pages.

### Dev and demo

- `/dev` and `/dev/*` expose internal tools such as experiments, feature flags, users, and database setup.
- `/example-tier-demo` is the tier-gated demo surface.

## Shared Frontend Modules

- `contexts/auth-context.tsx` bootstraps Clerk auth, calls `/api/auth/ensure-profile`, and exposes profile updates through `/api/auth/update-profile`.
- `contexts/analytics-context.tsx` tracks route changes and user identity.
- `contexts/tutorial-context.tsx` owns tutorial state, persistence, and route progression.
- `contexts/theme-context.tsx` wraps `next-themes` and keeps the app in sync with the DOM class.
- `hooks/index.ts` is the main import surface for UI, recipe, shopping, meal-planner, delivery, admin, subscription, experiment, and feature-flag hooks.
- `components/layout/header.tsx` currently links to `/recipes`, `/meal-planner`, `/store`, `/upload-recipe`, `/dashboard`, and `/settings`.
- `lib/location-client.ts` owns browser geolocation and map geocode requests.
- `lib/store/store-metadata.ts` and `lib/store/user-preferred-stores.ts` shape store metadata for comparison and pricing flows.
- `lib/auth/subscription.ts` and `hooks/use-subscription.ts` gate premium-only UI.
- `lib/auth/admin.ts` and `hooks/use-admin.ts` gate admin and analytics surfaces.

## Route Notes

- `/shopping` and `/store` are related but not interchangeable: `/shopping` is list management plus comparison, while `/store` is the receipt-style comparison and replacement view.
- `/checkout` does not create payment sessions itself; it forwards the collected cart summary to `/api/checkout`.
- Tutorial UI is global; the overlay is mounted from the root layout and can walk users across multiple pages.
