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
    // Use the local API route which can access the scrapers
    const response = await fetch(
      `/api/grocery-search?searchTerm=${encodeURIComponent(searchTerm)}&zipCode=${zipCode}`,
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

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
    return getMockGroceryData(searchTerm)
  }
}

function getMockGroceryData(searchTerm: string): StoreResults[] {
  const mockItems = [
    {
      id: "1",
      title: `Organic ${searchTerm}`,
      brand: "Store Brand",
      price: 3.99,
      pricePerUnit: "$3.99/lb",
      unit: "lb",
      image_url: "/placeholder.svg",
      provider: "Target",
      category: "Produce",
    },
    {
      id: "2",
      title: `Fresh ${searchTerm}`,
      brand: "Premium",
      price: 4.49,
      pricePerUnit: "$4.49/lb",
      unit: "lb",
      image_url: "/placeholder.svg",
      provider: "Target",
      category: "Produce",
    },
  ]

  const stores = ["Target", "Kroger", "Meijer", "99 Ranch"]

  return stores
    .map((store) => ({
      store,
      items: mockItems.map((item) => ({
        ...item,
        id: `${store}-${item.id}`,
        provider: store,
        price: item.price + (Math.random() - 0.5) * 2, // Add some price variation
      })),
      total: mockItems.reduce((sum, item) => sum + item.price, 0),
    }))
    .sort((a, b) => a.total - b.total)
}
