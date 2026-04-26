## Phase 8 â€” Staged LLM Reduction Gates
**Executor: Claude. Database access required.**

**Risk: High if rushed. Safe if thresholds are from calibration data only.**

### Goal
Formalize the resolution decision tree so LLM calls are only made when all deterministic paths have failed. Each gate is independently measurable. LLM-free rate is the primary KPI.

### The Gate Tree

```ts
// queue/worker/processor.ts â€” the full resolution decision tree (Phase 8 final state)

async function resolveItem(row: QueueRow, obs: ResolutionObserver): Promise<void> {

  // â”€â”€ Gate 0: Known non-food â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isKnownNonFood(row)) {
    return resolveAs('resolved_non_food_skip', obs, row)
  }

  // â”€â”€ Gate 1: SQLite cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const cached = await localQueueAICache.getMany([cacheKey])
  if (cached[cacheKey]) {
    obs.recordCacheCheck(true, cached[cacheKey].canonicalName)
    return resolveAs('resolved_from_cache', obs, row, cached[cacheKey])
  }
  obs.recordCacheCheck(false)

  // â”€â”€ Gate 2: Non-food keyword â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (likelyNonFoodByKeyword(row.cleaned_name)) {
    return resolveAs('resolved_non_food_keyword', obs, row)
  }

  // â”€â”€ Gate 3: Trusted alias edge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // High confidence (>= 0.85) + sufficient observations (>= 5 accepts)
  const trustedEdge = await getTrustedAliasEdge(row.cleaned_name, row.source)
  if (trustedEdge) {
    obs.recordAliasHit(trustedEdge)
    return resolveAs('resolved_alias_trusted', obs, row, trustedEdge)
  }

  // â”€â”€ Gate 4: Candidate generation + reranking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { candidates, hintNames } = await resolveIngredientCandidates(
    row.cleaned_name, row.source, obs
  )
  const ranked = rerankCandidates(candidates, { cleanedName: row.cleaned_name, context: row.source })
  const top = ranked[0]

  // â”€â”€ Gate 5: Reranker auto-resolve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Subsumes the old vector fast-path (score >= 0.93). Vector confidence
  // flows through the 0.30 vector weight, so any candidate that would have
  // passed the raw threshold will score highly here and is caught first.
  // The separate gate is removed to avoid two auto-resolve paths with
  // diverging calibration lineages.
  if (top?.mergedScore >= RERANKER_THRESHOLDS.autoResolve) {
    return resolveAs('resolved_reranker_auto', obs, row, top)
  }

  // â”€â”€ Gate 6: Deterministic builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const built = await buildCanonicalName(row.cleaned_name, row.source, rules)
  if (built.matchedExistingCanonical && built.confidence >= BUILDER_THRESHOLDS.autoResolve) {
    return resolveAs('resolved_deterministic', obs, row, {
      canonicalId: built.matchedCanonicalId!,
      canonicalName: built.canonicalName,
    })
  }

  // â”€â”€ Gate 7: LLM fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Inject: top reranked hints + deterministic builder suggestion
  const enrichedHints = built.matchedExistingCanonical
    ? [built.canonicalName, ...hintNames.filter(h => h !== built.canonicalName)]
    : hintNames

  const llmResult = await getActiveProvider().standardizeIngredients([row], {
    context: row.source,
    hintCandidates: enrichedHints.slice(0, 20),
  })

  // ... post-LLM processing unchanged (double-check, form/variety retention, etc.)
}
```

### Staged Rollout Plan

| Stage | Condition to Advance | Expected LLM-Free Rate |
|---|---|---|
| Baseline (current) | â€” | ~0% non-LLM (on queue misses) |
| After Phase 4 (alias cache) | 14-day alias graph built | ~15â€“25% |
| After Phase 6 (deterministic) | Builder precision â‰¥ 90% in calibration | ~35â€“50% |
| After Phase 7 (reranker, conservative threshold) | Reranker precision â‰¥ 95% at threshold | ~55â€“70% |
| Phase 7 threshold loosened | Calibration shows safe to loosen | ~70â€“85% |
| Phase 7 threshold loosened again | Second calibration round | ~85â€“95% |

Each advance requires the calibration query to show threshold precision â‰¥ 95% before the threshold change merges.

---

