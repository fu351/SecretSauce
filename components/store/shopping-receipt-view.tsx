"use client"

import React, { useMemo, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, AlertCircle, RefreshCw, ShoppingBag, Map as MapIcon, List } from "lucide-react"
import { StoreSelector } from "./store-selector"
import { ReceiptItem } from "./receipt-item"
import type { ShoppingListIngredient as ShoppingListItem, StoreComparison } from "@/lib/types/store"

const StoreMap = dynamic(() => import("./store-map").then((mod) => mod.StoreMap), {
  ssr: false,
  loading: () => (
    <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">
      Loading map...
    </div>
  ),
})

interface ShoppingReceiptViewProps {
  shoppingList: ShoppingListItem[]
  storeComparisons: StoreComparison[]
  selectedStore: string | null
  onStoreChange: (storeName: string | null) => void
  onQuantityChange: (itemId: string, quantity: number) => void
  onRemoveItem: (itemId: string) => void
  onSwapItem?: (itemId: string) => void
  onCheckout?: () => void
  onRefresh?: () => void
  loading?: boolean
  error?: string | null
  isStale?: boolean
  lastFetchTime?: number | null
  userPostalCode?: string
  theme?: "light" | "dark"
  className?: string
}

export function ShoppingReceiptView({
  shoppingList,
  storeComparisons,
  selectedStore,
  onStoreChange,
  onQuantityChange,
  onRemoveItem,
  onSwapItem,
  onCheckout,
  onRefresh,
  loading = false,
  error = null,
  isStale = false,
  lastFetchTime = null,
  userPostalCode,
  theme = "light",
  className = ""
}: ShoppingReceiptViewProps) {
  const [showMap, setShowMap] = useState(false)
  const quantityByItemId = useMemo(() => {
    const map = new Map<string, number>()
    shoppingList.forEach((item) => {
      map.set(item.id, Math.max(1, Number(item.quantity) || 1))
    })
    return map
  }, [shoppingList])

  const storeComparisonsWithLocalTotals = useMemo(() => {
    if (storeComparisons.length === 0) return storeComparisons

    const updatedComparisons = storeComparisons.map((store) => {
      const localTotal = store.items.reduce((sum, pricedItem) => {
        const itemIds = pricedItem.shoppingItemIds?.filter(Boolean) || [pricedItem.shoppingItemId]
        let effectiveQty = 0

        itemIds.forEach((id) => {
          effectiveQty += quantityByItemId.get(id) ?? 0
        })

        if (effectiveQty <= 0) {
          effectiveQty = Math.max(1, Number(pricedItem.quantity) || 1)
        }

        return sum + (Number(pricedItem.price) || 0) * effectiveQty
      }, 0)

      return {
        ...store,
        total: localTotal,
      }
    })

    const maxTotal = Math.max(...updatedComparisons.map((store) => store.total), 0)
    return updatedComparisons.map((store) => ({
      ...store,
      savings: maxTotal - store.total,
    }))
  }, [storeComparisons, quantityByItemId])

  // Get the selected store's data
  const selectedStoreData = useMemo(() => {
    if (!selectedStore && storeComparisonsWithLocalTotals.length > 0) {
      return storeComparisonsWithLocalTotals[0] // Default to first (cheapest)
    }
    return storeComparisonsWithLocalTotals.find(s => s.store === selectedStore) || storeComparisonsWithLocalTotals[0]
  }, [storeComparisonsWithLocalTotals, selectedStore])

  // Create a map of item ID to pricing data for easy lookup
  const pricingMap = useMemo(() => {
    if (!selectedStoreData) return new Map()

    const map = new Map<string, StoreComparison["items"][0]>()
    selectedStoreData.items.forEach(priceItem => {
      const shoppingItemIds = priceItem.shoppingItemIds || [priceItem.shoppingItemId]
      shoppingItemIds.forEach(id => {
        if (id) map.set(id, priceItem)
      })
    })
    return map
  }, [selectedStoreData])

  const orderedShoppingList = useMemo(() => {
    if (shoppingList.length <= 1) return shoppingList

    const availableItems: ShoppingListItem[] = []
    const missingItems: ShoppingListItem[] = []

    shoppingList.forEach((item) => {
      if (pricingMap.has(item.id)) {
        availableItems.push(item)
      } else {
        missingItems.push(item)
      }
    })

    return [...availableItems, ...missingItems]
  }, [shoppingList, pricingMap])

  const selectedStoreIndex = useMemo(() => {
    if (!selectedStore && storeComparisonsWithLocalTotals.length > 0) return 0
    const index = storeComparisonsWithLocalTotals.findIndex((store) => store.store === selectedStore)
    return index >= 0 ? index : 0
  }, [storeComparisonsWithLocalTotals, selectedStore])

  const handleMapStoreSelect = useCallback((storeIndex: number) => {
    const selectedFromMap = storeComparisonsWithLocalTotals[storeIndex]
    if (!selectedFromMap) return
    onStoreChange(selectedFromMap.store)
  }, [storeComparisonsWithLocalTotals, onStoreChange])

  // Calculate totals
  const subtotal = selectedStoreData?.total || 0
  const missingCount = selectedStoreData?.missingCount || 0
  const foundCount = selectedStoreData?.items.length || 0
  const totalItems = shoppingList.length

  // Empty state
  if (shoppingList.length === 0 && !loading) {
    return (
      <Card className={`${theme === 'dark' ? 'bg-[#1f1e1a]' : 'bg-white'} ${className}`}>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <ShoppingBag className="h-16 w-16 text-gray-300 mb-4" />
          <p className="text-lg font-semibold text-gray-900 dark:text-[#e8dcc4] mb-2">
            Your shopping list is empty
          </p>
          <p className="text-sm text-muted-foreground">
            Add items to get started with price comparisons
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Store Selector - Sticky Header */}
      <div className={`sticky top-0 z-10 ${
        theme === 'dark' ? 'bg-[#181813]' : 'bg-gray-50'
      } border-b ${
        theme === 'dark' ? 'border-white/5' : 'border-gray-200'
      } p-4`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-lg font-bold ${
            theme === 'dark' ? 'text-[#e8dcc4]' : 'text-gray-900'
          }`}>
            Shopping Receipt
          </h2>
          {(loading || isStale) && onRefresh && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRefresh}
              disabled={loading}
              className="text-xs"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              {loading ? "Updating..." : "Refresh"}
            </Button>
          )}
        </div>

        {storeComparisonsWithLocalTotals.length > 0 ? (
          <>
            <div className="flex items-start md:items-stretch gap-2">
              <StoreSelector
                stores={storeComparisonsWithLocalTotals}
                selectedStore={selectedStore}
                onStoreChange={onStoreChange}
                theme={theme}
                className="flex-1 min-w-0"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setShowMap((prev) => !prev)}
                aria-label={showMap ? "Hide store map" : "Show store map"}
                title={showMap ? "Hide map" : "Show map"}
                className="h-14 w-14 md:h-auto md:self-stretch md:min-h-14 flex-shrink-0"
              >
                {showMap ? <List className="h-5 w-5" /> : <MapIcon className="h-5 w-5" />}
              </Button>
            </div>

            {showMap && (
              <div className={`mt-3 rounded-lg overflow-hidden border ${
                theme === "dark" ? "border-white/10 bg-[#1f1e1a]" : "border-gray-200 bg-white"
              }`}>
                <StoreMap
                  comparisons={storeComparisonsWithLocalTotals}
                  onStoreSelected={handleMapStoreSelect}
                  userPostalCode={userPostalCode}
                  selectedStoreIndex={selectedStoreIndex}
                />
              </div>
            )}
          </>
        ) : (
          loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading store prices...</span>
            </div>
          )
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error loading prices</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Receipt Items */}
      <div className="flex-1 overflow-y-auto">
        <Card className={`${
          theme === 'dark' ? 'bg-[#1f1e1a] shadow-none' : 'bg-white shadow-sm'
        } border-0 rounded-none`}>
          <CardContent className="p-0">
            {/* Loading state for initial load */}
            {loading && shoppingList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
                <p className="text-sm text-muted-foreground">Loading your shopping list...</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-white/5">
                {orderedShoppingList.map((item) => (
                  <ReceiptItem
                    key={item.id}
                    item={item}
                    pricing={pricingMap.get(item.id) || null}
                    onQuantityChange={onQuantityChange}
                    onRemove={onRemoveItem}
                    onSwap={onSwapItem}
                    theme={theme}
                  />
                ))}
              </div>
            )}

            {/* Missing Items Notice */}
            {missingCount > 0 && !loading && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-800/30">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-500">
                      {missingCount} {missingCount === 1 ? 'item' : 'items'} not available
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-600">
                      at {selectedStoreData?.store || 'this store'}. Try a different store or find alternatives.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer - Sticky Bottom with Total */}
      <div className={`sticky bottom-0 ${
        theme === 'dark' ? 'bg-[#1f1e1a]' : 'bg-white'
      } border-t ${
        theme === 'dark' ? 'border-white/5' : 'border-gray-200'
      } p-4 shadow-lg`}>
        {/* Stats */}
        <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
          <span>{foundCount} of {totalItems} items priced</span>
          {lastFetchTime && (
            <span>Updated {new Date(lastFetchTime).toLocaleTimeString()}</span>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between mb-4">
          <span className={`text-base font-bold ${
            theme === 'dark' ? 'text-[#e8dcc4]' : 'text-gray-900'
          }`}>
            Total
          </span>
          <span className={`text-2xl md:text-3xl font-mono font-black ${
            theme === 'dark' ? 'text-[#e8dcc4]' : 'text-gray-900'
          }`}>
            ${subtotal.toFixed(2)}
          </span>
        </div>

        {/* Checkout Button */}
        {onCheckout && (
          <Button
            onClick={onCheckout}
            disabled={shoppingList.length === 0 || loading}
            className="w-full h-12 text-base font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <ShoppingBag className="h-4 w-4 mr-2" />
                Proceed to Checkout
              </>
            )}
          </Button>
        )}

      </div>
    </div>
  )
}
