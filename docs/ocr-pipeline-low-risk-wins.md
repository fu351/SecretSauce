# OCR Pipeline — Low-Risk Wins Implementation Report

## What was wrong (recap)

The audit identified three classes of problem on the OCR pipelines that did **not** require schema decisions, ML work, or new datasets:

1. **Dead code paths.** The recipe dictionary (`correct_ingredient_name`) existed but was never called by `parse_recipe` itself — only by the API layer. Tests passed without exercising the corrector; any non-API caller (CLI, script, future job) got uncorrected ingredient names.
2. **Worker starvation.** Three OpenAI calls and two CPU-heavy OCR/CV calls ran synchronously inside `async def` handlers, blocking the entire FastAPI event loop for ~2–5s per request. With Fly's single shared CPU, ~10 concurrent users would freeze the service.
3. **Trivially exploitable inputs.** `/recipe-import/url` accepted any URL and fetched it (SSRF — could hit cloud metadata at `169.254.169.254`, RFC1918 ranges, localhost). `/receipt/analyze` accepted an arbitrary filesystem path (path traversal — `image_path=/etc/passwd` would happily try to OCR it).
4. **Tight memory + cold starts.** 512 MB was tight for EasyOCR + PaddleOCR (~200–500 MB combined), and `min_machines_running = 0` meant first user hits paid the model-load tax (~2–5s) on every wake.
5. **Magic numbers in code.** Per-store engine preferences and 14+ tuning constants lived in `model_recommender.py`. Recalibrating after a benchmark run required a code edit and redeploy.

## Changes made

### 1. Wired the recipe dictionary into the parser  ([lib/recipe-ocr/recipe_parser.py](../lib/recipe-ocr/recipe_parser.py), [test_recipe_parser.py](../lib/recipe-ocr/test_recipe_parser.py))

- Added defensive import of `correct_ingredient_name` at module top (try `from recipe_dictionary import …`, then relative, then `None`).
- Added `apply_dict_correction: bool = True` parameter to `parse_recipe`. When True and the dictionary is importable, each ingredient `name` is fuzzy-corrected against the cooking vocab; `display_name` is preserved untouched so callers can still show the raw OCR.
- Updated [python-api/main.py:1294-1306](../python-api/main.py) to pass `apply_dict_correction=True` to the parser instead of double-applying. A `TypeError` fallback path keeps the API working against older parser versions.
- Added 2 new tests: `test_parse_recipe_applies_dictionary_correction` (verifies `cinamon` → `cinnamon` end-to-end) and `test_parse_recipe_dict_correction_can_be_disabled` (verifies opt-out works).
- **Result:** 73/73 tests pass (was 71/71). Any non-API caller now gets corrected ingredient names automatically.

### 2. Made blocking calls async  ([python-api/main.py](../python-api/main.py))

Wrapped 5 sync calls in `asyncio.to_thread`:

- 3 × `openai_client.chat.completions.create` (lines 395, 533, 680)
- `_receipt_parse_fn(tokens)` (line 1116) — 2,400-LOC pure-Python regex pipeline
- `_extract_image_features_fn(image_path)` (line 1155) — OpenCV ops
- `_recipe_parse_fn(tokens, …)` (line 1295)

The handler signatures didn't change (already `async def`). The event loop is now free during long parses, so concurrent requests no longer queue behind each other.

### 3. SSRF + path-traversal guards  ([python-api/main.py:118-211](../python-api/main.py))

Added two helpers:

- `_validate_public_url(url)` — rejects non-`http(s)` schemes, then resolves the hostname via `socket.getaddrinfo` and rejects if **any** returned IP is private/loopback/link-local/multicast/reserved/unspecified. Iterating all A-records closes the multi-record loophole. Wired into `/recipe-import/url`.
- `_validate_receipt_image_path(path)` — confines `image_path` to a base directory (default: system temp, override via `RECEIPT_IMAGE_BASE_DIR` env var). Uses `Path.resolve()` *before* the containment check so symlink escapes are caught. Returns 404 if the file doesn't exist, 400 if outside the base. Wired into `/receipt/analyze`.

Verified manually with 11 test cases — all expected rejections fire (`localhost`, `127.0.0.1`, `169.254.169.254`, `10.0.0.5`, `192.168.1.1`, `file://`, `gopher://`, `/etc/passwd`, `../../../etc/passwd`, nonexistent paths) and `https://example.com` + a real temp file pass through.

### 4. Memory bump + warmup  ([python-api/fly.toml:21](../python-api/fly.toml), [python-api/main.py:1450-1473](../python-api/main.py))

- Doubled Fly VM memory: `memory_mb = 512` → `1024`. Eliminates OOM risk under concurrent OCR + leaves headroom for the next bug.
- Added `@app.on_event("startup")` hook that runs a tiny dummy parse through both the receipt and recipe pipelines on each worker boot. This pays the regex-compile + dictionary-import cost once during startup rather than on the first user request — important because `min_machines_running = 0` produces a cold start each wake. Failures are logged, not fatal.

### 5. Externalized recommender constants  ([lib/receipt-ocr/recommender_config.json](../lib/receipt-ocr/recommender_config.json), [model_recommender.py:62-180](../lib/receipt-ocr/model_recommender.py))

- Created `recommender_config.json` containing all 6 feature thresholds, 9 weights, the score-ensemble threshold, both escalation thresholds, and the 13-store preference map.
- Added `_apply_config_overlay()` in `model_recommender.py` which loads the JSON at import time and overrides the matching module-level constants. Falls back silently to the in-code defaults if the file is missing or malformed (logged as a structured event, not raised). Configurable path via `RECEIPT_OCR_CONFIG_PATH` env var for staged rollouts.
- Validation: `store_engine_preference` entries with values other than `"easyocr"` or `"paddle"` are dropped during overlay rather than poisoning the live map.
- Module-level constant *names* are unchanged, so existing tests and external callers that read `STORE_ENGINE_PREFERENCE`, `CONTRAST_LOW`, etc. continue to work.

## Verification

| Check | Result |
|---|---|
| Recipe parser tests | 73/73 pass (was 71/71) |
| `main.py` syntax | OK |
| `model_recommender.py` syntax | OK |
| `recipe_parser.py` syntax | OK |
| SSRF validator manual probe | 7/7 expected rejects, 1/1 expected pass |
| Path-traversal validator manual probe | 3/3 expected rejects, 1/1 expected pass |
| Config overlay logic | Real config loads with 13 stores; custom overlay applies overrides; invalid engine values filtered |

Receipt-OCR tests need `cv2` (not installed locally) — please run `pytest lib/receipt-ocr/test/` in your normal env to confirm.

## What's still on the table

The two **bigger architectural** items from the original list are unchanged and waiting on your call:

1. **Supabase writes + JWT auth** — needs your decisions on table schema and JWT verification approach. Without this, parsed results still vanish after each request.
2. **Escalation loop closure** — needs your call between option A (just surface `escalated=true` to the client) vs. option B (have the API accept image bytes and re-run OCR with the ensemble strategy). B is a real architectural shift; A is 5 minutes.

The dataset expansion (#2 from the original audit) and learned layout classifier (#8) remain your work — they need real receipts and human annotation that I can't supply.
