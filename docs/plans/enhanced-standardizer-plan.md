# Enhanced Standardizer Plan
## Grounded Implementation - Make the LLM Redundant

This is the control/index document for the enhanced standardizer work. Detailed implementation notes live in the mini plan files under [enhanced-standardizer/](enhanced-standardizer/).

---

## Governing Constraints

Everything in this plan is subject to four non-negotiable rules derived from the comparison analysis:

**Rule 1: Observability data must be collected and reported first.** The observability schema and in-process telemetry already exist (`lib/observability/ingredient-resolution.ts`, `supabase/migrations/0017_ingredient_resolution_observability.sql`). No phase ships without 7 days of `ingredient_resolution_log` and `ingredient_worker_run_log` data establishing the baseline metrics from the observability plan. The missing prerequisite is the baseline report, not another observability implementation.

**Rule 2: The existing confidence calibrator is not replaced - it is extended.** `getIngredientConfidenceCalibrator()` and `logIngredientConfidenceOutcome()` are kept. New scoring sits alongside them and feeds into calibration, not around it.

**Rule 3: `resolveVectorCandidates()` is the seed, not the replacement.** The existing vector hint injection is the first working version of unified candidate generation. Phases 3 and 4 extend it rather than rewrite it from scratch.

**Rule 4: Form and variety retention logic is not duplicated in the deterministic builder.** `maybeRetainFormSpecificCanonical()` and `maybeRetainVarietyCanonical()` already encode critical domain rules. The deterministic builder in Phase 6 calls these same functions rather than reimplementing them.

---

## Phase Dependency Graph

```text
Phase 0: Baseline Report (prerequisite - telemetry already implemented)
  |
  +-- Phase 1: Provider Abstraction        [low risk, structural only]
  |     +-- Phase 2: Shadow Local Model    [depends on Phase 1]
  |
  +-- Phase 3: Unified Candidate Layer     [medium risk, extends existing code]
  |     +-- Phase 4: Alias Memory Graph    [depends on Phase 3]
  |     |     +-- Phase 4A: Recipe Human Labels [depends on Phase 4]
  |     |     +-- Phase 5: Token Links     [depends on Phase 4, benefits from Phase 4A]
  |     +-- Phase 6: Deterministic Builder [depends on Phase 3 data]
  |           +-- Phase 7: Reranker        [depends on Phases 3, 4, 4A, 5, 6]
  |                 +-- Phase 8: LLM Gates [depends on Phase 7 calibration]
  |
  +-- Phase 9: Consolidation Correctness   [parallel track, unblocked]
        +-- Phase 10: Offline LLM          [depends on Phase 8 stability]
```

Phase 0 produces the baseline report from the existing observability tables. Phases 1-2 and Phase 9 can run in parallel after that report exists. Everything else is sequential. The ML reranker emerges naturally from Phase 7 once enough labeled data exists and is a future upgrade to the hand-tuned scorer, not a separate phase.

---

## Phase Plans

| Phase | Plan | Ships When |
|---|---|---|
| 0 - Baseline Report | [00-baseline-report.md](enhanced-standardizer/00-baseline-report.md) | 7 days of clean observability data and a committed/reportable baseline |
| 1 - Provider Abstraction | [01-provider-abstraction.md](enhanced-standardizer/01-provider-abstraction.md) | Existing tests pass with `STANDARDIZER_PROVIDER=openai`; shadow enabled without hot-path change |
| 2 - Shadow Model | [02-shadow-local-model.md](enhanced-standardizer/02-shadow-local-model.md) | 500+ shadow comparisons logged; promotion criteria defined and documented |
| 3 - Unified Candidates | [03-unified-candidate-layer.md](enhanced-standardizer/03-unified-candidate-layer.md) | LLM pool hit rate improves at least 5pp over baseline; p95 candidate generation is 800ms or less |
| 4 - Alias Graph | [04-alias-memory-graph.md](enhanced-standardizer/04-alias-memory-graph.md) | 14-day graph built; at least 15% resolutions served from trusted alias edges; zero consolidation regressions |
| 4A - Recipe Human Labels | [04a-recipe-upload-human-labels.md](enhanced-standardizer/04a-recipe-upload-human-labels.md) | 200+ recipe labels collected; 50+ labels with canonical IDs; no auto-resolve changes before promotion thresholds |
| 5 - Token Links | [05-learned-token-links.md](enhanced-standardizer/05-learned-token-links.md) | Recall improvement measurable in pool hit rate for synonym-containing names; zero false auto-resolves from expansion |
| 6 - Deterministic Builder | [06-deterministic-canonical-builder.md](enhanced-standardizer/06-deterministic-canonical-builder.md) | Builder precision at least 90% on calibration sample; no increase in double-check remap rate |
| 7 - Reranker | [07-calibrated-hand-tuned-reranker.md](enhanced-standardizer/07-calibrated-hand-tuned-reranker.md) | Calibration query shows at least 95% precision at chosen threshold; LLM-free rate increase visible in observability |
| 8 - LLM Gates | [08-staged-llm-reduction-gates.md](enhanced-standardizer/08-staged-llm-reduction-gates.md) | LLM-free rate at least 55% sustained for 7 days; false auto-resolve rate 1% or less |
| 9 - Consolidation | [09-consolidation-pipeline-correctness.md](enhanced-standardizer/09-consolidation-pipeline-correctness.md) | Embedding loss eliminated; stats rewrite verified; no production consolidation regressions |
| 10 - Offline LLM | [10-offline-llm.md](enhanced-standardizer/10-offline-llm.md) | Hot path LLM-free rate at least 85% for 14 days; offline queue drains within 24h |

For the standalone acceptance table, see [acceptance-gate-summary.md](enhanced-standardizer/acceptance-gate-summary.md).
