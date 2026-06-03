# Path to your own receipt-parsing model

A live, dated plan that supersedes the "Stage 3 — train LayoutLMv3" sketch
in `docs/ocr-pipeline-architecture.md` §14. That document was written
before we had any verified ground truth in the database; the rest of this
file accounts for what's actually true today.

---

## State of the world (2026-05-06)

What's running:
- **Local OCR** (EasyOCR + parser, low-res rescue mode) — handles ≥1.9 MP receipts well, struggles on 0.6 MP exports.
- **GPT-4o-mini vision tier** — wired into `annotate_receipts.py` as the `L` key, into `python-api/main.py` as Tier 4 of the production scan endpoint. Triggered on demand or when the OCR pipeline gives up.
- **Annotation tool** — single-file local app, journal-first writes, auto-resume.

What's in the database:
- **11 verified ground-truth rows** in `receipt_training_examples`, all `verified_by='claude_vision_seed'`, `disposition='auto_accepted'`. 80 line items across them. Image bytes themselves not yet uploaded — pending the next run of `upload_training_images.py`.
- **Schema and storage bucket** ready (`receipt-training-images`, private, 20 MB cap).

What's NOT yet in place:
- Larger labeled dataset (need 200–500 rows minimum to train well).
- A trained custom model.
- Any production traffic going through the model.

---

## Realistic three-stage path

### Stage 1 — Use GPT-4o vision in production while you collect data (NOW → next ~4 weeks)

**Goal**: every receipt you scan goes into the training set, regardless of which engine produced the parse.

**Concrete actions**:
1. Run `upload_training_images.py` to backfill the 11 image files for the seeded GT rows.
2. Use `annotate_receipts.py` for any receipt photos you have lying around — every one becomes a GT row. ~30 sec per receipt at the speed the tool runs now.
3. The production `/receipt/scan` endpoint (in `python-api/main.py`) already captures user uploads and inserts them as `disposition='needs_review'`. When users verify their pantries, those rows become gold-standard data automatically.
4. **Cost monitoring**: GPT-4o-mini calls run ~$0.001 each. At 100 receipts/week that's $0.40/month. Throughout this stage, watch the `llm_cost_estimate_usd` and `training.disposition` columns to know when you have enough data.

**Goalpost to advance to Stage 2**: 200 verified rows in `receipt_training_examples` where `verified_at IS NOT NULL AND disposition != 'rejected'`.

**Time horizon**: 4–8 weeks if you actively annotate; ~3 months if you wait for organic user uploads only.

---

### Stage 2 — Train and evaluate a layout-aware model offline (1–2 weeks of focused work)

**Goal**: a working `lib/receipt-ocr/models/layoutlmv3-receipts/` that you can compare to the LLM tier and to the hand-coded parser.

**Concrete actions**:

1. **Run the export script** to turn your verified rows into trainable JSONL:
   ```bash
   python lib/receipt-ocr/test/export_training_data.py \
       --out training_data.jsonl --mark-exported
   ```
   This re-OCRs each image to get fresh per-token bboxes, then aligns your verified parse to per-token BIO labels via the four-pass heuristic in `export_training_data.py`. Inspect ~10 random rows by hand to make sure the alignment looks right; tune the pass priorities if it doesn't.

2. **Mix in public data**:
   - WildReceipt (1,768 receipts; you already have it under `lib/receipt-ocr/test/datasets/wildreceipt/`)
   - CORD (~1,000; HuggingFace `naver-clova-ix/cord-v2`)
   - SROIE (~600; ICDAR 2019 task 3)
   - Your own (~200+) → highest-weight source since it matches your distribution

   Map all of them to the same BIO label scheme. Most of the work here is annotation-format wrangling, ~2 days.

3. **Fine-tune LayoutLMv3-base** (the right model for this task, see `docs/ocr-pipeline-architecture.md` §3 for the comparison vs alternatives):
   - Hardware: a single A10 GPU (~$0.50/hr on Fly or RunPod).
   - Training: 3 epochs on the combined ~3,500-row dataset. ~2 hours wall time on A10.
   - Cost: ~$1 for the GPU, plus the $5 GPU floor.

