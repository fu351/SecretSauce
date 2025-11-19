import { type NextRequest, NextResponse } from "next/server"
import {
  searchWithCache,
  cacheScrapedResults,
  getCachedIngredientById,
  getStandardizedIngredientMetadata,
} from "@/lib/ingredient-cache"

type SearchAttempt = {
  term: string
  standardizedId?: string | null
  fromCanonical?: boolean
  canonicalTerm?: string | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawSearchTerm = searchParams.get("searchTerm") || ""
  const sanitizedSearchTerm = (rawSearchTerm.split(",")[0] || "").trim() || rawSearchTerm.trim()
  const zipCode = searchParams.get("zipCode") || "47906"
  const rawStoreParam = (searchParams.get("store") || "").trim()
  const storeKey = resolveStoreKey(rawStoreParam)
  const storeFilter = storeKey ? [mapStoreKeyToName(storeKey)] : undefined

  if (!sanitizedSearchTerm) {
    return NextResponse.json({ error: "Search term is required" }, { status: 400 })
  }

  const initialCacheResult = await searchWithCache(sanitizedSearchTerm, storeFilter)

  if (initialCacheResult.cached && initialCacheResult.cached.length > 0) {
    console.log(`Found ${initialCacheResult.cached.length} cached results for "${sanitizedSearchTerm}"`)
    const formattedResults = formatCachedResults(initialCacheResult.cached, sanitizedSearchTerm)
    return NextResponse.json({ results: formattedResults, cached: true, source: "database" })
  }

  let canonicalSearchTerm: string | null = null
  const attempts: SearchAttempt[] = [
    {
      term: sanitizedSearchTerm,
      standardizedId: initialCacheResult.standardizedId,
      canonicalTerm: null,
    },
  ]

  if (initialCacheResult.standardizedId) {
    const meta = await getStandardizedIngredientMetadata(initialCacheResult.standardizedId)
    const canonicalName = meta?.canonical_name?.trim() ?? null
    canonicalSearchTerm = canonicalName
    attempts[0].canonicalTerm = canonicalName
    if (
      canonicalName &&
      canonicalName.length > 0 &&
      canonicalName.toLowerCase() !== sanitizedSearchTerm.toLowerCase()
    ) {
      attempts.push({
        term: canonicalName,
        standardizedId: initialCacheResult.standardizedId,
        fromCanonical: true,
        canonicalTerm: canonicalName,
      })
    }
  }

  for (const attempt of attempts) {
    const response = await executeSearchAttempt(attempt, { storeKey, storeFilter, zipCode })
    if (response) {
      return NextResponse.json(response)
    }
  }

  console.warn(`All scrapers failed for "${sanitizedSearchTerm}". Returning placeholder results.`)
  return NextResponse.json({ results: generateMockResults(zipCode) })
}

async function executeSearchAttempt(
  attempt: SearchAttempt,
  options: {
    storeKey: string | null
    storeFilter?: string[]
    zipCode: string
  },
) {
  const { storeKey, storeFilter, zipCode } = options
  const searchTerm = attempt.term
  const standardizedIngredientId = attempt.standardizedId
  const normalizedPrimary = searchTerm.trim().toLowerCase()

  if (attempt.fromCanonical && standardizedIngredientId) {
    const cached = await getCachedIngredientById(standardizedIngredientId, storeFilter)
    if (cached.length > 0) {
      console.log(
        `[Cache] Found ${cached.length} cached items for canonical term "${searchTerm}" (standardized: ${standardizedIngredientId})`,
      )
      return { results: formatCachedResults(cached, searchTerm), cached: true, source: "database" }
    }
  }

  const cacheSearchTerm = attempt.canonicalTerm?.trim() || searchTerm

  const runScrapePipeline = async (term: string, reason: string): Promise<{ results: any[] } | null> => {
    if (storeKey) {
      try {
        const storeResults = await runStoreSpecificSearch(storeKey, term, zipCode)
        if (storeResults && storeResults.length > 0) {
          await cacheScrapedResults(serializeForCache(storeResults), {
            standardizedIngredientId,
            searchTerm: cacheSearchTerm,
          })
          return { results: storeResults }
        }
      } catch (error) {
        console.error(`Error running ${storeKey} scraper (${reason}):`, error)
        return null
      }
      return null
    } else {
      const pythonResults = await runPythonServiceSearch(term, zipCode)
      if (pythonResults && pythonResults.length > 0) {
        await cacheScrapedResults(serializeForCache(pythonResults), {
          standardizedIngredientId,
          searchTerm: cacheSearchTerm,
        })
        return { results: pythonResults }
      }

      const localResults = await runLocalScrapers(term, zipCode)
      if (localResults && localResults.length > 0) {
        await cacheScrapedResults(serializeForCache(localResults), {
          standardizedIngredientId,
          searchTerm: cacheSearchTerm,
        })
        return { results: localResults }
      }
    }

    return null
  }

  const primaryResult = await runScrapePipeline(searchTerm, "primary")
  if (primaryResult) {
    return primaryResult
  }

  const fallbackTerm = attempt.canonicalTerm?.trim()
  const normalizedFallback = fallbackTerm?.toLowerCase()

  if (
    !attempt.fromCanonical &&
    fallbackTerm &&
    normalizedFallback &&
    normalizedFallback.length > 0 &&
    normalizedFallback !== normalizedPrimary
  ) {
    console.log(
      `[Scraper] Primary search "${searchTerm}" returned no results; retrying with standardized term "${fallbackTerm}"`
    )
    return runScrapePipeline(fallbackTerm, "canonical-fallback")
  }

  return null
}

