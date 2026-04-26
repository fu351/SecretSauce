## Phase 7 â€” Calibrated Hand-Tuned Reranker
**Executor: Claude. Database access required.**

**Risk: Medium-High. Replaces implicit ordering with explicit scoring. Thresholds must be empirically validated.**

### Goal
Replace the current implicit "take top vector candidate if score â‰¥ 0.93" auto-resolve logic with an explicit multi-signal reranker that uses all candidate scores. The reranker runs after candidate union (Phase 3) and before the LLM gate (Phase 8). It does not replace the LLM â€” it reduces the fraction of items that reach it.

### Reranker Score Formula

```ts
// lib/standardizer/reranker/score-candidate.ts

export interface RerankerWeights {
  vector: number         // 0.30
  fuzzyLogIdf: number    // 0.20
  aliasGraph: number     // 0.20
  minhash: number        // 0.08
  history: number        // 0.07
  sourceAgreement: number // 0.05  â€” how many sources agree
  headNounMatch: number   // 0.05
  contextMatch: number    // 0.03
  formMatch: number       // 0.02
}

export const DEFAULT_WEIGHTS: RerankerWeights = {
  vector: 0.30,
  fuzzyLogIdf: 0.20,
  aliasGraph: 0.20,
  minhash: 0.08,
  history: 0.07,
  sourceAgreement: 0.05,
  headNounMatch: 0.05,
  contextMatch: 0.03,
  formMatch: 0.02,
}

export interface RerankerPenalties {
  categoryMismatch: number      // -0.25
  droppedMeaningfulForm: number // -0.20
  overlyBroadCanonical: number  // -0.15
  lowWordRatio: number          // -0.10
  knownBadEdge: number          // -0.30
}

export const DEFAULT_PENALTIES: RerankerPenalties = {
  categoryMismatch: -0.25,
  droppedMeaningfulForm: -0.20,
  overlyBroadCanonical: -0.15,
  lowWordRatio: -0.10,
  knownBadEdge: -0.30,
}

export function scoreCandidate(
  c: Candidate,
  input: CandidateInput,
  weights: RerankerWeights = DEFAULT_WEIGHTS,
  penalties: RerankerPenalties = DEFAULT_PENALTIES
): number {
  const raw =
    weights.vector * (c.scores.vector ?? 0) +
    weights.fuzzyLogIdf * (c.scores.fuzzyLogIdf ?? 0) +
    weights.aliasGraph * (c.scores.aliasGraph ?? 0) +
    weights.minhash * (c.scores.minhash ?? 0) +
    weights.history * (c.scores.historicalAcceptRate ?? 0) +
    weights.sourceAgreement * Math.min(c.sources.length / 3, 1) +
    weights.headNounMatch * (c.features.headNounMatch ? 1 : 0) +
    weights.contextMatch * (c.features.contextMatch ? 1 : 0) +
    weights.formMatch * (c.features.formMatch ? 1 : 0)

  // Penalties (clamped: score floor is 0.0)
  let penaltyTotal = 0
  if (!c.features.categoryMatch) penaltyTotal += Math.abs(penalties.categoryMismatch)
  if (!c.features.formMatch && inputHasForm(input.cleanedName)) {
    penaltyTotal += Math.abs(penalties.droppedMeaningfulForm)
  }
  if (isOverlyBroad(c.canonicalName)) {
    penaltyTotal += Math.abs(penalties.overlyBroadCanonical)
  }
  if (c.features.wordRatio < 0.30) {
    penaltyTotal += Math.abs(penalties.lowWordRatio)
  }

  return Math.max(0, Math.min(1, raw - penaltyTotal))
}
```

Note: penalties are subtracted from the raw score, then the result is clamped to `[0, 1]`. This fixes the scoring range problem I raised in the critique â€” scores cannot go negative.

### Calibration Process

The empirical calibration of thresholds uses data from `ingredient_resolution_log` after Phases 3â€“6 have been running for at least 14 days:

