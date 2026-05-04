"""
Filter a validated CSV to only valid=True rows.

Usage:
    python scripts/filter_valid.py output/validated.csv
    python scripts/filter_valid.py output/validated.csv --out valid_only.csv
"""

import argparse
import csv
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("input", help="Validated CSV file")
parser.add_argument("--out", default=None, help="Output filename (default: valid_<input>)")
args = parser.parse_args()

output_dir = Path(__file__).parent / "output"
input_path = Path(args.input) if Path(args.input).is_absolute() else output_dir / args.input

rows = []
with input_path.open(newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    rows = [r for r in reader if str(r.get("valid", "")).lower() == "true"]

out_path = output_dir / (args.out or f"valid_{input_path.name}")
with out_path.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print(f"{len(rows)} valid domains → {out_path}")
