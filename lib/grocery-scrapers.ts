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

export async function searchGroceryStores(searchTerm: string, zipCode = "47906"): Promise<StoreResults[]> {
  try {
    // Call the grocery search API
    const response = await fetch(`/api/grocery-search?searchTerm=${encodeURIComponent(searchTerm)}&zipCode=${zipCode}`)

    if (!response.ok) {
      throw new Error("Failed to fetch grocery data")
    }

    const data = await response.json()

    // Group results by store
    const storeMap = new Map<string, GroceryItem[]>()

    data.results?.forEach((item: GroceryItem) => {
      const storeName = item.provider || item.location || "Unknown Store"
      if (!storeMap.has(storeName)) {
        storeMap.set(storeName, [])
      }
      storeMap.get(storeName)!.push(item)
    })

    // Convert to StoreResults format
    const storeResults: StoreResults[] = Array.from(storeMap.entries()).map(([store, items]) => ({
      store,
      items: items.slice(0, 10), // Limit to 10 items per store
      total: items.reduce((sum, item) => sum + item.price, 0),
    }))

    return storeResults.sort((a, b) => a.total - b.total) // Sort by total price
  } catch (error) {
    console.error("Error searching grocery stores:", error)

    // Return mock data as fallback
    return generateMockStoreResults(searchTerm)
  }
}

function generateMockStoreResults(searchTerm: string): StoreResults[] {
  const stores = ["Target", "Kroger", "Meijer", "99 Ranch"]

  return stores.map((store) => {
    const items: GroceryItem[] = Array.from({ length: 5 }, (_, i) => {
      const basePrice = Math.random() * 8 + 2
      return {
        id: `${store}-${i}`,
        title: `${searchTerm} ${i + 1}`,
        brand: `${store} Brand`,
        price: Number(basePrice.toFixed(2)),
        pricePerUnit: `$${basePrice.toFixed(2)}/lb`,
        unit: "lb",
        image_url: "/placeholder.svg?height=100&width=100",
        provider: store,
        category: "Grocery",
      }
    })

    return {
      store,
      items,
      total: Number(items.reduce((sum, item) => sum + item.price, 0).toFixed(2)),
    }
  })
}
