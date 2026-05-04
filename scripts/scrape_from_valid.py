"""
Scrape 100 (or --count N) recipes from the valid_validated.csv test_url column.

Usage:
    python scripts/scrape_from_valid.py
    python scripts/scrape_from_valid.py --input valid_validated.csv --count 50 --out sampled_recipes.csv
"""

import argparse
import csv
import random
import sys
from pathlib import Path

# Allow importing from the same scripts folder
sys.path.insert(0, str(Path(__file__).parent))
from scrape_recipes_to_csv import scrape_url, FIELDS

OUTPUT_DIR = Path(__file__).parent / "output"

parser = argparse.ArgumentParser()
parser.add_argument("--input", default="valid_validated.csv", help="Validated CSV filename (in scripts/output/)")
parser.add_argument("--count", type=int, default=100, help="Number of recipes to sample (default: 100)")
parser.add_argument("--out", default=None, help="Output CSV filename (default: scraped_<input>)")
parser.add_argument("--delay", type=float, default=1.0, help="Seconds between requests")
args = parser.parse_args()

input_path = OUTPUT_DIR / args.input
if not input_path.exists():
    print(f"File not found: {input_path}")
    sys.exit(1)

# Load rows that have a test_url
with input_path.open(newline="", encoding="utf-8") as f:
    rows = [r for r in csv.DictReader(f) if r.get("test_url", "").strip()]

if not rows:
    print("No rows with a test_url found in the input file.")
    sys.exit(1)

sample = random.sample(rows, min(args.count, len(rows)))
print(f"Sampling {len(sample)} URLs from {input_path.name}\n")

out_path = OUTPUT_DIR / (args.out or f"scraped_{input_path.name}")

import time
ok = fail = 0

with out_path.open("w", newline="", encoding="utf-8") as f:
    # Add source domain column alongside the standard scraper fields
    writer = csv.DictWriter(f, fieldnames=["source_domain"] + FIELDS)
    writer.writeheader()

    for i, row in enumerate(sample, 1):
        url = row["test_url"]
        domain = row["domain"]
        print(f"[{i}/{len(sample)}] {domain} — {url}")

        result = scrape_url(url)
        result["source_domain"] = domain
        writer.writerow(result)
        f.flush()

        if result["success"] == "true":
            ok += 1
            print(f"  OK: {result['title']!r} ({result['ingredients_count']} ingredients, {result['instructions_count']} steps)")
        else:
            fail += 1
            print(f"  FAIL: {result['error']}")

        if i < len(sample):
            time.sleep(args.delay)

print(f"\nDone. {ok} succeeded, {fail} failed → {out_path}")
