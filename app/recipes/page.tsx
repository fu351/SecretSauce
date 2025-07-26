"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Grid, List, Clock, Users, ChefHat, Star, MessageCircle, BarChart3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { DatabaseSetupNotice } from "@/components/database-setup-notice"

interface Recipe {
  id: string
  title: string
  description: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: string
  cuisine_type: string
  image_url: string
  dietary_tags: string[]
  ingredients: any[]
  instructions: string[]
  author_id: string
  created_at: string
  rating_avg: number
  rating_count: number
  nutrition?: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  }
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCuisine, setSelectedCuisine] = useState("all")
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [selectedDiet, setSelectedDiet] = useState("all")
  const [sortBy, setSortBy] = useState("created_at")
  const [viewMode, setViewMode] = useState<"tile" | "details">("tile")
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    fetchRecipes()
  }, [])

  useEffect(() => {
    filterRecipes()
  }, [recipes, searchTerm, selectedCuisine, selectedDifficulty, selectedDiet, sortBy])

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

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case "beginner":
        return "bg-green-100 text-green-800"
      case "intermediate":
        return "bg-yellow-100 text-yellow-800"
      case "advanced":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

          <div className="flex items-center justify-center gap-2 mb-8">
            <Button
              variant={viewMode === "tile" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("tile")}
              className={viewMode === "tile" ? "bg-orange-500 hover:bg-orange-600" : ""}
            >
              <Grid className="h-4 w-4 mr-1" />
              Tiles
            </Button>
            <Button
              variant={viewMode === "details" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("details")}
              className={viewMode === "details" ? "bg-orange-500 hover:bg-orange-600" : ""}
            >
              <List className="h-4 w-4 mr-1" />
              Details
            </Button>
          </div>
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
                <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
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
        ) : viewMode === "tile" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map((recipe: Recipe) => (
              <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                <div className="relative group cursor-pointer">
                  <div className="relative overflow-hidden rounded-2xl aspect-[4/3] bg-gray-200">
                    <img
                      src={recipe.image_url || "/placeholder.svg?height=300&width=400"}
                      alt={recipe.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                    {/* Hover overlay with recipe details */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all duration-300 flex items-center justify-center">
                      <div className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-center p-4">
                        <p className="text-sm mb-2 line-clamp-3">{recipe.description}</p>
                        {recipe.nutrition && (
                          <div className="text-xs space-y-1">
                            {recipe.nutrition.calories && <div>Calories: {recipe.nutrition.calories}</div>}
                            <div className="flex justify-center gap-4">
                              {recipe.nutrition.protein && <span>Protein: {recipe.nutrition.protein}g</span>}
                              {recipe.nutrition.carbs && <span>Carbs: {recipe.nutrition.carbs}g</span>}
                              {recipe.nutrition.fat && <span>Fat: {recipe.nutrition.fat}g</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Top tags */}
                    <div className="absolute top-4 right-4 flex flex-wrap gap-2 justify-end">
                      {recipe.dietary_tags?.slice(0, 2).map((tag, index) => (
                        <Badge key={index} variant="secondary" className="bg-white/90 text-gray-800 hover:bg-white">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    {/* Bottom content */}
                    <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">
                      <h3 className="text-xl font-bold mb-3 leading-tight">{recipe.title}</h3>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-semibold">{(recipe.rating_avg || 0).toFixed(1)}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <MessageCircle className="h-4 w-4" />
                            <span>{recipe.rating_count || 0} reviews</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />
                          <Badge className={getDifficultyColor(recipe.difficulty)}>{recipe.difficulty}</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRecipes.map((recipe: Recipe) => (
              <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                <Card className="group cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex gap-6">
                      <img
                        src={recipe.image_url || "/placeholder.svg?height=120&width=120"}
                        alt={recipe.title}
                        className="w-32 h-32 object-cover rounded-lg flex-shrink-0"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-xl group-hover:text-orange-600 transition-colors">
                            {recipe.title}
                          </h3>
                          <Badge className={getDifficultyColor(recipe.difficulty)}>{recipe.difficulty}</Badge>
                        </div>
                        <p className="text-gray-600 mb-4 line-clamp-2">{recipe.description}</p>
                        <div className="flex items-center gap-6 text-sm text-gray-600 mb-4">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>Prep: {recipe.prep_time || 0}min</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>Cook: {recipe.cook_time || 0}min</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>Serves {recipe.servings}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span>
                              {(recipe.rating_avg || 0).toFixed(1)} ({recipe.rating_count || 0})
                            </span>
                          </div>
                        </div>
                        {recipe.dietary_tags && recipe.dietary_tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {recipe.dietary_tags.map((tag, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
