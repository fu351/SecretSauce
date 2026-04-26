## Phase 3 â€” Unified Candidate Layer
**Risk: Medium. Replaces `resolveIngredientCandidates()` internals. Existing output contract preserved.**

### Goal
The current code has one resolution gate before candidate generation (`localQueueAICache`) and two vector candidate paths after cache miss: `resolveVectorMatch()` for high-confidence auto-resolve and `resolveVectorCandidates()` for LLM hint injection. The cache remains a resolution gate, not a candidate source.

Phase 3 introduces a unified candidate interface for post-cache matching. It wraps the existing vector paths and adds two new candidate generators (fuzzy log-IDF and MinHash). The LLM call and all post-processing remain unchanged for now.

### The Candidate Interface

```ts
// backend/workers/ingredient-worker/candidates/types.ts

export interface Candidate {
  canonicalId: string
  canonicalName: string
  category?: string
  sources: CandidateSource[]   // which generators produced this
  scores: {
    vector?: number             // from resolveVectorMatch/resolveVectorCandidates
    fuzzyLogIdf?: number        // new: Phase 3
    minhash?: number            // new: Phase 3
    aliasGraph?: number         // new: Phase 4
    historicalAcceptRate?: number  // new: Phase 4
  }
  features: {
    headNounMatch: boolean
    categoryMatch: boolean
    formMatch: boolean
    contextMatch: boolean
    wordRatio: number
  }
  mergedScore?: number          // set by reranker in Phase 7
}

export type CandidateSource =
  | 'vector_hnsw'
  | 'fuzzy_log_idf'
  | 'minhash_jaccard'
  | 'alias_graph'
  | 'learned_token_links'

export interface CandidateGenerator {
  readonly source: CandidateSource
  generate(input: CandidateInput): Promise<Candidate[]>
}

export interface CandidateInput {
  cleanedName: string
  context: 'scraper' | 'recipe' | 'pantry'
  topK: number
}
```

### Generator 1: VectorHNSWGenerator (wraps existing code)

```ts
// backend/workers/ingredient-worker/candidates/vector-hnsw-generator.ts

export class VectorHNSWGenerator implements CandidateGenerator {
  readonly source = 'vector_hnsw' as const

  async generate(input: CandidateInput): Promise<Candidate[]> {
    // Calls existing resolveVectorCandidates() with the current embedding model.
    // The high-confidence resolveVectorMatch() path is represented as a vector
    // candidate too, but cache hits remain outside this layer.
    const raw = await resolveVectorCandidates(input.cleanedName, getEmbeddingModel(), input.topK)
    return raw.map((r, i) => ({
      canonicalId: r.matchedId,
      canonicalName: r.matchedName,
      category: r.matchedCategory ?? undefined,
      sources: ['vector_hnsw'],
      scores: { vector: r.finalScore },
      features: {
        headNounMatch: r.headBonus > 0,
        categoryMatch: r.categoryPenalty === 0,
        formMatch: r.formPenalty === 0,
        contextMatch: true,
        wordRatio: 0,
      }
    }))
  }
}
```

### Generator 2: FuzzyLogIdfGenerator

This is a new TypeScript implementation of log-IDF weighted trigram scoring against `standardized_ingredients`. It can use the existing `search_vector` (tsvector) column, but it must not assume an existing SQL token-IDF cache table. The current repo has TypeScript token-IDF scoring in `backend/workers/ingredient-worker/canonical/token-idf.ts`; a database-backed `ingredient_token_idf_cache` table is a new prerequisite if this SQL function is used.

> **Phase 3 DB prerequisite note:** before implementing fuzzy log-IDF or MinHash matching, add and verify the database primitives they depend on: `pg_trgm` support/indexes, a real `ingredient_token_idf_cache` table or an alternative scorer that does not require it, the MinHash signatures table, and a refresh/backfill script. This prerequisite should be tracked explicitly so Phase 3 does not quietly depend on tables that are not present in the current architecture.

```ts
// backend/workers/ingredient-worker/candidates/fuzzy-log-idf-generator.ts

export class FuzzyLogIdfGenerator implements CandidateGenerator {
  readonly source = 'fuzzy_log_idf' as const

  async generate(input: CandidateInput): Promise<Candidate[]> {
    // SQL: use pg_trgm similarity + weighted token match against standardized_ingredients.
    // Requires the Phase 3 DB prerequisite above if using ingredient_token_idf_cache.
    const results = await supabase.rpc('fn_match_ingredient_fuzzy_idf', {
      p_query: input.cleanedName,
      p_top_k: input.topK,
      p_context: input.context,
    })
    return results.data?.map(r => ({
      canonicalId: r.id,
      canonicalName: r.canonical_name,
      category: r.category,
      sources: ['fuzzy_log_idf'],
      scores: { fuzzyLogIdf: r.score },
      features: {
        headNounMatch: r.head_noun_match,
        categoryMatch: true,
        formMatch: r.form_match,
        contextMatch: true,
        wordRatio: r.word_ratio,
      }
    })) ?? []
  }
}
```

