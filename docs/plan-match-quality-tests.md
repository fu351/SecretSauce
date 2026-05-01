# Plan A: Match-Quality Regression Tests

## Summary
Add focused regression tests for the ingredient standardizer and vector-match layers so the known false positives get caught before they reach product mapping or pricing.

## Key Changes
- Add tests that prove scraper-title cleanup preserves the product type signal for cases like `baby puffs`, instead of collapsing to the embedded ingredient token.
- Add tests for ingredient canonicalization and prompt guidance around:
  - `grated parmigiano reggiano`
  - `extra virgin olive oil`
  - `whole milk`
- Add tests around the vector rerank layer to protect against:
  - head-token overmatching
  - form-token mismatches
  - category-incorrect matches that still look semantically close
- Add tests for the product-mapping relink path so low-threshold embedding updates do not promote obviously wrong mappings.

## Test Plan
- Run focused Vitest slices for:
  - shared ingredient cleaning
  - ingredient standardizer prompt building
  - vector-match helpers
  - product-mapping relink helpers
- Add one or two real-row regression cases from the store-comparison export if they can be expressed as deterministic test fixtures.
- Keep the tests strict enough that a future loosened threshold or cleanup rule fails fast.

## Assumptions
- No schema or database changes are needed for this track.
- The primary goal is prevention, not retroactive repair.
- If a case cannot be expressed deterministically in unit tests, it should be left for the DB review track instead of being mocked into certainty.
