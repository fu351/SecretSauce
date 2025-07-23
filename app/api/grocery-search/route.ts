import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const searchTerm = searchParams.get("searchTerm")
  const zipCode = searchParams.get("zipCode") || "47906"

  if (!searchTerm) {
    return NextResponse.json({ error: "Search term is required" }, { status: 400 })
  }

  try {
    // Try to call the Python grocery search service
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000"

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(
      `${pythonServiceUrl}/grocery-search?searchTerm=${encodeURIComponent(searchTerm)}&zipCode=${zipCode}`,
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
    console.warn("Python service not available, using mock data:", error)
  }

  // Return mock data when Python service is not available
  const mockResults = generateMockResults(searchTerm, zipCode)
  return NextResponse.json({ results: mockResults })
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
