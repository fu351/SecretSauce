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

### 3. Update the Script with Your Values

Edit `scripts/update-target-faceted-values.ts` and add your store mappings:

```typescript
const TARGET_FACETED_VALUES: Record<string, string> = {
  "3202": "5zkty",   // Berkeley Central Target
  "1407": "xxxxx",   // Your store - replace with actual faceted value
  // Add more stores as needed
}
```

### 4. Run the Update Script

```bash
npx ts-node scripts/update-target-faceted-values.ts
```

This will:
- Find all Target stores in your database
- Update their `metadata` field with the `facetedValue`
- Show a summary of updated/skipped stores

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
// In target.js or test-target-rate-limit.js
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

### Script says "No faceted value defined"
- You haven't added that store's faceted value to `TARGET_FACETED_VALUES`
- Find the faceted value using the steps above and add it to the script

### Scraper still using storeId
- Check if the faceted value is actually in the database:
  ```sql
  SELECT metadata FROM grocery_stores WHERE id = 'your-store-id';
  ```
- Make sure you ran the update script successfully

## Next Steps

1. ✅ Run migration to add `metadata` column
2. ✅ Find faceted values for your Target stores
3. ✅ Update the script with your values
4. ✅ Run the update script
5. ✅ Verify the values in your database
6. ✅ Test the scraper with a search

## Maintainence

- Add new Target stores to the script as you discover them
- Faceted values appear to be stable (don't change frequently)
- If a store's faceted value changes, just update the database:
  ```sql
  UPDATE grocery_stores
  SET metadata = metadata || '{"facetedValue": "new-value"}'::jsonb
  WHERE id = 'store-id';
  ```
