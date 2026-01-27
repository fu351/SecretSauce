"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { searchGroceryStores } from "@/lib/grocery-scrapers"
import { ingredientsHistoryDB } from "@/lib/database/ingredients-db"
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
  } | null
  zipCode: string
  onSelect: (item: GroceryItem) => void
  styles: any
}

export function ItemReplacementModal({ isOpen, onClose, target, zipCode, onSelect, styles }: ItemReplacementModalProps) {
  const [term, setTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<GroceryItem[]>([])

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
      // Pass the specific store to search only that provider
      const res = await searchGroceryStores(searchTerm, zipCode, target?.store, undefined, true)
      const flatResults = res.flatMap(r => r.items || [])
      setResults(flatResults)

      // Bulk upsert scraped options into ingredients_history so pricing pipeline can pick them up
      const standardizedId = target?.standardizedIngredientId
      if (standardizedId) {
        const payload = flatResults
          .filter(item => typeof item.price === "number" && item.price > 0)
          .map(item => {
            const unitPrice =
              item.pricePerUnit != null
                ? Number(String(item.pricePerUnit).replace(/[^0-9.]/g, "")) || null
                : null

            return {
              standardizedIngredientId: standardizedId,
              store: item.provider?.toLowerCase?.() || target?.store || "unknown",
              price: item.price,
              quantity: 1,
              unit: item.unit || "unit",
              unitPrice,
              imageUrl: item.image_url,
              productName: item.title,
              productId: item.id,
              location: item.location || null,
              zipCode: zipCode || null,
            }
          })

        if (payload.length > 0) {
          ingredientsHistoryDB.batchInsertPrices(payload).catch(err =>
            console.error("[ItemReplacementModal] Failed to cache scraped results", err)
          )
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
                      <Button size="sm" onClick={() => onSelect(item)}>Select</Button>
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
