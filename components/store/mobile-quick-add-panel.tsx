"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Search, ChefHat, X } from "lucide-react"
import { RecipeSearchModal } from "@/components/recipe/detail/recipe-recommendation-modal"
import { RecipeDetailModal } from "@/components/recipe/detail/recipe-detail-modal"
import { recipeDB } from "@/lib/database/recipe-db"
import type { ShoppingListIngredient as ShoppingListItem } from "@/lib/types/store"
import type { Recipe } from "@/lib/types"

interface MobileQuickAddPanelProps {
  shoppingList: ShoppingListItem[]
  onAddItem: (name: string) => Promise<void>
  onAddRecipe: (recipeId: string, title: string, servings?: number) => Promise<void>
  onRemoveRecipe?: (recipeId: string) => void
  theme?: "light" | "dark"
  textClass?: string
  mutedTextClass?: string
  cardBgClass?: string
}

type RecipeChip = {
  id: string
  title: string
  servings: number
}

type RecipeDetail = {
  title: string
  imageUrl: string | null
}

export function MobileQuickAddPanel({
  shoppingList,
  onAddItem,
  onAddRecipe,
  onRemoveRecipe,
  theme = "light",
  textClass = "text-gray-900",
  mutedTextClass = "text-gray-500",
  cardBgClass = "bg-white",
}: MobileQuickAddPanelProps) {
  const [inputValue, setInputValue] = useState("")
  const [showRecipeModal, setShowRecipeModal] = useState(false)
  const [recipeDetailsById, setRecipeDetailsById] = useState<Record<string, RecipeDetail>>({})
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)

  const recipesInCart = useMemo<RecipeChip[]>(() => {
    const map = new Map<string, RecipeChip>()

    shoppingList.forEach((item) => {
      const recipeId = item.recipe_id
      if (!recipeId) return
      if (map.has(recipeId)) return

      map.set(recipeId, {
        id: recipeId,
        title: item.recipe_title || "Recipe",
        servings: Math.max(1, item.servings || 1),
      })
    })

    return Array.from(map.values())
  }, [shoppingList])

  useEffect(() => {
    let cancelled = false

    const loadRecipeDetails = async () => {
      if (recipesInCart.length === 0) {
        setRecipeDetailsById({})
        return
      }

      const recipeIds = recipesInCart.map((recipe) => recipe.id)
      const recipes = await recipeDB.fetchRecipeByIds(recipeIds)
      if (cancelled) return

      const details: Record<string, RecipeDetail> = {}
      recipes.forEach((recipe) => {
        details[recipe.id] = {
          title: recipe.title || "Recipe",
          imageUrl: recipe.content?.image_url || recipe.image_url || null,
        }
      })

      setRecipeDetailsById(details)
    }

    void loadRecipeDetails()
    return () => {
      cancelled = true
    }
  }, [recipesInCart])

  const handleSubmit = useCallback(async () => {
    const value = inputValue.trim()
    if (!value) return
    await onAddItem(value)
    setInputValue("")
  }, [inputValue, onAddItem])

  const handleRecipeClick = useCallback((recipeId: string) => {
    setSelectedRecipeId(recipeId)
  }, [])

  const handleCloseRecipeModal = useCallback(() => {
    setSelectedRecipeId(null)
  }, [])

  const handleAddToCart = useCallback(async (recipe: Recipe, servings: number) => {
    await onAddRecipe(recipe.id, recipe.title, servings)
  }, [onAddRecipe])

  return (
    <div className="space-y-3 md:hidden">
      <div className="space-y-1.5">
        <div>
          <p className={`text-xs font-semibold ${textClass}`}>Recipes In Cart</p>
        </div>

        <div className="flex gap-2 overflow-x-hidden">
          {/* Scrollable recipe cards */}
          <div className="flex-1 overflow-x-auto snap-x snap-mandatory scrollbar-hide">
            <div className="flex gap-2">
              {recipesInCart.map((recipe) => {
                const details = recipeDetailsById[recipe.id]
                const recipeTitle = details?.title || recipe.title
                const imageUrl = details?.imageUrl

                return (
                  <div
                    key={recipe.id}
                    onClick={() => handleRecipeClick(recipe.id)}
                    className={`snap-start shrink-0 w-[109px] rounded-lg border overflow-hidden relative cursor-pointer ${
                      theme === "dark"
                        ? "border-[#e8dcc4]/15 bg-[#181813] hover:bg-[#2a2924]"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    {/* Remove button */}
                    {onRemoveRecipe && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveRecipe(recipe.id)
                        }}
                        className={`absolute top-1 right-1 z-10 w-5 h-5 rounded-full flex items-center justify-center ${
                          theme === "dark"
                            ? "bg-[#181813]/80 hover:bg-[#181813] text-[#e8dcc4]"
                            : "bg-white/80 hover:bg-white text-gray-900"
                        } shadow-sm border ${
                          theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-300"
                        }`}
                        aria-label="Remove recipe"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}

                    <div className={`h-16 ${
                      imageUrl
                        ? ""
                        : theme === "dark" ? "bg-[#2a2924]" : "bg-gray-100"
                    }`}>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={recipeTitle}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <ChefHat className={`h-4 w-4 ${mutedTextClass}`} />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className={`text-[10px] font-medium leading-tight line-clamp-2 ${textClass}`}>{recipeTitle}</p>
                      <p className={`text-[9px] mt-0.5 ${mutedTextClass}`}>{recipe.servings} servings</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Static + Add Recipe button */}
          <button
            type="button"
            onClick={() => setShowRecipeModal(true)}
            className={`shrink-0 w-[109px] h-[106px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 ${
              theme === "dark"
                ? "border-[#e8dcc4]/25 bg-[#181813] text-[#e8dcc4]"
                : "border-gray-300 bg-gray-50 text-gray-700"
            }`}
            aria-label="Open recipe suggestions"
            data-tutorial="store-add-recipe"
          >
            <Plus className="h-6 w-6" />
            <p className="text-[10px] font-semibold">Add Recipe</p>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2" data-tutorial="store-add">
        <div className="relative flex-1">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${mutedTextClass}`} />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit()
            }}
            placeholder="Add custom item..."
            className={`h-10 pl-9 ${theme === "dark"
              ? "bg-[#181813] border-[#e8dcc4]/25 text-[#e8dcc4]"
              : "bg-gray-50 border-gray-200 text-gray-900"
            }`}
          />
        </div>
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!inputValue.trim()}
          className="h-10 w-10 p-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showRecipeModal && (
        <RecipeSearchModal
          shoppingItems={shoppingList}
          onAddRecipe={onAddRecipe}
          theme={theme}
          cardBgClass={cardBgClass}
          textClass={textClass}
          mutedTextClass={mutedTextClass}
          isOpen={showRecipeModal}
          onClose={() => setShowRecipeModal(false)}
        />
      )}

      <RecipeDetailModal
        recipeId={selectedRecipeId}
        onClose={handleCloseRecipeModal}
        onAddToCart={handleAddToCart}
        textClass={textClass}
        mutedTextClass={mutedTextClass}
        buttonClass={theme === "dark" ? "bg-[#e8dcc4] hover:bg-[#d4c8b0] text-[#181813]" : "bg-orange-500 hover:bg-orange-600 text-white"}
        theme={theme}
        bgClass={theme === "dark" ? "bg-[#1f1e1a]" : "bg-white"}
      />
    </div>
  )
}
