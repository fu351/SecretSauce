"use client"

import { useState, useEffect } from "react"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { SearchFilters } from "@/components/shared/search-filters"
import { useRecipeDB } from "@/lib/database/recipe-db"
import { RecipeCard } from "@/components/recipe/cards/recipe-card"
import type { Recipe } from "@/lib/types"

export default function SearchPage() {
  const { searchRecipes, fetchRecipes } = useRecipeDB()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch recipes based on search query
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        let results: Recipe[]
        if (debouncedQuery.trim()) {
          results = await searchRecipes(debouncedQuery, { limit: 50 })
        } else {
          results = await fetchRecipes({ limit: 50, sortBy: "rating_avg" })
        }
        setRecipes(results)
      } catch (error) {
        console.error("Error fetching recipes:", error)
        setRecipes([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [debouncedQuery, searchRecipes, fetchRecipes])

  // Extract unique cuisines from recipes for filters
  const availableCuisines = Array.from(
    new Set(recipes.map(r => r.cuisine_name).filter(Boolean))
  ).sort() as string[]

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">Find Your Perfect Recipe</h1>

          <div className="relative max-w-2xl mx-auto mb-8">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recipes by name, ingredient, or cuisine..."
              className="pl-12 py-4 text-lg rounded-full border-gray-200 shadow-sm"
            />
          </div>

          <SearchFilters availableCuisines={availableCuisines} />
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        ) : recipes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                id={recipe.id}
                title={recipe.title}
                content={recipe.content}
                rating_avg={recipe.rating_avg || 0}
                difficulty={recipe.difficulty}
                comments={recipe.rating_count || 0}
                tags={recipe.tags}
                nutrition={recipe.nutrition}
                skipFavoriteCheck={false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">No recipes found</h2>
            <p className="text-gray-600">Try adjusting your search or filters to find what you're looking for.</p>
          </div>
        )}
      </div>
    </main>
  )
}
