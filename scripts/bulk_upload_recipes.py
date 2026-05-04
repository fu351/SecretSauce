"""
Bulk upload recipes from valid_validated.csv → local Python API → Supabase.

Flow per URL:
  1. POST to local Python API /recipe-import/url (scrapes + AI-parses ingredients)
  2. Insert recipe row into Supabase
  3. Insert recipe_ingredients rows
  4. Write result to output CSV

Usage:
    python scripts/bulk_upload_recipes.py
    python scripts/bulk_upload_recipes.py --count 20 --out upload_results.csv
    python scripts/bulk_upload_recipes.py --api http://localhost:8000 --dry-run
"""

import argparse
import csv
import json
import os
import random
import sys
import time
from pathlib import Path

import httpx
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPTS_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPTS_DIR / "output"
ENV_FILE = SCRIPTS_DIR.parent / ".env.local"

# Hardcoded column names because valid_validated.csv has a corrupted header row
VALID_CSV_COLUMNS = ["domain", "valid", "test_url", "title", "ingredients_count", "error"]

RESULT_FIELDS = [
    "domain", "source_url", "recipe_id",
    "success", "title", "ingredients_inserted", "error"
]


def load_env(path: Path) -> dict:
    env = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


def load_valid_urls(csv_path: Path) -> list[dict]:
    rows = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if i == 0:
                continue  # skip corrupted header
            if len(row) < 3:
                continue
            record = dict(zip(VALID_CSV_COLUMNS, row))
            if record.get("test_url", "").strip():
                rows.append(record)
    return rows


def call_import_api(api_url: str, url: str, timeout: float = 45.0) -> dict | None:
    try:
        resp = httpx.post(
            f"{api_url.rstrip('/')}/recipe-import/url",
            json={"url": url},
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


def insert_recipe(supabase, author_id: str, recipe: dict, source_url: str) -> tuple[str | None, str | None]:
    """Insert recipe + ingredients. Returns (recipe_id, error)."""

    instructions = [
        step["description"] for step in recipe.get("instructions", [])
        if step.get("description", "").strip()
    ]

    cuisine_raw = (recipe.get("cuisine") or "other").lower().strip()

    nutrition = {}
    if recipe.get("nutrition"):
        n = recipe["nutrition"]
        nutrition = {k: v for k, v in n.items() if v is not None}

    recipe_row = {
        "title": recipe["title"],
        "author_id": author_id,
        "description": recipe.get("description") or "",
        "image_url": recipe.get("image_url") or None,
        "prep_time": recipe.get("prep_time") or None,
        "cook_time": recipe.get("cook_time") or None,
        "servings": recipe.get("servings") or None,
        "difficulty": "beginner",
        "cuisine": cuisine_raw if cuisine_raw else "other",
        "instructions_list": instructions,
        "nutrition": nutrition,
        "tags": [],
        "source_url": source_url,
    }

    res = supabase.table("recipes").insert(recipe_row).execute()
    if not res.data:
        return None, f"recipe insert returned no data"

    recipe_id = res.data[0]["id"]

    # Insert ingredients
    ingredient_rows = []
    for ing in recipe.get("ingredients", []):
        name = (ing.get("name") or "").strip()
        if not name:
            continue
        amount_str = str(ing.get("amount") or "").strip()
        quantity = None
        try:
            if amount_str:
                # Handle fractions like "1/2"
                if "/" in amount_str:
                    num, denom = amount_str.split("/", 1)
                    quantity = float(num.strip()) / float(denom.strip())
                else:
                    quantity = float(amount_str)
        except ValueError:
            pass

        ingredient_rows.append({
            "recipe_id": recipe_id,
            "display_name": name,
            "quantity": quantity,
            "units": (ing.get("unit") or None),
            "deleted_at": None,
        })

    if ingredient_rows:
        try:
            supabase.table("recipe_ingredients").insert(ingredient_rows).execute()
        except Exception as e:
            if "23505" not in str(e):
                return recipe_id, f"ingredient insert failed: {e}"

    return recipe_id, None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="valid_validated.csv")
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--out", default="upload_results.csv")
    parser.add_argument("--api", default=None, help="Python API base URL (default: from .env.local)")
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--dry-run", action="store_true", help="Scrape but don't insert into Supabase")
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

    # Verify API is reachable
    try:
        httpx.get(f"{api_url.rstrip('/')}/health", timeout=5).raise_for_status()
        print(f"API reachable at {api_url}")
    except Exception as e:
        print(f"ERROR: Python API not reachable at {api_url}\n  Start it with: python -m uvicorn main:app --reload --port 8000\n  ({e})")
        sys.exit(1)

    supabase = create_client(supabase_url, supabase_key)

    input_path = OUTPUT_DIR / args.input
    rows = load_valid_urls(input_path)
    if not rows:
        print(f"No valid URLs found in {input_path}")
        sys.exit(1)

    sample = random.sample(rows, min(args.count, len(rows)))
    print(f"Uploading {len(sample)} recipes {'(DRY RUN — no DB writes)' if args.dry_run else ''}\n")

    out_path = OUTPUT_DIR / args.out
    OUTPUT_DIR.mkdir(exist_ok=True)

    ok = fail = 0

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=RESULT_FIELDS)
        writer.writeheader()

        for i, row in enumerate(sample, 1):
            url = row["test_url"]
            domain = row["domain"]
            print(f"[{i}/{len(sample)}] {domain}")

            result_row = {
                "domain": domain, "source_url": url,
                "recipe_id": "", "success": "false",
                "title": "", "ingredients_inserted": "", "error": ""
            }

            # Step 1: scrape + parse via Python API
            api_result = call_import_api(api_url, url)
            if not api_result or not api_result.get("success") or not api_result.get("recipe"):
                result_row["error"] = api_result.get("error", "API returned no recipe")
                print(f"  FAIL (scrape): {result_row['error']}")
                fail += 1
                writer.writerow(result_row)
                f.flush()
                continue

            recipe = api_result["recipe"]
            result_row["title"] = recipe.get("title", "")
            print(f"  Scraped: {recipe['title']!r} ({len(recipe.get('ingredients', []))} ingredients)")

            if args.dry_run:
                result_row["success"] = "dry-run"
                result_row["ingredients_inserted"] = len(recipe.get("ingredients", []))
                ok += 1
            else:
                # Step 2: insert into Supabase
                recipe_id, error = insert_recipe(supabase, author_id, recipe, url)
                if error and not recipe_id:
                    result_row["error"] = error
                    print(f"  FAIL (insert): {error}")
                    fail += 1
                else:
                    result_row["recipe_id"] = recipe_id or ""
                    result_row["ingredients_inserted"] = len(recipe.get("ingredients", []))
                    result_row["success"] = "true"
                    if error:
                        result_row["error"] = error  # partial warning
                    print(f"  OK: recipe_id={recipe_id}")
                    ok += 1

            writer.writerow(result_row)
            f.flush()

            if i < len(sample):
                time.sleep(args.delay)

    print(f"\nDone. {ok} succeeded, {fail} failed → {out_path}")


if __name__ == "__main__":
    main()
