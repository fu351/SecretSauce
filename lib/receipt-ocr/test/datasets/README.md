# Receipt OCR Datasets

External grocery-receipt resources used by the bench and dictionary.

## Layout

```
datasets/
├── wildreceipt_filter.py        # → grocery receipts with per-receipt GT
├── coru_vocab.py                # → English grocery vocabulary
├── wildreceipt/
│   ├── ground_truth.json        # committed
│   ├── images/                  # gitignored (~150–400 receipts)
│   └── raw/                     # gitignored (mmocr tarball cache)
└── coru/
    ├── grocery_vocab.txt        # committed — feeds receipt_dictionary
    ├── grocery_vocab_meta.json  # committed — class breakdown
    └── raw/                     # gitignored (HF cache)
```

## Setup

```bash
pip install datasets huggingface_hub pillow requests
```

## WildReceipt — actual receipt GT

Per-receipt structured annotations (NER tags 1=store, 11=item, 15=price,
19=total, …). Filter is by grocery-merchant allowlist (Walmart, Kroger,
Whole Foods, Trader Joe's, etc.).

```bash
python wildreceipt_filter.py --dry-run            # validate matches first
python wildreceipt_filter.py                      # ~400 MB image download
python wildreceipt_filter.py --extra-merchants "FOO MART,BAR FOODS"
```

The HF parquet only stores image *paths*, so the script also pulls the
original tarball from `download.openmmlab.com`.

## CORU vocabulary — English grocery terms

CORU's IE subset turned out to be a flat product catalog (item names,
brands, classes), not per-receipt GT. We use it as a vocabulary source
for `receipt_dictionary.GROCERY_TERMS`.

```bash
python coru_vocab.py
python coru_vocab.py --exclude-classes "Cleaning & Laundry,Personal Care"
python coru_vocab.py --min-token-len 4
```

Outputs:
- `coru/grocery_vocab.txt` — one uppercase token per line. Loaded
  automatically by `receipt_dictionary.py` and merged into
  `GROCERY_TERMS`.
- `coru/grocery_vocab_meta.json` — class breakdown + sample items for
  inspection.

### CORU per-receipt GT — not pursued

Building per-receipt GT from CORU would require joining `Receipt/`
(YOLO/COCO bboxes) with `OCR/` (text-line crops). The IE catalog alone
has no `receipt_id` and most rows have empty prices, so this path was
dropped in favour of WildReceipt for actual receipt GT.

## Bench integration

`ocr_bench.py` loads external datasets via `--dataset`:

```bash
python ocr_bench.py --dataset wildreceipt
python ocr_bench.py --dataset wildreceipt --recommend
```

Expects `datasets/<name>/ground_truth.json` and `datasets/<name>/images/`.
GT shape matches the inline `GROUND_TRUTH` dict in `ocr_bench.py`.
