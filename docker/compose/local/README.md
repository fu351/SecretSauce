# Local Daily Scraper Compose Files

## Files

- `daily-scraper.shared.env`
  - Shared local defaults used by both compose entrypoints
  - Keeps dry-run and summary settings in sync
- `daily-scraper-matrix.yml`
  - One service per scraper brand
  - Dry-run enabled by default
  - Detailed summary enabled by default
  - Uses small local limits for smoke testing
- `target-store-diagnostics.yml`
  - Target-only diagnostic runner
  - Skips inserts entirely and writes a JSON summary to `docker/diagnostics-output`
  - Replays recent Target 404 ingredients plus a small baseline sample per store

## Usage

Run one brand:

```bash
docker compose -f docker/compose/local/daily-scraper-matrix.yml run --rm daily-scraper-target
```

Run the full local matrix:

```bash
docker compose -f docker/compose/local/daily-scraper-matrix.yml up --build
```

Run the Target diagnostics:

```bash
docker compose -f docker/compose/local/target-store-diagnostics.yml up --build
```

The JSON report is written to:

```bash
docker/diagnostics-output/target-store-diagnostics.json
```

Stop and clean up:

```bash
docker compose -f docker/compose/local/daily-scraper-matrix.yml down
```

## Notes

- The root [docker-compose.local.yml](/c:/Users/wmnoo/SecretSauce/docker-compose.local.yml) and the matrix compose file both read `daily-scraper.shared.env`, so shared defaults only need to be changed in one place.
- The matrix defaults to `STORE_STATE=CA` and `STORE_CITIES_CSV=San Francisco,Oakland,Berkeley` to stay close to the nightly workflow defaults.
- `daily-scraper-aldi` and `daily-scraper-traderjoes` are serialized so the two Jina-backed scrapers do not run at the same time in the local matrix.
- Override limits or store filters with standard Compose env overrides if needed.
- `target-store-diagnostics.yml` defaults to all active California Target stores. You can narrow it with normal env overrides like `STORE_CITIES_CSV`, `STORE_ZIP_MIN`, or `TARGET_DIAGNOSTIC_STORE_LIMIT`.
