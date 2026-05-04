"""
Discover, quality-filter, and bulk-upload recipes from validated domains.

Reads valid domains from valid_validated.csv, discovers real recipe URLs
using parallel workers, quality-checks each scraped recipe, then uploads
to Supabase via the local Python API.

Usage:
    python scripts/harvest_and_upload.py --count 100
    python scripts/harvest_and_upload.py --count 20 --dry-run
    python scripts/harvest_and_upload.py --count 250 --workers 8 --min-quality 0.9
"""

import argparse
import csv
import sys
import time
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path

from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent))
from scrape_recipes_to_csv import find_recipe_urls_multi
from bulk_upload_recipes import call_import_api, insert_recipe, load_env

SCRIPTS_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPTS_DIR / "output"
ENV_FILE = SCRIPTS_DIR.parent / ".env.local"

VALID_CSV_COLUMNS = ["domain", "valid", "test_url", "title", "ingredients_count", "error"]

RESULT_FIELDS = [
    "domain", "source_url", "recipe_id",
    "success", "title", "ingredients_inserted",
    "quality_score", "quality_issues", "error",
]


# ── Quality check ─────────────────────────────────────────────────────────────

@dataclass
class QualityResult:
    passed: bool
    score: float
    issues: list[str] = field(default_factory=list)


def quality_check(recipe: dict, min_score: float) -> QualityResult:
    issues: list[str] = []
    weights: dict[str, float] = {}
    scores: dict[str, float] = {}

    title = (recipe.get("title") or "").strip()
    ingredients = recipe.get("ingredients") or []
    instructions = recipe.get("instructions") or []

    # Title presence and length
    weights["title"] = 0.15
    if not title:
        issues.append("missing_title")
        scores["title"] = 0.0
    elif len(title) < 5 or len(title) > 120:
        issues.append("bad_title_length")
        scores["title"] = 0.3
    else:
        scores["title"] = 1.0

    # Ingredient count (≥ 3 expected)
    weights["ing_count"] = 0.35
    ing_count = len(ingredients)
    if ing_count == 0:
        issues.append("no_ingredients")
        scores["ing_count"] = 0.0
    elif ing_count < 3:
        issues.append("low_ingredients")
        scores["ing_count"] = 0.4
    else:
        scores["ing_count"] = min(1.0, ing_count / 8)

    # Instruction count (≥ 1 expected)
    weights["inst_count"] = 0.25
    inst_count = len(instructions)
    if inst_count == 0:
        issues.append("no_instructions")
        scores["inst_count"] = 0.0
    elif inst_count < 2:
        issues.append("low_instructions")
        scores["inst_count"] = 0.5
    else:
        scores["inst_count"] = min(1.0, inst_count / 5)

    # Avg ingredient name length (≥ 3 chars)
    weights["ing_quality"] = 0.15
    if ingredients:
        names = [(ing.get("name") or "").strip() for ing in ingredients]
        avg_len = sum(len(n) for n in names) / max(len(names), 1)
        if avg_len < 3:
            issues.append("garbled_ingredients")
            scores["ing_quality"] = 0.0
        else:
            scores["ing_quality"] = min(1.0, avg_len / 10)
    else:
        scores["ing_quality"] = 0.0

    # Duplicate ingredient names (after lowercasing) — < 50% duplicates
    weights["dedup"] = 0.10
    if ingredients:
        names_lower = [(ing.get("name") or "").strip().lower() for ing in ingredients if (ing.get("name") or "").strip()]
        unique_ratio = len(set(names_lower)) / max(len(names_lower), 1)
        if unique_ratio < 0.5:
            issues.append("high_duplicates")
            scores["dedup"] = 0.0
        else:
            scores["dedup"] = unique_ratio
    else:
        scores["dedup"] = 1.0

    total_weight = sum(weights.values())
    score = sum(weights[k] * scores[k] for k in weights) / total_weight

    return QualityResult(
        passed=score >= min_score and not {"missing_title", "no_ingredients", "no_instructions"} & set(issues),
        score=round(score, 3),
        issues=issues,
    )


# ── CSV loading ────────────────────────────────────────────────────────────────

RETRYABLE_STATUSES = {"false", "quality-fail", "stopped", ""}


