# Target Geospatial Integration

## Agent Metadata

- `Doc Kind`: `guide`
- `Canonicality`: `reference`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `lib/scrapers/target.js`, `lib/store/user-preferred-stores.ts`, `scripts/backfill-target-store-ids.js`
- `Update Trigger`: Target store-routing behavior, metadata contracts, or geospatial lookup flow changes.

## Agent Use

- `Read this when`: troubleshooting Target store selection, Target ID mapping, or ZIP-based routing.
- `Stop reading when`: issue is generic scraper runtime behavior not specific to Target geospatial routing.
- `Escalate to`: `docs/scrapers-directory.md`, `lib/scrapers/target.js`, `lib/database/grocery-stores-db.ts`.

## Purpose

Working notes for Target-specific geospatial and store-ID integration. Expand this document with implementation details when Target routing logic changes.
