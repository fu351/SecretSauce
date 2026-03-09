# Vector Matching Plan

## Agent Metadata

- `Doc Kind`: `migration-plan`
- `Canonicality`: `advisory`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-03-09`
- `Primary Surfaces`: `queue/worker/processor.ts`, `queue/embedding-worker/`, `lib/database/embedding-queue-db.ts`, `supabase/migrations/`, `public.fn_match_ingredient`
- `Update Trigger`: Matching architecture, embedding model, or queue worker flow changes.

## Agent Use

- `Read this when`: implementing vector-based ingredient matching or modifying the embedding pipeline.
- `Stop reading when`: changes are outside matching/embedding infrastructure.
- `Escalate to`: `docs/database-guide.md`, `docs/queue-processing.md`.

---

## Background

The current pipeline has two cost centers:

1. **`fn_match_ingredient`** — 6-pass SQL function using trigrams + `fn_word_weighted_similarity`. Runs at queue-insertion time to populate `best_fuzzy_match` / `fuzzy_score`. Surface-form only; cannot handle semantic equivalence (`"besan"` → `"chickpea flour"`, `"coriander"` → `"cilantro"`).

2. **LLM call in queue worker** — Every queue row that doesn't exact-match calls OpenAI to determine the canonical name. Dominant cost (latency + money).

3. **New canonical creation** — When the AI proposes a canonical that doesn't exist, it enters the risk-guard → probation → promotion pipeline. The system has no way to detect that the proposed name is semantically equivalent to an existing canonical. This causes vocabulary fragmentation over time.

Vectors address all three. Infrastructure already in place:
- pgvector 0.8.0 installed.
- `ingredient_embeddings` table and `upsertIngredientEmbedding` method exist.
- Embedding worker uses `text-embedding-3-small` (1536 dims).
- 1,330 ingredient embedding jobs queued and unprocessed.

---

## What Vectors Replace vs. Keep

### Matching

| Pass | Current | Vector plan |
|------|---------|-------------|
| 1 — Exact | `canonical_name = v_cleaned` | Keep as-is |
| 2 — Containment | `word_similarity >= 0.85` + IDF tiebreak | Replace with cosine NN |
| 3 — High fuzzy | `similarity >= 0.50` | Replace with cosine NN |
| 4 — Mid fuzzy tiebreak | `fn_word_weighted_similarity` on top-10 | Replace with cosine NN |
| 5 — Tail/substring | `position(canonical IN cleaned) near tail` | Keep as-is |
| 6 — Fallback | Best trigram score regardless | Keep as-is |

### Canonical Creation (the main win)

The current creation path calls the LLM with a product name and gets back a canonical name string. This string is then checked against `standardized_ingredients` by exact match only. Vectors change three things:

1. **LLM fast-path skip:** If cosine similarity ≥ `HIGH_CONFIDENCE` (0.93) against an existing canonical, resolve directly — no LLM call at all. ~60-70% of repeat product types qualify.

2. **Semantic deduplication before probation:** When the LLM *is* called and proposes a new canonical, run a vector search before writing to probation. If any existing canonical has cosine similarity ≥ `SEMANTIC_DEDUP_THRESHOLD` (0.92), the proposed name is a near-duplicate — remap to the existing one instead. This replaces the current `resolveBlockedNewCanonicalFallback` (which only tries tail-token slices) with genuine semantic lookup.

3. **LLM context augmentation:** When the LLM is called, include the top-3 vector neighbors as reference canonicals in the prompt. The model converges toward existing vocabulary rather than inventing novel names for familiar ingredients.

---

## Architecture Note: Query-Time Embedding

`fn_match_ingredient` is a SQL function — it cannot call the OpenAI API. Vector matching runs **application-side**, in the queue worker, at processing time (not insertion time). The existing `fn_match_ingredient` continues to run at insertion time as the trigram pre-filter for `best_fuzzy_match`.

New call site in `processor.ts` (before the LLM call):
```
cleaned product name
  → embed via OpenAI (text-embedding-3-small)
  → cosine search against ingredient_embeddings
  → similarity >= HIGH_CONFIDENCE  → resolve directly (no LLM)
  → similarity >= MID_CONFIDENCE   → pass top-3 candidates as LLM context
  → similarity < MID_CONFIDENCE    → LLM call with no vector hint
       ↓
  LLM returns proposed canonical
  → embed proposed canonical
  → cosine search against ingredient_embeddings
  → similarity >= SEMANTIC_DEDUP_THRESHOLD → remap to existing canonical
  → else → proceed to risk-guard → probation
