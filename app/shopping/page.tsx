"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"

import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import type { GroceryItem } from "@/lib/types/store"

import { useShoppingList } from "@/hooks/useShoppingList"
import { useStoreComparison } from "@/hooks/useStoreComparison"

import { ItemReplacementModal } from "../../components/store-replacemnet"
import { StoreComparisonSection } from "@/components/store-comparison"
import { ShoppingListSection } from "@/components/store-list"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag, Loader2, Plus, ArrowRight, Edit2 } from "lucide-react"

const DEFAULT_SHOPPING_ZIP = ""

export default function ShoppingPage() {
  const { user, loading: authLoading } = useAuth()
  const { theme } = useTheme()
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const [mounted, setMounted] = useState(false)
  const [zipCode, setZipCode] = useState(DEFAULT_SHOPPING_ZIP)
  const [viewMode, setViewMode] = useState<"edit" | "compare">("edit")
  const [newItemInput, setNewItemInput] = useState("")

  const [reloadModalOpen, setReloadModalOpen] = useState(false)
  const [reloadTarget, setReloadTarget] = useState<{ 
    term: string; 
    store: string; 
    shoppingListId?: string; 
  } | null>(null)
  
  const {
    items: shoppingList,
    addItem,
    updateQuantity,
    updateItemName, 
    removeItem: removeFromShoppingList,
    removeRecipe: removeRecipeItems, 
    toggleChecked,
  } = useShoppingList()

  const {
    activeStoreIndex: carouselIndex,
    results: massSearchResults,
    loading: comparisonLoading,
    performMassSearch,
    nextStore,
    prevStore,
    scrollToStore,
    handleScroll,
    carouselRef,
    replaceItemForStore 
  } = useStoreComparison(shoppingList, zipCode, null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (authLoading) return
    const loadPrefs = async () => {
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("postal_code")
          .eq("id", user.id)
          .single()
          
        if (data?.postal_code) setZipCode(data.postal_code)
      } else {
        const saved = localStorage.getItem("shopping_zip_code")
        if (saved) setZipCode(saved)
      }
    }
    loadPrefs()
  }, [user, authLoading])

  useEffect(() => {
    if (mounted && searchParams.get("expandList") === "true") {
      document.querySelector("[data-shopping-list]")?.scrollIntoView({ behavior: "smooth" })
    }
  }, [searchParams, mounted])

  // --- Handlers ---

  const handleCustomInputSubmit = () => {
    if (newItemInput.trim()) {
      addItem(newItemInput)
      setNewItemInput("")
    }
  }

  const handleDirectAdd = (name: string) => {
    if (name.trim()) {
      addItem(name)
      toast({ description: `Added "${name}" to list` })
    }
  }

  // --- FIX: Robust Recipe Handling ---
  const handleAddRecipe = (id: string, title: string, ingredients: any[]) => {
    if (!ingredients || !Array.isArray(ingredients)) {
        toast({ title: "Error", description: "Could not read ingredients for this recipe.", variant: "destructive" })
        return
    }

    let count = 0
    
    ingredients.forEach((ing) => {
      // Determine the ingredient name regardless of data structure
      let name = ""
      if (typeof ing === 'string') {
        name = ing
      } else if (typeof ing === 'object' && ing !== null) {
        name = ing.name || ing.title || ing.ingredient || ""
      }

      if (name && name.trim()) {
        // addItem(name, quantity, unit, checked, recipeId, recipeName)
        // Ensure we pass ID and Title so grouping works in ShoppingListSection
        addItem(name.trim(), 1, undefined, false, id, title) 
        count++
      }
    })
    
    if (count > 0) {
      toast({ 
        title: "Recipe Added", 
        description: `Added ${count} ingredients from "${title}".` 
      })
    } else {
      toast({
        title: "No Ingredients Found",
        description: "This recipe appears to have no ingredients listed.",
        variant: "destructive"
      })
    }
  }

  const handleCompareClick = () => {
    if (shoppingList.length === 0) return
    setViewMode("compare")
    performMassSearch()
  }

  const handleReloadRequest = (target: { term: string; store: string; shoppingListId: string }) => {
    setReloadTarget(target)
    setReloadModalOpen(true)
  }

  const handleSwapConfirmation = (newItem: GroceryItem) => {
    if (reloadTarget?.shoppingListId && reloadTarget.store) {
      const oldItem = shoppingList.find(i => i.id === reloadTarget.shoppingListId)
      
      replaceItemForStore(
        reloadTarget.store,        
        reloadTarget.shoppingListId, 
        { ...newItem, quantity: oldItem ? oldItem.quantity : 1 }              
      )
      toast({ title: "Item Swapped", description: `Updated for ${reloadTarget.store}` })
    } else {
      addItem(newItem.title, 1, newItem.unit)
    }
    setReloadModalOpen(false)
  }

  // --- Styles ---
  const isDark = (mounted ? theme : "light") === "dark"
  
  const styles = {
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
  }

  if (!mounted) return <div className={`min-h-screen ${styles.bgClass}`} />

  return (
    <div className={`min-h-screen ${styles.bgClass} p-6`}>
      <div className="max-w-7xl mx-auto">
        
        <div data-shopping-list>
          <Card className={`${styles.cardBgClass} overflow-hidden`}>
            
            {/* Header / Mode Switcher */}
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className={`flex items-center gap-2 ${styles.textClass}`}>
                <ShoppingBag className="h-5 w-5 opacity-70" />
                {viewMode === "edit" ? "Shopping List" : "Price Comparison"}
              </CardTitle>
              
              {viewMode === "edit" ? (
                <Button 
                  onClick={handleCompareClick} 
                  disabled={shoppingList.length === 0 || comparisonLoading}
                  className={styles.buttonClass}
                >
                  {comparisonLoading ? (
                    <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating... </>
                  ) : (
                    <> Compare Prices <ArrowRight className="ml-2 h-4 w-4" /> </>
                  )}
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  onClick={() => setViewMode("edit")}
                  className={styles.buttonOutlineClass}
                >
                  <Edit2 className="mr-2 h-4 w-4" /> Edit List
                </Button>
              )}
            </CardHeader>
            
            <CardContent className="p-0">
              {viewMode === "edit" ? (
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
                    onAddItem={handleDirectAdd}
                    onAddRecipe={handleAddRecipe}
                    
                    // Styles
                    cardBgClass="shadow-none border-0 bg-transparent"
                    textClass={styles.textClass}
                    mutedTextClass={styles.mutedTextClass}
                    buttonClass={styles.buttonClass}
                    buttonOutlineClass={styles.buttonOutlineClass}
                    theme={styles.theme}
                  />
                  
                  {/* Quick Add Input */}
                  <div className="mt-6 pt-2">
                     <div className="flex items-center gap-2">
                        <Input
                          value={newItemInput}
                          onChange={(e) => setNewItemInput(e.target.value)}
                          placeholder="Add custom item..."
                          onKeyDown={(e) => e.key === 'Enter' && handleCustomInputSubmit()}
                          className={styles.inputClass}
                        />
                        <Button 
                          onClick={handleCustomInputSubmit} 
                          className={styles.buttonClass} 
                          disabled={!newItemInput.trim()}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 pt-0">
                  {comparisonLoading ? (
                     <div className="text-center py-20">
                        <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-orange-500" />
                        <h3 className={`text-xl font-medium ${styles.textClass}`}>Scanning local stores...</h3>
                     </div>
                  ) : (
                    <StoreComparisonSection
                      comparisonLoading={comparisonLoading}
                      massSearchResults={massSearchResults}
                      carouselIndex={carouselIndex}
                      onCarouselNext={nextStore}
                      onCarouselPrev={prevStore}
                      onStoreSelect={scrollToStore}
                      onScroll={handleScroll}
                      carouselRef={carouselRef}
                      onReloadItem={handleReloadRequest}
                      zipCode={zipCode}
                      {...styles}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

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