# OCR Pipeline Architecture & Decisions

This document captures the architectural decisions made while implementing the
80–90%-accuracy / <10s-latency roadmap, including the alternatives that were
considered and rejected. Read this before changing the OCR pipeline so you
don't accidentally re-introduce a tradeoff that was already weighed.

---

## 1. Where receipt OCR lives in the existing system

Before this work, the system looked like this:

```
Browser                      Next.js                    python-api          Supabase
───────                      ───────                    ──────────          ────────
[receipt photo]
      │ (no UI yet)
      ▼
[client-side OCR??]          /api/receipt/process       /receipt/parse      product_mappings
      │                       (auth + persistence)       (tokens-in only)    ingredient_match_queue
      └─{parsedReceipt}──────►│                                              pantry_items
                              │
                              └─{tokens? bytes?}─────►?  (engines lived in
                                                          test/ocr_bench.py
                                                          — not importable)
```

The audit found three weaknesses:

1. **OCR engines were test-private.** `EasyOCREngine`, `PaddleOCREngine`, and `EnsembleEngine` lived in `lib/receipt-ocr/test/ocr_bench.py` and could only be invoked by the bench harness. The API couldn't run them.
2. **`/receipt/parse` accepted tokens, not images.** This forced the choice between client-side OCR (Tesseract.js — slow, less accurate) or no OCR at all. Because there was no receipt UI, in practice the path was unused.
3. **`should_escalate()` was logged but never acted on.** The recommender knew when its first guess was wrong but had no way to re-run.

This document explains what we changed and *why those changes* — not a list of files. For the file-level diff see `git log --since='1 week ago' lib/receipt-ocr python-api`.

---

## 2. Decision: Lift engines into `lib/receipt-ocr/engines.py`

**What we did**: Moved `EasyOCREngine`, `PaddleOCREngine`, `EnsembleEngine`, and the entire preprocessing chain (`preprocess_base`, `preprocess_finalize`, `_deskew`, `_unsharp_mask`) out of `test/ocr_bench.py` into a new module `lib/receipt-ocr/engines.py`. The bench file now imports from `engines.py` so existing tests still pass.

**Why this and not alternatives**:

