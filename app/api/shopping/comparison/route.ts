import { type NextRequest, NextResponse } from "next/server"
import { from } from "@/lib/database/base-db"
import type { Database } from "@/lib/database/supabase"
import type { GroceryItem, ShoppingListIngredient, StoreComparison } from "@/lib/types/store"

type PriceCacheRow = Database["public"]["Tables"]["shopping_item_price_cache"]["Row"]
type ComparisonItem = GroceryItem & {
  shoppingItemId: string
  originalName: string
  shoppingItemIds?: string[]
}

const STORE_DISPLAY_NAMES: Record<string, string> = {
  aldi: "Aldi",
  kroger: "Kroger",
  safeway: "Safeway",
  meijer: "Meijer",
  target: "Target",
  traderjoes: "Trader Joe's",
  "99ranch": "99 Ranch",
  walmart: "Walmart",
  andronicos: "Andronico's Community Markets",
  wholefoods: "Whole Foods",
}

function resolveStoreKey(row: PriceCacheRow): string | null {
  if (row.store) {
    return row.store.toLowerCase()
  }

  if (row.store_name) {
    const normalized = row.store_name.toLowerCase().replace(/[^a-z0-9]/g, "")
    const match = Object.keys(STORE_DISPLAY_NAMES).find((key) => {
      return normalized.includes(key) || key.includes(normalized)
    })
    return match || normalized
  }

  return null
}

function getStoreDisplayName(storeKey: string, fallback?: string) {
  return STORE_DISPLAY_NAMES[storeKey] || fallback || storeKey || "Store"
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      items?: ShoppingListIngredient[]
      zipCode?: string | null
    }

    const rawItems = payload?.items ?? []
    const zipCode =
      typeof payload?.zipCode === "string" && payload.zipCode.trim()
        ? payload.zipCode.trim()
        : undefined

    const normalizedItems = rawItems
      .map((item) => ({
        ...item,
        quantity: Number(item.quantity) || 1,
        unit: item.unit || "unit",
        category: item.category || "other",
      }))
      .filter((item) => item.id && item.name)

    if (normalizedItems.length === 0) {
      return NextResponse.json({ results: [] })
    }

    const itemIds = Array.from(new Set(normalizedItems.map((item) => item.id)))

    let query = from("shopping_item_price_cache")
      .select("*")
      .in("shopping_list_item_id", itemIds)
      .order("cached_at", { ascending: false })

    if (zipCode) {
      query = query.eq("zip_code", zipCode)
    }

    const { data, error } = await query

    if (error) {
      console.error("[price-comparison] Cache query failed", error)
      return NextResponse.json(
        { error: "Unable to load cached prices" },
        { status: 500 }
      )
    }

    const latestRows = new Map<string, { row: PriceCacheRow; storeKey: string }>()
    const storeKeySet = new Set<string>()
    ;(data || []).forEach((row) => {
      const storeKey = resolveStoreKey(row)
      if (!storeKey) return

      const key = `${row.shopping_list_item_id}-${storeKey}`
      if (!latestRows.has(key)) {
        latestRows.set(key, { row, storeKey })
        storeKeySet.add(storeKey)
      }
    })

    const stores: StoreComparison[] = []

    storeKeySet.forEach((storeKey) => {
      const displayName = getStoreDisplayName(storeKey)
      const storeItems: ComparisonItem[] = []
      let total = 0
      const missingIngredients: ShoppingListIngredient[] = []

      normalizedItems.forEach((item) => {
        const cacheKey = `${item.id}-${storeKey}`
        const cached = latestRows.get(cacheKey)
        if (cached && typeof cached.row.price === "number") {
          const price = Number(cached.row.price)
          const quantity = Number(item.quantity || 1)
          total += price * quantity

          storeItems.push({
            id: cached.row.product_name
              ? `${cached.row.product_name}-${storeKey}-${item.id}`
              : `${storeKey}-${item.id}`,
            title: cached.row.product_name || item.name,
            brand: item.category || "",
            price,
            pricePerUnit: cached.row.unit_price
              ? `$${Number(cached.row.unit_price).toFixed(2)}/${item.unit}`
              : undefined,
            unit: item.unit || undefined,
            image_url: cached.row.image_url || undefined,
            provider: displayName,
            location:
              cached.row.store_name ||
              `${displayName} Grocery`,
            category: item.category || "other",
            quantity,
            shoppingItemId: item.id,
            originalName: item.name,
            shoppingItemIds: [item.id],
          })
        } else {
          missingIngredients.push(item)
        }
      })

      if (!storeItems.length) {
        return
      }

      stores.push({
        store: displayName,
        items: storeItems,
        total: Number(total.toFixed(2)),
        savings: 0,
        missingItems: missingIngredients.length > 0,
        missingCount: missingIngredients.length,
        missingIngredients,
        providerAliases: [storeKey],
        canonicalKey: storeKey,
      })
    })

    if (stores.length > 0) {
      const maxTotal = Math.max(...stores.map((store) => store.total))
      stores.forEach((store) => {
        store.savings = Number((maxTotal - store.total).toFixed(2))
      })
    }

    return NextResponse.json({ results: stores })
  } catch (error) {
    console.error("[price-comparison] Unexpected error", error)
    return NextResponse.json(
      { error: "Could not compute store comparisons" },
      { status: 500 }
    )
  }
}
