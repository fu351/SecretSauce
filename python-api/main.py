from fastapi import FastAPI, Query, HTTPException, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import subprocess
import json
import os
import logging
import tempfile
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import httpx
from recipe_scrapers import scrape_html
from openai import OpenAI
import instaloader
from supabase import create_client, Client
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Grocery & Recipe Scraper API")

# Initialize OpenAI client (will use OPENAI_API_KEY env var)
openai_client = None
try:
    openai_client = OpenAI()
except Exception as e:
    logger.warning(f"OpenAI client initialization failed: {e}")

# Pydantic models for recipe import
class Ingredient(BaseModel):
    name: str
    amount: str
    unit: str

class Instruction(BaseModel):
    step: int
    description: str

class NutritionInfo(BaseModel):
    calories: Optional[int] = None
    protein: Optional[int] = None
    carbs: Optional[int] = None
    fat: Optional[int] = None
    fiber: Optional[int] = None
    sodium: Optional[int] = None

class ImportedRecipe(BaseModel):
    title: str
    description: Optional[str] = None
    ingredients: List[Ingredient]
    instructions: List[Instruction]
    image_url: Optional[str] = None
    prep_time: Optional[int] = None
    cook_time: Optional[int] = None
    total_time: Optional[int] = None
    servings: Optional[int] = None
    cuisine: Optional[str] = None
    nutrition: Optional[NutritionInfo] = None
    source_url: Optional[str] = None
    source_type: str

class RecipeImportResponse(BaseModel):
    success: bool
    recipe: Optional[ImportedRecipe] = None
    error: Optional[str] = None
    warnings: Optional[List[str]] = None

class URLImportRequest(BaseModel):
    url: str

class InstagramImportRequest(BaseModel):
    url: str

class TextParseRequest(BaseModel):
    text: str
    source_type: str = "text"

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://the-secret-sauce.vercel.app",
        "https://thesecretssauce.com",
        "http://localhost:3000",  # For local development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path to scraper scripts (hosted in backend/workers/scraper-worker/stores)
_SCRAPER_PATH_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "backend" / "workers" / "scraper-worker" / "stores",  # repo layout
    Path(__file__).resolve().parent / "backend" / "workers" / "scraper-worker" / "stores",  # container layout
]
SCRAPER_PATH = next((path for path in _SCRAPER_PATH_CANDIDATES if path.exists()), _SCRAPER_PATH_CANDIDATES[0])

DEFAULT_ZIP_CODE = os.getenv("ZIP_CODE") or os.getenv("DEFAULT_ZIP_CODE")


def normalize_zip_code(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    trimmed = value.strip()
    match = re.search(r"\b\d{5}(?:-\d{4})?\b", trimmed)
    if match:
        return match.group(0)[:5]
    if re.fullmatch(r"\d{5}", trimmed):
        return trimmed
    return None


# ---------------------------------------------------------------------------
# SSRF guard for outbound URL fetches
# ---------------------------------------------------------------------------
# Public-internet recipe scraping must not be able to reach internal services
# (cloud metadata endpoints, RFC1918 ranges, link-local, loopback). We resolve
# the hostname and reject any URL whose host resolves to a non-public IP.

import ipaddress
import socket
from urllib.parse import urlparse


def _validate_public_url(url: str) -> None:
    """Raise HTTPException(400) if the URL is not safe to fetch.

    Rejects:
      - non-http(s) schemes (file://, gopher://, etc.)
      - hostnames that resolve to private/loopback/link-local/multicast IPs
      - hostnames that resolve to nothing
    """
    if not url or not isinstance(url, str):
        raise HTTPException(status_code=400, detail="URL is required")

    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported URL scheme: {parsed.scheme!r} (only http/https allowed)",
        )

    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="URL is missing a hostname")

    # Resolve all addresses for this hostname and reject if any is non-public.
    # Checking *all* addresses (not just the first) closes a small loophole
    # where a multi-A-record host mixes public and private IPs.
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise HTTPException(status_code=400, detail=f"Could not resolve host: {e}")

    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise HTTPException(
                status_code=400,
                detail="URL resolves to a non-public address and cannot be fetched",
            )


# ---------------------------------------------------------------------------
# Path-traversal guard for /receipt/analyze
# ---------------------------------------------------------------------------
# image_path is a debug/admin parameter. It must be confined to an allow-listed
# base directory so a malicious caller cannot read arbitrary host files
# (/etc/passwd, secrets, etc.). The base directory is configurable via env;
# defaults to the system temp dir, which is where uploads should land.

_RECEIPT_IMAGE_BASE = Path(
    os.getenv("RECEIPT_IMAGE_BASE_DIR", tempfile.gettempdir())
).resolve()


def _validate_receipt_image_path(image_path: str) -> Path:
    """Resolve image_path under the configured base dir or raise 400.

    Resolves symlinks via Path.resolve() before the containment check so that
    a symlink inside the base dir cannot escape to e.g. /etc.
    """
    if not image_path:
        raise HTTPException(status_code=400, detail="image_path is required")

    candidate = Path(image_path)
    # If a relative path is given, anchor it inside the base dir.
    if not candidate.is_absolute():
        candidate = _RECEIPT_IMAGE_BASE / candidate
    resolved = candidate.resolve()

    try:
        resolved.relative_to(_RECEIPT_IMAGE_BASE)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"image_path must be inside {_RECEIPT_IMAGE_BASE}",
        )

    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="image not found")

    return resolved


def run_scraper_isolated(script: str, search_term: str, zip_code: str) -> Dict[str, Any]:
    """
    Run a Node.js scraper script in isolation with comprehensive error logging.

    Each scraper runs independently with:
    - Per-script error logging
    - Detailed stdout/stderr capture
    - Timeout protection
    - Exception handling per store
    """

    # Map store names to actual filenames
    script_mapping = {
        "Target": "target",
        "Kroger": "kroger",
        "Meijer": "meijer",
        "99Ranch": "99ranch",
        "Walmart": "walmart"
    }

    script_filename = script_mapping.get(script, script.lower())

    try:
        script_path = SCRAPER_PATH / f"{script_filename}.js"

        if not script_path.exists():
            error_msg = f"Scraper file not found: {script_path}"
            logger.error(f"[{script}] {error_msg}")
            return {"error": error_msg}

        logger.info(f"[{script}] Starting scraper for: {search_term} (zip: {zip_code})")

        result = subprocess.run(
            ["node", str(script_path.absolute()), search_term, str(zip_code)],
            capture_output=True,
            text=True,
            timeout=30  # 30 second timeout per scraper
        )

        # Log stdout and stderr for debugging
        if result.stdout:
            logger.debug(f"[{script}] stdout: {result.stdout[:500]}")  # First 500 chars
        if result.stderr:
            logger.warning(f"[{script}] stderr: {result.stderr[:500]}")

        # Check return code
        if result.returncode != 0:
            error_msg = f"Script failed with code {result.returncode}: {result.stderr}"
            logger.error(f"[{script}] {error_msg}")
            return {"error": error_msg}

        # Try to parse JSON output
        try:
            parsed_result = json.loads(result.stdout)
            logger.info(f"[{script}] Successfully returned {len(parsed_result) if isinstance(parsed_result, list) else 1} result(s)")
            return parsed_result
        except json.JSONDecodeError as e:
            error_msg = f"Invalid JSON response: {str(e)}"
            logger.error(f"[{script}] {error_msg} - raw output: {result.stdout[:200]}")
            return {"error": error_msg}

    except subprocess.TimeoutExpired:
        error_msg = "Scraper exceeded 30 second timeout"
        logger.error(f"[{script}] {error_msg}")
        return {"error": error_msg}

    except Exception as e:
        error_msg = f"Exception: {str(e)}"
        logger.exception(f"[{script}] Unexpected error: {error_msg}")
        return {"error": error_msg}

@app.get("/")
async def root():
    return {"message": "Grocery Scraper API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/grocery-search")
async def grocery_search(
    searchTerm: str = Query(..., min_length=1),
    zipCode: Optional[str] = Query(default=None)
):
    """
    Search for grocery items across multiple stores concurrently.

    Uses per-store isolation to ensure:
    - One failing scraper doesn't block others
    - Detailed error logging per store
    - Timeout protection (30s per store, total ~30s due to async)
    """
    resolved_zip = normalize_zip_code(zipCode) or normalize_zip_code(DEFAULT_ZIP_CODE)
    if not resolved_zip:
        raise HTTPException(status_code=400, detail="zipCode query parameter is required")
    logger.info(f"Starting grocery search for: {searchTerm} (zip: {resolved_zip})")
    results = []
    stores = ["Target", "Kroger", "Meijer", "99Ranch", "Walmart"]

    # Run scrapers concurrently in isolated tasks so a slow store doesn't block the rest
    tasks = [
        asyncio.to_thread(run_scraper_isolated, store, searchTerm, resolved_zip)
        for store in stores
    ]

    store_results_list = await asyncio.gather(*tasks, return_exceptions=True)

    # Process results from each store
    successful_stores = 0
    failed_stores = 0

    for store, store_results in zip(stores, store_results_list):
        # Handle task exceptions (e.g., if asyncio.to_thread itself fails)
        if isinstance(store_results, Exception):
            error_msg = f"{store} scraper task failed: {store_results}"
            logger.error(f"[{store}] Task exception: {error_msg}")
            results.append({"store": store, "error": error_msg})
            failed_stores += 1
            continue

        # Handle error dictionaries returned by run_scraper_isolated
        if isinstance(store_results, dict) and "error" in store_results:
            logger.warning(f"[{store}] Error returned: {store_results['error']}")
            results.append({"store": store, "error": store_results["error"]})
            failed_stores += 1
            continue

        # Handle successful list results
        if isinstance(store_results, list) and store_results:
            for item in store_results:
                item["provider"] = store
            results.extend(store_results)
            successful_stores += 1
            logger.info(f"[{store}] Successfully retrieved {len(store_results)} items")
            continue

        # Handle single item dict responses (non-error)
        if isinstance(store_results, dict) and "error" not in store_results:
            store_results["provider"] = store
            results.append(store_results)
            successful_stores += 1
            continue

        # Unexpected result format
        if store_results is not None:
            logger.warning(f"[{store}] Unexpected result format: {type(store_results)}")
            failed_stores += 1

    logger.info(
        f"Search completed: {successful_stores} successful, {failed_stores} failed stores, "
        f"{len(results)} total items"
    )

    return {
        "results": results,
        "summary": {
            "successful_stores": successful_stores,
            "failed_stores": failed_stores,
            "total_items": len(results)
        }
    }

