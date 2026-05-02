"use client"

import React, { useMemo, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, AlertCircle, RefreshCw, ShoppingBag, Map as MapIcon, List, PackageCheck, Copy, Check } from "lucide-react"
import { StoreSelector } from "./store-selector"
import { ReceiptItem } from "./receipt-item"
import type { ShoppingListIngredient as ShoppingListItem, StoreComparison } from "@/lib/types/store"
import { mergeShoppingListItems, type ShoppingListDisplayItem } from "@/lib/utils/shopping-list-grouping"
import { calcLineTotal } from "@/lib/utils/package-pricing"
import { copyTextToClipboard } from "@/lib/clipboard"
import { buildStoreComparisonExportPayload } from "@/lib/store/store-comparison-export"
import { buildQuantityMap, calculateStoreComparisonTotals } from "@/lib/store/store-comparison-totals"

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
  onRemoveItem: (itemId: string, storeName?: string | null, itemIds?: string[]) => void
  onSwapItem?: (itemId: string, itemIds?: string[]) => void
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
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle")
  const quantityByItemId = useMemo(() => buildQuantityMap(shoppingList), [shoppingList])

  const displayShoppingList = useMemo(() => mergeShoppingListItems(shoppingList), [shoppingList])

  const itemGroupKeyBySourceItemId = useMemo(() => {
    const map = new Map<string, string>()
    displayShoppingList.forEach((item) => {
      item.sourceItemIds.forEach((sourceId) => {
        map.set(sourceId, item.id)
      })
    })
    return map
  }, [displayShoppingList])

  const getEffectiveQuantity = useCallback((pricedItem: StoreComparison["items"][number]): number => {
    const itemIds = pricedItem.shoppingItemIds?.filter(Boolean) || [pricedItem.shoppingItemId]
    let effectiveQty = 0

    itemIds.forEach((id) => {
      effectiveQty += quantityByItemId.get(id) ?? 0
    })

    if (effectiveQty <= 0) {
      effectiveQty = Math.max(1, Number(pricedItem.quantity) || 1)
    }

    return effectiveQty
  }, [quantityByItemId])

  const calculateSubtotal = useCallback((pricedItem: StoreComparison["items"][number]): number => {
    const effectiveQty = getEffectiveQuantity(pricedItem)
    const total = calcLineTotal({
      qty: effectiveQty,
      packagePrice: pricedItem.packagePrice,
      convertedQty: pricedItem.convertedQuantity,
      conversionError: pricedItem.conversionError ?? undefined,
    })
    return total ?? (Number(pricedItem.price) || 0) * effectiveQty
  }, [getEffectiveQuantity])

  const storeComparisonsWithLocalTotals = useMemo(() => {
    return calculateStoreComparisonTotals(storeComparisons, quantityByItemId)
  }, [storeComparisons, quantityByItemId])

  // Get the selected store's data
  const selectedStoreData = useMemo(() => {
    if (!selectedStore && storeComparisonsWithLocalTotals.length > 0) {
      return storeComparisonsWithLocalTotals[0] // Default to first (cheapest)
    }
    return storeComparisonsWithLocalTotals.find(s => s.store === selectedStore) || storeComparisonsWithLocalTotals[0]
  }, [storeComparisonsWithLocalTotals, selectedStore])

  const pricingMap = useMemo(() => {
    if (!selectedStoreData) return new Map<string, StoreComparison["items"][number]>()

    type AggregatedPricing = StoreComparison["items"][number] & {
      totalPrice: number
    }

    const groupedPricing = new Map<string, AggregatedPricing>()

    selectedStoreData.items.forEach((priceItem) => {
      const shoppingItemIds = (priceItem.shoppingItemIds || [priceItem.shoppingItemId])
        .map((id) => String(id || "").trim())
        .filter((id) => id.length > 0)

      const groupKey = shoppingItemIds
        .map((shoppingItemId) => itemGroupKeyBySourceItemId.get(shoppingItemId))
        .find((value): value is string => Boolean(value))
        || shoppingItemIds[0]
        || String(priceItem.id)

      const totalPrice = calculateSubtotal(priceItem)
      const quantity = getEffectiveQuantity(priceItem)
      const existing = groupedPricing.get(groupKey)

      if (!existing) {
        groupedPricing.set(groupKey, {
          ...priceItem,
          id: groupKey,
          shoppingItemId: shoppingItemIds[0] || priceItem.shoppingItemId,
          shoppingItemIds,
          quantity,
          price: quantity > 0 ? totalPrice / quantity : totalPrice,
          packagesToBuy: undefined,
          // keep packagePrice and convertedQuantity from priceItem so receipt-item
          // can display correct package counts and compute totals
          totalPrice,
        })
        return
      }

      const nextTotal = existing.totalPrice + totalPrice
      const nextQuantity = (existing.quantity ?? 0) + quantity
      existing.totalPrice = nextTotal
      existing.quantity = nextQuantity
      existing.price = nextQuantity > 0 ? nextTotal / nextQuantity : nextTotal
      existing.shoppingItemIds = [...new Set([...(existing.shoppingItemIds || []), ...shoppingItemIds])]
      existing.shoppingItemId = existing.shoppingItemId || shoppingItemIds[0] || priceItem.shoppingItemId
    })

    const finalMap = new Map<string, StoreComparison["items"][number]>()
    groupedPricing.forEach((value, key) => {
      finalMap.set(key, {
        ...value,
        price: (value.quantity ?? 0) > 0 ? value.totalPrice / (value.quantity ?? 1) : value.totalPrice,
      })
    })

    return finalMap
  }, [calculateSubtotal, getEffectiveQuantity, itemGroupKeyBySourceItemId, selectedStoreData])

  const orderedShoppingList = useMemo(() => {
    if (displayShoppingList.length <= 1) return displayShoppingList

    const availableItems: ShoppingListDisplayItem[] = []
    const missingItems: ShoppingListDisplayItem[] = []

    displayShoppingList.forEach((item) => {
      if (pricingMap.has(item.id)) {
        availableItems.push(item)
      } else {
        missingItems.push(item)
      }
    })

    return [...availableItems, ...missingItems]
  }, [displayShoppingList, pricingMap])

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

  const isDevMode = process.env.NODE_ENV !== "production"

  const handleCopyStoreComparisonExport = useCallback(async () => {
    try {
      const payload = buildStoreComparisonExportPayload(storeComparisonsWithLocalTotals, selectedStoreIndex)
      await copyTextToClipboard(JSON.stringify(payload, null, 2))
      setCopyState("copied")
      window.setTimeout(() => setCopyState("idle"), 2000)
    } catch (error) {
      console.error("[ShoppingReceiptView] Failed to copy store comparison export", error)
      setCopyState("error")
      window.setTimeout(() => setCopyState("idle"), 2000)
    }
  }, [selectedStoreIndex, storeComparisonsWithLocalTotals])

  // Calculate totals
  const subtotal = selectedStoreData?.total || 0
  const foundCount = pricingMap.size
  const totalItems = displayShoppingList.length
  const missingCount = Math.max(0, totalItems - foundCount)

  const handleQuantityChange = useCallback((item: ShoppingListDisplayItem, quantity: number) => {
    if (item.sourceItemIds.length <= 1) {
      onQuantityChange(item.sourceItemIds[0] || item.id, quantity)
      return
    }

    // Distribute proportionally across source items based on their original ratios.
    // We use proportional distribution (not per-source floor-at-1) so that
    // package-based decrements to sub-integer quantities work correctly.
    const sourceQuantities = item.sourceItems.map((sourceItem) => Math.max(0, Number(sourceItem.quantity) || 0))
    const totalSourceQuantity = sourceQuantities.reduce((sum, q) => sum + q, 0)

    if (totalSourceQuantity > 0) {
      item.sourceItemIds.forEach((sourceId, index) => {
        const ratio = sourceQuantities[index] / totalSourceQuantity
        onQuantityChange(sourceId, Math.max(0.0001, Number((quantity * ratio).toFixed(4))))
      })
      return
    }

    // Equal split fallback when all source quantities are 0
    const perSource = quantity / item.sourceItemIds.length
    item.sourceItemIds.forEach((sourceId) => {
      onQuantityChange(sourceId, Math.max(0.0001, Number(perSource.toFixed(4))))
    })
  }, [onQuantityChange])

  const handleRemoveItem = useCallback((item: ShoppingListDisplayItem) => {
    onRemoveItem(
      item.sourceItemIds[0] || item.id,
      selectedStoreData?.store ?? selectedStore,
      item.sourceItemIds
    )
  }, [onRemoveItem, selectedStore, selectedStoreData])

  const handleSwapItem = useCallback((item: ShoppingListDisplayItem) => {
    if (!onSwapItem) return
    onSwapItem(item.sourceItemIds[0] || item.id, item.sourceItemIds)
  }, [onSwapItem])

  // Empty state
  if (shoppingList.length === 0 && !loading) {
    return (
      <Card className={`${theme === "dark" ? "bg-[#1f1e1a]" : "bg-white"} w-full max-w-full overflow-hidden ${className}`}>
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
    <div className={`flex min-w-0 max-w-full flex-col overflow-hidden rounded-xl border ${
      theme === "dark" ? "border-white/10 bg-[#1f1e1a]" : "border-gray-200 bg-white"
    } ${className}`} data-tutorial="store-overview">
      {/* Store Selector - Sticky Header */}
      <div className={`sticky top-0 z-10 ${
        theme === "dark" ? "bg-[#1f1e1a]" : "bg-white"
      } border-b ${
        theme === "dark" ? "border-white/5" : "border-gray-200"
      } px-3 py-3 sm:px-4 lg:px-5 lg:py-4`}>
        <div className="mb-3 flex min-w-0 flex-col gap-3 lg:mb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Shopping
            </p>
            <h1 className={`truncate text-xl font-semibold tracking-tight lg:text-2xl ${
              theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
            }`}>
              Price comparison
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:min-w-[300px]">
            <div className={`rounded-lg border px-3 py-2 ${
              theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-gray-50"
            }`}>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Priced</p>
              <p className={`mt-0.5 text-sm font-semibold ${theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                {foundCount}/{totalItems}
              </p>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${
              theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-gray-50"
            }`}>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Missing</p>
              <p className={`mt-0.5 text-sm font-semibold ${missingCount > 0 ? "text-amber-600 dark:text-amber-400" : theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                {missingCount}
              </p>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${
              theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-gray-50"
            }`}>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total</p>
              <p className={`mt-0.5 truncate font-mono text-sm font-semibold ${theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"}`}>
                ${subtotal.toFixed(2)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDevMode && storeComparisonsWithLocalTotals.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleCopyStoreComparisonExport()}
                className="text-xs"
                data-tutorial="store-export-mapping"
              >
                {copyState === "copied" ? (
                  <Check className="h-3 w-3 mr-1" />
                ) : (
                  <Copy className="h-3 w-3 mr-1" />
                )}
                {copyState === "copied" ? "Copied" : "Copy JSONB"}
              </Button>
            )}
            {(loading || isStale) && onRefresh && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onRefresh}
                disabled={loading}
                className="text-xs"
                data-tutorial="store-refresh"
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
        </div>

        {storeComparisonsWithLocalTotals.length > 0 ? (
          <>
            <div className="flex min-w-0 items-start gap-2 md:items-stretch">
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
                className="lg:hidden h-14 w-14 md:h-auto md:self-stretch md:min-h-14 flex-shrink-0"
                data-tutorial="store-map-toggle"
              >
                {showMap ? <List className="h-5 w-5" /> : <MapIcon className="h-5 w-5" />}
              </Button>
            </div>

            {showMap && (
              <div className={`lg:hidden mt-3 rounded-lg overflow-hidden border ${
                theme === "dark" ? "border-white/10 bg-[#1f1e1a]" : "border-gray-200 bg-white"
              }`} data-tutorial="store-map">
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
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Card className={`${
          theme === "dark" ? "bg-[#1f1e1a] shadow-none" : "bg-white shadow-sm"
        } border-0 rounded-none`}>
          <CardContent className="p-0">
            {/* Loading state for initial load */}
            {loading && shoppingList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
                <p className="text-sm text-muted-foreground">Loading your shopping list...</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-white/5" data-tutorial="store-items">
                <div className={`hidden grid-cols-[minmax(0,1fr)_7.5rem_6.5rem_7rem] gap-4 border-b px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:grid ${
                  theme === "dark" ? "border-white/5 bg-white/[0.02]" : "border-gray-100 bg-gray-50/70"
                }`}>
                  <span>Item</span>
                  <span>Packages</span>
                  <span>Status</span>
                  <span className="text-right">Line total</span>
                </div>
                {orderedShoppingList.map((item) => (
                  <ReceiptItem
                    key={item.id}
                    item={item}
                    pricing={pricingMap.get(item.id) || null}
                    onQuantityChange={(_, nextQuantity) => handleQuantityChange(item, nextQuantity)}
                    onRemove={() => handleRemoveItem(item)}
                    onSwap={onSwapItem ? () => handleSwapItem(item) : undefined}
                    theme={theme}
                  />
                ))}
              </div>
            )}

            {/* Missing Items Notice */}
            {missingCount > 0 && !loading && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-800/30" data-tutorial="store-missing">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-500">
                      {missingCount} {missingCount === 1 ? "item" : "items"} not available
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-600">
                      at {selectedStoreData?.store || "this store"}. Try a different store or find alternatives.
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
        theme === "dark" ? "bg-[#1f1e1a]" : "bg-white"
      } border-t ${
        theme === "dark" ? "border-white/5" : "border-gray-200"
      } px-3 py-3 shadow-lg sm:px-4 lg:px-5`}>
        {/* Stats */}
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <PackageCheck className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{foundCount} of {totalItems} items priced</span>
          </span>
          {lastFetchTime && (
            <span className="flex-shrink-0">Updated {new Date(lastFetchTime).toLocaleTimeString()}</span>
          )}
        </div>

        {/* Total */}
        <div className="mb-4 flex min-w-0 items-center justify-between gap-4" data-tutorial="store-total">
          <span className={`text-base font-bold ${
            theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
          }`}>
            Total
          </span>
          <span className={`text-2xl md:text-3xl font-mono font-black ${
            theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
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
            data-tutorial="store-checkout"
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
