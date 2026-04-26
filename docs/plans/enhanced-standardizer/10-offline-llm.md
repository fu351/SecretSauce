## Phase 10 â€” Move LLM to Offline Queue
**Executor: Claude. Database access required.**

**Prerequisite: Phase 8 LLM-free rate â‰¥ 85%, stable for 14+ days.**

### Hot Path Becomes

```ts
// Gate 8 fallback (Phase 10 version):
// Instead of: call LLM synchronously
// Do this:

await markNeedsOfflineLLM(row, {
  hintCandidates: enrichedHints,
  rerankerTopScore: top?.mergedScore,
  builtCanonical: built.matchedExistingCanonical ? built.canonicalName : null,
})

obs.resolve('needs_offline_llm', '', undefined)
// Returns without blocking. Queue depth goes up. Offline worker drains it nightly.
```

### Offline LLM Worker

```text
scripts/offline-llm-standardizer.ts

Runs: nightly (or on demand when offline_llm_queue depth > threshold)
Claims rows: WHERE status = 'needs_offline_llm'
Uses: cloud LLM (no latency constraint â€” can use gpt-4o or better)
Writes: resolved canonical + updates alias graph + writes token links
Also runs: synonym discovery pass over recent pool misses
```

### What the LLM Does Offline

At this stage, the LLM serves five purposes that don't need to be synchronous:

1. **Resolve the `needs_offline_llm` queue** â€” items the hot path couldn't handle
2. **Synonym discovery** â€” periodically review pool-miss items and propose new token links
3. **Threshold audit** â€” sample auto-resolved items and verify they're correct (spot-check)
4. **Consolidation suggestions** â€” propose canonical merges for review
5. **Training label generation** â€” label item batches for eventual ML reranker training

