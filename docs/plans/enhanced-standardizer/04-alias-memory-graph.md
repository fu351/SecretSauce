## Phase 4 â€” Alias Memory Graph
**Executor: Claude. Database access required.**

**Risk: Medium. Additive new table. No existing code changed beyond write-back.**

### Goal
Give the system persistent memory of past resolutions. Currently the only memory is `localQueueAICache` â€” an ephemeral per-process SQLite cache that resets on every worker restart. The alias graph survives restarts, accumulates across months, and becomes a high-confidence shortcut for names the system has seen before.

### Schema

```sql
-- supabase/migrations/0015_alias_graph.sql

create table ingredient_alias_edges (
  id uuid primary key default gen_random_uuid(),

  -- The normalized alias (output of fn_clean_product_name + further lowercasing)
  normalized_alias text not null,

  -- The canonical it has been resolved to
  canonical_id uuid not null references standardized_ingredients(id) on delete cascade,
  canonical_name text not null,   -- denormalized for fast reads without join

  -- Context sensitivity: same alias may resolve differently in recipe vs scraper
  context text,  -- null = context-agnostic

  -- Confidence tracking
  confidence numeric(5,4) not null default 0.50,
  accept_count integer not null default 0,
  reject_count integer not null default 0,

  -- Provenance
  source text not null check (source in (
    'llm_resolution',
    'vector_auto_resolution',
    'double_check_remap',
    'recipe_upload_human_label',
    'recipe_edit_human_label',
    'consolidation_merge',
    'manual_admin'
  )),

  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (normalized_alias, canonical_id, context)
);

-- Primary lookup: alias â†’ canonical for a given context
create index idx_iae_alias_context on ingredient_alias_edges
  (normalized_alias, context, confidence desc)
  where confidence >= 0.70;

-- Reverse: canonical â†’ all aliases (for consolidation merge rewriting)
create index idx_iae_canonical on ingredient_alias_edges (canonical_id);

-- High-confidence edges only (for fast auto-resolve path)
create index idx_iae_trusted on ingredient_alias_edges
  (normalized_alias)
  where confidence >= 0.85 and accept_count >= 3;
```

### Confidence Update Logic

The update formula addresses the cold-start problem and decay problem I flagged in the critique:

```ts
// lib/standardizer/alias-graph/update-confidence.ts

export function computeNewConfidence(edge: AliasEdge, accepted: boolean): number {
  const newAccept = edge.acceptCount + (accepted ? 1 : 0)
  const newReject = edge.rejectCount + (accepted ? 0 : 1)
  const totalObservations = newAccept + newReject

  // Cold start: weight toward 0.5 when few observations
  const observationWeight = Math.min(totalObservations / 10, 1.0)
  const acceptRate = newAccept / totalObservations

  // Bayesian-inspired blend: low observations â†’ stay near prior (0.5)
  const rawEstimate = (1 - observationWeight) * 0.5 + observationWeight * acceptRate

  // Momentum: don't change too fast
  const momentum = 0.3
  const blended = (1 - momentum) * rawEstimate + momentum * edge.confidence

  // Hard floor/ceiling to prevent irreversible good/bad edges
  return Math.max(0.05, Math.min(0.97, blended))
}
```

Key properties:
- A new edge with 1 acceptance gets confidence â‰ˆ 0.55 (barely above prior, not trusted yet)
- An edge with 5 acceptances and 0 rejections gets confidence â‰ˆ 0.82
- An edge with 10 acceptances and 0 rejections gets confidence â‰ˆ 0.90
- A 5/5 accept/reject edge stays near 0.50 (ambiguous, never auto-resolves)
- A bad edge (10 rejects) decays to â‰ˆ 0.15 (floor prevents zero)

### Write-Back After Resolution

```ts
// lib/standardizer/alias-graph/write-alias-edge.ts

export async function writeAliasEdge(params: {
  normalizedAlias: string
  canonicalId: string
  canonicalName: string
  context: string
  source: AliasEdgeSource
  accepted: boolean
  losers?: string[]    // other canonicals that lost â€” receive reject_count increment
}): Promise<void> {
  // Upsert the winning edge
  await supabase.rpc('upsert_alias_edge', {
    p_normalized_alias: params.normalizedAlias,
    p_canonical_id: params.canonicalId,
    p_canonical_name: params.canonicalName,
    p_context: params.context,
    p_source: params.source,
    p_accepted: params.accepted,
  })

  // Increment reject_count on all candidates that lost
  // This is what makes the graph actually learn from non-selections
  if (params.losers?.length) {
    await supabase.rpc('increment_alias_rejections', {
      p_normalized_alias: params.normalizedAlias,
      p_loser_names: params.losers,
      p_context: params.context,
    })
  }
}
```

This is called at the end of `processor.ts` after `markResolved()`, for every resolution â€” not just LLM resolutions. Vector auto-resolves write edges too. This is how the cache builds up for common names without ever hitting the LLM.

### Generator 4: AliasGraphGenerator

```ts
// lib/standardizer/candidates/alias-graph-generator.ts

export class AliasGraphGenerator implements CandidateGenerator {
  readonly source = 'alias_graph' as const

  async generate(input: CandidateInput): Promise<Candidate[]> {
    // Only look up trusted edges (confidence >= 0.70, at least 3 accepts)
    const edges = await supabase
      .from('ingredient_alias_edges')
      .select('canonical_id, canonical_name, confidence, accept_count, reject_count')
      .eq('normalized_alias', input.cleanedName.toLowerCase())
      .or(`context.eq.${input.context},context.is.null`)
      .gte('confidence', 0.70)
      .gte('accept_count', 3)
      .order('confidence', { ascending: false })
      .limit(5)

    return (edges.data ?? []).map(e => ({
      canonicalId: e.canonical_id,
      canonicalName: e.canonical_name,
      sources: ['alias_graph'],
      scores: {
        aliasGraph: e.confidence,
        historicalAcceptRate: e.accept_count / (e.accept_count + e.reject_count),
      },
      features: {
        headNounMatch: false,
        categoryMatch: true,
        formMatch: false,
        contextMatch: true,
        wordRatio: 1.0,  // exact alias match
      }
    }))
  }
}
```

### Integration With Consolidation Pipeline

This is the critical integration that the original architecture doc mentioned but didn't specify: when `fn_consolidate_canonical` merges a loser into a survivor, all alias edges pointing to the loser must be rewritten to point to the survivor.

```sql
-- Added to fn_consolidate_canonical execution:

update ingredient_alias_edges
set
  canonical_id = p_survivor_id,
  canonical_name = (select canonical_name from standardized_ingredients where id = p_survivor_id),
  updated_at = now()
where canonical_id = p_loser_id;
```

This is a one-liner added to the consolidation function. It prevents the alias graph from accumulating dead edges pointing to merged-away canonicals.

### Files Changed
- New: `lib/standardizer/alias-graph/` (update-confidence, write-alias-edge, rpc wrappers)
- New: `lib/standardizer/candidates/alias-graph-generator.ts`
- New: `supabase/migrations/0015_alias_graph.sql`
- Modified: `queue/worker/processor.ts` â€” add `writeAliasEdge()` call after `markResolved()`
- Modified: SQL `fn_consolidate_canonical` â€” add alias rewrite step

### Phase 4 Exit Criteria
- After 14 days: what % of resolutions are hitting trusted alias edges (`confidence >= 0.85, accept_count >= 5`)?
- Target: â‰¥ 15% of total resolutions served from alias cache within 30 days
- Zero regression in double-check remap rate

---

