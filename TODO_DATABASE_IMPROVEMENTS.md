# Database Improvements TODO

## Ingredient Cache Cleanup Strategy

### Current Implementation (Option 3 - Lazy Deletion)
- Expired items remain in `ingredient_cache` table
- Filtering happens at query time: `WHERE expires_at > NOW()`
- No automatic cleanup or background jobs
- Simple, but accumulates dead rows over time

### ⚠️ Technical Debt - Upgrade Required

**Priority:** Medium
**Effort:** 2-3 hours
**Status:** Not Started

### Implementation Options

Choose ONE of these before going to production:

#### Option 1: PostgreSQL pg_cron (Recommended for Database-First Approach)
- **Pros:**
  - Fully managed in database
  - No application code needed
  - Minimal infrastructure
- **Cons:**
  - Requires `pg_cron` extension in Supabase
  - Less logging/visibility
- **Implementation:**
  ```sql
  -- Create extension
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- Schedule daily cleanup at 2 AM UTC
  SELECT cron.schedule('delete-expired-ingredients', '0 2 * * *', 'DELETE FROM ingredient_cache WHERE expires_at < NOW()');
  ```

#### Option 2: Application-Level Script (Recommended for Full Control)
- **Pros:**
  - More control and error handling
  - Easy to log and monitor
  - Can be added to existing cron service
- **Cons:**
  - Requires maintaining cleanup code
  - Another service to monitor
- **Implementation Location:**
  - Create `lib/cleanup/ingredientCacheCleanup.ts`
  - Add to Python backend (main.py) or use Vercel Cron
  - Run daily via scheduled task

### Next Steps
1. [ ] Decide between Option 1 or Option 2
2. [ ] Check Supabase admin panel for `pg_cron` availability (for Option 1)
3. [ ] Implement chosen solution
4. [ ] Set up monitoring/alerting for cleanup job
5. [ ] Test cleanup on staging environment
6. [ ] Monitor cleanup logs in production

### Cleanup Query (for reference)
```sql
DELETE FROM public.ingredient_cache
WHERE expires_at < NOW();
```

### Monitoring Metrics
- Track cleanup runs and deleted row counts
- Alert if cleanup hasn't run in 48 hours
- Monitor table growth rate (ingredient_cache should stay relatively stable)

---

**Last Updated:** 2025-11-15
**Updated By:** Claude Code
**Related Files:**
- `scripts/DATABASE_SCHEMA_UPDATE.sql` - Initial schema
- Cleanup implementation file (TBD)
