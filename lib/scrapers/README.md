# Grocery Store Scrapers

This folder contains individual scraper modules for different grocery stores. Each scraper is designed to search for products and return standardized results.

## Scrapers

### Target (`target.js`)
- **Function**: `getTargetProducts(keyword, store_id, zipCode)`
- **Returns**: Array of product objects with pricing and availability
- **Features**: Store location detection, product search, price comparison
- **Notes**: Automatically gets store ID if not provided

### Kroger (`kroger.js`)
- **Function**: `Krogers(zipCode, searchTerm, brand?)`
- **Returns**: Array of product objects with pricing and availability
- **Features**: OAuth authentication, location-based search, brand filtering

### Meijer (`meijer.js`)
- **Function**: `Meijers(zipCode, searchTerm)`
- **Returns**: Array of product objects with pricing and availability
- **Features**: Store location detection, product search, price sorting

### 99 Ranch (`99ranch.js`)
- **Function**: `search99Ranch(keyword, zipCode)`
- **Returns**: Array of product objects with pricing and availability
- **Features**: Store location detection, product search, price sorting

### Walmart (`walmart.js`)
- **Function**: `searchWalmartAPI(keyword, zipCode)`
- **Returns**: Array of product objects with pricing and availability
- **Features**: API-based search with HTML fallback, price comparison
- **Notes**: Uses both API and HTML scraping methods for reliability

## Usage

### Individual Scrapers
\`\`\`javascript
const { getTargetProducts } = require('./target.js');
const { Krogers } = require('./kroger.js');
const { Meijers } = require('./meijer.js');
const { search99Ranch } = require('./99ranch.js');
const { searchWalmartAPI } = require('./walmart.js');

// Use individual scrapers
const targetResults = await getTargetProducts('apples', null, '47906');
const krogerResults = await Krogers('47906', 'apples');
const meijerResults = await Meijers('47906', 'apples');
const ranchResults = await search99Ranch('apples', '47906');
const walmartResults = await searchWalmartAPI('apples', '47906');
\`\`\`

### All Scrapers via Index
\`\`\`javascript
const scrapers = require('./index.js');

// Use all scrapers
const results = await Promise.allSettled([
  scrapers.getTargetProducts(searchTerm, null, zipCode),
  scrapers.Krogers(zipCode, searchTerm),
  scrapers.Meijers(zipCode, searchTerm),
  scrapers.search99Ranch(searchTerm, zipCode),
  scrapers.searchWalmartAPI(searchTerm, zipCode)
]);
\`\`\`

## Integration with Frontend

The scrapers are integrated into the frontend through `lib/grocery-scrapers.ts`:

\`\`\`typescript
import { searchGroceryStores } from '@/lib/grocery-scrapers';

// Use in shopping page
const results = await searchGroceryStores(searchTerm, zipCode);
\`\`\`

## Standardized Product Format

All scrapers return products in this format:
\`\`\`javascript
{
  id: string,
  title: string,
  brand: string,
  price: number,
  pricePerUnit?: string,
  unit?: string,
  image_url: string,
  provider: string,
  location?: string,
  category?: string
}
\`\`\`

## Error Handling

Each scraper includes:
- Timeout handling (5-10 seconds)
- Error logging
- Graceful fallbacks
- Promise.allSettled for concurrent execution
- Price filtering (removes items without prices)

## Dependencies

- `axios`: HTTP requests
- `dotenv`: Environment variables (Kroger)
- `he`: HTML entity decoding (Target)

## Notes

- Scrapers are designed for server-side execution
- Each scraper can be run independently or as part of the unified search
- Results are automatically sorted by price (lowest first)
- Failed scrapers don't affect other scrapers' results
- Walmart scraper uses both API and HTML methods for maximum reliability
