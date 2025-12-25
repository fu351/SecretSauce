"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ChefHat, Search, X } from "lucide-react"
import { CompactRecipeCard } from "./compact-recipe-card"
import { QuickRecipePreviewModal } from "./quick-recipe-preview-modal"
import { useRecipes, type Recipe, useFavorites } from "@/hooks/use-recipes"
import { useAuth } from "@/contexts/auth-context"
import type { ShoppingListItem } from "@/lib/types/store"

interface RecipeRecommendationSidebarProps {
  shoppingItems: ShoppingListItem[]
  onAddRecipe: (recipeId: string, title: string, servings?: number) => Promise<void>
  theme?: "light" | "dark"
  cardBgClass?: string
  textClass?: string
  mutedTextClass?: string
  buttonClass?: string
  buttonOutlineClass?: string
}

export function RecipeRecommendationSidebar({
  shoppingItems,
  onAddRecipe,
  theme = "light",
  cardBgClass = "bg-white",
  textClass = "text-gray-900",
  mutedTextClass = "text-gray-500",
  buttonClass = "bg-orange-500 hover:bg-orange-600 text-white",
  buttonOutlineClass = "border border-gray-200 bg-white hover:bg-gray-50",
}: RecipeRecommendationSidebarProps) {
  const { user } = useAuth()
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch top-rated recipes using existing hook (same as recipe page)
  const { data: allRecipes = [], isLoading } = useRecipes("rating_avg")

  // Fetch user's favorites for personalized recommendations
  const { data: favoriteIds = new Set<string>() } = useFavorites(user?.id || null)

  // Smart recommendation scoring: personalize based on user preferences
  const scoredRecipes = useMemo(() => {
    return allRecipes.map((recipe) => {
      let score = recipe.rating_avg || 0

      // Boost recipes matching user's favorite tags/cuisines
      if (user && favoriteIds.size > 0) {
        const userLikedCuisines = new Set<string>()
        const userLikedTags = new Set<string>()

        // Infer liked cuisines and tags from favorites
        allRecipes.forEach((r) => {
          if (favoriteIds.has(r.id)) {
            if (r.cuisine) userLikedCuisines.add(r.cuisine.toLowerCase())
            r.dietary_tags?.forEach((tag: string) => {
              userLikedTags.add(tag.toLowerCase())
            })
          }
        })

        // Boost score if recipe matches user preferences
        if (recipe.cuisine && userLikedCuisines.has(recipe.cuisine.toLowerCase())) {
          score += 1.5
        }
        recipe.dietary_tags?.forEach((tag: string) => {
          if (userLikedTags.has(tag.toLowerCase())) {
            score += 0.5
          }
        })
      }

      return { recipe, score }
    })
  }, [allRecipes, user, favoriteIds])

  // Filter out recipes already in shopping list and apply search
  const recommendations = useMemo(() => {
    const shoppingRecipeIds = new Set(
      shoppingItems
        .filter((item) => item.recipe_id)
        .map((item) => item.recipe_id as string)
    )

    const filtered = scoredRecipes
      .filter(({ recipe }) => !shoppingRecipeIds.has(recipe.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ recipe }) => recipe)

    // Apply search filter
    if (!searchQuery.trim()) {
      return filtered
    }

    const query = searchQuery.toLowerCase()
    return filtered.filter((recipe) => {
      const matchesTitle = recipe.title?.toLowerCase().includes(query)
      const matchesCuisine = recipe.cuisine?.toLowerCase().includes(query)
      const matchesDifficulty = recipe.difficulty?.toLowerCase().includes(query)
      const matchesTags = recipe.dietary_tags?.some((tag: string) =>
        tag.toLowerCase().includes(query)
      )

      return matchesTitle || matchesCuisine || matchesDifficulty || matchesTags
    })
  }, [scoredRecipes, shoppingItems, searchQuery])

  const handleAddRecipe = async (recipe: Recipe) => {
    await onAddRecipe(recipe.id, recipe.title)
  }

  // Loading skeleton
  if (isLoading && recommendations.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="sticky top-0 z-10 p-4 border-b space-y-3" style={{
          backgroundColor: theme === "dark" ? "#1f1e1a" : "white",
          borderColor: theme === "dark" ? "#2a2924" : "#e5e7eb",
        }}>
          <h3 className={`font-semibold flex items-center gap-2 text-sm ${textClass}`}>
            <ChefHat className="h-5 w-5 opacity-70" />
            Recipe Suggestions
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={`h-24 rounded-lg animate-pulse ${
                theme === "dark" ? "bg-[#2a2924]" : "bg-gray-200"
              }`}
            ></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 p-4 border-b space-y-3" style={{
        backgroundColor: theme === "dark" ? "#1f1e1a" : "white",
        borderColor: theme === "dark" ? "#2a2924" : "#e5e7eb",
      }}>
        <h3 className={`font-semibold flex items-center gap-2 text-sm ${textClass}`}>
          <ChefHat className="h-5 w-5 opacity-70" />
          Recipe Suggestions
        </h3>

        {/* Search bar */}
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${mutedTextClass}`} />
          <Input
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`pl-9 pr-9 h-8 text-sm ${
              theme === "dark"
                ? "bg-[#281f1a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder-[#e8dcc4]/50"
                : "bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-500"
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${mutedTextClass} hover:opacity-70`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-3">
        {recommendations.length > 0 ? (
          recommendations.map((recipe) => (
            <CompactRecipeCard
              key={recipe.id}
              recipe={recipe}
              onAdd={handleAddRecipe}
              onPreview={setSelectedRecipeId}
              textClass={textClass}
              mutedTextClass={mutedTextClass}
              buttonClass={buttonClass}
              buttonOutlineClass={buttonOutlineClass}
            />
          ))
        ) : (
          <div className={`text-center py-8 ${mutedTextClass}`}>
            <ChefHat className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">
              {searchQuery ? "No matching recipes" : "No recipes available"}
            </p>
            <p className="text-xs mt-1">
              {searchQuery
                ? "Try a different search term"
                : "Browse recipes to add them to your list"}
            </p>
          </div>
        )}
      </div>

      {/* Preview modal */}
      <QuickRecipePreviewModal
        recipeId={selectedRecipeId}
        onClose={() => setSelectedRecipeId(null)}
        onAddToCart={async (recipe, servings) => {
          await onAddRecipe(recipe.id, recipe.title, servings)
        }}
        textClass={textClass}
        mutedTextClass={mutedTextClass}
        buttonClass={buttonClass}
      />
    </div>
  )
}
