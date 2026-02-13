"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useToast } from "@/hooks"
import { useShoppingList } from "@/hooks/shopping/use-shopping-list"
import { useStoreComparison } from "@/hooks/shopping/use-store-comparison"
import { updateLocation } from "@/lib/location-client"
import { ShoppingReceiptView } from "@/components/store/shopping-receipt-view"
import { ItemReplacementModal } from "@/components/store/store-replacement"
import { MobileQuickAddPanel } from "@/components/store/mobile-quick-add-panel"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import type { GroceryItem } from "@/lib/types/store"

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
  const previousListSignaturesRef = useRef<{ identity: string; quantity: string } | null>(null)

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

  // Hydration handling
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load user zip code
  useEffect(() => {
    const loadUserZip = async () => {
      if (!user) return
      try {
        const { profileDB } = await import("@/lib/database/profile-db")
        const profileData = await profileDB.fetchProfileFields(user.id, ["zip_code"])
        if (profileData?.zip_code) {
          setZipCode(profileData.zip_code)
        }
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
  // Keep this cache-only; explicit refresh triggers scraper activation.
  useEffect(() => {
    if (!mounted || !zipReady || listLoading) return
    if (shoppingList.length === 0) {
      previousListSignaturesRef.current = null
      return
    }

    const currentSignatures = {
      identity: listIdentitySignature,
      quantity: listQuantitySignature,
    }
    const previousSignatures = previousListSignaturesRef.current
    previousListSignaturesRef.current = currentSignatures

    if (
      previousSignatures &&
      previousSignatures.identity === currentSignatures.identity &&
      previousSignatures.quantity === currentSignatures.quantity
    ) {
      return
    }

    const quantityOnlyChange = Boolean(
      previousSignatures &&
      previousSignatures.identity === currentSignatures.identity &&
      previousSignatures.quantity !== currentSignatures.quantity
    )

    if (quantityOnlyChange && comparisonFetched) {
      return
    }

    let cancelled = false

    const runAutoCompare = async () => {
      await saveChanges()
      if (cancelled) return
      await performMassSearch({ showCachedFirst: true, skipPricingGaps: true })
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
    comparisonFetched,
    saveChanges,
    performMassSearch,
  ])

  const selectedStore = storeComparisons[carouselIndex]?.store ?? null

  const handleStoreChange = useCallback((storeName: string | null) => {
    if (!storeName) {
      scrollToStore(0)
      return
    }
    const nextIndex = storeComparisons.findIndex((store) => store.store === storeName)
    if (nextIndex >= 0) {
      scrollToStore(nextIndex)
    }
  }, [scrollToStore, storeComparisons])

  const handleRefresh = useCallback(async () => {
    if (user?.id) {
      const locationUpdate = await updateLocation(user.id)
      if (!locationUpdate.success && locationUpdate.error) {
        console.warn("[store] updateLocation failed:", locationUpdate.error)
      }
    }
    await saveChanges()
    await performMassSearch({ showCachedFirst: true, skipPricingGaps: false })
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

  const handleSwapRequest = useCallback((itemId: string) => {
    const item = shoppingList.find((shoppingItem) => shoppingItem.id === itemId)
    if (!item) {
      toast({ title: "Error", description: "Could not find item to replace.", variant: "destructive" })
      return
    }

    const activeStore = selectedStore || storeComparisons[0]?.store
    if (!activeStore) {
      toast({ title: "Error", description: "Select a store before replacing items.", variant: "destructive" })
      return
    }

    const activeStoreData = storeComparisons.find((store) => store.store === activeStore)
    const standardizedIngredientId = item.ingredient_id || item.standardizedIngredientId || null

    setReloadTarget({
      term: item.name,
      store: activeStore,
      shoppingListId: item.id,
      shoppingListIds: [item.id],
      standardizedIngredientId,
      groceryStoreId: activeStoreData?.groceryStoreId ?? null,
    })
    setReloadModalOpen(true)
  }, [selectedStore, shoppingList, storeComparisons, toast])

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
    if (!selectedStore && storeComparisons.length > 0) scrollToStore(0)
    // Navigate to delivery page or checkout flow
    router.push("/delivery")
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
    <div className={`min-h-screen ${styles.bgClass}`}>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Sidebar - Add Items (Desktop) */}
          <div className="hidden lg:block lg:col-span-1">
            <div className={`${styles.cardBgClass} rounded-lg p-6 sticky top-24`}>
              <h2 className={`text-lg font-bold mb-4 ${styles.textClass}`}>
                Quick Add
              </h2>
              <div className="space-y-4">
                <div>
                  <label className={`text-sm font-medium mb-2 block ${styles.textClass}`}>
                    Add Custom Item
                  </label>
                  <div className="flex gap-2" data-tutorial="store-add">
                    <input
                      type="text"
                      placeholder="Item name..."
                      className={`flex-1 px-3 py-2 text-sm rounded-md border ${
                        isDark
                          ? 'bg-[#181813] border-[#e8dcc4]/20 text-[#e8dcc4]'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          // Add item logic here
                          e.currentTarget.value = ''
                        }
                      }}
                    />
                    <Button size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-white/10">
                  <p className={`text-xs ${styles.mutedTextClass} mb-2`}>
                    You can also:
                  </p>
                  <ul className={`text-xs space-y-1 ${styles.mutedTextClass}`}>
                    <li>• Add items from recipes</li>
                    <li>• Import shopping lists</li>
                    <li>• Use voice input</li>
                  </ul>
                </div>

                <div className="pt-4">
                  <div className={`p-3 rounded-lg ${
                    isDark ? 'bg-green-900/20' : 'bg-green-50'
                  }`}>
                    <p className={`text-xs font-semibold mb-1 ${
                      isDark ? 'text-green-400' : 'text-green-900'
                    }`}>
                      💡 Pro Tip
                    </p>
                    <p className={`text-xs ${
                      isDark ? 'text-green-300' : 'text-green-800'
                    }`}>
                      Prices update automatically as you add or modify items. Try different stores to find the best deals!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right - Receipt View */}
          <div className="lg:col-span-2">
            {/* Mobile: Quick add at top for easy access, receipt below */}
            {/* Desktop: Receipt takes full available height */}
            <div className="flex flex-col h-[calc(100vh-2rem)] lg:h-[calc(100vh-12rem)] gap-3">
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

              <ShoppingReceiptView
                shoppingList={shoppingList}
                storeComparisons={storeComparisons}
                selectedStore={selectedStore}
                onStoreChange={handleStoreChange}
                onQuantityChange={updateQuantity}
                onRemoveItem={removeItem}
                onSwapItem={handleSwapRequest}
                onCheckout={handleCheckout}
                onRefresh={handleRefresh}
                loading={listLoading || comparisonLoading || (shoppingList.length > 0 && !comparisonFetched)}
                isStale={comparisonFetched}
                error={null}
                userPostalCode={zipCode}
                theme={styles.theme}
                className="flex-1 min-h-[500px]"
              />
            </div>
          </div>
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