def load_retry_urls(csv_path: Path) -> list[tuple[str, str]]:
    """Read a harvest results CSV and return (url, domain) pairs for retryable rows."""
    pairs = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            status = row.get("success", "").strip().lower()
            if status in RETRYABLE_STATUSES:
                url = row.get("source_url", "").strip()
                domain = row.get("domain", "").strip()
                if url:
                    pairs.append((url, domain))
    return pairs


def load_valid_domains(csv_path: Path) -> list[str]:
    domains = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if i == 0:
                continue  # skip corrupted header
            if len(row) < 2:
                continue
            record = dict(zip(VALID_CSV_COLUMNS, row))
            if str(record.get("valid", "")).strip().lower() == "true":
                domain = record.get("domain", "").strip()
                if domain:
                    domains.append(domain)
    return domains


# ── Workers ────────────────────────────────────────────────────────────────────

def discover_worker(domain: str, max_per_domain: int) -> tuple[str, list[str], str | None]:
    """Returns (domain, urls, error)."""
    try:
        urls, error = find_recipe_urls_multi(domain, max_urls=max_per_domain)
        return domain, urls, error
    except Exception as e:
        return domain, [], str(e)


def process_worker(
    url: str,
    domain: str,
    api_url: str,
    supabase,
    author_id: str,
    dry_run: bool,
    min_quality: float,
    stop_event: threading.Event,
    delay: float,
) -> dict:
    result = {
        "domain": domain,
        "source_url": url,
        "recipe_id": "",
        "success": "false",
        "title": "",
        "ingredients_inserted": "",
        "quality_score": "",
        "quality_issues": "",
        "error": "",
    }

    if stop_event.is_set():
        result["error"] = "stopped"
        return result

    if delay > 0:
        time.sleep(delay)

    # Step 1: scrape via Python API
    api_result = call_import_api(api_url, url)
    if not api_result or not api_result.get("success") or not api_result.get("recipe"):
        result["error"] = api_result.get("error", "API returned no recipe") if api_result else "no response"
        return result

    recipe = api_result["recipe"]
    result["title"] = recipe.get("title", "")

    # Step 2: quality check
    qr = quality_check(recipe, min_quality)
    result["quality_score"] = qr.score
    result["quality_issues"] = "|".join(qr.issues) if qr.issues else ""

    if not qr.passed:
        result["success"] = "quality-fail"
        result["error"] = f"quality={qr.score:.2f} issues={result['quality_issues']}"
        return result

    if dry_run:
        result["success"] = "dry-run"
        result["ingredients_inserted"] = len(recipe.get("ingredients", []))
        return result

    # Step 3: insert into Supabase
    recipe_id, error = insert_recipe(supabase, author_id, recipe, url, quality_score=qr.score)
    if error and not recipe_id:
        result["error"] = error
        return result

    result["recipe_id"] = recipe_id or ""
    result["ingredients_inserted"] = len(recipe.get("ingredients", []))
    result["success"] = "true"
    if error:
        result["error"] = error  # partial warning
    return result


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=100, help="Target number of successful uploads")
    parser.add_argument("--max-per-domain", type=int, default=3, help="Max recipe URLs to discover per domain")
    parser.add_argument("--workers", type=int, default=8, help="Thread pool size")
    parser.add_argument("--out", default="harvest_results.csv")
    parser.add_argument("--api", default=None)
    parser.add_argument("--delay", type=float, default=0.5, help="Per-thread delay between requests (seconds)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--min-quality", type=float, default=0.95, help="Minimum quality score to upload (0-1)")
    parser.add_argument("--input", default="valid_validated.csv")
    parser.add_argument("--retry", default=None, metavar="CSV", help="Re-process failed/stopped rows from a prior harvest CSV")
    args = parser.parse_args()

    env = load_env(ENV_FILE)
    api_url = args.api or env.get("PYTHON_SERVICE_URL", "http://localhost:8000/")
    supabase_url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    author_id = env.get("user_id")

    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local")
        sys.exit(1)
    if not author_id:
        print("ERROR: user_id missing from .env.local")
        sys.exit(1)

    import httpx as _httpx
    try:
        _httpx.get(f"{api_url.rstrip('/')}/health", timeout=5).raise_for_status()
        print(f"API reachable at {api_url}")
    except Exception as e:
        print(f"ERROR: Python API not reachable at {api_url}\n  ({e})")
        sys.exit(1)

    from supabase import create_client
    supabase = create_client(supabase_url, supabase_key)

    import random
    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / args.out

    # ── Build URL list: retry mode skips discovery ────────────────────────────
    if args.retry:
        retry_path = Path(args.retry) if Path(args.retry).is_absolute() else OUTPUT_DIR / args.retry
        all_url_domain_pairs = load_retry_urls(retry_path)
        if not all_url_domain_pairs:
            print(f"No retryable rows found in {retry_path}")
            sys.exit(0)
        print(f"Retrying {len(all_url_domain_pairs)} failed URLs from {retry_path.name}")
    else:
        input_path = OUTPUT_DIR / args.input
        domains = load_valid_domains(input_path)
        if not domains:
            print(f"No valid domains found in {input_path}")
            sys.exit(1)
        random.shuffle(domains)
        print(f"Loaded {len(domains)} valid domains from {input_path.name}")

        print("Phase 1: Discovering recipe URLs...")
        all_url_domain_pairs = []
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(discover_worker, d, args.max_per_domain): d for d in domains}
            found_total = 0
            with tqdm(total=len(domains), desc="Discovering", unit="domain") as progress:
                for future in as_completed(futures):
                    domain, urls, error = future.result()
                    if urls:
                        all_url_domain_pairs.extend((url, domain) for url in urls)
                        found_total += len(urls)
                    progress.set_postfix(found=found_total, last=domain[:24])
                    progress.update(1)
        random.shuffle(all_url_domain_pairs)

    print(f"Target: {args.count} uploads | workers={args.workers} | min_quality={args.min_quality}")
    if args.dry_run:
        print("DRY RUN — no DB writes")
    print(f"\nPhase 2: Processing {len(all_url_domain_pairs)} candidate URLs...\n")

    # ── Phase 2: scrape + quality check + upload (always runs) ───────────────
    stop_event = threading.Event()
    ok = fail = quality_fail = 0
    all_quality_scores: list[float] = []
    issue_counter: Counter = Counter()
    write_lock = threading.Lock()

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=RESULT_FIELDS)
        writer.writeheader()

        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {
                pool.submit(
                    process_worker,
                    url, domain, api_url, supabase, author_id,
                    args.dry_run, args.min_quality, stop_event, args.delay,
                ): (url, domain)
                for url, domain in all_url_domain_pairs
            }

            with tqdm(total=len(futures), desc="Processing", unit="url") as progress:
                for future in as_completed(futures):
                    url, domain = futures[future]
                    try:
                        row = future.result()
                    except Exception as e:
                        row = {k: "" for k in RESULT_FIELDS}
                        row.update({"domain": domain, "source_url": url, "success": "false", "error": str(e)})

                    success = row["success"]

                    if success == "true" or success == "dry-run":
                        ok += 1
                        qs = row.get("quality_score", "")
                        if isinstance(qs, float):
                            all_quality_scores.append(qs)
                        if ok >= args.count:
                            stop_event.set()
                    elif success == "quality-fail":
                        quality_fail += 1
                        qs = row.get("quality_score", "")
                        if isinstance(qs, float):
                            all_quality_scores.append(qs)
                        issues = row.get("quality_issues", "")
                        if issues:
                            for issue in issues.split("|"):
                                issue_counter[issue] += 1
                    elif row.get("error") != "stopped":
                        fail += 1

                    progress.set_postfix(ok=f"{ok}/{args.count}", fail=fail, quality=quality_fail)
                    progress.update(1)

                    with write_lock:
                        writer.writerow(row)
                        f.flush()

    # Summary
    total_processed = ok + fail + quality_fail
    mean_score = sum(all_quality_scores) / len(all_quality_scores) if all_quality_scores else 0
    pass_rate = (ok / total_processed * 100) if total_processed else 0
    top_issues = issue_counter.most_common(5)

    print(f"\nDone. {ok} uploaded, {fail} failed, {quality_fail} skipped (quality) → {out_path}")
    print(f"Quality: mean_score={mean_score:.2f}, pass_rate={pass_rate:.0f}%", end="")
    if top_issues:
        issues_str = ", ".join(f"{k}: {v}" for k, v in top_issues)
        print(f", top issues: [{issues_str}]", end="")
    print()


if __name__ == "__main__":
    main()