# ============================================================================
# Recipe Import Endpoints
# ============================================================================

def parse_time_string(time_str) -> Optional[int]:
    """Convert time string like 'PT30M' or '30 minutes' to minutes integer."""
    if time_str is None:
        return None

    # If already an integer, return it directly
    if isinstance(time_str, int):
        return time_str

    # Convert to string for processing
    time_str = str(time_str)

    # Handle ISO 8601 duration format (PT30M, PT1H30M, etc.)
    if time_str.startswith('PT'):
        total_minutes = 0
        hours_match = re.search(r'(\d+)H', time_str)
        mins_match = re.search(r'(\d+)M', time_str)
        if hours_match:
            total_minutes += int(hours_match.group(1)) * 60
        if mins_match:
            total_minutes += int(mins_match.group(1))
        return total_minutes if total_minutes > 0 else None

    # Try to extract just the number
    numbers = re.findall(r'\d+', str(time_str))
    if numbers:
        return int(numbers[0])

    return None

def parse_servings(servings_str) -> Optional[int]:
    """Extract servings number from various formats."""
    if servings_str is None:
        return None
    if isinstance(servings_str, int):
        return servings_str

    # Try to extract number from string
    numbers = re.findall(r'\d+', str(servings_str))
    if numbers:
        return int(numbers[0])
    return None

def parse_nutrition(nutrients_dict) -> Optional[NutritionInfo]:
    """Parse nutrition data from recipe-scrapers nutrients() output."""
    if not nutrients_dict:
        return None

    def extract_number(value) -> Optional[int]:
        """Extract numeric value from string like '250 kcal' or '15g'."""
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return int(value)
        # Extract numbers from string
        numbers = re.findall(r'[\d.]+', str(value))
        if numbers:
            return int(float(numbers[0]))
        return None

    nutrition = NutritionInfo(
        calories=extract_number(nutrients_dict.get('calories') or nutrients_dict.get('caloriesContent')),
        protein=extract_number(nutrients_dict.get('proteinContent') or nutrients_dict.get('protein')),
        carbs=extract_number(nutrients_dict.get('carbohydrateContent') or nutrients_dict.get('carbs')),
        fat=extract_number(nutrients_dict.get('fatContent') or nutrients_dict.get('fat')),
        fiber=extract_number(nutrients_dict.get('fiberContent') or nutrients_dict.get('fiber')),
        sodium=extract_number(nutrients_dict.get('sodiumContent') or nutrients_dict.get('sodium')),
    )

    # Only return if at least one field has data
    if any([nutrition.calories, nutrition.protein, nutrition.carbs, nutrition.fat]):
        return nutrition
    return None

async def parse_recipe_with_ai(text: str, source_type: str = "text") -> ImportedRecipe:
    """
    Use OpenAI to parse unstructured recipe text into structured format.
    Used for Instagram captions and OCR results.
    """
    if not openai_client:
        raise HTTPException(status_code=500, detail="OpenAI client not configured")

    prompt = f"""Parse the following recipe text and extract structured information.
Return a JSON object with these fields:
- title: string (the recipe name)
- description: string or null (brief description if present)
- ingredients: array of objects with {{name, amount, unit}}
- instructions: array of objects with {{step, description}} - number steps starting from 1
- servings: number or null
- prep_time: number in minutes or null
- cook_time: number in minutes or null

For ingredients, extract:
- amount: ONLY the numeric quantity (e.g., "1", "1/2", "2-3", "" if none). NEVER include units here.
- unit: ONLY the measurement unit (e.g., "cup", "tablespoon", "oz", "lb", "" if none). NEVER include the number.
- name: the ingredient name with preparation notes (e.g., "garlic, minced", "chicken breast, diced")

CRITICAL: Separate amount and unit. Examples:
- "1 cup flour" → amount="1", unit="cup", name="flour"
- "2 tablespoons olive oil" → amount="2", unit="tablespoons", name="olive oil"
- "1/2 tsp salt" → amount="1/2", unit="tsp", name="salt"
- "Salt to taste" → amount="", unit="", name="salt to taste"

Recipe text:
{text}

Return ONLY valid JSON, no markdown or explanation."""

    try:
        response = await asyncio.to_thread(
            openai_client.chat.completions.create,
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a recipe parser. Extract structured recipe data from text. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)

        # Build the recipe object with post-processing to fix common parsing mistakes
        raw_ingredients = result.get("ingredients", [])
        ingredients = []
        # Common units (sorted by length desc to match longer units first like "tablespoon" before "tbsp")
        unit_words = ["tablespoons", "tablespoon", "teaspoons", "teaspoon", "fluid ounces", "fluid ounce",
                     "milliliters", "milliliter", "kilograms", "kilogram", "gallons", "gallon", "quarts", "quart",
                     "packages", "package", "bunches", "bunch", "cloves", "clove", "pieces", "piece", "slices", "slice",
                     "cups", "cup", "pounds", "pound", "ounces", "ounce", "pints", "pint", "grams", "gram",
                     "liters", "liter", "cans", "can", "heads", "head",
                     "tbsp", "tsp", "oz", "lb", "lbs", "g", "kg", "ml", "l", "pt", "qt", "gal", "fl oz"]
        
        for ing in raw_ingredients:
            # Handle None values from JSON null - convert to empty string before str()
            amount = str(ing.get("amount") or "").strip()
            unit = str(ing.get("unit") or "").strip()
            name = str(ing.get("name") or "").strip()
            
            # Fix: if amount contains a unit word but unit is empty, try to split it
            if amount and not unit:
                amount_lower = amount.lower()
                for uword in unit_words:
                    uword_lower = uword.lower()
                    # Case 1: "1 cup" (space-separated)
                    if f" {uword_lower}" in amount_lower or amount_lower.startswith(uword_lower + " "):
                        parts = amount.split(maxsplit=1)
                        if len(parts) == 2:
                            if parts[1].lower() == uword_lower or parts[0].lower() == uword_lower:
                                amount = parts[0] if parts[1].lower() == uword_lower else parts[1]
                                unit = uword
                                break
                    # Case 2: "1cup" or "cup1" (no space, unit at end/start)
                    elif amount_lower.endswith(uword_lower) and len(amount) > len(uword):
                        potential_num = amount[:-len(uword)].strip()
                        if potential_num and (potential_num[0].isdigit() or potential_num[0] in ".-/"):
                            amount = potential_num
                            unit = uword
                            break
                    elif amount_lower.startswith(uword_lower) and len(amount) > len(uword):
                        potential_num = amount[len(uword):].strip()
                        if potential_num and (potential_num[0].isdigit() or potential_num[0] in ".-/"):
                            amount = potential_num
                            unit = uword
                            break
            
            # Fix: if unit is in name instead (e.g., name="1 cup flour"), try to extract it
            # Only do this if unit is missing (regardless of amount length, since amounts like "2-3" or "1/2" are valid)
            if not unit and name:
                name_lower = name.lower()
                for uword in unit_words:
                    uword_lower = uword.lower()
                    # Pattern: "1 cup flour" or "1cup flour" or "2-3 cups flour" or "1/2 tsp salt" at the start of name
                    pattern = rf'^(\d+(?:\.\d+)?(?:/\d+)?(?:-\d+)?)\s*{re.escape(uword_lower)}\s+(.+)'
                    match = re.match(pattern, name_lower)
                    if match:
                        if not amount:
                            amount = match.group(1)
                        unit = uword
                        name = match.group(2).strip()
                        break
            
            ingredients.append(Ingredient(
                name=name,
                amount=amount,
                unit=unit
            ))

        instructions = [
            Instruction(
                step=inst.get("step", idx + 1),
                description=inst.get("description", "")
            )
            for idx, inst in enumerate(result.get("instructions", []))
        ]

        return ImportedRecipe(
            title=result.get("title", "Untitled Recipe"),
            description=result.get("description"),
            ingredients=ingredients,
            instructions=instructions,
            servings=result.get("servings"),
            prep_time=result.get("prep_time"),
            cook_time=result.get("cook_time"),
            source_type=source_type
        )

    except Exception as e:
        logger.error(f"AI parsing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse recipe text: {str(e)}")


