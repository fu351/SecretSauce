# Agent Directory

## Agent Metadata

- `Doc Kind`: `routing-index`
- `Canonicality`: `routing`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-14`
- `Primary Surfaces`: `docs/agent-directory.md`, `docs/agent-canonical-context.md`, `docs/repository-functionality-overview.md`
- `Update Trigger`: New docs are added, renamed, or responsibilities move.

## Agent Use

- `Read this when`: scoping a task and selecting the correct domain docs first.
- `Stop reading when`: you have chosen the target domain and entrypoint files.
- `Escalate to`: `docs/agent-canonical-context.md` for policy conflicts.

## Purpose

Quick routing for agents: which docs and code to read first for each change. Please update to keep consistency for future agents.

## Canonical Invariants

- Subscription tiers are only `free` and `premium`.
- Access semantics:
  - `requireAuth()` = signed-in user required
  - `requireTier("free")` = any signed-in user
  - `requireTier("premium")` = active premium user
- If docs conflict, trust this order:
  1. `docs/agent-canonical-context.md`
  2. implementation in `lib/auth/subscription.ts` and `hooks/use-subscription.ts`
  3. domain guides below

## Recommended Read Order

1. `docs/repository-functionality-overview.md` (broad architecture).
2. `docs/agent-canonical-context.md` (non-negotiable policy).
3. Domain docs from the task map below.

## Task Map (Docs + Code Entry Points)

| Task | Read First | Then Inspect |
|---|---|---|
| Auth, login, paywall behavior | `docs/agent-canonical-context.md`, `docs/auth-gates-complete-guide.md`, `docs/subscription-quick-reference.md` | `lib/auth/subscription.ts`, `components/auth/tier-gate.tsx`, `hooks/use-subscription.ts` |
| Analytics and event tracking | `docs/analytics-guide.md` | `lib/analytics/`, `lib/database/analytics-db.ts`, `hooks/use-analytics.ts`, `contexts/analytics-context.tsx` |
| A/B experiments | `docs/ab-testing-guide.md` | `app/dev/experiments/`, `app/dev/feature-flags/`, `lib/dev/helpers.ts` |
| Tutorial and onboarding | `docs/tutorial-current-state.md` | `contexts/tutorial-context.tsx`, `components/tutorial/tutorial-overlay.tsx`, `contents/tutorials/` |
| Ingredient queue worker and prompts | `docs/ingredient-queue-realtime-plan.md`, `docs/prompt-maintenance-guide.md` | `queue/`, `scripts/resolve-ingredient-match-queue.ts`, `lib/ingredient-standardizer.ts`, `lib/unit-standardizer.ts`, `lib/database/ingredient-match-queue-db.ts` |
| Scraper ingest function (`fn_bulk_insert_ingredient_history`) and queue handoff | `docs/database-guide.md`, `docs/ingredient-queue-realtime-plan.md` | `lib/database/ingredients-db.ts`, `scripts/daily-scraper.js`, Supabase function `public.fn_bulk_insert_ingredient_history(jsonb)` |
| Scraper implementation and runtime behavior | `docs/scrapers-directory.md` | `lib/scrapers/`, `lib/ingredient-pipeline.ts`, `app/api/grocery-search/route.ts`, `scripts/daily-scraper.js` |
| API routes, request contracts, and endpoint ownership | `docs/api-entrypoints-directory.md` | `app/api/`, `lib/ingredient-pipeline.ts`, `lib/database/`, `lib/store/` |
| Database schema/functions | `docs/database-guide.md` | `lib/database/`, `supabase/migrations/`, `migrations/` |
| Theming, dark/light mode, and visual style conventions | `docs/theming-style-guide.md`, `docs/documentation-conventions.md` | `app/globals.css`, `contexts/theme-context.tsx`, `components/providers/theme-sync.tsx`, `app/layout.tsx`, `tailwind.config.ts` |
| Documentation standards and structure | `docs/documentation-conventions.md` | `docs/`, `docs/agent-canonical-context.md`, `docs/agent-directory.md` |
| Operational scripts and maintenance workflows | `docs/scripts-directory.md` | `scripts/`, `.github/workflows/` |
| GitHub Actions orchestration and runbooks | `docs/workflows-directory.md` | `.github/workflows/`, reusable workflow call graph |
| Initiating bootstrap process (`workflow_dispatch`) | `docs/workflows-directory.md`, `docs/scripts-directory.md` | `.github/workflows/initiating-workflow.yml`, `.github/workflows/nightly-ingredient-queue.yml`, `.github/workflows/daily-scraper-matrix.yml`, `scripts/seed-mock-recipes.ts` |

## Initiating Process (Manual Bootstrap)

For changes related to the manual bootstrap flow (`.github/workflows/initiating-workflow.yml`), treat this as the canonical execution order:

1. Seed mock recipes (`scripts/seed-mock-recipes.ts`).
2. Run pre-scrape ingredient queue pass (`nightly-ingredient-queue.yml`, `queue_source=recipe`).
3. Run scraper matrix (`daily-scraper-matrix.yml`).
4. Run post-scrape ingredient queue pass (`nightly-ingredient-queue.yml`, `queue_source=scraper`).
5. Update unit-weight estimates (`update-unit-weight-estimates.yml`).

Use this process when validating workflow edits, diagnosing bootstrap failures, or updating bootstrap runbooks.

## Key Docs

- `docs/repository-functionality-overview.md`: full repository and subsystem map.
- `docs/agent-canonical-context.md`: canonical tier and guardrail policy.
- `docs/agent-directory.md`: this routing index.
- `docs/auth-gates-complete-guide.md`: auth/tier gate component usage.
- `docs/subscription-quick-reference.md`: fast server/client subscription APIs.
- `docs/analytics-guide.md`: analytics events, queueing, DB usage.
- `docs/ab-testing-guide.md`: experiment setup, targeting, reporting.
- `docs/tutorial-current-state.md`: current tutorial behavior and roadmap.
- `docs/ingredient-queue-realtime-plan.md`: queue migration plan and rollout state.
- `docs/prompt-maintenance-guide.md`: queue prompt files, contracts, rollout flags.
- `docs/scrapers-directory.md`: scraper inventory, runtime behavior, and diagnostics.
- `docs/api-entrypoints-directory.md`: API route inventory, contracts, auth notes, and dependencies.
- `docs/database-guide.md`: practical Supabase schema, functions, triggers.
- `docs/theming-style-guide.md`: implementation-backed theme architecture, tokens, and UI styling conventions.
- `docs/documentation-conventions.md`: required structure and trust model for docs under `docs/`.
- `docs/scripts-directory.md`: script routing, operational commands, and workflow mapping.
- `docs/workflows-directory.md`: workflow triggers, composition graph, and operational workflow map.
- `docs/project-roadmap.md`: planned work and active future initiatives.

## Current State Notes

- Tutorial system status and roadmap are actively tracked in `docs/tutorial-current-state.md` (last updated `2026-02-13`).
- Queue runtime is partially migrated to `queue/`; nightly workflow remains fallback until full cutover (`docs/ingredient-queue-realtime-plan.md`).
- Unit standardization is a two-stage flow: first-pass deterministic parsing/mapping in `public.fn_bulk_insert_ingredient_history(jsonb)`, then AI queue resolution for rows flagged `needs_unit_review`.