```

---

## Semantic Ordering Policy (Implementation Detail)

This section defines exact ranking behavior so all workers order candidates the same way.

### Candidate retrieval

1. Embed the query text once per queue row.
2. Fetch top-`K` nearest neighbors from `ingredient_embeddings` (`K = 25` default).
3. Only consider rows where `ingredient_embeddings.model = EMBEDDING_OPENAI_MODEL`.
4. Drop candidates with cosine `< VECTOR_MIN_COSINE_FLOOR` (`0.75` default).

### Deterministic rerank score

For each candidate, compute:

```
semantic_score = cosine_similarity
head_bonus = +0.03 when query head noun == candidate head noun
lexical_bonus = +0.02 when trigram similarity(query, candidate) >= 0.60
category_penalty = -0.05 when categories are both non-null and unequal
form_penalty = -0.04 when protected form token conflicts (e.g. "powder" vs "paste")

final_score = semantic_score + head_bonus + lexical_bonus + category_penalty + form_penalty
```

Ordering:
1. `final_score DESC`
2. `cosine_similarity DESC`
3. `canonical_name ASC` (stable deterministic tie-break)

### Confidence bands and actions

- `final_score >= 0.93`: `vector_fast_path` (resolve without LLM).
- `0.80 <= final_score < 0.93`: include top-3 in LLM context (ordered by `final_score`).
- `< 0.80`: no vector-driven resolution; use LLM standard path.

### Dedup ordering for proposed canonicals

When LLM proposes a new canonical:

1. Embed proposed canonical.
2. Retrieve top-`K` and rerank with the same `final_score` formula.
3. If best candidate `final_score >= 0.92`, remap to that canonical before probation.
4. If below threshold, continue existing risk-guard and probation flow.

Using one shared ordering formula for both pre-LLM matching and post-LLM dedup prevents behavior drift.

### Safety fallback behavior

If embeddings are unavailable (provider/API/network/model mismatch):

1. Skip vector fast-path.
2. Continue existing trigram + LLM path unchanged.
3. Emit `vector_unavailable` metric and continue processing (no hard-fail of queue cycle).

### Observability for ordering quality

Track these counters per cycle:

- `vector_candidates_considered`
- `vector_fast_path_resolved`
- `vector_context_augmented`
- `vector_semantic_dedup_remap`
- `vector_low_confidence_fallback`
- `vector_ordering_conflict`

`vector_ordering_conflict` means top cosine candidate differs from top final-score candidate; monitor this during threshold tuning.

---

## Phase 1 — Populate `ingredient_embeddings`

**Migration:** `20260309000000_ensure_ingredient_embeddings.sql`
**Gate to next:** All canonical ingredients have a row in `ingredient_embeddings`.

1. Verify `ingredient_embeddings` schema: `(standardized_ingredient_id uuid PK, input_text text, embedding vector(1536), model text, updated_at timestamptz)`.
2. Backfill: ensure every row in `standardized_ingredients` has a pending or completed embedding queue entry.
3. Run the embedding worker (`sourceType: "ingredient"`) to clear the 1,330 pending jobs.
4. Add a DB trigger on `standardized_ingredients` INSERT: auto-enqueue new canonicals immediately on promotion so the cold-start window is bounded by one worker cycle (~5 min).

**Verification:** `SELECT COUNT(*) FROM ingredient_embeddings` matches `SELECT COUNT(*) FROM standardized_ingredients`.

---

## Phase 2 — Vector Search DB Function

**Migration:** `20260309010000_fn_match_ingredient_vector.sql`
**Gate to next:** Score-parity spot-checks pass; semantic deduplication confirmed on known near-duplicate pairs.

`fn_match_ingredient_vector(p_embedding vector(1536))` — accepts a pre-computed embedding, returns nearest candidates by cosine similarity. Worker applies rerank policy above.

```sql
CREATE OR REPLACE FUNCTION public.fn_match_ingredient_vector(
  p_embedding                  vector(1536),
  p_limit                      integer DEFAULT 25,
  p_model                      text DEFAULT 'text-embedding-3-small',
  p_high_confidence_threshold  numeric DEFAULT 0.93,
  p_mid_confidence_threshold   numeric DEFAULT 0.80
)
RETURNS TABLE (
  matched_id       uuid,
  matched_name     text,
  confidence       numeric,
  match_strategy   text,
  matched_category text,
  embedding_model  text
)
LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
AS $$
  SELECT
    si.id,
    si.canonical_name,
    (1 - (ie.embedding <=> p_embedding))::numeric,
    CASE
      WHEN (1 - (ie.embedding <=> p_embedding)) >= p_high_confidence_threshold THEN 'vector_high'
      WHEN (1 - (ie.embedding <=> p_embedding)) >= p_mid_confidence_threshold  THEN 'vector_mid'
      ELSE 'vector_low'
    END,
    si.category,
    ie.model
  FROM ingredient_embeddings ie
  JOIN standardized_ingredients si ON si.id = ie.standardized_ingredient_id
  WHERE ie.model = p_model
  ORDER BY ie.embedding <=> p_embedding
  LIMIT GREATEST(COALESCE(p_limit, 25), 1);
