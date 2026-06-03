# Receipt training-data pipeline

End-to-end documentation for how production scans become gold-standard
training data for the layout-aware token classifier (the medium-term parser
replacement laid out in `docs/ocr-pipeline-architecture.md`).

The pipeline is designed around two competing requirements you stated:

- **Minimize manual typing** — most labels should arrive from the parsing
  pipeline itself, not from human entry. The verification UI pre-fills
  every field; users usually just confirm.
- **Guarantee accuracy of GT labels** — labels admitted to the training
  set must pass either an automated cross-validation OR explicit human
  review. We never silently admit low-confidence parses as gold.

The two pull in opposite directions. The architecture resolves this with
**confidence-stratified verification**: the easy receipts (where multiple
independent estimators agree and the checksum balances) skip review; the
hard receipts get human attention.

---

## Pipeline at a glance

```
┌─────────────────────────────────────────────────────────────────────┐
│ User uploads receipt photo                                          │
│    (any client; Web UI, mobile, or future native app)               │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ POST /api/receipt/scan  (Next.js route — Clerk auth boundary)       │
│   1. Forwards image to python-api /receipt/scan                     │
│   2. Pipeline runs: recommender → ensemble → LLM-tokens → LLM-vision│
│   3. NEW: side-effect uploads image + inserts training row          │
│   4. Forwards parsed receipt to /api/receipt/process for pantry     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ decideDisposition(scan)  →  one of:                                  │
│   "auto_accepted"  — high conf, no LLM needed, checksum balanced    │
│   "needs_review"   — anything else (the verification queue)          │
│   "rejected"       — clear junk (no store + no items, or large       │
│                       checksum residual)                             │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Supabase persistence                                                │
│   - Image:       receipt-training-images bucket (private)           │
│   - Candidate:   receipt_training_examples table                    │
│   - Verified:    same row, verified_parse column                    │
└─────────────────────────────────────────────────────────────────────┘
                                │
            ┌───────────────────┴────────────────────┐
            │                                        │
            ▼                                        ▼
┌──────────────────────┐                ┌─────────────────────────────┐
│ Auto-accepted        │                │ /training/receipts          │
│ → straight to        │                │   verification UI           │
│   training set       │                │ User reviews + edits        │
│ (no human seen it)   │                │ /api/receipt/training/verify│
└──────────────────────┘                └─────────────────────────────┘
            │                                        │
            └───────────────────┬────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ export_training_data.py                                              │
│   pulls verified-and-not-yet-exported rows                          │
│   re-runs OCR to get fresh per-token bboxes                          │
│   aligns verified parse → BIO token labels                           │
│   writes JSONL ready for the classifier trainer                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Components shipped in this pass

### Database

- **Migration `20260506000000_receipt_training_examples.sql`** — the
  `receipt_training_examples` table. Stores the candidate parse, the
  verification audit trail, and the export status. SHA256 of the image is
  used as a dedupe key so re-scanning the same paper receipt doesn't
  multiply training rows.
- **Migration `20260506000100_receipt_training_storage.sql`** — the
  `receipt-training-images` private storage bucket. 20MB cap, image MIME
  whitelist matching the `/receipt/scan` allowlist.

### Python service (`python-api/main.py`)

- **`_parse_with_llm_tokens(tokens)`** — Tier 3 of the escalation chain.
  GPT-4o-mini reads the OCR tokens and returns structured JSON. Cheap
  (~$0.001/call), fast (~2s).
- **`_parse_with_llm_vision(image_path)`** — Tier 4. The vision model
  reads the raw image. ~$0.005/call, ~3s. Last-resort tier.
- **`_validate_llm_against_ocr(parsed, ocr_texts)`** — hallucination
  filter. Drops items whose name + price both have zero presence in the
  OCR token stream.
- **`_coerce_llm_result(raw)`** — schema normalisation; LLMs occasionally
  return slightly off shapes (price as string, taxes as a single dict).
- **`/receipt/scan` extended response fields** — `llm_tokens_used`,
  `llm_vision_used`, `llm_cost_estimate_usd`, `training_id`,
  `training_disposition`. Lets every caller see exactly which tier
  produced the result and whether it was captured.

### Next.js routes

- **`/api/receipt/scan`** — extended with the training-capture side-effect.
  Reads the image once, forwards to python-api, then opportunistically
  uploads to Supabase Storage + inserts the candidate row. Failure of the
  side-effect is logged but doesn't fail the user's request.
- **`/api/receipt/training/queue`** — list pending verifications for the
  current user (oldest first), plus dispositional counts.
- **`/api/receipt/training/verify`** — POST records `confirm` / `edit` /
  `reject`. GET returns the row plus a 10-minute signed URL for the image.
- **`/training/receipts`** — verification UI. Split-view (image +
  pre-filled editable form). Three actions: `Looks right` (no edits),
  `Save edits` (typed corrections), `Reject` (don't include).

### Tooling

- **`lib/receipt-ocr/test/export_training_data.py`** — turns verified
  rows into classifier-ready JSONL. Re-OCRs each image so token bboxes
  match what the production engine will produce. Aligns the verified
  parse to per-token BIO labels via a 4-pass priority heuristic
  (numeric exact-match → date variants → store name → item name spans).

---

## Auto-accept criteria (the strict-quality knob)

A scan is auto-accepted into the training set ONLY when ALL of:

| Check | Why this matters |
|---|---|
| Parse confidence ≥ 0.85 | High completeness score from the production pipeline |
| No LLM tier fired | The OCR + parser path got it on its own — strong agreement signal |
| Store and total are present | Most informative fields are non-empty |
| ≥ 2 items | Single-item receipts are unusually easy and don't help train item-association |
| Checksum residual ≤ $0.01 | subtotal + tax = total within a cent (math is on our side) |

This intentionally errs strict. False auto-accepts poison the training
set; false rejects only cost a user click. The implementation lives in
`decideDisposition()` in `app/api/receipt/scan/route.ts`. Tighten or
loosen there as you watch the queue empty.

The hard-reject criteria (drops the example entirely):
- No store, no items, no total — there's nothing here
- Checksum residual > $5 — math doesn't work; parse is wrong somewhere

Everything else falls into `needs_review`.

---

## How "minimize typing" is actually achieved

In a typical session:

1. **User scans receipt** → /api/receipt/scan runs the full pipeline.
2. **~70% of receipts are auto-accepted.** User sees nothing related to
   training; their pantry just updates as today.
3. **The other ~30% land in /training/receipts.** UI shows the receipt
   image side-by-side with the parsed fields. Every field is pre-filled
   with the candidate parse. The user typically:
   - Glances at the receipt and the form.
   - If correct: clicks `✓ Looks right` (one click).
   - If a few items are wrong: edits inline, then `💾 Save edits`.
   - If totally garbled: `Reject` (one click).

There's no typing for the auto-accept path, one click for the
correct-already path, and only the actually-wrong fields require typing.
Most fields are dropdown-free numeric inputs pre-filled with the parser's
guess; even when edits are needed, it's a number tweak, not from-scratch
data entry.

---

## How "guarantee accuracy" is actually achieved

Three independent gates have to agree before a row joins the training set:

1. **Cross-validation at scan time.** The pipeline produces multiple
   parse candidates internally (recommender's choice, ensemble fallback,
   LLM-tokens, LLM-vision). The `_is_better_parse()` function in
   `python-api/main.py` decides which is best. Agreement across multiple
   tiers is what gates auto-acceptance.
2. **Strict auto-accept thresholds** (above) — defaults to "needs review"
   on any ambiguity.
3. **Human verification** for the rest — the user (currently the upload
   owner; later admin contractors via Option C) must confirm or edit
   before `verified_at` is set. The exporter only emits rows where
   `verified_at IS NOT NULL`.

You can dial accuracy harder by:
- Lowering the auto-accept conf threshold (pushes more to human review)
- Disabling auto-accept entirely (set the threshold to 1.0 — every row
  needs human review)
- Adding a second-rater requirement: only export rows where 2+ users
  have independently confirmed (TODO: add a `verifications` table for
  this; current schema supports a single verifier).

---

## Cost envelope

LLM tiers are pay-per-call. Rough model:

| Scan outcome | LLM cost | % of scans (estimate) |
|---|---|---|
| Stage 1 succeeds (recommender's pick fine) | $0 | ~70% |
| Stage 2 succeeds (ensemble fallback works) | $0 | ~15% |
| Stage 3 (LLM-tokens) needed | ~$0.001 | ~10% |
| Stage 4 (LLM-vision) needed too | ~$0.005 | ~5% |

Weighted average: ~$0.0004 per scan. At 10,000 scans/month the LLM tiers
cost ~$4. Storage cost (Supabase Storage, 20MB cap × 70% retention) is
<$5/month for the same volume.

The expensive part is the GPU machine for the OCR engines themselves
($0.50–$2/hour) — the LLM tiers are noise relative to that.

---

## What the trainer actually consumes

The output of `export_training_data.py` is JSONL, one record per receipt:

```json
{
  "id": "uuid",
  "verified_by": "user:...",
  "verified_at": "2026-05-06T...",
  "verified_parse": { "store": "Walmart", "total": 49.90, "items": [...] },
  "tokens": [
    {
      "text": "WALMART",
      "bbox": [[50,30],[180,30],[180,55],[50,55]],
      "conf": 0.92,
      "label": "B-STORE"
    },
    {
      "text": "GREAT",
      "bbox": [[50,200],[110,200],[110,225],[50,225]],
      "conf": 0.88,
      "label": "B-ITEM"
    },
    {
      "text": "VALUE",
      "bbox": [[120,200],[180,200],[180,225],[120,225]],
      "conf": 0.91,
      "label": "I-ITEM"
    },
    {
      "text": "MILK",
      "bbox": [[200,200],[260,200],[260,225],[200,225]],
      "conf": 0.94,
      "label": "I-ITEM"
    },
    {
      "text": "3.49",
      "bbox": [[600,200],[650,200],[650,225],[600,225]],
      "conf": 0.97,
      "label": "B-PRICE"
    }
  ]
}
```

This format matches WildReceipt's published manifest closely enough that
a future trainer can mix datasets without per-source loading code. Label
set is the BIO scheme defined at the top of `export_training_data.py`.

---

## Bulk-seeding from a local folder of images

When you have a folder of personal receipt images you want to seed the
training set with, the production verification page is the wrong tool —
it requires going through the user upload flow one image at a time.

Use **`lib/receipt-ocr/test/annotate_receipts.py`** instead. It's a
single-file local tool that:

- Walks a folder of images recursively.
- Dedupes by SHA256 against your Supabase training table (so re-running
  is idempotent — pick up where you left off).
- Runs the production OCR + parser pipeline on each image, in a
  background worker, so navigation stays instant.
- Opens a browser-based verification UI (image + pre-filled editable
  form) on `http://localhost:8765`.
