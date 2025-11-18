import { type NextRequest, NextResponse } from "next/server"
import {
  searchWithCache,
  cacheScrapedResults,
} from "@/lib/ingredient-cache"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawSearchTerm = searchParams.get("searchTerm") || ""
  const sanitizedSearchTerm = (rawSearchTerm.split(",")[0] || "").trim() || rawSearchTerm.trim()
  const zipCode = searchParams.get("zipCode") || "47906"
  const rawStoreParam = (searchParams.get("store") || "").trim()
  const storeKey = resolveStoreKey(rawStoreParam)

  if (!sanitizedSearchTerm) {
    return NextResponse.json({ error: "Search term is required" }, { status: 400 })
  }

  // Try to get cached results first using intelligent cache search
  const cacheResult = await searchWithCache(
    sanitizedSearchTerm,
    storeKey ? [mapStoreKeyToName(storeKey)] : undefined
  )
  const standardizedIngredientId = cacheResult.standardizedId

  if (cacheResult.cached && cacheResult.cached.length > 0) {
    console.log(`Found ${cacheResult.cached.length} fresh cached results for "${sanitizedSearchTerm}" from cache`)
    const formattedResults = formatCachedResults(cacheResult.cached)
    return NextResponse.json({ results: formattedResults, cached: true, source: "database" })
  }

  if (storeKey) {
    try {
      const results = await runStoreSpecificSearch(storeKey, sanitizedSearchTerm, zipCode)

      // Cache the scraped results for future searches
      if (results && results.length > 0) {
        const cachedCount = await cacheScrapedResults(
          results.map(item => ({
            title: item.title,
            brand: item.brand || undefined,
            price: item.price,
            pricePerUnit: item.pricePerUnit,
            unit: item.unit,
            image_url: item.image_url,
            provider: item.provider,
            product_url: item.product_url,
            product_id: item.id,
          })), { standardizedIngredientId }
        )
        console.log(`Cached ${cachedCount}/${results.length} scraped results from ${storeKey}`)
      }

      return NextResponse.json({ results })
    } catch (error) {
      console.error(`Error running ${storeKey} scraper:`, error)
      return NextResponse.json({ results: [] })
    }
  }

  try {
    // Try to call the Python grocery search service
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000"

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout for Python service

    const response = await fetch(
      `${pythonServiceUrl}/grocery-search?searchTerm=${encodeURIComponent(sanitizedSearchTerm)}&zipCode=${zipCode}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      },
    )

    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json()
      // Check if Python service returned results
      if (data.results && data.results.length > 0) {
        console.log(`[Python Service] Got ${data.results.length} results from Python service`)

        // Cache the Python service results for future searches
        const cachedCount = await cacheScrapedResults(
          data.results.map((item: any) => ({
            title: item.title,
            brand: item.brand || undefined,
            price: item.price,
            pricePerUnit: item.pricePerUnit,
            unit: item.unit,
            image_url: item.image_url,
            provider: item.provider,
            product_url: item.product_url,
            product_id: item.id,
          })), { standardizedIngredientId }
        )
        console.log(`Cached ${cachedCount}/${data.results.length} results from Python service`)

        return NextResponse.json(data)
      } else {
        console.warn("Python service returned no results, falling back to local scrapers")
      }
    }
  } catch (error) {
    console.warn("Python service not available, using local scrapers:", error)
  }

  // Try local scrapers if Python service is not available
  try {
    const scrapers = require('@/lib/scrapers')
    
    const results = await Promise.allSettled([
      scrapers.getTargetProducts(sanitizedSearchTerm, null, zipCode),
      scrapers.Krogers(zipCode, sanitizedSearchTerm),
      scrapers.Meijers(zipCode, sanitizedSearchTerm),
      scrapers.search99Ranch(sanitizedSearchTerm, zipCode),
      scrapers.searchWalmartAPI(sanitizedSearchTerm, zipCode),
      scrapers.searchTraderJoes(sanitizedSearchTerm, zipCode),
      scrapers.searchAldi(sanitizedSearchTerm, zipCode)
    ])

    const allItems = []
    
    // Process Target results
    if (results[0].status === 'fulfilled' && results[0].value.length > 0) {
      const targetItems = results[0].value.map((item: any) => ({
        id: item.id || `target-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Target",
        location: "West Lafayette Target",
        category: item.category,
      }))
      allItems.push(...targetItems)
    } else {
      console.warn("Target scraper failed or returned no results")
    }

    // Process Kroger results
    if (results[1].status === 'fulfilled' && results[1].value.length > 0) {
      const krogerItems = results[1].value.map((item: any) => ({
        id: item.id || `kroger-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Kroger",
        location: item.location || "West Lafayette Kroger",
        category: item.category,
      }))
      allItems.push(...krogerItems)
    } else {
      console.warn("Kroger scraper failed or returned no results")
    }

    // Process Meijer results
    if (results[2].status === 'fulfilled' && results[2].value.length > 0) {
      const meijerItems = results[2].value.map((item: any) => ({
        id: item.id || `meijer-${Math.random()}`,
        title: item.name || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Meijer",
        location: "West Lafayette Meijer",
        category: item.category,
      }))
      allItems.push(...meijerItems)
    } else {
      console.warn("Meijer scraper failed or returned no results")
    }

    // Process 99 Ranch results
    if (results[3].status === 'fulfilled' && results[3].value.length > 0) {
      const ranchItems = results[3].value.map((item: any) => ({
        id: item.id || `99ranch-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "99 Ranch",
        location: item.location || "99 Ranch Market",
        category: item.category,
      }))
      allItems.push(...ranchItems)
    } else {
      console.warn("99 Ranch scraper failed or returned no results")
    }

    // Process Walmart results
    if (results[4].status === 'fulfilled' && results[4].value.length > 0) {
      const walmartItems = results[4].value.map((item: any) => ({
        id: item.id || `walmart-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Walmart",
        location: item.location || "Walmart Store",
        category: item.category,
      }))
      allItems.push(...walmartItems)
    } else {
      console.warn("Walmart scraper failed or returned no results")
    }

    // Process Trader Joe's results
    if (results[5].status === 'fulfilled' && results[5].value.length > 0) {
      const traderJoesItems = results[5].value.map((item: any) => ({
        id: item.id || `traderjoes-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "Trader Joe's",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Trader Joe's",
        location: item.location || "Trader Joe's Store",
        category: item.category,
      }))
      allItems.push(...traderJoesItems)
    } else {
      console.warn("Trader Joe's scraper failed or returned no results")
    }

    // Process Aldi results
    if (results[6].status === 'fulfilled' && results[6].value.length > 0) {
      const aldiItems = results[6].value.map((item: any) => ({
        id: item.id || `aldi-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "ALDI",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Aldi",
        location: item.location || "Aldi Store",
        category: item.category,
      }))
      allItems.push(...aldiItems)
    } else {
      console.warn("Aldi scraper failed or returned no results")
    }

    // If we have results from any scraper, cache them and return
    if (allItems.length > 0) {
      // Cache all the scraped results for future searches
      const cachedCount = await cacheScrapedResults(
        allItems.map(item => ({
          title: item.title,
          brand: item.brand || undefined,
          price: item.price,
          pricePerUnit: item.pricePerUnit,
          unit: item.unit,
          image_url: item.image_url,
          provider: item.provider,
          product_url: item.product_url,
          product_id: item.id,
        })), { standardizedIngredientId }
      )
      console.log(`Cached ${cachedCount}/${allItems.length} scraped results from local scrapers`)

      return NextResponse.json({ results: allItems })
    }

    // If no scrapers worked, return mock data
    console.warn("All scrapers failed, returning mock data")
    const mockResults = generateMockResults()
    return NextResponse.json({ results: mockResults })

  } catch (error) {
    console.error("Error using local scrapers:", error)
    // Return mock data when scrapers fail
    const mockResults = generateMockResults()
    return NextResponse.json({ results: mockResults })
  }
}

function generateMockResults() {
  const stores = [
    { name: "Target", location: "West Lafayette Target" },
    { name: "Kroger", location: "West Lafayette Kroger" },
    { name: "Meijer", location: "West Lafayette Meijer" },
    { name: "99 Ranch", location: "99 Ranch Market" },
    { name: "Trader Joe's", location: "Trader Joe's Store" },
    { name: "Aldi", location: "Aldi Store" },
  ]

  // Return stores with unavailable message instead of fake prices
  return stores.map((store) => ({
    id: `${store.name.toLowerCase()}-unavailable`,
    title: "Real-time prices unavailable",
    brand: "",
    price: 0,
    pricePerUnit: undefined,
    unit: "",
    image_url: "/placeholder.svg",
    provider: store.name,
    location: store.location,
    category: "Grocery",
  }))
}

function resolveStoreKey(storeParam: string) {
  if (!storeParam) return null
  const value = storeParam.toLowerCase()
  if (value.includes("target")) return "target"
  if (value.includes("kroger")) return "kroger"
  if (value.includes("meijer")) return "meijer"
  if (value.includes("99") || value.includes("ranch")) return "99 ranch"
  if (value.includes("walmart")) return "walmart"
  if (value.includes("trader")) return "trader joes"
  if (value.includes("aldi")) return "aldi"
  return null
}

async function runStoreSpecificSearch(storeKey: string, searchTerm: string, zipCode: string) {
  const scrapers = require("@/lib/scrapers")

  const handlers: Record<string, () => Promise<any[]>> = {
    target: async () => {
      const items = (await scrapers.getTargetProducts(searchTerm, null, zipCode)) || []
      return items.map((item: any) => ({
        id: item.id || `target-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Target",
        location: "West Lafayette Target",
        category: item.category,
      }))
    },
    kroger: async () => {
      const items = (await scrapers.Krogers(zipCode, searchTerm)) || []
      return items.map((item: any) => ({
        id: item.id || `kroger-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Kroger",
        location: item.location || "West Lafayette Kroger",
        category: item.category,
      }))
    },
    meijer: async () => {
      const items = (await scrapers.Meijers(zipCode, searchTerm)) || []
      return items.map((item: any) => ({
        id: item.id || `meijer-${Math.random()}`,
        title: item.name || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Meijer",
        location: "West Lafayette Meijer",
        category: item.category,
      }))
    },
    "99 ranch": async () => {
      const items = (await scrapers.search99Ranch(searchTerm, zipCode)) || []
      return items.map((item: any) => ({
        id: item.id || `99ranch-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "99 Ranch",
        location: item.location || "99 Ranch Market",
        category: item.category,
      }))
    },
    walmart: async () => {
      const items = (await scrapers.searchWalmartAPI(searchTerm, zipCode)) || []
      return items.map((item: any) => ({
        id: item.id || `walmart-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Walmart",
        location: item.location || "Walmart Store",
        category: item.category,
      }))
    },
    "trader joes": async () => {
      const items = (await scrapers.searchTraderJoes(searchTerm, zipCode)) || []
      return items.map((item: any) => ({
        id: item.id || `traderjoes-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "Trader Joe's",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Trader Joe's",
        location: item.location || "Trader Joe's Store",
        category: item.category,
      }))
    },
    "aldi": async () => {
      const items = (await scrapers.searchAldi(searchTerm, zipCode)) || []
      return items.map((item: any) => ({
        id: item.id || `aldi-${Math.random()}`,
        title: item.title || "Unknown Item",
        brand: item.brand || "ALDI",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: "Aldi",
        location: item.location || "Aldi Store",
        category: item.category,
      }))
    },
  }

  if (!handlers[storeKey]) {
    throw new Error(`Unsupported store: ${storeKey}`)
  }

  return handlers[storeKey]()
}

