"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, Loader2, ShoppingBasket, ChefHat } from "lucide-react"
import { useRecipes } from "@/hooks/use-recipes"

interface RecipeSearchModalProps {
  user?: any
  zipCode?: string
  onAddItem: (name: string) => void
  onAddRecipe: (id: string, title: string, ingredients: any[]) => void
  styles?: any
}

// Renamed to match the import in ShoppingListSection
export function RecipeSearchModal({ 
  onAddItem, 
  onAddRecipe, 
  styles 
}: RecipeSearchModalProps) {
  
  const [manualItem, setManualItem] = useState("")
  const [query, setQuery] = useState("")
  
  const { data: allRecipes = [], isLoading } = useRecipes("title")

  const displayItems = useMemo(() => {
    const trimmedQuery = query.toLowerCase().trim()

    if (!trimmedQuery) {
      return allRecipes.slice(0, 6) 
    }

    return allRecipes
      .filter((recipe: any) => 
        recipe.title.toLowerCase().includes(trimmedQuery) ||
        recipe.ingredients?.some((ing: any) => ing.name?.toLowerCase().includes(trimmedQuery))
      )
      .slice(0, 6)
  }, [query, allRecipes])

  const handleManualAdd = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!manualItem.trim()) return
    onAddItem(manualItem.trim())
    setManualItem("") 
  }

  return (
    <div className="space-y-6 py-2">
      {/* SECTION 1: Quick Add Single Item */}
      <div className="space-y-3">
        <h3 className={`text-sm font-medium ${styles?.mutedTextClass || "text-gray-500"}`}>
            Quick Add Item
        </h3>
        <form onSubmit={handleManualAdd} className="flex gap-2">
          <div className="relative flex-1">
            <ShoppingBasket className={`absolute left-2.5 top-2.5 h-4 w-4 ${styles?.mutedTextClass || "text-gray-400"}`} />
            <Input
              placeholder="e.g. Milk, Eggs, Bread..."
              className={`pl-9 ${styles?.inputClass}`}
              value={manualItem}
              onChange={(e) => setManualItem(e.target.value)}
              autoFocus 
            />
          </div>
          <Button 
            type="submit" 
            disabled={!manualItem.trim()}
            className={styles?.buttonClass}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </form>
      </div>

      <div className={`h-px ${styles?.theme === 'dark' ? 'bg-[#e8dcc4]/20' : 'bg-gray-200'}`} />

      {/* SECTION 2: Add from Recipe */}
      <div className="space-y-3">
        <h3 className={`text-sm font-medium flex items-center gap-2 ${styles?.mutedTextClass || "text-gray-500"}`}>
            <ChefHat className="h-4 w-4" />
            Or Add Ingredients from Recipe
        </h3>
        
        <div className="relative">
            <Search className={`absolute left-2.5 top-2.5 h-4 w-4 ${styles?.mutedTextClass || "text-gray-400"}`} />
            <Input
              placeholder="Search recipes..."
              className={`pl-9 ${styles?.inputClass}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
          {isLoading ? (
             <div className="col-span-full flex justify-center py-8">
               <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
             </div>
          ) : displayItems.length > 0 ? (
            displayItems.map((recipe: any) => (
              <div 
                key={recipe.id} 
                className={`group relative border rounded-lg p-3 transition-colors cursor-pointer flex flex-col justify-between h-28 
                  ${styles?.theme === 'dark' 
                    ? 'border-[#e8dcc4]/20 hover:bg-[#e8dcc4]/5' 
                    : 'border-gray-200 hover:bg-gray-50'}`}
                onClick={() => {
                  onAddRecipe(recipe.id, recipe.title, recipe.ingredients || [])
                }}
              >
                <div>
                  <h4 className={`font-semibold text-sm line-clamp-2 leading-tight ${styles?.textClass}`}>
                    {recipe.title}
                  </h4>
                  <p className={`text-xs mt-1 ${styles?.mutedTextClass}`}>
                    {recipe.ingredients?.length || 0} ingredients
                  </p>
                </div>
                
                <div className="flex items-center text-xs font-medium text-green-600 dark:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus className="h-3 w-3 mr-1" /> Add All
                </div>
              </div>
            ))
          ) : (
            <div className={`col-span-full text-center text-sm py-4 ${styles?.mutedTextClass}`}>
              No recipes found for "{query}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}