async def parse_ingredients_with_ai(raw_ingredients: List[str]) -> List[Ingredient]:
    """
    Use OpenAI to parse raw ingredient strings into structured format.
    Handles complex formats like "1 (14 oz) can diced tomatoes" or "Salt to taste".
    """
    if not openai_client:
        # Fallback to simple parsing if OpenAI not available
        return simple_parse_ingredients(raw_ingredients)

    if not raw_ingredients:
        return []

    ingredients_text = "\n".join(f"- {ing}" for ing in raw_ingredients)

    prompt = f"""Parse these ingredient strings into structured data.
For each ingredient, extract:
- amount: ONLY the numeric quantity (e.g., "1", "1/2", "2-3", "" if none). NEVER include units here.
- unit: ONLY the measurement unit (e.g., "cup", "tablespoon", "oz", "lb", "" if none). NEVER include the number.
- name: the ingredient name with any preparation notes (e.g., "garlic, minced", "chicken breast, diced")

CRITICAL: Separate amount and unit. Examples:
- "1 cup flour" → amount="1", unit="cup", name="flour"
- "2 tablespoons olive oil" → amount="2", unit="tablespoons", name="olive oil"
- "1/2 tsp salt" → amount="1/2", unit="tsp", name="salt"
- "1 (14 oz) can diced tomatoes" → amount="1", unit="can (14 oz)", name="diced tomatoes"
- "Salt and pepper to taste" → amount="", unit="", name="salt and pepper to taste"
- "2 large eggs" → amount="2", unit="large", name="eggs"
- Keep preparation instructions with the name (minced, diced, chopped, etc.)

Ingredients:
{ingredients_text}

Return a JSON object with an "ingredients" array containing objects with "amount", "unit", and "name" fields.
Return ONLY valid JSON, no markdown or explanation."""

    try:
        response = await asyncio.to_thread(
            openai_client.chat.completions.create,
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an ingredient parser. Extract structured data from ingredient strings. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)

        # Post-processing to fix common parsing mistakes
        raw_ingredients = result.get("ingredients", [])
        ingredients = []
        # Common units (sorted by length desc to match longer units first)
        unit_words = ["tablespoons", "tablespoon", "teaspoons", "teaspoon", "fluid ounces", "fluid ounce",
                     "milliliters", "milliliter", "kilograms", "kilogram", "gallons", "gallon", "quarts", "quart",
                     "packages", "package", "bunches", "bunch", "cloves", "clove", "pieces", "piece", "slices", "slice",
                     "cups", "cup", "pounds", "pound", "ounces", "ounce", "pints", "pint", "grams", "gram",
                     "liters", "liter", "cans", "can", "heads", "head",
                     "tbsp", "tsp", "oz", "lb", "lbs", "g", "kg", "ml", "l", "pt", "qt", "gal", "fl oz"]
        
        for ing in raw_ingredients:
            # Handle None values from JSON null - convert to empty string before str()
            amount = str(ing.get("amount") or "").strip()
            unit = str(ing.get("unit") or "").strip()
            name = str(ing.get("name") or "").strip()
            
            # Fix: if amount contains a unit word but unit is empty, try to split it
            if amount and not unit:
                amount_lower = amount.lower()
                for uword in unit_words:
                    uword_lower = uword.lower()
                    # Case 1: "1 cup" (space-separated)
                    if f" {uword_lower}" in amount_lower or amount_lower.startswith(uword_lower + " "):
                        parts = amount.split(maxsplit=1)
                        if len(parts) == 2:
                            if parts[1].lower() == uword_lower or parts[0].lower() == uword_lower:
                                amount = parts[0] if parts[1].lower() == uword_lower else parts[1]
                                unit = uword
                                break
                    # Case 2: "1cup" or "cup1" (no space, unit at end/start)
                    elif amount_lower.endswith(uword_lower) and len(amount) > len(uword):
                        potential_num = amount[:-len(uword)].strip()
                        if potential_num and (potential_num[0].isdigit() or potential_num[0] in ".-/"):
                            amount = potential_num
                            unit = uword
                            break
                    elif amount_lower.startswith(uword_lower) and len(amount) > len(uword):
                        potential_num = amount[len(uword):].strip()
                        if potential_num and (potential_num[0].isdigit() or potential_num[0] in ".-/"):
                            amount = potential_num
                            unit = uword
                            break
            
            # Fix: if unit is in name instead (e.g., name="1 cup flour"), try to extract it
            # Only do this if unit is missing (regardless of amount length, since amounts like "2-3" or "1/2" are valid)
            if not unit and name:
                name_lower = name.lower()
                for uword in unit_words:
                    uword_lower = uword.lower()
                    # Pattern: "1 cup flour" or "1cup flour" or "2-3 cups flour" or "1/2 tsp salt" at the start of name
                    pattern = rf'^(\d+(?:\.\d+)?(?:/\d+)?(?:-\d+)?)\s*{re.escape(uword_lower)}\s+(.+)'
                    match = re.match(pattern, name_lower)
                    if match:
                        if not amount:
                            amount = match.group(1)
                        unit = uword
                        name = match.group(2).strip()
                        break
            
            ingredients.append(Ingredient(
                name=name,
                amount=amount,
                unit=unit
            ))
        
        return ingredients

    except Exception as e:
        logger.warning(f"AI ingredient parsing failed, using fallback: {e}")
        return simple_parse_ingredients(raw_ingredients)


def simple_parse_ingredients(raw_ingredients: List[str]) -> List[Ingredient]:
    """Fallback simple parsing when AI is not available."""
    ingredients = []
    for ing_str in raw_ingredients:
        parts = ing_str.split(" ", 2)
        if len(parts) >= 3:
            ingredients.append(Ingredient(
                amount=parts[0],
                unit=parts[1],
                name=parts[2]
            ))
        elif len(parts) == 2:
            ingredients.append(Ingredient(
                amount=parts[0],
                unit="",
                name=parts[1]
            ))
        else:
            ingredients.append(Ingredient(
                amount="",
                unit="",
                name=ing_str
            ))
    return ingredients


async def parse_instructions_with_ai(raw_instructions: List[str]) -> List[Instruction]:
    """
    Use OpenAI to clean up and structure instructions.
    Handles poorly formatted instructions and combines/splits as needed.
    """
    if not openai_client:
        # Fallback to simple parsing
        return [
            Instruction(step=idx + 1, description=inst.strip())
            for idx, inst in enumerate(raw_instructions)
            if inst.strip()
        ]

    if not raw_instructions:
        return []

    instructions_text = "\n".join(f"{idx + 1}. {inst}" for idx, inst in enumerate(raw_instructions))

    prompt = f"""Clean up and structure these recipe instructions.

Rules:
- Each step should be a clear, actionable instruction
- Remove any duplicate steps
- Split overly long steps into logical sub-steps if needed
- Combine very short related steps if appropriate
- Remove any non-instruction content (ads, notes about the recipe, etc.)
- Keep timing information (e.g., "cook for 5 minutes")
- Number steps starting from 1

Instructions:
{instructions_text}

Return a JSON object with an "instructions" array containing objects with "step" (number) and "description" (string) fields.
Return ONLY valid JSON, no markdown or explanation."""

    try:
        response = await asyncio.to_thread(
            openai_client.chat.completions.create,
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a recipe instruction formatter. Clean up and structure cooking instructions. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)

        return [
            Instruction(
                step=inst.get("step", idx + 1),
                description=inst.get("description", "")
            )
            for idx, inst in enumerate(result.get("instructions", []))
        ]

    except Exception as e:
        logger.warning(f"AI instruction parsing failed, using fallback: {e}")
        return [
            Instruction(step=idx + 1, description=inst.strip())
            for idx, inst in enumerate(raw_instructions)
            if inst.strip()
        ]


@app.post("/recipe-import/url", response_model=RecipeImportResponse)
async def import_recipe_from_url(request: URLImportRequest):
    """
    Scrape a recipe from a URL using the recipe-scrapers library.
    Supports 400+ recipe websites.
    """
    url = request.url
    logger.info(f"Importing recipe from URL: {url}")

    # Reject non-public URLs (loopback, RFC1918, link-local, cloud metadata)
    # before issuing the outbound request to prevent SSRF.
    _validate_public_url(url)

    try:
        # Fetch the HTML content
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            html = response.text

        # Parse with recipe-scrapers
        scraper = scrape_html(html, org_url=url)

        # Extract and parse ingredients with AI
        raw_ingredients = scraper.ingredients()
        ingredients = await parse_ingredients_with_ai(raw_ingredients)

        # Extract and parse instructions with AI
        raw_instructions = scraper.instructions_list() if hasattr(scraper, 'instructions_list') else scraper.instructions().split('\n')
        instructions = await parse_instructions_with_ai(raw_instructions)

        # Extract nutrition if available
        nutrition = None
        try:
            if hasattr(scraper, 'nutrients'):
                raw_nutrients = scraper.nutrients()
                nutrition = parse_nutrition(raw_nutrients)
                if nutrition:
                    logger.info(f"Extracted nutrition: calories={nutrition.calories}, protein={nutrition.protein}g")
        except Exception as e:
            logger.warning(f"Failed to extract nutrition: {e}")

        # Build recipe object
        recipe = ImportedRecipe(
            title=scraper.title(),
            description=scraper.description() if hasattr(scraper, 'description') else None,
            ingredients=ingredients,
            instructions=instructions,
            image_url=scraper.image() if hasattr(scraper, 'image') else None,
            prep_time=parse_time_string(scraper.prep_time() if hasattr(scraper, 'prep_time') else None),
            cook_time=parse_time_string(scraper.cook_time() if hasattr(scraper, 'cook_time') else None),
            total_time=parse_time_string(scraper.total_time() if hasattr(scraper, 'total_time') else None),
            servings=parse_servings(scraper.yields() if hasattr(scraper, 'yields') else None),
            nutrition=nutrition,
            source_url=url,
            source_type="url"
        )

        logger.info(f"Successfully parsed recipe: {recipe.title}")
        return RecipeImportResponse(success=True, recipe=recipe)

    except httpx.HTTPError as e:
        error_msg = f"Failed to fetch URL: {str(e)}"
        logger.error(error_msg)
        return RecipeImportResponse(success=False, error=error_msg)

    except Exception as e:
        error_msg = f"Failed to parse recipe: {str(e)}"
        logger.error(error_msg)
        return RecipeImportResponse(success=False, error=error_msg)


