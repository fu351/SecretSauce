# TODO: Ingredient Caching System - Future Tasks

## High Priority

### 1. Migrate Scraper to Fly.io Python Backend
**Status:** Not Started
**Effort:** 2-3 days
**Reason:** Better performance, full control over scheduling, leverage existing Python infrastructure

**Tasks:**
- [ ] Analyze existing `lib/scrapers/*.js` files
- [ ] Convert scrapers to Python equivalents
  - [ ] Target scraper
  - [ ] Kroger scraper
  - [ ] Meijer scraper
  - [ ] 99 Ranch scraper
  - [ ] Walmart scraper
- [ ] Implement APScheduler for cron scheduling in `main.py`
- [ ] Create `/api/scrape-ingredients` endpoint in Python
- [ ] Test concurrent scraping with async/await
- [ ] Remove Node.js daily-scraper endpoint once Python version is working
- [ ] Update documentation

**Notes:**
- Keep existing `app/api/daily-scraper/route.ts` as fallback during transition
- Python offers better async/await patterns for I/O-heavy operations
- Can reuse exact same database schema

---

### 2. Ingredient Standardization for Existing Recipes
**Status:** Not Started
**Effort:** 1-2 days (depends on recipe count)
**Reason:** Recipe pricing won't work until ingredients are mapped

**Tasks:**
- [ ] Create batch standardization script
- [ ] Decide standardization approach:
  - [ ] OpenAI API for intelligent matching (recommended)
  - [ ] Fuzzy string matching
  - [ ] Manual mapping UI
- [ ] Map all existing recipe ingredients to `standardized_ingredients`
- [ ] Create entries in `ingredient_mappings` table
- [ ] Add OpenAI integration for new recipes
- [ ] Test recipe pricing display with standardized recipes

**Example standardizations needed:**
- "boneless chicken breasts" → "chicken breast"
- "extra virgin olive oil" → "olive oil"
- "whole wheat flour" → "flour"
- "unsalted butter" → "butter"

---

### 3. Populate Initial Standardized Ingredients Database
**Status:** Not Started
**Effort:** 1-2 hours
**Reason:** System can't function without ingredient list

**Tasks:**
- [ ] Create comprehensive list of common ingredients by category
- [ ] Batch insert into `standardized_ingredients` table
- [ ] Consider starting with top 100 most common recipe ingredients
- [ ] Add category field for organization

**Sample categories:**
- Proteins (Poultry, Beef, Pork, Fish, Dairy)
- Vegetables (Leafy, Root, Cruciferous)
- Fruits
- Grains & Pasta
- Oils & Vinegars
- Spices & Seasonings
- Pantry Staples

---

## Medium Priority

### 4. Database Cleanup Strategy Upgrade
**Status:** Documented (see TODO_DATABASE_IMPROVEMENTS.md)
**Effort:** 2-3 hours
**Reason:** Current lazy deletion will accumulate expired rows over time

**Options:**
- [ ] Option 1: PostgreSQL pg_cron (database-first)
  - Enable `pg_cron` extension in Supabase
  - Schedule daily deletion of expired items
- [ ] Option 2: Application-level cleanup
  - Create Node.js/Python script
  - Run as part of existing cron job

---

### 5. Ingredient Standardization UI
**Status:** Not Started
**Effort:** 1-2 days
**Reason:** Users should be able to standardize their own recipes

**Tasks:**
- [ ] Create admin page for ingredient mapping
- [ ] Add "standardize ingredients" button on recipe creation
- [ ] Build modal to review and confirm mappings
- [ ] Allow manual ingredient selection from standardized list
- [ ] Create ingredient search/filter interface

---

### 6. Recipe Pricing Display Enhancements
**Status:** Partially Done (basic display implemented)
**Effort:** 1 day
**Reason:** Show pricing info in more places

**Tasks:**
- [ ] Add pricing info to recipe list cards
- [ ] Show "per serving" cost calculation
- [ ] Add price comparison badge
- [ ] Display last updated timestamp for prices
- [ ] Add "refresh price" button to trigger new scrape

---

## Lower Priority

### 7. Enhanced Caching Strategy
**Status:** Not Started
**Effort:** 2-3 days
**Reason:** Current caching is basic, can be more intelligent