The corresponding SQL function:

```sql
-- supabase/migrations/0014_fuzzy_idf_match.sql

create or replace function fn_match_ingredient_fuzzy_idf(
  p_query text,
  p_top_k int default 10,
  p_context text default 'scraper'
)
returns table (
  id uuid,
  canonical_name text,
  category text,
  score numeric,
  head_noun_match boolean,
  form_match boolean,
  word_ratio numeric
)
language sql stable
as $$
  with query_tokens as (
    select unnest(string_to_array(
      regexp_replace(lower(p_query), '[^a-z0-9 ]', '', 'g'), ' '
    )) as token
  ),
  idf_weights as (
    -- Requires a new database-backed token IDF cache or an equivalent scorer.
    select token, idf_weight
    from ingredient_token_idf_cache
    where token in (select token from query_tokens)
  ),
  candidates as (
    select
      si.id,
      si.canonical_name,
      si.category::text,
      similarity(si.canonical_name, p_query) as trgm_sim,
      coalesce(sum(iw.idf_weight), 0) as idf_score,
      -- word ratio: overlapping words / max(word count)
      (
        select count(*) from query_tokens qt
        where si.canonical_name ilike '%' || qt.token || '%'
      )::numeric /
      greatest(
        array_length(string_to_array(si.canonical_name, ' '), 1),
        array_length(string_to_array(p_query, ' '), 1)
      ) as word_ratio
    from standardized_ingredients si
    left join idf_weights iw on si.canonical_name ilike '%' || iw.token || '%'
    where si.canonical_name % p_query  -- trigram index gate
       or si.search_vector @@ plainto_tsquery(p_query)
    group by si.id, si.canonical_name, si.category
  )
  select
    id,
    canonical_name,
    category,
    (0.5 * trgm_sim + 0.3 * idf_score + 0.2 * word_ratio)::numeric as score,
    -- head noun: first token of canonical matches first token of query
    split_part(canonical_name, ' ', 1) = split_part(p_query, ' ', 1) as head_noun_match,
    -- form match: detect paste/sauce/oil/vinegar/powder etc.
    canonical_name ~* '\m(paste|sauce|oil|vinegar|powder|flour|soup|broth|stock)\M'
      and p_query ~* '\m(paste|sauce|oil|vinegar|powder|flour|soup|broth|stock)\M' as form_match,
    word_ratio
  from candidates
  order by score desc
  limit p_top_k;
$$;
```

### Generator 3: MinHashJaccardGenerator

MinHash is computed over character 3-grams of the cleaned name and compared against a precomputed MinHash table for all canonicals. This catches misspellings and transliterations that neither trigram nor embedding handles well (e.g. "chikpea" â†’ "chickpea").

```sql
-- supabase/migrations/0014_fuzzy_idf_match.sql (continued)

-- Precomputed MinHash signatures for all canonicals
-- Updated nightly by scripts/update-minhash-signatures.ts
create table ingredient_minhash_signatures (
  canonical_id uuid primary key references standardized_ingredients(id) on delete cascade,
  signature integer[] not null,   -- 128-band MinHash
  updated_at timestamptz not null default now()
);

create or replace function fn_match_ingredient_minhash(
  p_signature integer[],
  p_top_k int default 10
)
returns table (id uuid, canonical_name text, jaccard_estimate numeric)
language sql stable
as $$
  select
    s.canonical_id as id,
    si.canonical_name,
    -- Jaccard estimate: fraction of bands that agree
    (
      select count(*)::numeric
      from generate_subscripts(p_signature, 1) i
      where p_signature[i] = s.signature[i]
    ) / array_length(p_signature, 1) as jaccard_estimate
  from ingredient_minhash_signatures s
  join standardized_ingredients si on si.id = s.canonical_id
  order by jaccard_estimate desc
  limit p_top_k;
$$;
```

```ts
// backend/workers/ingredient-worker/candidates/minhash-generator.ts

import { computeMinHash } from '../minhash/compute'  // pure TS, no deps

export class MinHashJaccardGenerator implements CandidateGenerator {
  readonly source = 'minhash_jaccard' as const

  async generate(input: CandidateInput): Promise<Candidate[]> {
    const sig = computeMinHash(input.cleanedName, { bands: 128, kgram: 3 })
    const results = await supabase.rpc('fn_match_ingredient_minhash', {
      p_signature: sig,
      p_top_k: input.topK,
    })
    return results.data?.map(r => ({
      canonicalId: r.id,
      canonicalName: r.canonical_name,
      sources: ['minhash_jaccard'],
      scores: { minhash: r.jaccard_estimate },
      features: {
        headNounMatch: false,  // not computed at MinHash stage
        categoryMatch: true,
        formMatch: false,
        contextMatch: true,
        wordRatio: 0,
      }
    })) ?? []
  }
}
```