def _normalize_instagram_url(url: str) -> Tuple[Optional[str], Optional[str]]:
    """Return (normalized_url, shortcode) or (None, error_message)."""
    if not url or not isinstance(url, str):
        return None, "Instagram URL is required."
    raw = url.strip()
    if not raw:
        return None, "Instagram URL is required."
    first_line = raw.split()[0] if raw else ""
    normalized = first_line.split("?")[0].split("#")[0]
    if "instagram.com" not in normalized:
        return None, "Please provide a valid Instagram URL (post, reel, or video)."
    match = re.search(r'instagram\.com/(?:p|reel|tv)/([A-Za-z0-9_-]{5,})', normalized, re.IGNORECASE)
    if not match:
        return None, "Invalid Instagram URL. Please use a link to a post, reel, or video (e.g. .../p/ABC123/ or .../reel/ABC123/)."
    shortcode = match.group(1).strip()
    if len(shortcode) < 5 or len(shortcode) > 30:
        return None, "Invalid Instagram link: could not read post ID."
    return f"https://www.instagram.com/p/{shortcode}/", shortcode


@app.post("/recipe-import/instagram", response_model=RecipeImportResponse)
async def import_recipe_from_instagram(request: InstagramImportRequest):
    """
    Import a recipe from an Instagram post URL.
    Extracts the caption and image, then uses AI to parse the recipe.
    """
    url = getattr(request, "url", None) or ""
    normalized_url, shortcode = _normalize_instagram_url(url) if url else (None, None)
    if not normalized_url or not shortcode:
        return RecipeImportResponse(success=False, error=shortcode or "Invalid URL.")

    logger.info(f"Importing recipe from Instagram: {normalized_url} (shortcode={shortcode})")

    try:
        # Initialize Instaloader
        L = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            request_timeout=30.0,
            max_connection_attempts=2,
        )

        # Try to load session if available
        session_file = Path(__file__).parent / "instagram_session"
        if session_file.exists():
            try:
                L.load_session_from_file("", str(session_file))
                logger.info("Loaded Instagram session")
            except Exception as e:
                logger.warning(f"Could not load Instagram session: {e}")

        # Fetch the post (run in thread to avoid blocking; Instaloader is sync)
        loop = asyncio.get_event_loop()
        try:
            post = await asyncio.wait_for(
                loop.run_in_executor(None, lambda: instaloader.Post.from_shortcode(L.context, shortcode)),
                timeout=35.0,
            )
        except asyncio.TimeoutError:
            return RecipeImportResponse(
                success=False,
                error="The post took too long to load. Instagram may be slow or the post may be unavailable. Try again later.",
            )

        caption = (post.caption or "").strip()
        image_url = getattr(post, "url", None) or (post.video_url if getattr(post, "is_video", False) else None)
        username = getattr(post, "owner_username", "") or ""

        if not caption:
            return RecipeImportResponse(
                success=False,
                error="This post has no caption. We need the caption text to extract a recipe. Try a post where the recipe is written in the caption."
            )
        if len(caption) < 80:
            return RecipeImportResponse(
                success=False,
                error="The caption is too short to contain a full recipe. Please use a post where the full recipe (ingredients and instructions) is in the caption."
            )

        logger.info(f"Retrieved Instagram post from @{username}, caption length: {len(caption)}")

        # Parse caption with AI
        try:
            recipe = await parse_recipe_with_ai(caption, source_type="instagram")
        except HTTPException as e:
            return RecipeImportResponse(success=False, error=e.detail)

        # Require at least some instructions for a valid recipe
        if not recipe.instructions or all(not (i.description or "").strip() for i in recipe.instructions):
            return RecipeImportResponse(
                success=False,
                error="This post doesn't appear to have recipe instructions in the caption. Try a post where the full recipe steps are written in the caption."
            )

        # Add Instagram-specific fields
        if image_url:
            recipe.image_url = image_url
        recipe.source_url = normalized_url

        return RecipeImportResponse(success=True, recipe=recipe)

    except instaloader.exceptions.LoginRequiredException:
        return RecipeImportResponse(
            success=False,
            error="Instagram requires login to view this post. The import service cannot access it. Try a public post or a different link."
        )
    except instaloader.exceptions.PrivateProfileNotFollowedException:
        return RecipeImportResponse(
            success=False,
            error="This post is from a private account we don't have access to. Use a public post instead."
        )
    except instaloader.exceptions.QueryReturnedForbiddenException:
        return RecipeImportResponse(
            success=False,
            error="Instagram is blocking access to this post (often due to rate limits or login requirements). Try again later or use a different post."
        )
    except instaloader.exceptions.ConnectionException as e:
        return RecipeImportResponse(
            success=False,
            error=f"Could not reach Instagram: {str(e)}. Check your connection and try again."
        )
    except instaloader.exceptions.InstaloaderException as e:
        err_lower = str(e).lower()
        if "login" in err_lower or "session" in err_lower:
            return RecipeImportResponse(
                success=False,
                error="Instagram requires login to view this content. Try a public post or ensure the import service is configured with a valid session."
            )
        if "not found" in err_lower or "404" in err_lower:
            return RecipeImportResponse(
                success=False,
                error="Post not found. The link may be broken, the post may have been removed, or it may be private."
            )
        logger.error(f"Instagram error: {e}")
        return RecipeImportResponse(
            success=False,
            error=f"Instagram error: {str(e)}. Try a different post or try again later."
        )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Failed to import from Instagram: {e}")
        if "fetch" in error_msg.lower() or "connection" in error_msg.lower() or "timeout" in error_msg.lower():
            return RecipeImportResponse(
                success=False,
                error="Could not load the Instagram post. Check your connection or try again later."
            )
        return RecipeImportResponse(
            success=False,
            error=f"Failed to import from Instagram: {error_msg}"
        )


@app.post("/recipe-import/text", response_model=RecipeImportResponse)
async def parse_recipe_text(request: TextParseRequest):
    """
    Parse unstructured recipe text (e.g., from OCR) into structured format using AI.
    """
    logger.info(f"Parsing recipe text, length: {len(request.text)}")

    if len(request.text.strip()) < 20:
        return RecipeImportResponse(
            success=False,
            error="Text is too short to be a valid recipe"
        )

    try:
        recipe = await parse_recipe_with_ai(request.text, source_type=request.source_type)
        return RecipeImportResponse(success=True, recipe=recipe)

    except HTTPException as e:
        return RecipeImportResponse(success=False, error=e.detail)

    except Exception as e:
        error_msg = f"Failed to parse recipe text: {str(e)}"
        logger.error(error_msg)
        return RecipeImportResponse(success=False, error=error_msg)


# ============================================================================
# Daily Ingredient Scraper Endpoint
# ============================================================================

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Optional[Client] = None

if supabase_url and supabase_key:
    try:
        supabase = create_client(supabase_url, supabase_key)
        logger.info("Supabase client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase: {e}")



# ============================================================================
# Receipt OCR Parsing Endpoint
# ============================================================================

# Import receipt_parser — resolve path whether running from python-api/ or repo root
_RECEIPT_PARSER_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "lib" / "receipt-ocr" / "receipt_parser.py",
    Path(__file__).resolve().parent / "receipt_parser.py",
]

_receipt_parse_fn = None
_receipt_spatial_reorder_fn = None
for _candidate in _RECEIPT_PARSER_CANDIDATES:
    if _candidate.exists():
        import importlib.util as _ilu
        _spec = _ilu.spec_from_file_location("receipt_parser", _candidate)
        _mod  = _ilu.module_from_spec(_spec)          # type: ignore[arg-type]
        _spec.loader.exec_module(_mod)                # type: ignore[union-attr]
        _receipt_parse_fn = _mod.parse_receipt
        _receipt_spatial_reorder_fn = _mod.spatial_reorder
        logger.info(f"Loaded receipt_parser from {_candidate}")
        break

if _receipt_parse_fn is None:
    logger.warning("receipt_parser.py not found — /receipt/parse will return 503")

