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

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm) return
    setLoading(true)
    try {
      // 1. Scrape — show raw results immediately
      const res = await searchGroceryStores(searchTerm, zipCode, target?.store, undefined, true)
      const flatResults = res.flatMap(r => r.items || [])
      setResults(flatResults)

      const validResults = flatResults.filter(item => typeof item.price === "number" && item.price > 0)
      if (validResults.length === 0) return

      // 2. Resolve ingredient IDs via preview (manual if available, else fuzzy)
      const ingredientMap = await ingredientsHistoryDB.previewStandardization(
        validResults.map(item => ({
          productName: item.title,
          standardizedIngredientId: target?.standardizedIngredientId || null,
        }))
      )
      const resolvedIngredientId = ingredientMap.values().next().value || target?.standardizedIngredientId

      // 3. Persist + create product_mappings via fn_bulk_standardize_and_match
      const payload = validResults.map(item => ({
        standardizedIngredientId: ingredientMap.get(item.title) || resolvedIngredientId || null,
        store: item.provider?.toLowerCase?.() || target?.store || "unknown",
        price: item.price,
        productName: item.title,
        productId: item.id,
        zipCode: zipCode || null,
        groceryStoreId: target?.groceryStoreId ?? null,
      }))
      await ingredientsHistoryDB.batchStandardizeAndMatch(payload)

      // 4. Query back via get_ingredient_price_details — results include product_mapping_id
      if (userId && resolvedIngredientId) {
        const dbOffers = await ingredientsRecentDB.getIngredientPriceDetails(
          userId,
          resolvedIngredientId
        )
        const targetStore = normalizeStoreName(target?.store || "")
        const dbItems: GroceryItem[] = dbOffers
          .filter(offer => offer.store === targetStore && offer.productMappingId)
          .map(offer => ({
            id: offer.productMappingId!,
            title: offer.productName || "Unknown",
            brand: "",
            price: offer.totalPrice || 0,
            pricePerUnit: offer.unitPrice != null ? String(offer.unitPrice) : undefined,
            image_url: offer.imageUrl || "",
            provider: offer.store,
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
                    onClick={() => {
                      if (item.productMappingId) {
                        // DB-sourced item — mapping ID already set
                        onSelect(item)
                      } else {
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
