# Agent Directory & Docs Map

## Purpose

This document helps AI agents quickly understand the repository and choose the right docs/files before making changes.
It intentionally lists only active, non-redundant docs.

## First Read

- For full-repo orientation, start with `docs/REPOSITORY_FUNCTIONALITY_OVERVIEW.md`.

## Canonical Product Truths

- Subscription tiers are only `free` and `premium`.
- `enterprise` is deprecated legacy context and must not be used for new logic.
- Primary source for tier policy: `docs/AGENT_CANONICAL_CONTEXT.md`.

## Docs Catalog (Key Files In `/docs`)

| File | Category | Use For | Priority |
|---|---|---|---|
| `docs/REPOSITORY_FUNCTIONALITY_OVERVIEW.md` | Repository Overview | Broad functionality map across routes, APIs, data, and automation | Highest |
| `docs/AGENT_CANONICAL_CONTEXT.md` | Agent Policy | Canonical tier rules and agent guardrails | Highest |
| `docs/AUTH_GATES_COMPLETE_GUIDE.md` | Auth & Access | AuthGate/TierGate/ShowWhen usage patterns | High |
| `docs/SUBSCRIPTION_QUICK_REFERENCE.md` | Auth & Access | Fast copy/paste API + hook usage | High |
| `docs/AB_TESTING_GUIDE.md` | Experimentation | A/B architecture, targeting, events, experiment setup | High |
| `docs/target-geospatial-integration.md` | Scraping & Geospatial | How Target scraper uses geospatial lookup + Target store IDs | High |

## Repository Map (Agent-Oriented)

- `app/`: Next.js routes (UI pages + API routes).
- `components/`: UI components. Auth gates live in `components/auth/tier-gate.tsx`.
- `hooks/`: Client logic/hooks. Tier hooks live in `hooks/use-subscription.ts`.
- `lib/`: Core logic and data access.
- `lib/auth/subscription.ts`: Server-side auth/tier enforcement.
- `lib/scrapers/target.js`: Target scraper logic.
- `lib/database/`: Supabase data layer + typed access.
- `scripts/`: Backfills, validations, and data maintenance scripts.
- `supabase/` and `migrations/`: Database migrations and schema evolution.

## Where To Start By Task

- Understand the full codebase quickly:  
  Read `docs/REPOSITORY_FUNCTIONALITY_OVERVIEW.md`, then this directory doc, then drill into the domain docs below.
- Auth/login/paywall behavior:  
  Read `docs/AGENT_CANONICAL_CONTEXT.md`, then `docs/AUTH_GATES_COMPLETE_GUIDE.md`, then inspect `lib/auth/subscription.ts` and `components/auth/tier-gate.tsx`.
- Subscription/tier UI logic:  
  Read `docs/SUBSCRIPTION_QUICK_REFERENCE.md`, then inspect `hooks/use-subscription.ts` and `lib/auth/subscription.ts`.
- A/B testing changes:  
  Read `docs/AB_TESTING_GUIDE.md`, then inspect `app/dev/experiments/`, `app/dev/feature-flags/`, and `lib/dev/helpers.ts`.
- Target pricing/geospatial/store matching:  
  Read `docs/target-geospatial-integration.md`, then inspect `lib/scrapers/target.js`, `lib/database/grocery-stores-db.ts`, and related scripts in `scripts/`.

## Agent Checklist Before Shipping

- Confirm tier logic only uses `free` and `premium`.
- Prefer server-side enforcement (`requireAuth`, `requireTier`) for route protection.
- Keep docs and examples aligned with actual code paths.
- If touching scraper logic, verify related validation scripts still match expectations.
