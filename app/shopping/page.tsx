"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useToast } from "@/hooks"
import { profileDB } from "@/lib/database/profile-db"
import { getUserLocation, reverseGeocodeToPostalCode } from "@/lib/location-client"
import { storeListHistoryDB } from "@/lib/database/store-list-history-db"
import { deliveryOrdersDB } from "@/lib/database/delivery-orders-db"
import { calculateDeliveryFees } from "@/lib/delivery/pricing"
import { useSubscription } from "@/hooks/use-subscription"
import type { GroceryItem } from "@/lib/types/store"

import { useShoppingList } from "@/hooks"
import { useStoreComparison } from "@/hooks"

import { ItemReplacementModal } from "@/components/store/store-replacement"
import { StoreComparisonSection } from "@/components/store/store-comparison"
import { ShoppingListSection } from "@/components/store/store-list"
import { RecipeSearchModal } from "@/components/recipe/detail/recipe-recommendation-modal"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag, Loader2, ArrowRight, ShoppingCart } from "lucide-react"

const DEFAULT_SHOPPING_ZIP = ""

export default function ShoppingPage() {
  const { user, loading: authLoading } = useAuth()
  const { theme } = useTheme()
  const { toast } = useToast()
  const { subscription } = useSubscription()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [mounted, setMounted] = useState(false)
  const [zipCode, setZipCode] = useState(DEFAULT_SHOPPING_ZIP)
  const [showComparison, setShowComparison] = useState(false)
  const [newItemInput, setNewItemInput] = useState("")
  const [showRecipeModal, setShowRecipeModal] = useState(false)

  const [reloadModalOpen, setReloadModalOpen] = useState(false)
  const [reloadTarget, setReloadTarget] = useState<{
    term: string;
    store: string;
    shoppingListId?: string;
    shoppingListIds?: string[];
    standardizedIngredientId?: string | null;
    groceryStoreId?: string | null;
  } | null>(null)
  const isDev = process.env.NODE_ENV !== "production"
  
  const {
    items: shoppingList,
    addItem,
    updateQuantity,
    updateItemName,
    removeItem: removeFromShoppingList,
    removeRecipe: removeRecipeItems,
    toggleChecked,
    addRecipeToCart,
    updateRecipeServings,
    saveChanges,
  } = useShoppingList()

  const {
    activeStoreIndex: carouselIndex,
    results: massSearchResults,
    loading: comparisonLoading,
    hasFetched: comparisonFetched,
    performMassSearch,
    scrollToStore,
    replaceItemForStore,
    sortMode,
    setSortMode,
    resetComparison
  } = useStoreComparison(shoppingList, zipCode, null)

  useEffect(() => setMounted(true), [])

  // Any change to the shopping list invalidates existing comparisons
  useEffect(() => {
    if (!mounted) return
    resetComparison()
    setShowComparison(false)
  }, [shoppingList, mounted, resetComparison])

  useEffect(() => {
    if (authLoading) return
    const loadPrefs = async () => {
      let zip: string | null = null

      if (user) {
        const profileData = await profileDB.fetchProfileFields(user.id, ["zip_code"])
        zip = profileData?.zip_code ?? null
      }

      if (!zip) {
        zip = localStorage.getItem("shopping_zip_code")
      }

      if (!zip) {
        const coords = await getUserLocation()
        if (coords) {
          zip = await reverseGeocodeToPostalCode(coords)
        }
      }

      if (zip) setZipCode(zip)
    }
    loadPrefs()
  }, [user, authLoading])

  useEffect(() => {
    if (mounted && searchParams.get("expandList") === "true") {
      document.querySelector("[data-shopping-list]")?.scrollIntoView({ behavior: "smooth" })
    }
  }, [searchParams, mounted])


  // --- Handlers ---

  const handleCustomInputSubmit = async () => {
    if (newItemInput.trim()) {
      await addItem(newItemInput)
      setNewItemInput("")
    }
  }

  const handleDirectAdd = async (name: string) => {
    if (name.trim()) {
      const result = await addItem(name)
      if (result) {
        toast({ description: `Added "${name}" to list` })
      }
    }
  }

  const handleAddRecipe = async (id: string, _title: string, servings?: number) => {
    await addRecipeToCart(id, servings)
  }

  const handleCompareClick = async (skipPricingGaps: boolean = false) => {
    if (shoppingList.length === 0) return
    // Save all pending changes before showing comparison
    await saveChanges()
    setShowComparison(true)
    await performMassSearch({ skipPricingGaps })
    // Scroll to comparison section after a brief delay to ensure it's rendered
    setTimeout(() => {
      document.querySelector("[data-comparison]")?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }

  const handleReloadRequest = (target: { term: string; store: string; shoppingListId: string; shoppingListIds?: string[]; groceryStoreId?: string | null }) => {
    const primaryId = target.shoppingListIds?.[0] || target.shoppingListId
    const matchedItem = shoppingList.find(i => i.id === primaryId)
    const standardizedIngredientId = matchedItem?.ingredient_id || matchedItem?.standardizedIngredientId || null

    setReloadTarget({ ...target, standardizedIngredientId })
    setReloadModalOpen(true)
  }

  const handleSwapConfirmation = (newItem: GroceryItem) => {
    const primaryId = reloadTarget?.shoppingListIds?.[0] || reloadTarget?.shoppingListId

    if (reloadTarget?.store && primaryId) {
      const oldItem = shoppingList.find(i => i.id === primaryId)
      replaceItemForStore(
        reloadTarget.store,
        primaryId,
        { ...newItem, quantity: oldItem?.quantity ?? 1 }
      )
      toast({ title: "Item Swapped", description: `Updated for ${reloadTarget.store}` })
    } else {
      addItem(newItem.title, 1, newItem.unit)
    }
    setReloadModalOpen(false)
  }

  const handleCheckout = async () => {
    if (!user) {
      toast({ title: "Error", description: "Please sign in to checkout", variant: "destructive" })
      return
    }

    const deliveryProfile = await profileDB.fetchProfileFields(user.id, [
      "formatted_address",
      "address_line1",
      "city",
      "state",
      "zip_code",
    ])
    const hasDeliveryAddress =
      Boolean(deliveryProfile?.formatted_address?.trim()) ||
      (Boolean(deliveryProfile?.address_line1?.trim()) &&
        Boolean(deliveryProfile?.city?.trim()) &&
        Boolean(deliveryProfile?.state?.trim()) &&
        Boolean(deliveryProfile?.zip_code?.trim()))

    if (!hasDeliveryAddress) {
      toast({
        title: "Add your delivery address",
        description: "Please save a full address on the delivery address page before checking out.",
        variant: "destructive",
      })
      router.push(`/delivery/address?returnTo=${encodeURIComponent("/shopping")}`)
      return
    }

    if (massSearchResults.length === 0) {
      toast({ title: "Error", description: "No comparison results available", variant: "destructive" })
      return
    }

    // Get the best store (first one after sorting)
    const bestStore = massSearchResults[0]
    if (!bestStore || bestStore.items.length === 0) {
      toast({ title: "Error", description: "No items to checkout", variant: "destructive" })
      return
    }

    try {
      toast({ title: "Processing...", description: "Creating your delivery order" })

      // Build cart entries with price verification data for bulk delivery log
      const cartEntries = bestStore.items
        .flatMap(item => {
          if (!item.productMappingId) return []
          const sourceIds = item.shoppingItemIds?.length ? item.shoppingItemIds : [item.shoppingItemId]
          const normalizedIds = sourceIds
            .map((id) => String(id || "").trim())
            .filter((id) => id.length > 0)

          return normalizedIds.map((shoppingItemId) => ({
            item_id: shoppingItemId,
            product_id: item.productMappingId!,
            num_pkgs: item.packagesToBuy || item.quantity || 1,
            frontend_price: typeof item.price === "number" ? item.price : 0,
          }))
        })
        .filter(
          (entry, index, arr) =>
            arr.findIndex(
              (candidate) =>
                candidate.item_id === entry.item_id &&
                candidate.product_id === entry.product_id
            ) === index
        )

      if (cartEntries.length === 0) {
        throw new Error("No items were added to delivery log")
      }

      // Use bulk function with server-side price verification
      const results = await storeListHistoryDB.bulkAddToDeliveryLog(cartEntries)

      // Check for price mismatches (fraud detection)
      const priceMismatches = results.filter(r => r.success && !r.price_matched)
      if (priceMismatches.length > 0) {
        console.warn("[shopping] Price mismatches detected:", priceMismatches)
      }

      // Count successful additions
      const successfulResults = results.filter(r => r.success)
      const addedCount = successfulResults.length

      if (addedCount === 0) {
        throw new Error("No items were added to delivery log")
      }

      // Fetch order_id from first successful entry (assigned by DB trigger)
      // All items in the same batch should have the same order_id
      const firstItemId = successfulResults[0]?.shopping_list_item_id
      let orderId: string | null = null

      if (firstItemId) {
        const logEntries = await storeListHistoryDB.findByUserId(user?.id || "", { limit: 1 })
        orderId = logEntries[0]?.order_id || null
      }

      if (!orderId) {
        throw new Error("Failed to retrieve order ID")
      }

      // Calculate and persist delivery fee breakdown
      const subtotal = bestStore.items.reduce((sum, item) => {
        const price = typeof item.price === "number" ? item.price : 0
        const qty = item.packagesToBuy || item.quantity || 1
        return sum + price * qty
      }, 0)
      const tier = subscription?.is_active && subscription?.tier === "premium" ? "premium" : "free"
      const feeBreakdown = calculateDeliveryFees(Math.round(subtotal * 100) / 100, tier)
      const savedFees = await deliveryOrdersDB.upsertOrderFees(orderId, user.id, feeBreakdown)
      if (!savedFees) {
        throw new Error("Failed to save delivery fee breakdown")
      }

      // Success! Redirect to order detail page
      toast({
        title: "Order Created!",
        description: `Your delivery order has been created (${addedCount} items)`,
      })

      router.push(`/delivery/${orderId}`)
    } catch (error) {
      toast({
        title: "Checkout Failed",
        description: "There was an error creating your order. Please try again.",
        variant: "destructive",
      })
    }
  }

  // --- Styles ---
  const isDark = (mounted ? theme : "light") === "dark"

  const styles = useMemo(() => ({
    bgClass: isDark ? "bg-[#181813]" : "bg-gray-50/50",
    cardBgClass: isDark
      ? "bg-[#1f1e1a] shadow-none"
      : "bg-white shadow-sm border-0",
    textClass: isDark ? "text-[#e8dcc4]" : "text-gray-900",
    mutedTextClass: isDark ? "text-[#e8dcc4]/70" : "text-gray-500",
    buttonClass: isDark
      ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] shadow-none"
      : "bg-orange-500 hover:bg-orange-600 text-white shadow-sm",
    buttonOutlineClass: isDark
      ? "border-0 bg-[#e8dcc4]/10 text-[#e8dcc4] hover:bg-[#e8dcc4]/20"
      : "border border-gray-200 bg-white hover:bg-gray-50",
    inputClass: isDark
      ? "bg-[#181813] border-0 focus-visible:ring-1 focus-visible:ring-[#e8dcc4]/50 text-[#e8dcc4]"
      : "bg-gray-50 border-0 focus-visible:ring-1 focus-visible:ring-gray-300 text-gray-900",
    theme: isDark ? "dark" : "light" as "light" | "dark"
  }), [isDark])

  if (!mounted) return <div className={`min-h-screen ${styles.bgClass}`} />

  return (
    <div className={`min-h-screen ${styles.bgClass} p-6`}>
      <div className="max-w-7xl mx-auto">
        {/* Shopping list - full width */}
        <div className="mb-8">

          {/* Shopping list card */}
          <div data-shopping-list data-tutorial="shopping-list">
            <Card className={`${styles.cardBgClass} overflow-hidden flex flex-col h-full`} style={{ minHeight: shoppingList.length === 0 ? '70vh' : 'auto' }}>

              {/* Header */}
              <CardHeader className="flex flex-row items-center justify-between pb-4 flex-shrink-0">
                <CardTitle className={`flex items-center gap-2 ${styles.textClass}`}>
                  <ShoppingBag className="h-5 w-5 opacity-70" />
                  Shopping List
                </CardTitle>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleCompareClick()}
                    disabled={shoppingList.length === 0 || comparisonLoading}
                    className={styles.buttonClass}
                    data-tutorial="store-compare"
                  >
                    {comparisonLoading ? (
                      <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating... </>
                    ) : (
                      <> Compare Prices <ArrowRight className="ml-2 h-4 w-4" /> </>
                    )}
                  </Button>
                  {isDev && (
                    <Button
                      onClick={() => handleCompareClick(true)}
                      disabled={shoppingList.length === 0 || comparisonLoading}
                      className={styles.buttonOutlineClass}
                    >
                      Dev Compare (No Gaps)
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0 flex-1 overflow-y-auto min-h-0">
                <div className="p-6 pt-0">
                  <ShoppingListSection
                    // Data
                    shoppingList={shoppingList}
                    user={user}
                    zipCode={zipCode}

                    // Actions
                    onRemoveItem={removeFromShoppingList}
                    onUpdateQuantity={updateQuantity}
                    onUpdateItemName={updateItemName}
                    onToggleItem={toggleChecked}
                    onRemoveRecipe={removeRecipeItems}
                    onUpdateRecipeServings={updateRecipeServings}
                    onAddItem={handleDirectAdd}
                    onAddRecipe={handleAddRecipe}

                    // Styles
                    cardBgClass="shadow-none border-0 bg-transparent"
                    textClass={styles.textClass}
                    mutedTextClass={styles.mutedTextClass}
                    buttonClass={styles.buttonClass}
                    buttonOutlineClass={styles.buttonOutlineClass}
                    theme={styles.theme}
                    // New prop for custom item input
                    newItemInput={newItemInput}
                    onNewItemInputChange={setNewItemInput}
                    onAddCustomItem={handleCustomInputSubmit}
                    inputClass={styles.inputClass}
                    onOpenRecipeSearch={() => setShowRecipeModal(true)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom: Price comparison (full width) */}
        {showComparison && (
          <div className="mt-8" data-comparison>
            <Card className={`${styles.cardBgClass} overflow-hidden`}>
              <CardHeader className="pb-4">
                <CardTitle className={`flex items-center gap-2 ${styles.textClass}`}>
                  Price Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {comparisonLoading || !comparisonFetched ? (
                  <div className="text-center py-20">
                    <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-orange-500" />
                    <h3 className={`text-xl font-medium ${styles.textClass}`}>Scanning local stores...</h3>
                  </div>
                ) : (
                  <div className="p-6 pt-0">
                    <StoreComparisonSection
                      comparisonLoading={comparisonLoading}
                      massSearchResults={massSearchResults}
                      carouselIndex={carouselIndex}
                      onStoreSelect={scrollToStore}
                      onReloadItem={handleReloadRequest}
                      postalCode={zipCode}
                      cardBgClass={styles.cardBgClass}
                      textClass={styles.textClass}
                      mutedTextClass={styles.mutedTextClass}
                      buttonClass={styles.buttonClass}
                      theme={styles.theme}
                      sortMode={sortMode}
                      onChangeSort={setSortMode}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Checkout Button Section */}
            {!comparisonLoading && comparisonFetched && massSearchResults.length > 0 && (
              <Card className={`${styles.cardBgClass} mt-6`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className={`font-semibold text-lg ${styles.textClass}`}>
                        Ready to checkout?
                      </h3>
                      <p className={styles.mutedTextClass}>
                        Review your selections and proceed to payment
                      </p>
                    </div>
                    <Button
                      onClick={handleCheckout}
                      className={`${styles.buttonClass} h-12 px-8`}
                    >
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      Proceed to Checkout
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Recipe Search Modal - triggered by chef hat button */}
      {showRecipeModal && (
        <RecipeSearchModal
          shoppingItems={shoppingList}
          onAddRecipe={handleAddRecipe}
          theme={styles.theme}
          cardBgClass={styles.cardBgClass}
          textClass={styles.textClass}
          mutedTextClass={styles.mutedTextClass}
          isOpen={showRecipeModal}
          onClose={() => setShowRecipeModal(false)}
        />
      )}

      <ItemReplacementModal
        isOpen={reloadModalOpen}
        onClose={() => setReloadModalOpen(false)}
        target={reloadTarget}
        zipCode={zipCode}
        onSelect={handleSwapConfirmation}
        styles={styles}
        userId={user?.id}
      />
    </div>
  )
}
