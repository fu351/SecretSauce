# Store Maintenance Worker

Python worker for keeping store data healthy in Supabase. It has three modes:

- `import`: ingest new grocery stores from All the Places
- `geo_fix`: fill in missing or approximate geometry on existing stores
- `backfill`: backfill `scraped_zipcodes` metadata from Zippopotam

## Key Files

- [`runner.py`](./runner.py): CLI entrypoint that dispatches by `--mode`
- [`cli.py`](./cli.py): shared argument parsing and token helpers
- [`modes.py`](./modes.py): mode orchestration
- [`import_new_stores.py`](./import_new_stores.py): import flow and dedupe logic
- [`fix_missing_geo.py`](./fix_missing_geo.py): geometry repair flow
- [`backfill_scraped_zipcodes.py`](./backfill_scraped_zipcodes.py): ZIP metadata backfill flow
- [`update_target_zipcodes.py`](./update_target_zipcodes.py): refresh target ZIPs from user locations
- [`db.py`](./db.py): Supabase client and table helpers
- [`alltheplaces.py`](./alltheplaces.py): All the Places fetch/fallback logic
- [`tests/`](./tests): unit tests for runner dispatch and All the Places fetch behavior

## Run

From the repo root:

```bash
python -m workers.store_maintenance_worker.runner --mode import
python -m workers.store_maintenance_worker.runner --mode geo_fix
python -m workers.store_maintenance_worker.runner --mode backfill
```

Common examples:

```bash
# Import only a subset of brands and ZIPs
python -m workers.store_maintenance_worker.runner --mode import --brands target,walmart --zip 94102

# Repair geometry for selected brands
python -m workers.store_maintenance_worker.runner --mode geo_fix --brands target

# Backfill ZIP metadata in batches
python -m workers.store_maintenance_worker.runner --mode backfill --limit 50 --loop
```

## Required Env Vars

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Common optional env vars:

- `BRAND_FILTER`: brand enum filter applied by `import` and `geo_fix`
- `MAX_SPIDERS_PER_RUN`: caps the number of brands processed per run
- `IMPORT_TARGET_ZIPCODES`: default ZIP filter used by the import flow when no ZIPs are passed
- `ALLTHEPLACES_OUTPUT_BASE`: overrides the primary All the Places output base URL
- `GOOGLE_MAPS_API_KEY`: enables ZIP centroid fallback in `geo_fix`

## Mode Flow

### Import

1. Optionally refresh `target_zipcodes` with `--run-update-target-zipcodes` (default `true`).
2. Resolve ZIP filters from `--zip`, `--zipcodes`, or `IMPORT_TARGET_ZIPCODES`.
3. Load existing store keys from `grocery_stores` to avoid duplicates.
4. Fetch GeoJSON from All the Places, with alias/base-URL fallback.
5. Insert new stores into `grocery_stores` in batches of 100.
6. If explicit ZIPs were processed and `--mark-events-completed` is enabled, mark matching `scraping_events` rows as `completed`.
7. Update `scraped_zipcodes` for ZIPs that received new stores.

### Geo Fix

1. Query `grocery_stores` rows with missing geometry or centroid-style addresses.
2. Skip stores with `failure_count >= 3`.
3. Pull matching All the Places GeoJSON and update geometry from store coordinates.
4. For remaining rows, optionally geocode ZIP centroids with Google Maps.

### Backfill

1. Query `scraped_zipcodes` rows missing `city` or `geom`.
2. Fetch ZIP metadata from `https://api.zippopotam.us/us/{ZIP}`.
3. Upsert the city/state/lat/lng/geom fields back into `scraped_zipcodes`.
4. Repeat when `--loop` is set, stopping at `--max-batches` if provided.

## Testing

Run the Python unit tests for this worker:

```bash
python -m unittest discover -s workers/store-maintenance-worker/tests
```

The tests cover runner dispatch and All the Places fallback behavior.
