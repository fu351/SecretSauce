from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import subprocess
import json
import os
from pathlib import Path

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

def run_scraper(script: str, search_term: str, zip_code: str):
    """Run a Node.js scraper script and return results"""
    
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
        result = subprocess.run(
            ["node", str(script_path.absolute()), search_term, str(zip_code)],
            capture_output=True,
            text=True,
            check=True,
            timeout=30  # 30 second timeout
        )
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        return {"error": f"Timeout running {script}"}
    except subprocess.CalledProcessError as e:
        return {"error": f"Script error in {script}: {e.stderr}"}
    except json.JSONDecodeError:
        return {"error": f"Invalid JSON from {script}"}
    except Exception as e:
        return {"error": f"Failed to run {script}: {str(e)}"}

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
    """Search for grocery items across multiple stores"""
    results = []
    stores = ["Target", "Kroger", "Meijer", "99Ranch", "Walmart"]

    # Run scrapers concurrently so a slow store doesn't block the rest
    tasks = [asyncio.to_thread(run_scraper, store, searchTerm, zipCode) for store in stores]
    store_results_list = await asyncio.gather(*tasks, return_exceptions=True)

    for store, store_results in zip(stores, store_results_list):
        if isinstance(store_results, Exception):
            results.append({"error": f"{store} scraper failed: {store_results}"})
            continue

        if isinstance(store_results, list) and store_results:
            for item in store_results:
                item["provider"] = store
            results.extend(store_results)
            continue

        if isinstance(store_results, dict) and "error" in store_results:
            results.append({"error": f"{store}: {store_results['error']}"})
            continue

        if store_results:
            # Handle single item dict responses
            store_results["provider"] = store
            results.append(store_results)

    return {"results": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
