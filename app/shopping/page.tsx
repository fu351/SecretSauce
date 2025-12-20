"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"

// Contexts & Libs
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { searchGroceryStores } from "@/lib/grocery-scrapers"

// Hooks
import { useShoppingList } from "./hooks/useShoppingList"
import { useStoreComparison } from "./hooks/useStoreComparison"

// Components
import { StoreComparisonSection } from "./components/StoreComparisonSection"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChefHat, Search, ShoppingBag, Loader2, Plus, Minus, X, Check, ArrowRight, Edit2 } from "lucide-react"

// Types
import type { GroceryItem, Recipe } from "./components/store-types"

const DEFAULT_SHOPPING_ZIP = ""

export default function ShoppingPage() {
  const { user, loading: authLoading } = useAuth()
  const { theme } = useTheme()
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const [mounted, setMounted] = useState(false)
  const [zipCode, setZipCode] = useState(DEFAULT_SHOPPING_ZIP)
  
  const {
    items: shoppingList,
    loading: listLoading,
    addItem,
    updateQuantity,
    removeItem: removeFromShoppingList,
    toggleChecked,
    addRecipeIngredients,
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
      replaceItemForStore // <--- New helper
    } = useStoreComparison(shoppingList, zipCode, null)

  const [viewMode, setViewMode] = useState<"edit" | "compare">("edit")
  const [searchMode, setSearchMode] = useState<"item" | "recipe">("item")
  const [searchTerm, setSearchTerm] = useState("")
  const [itemSearchResults, setItemSearchResults] = useState<GroceryItem[]>([])
  const [isSearchingItems, setIsSearchingItems] = useState(false)
  const [newItemInput, setNewItemInput] = useState("")
  const [recipes, setRecipes] = useState<Recipe[]>([])
  
  // -- RELOAD / SWAP STATE --
  const [reloadModalOpen, setReloadModalOpen] = useState(false)
  const [reloadTerm, setReloadTerm] = useState("")
  const [reloadResults, setReloadResults] = useState<GroceryItem[]>([])
  const [reloadLoading, setReloadLoading] = useState(false)
  
  const [reloadTarget, setReloadTarget] = useState<{ 
    term: string; 
    store: string; 
    shoppingListId?: string; 
  } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

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
    if (!user) return
    const fetchRecipes = async () => {
      const { data } = await supabase
        .from("recipes")
        .select("id, title, ingredients")
        .eq("author_id", user.id)
      if (data) setRecipes(data)
    }
    fetchRecipes()
  }, [user])

  useEffect(() => {
    if (mounted && searchParams.get("expandList") === "true") {
      document.querySelector("[data-shopping-list]")?.scrollIntoView({ behavior: "smooth" })
    }
  }, [searchParams, mounted])

  // --- Handlers ---

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    if (searchMode === "item") {
      if (!zipCode) {
        toast({ title: "Location needed", description: "Please update your address in Settings to search prices.", variant: "destructive" })
        return
      }
      setIsSearchingItems(true)
      try {
        const results = await searchGroceryStores(searchTerm, zipCode)
        const flat = results.flatMap(r => r.items || [])
        setItemSearchResults(flat)
      } catch (e) {
        toast({ title: "Search failed", variant: "destructive" })
      } finally {
        setIsSearchingItems(false)
      }
    }
  }

  const handleAddCustomItem = () => {
    if (newItemInput.trim()) {
      addItem(newItemInput)
      setNewItemInput("")
    }
  }

  const handleCompareClick = () => {
    if (shoppingList.length === 0) return
    setViewMode("compare")
    performMassSearch()
  }

  // --- SWAP / MISSING ITEM HANDLERS ---

  const handleReloadRequest = ({ 
    term, 
    store, 
    shoppingListId 
  }: { 
    term: string; 
    store: string; 
    shoppingListId: string 
  }) => {
    setReloadTarget({ term, store, shoppingListId })
    setReloadTerm(term)
    setReloadResults([])
    setReloadModalOpen(true)
    performReloadSearch(term, store)
  }

  const performReloadSearch = async (term: string, store?: string) => {
    if (!term) return
    setReloadLoading(true)
    try {
      const results = await searchGroceryStores(term, zipCode, store)
      setReloadResults(results.flatMap(r => r.items || []))
    } catch (e) {
      console.error(e)
      toast({ title: "Search failed", variant: "destructive" })
    } finally {
      setReloadLoading(false)
    }
  }

  const handleSelectReplacement = (newItem: GroceryItem) => {
    if (reloadTarget?.shoppingListId && reloadTarget.store) {
      
      // CRITICAL FIX: We do NOT delete/add to the database anymore.
      // We only patch the local comparison state for THIS store.
      replaceItemForStore(
        reloadTarget.store,        // Target specific store
        reloadTarget.shoppingListId, // Target specific item row
        newItem                    // The new data to swap in
      )

      toast({ title: "Item Updated", description: `Updated for ${reloadTarget.store}` })
    }

    setReloadModalOpen(false)
  }

  // --- Render Helpers ---

  const filteredRecipes = recipes.filter(r => r.title.toLowerCase().includes(searchTerm.toLowerCase()))
  const displayedRecipes = searchTerm ? filteredRecipes : filteredRecipes.slice(0, 9)

  const isDark = (mounted ? theme : "light") === "dark"
  
  const styles = {
    bgClass: isDark ? "bg-[#181813]" : "bg-gray-50",
    cardBgClass: isDark ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white",
    textClass: isDark ? "text-[#e8dcc4]" : "text-gray-900",
    mutedTextClass: isDark ? "text-[#e8dcc4]/70" : "text-gray-600",
    buttonClass: isDark 
      ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]" 
      : "bg-orange-500 hover:bg-orange-600 text-white",
    buttonOutlineClass: isDark
      ? "border-[#e8dcc4]/40 text-[#e8dcc4] hover:bg-[#e8dcc4]/10"
      : "border-gray-300 hover:bg-gray-100",
    theme: isDark ? "dark" : "light" as "light" | "dark"
  }

  if (!mounted) return <div className={`min-h-screen ${styles.bgClass}`} />

  return (
    <div className={`min-h-screen ${styles.bgClass} p-6`}>
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className={`text-3xl font-serif font-light ${styles.textClass} mb-2`}>
              Shopping & Price Search
            </h1>
            <p className={styles.mutedTextClass}>
              Find the best prices nearby ({zipCode || "Location not set"})
            </p>
          </div>
          {!zipCode && (
            <div className="text-sm text-amber-500">
              Please set your location in Settings to enable price search.
            </div>
          )}
        </div>

        {/* Search & Add Card */}
        <Card className={styles.cardBgClass}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${styles.textClass}`}>
              <Search className="h-5 w-5" />
              Search to Add
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs 
              value={searchMode} 
              onValueChange={(val) => {
                setSearchMode(val as "item" | "recipe")
                setSearchTerm("")
                setItemSearchResults([])
              }}
              className="w-full"
            >
              <TabsList className={`grid w-full grid-cols-2 mb-4 ${isDark ? "bg-[#181813]" : "bg-gray-100"}`}>
                <TabsTrigger value="item">Grocery Items</TabsTrigger>
                <TabsTrigger value="recipe">My Recipes</TabsTrigger>
              </TabsList>

              <div className="flex gap-2">
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder={searchMode === "item" ? "Search for apples, milk, bread..." : "Search your recipes..."}
                  className={`flex-1 ${isDark ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}`}
                />
                {searchMode === "item" && (
                  <Button onClick={handleSearch} disabled={isSearchingItems || !searchTerm.trim()} className={styles.buttonClass}>
                    {isSearchingItems ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                  </Button>
                )}
              </div>
            </Tabs>

            <div className="min-h-[100px]">
              {searchMode === "item" && (
                <>
                  {itemSearchResults.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {itemSearchResults.map((item, idx) => (
                        <div key={`${item.id}-${idx}`} className={`flex items-center gap-3 p-3 rounded-lg border ${isDark ? "border-[#e8dcc4]/20" : "border-gray-200"}`}>
                          <div className="w-12 h-12 flex-shrink-0 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.title} className="w-full h-full object-contain" />
                            ) : (
                              <ShoppingBag className="h-6 w-6 text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${styles.textClass}`}>{item.title}</p>
                            <p className={`text-xs ${styles.mutedTextClass}`}>{item.provider} • ${item.price.toFixed(2)}</p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              addItem(item.title)
                              setSearchTerm("")
                              setItemSearchResults([])
                              toast({ title: "Added", description: `${item.title} added to list.`})
                            }}
                            className={styles.buttonOutlineClass}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`text-center py-4 ${styles.mutedTextClass}`}>
                       {isSearchingItems ? "Searching..." : "Enter an item name above to find prices and add to your list."}
                    </div>
                  )}
                </>
              )}

              {searchMode === "recipe" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedRecipes.map(recipe => (
                    <div 
                      key={recipe.id} 
                      className={`p-4 border rounded-lg cursor-pointer transition-colors hover:opacity-80 ${isDark ? "border-[#e8dcc4]/20" : "border-gray-200"}`}
                      onClick={() => {
                        addRecipeIngredients(recipe.id, recipe.ingredients)
                        setSearchTerm("")
                        toast({ title: "Recipe Added", description: `Added ingredients for ${recipe.title}`})
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${isDark ? "bg-[#e8dcc4]/10" : "bg-orange-100"}`}>
                          <ChefHat className={`h-5 w-5 ${isDark ? "text-[#e8dcc4]" : "text-orange-600"}`} />
                        </div>
                        <div>
                           <h3 className={`font-medium ${styles.textClass}`}>{recipe.title}</h3>
                           <p className={`text-xs ${styles.mutedTextClass}`}>{recipe.ingredients.length} ingredients</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* LIST & COMPARISON AREA */}
        <div data-shopping-list>
          <Card className={`${styles.cardBgClass} overflow-hidden`}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 dark:border-[#e8dcc4]/10 pb-4">
              <CardTitle className={`flex items-center gap-2 ${styles.textClass}`}>
                <ShoppingBag className="h-5 w-5" />
                {viewMode === "edit" ? "Shopping List" : "Price Comparison"}
              </CardTitle>
              
              {viewMode === "edit" ? (
                <Button 
                  onClick={handleCompareClick} 
                  disabled={shoppingList.length === 0 || comparisonLoading}
                  className={styles.buttonClass}
                >
                  {comparisonLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating...
                    </>
                  ) : (
                    <>
                      Compare Prices <ArrowRight className="ml-2 h-4 w-4" />
                    </>
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
              {viewMode === "edit" && (
                <div className="p-6 space-y-6">
                  <div className="flex items-center gap-2">
                    <Input
                      value={newItemInput}
                      onChange={(e) => setNewItemInput(e.target.value)}
                      placeholder="Add custom item..."
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCustomItem()}
                      className={isDark ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
                    />
                    <Button onClick={handleAddCustomItem} className={styles.buttonClass} disabled={!newItemInput.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {shoppingList.length === 0 ? (
                    <div className={`text-center py-12 border-2 border-dashed rounded-lg ${isDark ? "border-[#e8dcc4]/20" : "border-gray-200"}`}>
                      <p className={styles.mutedTextClass}>Your list is empty.</p>
                      <p className={`text-xs mt-1 ${styles.mutedTextClass}`}>Search items or recipes above to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shoppingList.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                            isDark 
                              ? item.checked 
                                ? "bg-[#181813]/50 border-[#e8dcc4]/10" 
                                : "bg-[#181813] border-[#e8dcc4]/20" 
                              : item.checked 
                                ? "bg-gray-50 border-gray-100" 
                                : "bg-white border-gray-200"
                          }`}
                        >
                          <button
                            onClick={() => toggleChecked(item.id)}
                            className={`flex-shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                              item.checked
                                ? "bg-green-500 border-green-500 text-white"
                                : isDark
                                  ? "border-[#e8dcc4]/40 hover:border-[#e8dcc4]"
                                  : "border-gray-300 hover:border-gray-400"
                            }`}
                          >
                            {item.checked && <Check className="h-3 w-3" />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <p className={`font-medium truncate transition-all ${item.checked ? "line-through opacity-50" : ""} ${styles.textClass}`}>
                              {item.name}
                            </p>
                            {item.recipeName && (
                              <p className={`text-xs ${styles.mutedTextClass} truncate`}>from {item.recipeName}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" onClick={() => updateQuantity(item.id, -1)} disabled={item.quantity <= 1} className={`h-8 w-8 ${styles.buttonOutlineClass}`}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className={`w-8 text-center text-sm ${styles.textClass}`}>{item.quantity}</span>
                            <Button size="icon" variant="ghost" onClick={() => updateQuantity(item.id, 1)} className={`h-8 w-8 ${styles.buttonOutlineClass}`}>
                              <Plus className="h-3 w-3" />
                            </Button>
                            <div className={`w-px h-4 mx-2 ${isDark ? "bg-[#e8dcc4]/20" : "bg-gray-200"}`} />
                            <Button size="icon" variant="ghost" onClick={() => removeFromShoppingList(item.id)} className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {viewMode === "compare" && (
                <div className="p-6">
                  {comparisonLoading ? (
                     <div className="text-center py-20">
                        <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-orange-500" />
                        <h3 className={`text-xl font-medium ${styles.textClass}`}>Scanning local stores...</h3>
                        <p className={styles.mutedTextClass}>Comparing prices for {shoppingList.length} items</p>
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

      <Dialog open={reloadModalOpen} onOpenChange={setReloadModalOpen}>
        <DialogContent className={`${styles.cardBgClass} max-w-3xl`}>
          <DialogHeader>
            <DialogTitle className={styles.textClass}>
              Replace: {reloadTarget?.term}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input 
                 value={reloadTerm} 
                 onChange={e => setReloadTerm(e.target.value)}
                 className={isDark ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
                 onKeyDown={(e) => e.key === 'Enter' && performReloadSearch(reloadTerm, reloadTarget?.store)}
              />
              <Button onClick={() => performReloadSearch(reloadTerm, reloadTarget?.store)}>Search</Button>
            </div>
            
            <div className="max-h-[300px] overflow-y-auto">
              {reloadLoading ? (
                <div className="p-4 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto"/>
                </div>
              ) : (
                <>
                  {reloadResults.length === 0 && (
                     <p className={`p-4 text-center ${styles.mutedTextClass}`}>No results found at {reloadTarget?.store}</p>
                  )}
                  {reloadResults.map((item, i) => (
                    <div key={i} className={`flex justify-between items-center p-2 border-b ${isDark ? "border-[#e8dcc4]/10" : ""}`}>
                       <div className="flex items-center gap-3">
                         {item.image_url && <img src={item.image_url} className="w-8 h-8 object-contain" />}
                         <div>
                           <div className={`font-medium ${styles.textClass}`}>{item.title}</div>
                           <div className={`text-xs ${styles.mutedTextClass}`}>{item.provider} - ${item.price.toFixed(2)}</div>
                         </div>
                       </div>
                       <Button size="sm" onClick={() => handleSelectReplacement(item)}>Select</Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}