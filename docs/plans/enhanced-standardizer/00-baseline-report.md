## Phase 0 â€” Baseline Report
**Executor: Claude. Database access required.**

**Risk: Low. Reporting only. No resolver behavior changes.**

### Goal
Use the telemetry that already exists to establish the current operating baseline before changing matching behavior. This phase does not create another observer or another logging schema. It queries:

- `ingredient_resolution_log`
- `ingredient_worker_run_log`
- `ingredient_queue_health_snapshots`
- the existing confidence calibration and canonical double-check telemetry

### Output
Add a report script that computes the baseline metrics from the observability plan:

- LLM call rate
- vector auto-resolve rate
- local cache hit rate
- LLM hint-pool hit rate
- LLM true-miss rate
- double-check/form/variety override rates
- semantic dedup remap rate
- failure/probation rate
- p95 candidate and resolution latency where available
- queue depth and queue wait trends

The report output becomes the acceptance gate for all later phases. Phase 1 is allowed to proceed only after the report has at least 7 days of clean production data, or an explicit staging exception is documented.

### Files Changed
- New: `backend/scripts/reports/ingredient-standardizer-baseline.ts` (or equivalent existing scripts package location)
- Optional: `lib/observability/baseline.ts` after the first committed baseline

---

