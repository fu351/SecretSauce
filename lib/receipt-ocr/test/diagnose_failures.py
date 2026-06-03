#!/usr/bin/env python3
"""
diagnose_failures.py
====================
Attribute receipt-OCR failures to one of three causes:

    PARSER   — OCR found the right value; the parser missed it.
    IMAGE    — OCR couldn't read the value (low confidence in that region).
    LABEL    — Value isn't on the receipt at all; ground truth is wrong.

Why this exists
---------------
Aggregate accuracy numbers ("84% pass") tell you the pipeline's score but not
*where* the cost is. Spending a week tuning the parser when the real bottleneck
is image quality would be wasted effort. This script diagnoses every failing
receipt and rolls up the verdicts so you can prioritise.

Method
------
For each receipt + GT pair:
  1. Run the configured OCR engine, collect detections (text + confidence).
  2. Run the parser on the resulting tokens.
  3. For each GT field where parser disagrees with GT:
       a. Search the OCR token stream for the GT value.
            - For prices: exact float match within $0.01.
            - For strings (store, item names): case-insensitive substring match.
            - For dates: match either ISO ("2017-12-22") or any common
              printed format ("12/22/17", "12-22-2017", etc).
       b. Bucket the failure:
            • Found in OCR  → PARSER fault
            • Not found, mean OCR conf > 0.6  → LABEL fault (image is readable
              but the value just isn't there)
            • Not found, mean OCR conf <= 0.6 → IMAGE fault (OCR struggled)
  4. Aggregate per-receipt verdicts into a top-level distribution.

The verdict is a heuristic; treat the buckets as directional. Spot-check the
LABEL bucket by hand (it's usually the smallest and the most actionable: one
or two GT errors can be corrected; image quality requires capture-side work;
parser bugs require code).

Usage
-----
    # Default: WildReceipt with EasyOCR
    python diagnose_failures.py

    # Specific engine + dataset:
    python diagnose_failures.py --dataset wildreceipt --engine ensemble

    # Sample 30 receipts for a quick look:
    python diagnose_failures.py --limit 30

    # Write JSON + Markdown report:
    python diagnose_failures.py --out /tmp/diagnosis.json --md /tmp/diagnosis.md

    # Skip the OCR pass and re-analyse a saved JSON (faster iteration):
    python diagnose_failures.py --reanalyse /tmp/diagnosis.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

# ── Module loaders (mirrors ocr_bench.py pattern) ──────────────────────────

_TEST_DIR = Path(__file__).resolve().parent
_LIB_DIR = _TEST_DIR.parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(name, mod)
    spec.loader.exec_module(mod)
    return mod


# receipt_parser is stdlib-only and safe to import at module load.
# ocr_bench and image_features pull cv2 / easyocr — defer to first call.
_parser_mod = _load("receipt_parser", _LIB_DIR / "receipt_parser.py")
parse_receipt = _parser_mod.parse_receipt

_bench_mod = None
_features_mod = None


def _ensure_heavy_modules() -> None:
    """Lazy-load cv2-bound modules. Called from main() after argparse."""
    global _bench_mod, _features_mod
    if _bench_mod is None:
        _bench_mod = _load("ocr_bench", _TEST_DIR / "ocr_bench.py")
    if _features_mod is None:
        _features_mod = _load("image_features", _LIB_DIR / "image_features.py")


# ── Configuration ──────────────────────────────────────────────────────────

# Mean OCR confidence above which we consider OCR "trustworthy" enough to
# rule out image-quality issues. 0.6 is empirical — adjust if your engine
# returns systematically higher or lower confidences.
_OCR_TRUSTWORTHY_THRESHOLD = 0.6

# Price-equality tolerance used for both parser-vs-GT comparison and
# "is this price in the OCR stream" search.
_PRICE_TOLERANCE = 0.01

# Substring-match minimum length. Below this, false positives swamp signal
# ("$" appearing somewhere doesn't mean we found the right value).
_MIN_SUBSTRING_LEN = 3


# ── Verdict bucket constants ──────────────────────────────────────────────

V_PARSER = "parser"
V_IMAGE = "image"
V_LABEL = "label"
V_OK = "ok"  # field passed; no fault to attribute


# ── Field-level diagnostic helpers ────────────────────────────────────────


def _norm_price(s: str) -> float | None:
    """Extract the first plausible price from a string, or None."""
    m = re.search(r"\d{1,4}[.,]\d{2}", s)
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "."))
    except ValueError:
        return None


def _ocr_contains_price(target: float, ocr_texts: list[str]) -> list[str]:
    """Return the list of OCR token strings whose embedded price matches target.

    Uses both the raw token text and the parser's normalised version of it.
    """
    hits: list[str] = []
    for t in ocr_texts:
        for candidate in (t, _parser_mod.normalise_token(t)):
            p = _norm_price(candidate)
            if p is not None and abs(p - target) <= _PRICE_TOLERANCE:
                hits.append(t)
                break
    return hits


def _ocr_contains_substring(target: str, ocr_texts: list[str]) -> list[str]:
    """Case-insensitive substring search across OCR tokens. Returns matching tokens."""
    if not target or len(target) < _MIN_SUBSTRING_LEN:
        return []
    needle = target.upper().strip()
    hits = []
    for t in ocr_texts:
        if needle in t.upper():
            hits.append(t)
    return hits


def _ocr_contains_date(target_iso: str, ocr_texts: list[str]) -> list[str]:
    """Look for the date in any common printed format.

    Accepts ISO ("2017-12-22") or ordinal/slash forms ("12/22/2017",
    "12-22-17", "DEC 22 2017", etc.).
    """
    try:
        y, m, d = target_iso.split("-")
        y2 = y[-2:]
    except ValueError:
        return []
    candidates = [
        f"{m}/{d}/{y}", f"{m}/{d}/{y2}", f"{m}-{d}-{y}", f"{m}-{d}-{y2}",
        f"{d}/{m}/{y}", f"{d}/{m}/{y2}", f"{d}-{m}-{y}", f"{d}-{m}-{y2}",
        target_iso,  # exact
    ]
    # Also try short month names
    months_short = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    try:
        mn = months_short[int(m) - 1]
        candidates.extend([
            f"{mn} {int(d)}, {y}", f"{mn} {int(d)} {y}", f"{int(d)} {mn} {y}",
        ])
    except (ValueError, IndexError):
        pass

    hits = []
    for t in ocr_texts:
        upper = t.upper()
        for c in candidates:
            if c.upper() in upper:
                hits.append(t)
                break
    return hits


def _diagnose_field(
    field: str, gt_value: Any, parsed_value: Any,
    ocr_texts: list[str], ocr_mean_conf: float,
) -> dict:
    """Produce a single field-level diagnostic record."""
    record: dict = {
        "field": field,
        "gt_value": gt_value,
        "parsed_value": parsed_value,
        "ocr_evidence": [],
    }

    # ── Did parser get it right? ─────────────────────────────────────
    if field in ("total", "subtotal"):
        passed = (
            parsed_value is not None
            and abs(float(parsed_value) - float(gt_value)) <= _PRICE_TOLERANCE
        )
    elif field == "store":
        passed = (
            parsed_value is not None
            and str(parsed_value).strip().upper() == str(gt_value).strip().upper()
        )
    elif field == "date":
        passed = (parsed_value == gt_value)
    elif field == "min_items":
        passed = (parsed_value is not None and parsed_value >= gt_value)
    else:
        passed = (parsed_value == gt_value)

    if passed:
        record["verdict"] = V_OK
        return record

    # ── Was the GT value visible in OCR? ─────────────────────────────
    evidence: list[str] = []
    if field in ("total", "subtotal"):
        try:
            evidence = _ocr_contains_price(float(gt_value), ocr_texts)
        except (TypeError, ValueError):
            evidence = []
    elif field == "store":
        evidence = _ocr_contains_substring(str(gt_value), ocr_texts)
    elif field == "date":
        evidence = _ocr_contains_date(str(gt_value), ocr_texts)
    # min_items doesn't have a single GT value to look for; skip search.

    record["ocr_evidence"] = evidence[:5]  # cap for report size

    if evidence:
        record["verdict"] = V_PARSER
    elif ocr_mean_conf > _OCR_TRUSTWORTHY_THRESHOLD:
        # OCR was confident overall but the GT value is missing → the value
        # likely isn't on the receipt at all.
        record["verdict"] = V_LABEL
    else:
        # OCR confidence was low; the GT value may be present but unreadable.
        record["verdict"] = V_IMAGE

    return record


def _diagnose_items(
    gt_items: list, parsed_items: list, ocr_texts: list[str], ocr_mean_conf: float,
) -> list[dict]:
    """Per-item diagnostic. GT items are (name_substring, price) pairs."""
    parsed_lookup = {
        i: it for i, it in enumerate(parsed_items or [])
    }

    records: list[dict] = []
    for raw in gt_items:
        if isinstance(raw, (list, tuple)) and len(raw) == 2:
            name_sub, gt_price = raw
        else:
            continue
        # Find a matching parsed item: name substring AND price within tol
        matched_idx = None
        for idx, it in parsed_lookup.items():
            if not it:
                continue
            n = (it.get("name") or "").upper()
            if name_sub.upper() not in n:
                continue
            p = it.get("price")
            if p is not None and abs(p - gt_price) <= _PRICE_TOLERANCE:
                matched_idx = idx
                break

        if matched_idx is not None:
            records.append({
                "field": f"item:{name_sub}",
                "gt_value": [name_sub, gt_price],
                "parsed_value": parsed_lookup[matched_idx],
                "verdict": V_OK,
                "ocr_evidence": [],
            })
            continue

        name_evidence = _ocr_contains_substring(name_sub, ocr_texts)
        price_evidence = _ocr_contains_price(gt_price, ocr_texts)
        evidence = (name_evidence + price_evidence)[:5]

        if name_evidence and price_evidence:
            verdict = V_PARSER  # both name and price visible — parser failed to associate
        elif evidence:
            # Partial visibility — still likely a parser issue (it had something to work with)
            verdict = V_PARSER
        elif ocr_mean_conf > _OCR_TRUSTWORTHY_THRESHOLD:
            verdict = V_LABEL
        else:
            verdict = V_IMAGE

        records.append({
            "field": f"item:{name_sub}",
            "gt_value": [name_sub, gt_price],
            "parsed_value": None,
            "verdict": verdict,
            "ocr_evidence": evidence,
        })
    return records


# ── Per-receipt diagnostic ────────────────────────────────────────────────



import signal
class _OCRTimeout(Exception): pass
def _ocr_with_timeout(engine, img_path, timeout_s=60):
    def _alarm_handler(signum, frame):
        raise _OCRTimeout(f'OCR timed out after {timeout_s}s on {img_path.name}')
    old = signal.signal(signal.SIGALRM, _alarm_handler)
    signal.alarm(timeout_s)
    try:
        return engine.extract_detections(img_path, do_preprocess=True)
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)

def diagnose_receipt(
    name: str, img_path: Path, gt: dict, engine,
) -> dict:
    """Run OCR + parse + diagnostic on a single receipt."""
    t0 = time.time()
    detections = _ocr_with_timeout(engine, img_path, timeout_s=60)
    ocr_time = time.time() - t0

    # Convert detections → flat token list (for parse) and signal stats
    ocr_texts = [d[1] for d in detections if d and d[1]]
    confs = [d[2] for d in detections if d and len(d) >= 3]
    mean_conf = sum(confs) / len(confs) if confs else 0.0
    low_conf_pct = (
        sum(1 for c in confs if c < 0.3) / len(confs) if confs else 0.0
    )

    tokens = _parser_mod.spatial_reorder(detections)
    parsed = parse_receipt(tokens)

    # Image features (cheap)
    try:
        feats = _features_mod.extract_image_features(str(img_path))
        feat_dict = {
            "resolution_bucket": feats.resolution_bucket,
            "contrast_stddev": round(feats.contrast_stddev, 1),
            "laplacian_variance": round(feats.laplacian_variance, 1),
            "estimated_dpi": round(feats.estimated_dpi, 0),
            "is_thermal": feats.is_thermal,
        }
    except Exception:
        feat_dict = {}

    field_records: list[dict] = []

    for f in ("store", "total", "subtotal", "date"):
        if f in gt and gt[f] is not None:
            field_records.append(
                _diagnose_field(f, gt[f], parsed.get(f), ocr_texts, mean_conf)
            )

    if "min_items" in gt:
        n_parsed = len(parsed.get("items") or [])
        if n_parsed < gt["min_items"]:
            # No single value to grep for — fall back to OCR-quality check.
            verdict = (
                V_IMAGE if mean_conf <= _OCR_TRUSTWORTHY_THRESHOLD else V_PARSER
            )
            field_records.append({
                "field": "min_items",
                "gt_value": gt["min_items"],
                "parsed_value": n_parsed,
                "verdict": verdict,
                "ocr_evidence": [],
            })
        else:
            field_records.append({
                "field": "min_items",
                "gt_value": gt["min_items"],
                "parsed_value": n_parsed,
                "verdict": V_OK,
                "ocr_evidence": [],
            })

    if "item_prices" in gt:
        field_records.extend(
            _diagnose_items(gt["item_prices"], parsed.get("items"), ocr_texts, mean_conf)
        )

    # Receipt-level verdict: aggregate over field verdicts.
    fault_counts = Counter(
        r["verdict"] for r in field_records if r["verdict"] != V_OK
    )
    if not fault_counts:
        receipt_verdict = V_OK
    elif len(fault_counts) == 1:
        receipt_verdict = next(iter(fault_counts))
    else:
        # Multiple buckets — tag as mixed but record dominant.
        dominant = fault_counts.most_common(1)[0][0]
        receipt_verdict = f"mixed_{dominant}"

    return {
        "image": name,
        "ocr_time_s": round(ocr_time, 2),
        "ocr_signals": {
            "n_detections": len(detections),
            "mean_confidence": round(mean_conf, 3),
            "low_conf_pct": round(low_conf_pct, 3),
        },
        "image_features": feat_dict,
        "field_diagnostics": field_records,
        "receipt_verdict": receipt_verdict,
        "fault_counts": dict(fault_counts),
    }


# ── Aggregation ───────────────────────────────────────────────────────────


def aggregate(diagnostics: list[dict]) -> dict:
    """Roll per-receipt verdicts into a dataset-level report."""
    n = len(diagnostics)
    receipt_verdicts: Counter = Counter(d["receipt_verdict"] for d in diagnostics)

    # Per-field rollup: which fields are most often each verdict?
    per_field: dict[str, Counter] = defaultdict(Counter)
    for d in diagnostics:
        for r in d["field_diagnostics"]:
            # Group items together as "item:*"
            field_key = "item:*" if r["field"].startswith("item:") else r["field"]
            per_field[field_key][r["verdict"]] += 1

    # Image-quality cohort analysis: are failures concentrated in low-quality images?
    quality_buckets = {"low": [], "medium": [], "high": []}
    for d in diagnostics:
        mc = d["ocr_signals"]["mean_confidence"]
        if mc < 0.4:
            bucket = "low"
        elif mc < 0.7:
            bucket = "medium"
        else:
            bucket = "high"
        quality_buckets[bucket].append(d["receipt_verdict"])

    quality_summary = {}
    for q, verdicts in quality_buckets.items():
        if verdicts:
            ok = sum(1 for v in verdicts if v == V_OK)
            quality_summary[q] = {
                "n": len(verdicts),
                "pass_rate": round(ok / len(verdicts), 3),
                "verdict_counts": dict(Counter(verdicts)),
            }
        else:
            quality_summary[q] = {"n": 0}

    # Total fault counts across all receipts
    total_faults: Counter = Counter()
    for d in diagnostics:
        total_faults.update(d["fault_counts"])

    return {
        "n_receipts_diagnosed": n,
        "receipt_verdicts": dict(receipt_verdicts),
        "total_field_faults": dict(total_faults),
        "fault_share": {
            k: round(v / sum(total_faults.values()), 3) if total_faults else 0
            for k, v in total_faults.items()
        },
        "per_field": {k: dict(v) for k, v in per_field.items()},
        "by_image_quality": quality_summary,
    }


# ── Reporting ─────────────────────────────────────────────────────────────


def render_markdown(agg: dict, n_diagnosed: int, dataset: str, engine: str) -> str:
    out = [
        f"# Receipt-OCR failure diagnosis — `{dataset}` × `{engine}`\n",
        f"Receipts diagnosed: **{n_diagnosed}**\n",
        "## Where do the faults come from?\n",
    ]
    fault_share = agg.get("fault_share", {})
    if fault_share:
        out.append("| Bucket | Fault count | Share |")
        out.append("|---|---:|---:|")
        for k in (V_PARSER, V_IMAGE, V_LABEL):
            n = agg["total_field_faults"].get(k, 0)
            s = fault_share.get(k, 0)
            out.append(f"| {k.upper()} | {n} | {s:.1%} |")
        out.append("")
    else:
        out.append("_(no faults — every check passed)_\n")

    out.append("## Receipt-level verdict distribution\n")
    rv = agg.get("receipt_verdicts", {})
    for k, v in sorted(rv.items(), key=lambda kv: -kv[1]):
        out.append(f"- **{k}**: {v}")
    out.append("")

    out.append("## Per-field breakdown\n")
    out.append("Which fields fail, and how (counts; ✓ = passed):\n")
    out.append("| Field | OK | PARSER | IMAGE | LABEL |")
    out.append("|---|---:|---:|---:|---:|")
    pf = agg.get("per_field", {})
    for f in sorted(pf):
        c = pf[f]
        out.append(
            f"| `{f}` | {c.get(V_OK, 0)} | {c.get(V_PARSER, 0)} | "
            f"{c.get(V_IMAGE, 0)} | {c.get(V_LABEL, 0)} |"
        )
    out.append("")

    out.append("## Pass rate by image-quality bucket\n")
    out.append(
        "Images bucketed by **mean OCR confidence** "
        "(low <0.4, medium 0.4–0.7, high >0.7):\n"
    )
    out.append("| Bucket | n | Pass rate |")
    out.append("|---|---:|---:|")
    for q in ("low", "medium", "high"):
        b = agg["by_image_quality"].get(q, {"n": 0})
        if b["n"] == 0:
            out.append(f"| {q} | 0 | — |")
        else:
            out.append(f"| {q} | {b['n']} | {b['pass_rate']:.1%} |")
    out.append("")

    out.append("## How to read this report\n")
    out.append(
        "- **PARSER share high** → invest in parser fixes (regex tightening, "
        "store-extractor improvements). The data is there; we're just not "
        "extracting it.\n"
        "- **IMAGE share high** → invest in capture-side work (lighting hints "
        "in the UI, retake prompts) and preprocessing (better deskew, "
        "denoising). Server-side OCR upgrades won't help if the photo is "
        "unreadable.\n"
        "- **LABEL share high** → audit the ground truth. The dataset may "
        "have wrong values, or the field may be marked as required when "
        "it's actually not on the receipt. Use the `field_diagnostics` JSON "
        "to spot-check the affected receipts.\n"
        "- **Pass rate by image-quality** tells you whether quality is the "
        "real bottleneck. If the high-quality bucket also has a poor pass "
        "rate, the image isn't the problem — the parser is.\n"
    )
    return "\n".join(out)


# ── Main ──────────────────────────────────────────────────────────────────


def _resolve_engine(engine_name: str):
    """Load and prepare an engine. Returns the engine instance."""
    engines_path = _LIB_DIR / "engines.py"
    if not engines_path.exists():
        sys.exit(
            f"engines.py not found at {engines_path}. Did you skip the "
            "engine-lift refactor? See docs/ocr-pipeline-architecture.md."
        )
    engines_mod = _load("engines", engines_path)
    if engine_name not in engines_mod.ENGINES:
        sys.exit(
            f"Unknown engine {engine_name!r}. Available: {list(engines_mod.ENGINES)}"
        )
    print(f"Loading {engine_name} engine …", file=sys.stderr)
    eng = engines_mod.create_engine(engine_name, load=True)
    print(f"{engine_name} ready.", file=sys.stderr)
    return eng


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument(
        "--dataset", choices=["samples", "wildreceipt"], default="wildreceipt",
        help="Dataset to diagnose (default: wildreceipt)",
    )
    ap.add_argument(
        "--engine", default="easyocr",
        choices=["easyocr", "paddle", "ensemble"],
        help="OCR engine to run (default: easyocr — fastest)",
    )
    ap.add_argument(
        "--limit", type=int, default=0,
        help="Limit to first N receipts (0 = all)",
    )
    ap.add_argument(
        "--out", type=Path, default=None,
        help="Write per-receipt JSON diagnostic to this path",
    )
    ap.add_argument(
        "--md", type=Path, default=None,
        help="Write markdown rollup to this path (defaults to stdout if omitted)",
    )
    ap.add_argument(
        "--reanalyse", type=Path, default=None,
        help="Skip OCR; re-aggregate from a saved --out JSON (useful for "
             "tweaking thresholds without re-running OCR).",
    )
    args = ap.parse_args()

    # ── Re-analyse path: just re-aggregate a saved diagnostic JSON. ─────
    if args.reanalyse is not None:
        diags = json.loads(args.reanalyse.read_text())
        agg = aggregate(diags["per_receipt"] if isinstance(diags, dict) else diags)
        md = render_markdown(
            agg, n_diagnosed=len(diags["per_receipt"] if isinstance(diags, dict) else diags),
            dataset="(reanalysed)", engine="(reanalysed)",
        )
        if args.md:
            args.md.write_text(md, encoding="utf-8")
            print(f"Wrote {args.md}", file=sys.stderr)
        else:
            print(md)
        return 0

    # ── Live path: load dataset + engine, run OCR, diagnose. ────────────
    _ensure_heavy_modules()  # cv2-bound, deferred until needed
    if args.dataset == "samples":
        samples_dir, gt = _bench_mod.SAMPLES_DIR, _bench_mod.GROUND_TRUTH
    else:
        samples_dir, gt = _bench_mod.load_external_dataset(args.dataset)
        # Drop entries without a canonical store (the bench's default behavior)
        gt = {k: v for k, v in gt.items() if "store" in v}

    if args.limit > 0:
        keys = sorted(gt.keys())[: args.limit]
        gt = {k: gt[k] for k in keys}

    print(f"Diagnosing {len(gt)} receipts from {args.dataset}", file=sys.stderr)
    engine = _resolve_engine(args.engine)

    diagnostics: list[dict] = []
    for i, (name, gt_row) in enumerate(gt.items(), 1):
        img_path = samples_dir / name
        if not img_path.exists():
            print(f"  [{i}/{len(gt)}] SKIP {name} (missing)", file=sys.stderr)
            continue
        try:
            d = diagnose_receipt(name, img_path, gt_row, engine)
        except Exception as e:
            print(f"  [{i}/{len(gt)}] ERROR {name}: {e}", file=sys.stderr)
            continue
        diagnostics.append(d)
        print(
            f"  [{i}/{len(gt)}] {name}: verdict={d['receipt_verdict']} "
            f"(conf={d['ocr_signals']['mean_confidence']:.2f}, "
            f"{d['ocr_time_s']:.1f}s)",
            file=sys.stderr,
        )

    agg = aggregate(diagnostics)
    md = render_markdown(agg, len(diagnostics), args.dataset, args.engine)

    if args.out:
        args.out.write_text(
            json.dumps(
                {"aggregate": agg, "per_receipt": diagnostics},
                indent=2, default=str,
            ),
            encoding="utf-8",
        )
        print(f"Wrote per-receipt JSON to {args.out}", file=sys.stderr)

    if args.md:
        args.md.write_text(md, encoding="utf-8")
        print(f"Wrote markdown rollup to {args.md}", file=sys.stderr)
    else:
        print(md)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
