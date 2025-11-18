from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import subprocess
import json
import os
import logging
import tempfile
from pathlib import Path
from typing import Any, Dict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Grocery Scraper API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path to your scraper scripts (in lib/scrapers from project root)
SCRAPER_PATH = Path(__file__).parent.parent / "lib" / "scrapers"


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
    zipCode: str = Query(default="47906")
):
    """
    Search for grocery items across multiple stores concurrently.

    Uses per-store isolation to ensure:
    - One failing scraper doesn't block others
    - Detailed error logging per store
    - Timeout protection (30s per store, total ~30s due to async)
    """
    logger.info(f"Starting grocery search for: {searchTerm} (zip: {zipCode})")
    results = []
    stores = ["Target", "Kroger", "Meijer", "99Ranch", "Walmart"]

    # Run scrapers concurrently in isolated tasks so a slow store doesn't block the rest
    tasks = [
        asyncio.to_thread(run_scraper_isolated, store, searchTerm, zipCode)
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
