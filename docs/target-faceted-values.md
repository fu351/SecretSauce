# Target Faceted Values Setup

## Overview

Target uses a `facetedValue` parameter for "in store" filtering on their website. This parameter is store-specific and provides more accurate localized pricing and availability than just using the `storeId`.

## Database Setup

### 1. Run the Migration

First, add the `metadata` column to your `grocery_stores` table:

```bash
# Apply the migration to your Supabase database
psql -d your_database < migrations/add-store-metadata.sql

# Or run it through Supabase dashboard > SQL Editor
```

The migration adds:
- `metadata` JSONB column to store store-specific data
- GIN index for efficient querying
- Comments explaining the usage

### 2. Find Faceted Values for Your Target Stores

For each Target store in your database, you need to find its `facetedValue`:

1. **Visit Target.com** and search for any product (e.g., "milk")
2. **Click "Pick it up"** or filter by store location
3. **Select your store** from the list
4. **Check the URL** - it should change to something like:
   ```
   https://www.target.com/s?searchTerm=milk&facetedValue=5zkty
   ```
5. **Copy the faceted value** (in this example: `5zkty`)

The faceted value is typically a short alphanumeric code (5-6 characters).

### 3. Update Store Metadata In SQL

Use SQL to write faceted values directly:

```sql
UPDATE grocery_stores
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'facetedValue', '5zkty',
  'targetStoreId', metadata->>'targetStoreId',
  'lastUpdated', NOW()::text
)
WHERE store_enum = 'target'
  AND is_active = true
  AND metadata->>'targetStoreId' = '3202';
```

For multiple stores, run additional updates or use a `CASE` expression.

## Verification

Check if the values were stored correctly:

```sql
-- View all Target stores with their faceted values
SELECT
  id,
  name,
  address,
  metadata->>'facetedValue' as faceted_value,
  metadata->>'targetStoreId' as target_store_id
FROM grocery_stores
WHERE store_enum = 'target'
AND is_active = true;
```

## Usage in Scraping

The updated Target scraper will automatically use `facetedValue` if available:

```javascript
// In target.js
const storeInfo = await getNearestStore(zipCode);

// If metadata includes facetedValue, it will be used:
// https://www.target.com/s?searchTerm=milk&facetedValue=5zkty
//
// Otherwise, falls back to storeId:
// https://www.target.com/s?searchTerm=milk&storeId=3202
```

## Database Schema

After migration, the `grocery_stores` table will have:

```sql
{
  id: string,
  store_enum: 'target' | 'walmart' | ...,
  name: string,
  address: string,
  zip_code: string,
  geom: geometry,
  is_active: boolean,
  created_at: timestamp,
  metadata: {
    targetStoreId: "3202",      // Target store ID
    facetedValue: "5zkty",      // Target faceted value for filtering
    // ... other store-specific fields can be added here
  }
}
```

## Benefits of Using Faceted Values

1. **More accurate "in store" filtering** - matches exactly what Target's website shows
2. **Better pricing accuracy** - ensures prices are for the specific store location
3. **Improved availability** - filters products that are actually available at the store
4. **Future-proof** - stores other metadata without schema changes

## Troubleshooting

### Can't find faceted value
- Make sure you click "Pick it up" and select a specific store
- The URL should change and include `facetedValue` parameter
- If not visible, check browser devtools > Network tab for the API request

### Faceted value still missing
- Confirm you're updating the correct store (`metadata->>'targetStoreId'`)
- Re-run the verification query and validate `metadata->>'facetedValue'` is populated

### Scraper still using storeId
- Check if the faceted value is actually in the database:
  ```sql
  SELECT metadata FROM grocery_stores WHERE id = 'your-store-id';
  ```
- Confirm the store used by the scraper matches the store row you updated

## Next Steps

1. ✅ Run migration to add `metadata` column
2. ✅ Find faceted values for your Target stores
3. ✅ Update `grocery_stores.metadata` in SQL
4. ✅ Verify the values in your database
5. ✅ Test the scraper with a search

## Maintainence

- Add new Target store faceted values directly in database metadata as you discover them
- Faceted values appear to be stable (don't change frequently)
- If a store's faceted value changes, just update the database:
  ```sql
  UPDATE grocery_stores
  SET metadata = metadata || '{"facetedValue": "new-value"}'::jsonb
  WHERE id = 'store-id';
  ```
