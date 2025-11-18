# Ingredient Cache & Recipe Pricing Implementation

## Overview

This document describes the ingredient caching system that enables:
1. **Cache-first shopping list search** - Check database before scraping
2. **Recipe pricing display** - Show cheapest cost to make a recipe
3. **Daily price updates** - Automated scraper that updates prices across stores

## Features Implemented

### 1. Cache-First Shopping List Search

**Files:**
- `lib/ingredient-cache.ts` - Cache utility functions
- `app/api/grocery-search/route.ts` - Updated to check cache first

**How it works:**
1. User searches for an ingredient (e.g., "chicken breast")
2. System checks `ingredient_cache` table for non-expired entries
3. If found (expires_at > NOW()), returns cached results immediately
4. If not found or expired, runs scrapers as fallback
5. Response includes `cached: true` flag to indicate cache hit

**Database dependency:**
- Requires `standardized_ingredients` table
- Requires `ingredient_cache` table with expiry filtering

### 2. Recipe Pricing Display

**Files:**
- `lib/recipe-pricing.ts` - Recipe pricing calculation logic
- `components/recipe-pricing-info.tsx` - React component for display
- `app/api/recipe-pricing/route.ts` - API endpoint
- `app/recipes/[id]/page.tsx` - Integration in recipe detail page

**How it works:**
1. Shows on recipe detail page automatically
2. Queries `ingredient_mappings` to find standardized ingredients for the recipe
3. Fetches non-expired prices from `ingredient_cache` per store
4. Calculates total recipe cost per store
5. Highlights the cheapest option with savings amount
6. Shows ingredient breakdown and price comparison by store

**Display:**
- Appears as a card above the ingredients section
- Shows "Not available" if recipe ingredients haven't been standardized
- Shows "Loading..." while fetching data

**Database dependency:**
- Requires `ingredient_mappings` table (links recipes to standardized ingredients)
- Requires `ingredient_cache` table (stores prices)

### 3. Daily Scraper Script

**Files:**
- `app/api/daily-scraper/route.ts` - Scraper API endpoint (Node.js)

**How it works:**
1. Iterates through all `standardized_ingredients`
2. For each ingredient, runs scrapers for Target, Kroger, Meijer, 99 Ranch, Walmart
3. Finds the cheapest item from each scraper
4. Caches results in `ingredient_cache` with 24-hour expiry
5. Returns summary of cached items and failures

**Endpoints:**
- `GET /api/daily-scraper` - Trigger scraper
- `POST /api/daily-scraper` - Alternative trigger (same logic)

**Authentication:**
- Secured with `CRON_SECRET` environment variable
- Request must include: `Authorization: Bearer {CRON_SECRET}`

## Setup Instructions

### Prerequisites

1. **Run Database Migration**
   ```sql
   -- Execute scripts/DATABASE_SCHEMA_UPDATE.sql in Supabase
   -- This creates:
   -- - standardized_ingredients table
   -- - ingredient_cache table
   -- - ingredient_mappings table
   -- - Updates profiles table with theme_preference
   ```

2. **Update Environment Variables**
   ```
   # Add to .env.local
   CRON_SECRET=your_secret_key_here
   ```

3. **Set up service role key** (for server-side operations)
   ```
   # Already in .env.local
   SUPABASE_SERVICE_ROLE_KEY=your_service_key
   ```

### Initial Setup

#### 1. Create Standardized Ingredients

Before the system can work, you need to populate the `standardized_ingredients` table. You have two options:

**Option A: Manual SQL Insert**
```sql
INSERT INTO public.standardized_ingredients (canonical_name, category) VALUES
('chicken breast', 'Poultry'),
('ground beef', 'Beef'),
('olive oil', 'Oils & Vinegars'),
('butter', 'Dairy'),
('eggs', 'Dairy'),
-- ... add more as needed
```

**Option B: Use the ingredient cache utilities**
```typescript
import { getOrCreateStandardizedIngredient } from '@/lib/ingredient-cache'

// Call this when creating recipes or standardizing ingredients
const ingredientId = await getOrCreateStandardizedIngredient('chicken breast', 'Poultry')
```

#### 2. Create Ingredient Mappings

Link recipe ingredients to standardized ingredients:

```sql
INSERT INTO public.ingredient_mappings (recipe_id, original_name, standardized_ingredient_id)
SELECT
  r.id,
  jsonb_array_elements(r.ingredients)->>'name' as original_name,
  si.id
FROM recipes r
CROSS JOIN LATERAL (
  SELECT id FROM standardized_ingredients
  WHERE canonical_name = jsonb_array_elements(r.ingredients)->>'name'
) si
```

Or use the utility function:
```typescript
import { supabase } from '@/lib/supabase'

// When a recipe is created/updated, map ingredients:
const { data: mappings } = await supabase
  .from('ingredient_mappings')
  .insert(ingredientMappings)
```

### Setting up Daily Scraper

#### Current: Vercel Cron (Node.js)

1. Create `vercel.json` in project root:
```json
{
  "crons": [{
    "path": "/api/daily-scraper",
    "schedule": "0 2 * * *"
  }]
}
```

2. Set CRON_SECRET in Vercel environment variables:
```
CRON_SECRET=your_very_secure_random_string
```

3. Vercel will automatically call the endpoint daily at 2 AM UTC

#### Alternative: External Cron Service (e.g., EasyCron, cron-job.org)

1. Set CRON_SECRET in `.env.local`:
```
CRON_SECRET=your_very_secure_random_string
```

2. Create external cron job to call:
```
https://yourdomain.com/api/daily-scraper?secret=your_very_secure_random_string
```

