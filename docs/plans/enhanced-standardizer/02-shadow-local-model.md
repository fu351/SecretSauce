## Phase 2 â€” Shadow Local Model
**Executor: Claude. Database access required.**

**Risk: Zero to production. Shadow results never written to DB.**

### Goal
Measure Qwen3-8B agreement against OpenAI output before any production traffic shifts. The observability baseline from Phase 0 provides the comparison substrate.

### Implementation

```ts
// backend/workers/ingredient-worker/processor.ts â€” inside resolveIngredientCandidates(),
// immediately after the primary batch-level LLM call.
//
// Important: shadowing mirrors the current batch shape. Do not call the shadow
// provider once per row, because that would distort latency, throughput, and
// failure-rate measurements compared with the real production path.

const shadowProvider = getShadowProvider()
if (shadowProvider && aiInputs.length > 0) {
  // Fire in parallel, never await in the resolution path.
  shadowProvider.standardizeIngredients(aiInputsWithHints, { context })
    .then(shadowResults => {
      const shadowById = new Map(shadowResults.map(result => [result.id, result]))
      for (const primaryResult of aiResults) {
        const input = inputById.get(primaryResult.id)
        const shadowResult = shadowById.get(primaryResult.id)
        if (!input) continue

        writeShadowComparison({
          inputKey: primaryResult.id,
          sourceName: input.name,
          primaryCanonical: primaryResult.canonicalName,
          shadowCanonical: shadowResult?.canonicalName,
          primaryConfidence: primaryResult.confidence,
          shadowConfidence: shadowResult?.confidence,
          primaryProvider: LLM_PROVIDER,
          shadowProvider: shadowProvider.name,
          primaryLatencyMs: Date.now() - llmStartedAt,
          // shadow latency tracked inside writeShadowComparison
          categoryAgreement: primaryResult.category === shadowResult?.category,
          canonicalAgreement: primaryResult.canonicalName === shadowResult?.canonicalName,
        })
      }
    })
    .catch(err => process.stderr.write(`[shadow] ${err.message}\n`))
}
```

### Shadow Comparison Table

```sql
-- supabase/migrations/0018_shadow_comparison.sql (or next available migration number)

create table ingredient_shadow_comparisons (
  id uuid primary key default gen_random_uuid(),
  queue_row_id uuid references ingredient_match_queue(id) on delete set null,
  input_key text,
  source_name text,
  primary_provider text not null,
  shadow_provider text not null,
  primary_canonical text,
  shadow_canonical text,
  primary_confidence numeric(5,4),
  shadow_confidence numeric(5,4),
  canonical_agreement boolean not null,
  category_agreement boolean not null,
  shadow_canonical_exists boolean,   -- whether shadow output exists in standardized_ingredients
  shadow_latency_ms integer,
  shadow_error text,
  created_at timestamptz not null default now()
);

create index on ingredient_shadow_comparisons (created_at desc);
create index on ingredient_shadow_comparisons (canonical_agreement, created_at desc);
```

### Promotion Criteria (Explicit â€” Fixes Previous Gap)

The shadow model is promoted to primary only when all of the following hold over a **minimum 500-item rolling window**:

| Metric | Threshold |
|---|---|
| Canonical name exact agreement | â‰¥ 85% |
| Category agreement | â‰¥ 92% |
| Shadow canonical exists in `standardized_ingredients` | â‰¥ 97% |
| Shadow JSON parse success rate | â‰¥ 99% |
| Shadow p95 latency | â‰¤ 30s (Qwen on Framework Desktop) |
| Shadow error rate | â‰¤ 2% |

Promotion happens by flipping `STANDARDIZER_PROVIDER=ollama` and keeping `STANDARDIZER_SHADOW_PROVIDER=openai` (roles swap â€” OpenAI becomes the validator). This ensures regression detection remains active post-promotion.

### Files Changed
- New: `backend/workers/standardizer-worker/shadow-writer.ts`, `supabase/migrations/0018_shadow_comparison.sql` (or next available migration number)
- Modified: `backend/workers/ingredient-worker/processor.ts` â€” add batch-shaped shadow call block after the primary LLM call

---

