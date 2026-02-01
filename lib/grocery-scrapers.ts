import { normalizeZipCode } from "@/lib/utils/zip"

interface GroceryItem {
  id: string
  title: string
  brand: string
  price: number
  pricePerUnit?: string
  unit?: string
  image_url: string
  provider: string
  location?: string
  category?: string
}

interface StoreResults {
  store: string
  items: GroceryItem[]
  total: number
}

export async function searchGroceryStores(
  searchTerm: string,
  zipCode?: string,
  store?: string,
  recipeId?: string,
  forceRefresh?: boolean
): Promise<StoreResults[]> {
  try {
    // Use the local API route which can access the scrapers
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000) // Increased to 60 seconds for slower scrapers
    const storeQuery = store ? `&store=${encodeURIComponent(store)}` : ""
    const recipeQuery = recipeId ? `&recipeId=${encodeURIComponent(recipeId)}` : ""
    const forceRefreshQuery = forceRefresh ? "&forceRefresh=true" : ""
    const normalizedZip = normalizeZipCode(zipCode)
    const zipQuery = normalizedZip ? `&zipCode=${normalizedZip}` : ""

    const response = await fetch(
      `/api/grocery-search?searchTerm=${encodeURIComponent(searchTerm)}${zipQuery}${storeQuery}${recipeQuery}${forceRefreshQuery}`,
      { signal: controller.signal }
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    if (data.message) {
      console.warn("[GrocerySearch] API message:", data.message)
    }
    clearTimeout(timeout)

    // Group results by store
    const storeMap = new Map<string, GroceryItem[]>()

    data.results?.forEach((item: any) => {
      const storeName = item.provider || item.location || "Unknown Store"
      if (!storeMap.has(storeName)) {
        storeMap.set(storeName, [])
      }

      storeMap.get(storeName)!.push({
        id: item.id || `${storeName}-${Math.random()}`,
        title: item.title || item.name || "Unknown Item",
        brand: item.brand || "",
        price: Number(item.price) || 0,
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        image_url: item.image_url || "/placeholder.svg",
        provider: storeName,
        location: item.location,
        category: item.category,
      })
    })

    // Convert to StoreResults format
    const results: StoreResults[] = Array.from(storeMap.entries()).map(([store, items]) => ({
      store,
      items: items.slice(0, 10), // Limit to 10 items per store
      total: items.reduce((sum, item) => sum + item.price, 0),
    }))

    // Sort by total price (cheapest first)
    return results.sort((a, b) => a.total - b.total)
  } catch (error) {
    console.error("Error fetching from grocery API:", error)
    return []
  }
}
