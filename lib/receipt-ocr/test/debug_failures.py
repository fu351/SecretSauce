#!/usr/bin/env python3
"""Debug script: dump ensemble detections + parsed result for failing images."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from ocr_bench import EnsembleEngine, parse_receipt, SAMPLES_DIR

engine = EnsembleEngine()
engine.load()

FAILING = ["1.jpg", "3.jpg", "10.jpg", "16.jpg", "19.jpg"]

for fname in FAILING:
    path = SAMPLES_DIR / fname
    if not path.exists():
        print(f"\n{'='*60}\n  {fname} — NOT FOUND\n{'='*60}")
        continue
    print(f"\n{'='*60}\n  {fname}\n{'='*60}")

    # Raw detections (spatial-reordered tokens)
    tokens = engine.extract(path)
    print(f"\n  Tokens ({len(tokens)}):")
    for t in tokens:
        print(f"    {t!r}")

    # Parsed result
    result = parse_receipt(tokens)
    print(f"\n  Parsed result:")
    print(f"    store:    {result.get('store')}")
    print(f"    total:    {result.get('total')}")
    print(f"    subtotal: {result.get('subtotal')}")
    print(f"    date:     {result.get('date')}")
    print(f"    items ({len(result.get('items', []))}):")
    for item in result.get('items', []):
        print(f"      {item['name']:40s}  ${item['price']}")
