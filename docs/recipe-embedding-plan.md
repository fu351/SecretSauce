# Recipe Free-Form Ingestion (UI Feedback + Regex Extraction + Instruction Queue)

## Agent Metadata

- `Doc Kind`: `design-plan`
- `Canonicality`: `advisory`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-20`
- `Primary Surfaces`: `app/api/*`, `components/*`, `lib/ingredient-parser.ts`, `lib/database/ingredient-match-queue-db.ts`, `supabase/migrations/*`

## Objective

Implement a UI-first free-form ingest flow:

1. User clicks `Process` on paragraph input.
2. Backend runs regex handling on full paragraphs.
3. Backend returns extracted results:
   - standardized ingredient
   - quantity
   - unit
4. UI shows a `Registered Ingredients` feedback section.
5. Full paragraphs are also pushed to a new queue for instruction parsing.

## Scope

In scope:

- `Process` button workflow from UI to backend.
- Regex candidate detection and ingredient isolation on backend.
- Fuzzy match only after ingredient text isolation.
- Response contract for standardized ingredient + quantity + unit.
- New instruction-parse queue for full paragraph text.
- Feedback capture for registered ingredient rows.

Out of scope (initial version):

- Embedding/cosine retrieval.
- Replacing existing line-item recipe ingest.
- Multi-language parsing.

## UI Requirements

### 1) Input + Process

- Free-form paragraph input area.
- `Process` button sends paragraph payload to backend endpoint.
- Show loading state while backend extraction runs.

### 2) Registered Ingredients Section

After process completes, render a `Registered Ingredients` section with one row per result:

- `original_phrase`
- `standardized_ingredient_name`
- `quantity`
- `unit`
- optional confidence/status badge

Feedback actions per row:

- `Confirm`
- `Edit`
- `Reject`

Feedback should post back to backend for quality tuning and audit.

## Backend Processing Contract

### Process Endpoint (sync response)

`POST /api/ingredients/parse` (or dedicated free-form route)

Input:

- `paragraph_text`
- optional `recipe_id`
- optional `user_id`

Backend steps:

1. Split paragraph into chunks (sentence/comma heuristics).
2. Run regex parsing to find candidate ingredient phrases using the rows from `standardized_ingredients`.
3. Extract quantity + unit.
4. Isolate ingredient text.
5. Return for user
6. Enqueue full paragraph to instruction-parse queue.

Output:

- `registered_ingredients[]` with standardized ingredient + quantity + unit
- `instruction_queue_job_id`
- extraction summary counts (parsed/ambiguous/rejected)

## Instruction Parsing Queue (New)

Purpose:

- asynchronously parse non-ingredient instruction structure from full paragraph text
- decouple instruction parsing latency from ingredient extraction UX

Table: `public.recipe_instruction_parse_queue`

- `id uuid PK`
- `job_id uuid NOT NULL`
- `recipe_id uuid NULL`
- `user_id uuid NULL`
- `paragraph_text text NOT NULL`
- `status text NOT NULL default 'pending'` (`pending|processing|resolved|failed`)
- `attempt_count integer NOT NULL default 0`
- `processing_started_at timestamptz NULL`
- `processing_lease_expires_at timestamptz NULL`
- `last_error text NULL`
- `parsed_instructions jsonb NULL`
- `resolved_at timestamptz NULL`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- claim window: `(status, processing_lease_expires_at, created_at)`
- job lookup: `(job_id)`

RPCs:

- `claim_recipe_instruction_parse_queue(p_limit, p_resolver, p_lease_seconds)`
- `requeue_expired_recipe_instruction_parse_queue(p_limit, p_error)`

## Ingredient Fallback Queue Integration

If extraction/fuzzy confidence is low, forward rows to existing `ingredient_match_queue` with:

- `source='recipe'`
- `ingest_mode='free_form'`
- `raw_product_name`/`cleaned_name` context from isolated text

This preserves the existing review/resolution safety path.

## End-to-End Flow

1. User enters paragraph and clicks `Process`.
2. Backend runs regex extraction + fuzzy match and returns `registered_ingredients`.
3. UI displays `Registered Ingredients` and collects feedback.
4. Backend enqueues full paragraph into `recipe_instruction_parse_queue`.
5. Async worker claims paragraph jobs and parses instructions.
6. Any ambiguous ingredient rows flow to `ingredient_match_queue`.

## Observability

Track:

- process request latency (p50/p95)
- ingredient extraction success rate
- fuzzy confidence distribution
- feedback outcomes (`confirm/edit/reject`)
- instruction queue depth, lag, and failure rate

## Risks and Mitigations

- Regex over-capture:
  - enforce token boundaries and overlap resolution.
- Regex under-capture:
  - expand targeted patterns; use feedback loop to patch misses.
- Slow process response:
  - keep instruction parsing async in queue; only return ingredient extraction sync.
- Queue backlog:
  - lease expiry + requeue RPC + bounded worker concurrency.

## Open Questions

1. Should `Process` return only high-confidence rows, or include ambiguous rows with warnings?
2. Is user feedback required before writing parsed ingredient rows to `recipe_ingredients`?
3. Should instruction parsing start immediately on enqueue or in periodic batches?
4. Do we need a separate feedback table, or attach feedback to queue/result rows?

## Implementation Checklist

- [ ] Add UI `Process` trigger and loading/error states.
- [ ] Add `Registered Ingredients` feedback section in UI.
- [ ] Implement backend regex extraction + fuzzy matching response contract.
- [ ] Add migration for `recipe_instruction_parse_queue`.
- [ ] Add claim/requeue RPCs for instruction queue.
- [ ] Enqueue full paragraph text on each process call.
- [ ] Wire low-confidence ingredient rows to `ingredient_match_queue`.
- [ ] Add feedback persistence endpoint and metrics.
- [ ] Add integration tests for process response + instruction queue enqueue.
