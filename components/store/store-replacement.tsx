"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { searchGroceryStores } from "@/lib/grocery-scrapers"
import { ingredientsHistoryDB, ingredientsRecentDB, normalizeStoreName } from "@/lib/database/ingredients-db"
import { productMappingsDB } from "@/lib/database/product-mappings-db"
import type { GroceryItem } from "@/lib/types/store"

interface ItemReplacementModalProps {
  isOpen: boolean
  onClose: () => void
  target: {
    term: string
    store: string
    shoppingListId?: string
    shoppingListIds?: string[]
    standardizedIngredientId?: string | null
    groceryStoreId?: string | null
  } | null
  zipCode: string
  onSelect: (item: GroceryItem) => void
  styles: any
  userId?: string
}

export function ItemReplacementModal({ isOpen, onClose, target, zipCode, onSelect, styles, userId }: ItemReplacementModalProps) {
  const [term, setTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<GroceryItem[]>([])
  const prevOpenRef = useRef(false)

  useEffect(() => {
    prevOpenRef.current = isOpen
  }, [isOpen])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && target) {
      setTerm(target.term)
      setResults([])
      performSearch(target.term)
    }
  }, [isOpen, target])

  const persistManualSelection = async (item: GroceryItem) => {
    if (!target?.store) return
    try {
      const response = await fetch("/api/grocery-search/cache-selection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          searchTerm: target.term || term || item.title,
          standardizedIngredientId: target.standardizedIngredientId || null,
          store: target.store,
          zipCode: zipCode || null,
          groceryStoreId: target.groceryStoreId ?? null,
          product: {
            id: item.id,
            title: item.title,
            price: item.price,
            unit: item.unit,
            pricePerUnit: item.pricePerUnit,
            image_url: item.image_url,
            location: item.provider || null,
          },
        }),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        console.warn("[ItemReplacementModal] Failed to cache manual selection", {
          status: response.status,
          error: errorBody,
        })
      }
    } catch (error) {
      console.warn("[ItemReplacementModal] Failed to call cache-selection endpoint", error)
    }
  }

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm) return
    setLoading(true)
    try {
      const normalizedTargetStore = normalizeStoreName(target?.store || "")

      // 1. Preferred source: RPC replacement options for this user/store.
      const replacementOptions =
        userId && target?.store
          ? await ingredientsRecentDB.getReplacement(userId, target.store, searchTerm)
          : []

      const rpcIngredientByItemId = new Map<string, string>()
      const rpcResults: GroceryItem[] = replacementOptions.flatMap((option, optionIdx) => {
        const offers = Array.isArray(option.offers) ? option.offers : []
        return offers.map((offer, offerIdx) => {
          const stableKey = `${target?.store || ""}-${option.ingredient_id}-${offer.product_name || option.canonical_name}-${offer.unit || ""}-${offer.price ?? ""}`
          const stableId = `replacement-${stableKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `${optionIdx}-${offerIdx}`}`
          rpcIngredientByItemId.set(stableId, option.ingredient_id)
          return {
            id: stableId,
            title: offer.product_name || option.canonical_name || searchTerm,
            brand: "",
            price: Number(offer.price) || 0,
            pricePerUnit:
              offer.unit_price != null
                ? `$${Number(offer.unit_price).toFixed(2)}${offer.unit ? `/${offer.unit}` : ""}`
                : undefined,
            unit: offer.unit || undefined,
            image_url: offer.image_url || "",
            provider: target?.store || "",
            category: option.category || undefined,
          } satisfies GroceryItem
        })
      })

      // 2. Fallback source: live scrape if RPC has no candidates.
      const fallbackResults = rpcResults.length > 0
        ? rpcResults
        : (await searchGroceryStores(
          searchTerm,
          zipCode,
          target?.store,
          true,
          target?.standardizedIngredientId || null
        ))
          .filter((storeResult) => normalizeStoreName(storeResult.store) === normalizedTargetStore)
          .flatMap((storeResult) =>
            (storeResult.items || []).map((item) => ({
              ...item,
              provider: target?.store || item.provider || "",
            }))
          )

      const flatResults = fallbackResults.filter((item) => {
        const itemProvider = normalizeStoreName(item.provider || target?.store || "")
        return itemProvider === normalizedTargetStore
      })

      setResults(flatResults)

      const validResults = flatResults.filter(item => typeof item.price === "number" && item.price > 0)
      if (validResults.length === 0) return

      // 3. Resolve ingredient IDs via preview (manual if available, else fuzzy)
      const ingredientMap = await ingredientsHistoryDB.previewStandardization(
        validResults.map(item => ({
          productName: item.title,
          standardizedIngredientId: target?.standardizedIngredientId || null,
        }))
      )
      const resolvedIngredientId =
        target?.standardizedIngredientId ||
        replacementOptions[0]?.ingredient_id ||
        ingredientMap.values().next().value

      // 4. Persist + create product_mappings via fn_bulk_insert_ingredient_history
      const payload = validResults.map(item => ({
        standardizedIngredientId:
          target?.standardizedIngredientId ||
          rpcIngredientByItemId.get(item.id) ||
          ingredientMap.get(item.title) ||
          resolvedIngredientId ||
          null,
        store: item.provider?.toLowerCase?.() || target?.store || "unknown",
        price: item.price,
        productName: item.title,
        productId: item.id,
        zipCode: zipCode || null,
        groceryStoreId: target?.groceryStoreId ?? null,
      }))
      await ingredientsHistoryDB.batchStandardizeAndMatch(payload)

      // 5. Query back via get_ingredient_price_details — results include product_mapping_id
      if (userId && resolvedIngredientId) {
        const dbOffers = await ingredientsRecentDB.getIngredientPriceDetails(
          userId,
          resolvedIngredientId
        )
        const targetStore = normalizeStoreName(target?.store || "")
        const dbItems: GroceryItem[] = dbOffers
          .filter(offer => normalizeStoreName(offer.store) === targetStore && offer.productMappingId)
          .map(offer => ({
            id: offer.productMappingId!,
            title: offer.productName || "Unknown",
            brand: "",
            price: offer.totalPrice || 0,
            pricePerUnit: offer.unitPrice != null ? String(offer.unitPrice) : undefined,
            image_url: offer.imageUrl || "",
            provider: target?.store || offer.store,
            productMappingId: offer.productMappingId || undefined,
          }))

        if (dbItems.length > 0) {
          setResults(dbItems)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      // If closing, log modal impressions — only for scraper-sourced items (no productMappingId)
      if (prevOpenRef.current && !open && results.length > 0) {
        const tasks = results
          .filter(item => !item.productMappingId)
          .map(item =>
            productMappingsDB.incrementCounts({
              external_product_id: item.id,
              zip_code: zipCode || null,
              raw_product_name: target?.term || item.title,
              standardized_ingredient_id: target?.standardizedIngredientId || null,
              store_id: target?.groceryStoreId ?? null,
              modal_delta: 1,
            })
          )
        void Promise.all(tasks)
      }
      prevOpenRef.current = open
      if (!open) onClose()
    }}>
      <DialogContent className={`${styles.cardBgClass} max-w-3xl`}>
        <DialogHeader>
          <DialogTitle className={styles.textClass}>
            Replace: {target?.term}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
                value={term}
                onChange={e => setTerm(e.target.value)}
                className={styles.theme === "dark" ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
                onKeyDown={(e) => e.key === 'Enter' && performSearch(term)}
            />
            <Button onClick={() => performSearch(term)}>Search</Button>
          </div>

      <div className="max-h-[300px] overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto"/>
          </div>
        ) : (
          <>
            {results.length === 0 && (
                <p className={`p-4 text-center ${styles.mutedTextClass}`}>No results found at {target?.store}</p>
            )}
            {results.map((item, i) => (
              <div key={i} className={`flex justify-between items-center p-2 border-b ${styles.theme === "dark" ? "border-[#e8dcc4]/10" : ""}`}>
                  <div className="flex items-center gap-3">
                    {item.image_url && <img src={item.image_url} className="w-8 h-8 object-contain" />}
                    <div>
                      <div className={`font-medium ${styles.textClass}`}>{item.title}</div>
                      <div className={`text-xs ${styles.mutedTextClass}`}>{item.provider} - ${item.price.toFixed(2)}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (item.productMappingId) {
                        // DB-sourced item — mapping ID already set
                        onSelect(item)
                      } else {
                        // Persist the user-selected scraper result as a cached candidate.
                        await persistManualSelection(item)

                        // Scraper-sourced fallback — look up/create mapping
                        productMappingsDB.incrementCounts({
                          external_product_id: item.id,
                          zip_code: zipCode || null,
                          raw_product_name: item.title,
                          standardized_ingredient_id: target?.standardizedIngredientId || null,
                          store_id: target?.groceryStoreId ?? null,
                          exchange_delta: 1,
                        }).then(mappingId => {
                          onSelect({ ...item, productMappingId: mappingId || undefined })
                        }).catch((error) => {
                          console.error("[ItemReplacementModal] Failed to increment mapping counts", error)
                          onSelect(item)
                        })
                      }
                    }}
                  >
                    Select
                  </Button>
              </div>
            ))}
          </>
        )}
      </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