3. Or use Authorization header:
```
GET https://yourdomain.com/api/daily-scraper
Authorization: Bearer your_secret_key
```

#### Manual Testing

To test the scraper locally:

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Trigger scraper
curl http://localhost:3000/api/daily-scraper \
  -H "Authorization: Bearer your_secret_key"
```

## Usage

### In Shopping List Page

The cache is automatically used when searching for ingredients:

```typescript
// Automatically checks cache first
const results = await searchGroceryStores("chicken breast", "47906")
// Returns { results: [...], cached: true } if from cache
```

### In Recipe Detail Page

Pricing info automatically displays if ingredients are standardized:

```typescript
// Component automatically fetches pricing
<RecipePricingInfo recipeId={recipeId} />
```

### Manual Cache Operations

```typescript
import {
  searchIngredientCache,
  cacheIngredientPrice,
  getCachedIngredientById,
  getOrCreateStandardizedIngredient,
  cleanupExpiredCache
} from '@/lib/ingredient-cache'

// Search cache
const results = await searchIngredientCache("chicken breast", ["Target", "Walmart"])

// Get all cached prices for a specific ingredient
const prices = await getCachedIngredientById(ingredientId)

// Manually cache a price
await cacheIngredientPrice(
  ingredientId,
  "Target",
  "Fresh Chicken Breast",
  9.99,  // price
  1,     // quantity
  "lb",  // unit
  9.99,  // unit price
  "https://image.jpg",
  "https://product.url"
)

// Clean up expired entries (runs daily, but can trigger manually)
const deleted = await cleanupExpiredCache()
```

## Database Schema

### standardized_ingredients
```sql
id UUID PRIMARY KEY
canonical_name TEXT UNIQUE (e.g., "chicken breast")
category TEXT (e.g., "Poultry")
created_at TIMESTAMP
updated_at TIMESTAMP
```

### ingredient_cache
```sql
id UUID PRIMARY KEY
standardized_ingredient_id UUID (Foreign Key)
store TEXT (e.g., "Target", "Walmart")
price NUMERIC (e.g., 9.99)
quantity NUMERIC (e.g., 1)
unit TEXT (e.g., "lb", "pack")
unit_price NUMERIC (e.g., 9.99)
image_url TEXT
product_url TEXT
product_id TEXT
expires_at TIMESTAMP (24 hours from creation)
created_at TIMESTAMP
updated_at TIMESTAMP
UNIQUE(standardized_ingredient_id, store)
```

### ingredient_mappings
```sql
id UUID PRIMARY KEY
recipe_id UUID (Foreign Key)
original_name TEXT (how it appears in recipe, e.g., "boneless chicken breasts")
standardized_ingredient_id UUID (Foreign Key)
created_at TIMESTAMP
UNIQUE(recipe_id, original_name)
```

## Monitoring

### Check Cache Hit Rate
```sql
-- Count cache hits vs misses
SELECT COUNT(*) FROM ingredient_cache WHERE expires_at > NOW();

-- See which ingredients have cached prices
SELECT DISTINCT s.canonical_name, s.category,
       COUNT(DISTINCT ic.store) as store_count
FROM standardized_ingredients s
LEFT JOIN ingredient_cache ic ON s.id = ic.standardized_ingredient_id
WHERE ic.expires_at > NOW()
GROUP BY s.id, s.canonical_name, s.category;
```

### Monitor Scraper Health
```sql
-- Check when caches were last updated
SELECT store, MAX(updated_at) as last_update
FROM ingredient_cache
GROUP BY store
ORDER BY last_update DESC;

-- Find expired cache entries (should be periodically cleaned up)
SELECT COUNT(*) FROM ingredient_cache WHERE expires_at < NOW();
```

## Troubleshooting

### Recipe pricing shows "Not available"
**Cause:** Ingredients haven't been mapped to standardized ingredients
**Solution:** Run ingredient mapping for that recipe

### Cache appears empty
**Cause:** Daily scraper hasn't run yet, or all entries have expired
**Solution:** Manually trigger `/api/daily-scraper` endpoint

### Scraper returns errors
**Cause:** One or more store scrapers failed
**Solution:** Check logs in `/api/daily-scraper` response, some stores may be temporarily unavailable

### Authorization failed for daily scraper
**Cause:** CRON_SECRET not set or incorrect
**Solution:** Verify `CRON_SECRET` environment variable is set and matches the request

## Future Improvements

### High Priority
1. **Migrate scraper to Fly.io Python backend** (TODO)
   - Rewrite scrapers in Python using existing `lib/scrapers/` JS as reference
   - Use APScheduler for cron scheduling
   - Leverage Fly.io's persistent app for better performance
   - Better concurrency control for multi-store scraping

### Medium Priority
2. **Cleanup Strategy Upgrade** (See TODO_DATABASE_IMPROVEMENTS.md)
   - Implement pg_cron extension for automatic cleanup
   - Or create application-level cleanup script

3. **Ingredient Standardization**
   - Add OpenAI-powered ingredient name normalization
   - Create ingredient mapping UI for users
   - Batch standardization for new recipes

### Lower Priority
4. **Enhanced Caching**
   - Cache results by postal code / distance
   - Support store location selection
   - Cache invalidation based on user preferences

5. **Performance Optimization**
   - Batch scraper requests per store
   - Implement Redis caching layer
   - Add database indexing optimization

6. **User Features**
   - Show recipe pricing in recipe list cards
   - Add price history / trending
   - Budget-based recipe filtering
   - Price alerts for favorite ingredients
