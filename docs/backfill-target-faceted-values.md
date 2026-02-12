# Backfilling Target Faceted Values

## Overview

This guide explains how to automatically discover and populate Target's faceted values for all stores in your database.

## What Are Faceted Values?

Target uses `facetedValue` as internal identifiers for store locations. When you filter by "in store" on Target.com, the URL changes to include this parameter (e.g., `facetedValue=5zkty`). These values are tied to specific store locations and ZIP codes.

## Automatic Backfill

### Option 1: Run Locally

```bash
# Install dependencies if needed
npm install

# Run the backfill script
node scripts/backfill-target-faceted-values.js
```

**Requirements:**
- Node.js 18+
- Supabase credentials in `.env` file:
  ```
  SUPABASE_URL=your_supabase_url
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
  ```

### Option 2: Run via GitHub Actions

The backfill runs automatically:
- **Monthly**: Every 1st of the month at 2 AM UTC
- **Manual**: Trigger anytime via GitHub Actions UI

#### To Run Manually:

1. Go to **Actions** tab in your GitHub repository
2. Select **"Backfill Target Faceted Values"** workflow
3. Click **"Run workflow"** button
4. Optionally enable "Dry run mode" to test without database updates
5. Click **"Run workflow"** to start

#### Required Secrets:

Make sure these are set in your repository settings:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (not anon key)

## How It Works

The script:

1. **Fetches all Target stores** from your `grocery_stores` table
2. **For each store**:
   - Extracts the Target store ID (e.g., "3202")
   - Checks if faceted value already exists (skips if found)
   - Discovers the faceted value using two methods:
     - **Method 1**: Target's store locator API
     - **Method 2**: Scraping Target's search page
3. **Updates the database** with discovered faceted values in the `metadata` column
4. **Rate limits** requests (2 seconds between stores) to avoid being blocked

## Database Schema

Faceted values are stored in the `metadata` JSONB column:

```json
{
  "targetStoreId": "3202",
  "facetedValue": "5zkty",
  "lastUpdated": "2026-02-08T12:00:00Z"
}
```

## Verification

After running the script, verify the results:

```sql
-- Check how many stores have faceted values
SELECT
  COUNT(*) as total,
  COUNT(metadata->>'facetedValue') as with_faceted_value,
  COUNT(*) - COUNT(metadata->>'facetedValue') as missing
FROM grocery_stores
WHERE store_enum = 'target' AND is_active = true;

-- View stores with faceted values
SELECT
  name,
  address,
  zip_code,
  metadata->>'targetStoreId' as store_id,
  metadata->>'facetedValue' as faceted_value,
  metadata->>'lastUpdated' as updated
FROM grocery_stores
WHERE store_enum = 'target'
  AND is_active = true
  AND metadata->>'facetedValue' IS NOT NULL
ORDER BY name;

-- View stores missing faceted values
SELECT
  id,
  name,
  address,
  zip_code
FROM grocery_stores
WHERE store_enum = 'target'
  AND is_active = true
  AND (metadata IS NULL OR metadata->>'facetedValue' IS NULL)
ORDER BY name;
```

## Troubleshooting

### Script fails to discover faceted value

**Possible causes:**
1. Target changed their API/HTML structure
2. Store ID is incorrect in the database
3. Rate limiting/bot detection by Target

**Solutions:**
- Manually visit target.com and find the faceted value
- Update the discovery logic in the script
- Increase delay between requests

### Database update fails

**Possible causes:**
1. Missing Supabase credentials
2. Wrong service role key (using anon key instead)
3. Database permissions issue

**Solutions:**
- Check `.env` file has correct credentials
- Ensure using `SUPABASE_SERVICE_ROLE_KEY`, not anon key
- Verify database RLS policies allow updates

### Some stores are skipped

**Expected behavior:**
- Stores that already have faceted values are skipped
- Stores without a valid store ID are skipped

**To force re-discovery:**
```sql
-- Remove faceted value for a specific store
UPDATE grocery_stores
SET metadata = metadata - 'facetedValue'
WHERE id = 'store-uuid-here';

-- Remove all faceted values (use with caution!)
UPDATE grocery_stores
SET metadata = metadata - 'facetedValue'
WHERE store_enum = 'target';
```

## Manual Updates

If the script can't discover a faceted value, add it manually:

```sql
-- Update a single store
UPDATE grocery_stores
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{facetedValue}',
  '"5zkty"'
)
WHERE id = 'store-uuid';

-- Bulk update multiple stores
UPDATE grocery_stores
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{facetedValue}',
  CASE
    WHEN metadata->>'targetStoreId' = '3202' THEN '"5zkty"'
    WHEN metadata->>'targetStoreId' = '1407' THEN '"xxxxx"'
    -- Add more cases as needed
    ELSE metadata->>'facetedValue'
  END::jsonb
)
WHERE store_enum = 'target'
  AND metadata->>'targetStoreId' IN ('3202', '1407');
```

## Monitoring

### Check Workflow Status

- View recent runs: **Actions** → **Backfill Target Faceted Values**
- Each run shows:
  - ✅ Successfully updated stores
  - ⏭️ Skipped stores (already had values)
  - ❌ Failed stores
  - 📊 Total processed

### Enable Notifications

Get notified of failures:
1. Go to **Settings** → **Notifications**
2. Enable **Actions** notifications
3. Choose notification preferences

## Performance

- **Rate Limiting**: 2 second delay between stores
- **Timeout**: 10 seconds per store API request
- **Expected Runtime**: ~5-10 minutes for 100 stores
- **Resource Usage**: Minimal (single Node.js process)

## Best Practices

1. **Run monthly** to catch new stores automatically
2. **Check logs** after each run to identify failures
3. **Manually verify** a few stores after first run
4. **Keep the script updated** if Target changes their structure
5. **Monitor success rate** - if it drops below 80%, investigate

## Future Improvements

Potential enhancements to consider:

- **Retry logic**: Retry failed stores with exponential backoff
- **Parallel processing**: Process multiple stores concurrently
- **Change detection**: Alert when faceted values change
- **Validation**: Verify faceted values actually work
- **Reporting**: Send summary email after each run

## Related Documentation

- [Target Faceted Values Setup](./target-faceted-values.md) - Manual setup guide
- [Target Scraper Documentation](../lib/scrapers/target.js) - Main scraper code
- [GitHub Workflow Configuration](../.github/workflows/backfill-target-faceted-values.yml) - Workflow definition