/**
 * Convert a store key to its full name for database queries
 */
function mapStoreKeyToName(storeKey: string): string {
  const storeMap: Record<string, string> = {
    target: "Target",
    kroger: "Kroger",
    meijer: "Meijer",
    "99 ranch": "99 Ranch",
    walmart: "Walmart",
    "trader joes": "Trader Joe's",
    "aldi": "Aldi",
  }
  return storeMap[storeKey] || storeKey
}

/**
 * Format cached ingredient results to match the expected API response format
 */
function formatCachedResults(
  cachedItems: Array<{
    id: string
    standardized_ingredient_id: string
    store: string
    product_name: string | null
    price: number
    quantity: number
    unit: string
    unit_price: number | null
    image_url: string | null
    product_url: string | null
    product_id: string | null
    expires_at: string
  }>
): any[] {
  return cachedItems.map((item) => {
    const quantityDisplay = `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
    const fallbackTitle = item.standardized_ingredient_id
      ? `${item.standardized_ingredient_id} (${quantityDisplay})`
      : quantityDisplay

    return {
      id: item.product_id || item.id,
      title: item.product_name || fallbackTitle,
      brand: "",
      price: item.price,
      pricePerUnit: item.unit_price ? `$${item.unit_price}/${item.unit}` : undefined,
      unit: item.unit,
      image_url: item.image_url || "/placeholder.svg",
      product_url: item.product_url,
      provider: item.store,
      location: `${item.store} Store`,
    }
  })
}