**Tasks:**
- [ ] Cache by user postal code/distance
- [ ] Allow users to select preferred stores
- [ ] Implement Redis caching layer (optional)
- [ ] Cache invalidation based on store/zip changes
- [ ] Add cache statistics dashboard

---

### 8. Price History & Trending
**Status:** Not Started
**Effort:** 2 days
**Reason:** Historical data helps with budgeting

**Tasks:**
- [ ] Create `ingredient_price_history` table
- [ ] Log prices before each scraper run
- [ ] Add price chart component
- [ ] Show 30-day/90-day price trends
- [ ] Alert users to price increases/decreases

---

### 9. Budget-Based Recipe Filtering
**Status:** Not Started
**Effort:** 1-2 days
**Reason:** Help users find affordable recipes

**Tasks:**
- [ ] Add budget input to recipe search
- [ ] Filter recipes by price per serving
- [ ] Show "budget-friendly" badges
- [ ] Add budget slider to filtering options
- [ ] Sort recipes by cost

---

### 10. Ingredient Price Alerts
**Status:** Not Started
**Effort:** 1-2 days
**Reason:** Notify users of good deals on ingredients

**Tasks:**
- [ ] Create user preferences for watched ingredients
- [ ] Implement alert threshold system
- [ ] Send notifications when prices drop
- [ ] Email notifications for price changes
- [ ] Dashboard showing monitored ingredients

---

## Technical Debt

### 11. Refactor Scraper Error Handling
**Status:** Should do during Python migration
**Effort:** 1 day
**Reason:** Current scrapers may fail silently

**Tasks:**
- [ ] Implement retry logic with exponential backoff
- [ ] Better error logging and monitoring
- [ ] Fallback mechanisms for failed scrapers
- [ ] Detailed error reporting in API response

---

### 12. Add Comprehensive Logging
**Status:** Not Started
**Effort:** 1 day
**Reason:** Difficult to debug scraper issues currently

**Tasks:**
- [ ] Add structured logging to all cache operations
- [ ] Log scraper execution times
- [ ] Track cache hit/miss rates
- [ ] Log ingredient standardization attempts
- [ ] Create monitoring dashboard

---

## Testing & Deployment

### 13. Unit Tests for Ingredient Cache
**Status:** Not Started
**Effort:** 1-2 days
**Reason:** Core functionality needs test coverage

**Tasks:**
- [ ] Test cache hit/miss scenarios
- [ ] Test expiry logic
- [ ] Test ingredient standardization
- [ ] Test pricing calculations
- [ ] Mock scraper responses

---

### 14. Integration Tests for Scraper
**Status:** Not Started
**Effort:** 1 day
**Reason:** Ensure scraper doesn't break existing functionality

**Tasks:**
- [ ] Test full scrape → cache → pricing flow
- [ ] Test multiple concurrent scrapers
- [ ] Test cache fallback when scrapers fail
- [ ] Test database constraint violations

---

### 15. Performance Testing
**Status:** Not Started
**Effort:** 1-2 days
**Reason:** Ensure system scales with more ingredients

**Tasks:**
- [ ] Load test with 1000+ ingredients
- [ ] Benchmark cache lookups
- [ ] Test concurrent user searches
- [ ] Monitor scraper execution time
- [ ] Profile database queries

---

## Priority Ordering

### If working one task at a time:
1. **Migrate Scraper to Fly.io** (blocker for Python excellence)
2. **Populate Standardized Ingredients** (blocker for everything else)
3. **Standardize Existing Recipes** (required for pricing display)
4. **Unit Tests** (quality assurance)
5. **Cleanup Strategy Upgrade** (operational excellence)
6. **Ingredient UI** (user experience)
7. Everything else (nice-to-have)

### If working in parallel (recommended):
- **Team Member 1:** Migrate scraper to Python
- **Team Member 2:** Populate ingredients database + standardize recipes
- **Team Member 3:** Create UI for ingredient standardization + enhance pricing display

---

## Questions & Decisions

1. **Standardization Approach:** Should we use OpenAI API or simpler fuzzy matching?
2. **Fly.io Setup:** Shall we add scheduled tasks via APScheduler or Fly Machines?
3. **Coverage Priority:** Start with top 50 ingredients or comprehensive list?
4. **User Features:** Should users be able to create custom ingredient aliases?

---

**Last Updated:** 2025-11-15
**Created By:** Claude Code