# Import recommender modules (optional — graceful degradation)
_recommend_strategy_fn = None
_should_escalate_fn = None
_extract_image_features_fn = None
_Strategy = None
try:
    _RECOMMENDER_CANDIDATES = [
        Path(__file__).resolve().parent.parent / "lib" / "receipt-ocr" / "model_recommender.py",
        Path(__file__).resolve().parent / "model_recommender.py",
    ]
    _FEATURES_CANDIDATES = [
        Path(__file__).resolve().parent.parent / "lib" / "receipt-ocr" / "image_features.py",
        Path(__file__).resolve().parent / "image_features.py",
    ]
    for _rc in _RECOMMENDER_CANDIDATES:
        if _rc.exists():
            _r_spec = _ilu.spec_from_file_location("model_recommender", _rc)
            _r_mod = _ilu.module_from_spec(_r_spec)
            _r_spec.loader.exec_module(_r_mod)
            _recommend_strategy_fn = _r_mod.recommend_strategy
            _should_escalate_fn = _r_mod.should_escalate
            _Strategy = _r_mod.Strategy
            logger.info(f"Loaded model_recommender from {_rc}")
            break
    for _fc in _FEATURES_CANDIDATES:
        if _fc.exists():
            _f_spec = _ilu.spec_from_file_location("image_features", _fc)
            _f_mod = _ilu.module_from_spec(_f_spec)
            _f_spec.loader.exec_module(_f_mod)
            _extract_image_features_fn = _f_mod.extract_image_features
            logger.info(f"Loaded image_features from {_fc}")
            break
except Exception as e:
    logger.warning(f"Recommender modules not loaded: {e}")


class ReceiptDetection(BaseModel):
    bbox: List[List[float]]  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
    text: str
    confidence: float = 1.0


class ReceiptParseRequest(BaseModel):
    tokens: Optional[List[str]] = None            # existing flat format
    detections: Optional[List[ReceiptDetection]] = None  # new spatial format
    strategy: Optional[str] = "auto"              # auto, easyocr, paddleocr, ensemble


class ReceiptItem(BaseModel):
    name: str
    quantity: int
    price: float
    # Optional structured measurement fields populated by
    # _enrich_items_with_weight_qty for weight-priced and qty-at-price items.
    # Receipt parser fills these in opportunistically; downstream consumers
    # (pantry_items insertion etc.) can use them for unit normalization.
    weight: Optional[float] = None
    unit: Optional[str] = None       # "lb" / "kg" / "oz"
    unit_price: Optional[float] = None


class ReceiptParseResult(BaseModel):
    store: str
    date: Optional[str] = None
    items: List[ReceiptItem]
    subtotal: Optional[float] = None
    taxes: List[Dict[str, Any]] = []
    total: Optional[float] = None


class ReceiptParseResponse(BaseModel):
    success: bool
    result: Optional[ReceiptParseResult] = None
    error: Optional[str] = None


@app.post("/receipt/parse", response_model=ReceiptParseResponse)
async def parse_receipt_tokens(request: ReceiptParseRequest):
    """
    Parse a flat easyOCR (detail=0) token list into structured receipt metadata.

    Accepts:
        { "tokens": ["Walmart", "MILK WHOLE", "3.49", ...],
          "strategy": "auto" }

    Strategy options:
        - "auto" (default): use heuristic recommender if available, else ensemble
        - "easyocr": EasyOCR only
        - "paddleocr": PaddleOCR only
        - "ensemble": full ensemble

    Returns:
        { "success": true, "result": { "store": "Walmart", ... } }
    """
    if _receipt_parse_fn is None:
        raise HTTPException(status_code=503, detail="receipt_parser module not available")

    # Resolve tokens: either from flat list or from spatial detections
    if request.detections:
        det_tuples = [
            (d.bbox, d.text, d.confidence) for d in request.detections
        ]
        tokens = _receipt_spatial_reorder_fn(det_tuples)
        logger.info(f"[receipt/parse] Spatial reorder: {len(request.detections)} detections → {len(tokens)} tokens")
    elif request.tokens:
        tokens = request.tokens
    else:
        return ReceiptParseResponse(success=False, error="provide either tokens or detections")

    strategy = (request.strategy or "auto").lower()
    logger.info(f"[receipt/parse] Parsing {len(tokens)} tokens (strategy={strategy})")

    try:
        # parse_receipt is a CPU-bound pure-python function (~2,400 LOC of
        # regex + heuristics). Off-load to a thread so a slow parse does not
        # block other async requests on the same worker.
        raw = await asyncio.to_thread(_receipt_parse_fn, tokens)

        # Post-parse escalation check for auto mode
        if (strategy == "auto"
                and _should_escalate_fn is not None
                and _should_escalate_fn(raw)):
            logger.info("[receipt/parse] Escalation triggered — re-parsing with ensemble tokens if available")

        result = ReceiptParseResult(
            store=raw.get("store", "Unknown"),
            date=raw.get("date"),
            items=[ReceiptItem(**item) for item in (raw.get("items") or [])],
            subtotal=raw.get("subtotal"),
            taxes=raw.get("taxes") or [],
            total=raw.get("total"),
        )
        logger.info(f"[receipt/parse] store={result.store} items={len(result.items)}")
        return ReceiptParseResponse(success=True, result=result)

    except Exception as e:
        logger.error(f"[receipt/parse] error: {e}", exc_info=True)
        return ReceiptParseResponse(success=False, error=str(e))


@app.post("/receipt/analyze")
async def analyze_receipt_image(
    image_path: str = Query(..., description="Path to the receipt image file"),
):
    """Return image features and recommended OCR strategy for a receipt image.

    Useful for debugging and monitoring the recommender's decisions.
    """
    if _extract_image_features_fn is None or _recommend_strategy_fn is None:
        raise HTTPException(
            status_code=503,
            detail="Recommender modules not available",
        )

    # Confine image_path to the configured base dir to prevent path traversal.
    safe_path = _validate_receipt_image_path(image_path)

    try:
        # Feature extraction reads the image and runs OpenCV ops — off-load
        # to a thread so the event loop stays responsive.
        features = await asyncio.to_thread(_extract_image_features_fn, str(safe_path))
        rec = _recommend_strategy_fn(features)

        return {
            "success": True,
            "features": {
                "resolution_bucket": features.resolution_bucket,
                "height": features.height,
                "width": features.width,
                "contrast_stddev": round(features.contrast_stddev, 2),
                "skew_angle": round(features.skew_angle, 2),
                "laplacian_variance": round(features.laplacian_variance, 2),
                "text_density": round(features.text_density, 4),
                "is_thermal": features.is_thermal,
                "estimated_dpi": round(features.estimated_dpi, 1),
            },
            "recommendation": {
                "strategy": rec.strategy.value,
                "confidence": round(rec.confidence, 3),
                "easyocr_score": round(rec.easyocr_score, 2),
                "paddle_score": round(rec.paddle_score, 2),
                "reasons": rec.reasons,
            },
        }
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.error(f"[receipt/analyze] error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


# ============================================================================
# Receipt OCR Scan Endpoint (image bytes in, structured result out)
# ============================================================================
# This endpoint owns the full OCR pipeline: pick engine via recommender →
# run OCR → parse → if should_escalate(), run the OTHER engine + merge →
# parse again → if STILL bad, run targeted re-OCR for missing prices.
#
# This is the high-accuracy path for receipts. The existing /receipt/parse
# (tokens-in) endpoint stays for backward compatibility with any client
# that runs OCR client-side; /receipt/scan is the recommended path.
#
# Engines are loaded lazily on first request to keep cold start fast for
# users who don't hit this endpoint. Once loaded, they stay resident.

# Resolve engines.py path (mirrors the receipt_parser loader pattern)
_ENGINES_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "lib" / "receipt-ocr" / "engines.py",
    Path(__file__).resolve().parent / "engines.py",
]

_engines_mod = None
for _ec in _ENGINES_CANDIDATES:
    if _ec.exists():
        try:
            _e_spec = _ilu.spec_from_file_location("receipt_engines", _ec)
            _engines_mod = _ilu.module_from_spec(_e_spec)
            _e_spec.loader.exec_module(_engines_mod)
            logger.info(f"Located engines module at {_ec} (lazy load on first scan)")
            break
        except Exception as _e:
            logger.warning(f"Could not import engines.py from {_ec}: {_e}")
            _engines_mod = None

# Per-engine singleton cache. Loaded on first use, kept resident.
_engine_cache: Dict[str, Any] = {}
_engine_cache_lock = asyncio.Lock()


async def _get_engine(name: str):
    """Return a loaded OCR engine by name, creating it on first request.

    Loading EasyOCR / PaddleOCR pulls 200-500MB of model weights, so we
    avoid doing it at startup. The async lock prevents two concurrent
    first-use requests from loading the same engine twice.
    """
    if _engines_mod is None:
        raise HTTPException(
            status_code=503,
            detail="OCR engines module not available — check engines.py is on the path",
        )
    if name in _engine_cache:
        return _engine_cache[name]
    async with _engine_cache_lock:
        if name in _engine_cache:
            return _engine_cache[name]
        logger.info(f"[receipt/scan] loading engine {name!r} (first use)")
        eng = await asyncio.to_thread(_engines_mod.create_engine, name, load=True)
        _engine_cache[name] = eng
        return eng


class ReceiptScanResponse(BaseModel):
    success: bool
    result: Optional[ReceiptParseResult] = None
    # Diagnostic chain — what was tried, in order
    strategy_used: Optional[str] = None        # final strategy that produced `result`
    strategies_tried: List[str] = []           # ordered list of attempts
    escalated: bool = False                    # True if we ran more than the recommender's pick
    targeted_reocr_used: bool = False          # True if missing-price re-OCR ran
    llm_tokens_used: bool = False              # True if Tier 3 (LLM-as-parser) ran
    llm_vision_used: bool = False              # True if Tier 4 (LLM-vision) ran
    llm_cost_estimate_usd: float = 0.0         # rough cost for the LLM tiers
    parse_confidence: Optional[float] = None
    error: Optional[str] = None
    # Training-pipeline fields — populated when the request asked to capture
    # this scan as a training example. See receipt_training_examples table.
    training_id: Optional[str] = None
    training_disposition: Optional[str] = None  # "auto_accepted" | "needs_review" | "skipped"


