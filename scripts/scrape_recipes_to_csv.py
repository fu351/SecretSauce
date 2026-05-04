"""
Bulk recipe scraper → CSV

Usage:
    python scrape_recipes_to_csv.py --urls urls.txt --count 50 --out recipes.csv
    python scrape_recipes_to_csv.py --urls urls.txt --out recipes.csv          # all URLs
    python scrape_recipes_to_csv.py --sample --count 20 --out recipes.csv     # built-in sample URLs
    python scrape_recipes_to_csv.py --list-sites                               # print all supported domains

Arguments:
    --urls        Path to a text file with one recipe URL per line
    --sample      Use built-in sample URLs instead of a file (good for first run)
    --count       How many URLs to scrape (random sample); omit for all
    --out         Output CSV path (default: recipes_output.csv)
    --delay       Seconds to wait between requests (default: 1.0)
    --no-wild     Disable wild mode (skip URLs from unsupported sites)
    --list-sites  Print all supported domains and exit

Supported sites come from recipe_scrapers.SCRAPERS — currently 600+ domains.
URLs whose domain is not in SCRAPERS will be scraped in wild mode (best-effort)
unless --no-wild is set, in which case they are skipped with a warning.
"""

import argparse
import csv
import json
import logging
import random
import re
import sys
import time
from pathlib import Path

import httpx
from recipe_scrapers import scrape_html, SCRAPERS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# All domains with native scraper support — derived at runtime from the library.
# Use `python scrape_recipes_to_csv.py --list-sites` to print the full list.
SUPPORTED_DOMAINS: set[str] = set(SCRAPERS.keys())

# ── CSV columns ────────────────────────────────────────────────────────────────
FIELDS = [
    "url",
    "success",
    "scraper_mode",   # "native" | "wild" | "skipped"
    "error",
    "title",
    "description",
    "yields",
    "prep_time_min",
    "cook_time_min",
    "total_time_min",
    "cuisine",
    "category",
    "image_url",
    "ingredients_raw",       # JSON list of raw strings
    "instructions_raw",      # JSON list of step strings
    "nutrients_raw",         # JSON dict
    "ingredients_count",
    "instructions_count",
]

SAMPLE_URLS = [
    "https://www.allrecipes.com/recipe/158968/spinach-and-feta-turkey-burgers/",
    "https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/",
    "https://www.budgetbytes.com/homemade-pizza-dough/",
    "https://www.budgetbytes.com/easy-chicken-tikka-masala/",
    "https://www.seriouseats.com/the-best-pizza-dough-recipe",
    "https://www.simplyrecipes.com/recipes/homemade_tomato_soup/",
    "https://www.bbcgoodfood.com/recipes/spaghetti-bolognese-best",
    "https://www.skinnytaste.com/instant-pot-chicken-tortilla-soup/",
    "https://www.recipetineats.com/chicken-caesar-salad/",
    "https://www.halfbakedharvest.com/one-pan-pasta/",
    "https://www.bonappetit.com/recipe/bas-best-bolognese",
    "https://www.foodnetwork.com/recipes/alton-brown/baked-macaroni-and-cheese-recipe-1939524",
    "https://www.eatingwell.com/recipe/252917/slow-cooker-chicken-soup/",
    "https://minimalistbaker.com/the-best-vegan-mac-n-cheese/",
    "https://cookieandkate.com/vegetable-stir-fry-recipe/",
    "https://www.tasteofhome.com/recipes/classic-beef-stew/",
    "https://www.epicurious.com/recipes/food/views/chocolate-lava-cakes-51189840",
    "https://www.thekitchn.com/how-to-make-french-toast-cooking-lessons-from-the-kitchn-112927",
    "https://www.delish.com/cooking/recipe-ideas/a19636089/chicken-parmesan-recipe/",
    "https://www.loveandlemons.com/guacamole-recipe/",
]


def is_supported(url: str) -> bool:
    """Return True if the URL's host matches a natively supported scraper."""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname or ""
        # Strip leading www. so "www.allrecipes.com" matches "allrecipes.com"
        host = host.removeprefix("www.")
        return host in SUPPORTED_DOMAINS
    except Exception:
        return False


def parse_time(raw) -> int | None:
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw
    s = str(raw)
    if s.startswith("PT"):
        mins = 0
        h = re.search(r"(\d+)H", s)
        m = re.search(r"(\d+)M", s)
        if h:
            mins += int(h.group(1)) * 60
        if m:
            mins += int(m.group(1))
        return mins or None
    nums = re.findall(r"\d+", s)
    return int(nums[0]) if nums else None


