"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useToast } from "@/hooks"
import { useShoppingList } from "@/hooks/shopping/use-shopping-list"
import { useStoreComparison } from "@/hooks/shopping/use-store-comparison"
import { updateLocation, getUserLocation, reverseGeocodeToPostalCode } from "@/lib/location-client"
import dynamic from "next/dynamic"
import { ShoppingReceiptView } from "@/components/store/shopping-receipt-view"
import { ItemReplacementModal } from "@/components/store/store-replacement"
import { MobileQuickAddPanel } from "@/components/store/mobile-quick-add-panel"
import { standardizedIngredientsDB } from "@/lib/database/standardized-ingredients-db"
import type { GroceryItem, StoreComparison } from "@/lib/types/store"
import { calcLineTotal } from "@/lib/utils/package-pricing"

const StoreMap = dynamic(
  () => import("@/components/store/store-map").then((mod) => mod.StoreMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
        Loading map...
      </div>
    ),
  }
)

function buildListIdentitySignature(items: Array<{
  id: string
  name?: string
  unit?: string | null
  ingredient_id?: string | null
  standardizedIngredientId?: string | null
  source_type?: string
  recipe_id?: string | null
}>): string {
  return items
    .map((item) => [
      item.id,
      item.name || "",
      item.unit || "",
      item.ingredient_id || item.standardizedIngredientId || "",
      item.source_type || "",
      item.recipe_id || "",
    ].join("|"))
    .sort()
    .join("||")
}

function buildListQuantitySignature(items: Array<{ id: string; quantity?: number | null }>): string {
  return items
    .map((item) => `${item.id}:${Math.max(1, Number(item.quantity) || 1)}`)
    .sort()
    .join("|")
}

function buildQuantityMap(items: Array<{ id: string; quantity?: number | null }>): Map<string, number> {
  return new Map(
    items.map((item) => [
      item.id,
      Math.max(1, Number(item.quantity) || 1),
    ])
  )
}

function getEffectiveStoreItemQuantity(
  item: StoreComparison["items"][number],
  quantityByItemId: Map<string, number>
): number {
  const itemIds = item.shoppingItemIds?.filter(Boolean) || [item.shoppingItemId]
  let effectiveQty = 0

  itemIds.forEach((id) => {
    effectiveQty += quantityByItemId.get(id) ?? 0
  })

  if (effectiveQty <= 0) {
    effectiveQty = Math.max(1, Number(item.quantity) || 1)
  }

  return effectiveQty
}

function getStoreItemLineTotal(
  item: StoreComparison["items"][number],
  quantityByItemId: Map<string, number>
): number {
  const effectiveQty = getEffectiveStoreItemQuantity(item, quantityByItemId)
  const lineTotal = calcLineTotal({
    qty: effectiveQty,
    packagePrice: item.packagePrice,
    convertedQty: item.convertedQuantity,
    conversionError: item.conversionError ?? undefined,
  })

  return lineTotal ?? (Number(item.price) || 0) * effectiveQty
}

function filterStoreComparisonsByHiddenItems(
  storeComparisons: StoreComparison[],
  hiddenStoreItemIds: Record<string, string[]>,
  quantityByItemId: Map<string, number>
): StoreComparison[] {
  if (storeComparisons.length === 0) return storeComparisons

  const filteredComparisons = storeComparisons.map((store) => {
    const hiddenIds = new Set(hiddenStoreItemIds[store.store] ?? [])
    if (hiddenIds.size === 0) return store

    const items = store.items.filter((item) => {
      const itemIds = item.shoppingItemIds?.filter(Boolean) || [item.shoppingItemId]
      return !itemIds.some((id) => hiddenIds.has(id))
    })

    const missingIngredients = store.missingIngredients?.filter((item) => !hiddenIds.has(item.id)) ?? []
    const total = items.reduce((sum, item) => sum + getStoreItemLineTotal(item, quantityByItemId), 0)

    return {
      ...store,
      items,
      total,
      missingIngredients,
      missingCount: missingIngredients.length,
      missingItems: missingIngredients.length > 0,
    }
  })

  const maxTotal = Math.max(...filteredComparisons.map((store) => store.total), 0)
  return filteredComparisons.map((store) => ({
    ...store,
    savings: maxTotal - store.total,
  }))
}