```sql
-- Calibration query: precision by reranker score bucket
-- "Precision" = fraction where the top-scored candidate matches what the LLM (ground truth) chose

with scored as (
  select
    -- Extract the reranker score of the candidate the LLM eventually selected
    (select max((c->>'mergedScore')::numeric)
     from jsonb_array_elements(candidates) c
     where c->>'canonicalName' = final_canonical_name
    ) as winner_score,
    double_check_changed,
    form_retention_overrode,
    variety_retention_overrode
  from ingredient_resolution_log
  where llm_called = true
    and candidates is not null
    and created_at > now() - interval '14 days'
),
bucketed as (
  select
    round(winner_score, 1) as score_bucket,
    count(*) as n,
    -- "wrong" = any post-LLM override happened (proxy for LLM making a suboptimal choice)
    count(*) filter (where double_check_changed
                       or form_retention_overrode
                       or variety_retention_overrode) as wrong_count,
    round(1 - count(*) filter (where double_check_changed
                               or form_retention_overrode
                               or variety_retention_overrode)::numeric
              / count(*), 3) as precision
  from scored
  where winner_score is not null
  group by 1
)
select * from bucketed order by 1;
```

> **Calibration proxy limitations:** `double_check_changed OR form_retention_overrode OR variety_retention_overrode` is an imperfect signal in both directions. LLM errors not caught by these post-processors count as correct, inflating precision at high scores. Conversely, retention overrides that were themselves right (the LLM chose a valid canonical but the form rule correctly changed it) count as wrong, deflating precision. Thresholds should therefore start conservative and be spot-checked: after each calibration run, manually review a random sample of 20+ items from the top score bucket to catch systematic blind spots before loosening a threshold.

The calibration commits safe thresholds to `lib/standardizer/reranker/thresholds.ts`:

```ts
export const RERANKER_THRESHOLDS = {
  // Only auto-resolve if this score band shows >= 95% precision in calibration data
  autoResolve: 0.92,         // Initially conservative; lowered as data accumulates

  // Inject as top hint if score is in this band (LLM still decides)
  strongHint: 0.80,

  // Include in hint pool
  weakHint: 0.65,
} as const
```

These thresholds start conservative and are explicitly loosened â€” never tightened â€” based on observability data. A threshold change requires a PR with the calibration query output attached.

### Integration

```ts
// lib/standardizer/reranker/rerank.ts

export function rerankCandidates(
  candidates: Candidate[],
  input: CandidateInput,
): Candidate[] {
  return candidates
    .map(c => ({ ...c, mergedScore: scoreCandidate(c, input) }))
    .sort((a, b) => (b.mergedScore ?? 0) - (a.mergedScore ?? 0))
}
```

In `processor.ts`:

```ts
// After unionCandidates(), before LLM call:

const rankedCandidates = rerankCandidates(candidates, { cleanedName, context })
obs.recordCandidates(rankedCandidates)

const top = rankedCandidates[0]

// Auto-resolve gate
if (top.mergedScore >= RERANKER_THRESHOLDS.autoResolve && top.canonicalId) {
  obs.resolve('resolved_reranker_auto', top.canonicalName, top.canonicalId)
  await markResolved(row, ...)
  await writeAliasEdge({ ..., source: 'vector_auto_resolution', accepted: true,
    losers: rankedCandidates.slice(1, 5).map(c => c.canonicalName) })
  obs.emit()
  continue
}

// Hint injection â€” ordered by reranker score
const hintNames = rankedCandidates
  .filter(c => (c.mergedScore ?? 0) >= RERANKER_THRESHOLDS.weakHint)
  .slice(0, 20)
  .map(c => c.canonicalName)
```

### Files Changed
- New: `lib/standardizer/reranker/` (score-candidate, rerank, thresholds)
- Modified: `queue/worker/processor.ts` â€” add reranker call; update auto-resolve logic
- New: `scripts/calibrate-reranker.ts` â€” runs calibration query, outputs threshold recommendations

---

