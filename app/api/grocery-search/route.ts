import { type NextRequest, NextResponse } from "next/server"

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

  if (storeKey) {
    try {
      const results = await runStoreSpecificSearch(storeKey, sanitizedSearchTerm, zipCode)
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
    const timeoutId = setTimeout(() => controller.abort(), 5000) // Reduced to 5 seconds

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
      return NextResponse.json(data)
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
      scrapers.searchWalmartAPI(sanitizedSearchTerm, zipCode)
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

    // If we have results from any scraper, return them
    if (allItems.length > 0) {
      return NextResponse.json({ results: allItems })
    }

    // If no scrapers worked, return mock data
    console.warn("All scrapers failed, returning mock data")
    const mockResults = generateMockResults(sanitizedSearchTerm, zipCode)
    return NextResponse.json({ results: mockResults })

  } catch (error) {
    console.error("Error using local scrapers:", error)
    // Return mock data when scrapers fail
    const mockResults = generateMockResults(sanitizedSearchTerm, zipCode)
    return NextResponse.json({ results: mockResults })
  }
}

function generateMockResults(searchTerm: string, zipCode: string) {
  const stores = [
    { name: "Target", location: "West Lafayette Target" },
    { name: "Kroger", location: "West Lafayette Kroger" },
    { name: "Meijer", location: "West Lafayette Meijer" },
    { name: "99 Ranch", location: "99 Ranch Market" },
  ]

  const results: any[] = []

  stores.forEach((store, storeIndex) => {
    // Generate 3-5 items per store
    const itemCount = Math.floor(Math.random() * 3) + 3

    for (let i = 0; i < itemCount; i++) {
      const basePrice = Math.random() * 8 + 1
      const quantity = Math.random() * 2 + 0.5
      const totalPrice = basePrice * quantity

      results.push({
        id: `${store.name.toLowerCase()}-${searchTerm.toLowerCase()}-${i}`,
        title: `${searchTerm} ${i + 1}`,
        brand: i === 0 ? `${store.name} Brand` : `Brand ${String.fromCharCode(65 + i)}`,
        price: Number(totalPrice.toFixed(2)),
        pricePerUnit: `$${basePrice.toFixed(2)}/lb`,
        unit: "lb",
        image_url: `/placeholder.svg?height=100&width=100&text=${encodeURIComponent(searchTerm)}`,
        provider: store.name,
        location: store.location,
        category: "Grocery",
      })
    }
  })

  // Sort by price
  return results.sort((a, b) => a.price - b.price)
}

function resolveStoreKey(storeParam: string) {
  if (!storeParam) return null
  const value = storeParam.toLowerCase()
  if (value.includes("target")) return "target"
  if (value.includes("kroger")) return "kroger"
  if (value.includes("meijer")) return "meijer"
  if (value.includes("99") || value.includes("ranch")) return "99 ranch"
  if (value.includes("walmart")) return "walmart"
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
  }

  if (!handlers[storeKey]) {
    throw new Error(`Unsupported store: ${storeKey}`)
  }

  return handlers[storeKey]()
}
