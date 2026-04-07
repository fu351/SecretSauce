# SecretSauce — Product Overview

Last updated: 2026-04-05.

---

## What It Is

A **recipe management and smart grocery shopping app** that helps users plan meals, build shopping lists, and compare grocery prices across stores. The core differentiator is an AI-driven ingredient standardization pipeline that normalizes ingredients across recipes and maps them to real store products.

---

## Architecture

The product has three runtime layers:

| Layer | Stack | Purpose |
|---|---|---|
| **Web App** | Next.js (App Router), TypeScript, React, Tailwind, shadcn/ui | User-facing frontend + API routes |
| **Background Workers** | Node.js/TypeScript, Docker Compose | Async data pipelines |
| **Python API** | FastAPI, Fly.io | Recipe scraping, OCR, Instagram import |

**Infrastructure:** Supabase (Postgres + pgvector), Clerk (auth), Stripe (billing), Google Maps, PostHog (analytics)

---

## Frontend Routes

- `/` — marketing landing page
- `/home`, `/dashboard` — discovery and user summary
- `/recipes`, `/recipes/[id]`, `/upload-recipe`, `/edit-recipe/[id]` — recipe management
- `/meal-planner` — weekly meal planner (premium-gated)
- `/shopping`, `/store` — shopping list management and real-time store price comparison
- `/pantry` — ingredient pantry tracker
- `/delivery`, `/delivery/[id]` — grocery delivery orders
- `/pricing`, `/checkout` — Stripe subscription flow
- `/settings`, `/onboarding` — account setup and preferences

---

## Backend Pipeline System

Eight worker types running as Docker services:

1. **Ingredient Match Queue** — standardizes recipe ingredients against a canonical ingredient list using LLM + vector similarity
2. **Embedding Worker** — generates OpenAI (`text-embedding-3-small`) or Ollama embeddings for recipes/ingredients
3. **Vector Double-Check** — finds near-duplicate canonical ingredients via cosine similarity (≥0.9 threshold)
4. **Canonical Consolidation** — merges duplicate canonicals using `fn_consolidate_canonical` in Postgres
5. **Standardizer Worker** — LLM-driven ingredient and unit normalization
6. **Scraper Worker / Daily Scraper** — grocery store product scraping (Trader Joe's, 99 Ranch, others)
7. **Frontend Scraper** — scraping triggered from user-facing flows
8. **Store Maintenance** — store catalog upkeep

---

## Recipe Import Paths

The Python FastAPI service handles four import modes:

- URL scraping (via `recipe-scrapers`)
- Instagram post parsing (via `instaloader`)
- Image/OCR parsing
- Paragraph text parsing (premium-gated)

---

## AI / ML Components

- **LLM standardization**: Gemini (`@google/genai`) and OpenAI used in standardizer worker prompts
- **Vector embeddings**: `pgvector` in Supabase stores embeddings; matching uses cosine similarity with lexical/category/form bonuses
- **Bigram PMI scoring**: database-level collocation scoring for ingredient matching quality
- **IDF cache**: token-level inverse document frequency cached in Postgres for scoring

---

## Subscription Model

- Free tier with limits
- Premium tier (Stripe checkout) gates: paragraph recipe import, full meal planning, advanced shopping comparison
- Feature flags and A/B experiments via PostHog + custom `use-feature-flag` / `use-experiment` hooks

---

## Current Development State

- **Mature:** Auth (Clerk), billing (Stripe), recipe CRUD, shopping comparison, ingredient standardization pipeline
- **Recently active:** Canonical deduplication and consolidation (migrations as recent as March 2026), vector scoring refinements, mobile-specific UI updates
- **Infrastructure:** Fly.io for the Python API, Docker Compose for local worker orchestration, Supabase for all data
- **Testing:** Vitest unit/integration tests, Playwright e2e, dedicated test suites per layer
