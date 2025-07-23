"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Filter, Plus } from "lucide-react"
import { RecipeCard } from "@/components/recipe-card"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { DatabaseSetupNotice } from "@/components/database-setup-notice"

export default function RecipesPage() {
  const [recipes, setRecipes] = useState([])
  const [filteredRecipes, setFilteredRecipes] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [selectedCuisine, setSelectedCuisine] = useState("all")
  const [selectedDiet, setSelectedDiet] = useState("all")
  const [sortBy, setSortBy] = useState("created_at")
  const [loading, setLoading] = useState(true)

  const { user } = useAuth()

  useEffect(() => {
    fetchRecipes()
  }, [])

  useEffect(() => {
    filterRecipes()
  }, [recipes, searchTerm, selectedDifficulty, selectedCuisine, selectedDiet, sortBy])

  const fetchRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select(`
        *,
        profiles (
          full_name,
          avatar_url
        )
      `)
        .order("created_at", { ascending: false })

      if (error) {
        console.warn("Database not set up yet:", error.message)
        setRecipes([])
        return
      }

      setRecipes(data || [])
    } catch (error) {
      console.error("Error fetching recipes:", error)
      setRecipes([])
    } finally {
      setLoading(false)
    }
  }

  const filterRecipes = () => {
    let filtered = [...recipes]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (recipe) =>
          recipe.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          recipe.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          recipe.cuisine_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          recipe.dietary_tags?.some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase())) ||
          recipe.ingredients?.some((ingredient: any) =>
            ingredient.name?.toLowerCase().includes(searchTerm.toLowerCase()),
          ),
      )
    }

    // Difficulty filter
    if (selectedDifficulty !== "all") {
      filtered = filtered.filter((recipe) => recipe.difficulty === selectedDifficulty)
    }

    // Cuisine filter
    if (selectedCuisine !== "all") {
      filtered = filtered.filter((recipe) => recipe.cuisine_type === selectedCuisine)
    }

    // Diet filter
    if (selectedDiet !== "all") {
      filtered = filtered.filter((recipe) => recipe.dietary_tags?.includes(selectedDiet))
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "rating":
          return (b.rating_avg || 0) - (a.rating_avg || 0)
        case "prep_time":
          return (a.prep_time || 0) - (b.prep_time || 0)
        case "title":
          return a.title.localeCompare(b.title)
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

    setFilteredRecipes(filtered)
  }

  const cuisineTypes = [...new Set(recipes.map((r) => r.cuisine_type).filter(Boolean))]
  const dietaryTags = [...new Set(recipes.flatMap((r) => r.dietary_tags || []))]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Hero Search Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Find Your Perfect Recipe</h1>
          <p className="text-xl text-gray-600 mb-8">Search through thousands of delicious recipes</p>

          <div className="relative max-w-2xl mx-auto mb-8">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              placeholder="Search by recipe name, ingredient, cuisine, or dietary preference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 py-4 text-lg rounded-full border-gray-200 shadow-sm"
            />
          </div>

          {user && (
            <Button asChild className="bg-orange-500 hover:bg-orange-600">
              <Link href="/recipes/upload">
                <Plus className="h-4 w-4 mr-2" />
                Share Your Recipe
              </Link>
            </Button>
          )}
        </div>

        {/* Advanced Filters */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                <SelectTrigger>
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedCuisine} onValueChange={setSelectedCuisine}>
                <SelectTrigger>
                  <SelectValue placeholder="Cuisine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cuisines</SelectItem>
                  {cuisineTypes.map((cuisine) => (
                    <SelectItem key={cuisine} value={cuisine}>
                      {cuisine}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedDiet} onValueChange={setSelectedDiet}>
                <SelectTrigger>
                  <SelectValue placeholder="Diet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Diets</SelectItem>
                  {dietaryTags.map((diet) => (
                    <SelectItem key={diet} value={diet}>
                      {diet}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Newest</SelectItem>
                  <SelectItem value="rating">Highest Rated</SelectItem>
                  <SelectItem value="prep_time">Quickest</SelectItem>
                  <SelectItem value="title">Alphabetical</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("")
                  setSelectedDifficulty("all")
                  setSelectedCuisine("all")
                  setSelectedDiet("all")
                }}
                className="bg-transparent"
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="mb-6">
          <p className="text-gray-600">
            {searchTerm && `Search results for "${searchTerm}" - `}
            Showing {filteredRecipes.length} of {recipes.length} recipes
          </p>
        </div>

        {filteredRecipes.length === 0 ? (
          <div className="space-y-6">
            {recipes.length === 0 && <DatabaseSetupNotice />}
            <Card>
              <CardContent className="p-12 text-center">
                <Filter className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {recipes.length === 0 ? "No recipes in database" : "No recipes found"}
                </h3>
                <p className="text-gray-600 mb-6">
                  {recipes.length === 0
                    ? "Set up your database to see recipes"
                    : searchTerm
                      ? `No recipes match "${searchTerm}". Try a different search term or adjust your filters.`
                      : "Try adjusting your filters"}
                </p>
                {recipes.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm("")
                      setSelectedDifficulty("all")
                      setSelectedCuisine("all")
                      setSelectedDiet("all")
                    }}
                  >
                    Clear All Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map((recipe: any) => (
              <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                <RecipeCard
                  id={recipe.id}
                  title={recipe.title}
                  image={recipe.image_url}
                  rating={recipe.rating_avg || 0}
                  difficulty={recipe.difficulty}
                  comments={recipe.rating_count || 0}
                  tags={recipe.dietary_tags || []}
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