def safe_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception:
        return None


def scrape_url(url: str, wild: bool = True) -> dict:
    row = {f: "" for f in FIELDS}
    row["url"] = url

    native = is_supported(url)
    mode = "native" if native else ("wild" if wild else "skipped")
    row["scraper_mode"] = mode

    if not native and not wild:
        row["success"] = "false"
        row["error"] = "unsupported site; skipped (wild mode off)"
        return row

    try:
        with httpx.Client(follow_redirects=True, timeout=30.0) as client:
            resp = client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            html = resp.text
    except Exception as e:
        row["success"] = "false"
        row["error"] = f"fetch error: {e}"
        return row

    try:
        scraper = scrape_html(html, org_url=url, wild_mode=wild)
    except Exception as e:
        row["success"] = "false"
        row["error"] = f"parse error: {e}"
        return row

    try:
        ingredients = safe_call(scraper.ingredients) or []
        instructions_list = (
            safe_call(scraper.instructions_list)
            or [s.strip() for s in (safe_call(scraper.instructions) or "").split("\n") if s.strip()]
        )
        nutrients = safe_call(scraper.nutrients) or {}

        row.update({
            "success": "true",
            "title": safe_call(scraper.title) or "",
            "description": safe_call(scraper.description) or "",
            "yields": safe_call(scraper.yields) or "",
            "prep_time_min": parse_time(safe_call(scraper.prep_time)) or "",
            "cook_time_min": parse_time(safe_call(scraper.cook_time)) or "",
            "total_time_min": parse_time(safe_call(scraper.total_time)) or "",
            "cuisine": safe_call(scraper.cuisine) or "",
            "category": safe_call(scraper.category) or "",
            "image_url": safe_call(scraper.image) or "",
            "ingredients_raw": json.dumps(ingredients, ensure_ascii=False),
            "instructions_raw": json.dumps(instructions_list, ensure_ascii=False),
            "nutrients_raw": json.dumps(nutrients, ensure_ascii=False),
            "ingredients_count": len(ingredients),
            "instructions_count": len(instructions_list),
        })
    except Exception as e:
        row["success"] = "false"
        row["error"] = f"extraction error: {e}"

    return row


def load_urls(path: str) -> list[str]:
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith("#")]


