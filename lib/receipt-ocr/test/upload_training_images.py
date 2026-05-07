#!/usr/bin/env python3
"""
upload_training_images.py
=========================
Upload local receipt images to the receipt-training-images Supabase bucket
and patch their `image_storage_path` on existing rows in
`receipt_training_examples`.

Why this exists separately from annotate_receipts.py:
- The annotation tool uploads images as a side-effect of human verification.
- Sometimes (e.g., when GT rows are seeded via Claude vision through the
  Supabase MCP), rows get inserted without their images. The export pipeline
  needs the images on Storage to re-OCR them at training time, so we need
  a way to backfill.

Idempotent: skips rows that already have a non-null image_storage_path.
SHAs are recomputed from the local files; only files whose SHA matches an
existing row are uploaded.

Usage:
    SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  \\
        python lib/receipt-ocr/test/upload_training_images.py \\
            --images /Users/yoonseongroh/Documents/receipts \\
            --annotator yoon
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
from pathlib import Path

TRAINING_BUCKET = "receipt-training-images"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--images", required=True, type=Path,
                    help="Folder of receipt images (recursively scanned).")
    ap.add_argument("--annotator", default=os.getenv("USER", "anon"),
                    help="Used in the storage path for namespacing.")
    ap.add_argument("--extensions", default="jpg,jpeg,png,heic,heif,webp")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print what would be uploaded; don't actually upload.")
    args = ap.parse_args()

    if not args.images.is_dir():
        sys.exit(f"--images must be a directory: {args.images}")

    try:
        from supabase import create_client
    except ImportError as e:
        sys.exit(f"supabase SDK missing: {e}")
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set")
    sb = create_client(url, key)

    suffixes = {f".{e.lower().lstrip('.')}" for e in args.extensions.split(",")}
    files = sorted(p for p in args.images.rglob("*") if p.suffix.lower() in suffixes)
    print(f"Found {len(files)} image(s) in {args.images}", file=sys.stderr)

    # Index files by SHA so we can match against existing rows quickly.
    sha_to_path: dict[str, Path] = {}
    for p in files:
        try:
            sha_to_path[sha256_of(p)] = p
        except OSError as e:
            print(f"  skip {p.name}: {e}", file=sys.stderr)

    # Pull rows that match these SHAs and don't yet have an image path.
    shas = list(sha_to_path)
    rows = (
        sb.table("receipt_training_examples")
        .select("id, image_sha256, image_storage_path")
        .in_("image_sha256", shas)
        .is_("deleted_at", "null")
        .execute()
        .data
        or []
    )
    print(f"Matched {len(rows)} existing training rows", file=sys.stderr)

    n_uploaded = 0
    n_skipped = 0
    n_failed = 0
    for row in rows:
        sha = row["image_sha256"]
        if row.get("image_storage_path"):
            n_skipped += 1
            continue
        path = sha_to_path.get(sha)
        if not path:
            continue

        ext = path.suffix.lower().lstrip(".")
        safe_ext = ext if ext in {"jpg", "jpeg", "png", "webp", "heic", "heif"} else "jpg"
        mime = {
            "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "webp": "image/webp", "heic": "image/heic", "heif": "image/heif",
        }[safe_ext]
        storage_path = f"_seed/{args.annotator}/{sha[:2]}/{sha}.{safe_ext}"

        if args.dry_run:
            print(f"  DRY-RUN would upload {path.name} -> {storage_path}")
            continue

        try:
            sb.storage.from_(TRAINING_BUCKET).upload(
                storage_path, path.read_bytes(),
                {"content-type": mime, "upsert": "true"},
            )
        except Exception as e:
            msg = str(e).lower()
            if "duplicate" not in msg and "already exists" not in msg:
                print(f"  FAIL upload {path.name}: {e}", file=sys.stderr)
                n_failed += 1
                continue

        try:
            sb.table("receipt_training_examples").update({
                "image_storage_path": storage_path,
            }).eq("id", row["id"]).execute()
            print(f"  ✓ {path.name} -> {storage_path}")
            n_uploaded += 1
        except Exception as e:
            print(f"  FAIL update row {row['id']}: {e}", file=sys.stderr)
            n_failed += 1

    print(f"\nuploaded={n_uploaded} skipped={n_skipped} failed={n_failed}",
          file=sys.stderr)
    return 0 if n_failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
