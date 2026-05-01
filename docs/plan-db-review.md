# Plan B: Database Review and Root-Cause Trace

## Summary
Isolate the live-data investigation into a separate review plan so Claude can inspect actual rows, product mappings, and pricing history without mixing that evidence with code changes.

## Key Changes
- Identify the bad store-comparison rows by `shopping_item_id`, `product_mapping_id`, and final `canonical_name`.
- Trace each mismatch through the live database to determine whether the failure came from:
  - ingredient standardization
  - product-mapping relink
  - store-price candidate ranking
  - final pricing/rendering logic
- Compare the live row history against the thresholds used by the matching code so we can tell whether the issue is:
  - an overly permissive match
  - an upstream bad mapping
  - a stale mapping that should have been replaced
- Produce a short evidence bundle that Claude can review directly against the database.

## Test Plan
- Query the live tables for the affected ingredient/product mapping history.
- Verify the canonical ingredient attached to each bad product mapping.
- Inspect whether the same `product_mapping_id` was reused across multiple store results.
- Confirm whether bad results are driven by:
  - an incorrect standardized ingredient
  - a correct ingredient with the wrong product
  - a product name normalized too aggressively
- Summarize each mismatch as `upstream mapping bug` or `store-ranking bug` so follow-up work is unambiguous.

## Assumptions
- This track stays separate from code edits.
- Claude will review the live database evidence after the trace is collected.
- The output should be a concise investigation packet, not a fix commit.
