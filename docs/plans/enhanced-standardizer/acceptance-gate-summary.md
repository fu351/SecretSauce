## Acceptance Gate Summary

| Phase | Ships When |
|---|---|
| 1 â€” Provider Abstraction | Existing tests pass with `STANDARDIZER_PROVIDER=openai`; shadow enabled without hot-path change |
| 2 â€” Shadow Model | 500+ shadow comparisons logged; promotion criteria defined and documented |
| 3 â€” Unified Candidates | LLM pool hit rate improves â‰¥ 5pp over baseline; p95 candidate generation â‰¤ 800ms |
| 4 â€” Alias Graph | 14-day graph built; â‰¥ 15% resolutions served from trusted alias edges; zero consolidation regressions |
| 4A â€” Recipe Human Labels | 200+ recipe labels collected; 50+ labels with canonical IDs; no auto-resolve changes before promotion thresholds |
| 5 â€” Token Links | Recall improvement measurable in pool hit rate for synonym-containing names; zero false auto-resolves from expansion |
| 6 â€” Deterministic Builder | Builder precision â‰¥ 90% on calibration sample; no increase in double-check remap rate |
| 7 â€” Reranker | Calibration query shows â‰¥ 95% precision at chosen threshold; LLM-free rate increase visible in observability |
| 8 â€” LLM Gates | LLM-free rate â‰¥ 55% sustained for 7 days; false auto-resolve rate â‰¤ 1% |
| 9 â€” Consolidation | Embedding loss eliminated; stats rewrite verified; no production consolidation regressions |
| 10 â€” Offline LLM | Hot path LLM-free rate â‰¥ 85% for 14 days; offline queue drains within 24h |