export default function ShoppingReceiptPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { theme } = useTheme()
  const { toast } = useToast()
  const [mounted, setMounted] = useState(false)
  const [zipCode, setZipCode] = useState("")
  const [zipReady, setZipReady] = useState(false)
  const [reloadModalOpen, setReloadModalOpen] = useState(false)
  const [reloadTarget, setReloadTarget] = useState<{
    term: string
    store: string
    shoppingListId?: string
    shoppingListIds?: string[]
    standardizedIngredientId?: string | null
    groceryStoreId?: string | null
  } | null>(null)
  const [hiddenStoreItemIds, setHiddenStoreItemIds] = useState<Record<string, string[]>>({})
  const previousListSignaturesRef = useRef<{
    identity: string
    quantity: string
    zipCode: string
  } | null>(null)
  const refreshInProgressRef = useRef(false)

  // Shopping list management
  const {
    items: shoppingList,
    loading: listLoading,
    addItem,
    addRecipeToCart,
    removeItem,
    updateQuantity,
    saveChanges
  } = useShoppingList()

  // Store comparison (same pipeline as shopping page compare button)
  const {
    activeStoreIndex: carouselIndex,
    results: storeComparisons,
    loading: comparisonLoading,
    hasFetched: comparisonFetched,
    performMassSearch,
    scrollToStore,
    replaceItemForStore
  } = useStoreComparison(shoppingList, zipCode, null)
  const listIdentitySignature = useMemo(() => buildListIdentitySignature(shoppingList), [shoppingList])
  const listQuantitySignature = useMemo(() => buildListQuantitySignature(shoppingList), [shoppingList])
  const quantityByItemId = useMemo(() => buildQuantityMap(shoppingList), [shoppingList])
  const visibleStoreComparisons = useMemo(
    () => filterStoreComparisonsByHiddenItems(storeComparisons, hiddenStoreItemIds, quantityByItemId),
    [storeComparisons, hiddenStoreItemIds, quantityByItemId]
  )
  const normalizedZipCode = zipCode.trim()

  // Hydration handling
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load user zip code
  useEffect(() => {
    const loadUserZip = async () => {
      if (!user) return
      try {
        let zip: string | null = null

        const { profileDB } = await import("@/lib/database/profile-db")
        const profileData = await profileDB.fetchProfileFields(user.id, ["zip_code"])
        zip = profileData?.zip_code ?? null

        if (!zip) {
          const coords = await getUserLocation()
          if (coords) zip = await reverseGeocodeToPostalCode(coords)
        }

        if (zip) setZipCode(zip)
      } catch (error) {
        console.error("Failed to load user zip:", error)
      } finally {
        setZipReady(true)
      }
    }
    if (!user) {
      setZipReady(true)
      return
    }
    setZipReady(false)
    loadUserZip()
  }, [user])

  // Auto-run comparison on load and when non-quantity list inputs change.
  // Always cache-only — scraping is triggered explicitly via the update button.
  useEffect(() => {
    if (!mounted || !zipReady || listLoading) return
    if (shoppingList.length === 0) {
      previousListSignaturesRef.current = null
      return
    }
    if (!normalizedZipCode) return

    const currentSignatures = {
      identity: listIdentitySignature,
      quantity: listQuantitySignature,
      zipCode: normalizedZipCode,
    }
    const previousSignatures = previousListSignaturesRef.current

    if (
      previousSignatures &&
      previousSignatures.identity === currentSignatures.identity &&
      previousSignatures.quantity === currentSignatures.quantity &&
      previousSignatures.zipCode === currentSignatures.zipCode
    ) {
      return
    }

    const quantityOnlyChange = Boolean(
      previousSignatures &&
      previousSignatures.identity === currentSignatures.identity &&
      previousSignatures.quantity !== currentSignatures.quantity &&
      previousSignatures.zipCode === currentSignatures.zipCode
    )

    if (quantityOnlyChange && comparisonFetched) {
      previousListSignaturesRef.current = currentSignatures
      return
    }

    let cancelled = false

    const runAutoCompare = async () => {
      previousListSignaturesRef.current = currentSignatures
      await saveChanges()
      if (cancelled) return
      await performMassSearch({
        showCachedFirst: true,
        skipPricingGaps: true,
      })
    }

    void runAutoCompare()

    return () => {
      cancelled = true
    }
  }, [
    mounted,
    zipReady,
    listLoading,
    shoppingList.length,
    listIdentitySignature,
    listQuantitySignature,
    normalizedZipCode,
    comparisonFetched,
    saveChanges,
    performMassSearch,
  ])

  const selectedStore = visibleStoreComparisons[carouselIndex]?.store ?? null

  const sidebarSelectedStoreIndex = useMemo(() => {
    if (!selectedStore) return 0
    const index = visibleStoreComparisons.findIndex((s) => s.store === selectedStore)
    return index >= 0 ? index : 0
  }, [selectedStore, visibleStoreComparisons])

  const handleSidebarMapStoreSelect = useCallback((storeIndex: number) => {
    const store = visibleStoreComparisons[storeIndex]
    if (store) scrollToStore(storeIndex)
  }, [scrollToStore, visibleStoreComparisons])

  const handleStoreChange = useCallback((storeName: string | null) => {
    if (!storeName) {
      scrollToStore(0)
      return
    }
    const nextIndex = visibleStoreComparisons.findIndex((store) => store.store === storeName)
    if (nextIndex >= 0) {
      scrollToStore(nextIndex)
    }
  }, [scrollToStore, visibleStoreComparisons])

  const handleRefresh = useCallback(async () => {
    if (refreshInProgressRef.current) return
    refreshInProgressRef.current = true
    try {
      if (user?.id) {
        const locationUpdate = await updateLocation(user.id)
        if (!locationUpdate.success && locationUpdate.error) {
          console.warn("[store] updateLocation failed:", locationUpdate.error)
        }
      }
      await saveChanges()
      await performMassSearch({ showCachedFirst: false, skipPricingGaps: false })
    } finally {
      refreshInProgressRef.current = false
    }
  }, [user?.id, saveChanges, performMassSearch])

  const handleMobileAddItem = useCallback(async (name: string) => {
    const itemName = name.trim()
    if (!itemName) return

    const added = await addItem(itemName, 1, "piece")
    if (added) {
      toast({ title: "Item Added", description: `Added ${itemName} to your shopping list` })
    }
  }, [addItem, toast])

  const handleMobileAddRecipe = useCallback(async (recipeId: string, _title: string, servings?: number) => {
    await addRecipeToCart(recipeId, servings)
  }, [addRecipeToCart])

  const handleMobileRemoveRecipe = useCallback((recipeId: string) => {
    // Remove all items that belong to this recipe
    const itemsToRemove = shoppingList.filter(item => item.recipe_id === recipeId)
    itemsToRemove.forEach(item => removeItem(item.id))
  }, [shoppingList, removeItem])

  const handleStoreItemRemove = useCallback((
    itemId: string,
    storeName?: string | null,
    itemIds?: string[]
  ) => {
    if (!storeName) return

    const idsToHide = itemIds?.length ? itemIds : [itemId]
    setHiddenStoreItemIds((prev) => {
      const existing = new Set(prev[storeName] ?? [])
      idsToHide.forEach((id) => {
        if (id) existing.add(id)
      })
      return {
        ...prev,
        [storeName]: Array.from(existing),
      }
    })
  }, [])

  const handleSwapRequest = useCallback(async (itemId: string, shoppingListIds?: string[]) => {
    const item = shoppingList.find((shoppingItem) => shoppingItem.id === itemId)
    if (!item) {
      toast({ title: "Error", description: "Could not find item to replace.", variant: "destructive" })
      return
    }

    const activeStore = selectedStore || visibleStoreComparisons[0]?.store
    if (!activeStore) {
      toast({ title: "Error", description: "Select a store before replacing items.", variant: "destructive" })
      return
    }

    const activeStoreData = visibleStoreComparisons.find((store) => store.store === activeStore)
    const standardizedIngredientId = item.ingredient_id || item.standardizedIngredientId || null
    let replacementSearchTerm = item.name
    const localStandardizedName =
      typeof item.standardizedName === "string" ? item.standardizedName.trim() : ""

    if (localStandardizedName.length > 0) {
      replacementSearchTerm = localStandardizedName
    } else if (standardizedIngredientId) {
      try {
        const [standardizedIngredient] = await standardizedIngredientsDB.fetchByIds([standardizedIngredientId])
        const canonicalName =
          typeof standardizedIngredient?.canonical_name === "string"
            ? standardizedIngredient.canonical_name.trim()
            : ""
        if (canonicalName.length > 0) {
          replacementSearchTerm = canonicalName
        }
      } catch (error) {
        console.warn("[store] Failed to load standardized ingredient name for replacement", {
          standardizedIngredientId,
          error,
        })
      }
    }

    setReloadTarget({
      term: replacementSearchTerm,
      store: activeStore,
      shoppingListId: item.id,
      shoppingListIds: shoppingListIds?.length ? shoppingListIds : [item.id],
      standardizedIngredientId,
      groceryStoreId: activeStoreData?.groceryStoreId ?? null,
    })
    setReloadModalOpen(true)
  }, [selectedStore, shoppingList, toast, visibleStoreComparisons])

  const handleSwapConfirmation = useCallback((newItem: GroceryItem) => {
    const primaryId = reloadTarget?.shoppingListIds?.[0] || reloadTarget?.shoppingListId

    if (reloadTarget?.store && primaryId) {
      const oldItem = shoppingList.find((shoppingItem) => shoppingItem.id === primaryId)
      replaceItemForStore(
        reloadTarget.store,
        primaryId,
        { ...newItem, quantity: oldItem?.quantity ?? 1 }
      )
      toast({ title: "Item Swapped", description: `Updated for ${reloadTarget.store}` })
    } else {
      void addItem(newItem.title, 1, newItem.unit)
      toast({ title: "Item Added", description: `Added ${newItem.title} to your shopping list` })
    }

    setReloadModalOpen(false)
    setReloadTarget(null)
  }, [reloadTarget, shoppingList, replaceItemForStore, toast, addItem])

  // Handle checkout
  const handleCheckout = () => {
    if (!selectedStore && visibleStoreComparisons.length > 0) scrollToStore(0)

    // Calculate total price and item count from selected store
    const activeStoreData = selectedStore
      ? visibleStoreComparisons.find((store) => store.store === selectedStore)
      : visibleStoreComparisons[0]

    let totalAmount = 0
    let itemCount = 0

    // Build cart items for delivery log (with server-side price verification)
    const cartItems: Array<{
      item_id: string
      product_id: string
      num_pkgs: number
      frontend_price: number
    }> = []

    if (activeStoreData?.items) {
      // Use the same calculation logic as shopping-receipt-view for consistency
      totalAmount = activeStoreData.items.reduce((sum, item) => {
        const itemIds = item.shoppingItemIds?.filter(Boolean) || [item.shoppingItemId]
        let effectiveQty = 0

        itemIds.forEach((id) => {
          const shoppingItem = shoppingList.find((si) => si.id === id)
          if (shoppingItem) {
            effectiveQty += Math.max(1, Number(shoppingItem.quantity) || 1)
          }
        })

        if (effectiveQty <= 0) {
          effectiveQty = Math.max(1, Number(item.quantity) || 1)
        }

        const baselineQuantity = Math.max(1, Number(item.quantity) || 1)
        const baselinePackages = Number(item.packagesToBuy)
        const packagePrice = Number(item.packagePrice)

        // Use package-based pricing when available
        if (
          Number.isFinite(packagePrice) &&
          packagePrice > 0 &&
          Number.isFinite(baselinePackages) &&
          baselinePackages > 0
        ) {
          const packagesPerQuantity = baselinePackages / baselineQuantity
          const adjustedPackages = Math.max(1, Math.ceil(packagesPerQuantity * effectiveQty))

          // Add to cart items if we have required data
          if (item.shoppingItemId && item.productMappingId) {
            cartItems.push({
              item_id: item.shoppingItemId,
              product_id: item.productMappingId,
              num_pkgs: adjustedPackages,
              frontend_price: packagePrice,
            })
          }

          return sum + (packagePrice * adjustedPackages)
        }

        // Fallback to simple price * quantity
        const price = Number(item.price) || 0

        // Add to cart items if we have required data
        if (item.shoppingItemId && item.productMappingId) {
          cartItems.push({
            item_id: item.shoppingItemId,
            product_id: item.productMappingId,
            num_pkgs: effectiveQty,
            frontend_price: price,
          })
        }

        return sum + (price * effectiveQty)
      }, 0)

      // Set item count to actual priced items
      itemCount = activeStoreData.items.length
    }

    // Navigate to checkout with pricing parameters and cart items
    const queryParams = new URLSearchParams({
      total: totalAmount.toFixed(2),
      items: itemCount.toString(),
    })

    // Add cart items if available (URL encoding for safe transport)
    if (cartItems.length > 0) {
      queryParams.set('cartItems', encodeURIComponent(JSON.stringify(cartItems)))
    }

    router.push(`/checkout?${queryParams.toString()}`)
  }

  // Theme classes
  const isDark = theme === "dark"
  const styles = useMemo(() => ({
    bgClass: isDark ? "bg-[#181813]" : "bg-gray-50/50",
    cardBgClass: isDark ? "bg-[#1f1e1a] shadow-none" : "bg-white shadow-sm border-0",
    textClass: isDark ? "text-[#e8dcc4]" : "text-gray-900",
    mutedTextClass: isDark ? "text-[#e8dcc4]/70" : "text-gray-600",
    theme: (isDark ? "dark" : "light") as "light" | "dark"
  }), [isDark])

  if (!mounted) {
    return null // Prevent hydration mismatch
  }

  return (
    <div className={`min-h-screen overflow-x-hidden ${styles.bgClass}`}>
      {/* Main Content */}
      <div className="mx-auto w-full max-w-[1440px] px-3 py-3 sm:px-4 lg:px-6 lg:py-6 xl:px-8">
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_392px]">

          {/* Panel: recipes in cart + add item + map (desktop sidebar) */}
          {/* Mobile: order-1 (top) | Desktop: order-2 (right sidebar) */}
          <aside className="order-1 flex min-w-0 flex-col gap-3 lg:sticky lg:top-20 lg:order-2 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <MobileQuickAddPanel
              shoppingList={shoppingList}
              onAddItem={handleMobileAddItem}
              onAddRecipe={handleMobileAddRecipe}
              onRemoveRecipe={handleMobileRemoveRecipe}
              theme={styles.theme}
              textClass={styles.textClass}
              mutedTextClass={styles.mutedTextClass}
              cardBgClass={styles.cardBgClass}
            />

            {/* Map: desktop sidebar only */}
            {visibleStoreComparisons.length > 0 && (
              <div className={`hidden lg:block rounded-lg overflow-hidden border ${
                isDark ? "border-white/10 bg-[#1f1e1a]" : "border-gray-200 bg-white"
              }`} data-tutorial="store-map">
                <StoreMap
                  comparisons={visibleStoreComparisons}
                  onStoreSelected={handleSidebarMapStoreSelect}
                  userPostalCode={zipCode}
                  selectedStoreIndex={sidebarSelectedStoreIndex}
                  mapHeight="320px"
                />
              </div>
            )}
          </aside>

          {/* Receipt view */}
          {/* Mobile: order-2 (bottom, fills rest) | Desktop: order-1 (left, flex-1) */}
          <main className="order-2 flex min-w-0 flex-col lg:order-1">
            <ShoppingReceiptView
              shoppingList={shoppingList}
              storeComparisons={visibleStoreComparisons}
              selectedStore={selectedStore}
              onStoreChange={handleStoreChange}
              onQuantityChange={updateQuantity}
              onRemoveItem={handleStoreItemRemove}
              onSwapItem={handleSwapRequest}
              onCheckout={handleCheckout}
              onRefresh={handleRefresh}
              loading={listLoading || comparisonLoading || (shoppingList.length > 0 && !comparisonFetched)}
              isStale={comparisonFetched}
              error={null}
              userPostalCode={zipCode}
              theme={styles.theme}
              className="min-h-[calc(100svh-11rem)] lg:min-h-[calc(100vh-7rem)]"
            />
          </main>

        </div>
      </div>

      <ItemReplacementModal
        isOpen={reloadModalOpen}
        onClose={() => {
          setReloadModalOpen(false)
          setReloadTarget(null)
        }}
        target={reloadTarget}
        zipCode={zipCode}
        onSelect={handleSwapConfirmation}
        styles={styles}
        userId={user?.id}
      />
    </div>
  )
}
