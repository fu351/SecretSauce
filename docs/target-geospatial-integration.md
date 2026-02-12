# Target Scraper Geospatial Integration

## Overview

The Target scraper uses geospatial store resolution and Target store IDs for localized pricing.

Current behavior in `lib/scrapers/target.js`:
- Resolves a Target store by ZIP when store metadata is missing
- Uses `pricing_store_id` and `store_ids` request params with that store ID
- Falls back safely when no valid Target store ID is available

Important:
- `facetedValue` is not used by the production Target scraper flow
- Canonical store identity for Target requests is `targetStoreId`/`store_id`

## Request Flow

1. Receive search request (`keyword`, optional store metadata, `zipCode`)
2. Resolve Target store ID in this order:
   - `storeMetadata.target_store_id`
   - `storeMetadata.targetStoreId`
   - `storeMetadata.store_id`
   - `storeMetadata.storeId`
   - `storeMetadata.raw.store_id`
   - `storeMetadata.raw.storeId`
3. If no store ID is provided, call `getNearestStore(zipCode)`
4. Call Target PLP API (`plp_search_v2`) with:
   - `pricing_store_id=<storeId>`
   - `store_ids=<storeId>`
   - `zip=<zipCode>`
5. Normalize and return product results

## Geospatial + DB Integration

The geospatial layer is used to identify nearby/valid stores and hydrate store metadata.

Relevant modules:
- `lib/database/grocery-stores-db.ts`
- `lib/store/user-preferred-stores.ts`
- `lib/scrapers/target.js`

Expected Target metadata fields in `grocery_stores.metadata`:
- `targetStoreId` (preferred)
- optionally `store_id`/`storeId` variants in transitional data

## API Contract (Practical)

`getNearestStore(zipCode)` returns a Target store object with normalized IDs and address fields.

`getTargetProducts(keyword, storeMetadata, zipCode, sortBy = 'price')`:
- accepts either full metadata object or explicit store ID
- handles cache/in-flight dedupe/rate limiting/retry logic
- logs Target API 404s to `target_404_log` when configured

## Behavior Notes

- If a generic DB `id` exists in metadata without Target-specific ID fields, the scraper ignores it to avoid DB-ID collisions.
- If no valid store ID can be resolved, the scraper returns an empty set rather than making malformed Target requests.
- Response sorting defaults to ascending price.

## Troubleshooting

### No products returned

Check:
1. A valid Target store ID is being resolved (`targetStoreId`/`store_id`)
2. ZIP/store pairing is valid
3. Target API is responding with 200 (not 404/429)

### Wrong store-level pricing

Check:
1. `storeMetadata.targetStoreId` maps to the intended Target location
2. `zipCode` passed to scraper matches user context
3. No stale cache entry is masking recent metadata changes

### Frequent 404s

Check:
1. `target_404_log` entries for store/keyword patterns
2. Whether store IDs in metadata are outdated
3. Retry/rate-limit environment values in the scraper runtime

## Related Files

- `lib/scrapers/target.js`
- `lib/database/grocery-stores-db.ts`
- `lib/store/user-preferred-stores.ts`
- `docs/REPOSITORY_FUNCTIONALITY_OVERVIEW.md`