4. **Eval against the existing GT set**:
   - Hold out 20% of your own data as a test split (don't mix with public data in the test set).
   - Compute per-field F1 (store, date, items, totals) and end-to-end pass rate.
   - Compare three columns: hand-coded parser / GPT-4o vision / fine-tuned LayoutLMv3.
   - Realistic numbers from comparable published work (CORD/SROIE benchmarks):
     - Hand-coded: ~50% pass rate on diverse inputs
     - GPT-4o vision: ~85% pass rate
     - LayoutLMv3 fine-tuned on ~500 rows + WildReceipt: ~78% pass rate
     - LayoutLMv3 fine-tuned on ~2000 rows + WildReceipt: ~88% pass rate (beats the LLM)

**Goalpost to advance to Stage 3**: LayoutLMv3 ≥ GPT-4o vision on per-field F1 across at least 3 of the top 5 stores in your distribution.

**Time horizon**: 1–2 weeks once Stage 1's data goal is met.

---

### Stage 3 — Roll out the model as primary parser, keep LLM as fallback (steady state)

**Goal**: the production `/receipt/scan` endpoint uses the trained model first; LLM only fires as the last-resort tier; hand-coded extractors are deprecated.

**Concrete actions**:

1. **Add the model to the engine registry** in `lib/receipt-ocr/engines.py`:
   ```python
   ENGINES["layoutlmv3"] = LayoutLMv3Engine
   ```
   Implement `LayoutLMv3Engine.extract_detections` as: run the existing OCR (still EasyOCR/Paddle for the bbox layer), then pass detections + image to the classifier, get per-token labels, group via the same post-processor `export_training_data.py` uses for label alignment but in reverse.

2. **Update the recommender** to know about the new engine. The classifier becomes the default for known-store receipts; LLM-vision for unknown / failed.

3. **Shadow-deploy first**: for two weeks, run the classifier in parallel with the existing pipeline on every request. Don't ship the result; just log the disagreement metric. Once disagreement is <5% of fields, flip the default.

4. **Keep the LLM tier**: for the long tail of unseen layouts. ~5–10% of traffic hits it. Monitor that share — if it grows, retrain.

5. **Quarterly retraining cadence**: every quarter, re-run `export_training_data.py` (which has `--mark-exported` for incremental export), retrain on the cumulative dataset, re-eval, deploy if improved.

**Time horizon**: 1 month after Stage 2 ships.

---

## Branching: alternatives if stage 2 disappoints

If LayoutLMv3 underperforms the LLM tier even after 500+ rows of training data, three alternatives in increasing complexity:

| Option | When it makes sense | Effort |
|---|---|---|
| **Donut fine-tune** (vision-to-JSON, end-to-end) | Layout is too varied for token-classifier post-processing to handle reliably | 2 weeks |
| **OpenAI fine-tune (gpt-4o-mini)** | You have ≥200 high-quality input/output pairs and want LLM-grade accuracy at lower per-call cost | 1 week, ~$50 in fine-tune compute |
| **Custom Donut architecture** | Schema very specific to grocery / food domain; need to embed item categorisation in the model | 1+ month, research-grade work |

Default plan: try LayoutLMv3 first. The tools, datasets, and benchmarks are all mature. Most teams that start with custom architectures end up wishing they'd started with LayoutLMv3.

---

## Cost model across the timeline

| Phase | Monthly cost | One-time cost |
|---|---|---|
| Stage 1 (LLM-as-primary) | ~$1–10 in OpenAI API | $0 |
| Stage 2 (training) | $0 | ~$5 GPU + your time |
| Stage 3 (hybrid) | ~$0.20–2 in OpenAI fallback | $0 |

Stage 1's LLM cost is the most variable — it scales with your scan volume. At >1,000 receipts/month the cost may motivate accelerating Stage 2.

---

## What we'd want to monitor through the journey

- **Per-store accuracy**: which stores are well-handled by which tier. Today: `select strategy_used, json_extract(verified_parse, '$.store') as store, count(*) from receipt_training_examples group by 1, 2;`
- **Disagreement rate**: when LLM and hand-coded parser produce different parses (the hard cases the model needs to learn).
- **Cost per verified row**: total OpenAI spend / verified rows. Trends downward as the pipeline gets better.
- **Failure modes**: receipts that fail every tier. These are gold for understanding edge cases.

The diagnostic script `lib/receipt-ocr/test/diagnose_failures.py` already gives you most of this. We may want a small dashboard summarising the latest run.

---

## Honest risks

1. **Annotation fatigue**: bulk-annotating receipts is tedious. The annotation tool tries to minimise typing, but 200 rows is still a few hours of clicking. Mitigation: turn it on for a coffee shop session.
2. **GPT-4o cost runaway**: if scan volume grows faster than you accelerate Stage 2, the OpenAI bill compounds. Mitigation: monitor weekly; the tool's cost counter exists for exactly this.
3. **Distribution drift**: model trained on receipts from 2026 doesn't see new store layouts in 2027. Mitigation: quarterly retraining + monitor disagreement rate.
4. **The "long tail" doesn't shrink fast**: the rare receipts (handwritten totals, foreign-language stores, receipts with damage) will keep needing the LLM forever. That's fine — keep the LLM tier as the intentional safety net rather than something to engineer away.