function serializeForCache(items: any[]) {
  return items.map((item) => ({
    title: item.title || item.name || "Unknown Item",
    brand: item.brand || undefined,
    price: item.price,
    pricePerUnit: item.pricePerUnit,
    unit: item.unit,
    image_url: item.image_url,
    provider: item.provider,
    product_url: item.product_url,
    product_id: item.id,
  }))
}

async function runPythonServiceSearch(searchTerm: string, zipCode: string) {
  try {
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000"
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(
      `${pythonServiceUrl}/grocery-search?searchTerm=${encodeURIComponent(searchTerm)}&zipCode=${zipCode}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      },
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    if (data.results && data.results.length > 0) {
      console.log(`[Python Service] Retrieved ${data.results.length} items for "${searchTerm}"`)
      return data.results
    }
  } catch (error) {
    console.warn("Python service unavailable:", error)
  }
  return []
}

async function runLocalScrapers(searchTerm: string, zipCode: string) {
  try {
    const scrapers = require("@/lib/scrapers")
    const results = await Promise.allSettled([
      scrapers.getTargetProducts(searchTerm, null, zipCode),
      scrapers.Krogers(zipCode, searchTerm),
      scrapers.Meijers(zipCode, searchTerm),
      scrapers.search99Ranch(searchTerm, zipCode),
      scrapers.searchWalmartAPI(searchTerm, zipCode),
      scrapers.searchTraderJoes(searchTerm, zipCode),
      scrapers.searchAldi(searchTerm, zipCode),
    ])

    const items: any[] = []

    const pushItems = (status: PromiseSettledResult<any[]>, formatter: (value: any) => any) => {
      if (status.status === "fulfilled" && status.value.length > 0) {
        items.push(...status.value.map(formatter).filter(Boolean))
      }
    }

    pushItems(results[0], (item: any) => ({
      id: item.id || `target-${Math.random()}`,
      title: item.title || "Unknown Item",
      brand: item.brand || "",
      price: Number(item.price) || 0,
      pricePerUnit: item.pricePerUnit,
      unit: item.unit,
      image_url: item.image_url || "/placeholder.svg",
      provider: "Target",
      location: item.location || getStoreLocationLabel("Target", zipCode),
      category: item.category,
    }))

    pushItems(results[1], (item: any) => ({
      id: item.id || `kroger-${Math.random()}`,
      title: item.title || "Unknown Item",
      brand: item.brand || "",
      price: Number(item.price) || 0,
      pricePerUnit: item.pricePerUnit,
      unit: item.unit,
      image_url: item.image_url || "/placeholder.svg",
      provider: "Kroger",
      location: item.location || getStoreLocationLabel("Kroger", zipCode),
      category: item.category,
    }))

    pushItems(results[2], (item: any) => ({
      id: item.id || `meijer-${Math.random()}`,
      title: item.name || item.title || "Unknown Item",
      brand: item.brand || "",
      price: Number(item.price) || 0,
      pricePerUnit: item.pricePerUnit,
      unit: item.unit,
      image_url: item.image_url || "/placeholder.svg",
      provider: "Meijer",
      location: item.location || getStoreLocationLabel("Meijer", zipCode),
      category: item.category,
    }))

    pushItems(results[3], (item: any) => ({
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

    pushItems(results[4], (item: any) => ({
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

    pushItems(results[5], (item: any) => ({
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

    pushItems(results[6], (item: any) => ({
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

    return items
  } catch (error) {
    console.error("Error running local scrapers:", error)
    return []
  }
}

function generateMockResults(zipCode?: string) {
  const stores = [
    { name: "Target", location: getStoreLocationLabel("Target", zipCode) },
    { name: "Kroger", location: getStoreLocationLabel("Kroger", zipCode) },
    { name: "Meijer", location: getStoreLocationLabel("Meijer", zipCode) },
    { name: "99 Ranch", location: "99 Ranch Market" },
    { name: "Trader Joe's", location: "Trader Joe's Store" },
    { name: "Aldi", location: "Aldi Store" },
  ]

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
        location: item.location || getStoreLocationLabel("Target", zipCode),
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
        location: item.location || getStoreLocationLabel("Kroger", zipCode),
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
        location: item.location || getStoreLocationLabel("Meijer", zipCode),
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
    aldi: async () => {
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

function mapStoreKeyToName(storeKey: string): string {
  const storeMap: Record<string, string> = {
    target: "Target",
    kroger: "Kroger",
    meijer: "Meijer",
    "99 ranch": "99 Ranch",
    walmart: "Walmart",
    "trader joes": "Trader Joe's",
    aldi: "Aldi",
  }
  return storeMap[storeKey] || storeKey
}

function getStoreLocationLabel(storeName: string, zipCode?: string) {
  if (zipCode) {
    return `${storeName} (${zipCode})`
  }
  return `${storeName} Store`
}

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
  }>,
  fallbackName?: string,
): any[] {
  return cachedItems.map((item) => {
    const quantityDisplay = `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
    const fallbackBase =
      fallbackName || item.product_name || item.standardized_ingredient_id || "Ingredient"
    const fallbackTitle = `${fallbackBase} (${quantityDisplay})`

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