### Candidate Deduplication and Union

```ts
// backend/workers/ingredient-worker/candidates/union.ts

export function unionCandidates(
  ...batches: Candidate[][]
): Candidate[] {
  const map = new Map<string, Candidate>()

  for (const batch of batches) {
    for (const c of batch) {
      const existing = map.get(c.canonicalId)
      if (!existing) {
        map.set(c.canonicalId, { ...c })
      } else {
        // Merge: union sources, take best score per dimension
        existing.sources = [...new Set([...existing.sources, ...c.sources])]
        existing.scores = {
          vector: Math.max(existing.scores.vector ?? 0, c.scores.vector ?? 0) || undefined,
          fuzzyLogIdf: Math.max(existing.scores.fuzzyLogIdf ?? 0, c.scores.fuzzyLogIdf ?? 0) || undefined,
          minhash: Math.max(existing.scores.minhash ?? 0, c.scores.minhash ?? 0) || undefined,
          aliasGraph: Math.max(existing.scores.aliasGraph ?? 0, c.scores.aliasGraph ?? 0) || undefined,
        }
        // Keep best features
        existing.features.headNounMatch ||= c.features.headNounMatch
        existing.features.wordRatio = Math.max(existing.features.wordRatio, c.features.wordRatio)
      }
    }
  }

  return Array.from(map.values())
}
```

### Integration Into `processor.ts`

Phase 3 refactors the candidate-generation portion of `resolveIngredientCandidates()` in `backend/workers/ingredient-worker/processor.ts`. The local cache remains before this layer, the vector fast-path remains in the resolver, and the LLM call plus post-processing remain unchanged.

```ts
// backend/workers/ingredient-worker/resolve-ingredient-candidates.ts
// or an extracted helper called by processor.ts

export async function resolveIngredientCandidates(
  cleanedName: string,
  context: 'scraper' | 'recipe' | 'pantry',
  obs: ResolutionObserver
): Promise<{ candidates: Candidate[], hintNames: string[] }> {

  const input: CandidateInput = { cleanedName, context, topK: 15 }

  // Run all generators in parallel
  const [vectorCandidates, fuzzyIdfCandidates, minhashCandidates] = await Promise.all([
    new VectorHNSWGenerator().generate(input),
    new FuzzyLogIdfGenerator().generate(input),
    new MinHashJaccardGenerator().generate(input),
  ])

  const candidates = unionCandidates(
    vectorCandidates,
    fuzzyIdfCandidates,
    minhashCandidates
  )

  // Record in observer
  obs.recordCandidates(candidates)

  // Build hint list for LLM â€” top 20 by best available score
  const sorted = candidates.sort((a, b) =>
    Math.max(b.scores.vector ?? 0, b.scores.fuzzyLogIdf ?? 0, b.scores.minhash ?? 0) -
    Math.max(a.scores.vector ?? 0, a.scores.fuzzyLogIdf ?? 0, a.scores.minhash ?? 0)
  )
  const hintNames = sorted.slice(0, 20).map(c => c.canonicalName)

  return { candidates, hintNames }
}
```

The vector fast-path at `â‰¥ 0.93` stays exactly where it is in `backend/workers/ingredient-worker/processor.ts`. Phase 3 only affects the post-cache candidate pool fed to the LLM hints.

### New Scripts
- `scripts/update-minhash-signatures.ts` â€” nightly, recomputes MinHash for all 467 canonicals (and any new ones). Runs in <1 minute at this scale.

### Files Changed
- New: `backend/workers/ingredient-worker/candidates/` (types, generators, union)
- New: `backend/workers/ingredient-worker/minhash/compute.ts`
- New: `supabase/migrations/0019_fuzzy_idf_match.sql` (or next available migration number)
- New: `backend/scripts/update-minhash-signatures.ts`
- Modified: `backend/workers/ingredient-worker/processor.ts` â€” extract/update candidate-generation internals while preserving the resolver behavior around cache, vector fast-path, LLM, and post-processing

### Phase 3 Exit Criteria (from observability data)
- Union candidate pool recall: LLM's final canonical appears in the unified pool â‰¥ 5 percentage points more often than current vector-only pool
- No regression in double-check remap rate
- p95 candidate generation latency â‰¤ 800ms (generators run in parallel)

---

