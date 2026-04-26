## Acceptance Gate Summary

Executor labels:

- **Codex**: no direct database access required; code/docs/test structure only.
- **Claude**: requires database access, migrations, Supabase table/RPC work, or production/staging data queries.

| Phase | Executor | Database Access? | Ships When |
|---|---|---|---|
| 0 - Baseline Report | Claude | Yes - reads observability tables | 7 days of clean observability data and a committed/reportable baseline |
| 1 - Provider Abstraction | Codex | No | Existing tests pass with `STANDARDIZER_PROVIDER=openai`; shadow enabled without hot-path change |
| 2 - Shadow Model | Claude | Yes - new comparison table and writes | 500+ shadow comparisons logged; promotion criteria defined and documented; baseline agreement rates measured and recorded |
| 3 - Unified Candidates | Claude | Yes - fuzzy/MinHash RPCs and tables | LLM pool hit rate improves at least 5pp over baseline; p95 candidate generation is 800ms or less |
| 4 - Alias Graph | Claude | Yes - alias edge table/RPCs | 14-day graph built; at least 15% resolutions served from trusted alias edges; zero consolidation regressions |
| 4A - Recipe Human Labels | Claude | Yes - human label table and recipe writes | 200+ recipe labels collected; 50+ labels with canonical IDs; no auto-resolve changes before promotion thresholds |
| 5 - Token Links | Claude | Yes - token link table and seed data | Recall improvement measurable in pool hit rate for synonym-containing names; zero false auto-resolves from expansion |
| 6 - Deterministic Builder | Claude | Yes - DB-backed rules and canonical lookup RPC | Builder precision at least 90% on calibration sample; no increase in double-check remap rate |
| 7 - Reranker | Claude | Yes - calibration queries over resolution logs | Calibration query shows at least 95% precision at chosen threshold; LLM-free rate increase visible in observability |
| 8 - LLM Gates | Claude | Yes - rollout gates depend on DB metrics and queue state | LLM-free rate at least 55% sustained for 7 days; false auto-resolve rate 1% or less |
| 9 - Consolidation | Claude | Yes - consolidation, embedding, alias, and stats rewrites | Embedding loss eliminated; stats rewrite verified; no production consolidation regressions |
| 10 - Offline LLM | Claude | Yes - offline queue/status writes and alias/token updates | Hot path LLM-free rate at least 85% for 14 days; offline queue drains within 24h |
