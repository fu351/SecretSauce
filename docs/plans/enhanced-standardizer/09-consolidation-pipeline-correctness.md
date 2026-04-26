## Phase 9 â€” Consolidation Pipeline Correctness
**Executor: Claude. Database access required.**

**Risk: Medium. Data integrity. Run on staging with dry-run first.**

This phase runs in parallel with Phases 1â€“2 and is independent of the hot path. It fixes the bugs in `fn_consolidate_canonical` before the alias graph (Phase 4) becomes authoritative â€” because once alias edges exist, a broken consolidation will corrupt them.

### Pre-Run Safety Check

Before running the consolidation worker against production (even in dry-run), the worker should query `canonical_double_check_daily_stats` and the queue health snapshots to establish whether any merges are actively in flight or recently changed outcomes. If the stats show unusual remap rates or elevated double-check overrides, hold until the cause is understood.

When running the first live consolidation cycle, use a **high converging threshold** (e.g. cosine similarity >= 0.97 rather than the long-term target) to restrict merges to near-certain duplicates only. This limits blast radius while the three fixes (embedding merge, stats rewrite, shared executor) are validated against real data. The threshold can be relaxed incrementally once no regressions appear in the stats tables over a 48-hour window.

### Fix 1: Shared Merge Executor

Both `runCycle` and `processIntents` call the same `executeMergeIntent()` function:

```ts
// lib/consolidation/execute-merge-intent.ts

export async function executeMergeIntent(
  intent: ConsolidationIntent,
  options: { dryRun: boolean }
): Promise<MergeResult> {
  // 1. Guard checks (shared between runCycle and processIntents)
  const guardResult = await runGuardChecks(intent)
  if (!guardResult.passed && !intent.bypassGuards) {
    return { status: 'blocked', reason: guardResult.reason }
  }

  if (options.dryRun) {
    return { status: 'dry_run', wouldMerge: intent.loserId, into: intent.survivorId }
  }

  // 2. Per-model embedding merge (Fix 2)
  await mergeEmbeddingsPerModel(intent.loserId, intent.survivorId)

  // 3. Stats rewrite instead of delete (Fix 3)
  await rewriteStatsLoserToSurvivor(intent.loserId, intent.survivorId)

  // 4. Alias edge rewrite (Phase 4 integration)
  await supabase.from('ingredient_alias_edges')
    .update({ canonical_id: intent.survivorId })
    .eq('canonical_id', intent.loserId)

  // 5. Core merge (existing fn_consolidate_canonical)
  await supabase.rpc('fn_consolidate_canonical', {
    p_loser_id: intent.loserId,
    p_survivor_id: intent.survivorId,
  })

  return { status: 'merged' }
}
```

### Fix 2: Per-Model Embedding Merge

```ts
// lib/consolidation/merge-embeddings-per-model.ts

export async function mergeEmbeddingsPerModel(
  loserId: string,
  survivorId: string
): Promise<void> {
  const loserEmbeddings = await supabase
    .from('ingredient_embeddings')
    .select('*')
    .eq('ingredient_id', loserId)

  for (const embedding of (loserEmbeddings.data ?? [])) {
    const survivorHasModel = await supabase
      .from('ingredient_embeddings')
      .select('id')
      .eq('ingredient_id', survivorId)
      .eq('model', embedding.model)
      .single()

    if (!survivorHasModel.data) {
      // Survivor lacks this model's embedding â€” transfer it
      await supabase.from('ingredient_embeddings')
        .update({ ingredient_id: survivorId })
        .eq('id', embedding.id)
    } else {
      // Survivor already has this model â€” delete loser's duplicate
      await supabase.from('ingredient_embeddings')
        .delete()
        .eq('id', embedding.id)
    }
  }
}
```

### Fix 3: Stats Rewrite Instead of Delete

```sql
-- Instead of: DELETE FROM canonical_double_check_daily_stats WHERE canonical_id = loser_id
-- Do this:

create or replace function rewrite_consolidation_stats(
  p_loser_id uuid,
  p_survivor_id uuid
)
returns void language plpgsql as $$
begin
  -- Merge stats: add loser counts to survivor, then delete duplicates
  insert into canonical_double_check_daily_stats (
    canonical_id, stat_date, decision, event_count
  )
  select
    p_survivor_id,
    stat_date,
    decision,
    event_count
  from canonical_double_check_daily_stats
  where canonical_id = p_loser_id
  on conflict (canonical_id, stat_date, decision)
  do update set
    event_count = canonical_double_check_daily_stats.event_count
                + excluded.event_count,
    updated_at = now();

  -- Archive the merge fact
  insert into canonical_consolidation_log (
    loser_id, survivor_id, merged_at, stats_rewritten
  ) values (p_loser_id, p_survivor_id, now(), true);

  -- Now safe to delete the loser's rows (counts transferred)
  delete from canonical_double_check_daily_stats
  where canonical_id = p_loser_id;
end;
$$;
```

### Fix 4: Rename `forcedReason`

After auditing all call sites:

```ts
// Before: executeMergeIntent(intent, { forcedReason: 'cluster_planning' })
// After:
export interface ConsolidationIntent {
  loserId: string
  survivorId: string
  proposalReason: string        // why this merge was proposed
  bypassGuards: boolean         // default: false
}
```

Every call site that passed `forcedReason` gets audited to determine whether it genuinely needed to bypass guards or was just misnamed. Expected finding: most were just providing a label, not actually bypassing.

### Fix 5: Unified Survivor Scoring

```ts
// lib/consolidation/select-representative.ts

export function selectCanonicalRepresentative(
  cluster: CanonicalClusterMember[]
): CanonicalClusterMember {
  const scored = cluster.map(m => ({
    ...m,
    representativeScore:
      0.30 * m.productWeight +
      0.25 * m.avgSimilarityToCluster +
      0.20 * m.tokenPurity +
      0.10 * m.canonicalNameQuality +
      0.10 * m.embeddingAvailability +
      0.05 * m.shorterNameScore -
      m.overSpecificityPenalty
  }))
  return scored.sort((a, b) => b.representativeScore - a.representativeScore)[0]
}
```

Used by: medoid worker, cluster merge target selection, pairwise survivor selection. One function, consistent behavior everywhere.

---