# ── LLM tier helpers ──────────────────────────────────────────────────────
# Pricing constants (used only for estimate logging, not billing). Keep
# these in sync with OpenAI's published rates; out of date is harmless.

_LLM_MODEL_TOKENS = "gpt-4o-mini"          # cheap; tokens-in path
_LLM_MODEL_VISION = "gpt-4o-mini"          # has vision capability + cheap
_LLM_PRICE_PER_INPUT_TOKEN = 0.15 / 1_000_000   # gpt-4o-mini
_LLM_PRICE_PER_OUTPUT_TOKEN = 0.60 / 1_000_000

# JSON schema that both LLM tiers are asked to produce. Matches
# ReceiptParseResult so the downstream code is uniform.
_LLM_RECEIPT_SCHEMA = """{
  "store": "string (best-guess store/merchant name, or 'Unknown')",
  "date": "string|null (YYYY-MM-DD if visible)",
  "items": [
    {"name": "string", "quantity": int, "price": float}
  ],
  "subtotal": "float|null",
  "taxes": [{"rate": float, "amount": float}],
  "total": "float|null"
}"""


def _llm_messages_for_tokens(tokens: List[str]) -> List[Dict[str, Any]]:
    """Build the chat messages for the tokens-in LLM parser."""
    joined = " ".join(t for t in tokens if t)[:8000]  # cap to avoid runaway
    user = f"""You are parsing a grocery store receipt. Below are OCR tokens
in approximate reading order. Extract a structured receipt as JSON matching
this schema:

{_LLM_RECEIPT_SCHEMA}

Rules — important:
- Output STRICTLY valid JSON, no commentary.
- Use null when unknown. Do NOT invent values.
- Items: only include line items that are real products. Skip subtotals,
  totals, taxes, payment lines, store-info lines.
- For each item, "price" is the line total (qty * unit_price), not the
  unit price.
- If the receipt has multiple totals (e.g. subtotal + tax + total), put
  them in the right fields; do not duplicate.
- Quantities default to 1 if not visibly printed.

OCR tokens:
{joined}"""
    return [
        {"role": "system", "content": "You are a precise receipt parser. Output JSON only."},
        {"role": "user", "content": user},
    ]


def _llm_messages_for_vision(image_bytes: bytes, mime: str) -> List[Dict[str, Any]]:
    """Build the chat messages for the image-in LLM parser."""
    import base64
    b64 = base64.b64encode(image_bytes).decode()
    return [
        {"role": "system", "content": "You are a precise receipt parser. Output JSON only."},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Parse this grocery receipt into JSON matching this schema:\n"
                        f"{_LLM_RECEIPT_SCHEMA}\n\n"
                        "Rules: output strict JSON only, use null when unknown, do NOT "
                        "invent values, skip non-item lines (totals/taxes/payment), "
                        "and put line totals (qty*unit_price) in the price field."
                    ),
                },
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{b64}"},
                },
            ],
        },
    ]


async def _call_llm(messages: List[Dict[str, Any]], model: str) -> Tuple[Dict[str, Any], float]:
    """Call OpenAI with response_format=json_object. Returns (parsed_dict, cost_estimate_usd)."""
    if openai_client is None:
        raise HTTPException(status_code=503, detail="OpenAI client not configured")

    resp = await asyncio.to_thread(
        openai_client.chat.completions.create,
        model=model,
        messages=messages,
        temperature=0.0,                              # deterministic
        response_format={"type": "json_object"},
    )

    raw = resp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {}

    usage = getattr(resp, "usage", None)
    cost = 0.0
    if usage is not None:
        cost = (
            (getattr(usage, "prompt_tokens", 0) or 0) * _LLM_PRICE_PER_INPUT_TOKEN
            + (getattr(usage, "completion_tokens", 0) or 0) * _LLM_PRICE_PER_OUTPUT_TOKEN
        )

    return parsed, cost


