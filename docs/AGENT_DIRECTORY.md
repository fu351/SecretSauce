# Agent Directory

Owner: Application Engineering  
Last reviewed: 2026-02-13

## Purpose

Quick routing for agents: which docs and code to read first for each change. Please update to keep consistency for future agents.

## Canonical Invariants

- Subscription tiers are only `free` and `premium`.
- Access semantics:
  - `requireAuth()` = signed-in user required
  - `requireTier("free")` = any signed-in user
  - `requireTier("premium")` = active premium user
- If docs conflict, trust this order:
  1. `docs/AGENT_CANONICAL_CONTEXT.md`
  2. implementation in `lib/auth/subscription.ts` and `hooks/use-subscription.ts`
  3. domain guides below

## Recommended Read Order

1. `docs/REPOSITORY_FUNCTIONALITY_OVERVIEW.md` (broad architecture).
2. `docs/AGENT_CANONICAL_CONTEXT.md` (non-negotiable policy).
3. Domain docs from the task map below.

## Task Map (Docs + Code Entry Points)

| Task | Read First | Then Inspect |
|---|---|---|
| Auth, login, paywall behavior | `docs/AGENT_CANONICAL_CONTEXT.md`, `docs/AUTH_GATES_COMPLETE_GUIDE.md`, `docs/SUBSCRIPTION_QUICK_REFERENCE.md` | `lib/auth/subscription.ts`, `components/auth/tier-gate.tsx`, `hooks/use-subscription.ts` |
| Analytics and event tracking | `docs/ANALYTICS_GUIDE.md` | `lib/analytics/`, `lib/database/analytics-db.ts`, `hooks/use-analytics.ts`, `contexts/analytics-context.tsx` |
| A/B experiments | `docs/AB_TESTING_GUIDE.md` | `app/dev/experiments/`, `app/dev/feature-flags/`, `lib/dev/helpers.ts` |
| Tutorial and onboarding | `docs/TUTORIAL_CURRENT_STATE.md` | `contexts/tutorial-context.tsx`, `components/tutorial/tutorial-overlay.tsx`, `contents/tutorials/` |
| Ingredient queue worker and prompts | `docs/INGREDIENT_QUEUE_REALTIME_PLAN.md`, `docs/PROMPT_MAINTENANCE_GUIDE.md` | `queue/`, `scripts/resolve-ingredient-match-queue.ts`, `lib/ingredient-standardizer.ts`, `lib/unit-standardizer.ts`, `lib/database/ingredient-match-queue-db.ts` |
| Scraper implementation and runtime behavior | `docs/SCRAPERS_DIRECTORY.md` | `lib/scrapers/`, `lib/ingredient-pipeline.ts`, `app/api/grocery-search/route.ts`, `scripts/daily-scraper.js` |
| API routes, request contracts, and endpoint ownership | `docs/API_ENTRYPOINTS_DIRECTORY.md` | `app/api/`, `lib/ingredient-pipeline.ts`, `lib/database/`, `lib/store/` |
| Database schema/functions | `docs/DATABASE_GUIDE.md` | `lib/database/`, `supabase/migrations/`, `migrations/` |
| Operational scripts and maintenance workflows | `docs/SCRIPTS_DIRECTORY.md` | `scripts/`, `.github/workflows/` |
| GitHub Actions orchestration and runbooks | `docs/WORKFLOWS_DIRECTORY.md` | `.github/workflows/`, reusable workflow call graph |

## Key Docs

- `docs/REPOSITORY_FUNCTIONALITY_OVERVIEW.md`: full repository and subsystem map.
- `docs/AGENT_CANONICAL_CONTEXT.md`: canonical tier and guardrail policy.
- `docs/AGENT_DIRECTORY.md`: this routing index.
- `docs/AUTH_GATES_COMPLETE_GUIDE.md`: auth/tier gate component usage.
- `docs/SUBSCRIPTION_QUICK_REFERENCE.md`: fast server/client subscription APIs.
- `docs/ANALYTICS_GUIDE.md`: analytics events, queueing, DB usage.
- `docs/AB_TESTING_GUIDE.md`: experiment setup, targeting, reporting.
- `docs/TUTORIAL_CURRENT_STATE.md`: current tutorial behavior and roadmap.
- `docs/INGREDIENT_QUEUE_REALTIME_PLAN.md`: queue migration plan and rollout state.
- `docs/PROMPT_MAINTENANCE_GUIDE.md`: queue prompt files, contracts, rollout flags.
- `docs/SCRAPERS_DIRECTORY.md`: scraper inventory, runtime behavior, and diagnostics.
- `docs/API_ENTRYPOINTS_DIRECTORY.md`: API route inventory, contracts, auth notes, and dependencies.
- `docs/DATABASE_GUIDE.md`: practical Supabase schema, functions, triggers.
- `docs/SCRIPTS_DIRECTORY.md`: script routing, operational commands, and workflow mapping.
- `docs/WORKFLOWS_DIRECTORY.md`: workflow triggers, composition graph, and operational workflow map.
- `docs/ROADMAP.md`: planned work and active future initiatives.

## Current State Notes

- Tutorial system status and roadmap are actively tracked in `docs/TUTORIAL_CURRENT_STATE.md` (last updated `2026-02-13`).
- Queue runtime is partially migrated to `queue/`; nightly workflow remains fallback until full cutover (`docs/INGREDIENT_QUEUE_REALTIME_PLAN.md`).
