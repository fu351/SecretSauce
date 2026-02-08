from fastapi import FastAPI, Query, HTTPException, Header
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

# Path to your scraper scripts (in lib/scrapers from project root)
SCRAPER_PATH = Path(__file__).parent.parent / "lib" / "scrapers"

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
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a recipe parser. Extract structured recipe data from text. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
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
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an ingredient parser. Extract structured data from ingredient strings. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
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
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a recipe instruction formatter. Clean up and structure cooking instructions. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
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



if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
