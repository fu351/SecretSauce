from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
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
    stores = ["Target", "Kroger", "Meijer", "99Ranch", "Walmart"]  # Now includes Walmart with Exa+LLM
    
    for store in stores:
        store_results = run_scraper(store, searchTerm, zipCode)
        if isinstance(store_results, list) and store_results:
            # Add store identifier to each item
            for item in store_results:
                item["provider"] = store
            results.extend(store_results)
        elif "error" not in store_results:
            # Handle single item responses
            if store_results:
                store_results["provider"] = store
                results.append(store_results)
    
    return {"results": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