$$;
```

No index needed at 467 rows — sequential cosine scan is ~0.1ms. Add IVFFlat when vocabulary exceeds ~5,000 rows.

---

## Phase 3 — Wire Vector Match into Queue Worker

**Gate to next:** LLM call rate measurably reduced; no match-quality regression.

Three changes to `processor.ts`:

**3a. Fast-path skip before LLM:**
```typescript
const queryEmbedding = await embedText(searchTerm)
const vectorMatch = await vectorMatchIngredient(queryEmbedding)

if (vectorMatch?.confidence >= VECTOR_MATCH_HIGH_CONFIDENCE) {
  return {
    canonicalName: vectorMatch.canonicalName,
    confidence: vectorMatch.confidence,
    isFoodItem: true,
    source: 'vector_fast_path',
  }
}
```

**3b. Context augmentation for LLM calls:**
When the LLM is called, include top-3 vector neighbors in the prompt as candidate reference canonicals. The model is more likely to return an existing name rather than inventing a synonym.

**3c. Semantic deduplication after LLM:**
After the AI returns a proposed canonical that isn't in `standardized_ingredients`:
```typescript
// Before probation write: check if proposed name is a near-duplicate
const proposedEmbedding = await embedText(proposedCanonical)
const semanticMatch = await vectorMatchIngredient(proposedEmbedding)

if (semanticMatch?.confidence >= SEMANTIC_DEDUP_THRESHOLD) {
  // Remap to existing — avoids vocabulary fragmentation
  canonicalForWrite = semanticMatch.canonicalName
  existingCanonical = await standardizedIngredientsDB.findByCanonicalName(canonicalForWrite)
}
```

This replaces `resolveBlockedNewCanonicalFallback` (tail-token slicing) with genuine semantic lookup. The two can coexist during transition — run vector dedup first, fall back to tail-token if no embedding exists yet.

Key constants:
- `VECTOR_MATCH_HIGH_CONFIDENCE = 0.93` — conservative; tune down to 0.90 once false-positive rate is confirmed low.
- `SEMANTIC_DEDUP_THRESHOLD = 0.92` — slightly lower than match confidence; dedup should be aggressive.

Cache query embeddings per worker batch — the same product name appears in multiple queue rows.

---

## Phase 4 — Double-Check Candidate Discovery

**Gate:** Phase 3 stable in production.

Periodically scan for canonical pairs with high cosine similarity that have never been double-checked. These are likely `specific_to_generic` relationship candidates the double-check system hasn't seen yet:

```sql
SELECT a.canonical_name, b.canonical_name,
  1 - (ae.embedding <=> be.embedding) AS similarity
FROM ingredient_embeddings ae
JOIN ingredient_embeddings be ON ae.standardized_ingredient_id < be.standardized_ingredient_id
JOIN standardized_ingredients a ON a.id = ae.standardized_ingredient_id
JOIN standardized_ingredients b ON b.id = be.standardized_ingredient_id
WHERE (1 - (ae.embedding <=> be.embedding)) >= 0.88
  AND NOT EXISTS (
    SELECT 1 FROM canonical_double_check_daily_stats
    WHERE (source_canonical = a.canonical_name AND target_canonical = b.canonical_name)
       OR (source_canonical = b.canonical_name AND target_canonical = a.canonical_name)
  )
ORDER BY similarity DESC;
```

This surfaces pairs like `("organic milk", "milk")` or `("creamy peanut butter", "peanut butter")` that the queue hasn't naturally encountered yet, and feeds them into the double-check pipeline proactively.

---

## Phase 5 — Deprecate Trigram Passes 2-4

**Gate:** Phase 3 has run in production for ≥ 2 weeks with no regression in `canonical_double_check_daily_stats`.

Remove passes 2-4 from `fn_match_ingredient`. The function becomes: exact → tail/substring → fallback. `fn_word_weighted_similarity` exits the hot path.

---

## Sequencing Summary

| Phase | Deliverable | Gate |
|-------|-------------|------|
| 1 | `ingredient_embeddings` fully populated; auto-enqueue trigger on promotion | All canonicals embedded |
| 2 | `fn_match_ingredient_vector` DB function | Score-parity confirmed |
| 3 | Vector fast-path, LLM context augmentation, semantic dedup before probation | LLM call rate reduced; no regression |
| 4 | Vector-based double-check candidate discovery | Phase 3 stable |
| 5 | Trigram passes 2-4 removed from `fn_match_ingredient` | 2 weeks production stability |

---

## Open Questions

- **Embedding input text:** Should `input_text` be the bare canonical name (`"peanut butter"`) or include category (`"peanut butter [nut butter]"`)? Category-augmented text likely improves separation between near-identical names in different categories (e.g., `"sauce"` in condiments vs. stir-fry).
- **Model lock-in:** `text-embedding-3-small` vectors are not portable across model versions. `model` is already stored per row — re-queue all on model change.
- **Cold-start gap:** Between a canonical being promoted from probation and its embedding being computed, it's unreachable via the vector path. Trigram `best_fuzzy_match` covers this gap — acceptable.
- **Semantic dedup threshold calibration:** 0.92 is a starting estimate. Run the dedup query offline against the current vocabulary to check for false positives before enabling in production.