def find_recipe_urls_multi(domain: str, max_urls: int = 5) -> tuple[list[str], str | None]:
    """
    Find up to max_urls recipe URLs on a domain by probing its homepage and common
    listing paths, collecting links, scoring them, and returning the top candidates.
    Returns (urls, error_message) — urls is empty on failure.
    """
    from urllib.parse import urljoin, urlparse
    from html.parser import HTMLParser

    class LinkCollector(HTMLParser):
        def __init__(self):
            super().__init__()
            self.links: list[str] = []
        def handle_starttag(self, tag, attrs):
            if tag == "a":
                href = dict(attrs).get("href", "")
                if href and not href.startswith(("#", "mailto:", "tel:", "javascript:")):
                    self.links.append(href)

    probe_paths = [
        "/",
        "/recipes/", "/recipe/", "/recipes", "/recipe",
        "/recettes/", "/rezepte/", "/ricette/", "/recetas/",
        "/cooking/", "/cook/", "/dishes/", "/food/",
        "/sitemap.xml",
    ]

    def score_link(path: str) -> int:
        p = path.lower()
        score = 0

        # Positive: explicit recipe path segment
        if any(kw in p for kw in ("/recipe/", "/recipes/", "/recette/", "/recettes/", "/rezept/", "/rezepte/", "/ricetta/", "/ricette/", "/receta/", "/recetas/", "/recept/")):
            score += 3
        if any(kw in p for kw in ("/cook/", "/dish/", "/meal/", "/cooking/")):
            score += 1

        parts = [seg for seg in path.strip("/").split("/") if seg]
        if len(parts) >= 2:
            score += 1
        if parts and re.search(r"[a-z]{3,}", parts[-1]):
            score += 1

        # Negative: listing/category pages
        if any(kw in p for kw in ("/category/", "/kategorie/", "/kategoria/", "/tag/", "/author/", "/page/", "/search", "/index", "sitemap")):
            score -= 3

        # Negative: bare listing paths
        if p.rstrip("/") in ("", "/recipes", "/recipe", "/recettes", "/rezepte", "/ricette", "/recetas", "/recept"):
            score -= 2

        # Negative: last segment is a category slug ending in listing keywords
        # e.g. "mexikanische-rezepte", "most-popular-recipes", "vegetar-oppskrifter"
        _listing_suffixes = (
            "recipes", "recettes", "rezepte", "ricette", "recetas", "recepten",
            "oppskrifter", "opskrifter", "opskrifterna", "recepten",
            "backen", "suppen", "gerechten", "nagerechten", "hoofdgerechten",
        )
        last = parts[-1] if parts else ""
        if any(last == s or last.endswith("-" + s) for s in _listing_suffixes):
            score -= 3

        # Negative: non-food path keywords
        if any(kw in p for kw in ("/news/", "/health/", "/nhs-services/", "/checkout/", "/account/", "/login", "/shop/", "/store/", "/buy", "/cart")):
            score -= 4

        return score

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    all_links: list[str] = []
    base = f"https://{domain}"
    probe_errors: list[str] = []

    with httpx.Client(follow_redirects=True, timeout=15.0) as client:
        for probe_path in probe_paths:
            probe_url = f"{base}{probe_path}"
            try:
                resp = client.get(probe_url, headers=headers)
                if resp.status_code >= 400:
                    probe_errors.append(f"HTTP {resp.status_code} on {probe_path}")
                    continue
                if "sitemap" in probe_path:
                    urls = re.findall(r"<loc>(https?://[^<]+)</loc>", resp.text)
                    all_links.extend(urls)
                else:
                    parser = LinkCollector()
                    parser.feed(resp.text)
                    all_links.extend(parser.links)
                if len(all_links) > 200:
                    break
            except httpx.HTTPStatusError as e:
                probe_errors.append(f"HTTP {e.response.status_code} on {probe_path}")
            except httpx.RequestError as e:
                probe_errors.append(f"{type(e).__name__} on {probe_path}: {e}")
            except Exception as e:
                probe_errors.append(f"error on {probe_path}: {e}")

    if not all_links:
        summary = "; ".join(probe_errors) if probe_errors else "no links collected"
        return [], f"no recipe link found — {summary}"

    candidates: list[tuple[int, str]] = []
    seen: set[str] = set()
    for href in all_links:
        try:
            abs_url = urljoin(base, href)
            parsed = urlparse(abs_url)
            if parsed.scheme not in ("http", "https"):
                continue
            host = parsed.hostname or ""
            if domain not in host:
                continue
            # Strip fragments (#comments, #anchor, etc.) before deduplication
            clean_url = parsed._replace(fragment="").geturl()
            path = parsed.path
            if clean_url in seen or len(path) < 5:
                continue
            seen.add(clean_url)
            s = score_link(path)
            if s >= 3:  # require an explicit recipe keyword, not just depth+slug
                candidates.append((s, clean_url))
        except Exception:
            continue

    if not candidates:
        return [], "links found but none scored as a recipe page"

    candidates.sort(key=lambda x: -x[0])
    return [url for _, url in candidates[:max_urls]], None


def find_recipe_url(domain: str) -> tuple[str | None, str | None]:
    """Find a single recipe URL on a domain. Wrapper around find_recipe_urls_multi."""
    urls, error = find_recipe_urls_multi(domain, max_urls=1)
    return (urls[0] if urls else None, error)


RETRYABLE_ERROR_PREFIXES = (
    "no recipe link found",
    "scraped but no title returned",
    "links found but none scored",
)


def load_prior_results(csv_path: str) -> tuple[list[dict], list[str]]:
    """Read an existing validated CSV. Returns (all_rows, domains_to_retry)."""
    rows = []
    retry = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)
            error = row.get("error", "")
            if row.get("valid", "").lower() != "true" and any(error.startswith(p) for p in RETRYABLE_ERROR_PREFIXES):
                retry.append(row["domain"])
    return rows, retry


