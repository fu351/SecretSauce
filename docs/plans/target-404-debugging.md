# Target 404 Debugging

## What happens today

When [target.js](/c:/Users/wmnoo/SecretSauce/scrapers/stores/target.js) gets a `404` from the Target product endpoint, it now treats that as a hard stop for the store and records enough context to debug the failure:

- throws `TARGET_HTTP_404`
- includes `error.debugContext`
- logs a row through `logHttpErrorToDatabase(...)`
- lets [daily-scraper.js](/c:/Users/wmnoo/SecretSauce/scripts/daily-scraper.js) stop the rest of that store run

## Debug fields now captured

The Target scraper now preserves these fields for `404` analysis:

- `keyword`
- `zipCode`
- `storeId`
- `storeIdSource`
- `groceryStoreId`
- `requestUrl`
- `responseStatus`

## How to debug a live 404

1. Check the detailed summary in the daily scraper output.
2. Look for `stop=http_404` and the `last_error` line for the affected Target ZIP.
3. Inspect `grocery_stores.metadata.scraper_runtime.last_http_404` for:
   - ingredient
   - zip code
   - run id / workflow
   - error code
4. Inspect the `target_404_log` row for:
   - `target_store_id`
   - `store_id_source`
   - `grocery_store_id`
   - `ingredient_name`
   - `request_url`
5. Re-run the exact failing request using the stored `request_url`.

## Most likely failure buckets

- stale or invalid `target_store_id` in `grocery_stores.metadata`
- Target RedSky changing accepted query params for a specific store
- store-specific inventory/search edge cases for certain ingredients
- temporary Target edge/API regressions for a ZIP/store combination

## Test coverage added

The Target suite now verifies that `404` handling:

- throws `TARGET_HTTP_404`
- includes structured `debugContext`
- records `storeIdSource`
- records `groceryStoreId`
- stores a reproducible request URL for replay
