"use client"

import { useState, useEffect } from "react"
import { searchGroceryStores } from "@/lib/grocery-scrapers"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Loader2, ShoppingBag, Plus, ChefHat } from "lucide-react"
import type { GroceryItem, Recipe } from "@/lib/types/store"

interface SearchAndAddProps {
  user: any
  zipCode: string
  onAddItem: (name: string) => void
  onAddRecipe: (id: string, title: string, ingredients: any[]) => void
  styles: any
}

export function SearchAndAddSection({ user, zipCode, onAddItem, onAddRecipe, styles }: SearchAndAddProps) {
  const { toast } = useToast()
  
  const [searchMode, setSearchMode] = useState<"item" | "recipe">("item")
  const [searchTerm, setSearchTerm] = useState("")
  const [itemSearchResults, setItemSearchResults] = useState<GroceryItem[]>([])
  const [isSearchingItems, setIsSearchingItems] = useState(false)
  const [recipes, setRecipes] = useState<Recipe[]>([])

  // Fetch recipes internally since only this component uses them
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

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    if (searchMode === "item") {
      if (!zipCode) {
        toast({ title: "Location needed", description: "Please update your address in Settings.", variant: "destructive" })
        return
      }
      setIsSearchingItems(true)
      try {
        const results = await searchGroceryStores(searchTerm, zipCode)
        setItemSearchResults(results.flatMap(r => r.items || []))
      } catch (e) {
        toast({ title: "Search failed", variant: "destructive" })
      } finally {
        setIsSearchingItems(false)
      }
    }
  }

  const filteredRecipes = recipes.filter(r => r.title.toLowerCase().includes(searchTerm.toLowerCase()))
  const displayedRecipes = searchTerm ? filteredRecipes : filteredRecipes.slice(0, 9)

  return (
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
          <TabsList className={`grid w-full grid-cols-2 mb-4 ${styles.theme === "dark" ? "bg-[#181813]" : "bg-gray-100"}`}>
            <TabsTrigger value="item">Grocery Items</TabsTrigger>
            <TabsTrigger value="recipe">My Recipes</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={searchMode === "item" ? "Search items..." : "Search recipes..."}
              className={`flex-1 ${styles.theme === "dark" ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}`}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {itemSearchResults.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className={`flex items-center gap-3 p-3 rounded-lg border ${styles.theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-200"}`}>
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
                    size="sm" variant="outline" className={styles.buttonOutlineClass}
                    onClick={() => {
                      onAddItem(item.title)
                      toast({ title: "Added", description: `${item.title} added.`})
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {itemSearchResults.length === 0 && !isSearchingItems && (
                <div className={`col-span-full text-center py-4 ${styles.mutedTextClass}`}>
                   Enter an item name to find prices.
                </div>
              )}
            </div>
          )}

          {searchMode === "recipe" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedRecipes.map(recipe => (
                <div 
                  key={recipe.id} 
                  className={`p-4 border rounded-lg cursor-pointer transition-colors hover:opacity-80 ${styles.theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-200"}`}
                  onClick={() => {
                    onAddRecipe(recipe.id, recipe.title, recipe.ingredients)
                    setSearchTerm("")
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${styles.theme === "dark" ? "bg-[#e8dcc4]/10" : "bg-orange-100"}`}>
                      <ChefHat className={`h-5 w-5 ${styles.theme === "dark" ? "text-[#e8dcc4]" : "text-orange-600"}`} />
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
  )
}