def validate_sites(domains: list[str], count: int | None, delay: float, out: str,
                   prior_rows: list[dict] | None = None) -> None:
    """Probe each domain by finding and scraping one recipe, then print + optionally save results."""
    if count and count < len(domains):
        domains = random.sample(domains, count)

    print(f"Validating {len(domains)} domains (this will take a while)...\n")

    val_fields = ["domain", "valid", "test_url", "title", "ingredients_count", "error"]
    rows = []

    for i, domain in enumerate(domains, 1):
        test_url, find_error = find_recipe_url(domain)
        row = {"domain": domain, "valid": False, "test_url": test_url or "", "title": "", "ingredients_count": "", "error": ""}

        if not test_url:
            row["error"] = find_error or "no recipe link found"
            log.warning(f"[{i}/{len(domains)}] {domain}: {row['error']}")
        else:
            result = scrape_url(test_url, wild=False)
            if result["success"] == "true" and result.get("title"):
                row.update({"valid": True, "title": result["title"], "ingredients_count": result["ingredients_count"]})
                log.info(f"[{i}/{len(domains)}] {domain}: OK — {result['title']!r}")
            else:
                row["error"] = result.get("error") or "scraped but no title returned"
                log.warning(f"[{i}/{len(domains)}] {domain}: FAIL — {row['error']}")

        rows.append(row)

        # Print live row
        status = "✓" if row["valid"] else "✗"
        print(f"  {status}  {domain:<40}  {row['title'][:45] if row['title'] else row['error'][:45]}")

        if i < len(domains):
            time.sleep(delay)

    # Merge with rows from prior run that weren't retried (already passing or different error)
    if prior_rows:
        retried_domains = {r["domain"] for r in rows}
        carry = [r for r in prior_rows if r["domain"] not in retried_domains]
        rows = carry + rows
        rows.sort(key=lambda r: r["domain"])

    ok = sum(1 for r in rows if str(r.get("valid", "")).lower() == "true")
    print(f"\n{ok}/{len(rows)} domains validated successfully.")

    if out:
        out_path = Path(out)
        with out_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=val_fields)
            writer.writeheader()
            writer.writerows(rows)
        print(f"Results saved → {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Scrape recipes to CSV")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--urls", help="Text file with one URL per line")
    group.add_argument("--sample", action="store_true", help="Use built-in sample URLs")
    group.add_argument("--list-sites", action="store_true", help="Print all supported domains and exit")
    group.add_argument("--retry", metavar="CSV", help="Re-validate only failed domains from a prior validated CSV, merge results")
    parser.add_argument("--count", type=int, default=None, help="Max URLs to scrape (random sample)")
    parser.add_argument("--out", default=None, help="Output CSV filename (saved in scripts/output/)")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between requests")
    parser.add_argument("--no-wild", action="store_true", help="Skip URLs from unsupported sites")
    parser.add_argument("--validate", action="store_true", help="With --list-sites: probe each domain with a real recipe fetch")
    args = parser.parse_args()

    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)

    if args.retry:
        prior_path = Path(args.retry) if Path(args.retry).is_absolute() else output_dir / args.retry
        prior_rows, retry_domains = load_prior_results(str(prior_path))
        if not retry_domains:
            print("No retryable failures found in the CSV (all passed or had non-retryable errors).")
            return
        print(f"Retrying {len(retry_domains)} failed domains from {prior_path.name}")
        print(f"Retryable error prefixes: {RETRYABLE_ERROR_PREFIXES}\n")
        out = output_dir / (args.out or prior_path.name)
        validate_sites(retry_domains, count=args.count, delay=args.delay, out=str(out), prior_rows=prior_rows)
        return

    if args.list_sites:
        domains = sorted(SUPPORTED_DOMAINS)
        if not args.validate:
            print(f"{len(domains)} supported domains:\n")
            for d in domains:
                print(f"  {d}")
            return
        out = output_dir / (args.out or "validated.csv")
        validate_sites(domains, count=args.count, delay=args.delay, out=str(out))
        return

    urls = SAMPLE_URLS if args.sample else load_urls(args.urls)

    if args.count and args.count < len(urls):
        urls = random.sample(urls, args.count)

    native_count = sum(1 for u in urls if is_supported(u))
    wild_count = len(urls) - native_count
    log.info(
        f"Scraping {len(urls)} URLs — "
        f"{native_count} native ({len(SUPPORTED_DOMAINS)} sites supported), "
        f"{wild_count} wild-mode"
    )

    out_path = output_dir / (args.out or "recipes_output.csv")
    wild = not args.no_wild

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()

        ok = fail = 0
        for i, url in enumerate(urls, 1):
            log.info(f"[{i}/{len(urls)}] {url}")
            row = scrape_url(url, wild=wild)
            writer.writerow(row)
            f.flush()

            if row["success"] == "true":
                ok += 1
                log.info(
                    f"  OK [{row['scraper_mode']}]: {row['title']!r} "
                    f"({row['ingredients_count']} ingredients, {row['instructions_count']} steps)"
                )
            else:
                fail += 1
                log.warning(f"  FAIL [{row['scraper_mode']}]: {row['error']}")

            if i < len(urls):
                time.sleep(args.delay)

    log.info(f"\nDone. {ok} succeeded, {fail} failed → {out_path}")
    log.info(f"Tip: run with --list-sites to see all {len(SUPPORTED_DOMAINS)} natively supported domains")


if __name__ == "__main__":
    main()