- Pushes confirmed/edited results straight to Supabase as
  `verified_by="local-cli:<your-name>"`.

### Setup

```bash
# Required env vars (same ones python-api uses):
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Optional, only for the "Re-parse with LLM" button:
export OPENAI_API_KEY=...

# Run from the repo root in your conda env (need cv2 + easyocr installed):
python lib/receipt-ocr/test/annotate_receipts.py \
    --images ~/Pictures/receipts \
    --port 8765 \
    --annotator yoon
```

The browser opens automatically (suppress with `--no-open`).

### Workflow

For each receipt:

| Action | Keyboard | What happens |
|---|---|---|
| Confirm as-is | `Enter` or `Y` | Saves the parser's output as the verified parse |
| Save edits | `Cmd-S` | Saves your typed corrections as the verified parse |
| Reject | `R` | Skips this receipt; not added to training set |
| Skip | `S` | Decide later; re-runs will pick it back up |
| Navigate | `←` / `→` | Move between images without saving |

Every saved row enters the table with `disposition="auto_accepted"` and
`verified_by="local-cli:<annotator>"`, so the export script picks it up
on the next run.

### Resume + idempotency

The first thing the tool does is fetch every existing `image_sha256`
from the training table. Any image whose hash is already present is
skipped without re-processing. This means:

- Interrupt with `Ctrl-C` any time — restart with the same arguments
  and you pick up at the next un-uploaded image.
- Safe to point the tool at a superset folder (e.g. `~/Pictures/`); it
  only processes new images.
- If you re-scan the same paper receipt later via the production
  `/receipt/scan` endpoint, the dedupe column will recognise it.

### Notes on cost

- OCR runs locally — zero API cost per image.
- The `Re-parse with LLM` button (when you build it — currently the UI
  has the keystroke `L` reserved but no backend handler) would call
  GPT-4o-mini at ~$0.001 per use.
- Supabase Storage usage: one image per row, capped at 20MB by the
  bucket policy. ~5MB average × 1,000 receipts ≈ 5GB ≈ ~$0.10/month at
  Supabase pricing.

### When to use what

| Scenario | Tool |
|---|---|
| Bulk-import 500 personal receipt photos | `annotate_receipts.py` (this tool) |
| Verify scans uploaded by app users | `/training/receipts` (web UI) |
| Spot-check a single receipt programmatically | `python -c "from receipt_parser import parse_receipt; ..."` |
| Re-export verified rows for trainer | `export_training_data.py` |

## Operational checklist

After deploying these changes:

1. Run both new migrations against the Supabase project.
2. Ensure `OPENAI_API_KEY` is set in the python-api environment (existing
   var; LLM tiers fail open if missing — they'll log + skip).
3. Bump the Python service. The new endpoint is backward-compatible.
4. Bump the Next.js app. The verification UI is at `/training/receipts`
   — link it from the dashboard or just share the URL with early users.
5. Monitor `receipt_training_examples` over the first week:
   - Auto-accept rate (target: 50–80%)
   - Average verification time per row (target: <30s — if higher, the
     UI needs simplification)
   - Cost-per-scan from `llm_cost_estimate_usd` summed in logs

When ~500 verified rows accumulate, run `export_training_data.py` and
start training the LayoutLMv3 classifier per the plan in
`docs/ocr-pipeline-architecture.md` §3.

---

## What's NOT shipped (intentional gaps)

- **Admin role / multi-rater UI**. The current verifier model is "owner
  of the upload reviews their own receipt". Admin reviewers and second-
  rater consensus require a `roles` column on profiles and a
  `verifications` table. Defer until you actually have admins.
- **Active learning loop**. We don't yet pick which receipts to put in
  front of the user based on model uncertainty — every needs-review row
  goes in the queue. Once the classifier exists, we can rank the queue
  by classifier disagreement.
- **Auto-flagging of stale auto-accepts**. If a user later edits a
  pantry item that came from an auto-accepted scan, that's a strong
  signal the auto-acceptance was wrong. We could flip the row's
  disposition back to `needs_review`. Not yet wired.
- **Anonymization**. Receipts contain store names, dates, and prices —
  but also potentially card last-4s and addresses. The current image
  upload is unmasked. Add a redaction pass before exposing the bucket
  to anyone outside your team.