def _coerce_llm_result(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise the LLM output into the shape parse_receipt() returns.

    LLMs sometimes return slightly off shapes (price as a string, items missing
    quantity, taxes as a single dict). We coerce here so the downstream
    checksum-validation + Pydantic boundary doesn't reject otherwise-good output.
    """
    def _to_float(v):
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v.replace(",", "").replace("$", "").strip())
            except ValueError:
                return None
        return None

    out: Dict[str, Any] = {
        "store": str(raw.get("store") or "Unknown"),
        "date": raw.get("date") or None,
        "subtotal": _to_float(raw.get("subtotal")),
        "total": _to_float(raw.get("total")),
        "items": [],
        "taxes": [],
    }

    for it in raw.get("items") or []:
        if not isinstance(it, dict):
            continue
        name = str(it.get("name") or "").strip()
        if not name:
            continue
        qty_raw = it.get("quantity")
        try:
            qty = int(qty_raw) if qty_raw is not None else 1
        except (TypeError, ValueError):
            qty = 1
        price = _to_float(it.get("price"))
        if price is None:
            continue
        out["items"].append({"name": name, "quantity": qty, "price": price})

    taxes_raw = raw.get("taxes")
    if isinstance(taxes_raw, dict):
        taxes_raw = [taxes_raw]
    for t in taxes_raw or []:
        if not isinstance(t, dict):
            continue
        amt = _to_float(t.get("amount"))
        if amt is None:
            continue
        out["taxes"].append({
            "rate": _to_float(t.get("rate")) or 0.0,
            "amount": amt,
        })

    return out


def _validate_llm_against_ocr(parsed: Dict[str, Any], ocr_texts: List[str]) -> Dict[str, Any]:
    """Strip items the LLM probably hallucinated.

    Heuristic: an item is suspicious if neither its name nor its price has any
    presence in the OCR token stream. Real items always leave at least one
    fingerprint there. We drop suspicious items rather than poisoning the
    training set; the rest of the parse is preserved.
    """
    if not ocr_texts:
        return parsed

    upper_blob = " ".join(t.upper() for t in ocr_texts)

    def _price_in_ocr(price: float) -> bool:
        target = f"{price:.2f}"
        return target in upper_blob or target.replace(".", ",") in upper_blob

    def _name_in_ocr(name: str) -> bool:
        words = [w for w in name.upper().split() if len(w) >= 3]
        if not words:
            return False
        return any(w in upper_blob for w in words)

    cleaned = []
    dropped = 0
    for it in parsed.get("items", []):
        if _name_in_ocr(it["name"]) or _price_in_ocr(it["price"]):
            cleaned.append(it)
        else:
            dropped += 1
    if dropped:
        logger.warning(f"[receipt/scan] LLM hallucination filter: dropped {dropped} items")
    parsed["items"] = cleaned
    return parsed


async def _parse_with_llm_tokens(tokens: List[str]) -> Tuple[Dict[str, Any], float]:
    """Tier 3: ask the LLM to parse OCR tokens into a structured receipt."""
    messages = _llm_messages_for_tokens(tokens)
    raw, cost = await _call_llm(messages, _LLM_MODEL_TOKENS)
    parsed = _coerce_llm_result(raw)
    parsed = _validate_llm_against_ocr(parsed, tokens)
    return parsed, cost


async def _parse_with_llm_vision(image_path: str) -> Tuple[Dict[str, Any], float]:
    """Tier 4: send the raw image to a vision LLM and ask for the structured receipt."""
    with open(image_path, "rb") as f:
        body = f.read()

    suffix = Path(image_path).suffix.lower().lstrip(".")
    mime = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "webp": "image/webp",
        "heic": "image/heic", "heif": "image/heif",
    }.get(suffix, "image/jpeg")

    messages = _llm_messages_for_vision(body, mime)
    raw, cost = await _call_llm(messages, _LLM_MODEL_VISION)
    return _coerce_llm_result(raw), cost


# Strategy → engine name mapping (the recommender returns Strategy enum values)
_STRATEGY_TO_ENGINE = {
    "easyocr_only": "easyocr",
    "paddleocr_only": "paddle",
    "ensemble": "ensemble",
    "ensemble_with_reocr": "ensemble",
}


async def _run_engine_and_parse(engine_name: str, image_path: str) -> Tuple[List[str], Dict[str, Any]]:
    """Load engine if needed, extract tokens, parse. Returns (tokens, parsed)."""
    eng = await _get_engine(engine_name)
    tokens = await asyncio.to_thread(eng.extract, Path(image_path), True)
    parsed = await asyncio.to_thread(_receipt_parse_fn, tokens)
    return tokens, parsed


# Receipt-scan upload limits — tuned for typical phone-photo sizes.
_MAX_RECEIPT_BYTES = 20 * 1024 * 1024  # 20 MB
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
}


@app.post("/receipt/scan", response_model=ReceiptScanResponse)
async def scan_receipt_image(
    file: UploadFile = File(..., description="Receipt image (JPEG/PNG/WebP/HEIC, ≤20MB)"),
    strategy: str = Form("auto"),
    store_hint: Optional[str] = Form(None),
):
    """Run the full OCR pipeline on a receipt image.

    Form-data parameters:
        file        (required) The receipt image (JPEG/PNG/WebP/HEIC, ≤20MB)
        strategy    "auto" (default) | "easyocr" | "paddle" | "ensemble"
                    "auto" uses the recommender + escalation chain.
        store_hint  Optional store name (e.g. "Walmart") to bias the recommender
                    using the per-store preference table.

    Returns a ReceiptScanResponse with the parsed result and diagnostic
    information about which strategies were tried.
    """
    if _receipt_parse_fn is None:
        raise HTTPException(status_code=503, detail="receipt_parser module not available")
    if _engines_mod is None:
        raise HTTPException(status_code=503, detail="engines module not available")

    # Validate content type early — cheap rejection of obviously wrong uploads.
    if file.content_type and file.content_type.lower() not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"unsupported content-type {file.content_type!r}; allowed: {sorted(_ALLOWED_CONTENT_TYPES)}",
        )

    # Read the upload with a hard cap. Streaming bytes-in-memory is fine for
    # 20MB; we deliberately do not stream to disk while reading because a
    # path-traversal attacker can't influence the file path (NamedTemporaryFile).
    body = await file.read()
    if len(body) > _MAX_RECEIPT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"image too large ({len(body)} bytes > {_MAX_RECEIPT_BYTES} max)",
        )
    if not body:
        raise HTTPException(status_code=400, detail="empty image upload")

    # Persist to a temp file. The OCR engines all take a path because cv2
    # and easyocr both want filesystem inputs. Cleanup in finally.
    suffix = ".jpg"
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()
        if len(ext) <= 6:
            suffix = ext
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp.write(body)
    tmp.close()
    image_path = tmp.name

    strategies_tried: List[str] = []
    escalated = False
    targeted_reocr_used = False
    llm_tokens_used = False
    llm_vision_used = False
    llm_cost_total = 0.0
    final_strategy: Optional[str] = None
    final_parsed: Optional[Dict[str, Any]] = None

    try:
        # ── Choose the first engine ────────────────────────────────────
        first_engine: str
        if strategy == "auto":
            if _recommend_strategy_fn is not None and _extract_image_features_fn is not None:
                features = await asyncio.to_thread(_extract_image_features_fn, image_path)
                rec = _recommend_strategy_fn(features, store_hint=store_hint)
                first_engine = _STRATEGY_TO_ENGINE.get(rec.strategy.value, "ensemble")
                logger.info(
                    f"[receipt/scan] recommender → {rec.strategy.value} "
                    f"(conf={rec.confidence:.2f}, store_hint={store_hint!r})"
                )
            else:
                first_engine = "ensemble"
                logger.info("[receipt/scan] no recommender — defaulting to ensemble")
        else:
            first_engine = _STRATEGY_TO_ENGINE.get(strategy, strategy)

        # ── Stage 1: run the chosen engine ─────────────────────────────
        strategies_tried.append(first_engine)
        tokens, parsed = await _run_engine_and_parse(first_engine, image_path)
        final_strategy = first_engine
        final_parsed = parsed

        # ── Stage 1.5: orientation rescue ─────────────────────────────
        # If the parse looks essentially empty (no store + no items), the
        # image may be rotated 90/180/270. EXIF auto-orient already ran in
        # preprocess_base — this catches images that lack EXIF metadata or
        # were rotated after capture (e.g. screenshots).
        n_items = len(parsed.get("items") or [])
        store_known = parsed.get("store") and parsed.get("store") != "Unknown"
        if (
            strategy == "auto"
            and n_items < 2
            and not store_known
            and _engines_mod is not None
            and getattr(_engines_mod, "auto_orient_via_ocr", None) is not None
            and getattr(_engines_mod, "rotate_image", None) is not None
        ):
            try:
                eng = await _get_engine(first_engine)

                def _orientation_score(arr) -> float:
                    # Cheap score: write the rotation to a temp PNG, run the
                    # already-loaded engine at low effort, return mean conf.
                    import cv2 as _cv2
                    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as t:
                        _cv2.imwrite(t.name, arr)
                        try:
                            dets = eng.extract_detections(Path(t.name), do_preprocess=False)
                        except Exception:
                            dets = []
                        try:
                            os.unlink(t.name)
                        except OSError:
                            pass
                    if not dets:
                        return 0.0
                    return sum(d[2] for d in dets) / len(dets)

                best_angle = await asyncio.to_thread(
                    _engines_mod.auto_orient_via_ocr,
                    image_path,
                    _orientation_score,
                )
                if best_angle != 0:
                    logger.info(f"[receipt/scan] orientation rescue: rotating {best_angle}°")
                    strategies_tried.append(f"rotate_{best_angle}")
                    import cv2 as _cv2
                    img = _cv2.imread(image_path)
                    if img is not None:
                        img = _engines_mod.rotate_image(img, best_angle)
                        _cv2.imwrite(image_path, img)
                        # Re-run the same engine on the rotated image
                        tokens, parsed = await _run_engine_and_parse(first_engine, image_path)
                        final_parsed = parsed
            except Exception as _e:
                logger.warning(f"[receipt/scan] orientation rescue failed: {_e}")

        # ── Stage 2: escalate to the OTHER engine + ensemble merge ─────
        # Only meaningful when:
        #   - we just ran a single engine (not already ensemble)
        #   - should_escalate fires (low item count / no total / store unknown / checksum off)
        #   - both engines are available (ensemble exists)
        final_tokens = tokens   # keep the OCR tokens around for downstream LLM tier
        if (
            strategy == "auto"
            and first_engine in ("easyocr", "paddle")
            and _should_escalate_fn is not None
            and _should_escalate_fn(parsed)
            and "ensemble" in (_engines_mod.get_available_engines() if _engines_mod else [])
        ):
            logger.info(
                f"[receipt/scan] escalating: first_engine={first_engine} parse triggered should_escalate"
            )
            escalated = True
            strategies_tried.append("ensemble")
            tokens2, parsed2 = await _run_engine_and_parse("ensemble", image_path)
            # Prefer the ensemble result if it actually improved (more items
            # OR matches checksum better OR previously-missing total now exists).
            if _is_better_parse(parsed2, parsed):
                final_strategy = "ensemble"
                final_parsed = parsed2
                final_tokens = tokens2
                # Targeted re-OCR is already inside EnsembleEngine.extract()
                targeted_reocr_used = True
            else:
                logger.info("[receipt/scan] ensemble did not improve — keeping single-engine result")

        # ── Stage 3: LLM-as-parser (tokens-in) ─────────────────────────
        # Reuses the OCR work already done. Cheap (~$0.001/call), fast (~2s).
        # Triggers when the OCR-based pipeline is still failing escalation
        # AND we actually have tokens to feed to the LLM.
        if (
            strategy == "auto"
            and openai_client is not None
            and final_tokens
            and _should_escalate_fn is not None
            and _should_escalate_fn(final_parsed)
        ):
            logger.info("[receipt/scan] escalating to Tier 3: LLM-as-parser (tokens-in)")
            try:
                strategies_tried.append("llm_tokens")
                llm_parsed, cost = await _parse_with_llm_tokens(final_tokens)
                llm_cost_total += cost
                llm_tokens_used = True
                if _is_better_parse(llm_parsed, final_parsed):
                    final_strategy = "llm_tokens"
                    final_parsed = llm_parsed
                    logger.info("[receipt/scan] llm_tokens improved the parse")
                else:
                    logger.info("[receipt/scan] llm_tokens did not improve — keeping previous result")
            except Exception as e:
                logger.warning(f"[receipt/scan] llm_tokens tier failed: {e}")

        # ── Stage 4: LLM-vision (image-in) ─────────────────────────────
        # The last-resort tier — for receipts where OCR captured so little
        # that even the LLM-on-tokens path can't recover. Sends the raw
        # image bytes to a vision LLM. Most expensive (~$0.005), slowest
        # (~3s), most robust to OCR failure modes (faded thermal, blur).
        if (
            strategy == "auto"
            and openai_client is not None
            and _should_escalate_fn is not None
            and _should_escalate_fn(final_parsed)
        ):
            logger.info("[receipt/scan] escalating to Tier 4: LLM-vision (image-in)")
            try:
                strategies_tried.append("llm_vision")
                llm_parsed, cost = await _parse_with_llm_vision(image_path)
                llm_cost_total += cost
                llm_vision_used = True
                if _is_better_parse(llm_parsed, final_parsed):
                    final_strategy = "llm_vision"
                    final_parsed = llm_parsed
                    logger.info("[receipt/scan] llm_vision improved the parse")
                else:
                    logger.info("[receipt/scan] llm_vision did not improve — keeping previous result")
            except Exception as e:
                logger.warning(f"[receipt/scan] llm_vision tier failed: {e}")

        # ── Build response ─────────────────────────────────────────────
        confidence = _confidence_from_parse(final_parsed) if final_parsed else None
        result = ReceiptParseResult(
            store=final_parsed.get("store", "Unknown") if final_parsed else "Unknown",
            date=final_parsed.get("date") if final_parsed else None,
            items=[ReceiptItem(**item) for item in (final_parsed.get("items") or [])] if final_parsed else [],
            subtotal=final_parsed.get("subtotal") if final_parsed else None,
            taxes=final_parsed.get("taxes") or [] if final_parsed else [],
            total=final_parsed.get("total") if final_parsed else None,
        )
        logger.info(
            f"[receipt/scan] DONE strategy={final_strategy} escalated={escalated} "
            f"items={len(result.items)} total={result.total} confidence={confidence}"
        )
        return ReceiptScanResponse(
            success=True,
            result=result,
            strategy_used=final_strategy,
            strategies_tried=strategies_tried,
            escalated=escalated,
            targeted_reocr_used=targeted_reocr_used,
            llm_tokens_used=llm_tokens_used,
            llm_vision_used=llm_vision_used,
            llm_cost_estimate_usd=round(llm_cost_total, 6),
            parse_confidence=confidence,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[receipt/scan] error: {e}", exc_info=True)
        return ReceiptScanResponse(success=False, error=str(e), strategies_tried=strategies_tried)
    finally:
        try:
            os.unlink(image_path)
        except OSError:
            pass


def _is_better_parse(new: Dict[str, Any], old: Dict[str, Any]) -> bool:
    """Heuristic: does `new` look more complete/correct than `old`?

    Order of precedence:
      1. Has total when old didn't.
      2. Has store when old didn't.
      3. More items than old.
      4. Better checksum (subtotal+tax matches total more closely).
    """
    if new.get("total") is not None and old.get("total") is None:
        return True
    if new.get("store") and not old.get("store"):
        return True
    n_items_new = len(new.get("items") or [])
    n_items_old = len(old.get("items") or [])
    if n_items_new > n_items_old + 1:  # require ≥2 more items to switch
        return True
    # Compare checksum residual
    res_new = _checksum_residual(new)
    res_old = _checksum_residual(old)
    if res_new is not None and res_old is not None and res_new < res_old - 0.10:
        return True
    return False


def _checksum_residual(parsed: Dict[str, Any]) -> Optional[float]:
    """abs(subtotal + tax - total). None if any piece is missing."""
    sub = parsed.get("subtotal")
    tot = parsed.get("total")
    if sub is None or tot is None:
        return None
    taxes = parsed.get("taxes") or []
    tax_sum = sum(t.get("amount", 0) or 0 for t in taxes) if taxes else 0.0
    return abs(sub + tax_sum - tot)


def _confidence_from_parse(parsed: Dict[str, Any]) -> float:
    """Cheap completeness score 0.0–1.0 for client-side display.

    Mirrors recipe_parser._compute_confidence in spirit. Not the same as
    the recommender's confidence (which is about engine choice, not parse
    quality).
    """
    score = 0.0
    if parsed.get("store") and parsed["store"] != "Unknown":
        score += 0.20
    if parsed.get("total") is not None:
        score += 0.20
    if parsed.get("subtotal") is not None:
        score += 0.10
    if parsed.get("date"):
        score += 0.10
    n_items = len(parsed.get("items") or [])
    if n_items >= 2:
        score += 0.20
    if n_items >= 5:
        score += 0.10
    res = _checksum_residual(parsed)
    if res is not None and res < 0.10:
        score += 0.10
    return round(min(score, 1.0), 2)


# ============================================================================
# Recipe OCR Parsing Endpoint
# ============================================================================

# Import recipe_parser — resolve path whether running from python-api/ or repo root
_RECIPE_PARSER_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "lib" / "recipe-ocr" / "recipe_parser.py",
    Path(__file__).resolve().parent / "recipe_parser.py",
]

_recipe_parse_fn = None
_recipe_escalate_fn = None
for _rp_candidate in _RECIPE_PARSER_CANDIDATES:
    if _rp_candidate.exists():
        import importlib.util as _ilu_recipe
        _rp_spec = _ilu_recipe.spec_from_file_location("recipe_parser", _rp_candidate)
        _rp_mod = _ilu_recipe.module_from_spec(_rp_spec)          # type: ignore[arg-type]
        _rp_spec.loader.exec_module(_rp_mod)                      # type: ignore[union-attr]
        _recipe_parse_fn = _rp_mod.parse_recipe
        _recipe_escalate_fn = _rp_mod.should_escalate
        logger.info(f"Loaded recipe_parser from {_rp_candidate}")
        break

# Import recipe_dictionary (optional — graceful degradation)
_recipe_correct_fn = None
try:
    _RECIPE_DICT_CANDIDATES = [
        Path(__file__).resolve().parent.parent / "lib" / "recipe-ocr" / "recipe_dictionary.py",
        Path(__file__).resolve().parent / "recipe_dictionary.py",
    ]
    for _rd_candidate in _RECIPE_DICT_CANDIDATES:
        if _rd_candidate.exists():
            _rd_spec = _ilu_recipe.spec_from_file_location("recipe_dictionary", _rd_candidate)
            _rd_mod = _ilu_recipe.module_from_spec(_rd_spec)
            _rd_spec.loader.exec_module(_rd_mod)
            _recipe_correct_fn = _rd_mod.correct_ingredient_name
            logger.info(f"Loaded recipe_dictionary from {_rd_candidate}")
            break
except Exception as e:
    logger.warning(f"recipe_dictionary not loaded: {e}")

if _recipe_parse_fn is None:
    logger.warning("recipe_parser.py not found — /recipe/parse-ocr will return 503")


class RecipeIngredientParsed(BaseModel):
    quantity: Optional[float] = None
    unit: Optional[str] = None
    name: str
    display_name: str


class RecipeInstructionParsed(BaseModel):
    step: int
    description: str


class RecipeOCRParseResult(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    servings: Optional[int] = None
    prep_time: Optional[int] = None
    cook_time: Optional[int] = None
    ingredients: List[RecipeIngredientParsed] = []
    instructions: List[RecipeInstructionParsed] = []
    notes: List[str] = []
    confidence: float = 0.0


class RecipeOCRParseResponse(BaseModel):
    success: bool
    result: Optional[RecipeOCRParseResult] = None
    escalated: bool = False
    error: Optional[str] = None


class RecipeOCRParseRequest(BaseModel):
    tokens: List[str]


@app.post("/recipe/parse-ocr", response_model=RecipeOCRParseResponse)
async def parse_recipe_ocr_tokens(request: RecipeOCRParseRequest):
    """
    Parse OCR token list into structured recipe metadata.

    Mirrors /receipt/parse but for recipe images (handwritten cards,
    cookbook pages, magazine clippings).

    Accepts:
        { "tokens": ["Grandma's Cookies", "Ingredients", "1 cup flour", ...] }

    Returns:
        { "success": true, "result": { "title": "Grandma's Cookies", ... } }
    """
    if _recipe_parse_fn is None:
        raise HTTPException(status_code=503, detail="recipe_parser module not available")

    tokens = request.tokens
    if not tokens:
        return RecipeOCRParseResponse(success=False, error="tokens list is empty")

    logger.info(f"[recipe/parse-ocr] Parsing {len(tokens)} tokens")

    try:
        # parse_recipe applies dictionary correction internally when the
        # recipe_dictionary module is importable. Off-load to a thread so the
        # CPU-bound regex work does not block the event loop.
        try:
            raw = await asyncio.to_thread(
                _recipe_parse_fn, tokens, apply_dict_correction=True
            )
        except TypeError:
            # Older parser without the kwarg — fall back to manual correction.
            raw = await asyncio.to_thread(_recipe_parse_fn, tokens)
            if _recipe_correct_fn and raw.get("ingredients"):
                for ing in raw["ingredients"]:
                    ing["name"] = _recipe_correct_fn(ing["name"])

        # Check for escalation (low confidence → suggest re-OCR or AI fallback)
        escalated = False
        if _recipe_escalate_fn and _recipe_escalate_fn(raw):
            escalated = True
            logger.info("[recipe/parse-ocr] Escalation triggered — low confidence parse")

        result = RecipeOCRParseResult(
            title=raw.get("title"),
            description=raw.get("description"),
            servings=raw.get("servings"),
            prep_time=raw.get("prep_time"),
            cook_time=raw.get("cook_time"),
            ingredients=[RecipeIngredientParsed(**ing) for ing in (raw.get("ingredients") or [])],
            instructions=[RecipeInstructionParsed(**inst) for inst in (raw.get("instructions") or [])],
            notes=raw.get("notes") or [],
            confidence=raw.get("confidence", 0.0),
        )

        logger.info(
            f"[recipe/parse-ocr] title={result.title!r} "
            f"ingredients={len(result.ingredients)} "
            f"instructions={len(result.instructions)} "
            f"confidence={result.confidence}"
        )
        return RecipeOCRParseResponse(success=True, result=result, escalated=escalated)

    except Exception as e:
        logger.error(f"[recipe/parse-ocr] error: {e}", exc_info=True)
        return RecipeOCRParseResponse(success=False, error=str(e))


# ---------------------------------------------------------------------------
# Startup warmup
# ---------------------------------------------------------------------------
# Receipt and recipe parsers compile a lot of regex and pull in optional
# dictionary modules on first call. Running a tiny dummy parse during startup
# pays that cost once at boot rather than on the first user request, which
# matters because Fly's `min_machines_running = 0` produces a cold start each
# time the machine wakes.

@app.on_event("startup")
async def _warmup_parsers() -> None:
    if _receipt_parse_fn is not None:
        try:
            await asyncio.to_thread(_receipt_parse_fn, ["WARMUP", "1.00"])
            logger.info("[startup] receipt parser warm")
        except Exception as e:
            logger.warning(f"[startup] receipt parser warmup failed: {e}")

    if _recipe_parse_fn is not None:
        try:
            try:
                await asyncio.to_thread(
                    _recipe_parse_fn, ["Warmup", "1 cup flour"], apply_dict_correction=True
                )
            except TypeError:
                await asyncio.to_thread(_recipe_parse_fn, ["Warmup", "1 cup flour"])
            logger.info("[startup] recipe parser warm")
        except Exception as e:
            logger.warning(f"[startup] recipe parser warmup failed: {e}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
