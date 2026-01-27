"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"

import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useToast } from "@/hooks"
import { profileDB } from "@/lib/database/profile-db"
import type { GroceryItem } from "@/lib/types/store"

import { useShoppingList } from "@/hooks"
import { useStoreComparison } from "@/hooks"

import { ItemReplacementModal } from "@/components/store/store-replacement"
import { StoreComparisonSection } from "@/components/store/store-comparison"
import { ShoppingListSection } from "@/components/store/store-list"
import { RecipeSearchModal } from "@/components/recipe/detail/recipe-recommendation-modal"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag, Loader2, ArrowRight } from "lucide-react"

const DEFAULT_SHOPPING_ZIP = ""

export default function ShoppingPage() {
  const { user, loading: authLoading } = useAuth()
  const { theme } = useTheme()
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const [mounted, setMounted] = useState(false)
  const [zipCode, setZipCode] = useState(DEFAULT_SHOPPING_ZIP)
  const [showComparison, setShowComparison] = useState(false)
  const [newItemInput, setNewItemInput] = useState("")
  const [showRecipeModal, setShowRecipeModal] = useState(false)

  const shoppingListRef = useRef<HTMLDivElement>(null)

  const [reloadModalOpen, setReloadModalOpen] = useState(false)
  const [reloadTarget, setReloadTarget] = useState<{
    term: string;
    store: string;
    shoppingListId?: string;
    shoppingListIds?: string[];
    standardizedIngredientId?: string | null;
  } | null>(null)
  
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
      if (user) {
        const profileData = await profileDB.fetchProfileFields(user.id, ["zip_code"])

        if (profileData?.zip_code) setZipCode(profileData.zip_code)
      } else {
        const saved = localStorage.getItem("shopping_zip_code")
        if (saved) setZipCode(saved)
      }
    }
    loadPrefs()
  }, [user, authLoading, profileDB])

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

  const handleAddRecipe = async (id: string, title: string, servings?: number) => {
    await addRecipeToCart(id, servings)
  }

  const handleCompareClick = async () => {
    if (shoppingList.length === 0) return
    // Save all pending changes before showing comparison
    await saveChanges()
    setShowComparison(true)
    await performMassSearch()
    // Scroll to comparison section after a brief delay to ensure it's rendered
    setTimeout(() => {
      document.querySelector("[data-comparison]")?.scrollIntoView({ behavior: "smooth" })
    }, 100)
  }

  const handleReloadRequest = (target: { term: string; store: string; shoppingListId: string; shoppingListIds?: string[] }) => {
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
          <div ref={shoppingListRef} data-shopping-list>
            <Card className={`${styles.cardBgClass} overflow-hidden flex flex-col h-full`} style={{ minHeight: shoppingList.length === 0 ? '70vh' : 'auto' }}>

              {/* Header */}
              <CardHeader className="flex flex-row items-center justify-between pb-4 flex-shrink-0">
                <CardTitle className={`flex items-center gap-2 ${styles.textClass}`}>
                  <ShoppingBag className="h-5 w-5 opacity-70" />
                  Shopping List
                </CardTitle>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleCompareClick}
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

        {/* Mobile modal - DISABLED */}
        {/* <Dialog open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <DialogContent className="h-[80vh] max-h-[80vh] p-0 border-0 flex flex-col rounded-t-2xl rounded-b-none">
            <RecipeRecommendationSidebar
              shoppingItems={shoppingList}
              onAddRecipe={handleAddRecipe}
              theme={styles.theme}
              cardBgClass={styles.cardBgClass}
              textClass={styles.textClass}
              mutedTextClass={styles.mutedTextClass}
              buttonClass={styles.buttonClass}
              buttonOutlineClass={styles.buttonOutlineClass}
            />
          </DialogContent>
        </Dialog> */}

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
      />
    </div>
  )
}
