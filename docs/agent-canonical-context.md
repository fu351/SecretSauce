# Agent Canonical Context

## Agent Metadata

- `Doc Kind`: `policy`
- `Canonicality`: `canonical`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `docs/agent-canonical-context.md`, `lib/auth/subscription.ts`, `hooks/use-subscription.ts`
- `Update Trigger`: Tier/access invariants or core API/data pipeline rules change.

## Agent Use

- `Read this when`: defining non-negotiable constraints before implementation.
- `Stop reading when`: policy is clear and you need detailed implementation behavior.
- `Escalate to`: `lib/auth/subscription.ts`, `hooks/use-subscription.ts`, `docs/agent-directory.md`.

## Purpose

This file defines non-negotiable, cross-domain rules for agents. Treat roadmap/planning docs as informational, not canonical policy.

## Source-of-Truth Order

When docs or examples disagree, use this order:

1. `docs/agent-canonical-context.md`
2. Live auth/subscription implementation:
   - `lib/auth/subscription.ts`
   - `hooks/use-subscription.ts`
   - `components/auth/tier-gate.tsx`
3. Domain directory docs (API/scripts/scrapers/database/workflows)

## Tier and Access Invariants

- Valid subscription tiers are only `free` and `premium`.
- `enterprise` is legacy/deprecated. Do not use it in code, docs, experiments, or access checks.
- If legacy third-tier values appear in data, treat as migration debt and normalize to `premium`.
- Access semantics:
  - `requireAuth()` = signed-in user required
  - `requireTier("free")` = any signed-in user
  - `requireTier("premium")` = active premium user

## API/Auth Invariants

- `POST /api/batch-scraper` must require `Authorization: Bearer $CRON_SECRET`.
- External proxy endpoints require server configuration:
  - `/api/maps` needs Google Maps API key
  - `/api/recipe-import/*` needs `PYTHON_SERVICE_URL`

## Data and Pricing Pipeline Invariants

- `product_mappings` is the single source of truth for product identity and standardized mapping.
- `ingredients_history` is the append-only price log; `ingredients_recent` is the current snapshot.
- Processing logic belongs in `fn_bulk_insert_ingredient_history(jsonb)`; do not rely on `ingredients_history` triggers.
- Low-confidence ingredient/unit matches flow to `ingredient_match_queue` and resolved queue rows backfill `product_mappings`.

## Queue Runtime Invariants

- Queue runtime lives under `queue/`; `scripts/resolve-ingredient-match-queue.ts` is a transitional shim.
- Safe defaults remain:
  - `QUEUE_SOURCE=scraper`
  - `QUEUE_REVIEW_MODE=ingredient`
  - `QUEUE_ENABLE_UNIT_RESOLUTION=false`
  - `QUEUE_UNIT_DRY_RUN=true`
- Nightly queue workflow remains fallback until full real-time cutover is complete.

## Scraper Invariants

- Active store scrapers: Target, Walmart, Trader Joe's, Aldi, Kroger, Meijer, 99 Ranch.
- Safeway, Whole Foods, and Andronico's are currently wired but return `[]` by design.
- Target store routing prioritizes explicit target store IDs before nearest-store ZIP fallback.

## Analytics and Experimentation Invariants

- Analytics and experiments share the `ab_testing` schema and `ab_testing.events`.
- General analytics events use reserved zero UUIDs for `experiment_id` and `variant_id`.
- Event tracking should remain privacy-safe: no direct PII in event payloads.

## Tutorial Invariants

- Tutorial paths are `cooking`, `budgeting`, and `health`.
- Goal mapping is `both -> health`.
- Completion data must stay consistent across profile fields:
  - `tutorial_completed`
  - `tutorial_completed_at`
  - `tutorial_path`

## Agent Guardrails

- Do not generate examples using `requireTier("enterprise")`.
- Do not describe a three-tier model.
- Do not treat `docs/project-roadmap.md` or migration plans as implemented behavior unless code confirms it.
- When unsure, verify behavior in implementation before proposing schema/API changes.