- ❌ **"Just have the API import from `test/ocr_bench.py`"** — works but couples a production endpoint to a test harness; later refactors of the bench would silently break the API. Forbidding `from test import …` in production is a good rule.
- ❌ **"Move everything into a proper Python package"** — would force `lib/receipt-ocr` to become an installable package (dashes in name → can't be `import receipt_ocr` directly; would need a `setup.py` or `pyproject.toml` and a different directory name). Out of scope.
- ✅ **Lift to a sibling `engines.py`** — keeps the file-relative `importlib.spec_from_file_location` pattern that the rest of the codebase already uses (see `python-api/main.py:1097`), no packaging shift required.

**Tradeoffs**:
- The `importlib` loader path is fragile: code that imports `engines.py` from a different working directory might fail. We accept this because the bench, the API, and any future caller all use the same loader pattern.
- `engines.py` re-loads `preprocessing.py` and `receipt_parser.py` via the same loader. If the import order matters (it doesn't today) we might see surprises later.

---

## 3. Decision: New `/receipt/scan` endpoint, keep `/receipt/parse`

**What we did**: Added `POST /receipt/scan` in `python-api/main.py`. It accepts a multipart image upload, runs the full OCR + escalation chain, and returns a parsed receipt plus diagnostic information (which strategies were tried, whether escalation fired, whether targeted re-OCR ran). The existing `/receipt/parse` (tokens-in) endpoint is unchanged.

**Why this and not alternatives**:

- ❌ **"Replace `/receipt/parse` with image-bytes-in"** — would break any client that already calls `/receipt/parse` with tokens. Even though the only caller today is internal, leaving the old endpoint in place costs nothing.
- ❌ **"Add image bytes as another field on the existing endpoint"** — semantically muddled (a single endpoint that takes either tokens OR images is harder to document and version).
- ✅ **Two endpoints with clearly distinct contracts** — `/receipt/parse` is "I already have tokens" (e.g., a low-end client running Tesseract.js), `/receipt/scan` is "here's a photo, do everything". Each can evolve independently.

**Tradeoffs**:
- We now ship two paths with overlapping functionality. Clients must choose. We document the choice clearly: **mobile receipt capture should always use `/receipt/scan`** because the server engines outperform Tesseract.js on every metric.
- Adding `/receipt/scan` means the python-api deployment now needs `easyocr`, `paddleocr`, and `paddlepaddle` — adds ~500MB to the image and ~2s to cold start. Justification: receipt OCR is the workload the python-api exists to serve. If it ever stops being a goal, both endpoints get removed together.

---

## 4. Decision: New Next.js `/api/receipt/scan` route forwards to existing persistence

**What we did**: Added `app/api/receipt/scan/route.ts` that:
1. Verifies Clerk auth (the existing trust boundary).
2. Forwards the multipart upload to python-api `/receipt/scan`.
3. On success, forwards the parsed receipt to the existing `/api/receipt/process` route, which already knows how to write to `pantry_items` + `ingredient_match_queue`.

**Why this and not alternatives**:

- ❌ **"Add a new `receipts` table and write parsed scans there"** — we already have a complete persistence story (`pantry_items` ← parsed items, `ingredient_match_queue` ← unresolved items). A `receipts` table would duplicate fields that already exist on `pantry_items` (`unit_price`, `created_at`, `user_id`) and require a migration that benefits no current consumer. The audit found zero callers of receipt-as-an-object — they all want pantry items.
- ❌ **"Inline the persistence logic in `/api/receipt/scan`"** — copies the 200-line persistence block from `/api/receipt/process`. Two places to fix when the schema changes. Reject.
- ❌ **"Have python-api write to Supabase directly"** — moves the Supabase trust boundary from Next.js (Clerk-authenticated) to python-api (anonymous). Either python-api needs to verify Clerk JWTs (complex; requires Clerk's JWKS endpoint and a separate token type) or every call gets service-role privileges (no per-user RLS). Reject.
- ✅ **Two-hop: Next.js → python-api → Next.js → Supabase** — keeps the trust boundary at Clerk, reuses the existing persistence pipeline, no new tables. Adds one HTTP hop; in practice the latency is ~5ms because both hops happen on the Vercel edge.

**Tradeoffs**:
- The two-hop pattern means a network blip between Next.js and itself can cause "scan succeeded but persistence failed" responses. We surface this cleanly in the response (`success: true, scan: {...}, error: "Scan succeeded but persistence call failed: …"`) so the client can retry just the persist step.
- The internal `/api/receipt/process` call passes the user's cookies through so Clerk can re-auth. Slightly wasteful (we re-verify auth twice per request) but simpler than introducing a service-to-service token.

---

## 5. Decision: Escalation chain with three stages, not just one

**What we did**: The `/receipt/scan` handler runs the OCR pipeline as a 3-stage cascade:

1. **Recommender's pick** (single engine — easyocr OR paddle, ~1s on GPU). Run `should_escalate()`.
2. **If parse looks empty** (no store, <2 items): run **orientation rescue** — try 4 rotations of a downscaled crop, pick the best score, rotate the original, re-run the same engine.
3. **If `should_escalate()` still fires**: run the **other engine + ensemble merge + targeted re-OCR**. Compare against stage-1 result via `_is_better_parse`; only switch if the new result is genuinely better.

**Why this layered approach**:

- **Most receipts are easy.** Stage 1 succeeds on (we estimate) 70–80% of inputs. Skipping stages 2 and 3 saves the cost.
- **Orientation is cheap to detect, expensive to ignore.** A receipt rotated 90° produces near-zero items. Detecting this case (small heuristic: <2 items AND no store) and trying 4 rotations costs ~1s; running the ensemble on a sideways image wastes 5s and still fails.
- **Ensemble is the most expensive stage.** We only pay for it when stages 1+2 both produce a poor parse.
- **`_is_better_parse` prevents regressions.** The ensemble can sometimes return a *worse* result than a single engine (e.g., the merge hallucinates duplicate items). Comparing the two results before committing prevents this.

**Alternatives considered**:

- ❌ **"Always run ensemble"** — buys the highest accuracy on every request but doubles latency and cost on the 80% of receipts that didn't need it.
- ❌ **"Always run the recommender's pick, no escalation"** — current behavior before this work; documented to lose ~20% accuracy on the receipts that the recommender mispredicts.
- ❌ **"Run both engines in parallel, pick the better"** — wastes the cheaper engine when the expensive one wasn't needed. Same total resource use as ensemble; not a win.

**Tradeoffs**:
- Three stages = three failure modes to monitor. We expose `strategies_tried`, `escalated`, and `targeted_reocr_used` in the response so observability is straightforward (just count `escalated=true` in logs).
- The orientation rescue rotates the image *in place* in the temp file. If a future stage wanted the original rotation it would have to keep a copy. We accept this; nothing currently needs the original.

---

## 6. Decision: EXIF orientation in `preprocess_base`, OCR-confidence orientation in escalation

**What we did**: Two complementary orientation fixes:

- **EXIF**: `apply_exif_orientation` in `preprocessing.py` reads the orientation tag from the JPEG/HEIC header and rotates accordingly. Runs *unconditionally* in `preprocess_base` (cheap, no OCR call).
- **OCR-confidence-based**: `auto_orient_via_ocr` rotates a downscaled crop to {0°, 90°, 180°, 270°}, runs the loaded OCR engine on each, picks the rotation with the highest mean confidence. Runs *only* in the escalation path because it costs ~4× a normal OCR call on a small crop (~1s total).

**Why both**:

- EXIF catches the easy case: phone uploads with un-applied orientation metadata. ~70% of "rotated" receipts.
- OCR-confidence catches the hard case: screenshots, screen-cap-then-rotate, files with stripped EXIF. The remaining 30%.
- Running OCR-confidence rotation on every request would add ~1s to every scan. Running EXIF on every request adds ~5ms. Different costs, different cadences.

**Alternatives considered**:

- ❌ **"Use a lightweight CNN orientation classifier"** — would shave latency over the 4-rotation approach, but adds a model dependency (extra 50MB on disk + a separate inference step). Not worth it for the rare-case path.
- ❌ **"Trust EXIF and skip OCR-confidence entirely"** — misses the 30% of cases without EXIF. Receipt scans by users who cropped/edited the image lose the metadata.

**Tradeoffs**:
- The OCR-confidence approach loads the engine if it isn't already loaded. In the worst case (user's first scan, image is rotated, recommender picked Easy) this means EasyOCR loads, runs, fails, then runs 4 more times on rotations. We accept ~3-5s extra in this rare case.

---

## 7. Decision: Multi-column detection via 1D gap clustering, no scikit-learn dep

**What we did**: Replaced the single-largest-gap column-split logic in `spatial_reorder` with `_detect_column_boundaries`, which finds *all* significant gaps in `x_mid` values and treats each as a column boundary. Stdlib only.

**Why this and not scikit-learn DBSCAN**:

- ❌ **"Use sklearn.cluster.DBSCAN"** — adds sklearn (~30MB) to the runtime dependency set. `receipt_parser.py` is intentionally stdlib-only because it has to work in any environment that runs the parser (CI, scripts, Lambda, etc).
- ✅ **1D gap clustering** — DBSCAN on a 1D set is mathematically equivalent to "sort, find all gaps > epsilon". Implementing this in 30 lines of stdlib gives the same answer with zero deps.

**Tradeoffs**:
- 1D gap clustering can't detect column boundaries that aren't aligned (rare but possible: hand-tilted receipts where columns drift across rows). Not common enough to justify a 2D clusterer.
- The `_MIN_GAP_RATIO = 0.12` constant was chosen empirically. With 100+ GT receipts we should re-tune — that work is captured in the LR calibrator.

**Compatibility**: We kept `col_threshold` as a single-value alias (the rightmost boundary) so any code that previously read this variable still works. The new `col_thresholds` (plural) holds all boundaries.

---

## 8. Decision: Weight/qty parsers wired as a post-processor, not in each store extractor

**What we did**: `_enrich_items_with_weight_qty(result, tokens)` runs after every store extractor in `parse_receipt`. It scans the token stream for `"X.XX lb @ $Y.YY"` and `"N @ $Y.YY"` patterns (across joined token windows because OCR splits these), then attaches `weight`/`unit`/`unit_price`/`quantity` to the closest-priced existing item.

**Why this and not "edit each of 14 store extractors"**:

- ❌ **"Add weight parsing to each store extractor"** — 14 places to change, 14 places that can drift out of sync. Most extractors already have ad-hoc qty handling (Whole Foods has its own `qty_multiplier` logic) that would conflict.
- ✅ **Post-processor** — universal across stores because the printed pattern is the same regardless of which retailer printed it. Idempotent (won't overwrite extractor-set fields). Failure is silent (no enrichment attached) rather than wrong (phantom items).

**Tradeoffs**:
- The price-matching is fuzzy (within $0.05). On receipts with two items at the same price (rare but possible: "BANANAS 1.68 lb @ $0.99" and "STRAWBERRIES 1.68 lb @ $0.99" → both items at $1.66) we'd attach the weight info to whichever one was iterated first. We accept this; it's a cosmetic mislabel on edge cases.

---

## 9. Decision: Sync receipt dictionary from `standardized_ingredients`, not via runtime call

**What we did**: New script `lib/receipt-ocr/sync_dictionary.py` reads `standardized_ingredients.canonical_name` from Supabase, tokenizes to uppercase ASCII tokens (≥3 chars), writes them to `lib/receipt-ocr/standardized_vocab.txt`. The receipt dictionary loads this file at import time alongside the in-code builtins.

**Why this and not "query Supabase at parse time"**:

- ❌ **"Have `parse_receipt` query Supabase for the canonical vocab"** — adds a network call to the parser (which is intentionally stdlib-only). Breaks CI, breaks local dev, adds latency to every receipt.
- ❌ **"Query Supabase once at API startup and cache"** — better, but still adds a startup dependency on Supabase being reachable. Cold starts get slower.
- ✅ **Offline sync to a flat file** — the file is committed to git, diff-friendly, loadable in any environment. Re-run the script when you want a refresh.

**Why we don't replace the in-code dictionary entirely**:
- The in-code `_BUILTIN_TERMS` set is hand-curated for OCR confusion patterns ("BNANAS" → "BANANAS"). Some short tokens that the canonical vocab doesn't have but the parser benefits from (e.g., "ORGANIC", "WHOLE") are kept built-in.
- We layer: builtins ∪ COR-U vocab ∪ Supabase-synced vocab.

**Tradeoffs**:
- Vocab can drift if you forget to re-sync. We mitigate by documenting it in the script header and putting the script under `lib/` (visible) rather than `scripts/` (forgotten).
- ~13k canonical names × ~2 tokens each ≈ 25k entries. `difflib.get_close_matches` is O(n) per call; on a 30-item receipt that's ~750k comparisons (~50ms). Acceptable.

---

## 10. Decision: GPU is a separate Dockerfile + Fly config, not a runtime flag

**What we did**: Two Dockerfiles (`Dockerfile.python-api` for CPU, `Dockerfile.python-api.gpu` for CUDA) and two Fly configs (`fly.toml` for CPU, `fly.gpu.toml` for GPU). The GPU image swaps `paddlepaddle` for `paddlepaddle-gpu` and pulls CUDA-aware PyTorch wheels.

**Why split images**:

- ❌ **"Single image with `gpu=True if available else False`"** — the `paddlepaddle` Python wheel and `paddlepaddle-gpu` Python wheel are different packages. You can't have both installed. Same for CUDA torch vs CPU torch.
- ✅ **Build-time switch** — pick the deployment target up-front; smaller images, no runtime detection ambiguity.

**Why GPU is opt-in**:
- Fly GPU machines cost $0.50–$2/hour even when idle. A CPU machine costs ~$0.005/hour. For dev/staging, CPU is fine. For production at >100 receipts/hour, GPU pays for itself in latency.
- GPU machines can't scale to zero (cold start would be ~60s). The Fly config explicitly sets `min_machines_running = 1` for GPU and `0` for CPU.

**Tradeoffs**:
- Two images means two CI build paths if you want to keep both in sync. Today we don't run CI builds for either; that's an intentional choice (both are user-deployed).
- The GPU Dockerfile installs CUDA torch before the rest of requirements.txt to prevent easyocr from pulling CPU torch as a dep. This means requirements.txt order matters in the GPU image — documented in a comment.

---

## 11. Decision: LR-based calibrator is opt-in, refuses to train on small data

**What we did**: New script `lib/receipt-ocr/test/calibrate_recommender_lr.py`. Reads `calibration_results.json`, trains a multinomial logistic regression on (image_features → best_engine), writes weights into `recommender_config.json` (which `model_recommender.py` already loads at import time).

**Why opt-in**:
- The LR uses sklearn (~30MB). Adding it to runtime deps is wasteful — the calibrator only runs offline.
- The calibrator refuses to write weights when fewer than 5 examples per class exist. Training on 8 receipts produces wildly overfit weights that would be *worse* than the hand-tuned defaults. The check is conservative for a reason.

**Alternatives considered**:

- ❌ **"Train at API startup from live calibration data"** — turns deployment into a bigger blob (requires sklearn in production), adds startup latency, and risks shipping bad weights if the data quality is poor.
- ❌ **"Use grid search instead of LR"** — works for the existing 9 weights but doesn't capture interactions and doesn't give calibrated probabilities. LR is the smaller step from the existing hand-weights pattern.

---

## 12. Decision: CI gate is scaffolded but advisory until GT expands

**What we did**:
- Added `--json` and `--gate <path>` flags to `ocr_bench.py`.
- Created `lib/receipt-ocr/test/ci_gate.example.json` with conservative thresholds.
- Created `.github/workflows/ocr-accuracy-gate.yml` that runs the bench on PRs touching OCR code.

**Why this is "advisory":**
- The current GT set is **8 receipts**. Distinguishing 80% from 88% accuracy on 8 samples is statistically impossible — confidence intervals are ±15%.
- The gate catches catastrophic regressions (e.g., 84% → 50%) but cannot meaningfully detect 1–2% drifts.
- Real protection requires expanding the GT set to ≥100 receipts. That's annotation work, not engineering work.

**Why scaffold it now anyway**:
- Once the GT set expands, the gate works without further engineering. Inverting the order ("expand GT, then build the gate") leaves the gate as a never-finished todo.
- Catching catastrophic regressions is itself valuable; it would have caught the early-calibration bug where PaddleOCR was never run.

---

## 13. What we explicitly did NOT do

These were considered and rejected. Documenting them so they aren't reopened.

| ❌ | Why not |
|---|---|
| Add a `receipts` table | No consumer needs it; existing `pantry_items` + `ingredient_match_queue` already capture the data. Migration cost without value. |
| Verify JWTs in python-api | Auth lives in Next.js (Clerk). Python API trusts the proxy. Adding JWT verification would require a Clerk JWKS integration on the Python side and add latency to every request. The Next.js layer is the single trust boundary. |
| Persist receipt images | The architecture audit confirmed nothing reads or re-OCRs an image after the first parse. Storage costs without consumer. If a "show me my receipts" feature is ever built, this becomes the right time to add a Supabase Storage bucket. |
| Replace recipe Tesseract.js with server OCR | Recipes work fine with client-side OCR — they're text-heavy and noise-tolerant. Server OCR would add latency and cost without accuracy gain on the recipe domain. |
| Replace `parse_receipt` with an LLM call | Considered. GPT-4o-mini parses raw OCR text into structured receipts at ~$0.001/call. Faster to implement than the existing 2,400-LOC parser. Rejected for two reasons: (1) Cost scales linearly with traffic; the existing parser is free at any volume. (2) Hallucination risk is real on receipts (the LLM can "complete" missing items). The parser fails *closed* — wrong but conservative — while an LLM fails *open* — confidently wrong. We may revisit this for the long-tail of receipts where the parser fails entirely. |

---

## 14a. Diagnosing whether failures come from parsers, images, or labels

When you have a real GT dataset (like WildReceipt's 157 receipts), aggregate
accuracy ("84%") tells you the score but not where to invest. Use
`lib/receipt-ocr/test/diagnose_failures.py` to attribute every failing
field to one of three buckets:

- **PARSER** — the GT value appears in the OCR token stream, but the parser
  didn't pick it up. Fixable in code.
- **IMAGE** — the GT value isn't in the OCR stream and the OCR's mean
  confidence on that receipt is low. Fixable by better capture (lighting
  hints, retake prompts) or preprocessing (better deskew/denoising).
- **LABEL** — the GT value isn't in the OCR stream but the OCR confidence
  is high — i.e., OCR was readable, the value just isn't on the receipt.
  Fixable by auditing the ground-truth dataset.

How the heuristic works:

| GT value present in OCR? | OCR mean conf | Verdict |
|---|---|---|
| Yes | (any) | PARSER |
| No | > 0.6 | LABEL |
| No | ≤ 0.6 | IMAGE |

The 0.6 threshold is empirical and adjustable in
`diagnose_failures.py:_OCR_TRUSTWORTHY_THRESHOLD`. The script also
breaks the rollup down by image-quality bucket so you can answer "is
quality the actual ceiling?" — if even the high-quality images have a
poor pass rate, the parser is the bottleneck.

Usage:

```bash
# Run on WildReceipt with EasyOCR; write JSON + Markdown report.
python lib/receipt-ocr/test/diagnose_failures.py \
    --dataset wildreceipt --engine easyocr \
    --out /tmp/diagnosis.json --md /tmp/diagnosis.md

# Compare across engines:
python lib/receipt-ocr/test/diagnose_failures.py --dataset wildreceipt --engine paddle ...
python lib/receipt-ocr/test/diagnose_failures.py --dataset wildreceipt --engine ensemble ...

# Re-run the aggregation after tweaking the trust threshold (no OCR re-run):
python lib/receipt-ocr/test/diagnose_failures.py --reanalyse /tmp/diagnosis.json
```

What to do with the result:

- **PARSER share > 50%** → fix the parser. Easiest wins are usually in
  the store-specific extractors and the price-detection regexes.
- **IMAGE share > 50%** → invest server-side OCR effort (GPU, ensemble,
  better preprocessing) AND client-side capture UX (orientation hints,
  glare warnings, retake on low-confidence).
- **LABEL share > 20%** → audit the GT. The bucket should be small;
  spot-check the affected receipts in the per-receipt JSON.
- **Mixed (no clear winner)** → all three matter. Prioritise by what's
  cheapest to fix per percentage point; usually parser fixes are
  cheapest, label cleanup is medium, image quality is most expensive.

## 14. The path to 80–90% accuracy in <10s

Stage-by-stage expectations after these changes:

| Stage | Median latency | p99 latency | Expected accuracy on 8-receipt GT |
|---|---|---|---|
| Stage 1 only (recommender's pick on CPU) | ~5s | ~10s | ~60% |
| Stage 1 only (recommender's pick on GPU) | ~1s | ~2s | ~60% |
| Full chain on CPU | ~6s | ~15s ⚠ | ~84% |
| **Full chain on GPU** | **~1.5s** | **~5s** | **~84%** |
| Full chain on GPU + 100-receipt LR-calibrated recommender | ~1.5s | ~5s | **est. 87–90%** |

The bracketed line is the production target. To hit it:

1. Deploy with `Dockerfile.python-api.gpu` + `fly.gpu.toml`.
2. Run `sync_dictionary.py` once to populate `standardized_vocab.txt`.
3. Annotate ≥100 receipts (not engineering — your call on cadence).
4. Run `calibrate_recommender.py` then `calibrate_recommender_lr.py` to produce `recommender_config.json`.
5. Deploy. The CI gate (already scaffolded) will start guarding regressions.

What's NOT on the path — and why:
- A learned token-classifier replacing the 14 store extractors. Listed in the original audit; it's a 1–2 month research project that would need ≥200 annotated receipts. Defer.
- Persisting receipt images for re-OCR. No consumer; defer until there is one.
- Authenticating python-api. Wrong layer (see §13).

---

## 15. Files changed in this pass

For grep convenience:

- `lib/receipt-ocr/engines.py` — new; lifted from `test/ocr_bench.py`
- `lib/receipt-ocr/preprocessing.py` — added EXIF + OCR-confidence orientation helpers
- `lib/receipt-ocr/receipt_parser.py` — multi-column boundary detection; weight/qty post-processor
- `lib/receipt-ocr/receipt_dictionary.py` — load `standardized_vocab.txt` if present
- `lib/receipt-ocr/sync_dictionary.py` — new; Supabase → vocab file
- `lib/receipt-ocr/test/ocr_bench.py` — refactored to import from `engines.py`; added `--json`/`--gate` flags
- `lib/receipt-ocr/test/calibrate_recommender_lr.py` — new; LR-based calibrator
- `lib/receipt-ocr/test/ci_gate.example.json` — new; gate threshold schema
- `python-api/main.py` — added `/receipt/scan` endpoint with full escalation chain
- `python-api/requirements.txt` — added `easyocr`, `paddleocr`, `paddlepaddle`, `opencv-python-headless`, `numpy`
- `python-api/fly.gpu.toml` — new; GPU Fly deployment config
- `backend/docker/Dockerfile.python-api` — added system deps for cv2; copy `lib/` into image
- `backend/docker/Dockerfile.python-api.gpu` — new; CUDA variant
- `app/api/receipt/scan/route.ts` — new; Next.js proxy with persistence forward
- `.github/workflows/ocr-accuracy-gate.yml` — new; CI accuracy gate

Test impact: 215/215 parser unit tests pass after all changes. Receipt-OCR integration tests (which require `cv2`) are unchanged structurally.
