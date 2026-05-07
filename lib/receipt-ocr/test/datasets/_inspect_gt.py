"""Quick inspection of the regenerated WildReceipt GT manifest."""
import collections
import json
from pathlib import Path

GT = Path(__file__).parent / "wildreceipt" / "ground_truth.json"
gt = json.loads(GT.read_text())

stores = collections.Counter(v.get("store") for v in gt.values())
n_with_store = sum(1 for v in gt.values() if "store" in v)
print(f"Entries with canonical store: {n_with_store}/{len(gt)}")
print("Top canonical stores:")
for s, n in stores.most_common(15):
    if s is None:
        continue
    print(f"  {n:3d}  {s!r}")

unknown_raw = collections.Counter(
    v["store_raw"] for v in gt.values() if "store" not in v
)
print("\nUnknown stores (kept as store_raw, skipped by bench):")
for s, n in unknown_raw.most_common(10):
    print(f"  {n:3d}  {s!r}")

print("\nDate samples (first 10):")
for v in list(gt.values())[:10]:
    print(f"  date={v.get('date')!r}  raw={v.get('date_raw')!r}")

n_iso = sum(1 for v in gt.values() if "date" in v)
n_unparsed = sum(1 for v in gt.values() if "date_raw" in v)
print(f"\nWith ISO date: {n_iso}/{len(gt)}")
print(f"Unparseable dates kept as date_raw: {n_unparsed}")
