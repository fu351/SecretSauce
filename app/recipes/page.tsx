"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Heart, Search, Upload, Grid, List, Clock, Users, Star, ChefHat, BarChart3 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { RecipeCard } from "@/components/recipe-card"
import { DatabaseSetupNotice } from "@/components/database-setup-notice"
import Image from "next/image"

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
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [selectedCuisine, setSelectedCuisine] = useState("all")
  const [selectedDiet, setSelectedDiet] = useState("all")
  const [sortBy, setSortBy] = useState("created_at")
  const [viewMode, setViewMode] = useState<"tile" | "details">("tile")
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  const { user } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlUpdateTimer = useRef<NodeJS.Timeout | null>(null)

  // Sync state with URL params (no fetching here)
  useEffect(() => {
    const urlSearch = searchParams.get("search") || ""
    const currentDifficulty = searchParams.get("difficulty") || "all"
    const currentCuisine = searchParams.get("cuisine") || "all"
    const currentDiet = searchParams.get("diet") || "all"
    const currentSort = searchParams.get("sort") || "created_at"

    setSearchTerm(urlSearch)
    setSelectedDifficulty(currentDifficulty)
    setSelectedCuisine(currentCuisine)
    setSelectedDiet(currentDiet)
    setSortBy(currentSort)
  }, [searchParams])

  // Fetch recipes on mount and when sort changes only
  useEffect(() => {
    fetchRecipes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy])

  // Load favorites when user becomes available
  useEffect(() => {
    if (user) fetchFavorites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    filterRecipes()
  }, [recipes, searchTerm, selectedDifficulty, selectedCuisine, selectedDiet, sortBy])

  const updateURL = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== "all") {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    })
    const nextUrl = `/recipes?${params.toString()}`
    if (urlUpdateTimer.current) clearTimeout(urlUpdateTimer.current)
    urlUpdateTimer.current = setTimeout(() => {
      router.replace(nextUrl)
    }, 300)
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    updateURL({ search: value })
  }

  const handleDifficultyChange = (value: string) => {
    setSelectedDifficulty(value)
    updateURL({ difficulty: value })
  }

  const handleCuisineChange = (value: string) => {
    setSelectedCuisine(value)
    updateURL({ cuisine: value })
  }

  const handleDietChange = (value: string) => {
    setSelectedDiet(value)
    updateURL({ diet: value })
  }

  const handleSortChange = (value: string) => {
    setSortBy(value)
    updateURL({ sort: value })
  }

  const fetchRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .order(sortBy, { ascending: sortBy === "created_at" ? false : true })

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

  const fetchFavorites = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from("recipe_favorites")
        .select("recipe_id")
        .eq("user_id", user.id)

      if (error) {
        console.warn("Error fetching favorites:", error)
        return
      }

      const favoriteIds = new Set(data?.map(item => item.recipe_id) || [])
      setFavorites(favoriteIds)
    } catch (error) {
      console.error("Error fetching favorites:", error)
    }
  }

  const toggleFavorite = async (recipeId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to favorite recipes.",
        variant: "destructive",
      })
      return
    }

    try {
      if (favorites.has(recipeId)) {
        // Remove from favorites
        const { error } = await supabase
          .from("recipe_favorites")
          .delete()
          .eq("recipe_id", recipeId)
          .eq("user_id", user.id)

        if (error) throw error

        setFavorites(prev => {
          const newFavorites = new Set(prev)
          newFavorites.delete(recipeId)
          return newFavorites
        })

        toast({
          title: "Removed from favorites",
          description: "Recipe has been removed from your favorites.",
        })
      } else {
        // Add to favorites
        const { error } = await supabase
          .from("recipe_favorites")
          .insert({
            recipe_id: recipeId,
            user_id: user.id,
          })

        if (error) throw error

        setFavorites(prev => new Set([...prev, recipeId]))

        toast({
          title: "Added to favorites",
          description: "Recipe has been added to your favorites.",
        })
      }
    } catch (error) {
      console.error("Error toggling favorite:", error)
      toast({
        title: "Error",
        description: "Failed to update favorites. Please try again.",
        variant: "destructive",
      })
    }
  }

  const filterRecipes = () => {
    let filtered = recipes

    // Search filter - now includes ingredients
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter((recipe) => {
        // Search in title
        if (recipe.title.toLowerCase().includes(searchLower)) return true
        
        // Search in description
        if (recipe.description.toLowerCase().includes(searchLower)) return true
        
        // Search in cuisine type
        if (recipe.cuisine_type?.toLowerCase().includes(searchLower)) return true
        
        // Search in ingredients
        if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
          return recipe.ingredients.some((ingredient: any) => 
            ingredient.name?.toLowerCase().includes(searchLower)
          )
        }
        
        return false
      })
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
      filtered = filtered.filter((recipe) => 
        recipe.dietary_tags && recipe.dietary_tags.includes(selectedDiet)
      )
    }

    setFilteredRecipes(filtered)
  }

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

  const getTotalTime = (recipe: Recipe) => {
    return (recipe.prep_time || 0) + (recipe.cook_time || 0)
  }

  // Get unique cuisine types and dietary tags
  const cuisineTypes = [...new Set(recipes.map(recipe => recipe.cuisine_type).filter(Boolean))]
  const dietaryTags = [...new Set(recipes.flatMap(recipe => recipe.dietary_tags || []))]

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Recipes</h1>
              <p className="text-xl text-gray-600">Discover and share amazing recipes</p>
            </div>
            <div className="flex items-center gap-4">
              <Button asChild className="bg-orange-500 hover:bg-orange-600">
                <Link href="/recipes/upload">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Recipe
                </Link>
              </Button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              placeholder="Search recipes by name, ingredient, or cuisine..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-12 py-4 text-lg rounded-full border-gray-200 shadow-sm"
            />
          </div>
        </div>

        {/* View Mode Toggle */}
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

        {/* Advanced Filters */}
        <Card className="mb-8 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Select value={selectedDifficulty} onValueChange={handleDifficultyChange}>
                <SelectTrigger className="bg-white/50">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedCuisine} onValueChange={handleCuisineChange}>
                <SelectTrigger className="bg-white/50">
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

              <Select value={selectedDiet} onValueChange={handleDietChange}>
                <SelectTrigger className="bg-white/50">
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

              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger className="bg-white/50">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Newest</SelectItem>
                  <SelectItem value="rating_avg">Highest Rated</SelectItem>
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
                className="bg-white/50"
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
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-12 text-center">
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
              <div
                key={recipe.id}
                role="link"
                tabIndex={0}
                title={`Open ${recipe.title}`}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.closest('[data-favorite-button]')) return
                  router.push(`/recipes/${recipe.id}`)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    const target = e.target as HTMLElement
                    if (target.closest('[data-favorite-button]')) return
                    e.preventDefault()
                    router.push(`/recipes/${recipe.id}`)
                  }
                }}
                className="relative"
              >
                <RecipeCard
                  id={recipe.id}
                  title={recipe.title}
                  image={recipe.image_url || "/placeholder.svg?height=300&width=400"}
                  rating={recipe.rating_avg || 0}
                  difficulty={recipe.difficulty as "beginner" | "intermediate" | "advanced"}
                  comments={recipe.rating_count || 0}
                  tags={recipe.dietary_tags || []}
                  nutrition={recipe.nutrition}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {filteredRecipes.map((recipe: Recipe) => (
              <div key={recipe.id} className="relative">
                <Link href={`/recipes/${recipe.id}`} onClick={(e) => {
                  // Prevent navigation if clicking on the favorite button
                  const target = e.target as HTMLElement
                  if (target.closest('[data-favorite-button]')) {
                    e.preventDefault()
                    e.stopPropagation()
                  }
                }}>
                  <Card className="group cursor-pointer hover:shadow-xl transition-all duration-300 bg-white/80 backdrop-blur-sm border-0 shadow-lg overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex">
                        {/* Left: Large Image */}
            <div className="w-1/2 relative min-h-[300px]">
              <Image
                src={recipe.image_url || "/placeholder.svg?height=400&width=600"}
                alt={recipe.title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>

                        {/* Right: Recipe Details */}
                        <div className="w-1/2 p-8 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between mb-4">
                              <h3 className="text-2xl font-bold text-gray-900 group-hover:text-orange-600 transition-colors">
                                {recipe.title}
                              </h3>
                              <Badge className={getDifficultyColor(recipe.difficulty)}>{recipe.difficulty}</Badge>
                            </div>
                            
                            <p className="text-gray-600 mb-6 line-clamp-3">{recipe.description}</p>

                            {/* Recipe Metrics */}
                            <div className="grid grid-cols-2 gap-6 mb-6">
                              <div className="flex items-center gap-3">
                                <Clock className="h-5 w-5 text-gray-400" />
                                <div>
                                  <p className="text-sm text-gray-500">Total Time</p>
                                  <p className="font-semibold">{getTotalTime(recipe)} minutes</p>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                <Users className="h-5 w-5 text-gray-400" />
                                <div>
                                  <p className="text-sm text-gray-500">Servings</p>
                                  <p className="font-semibold">{recipe.servings} servings</p>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                <ChefHat className="h-5 w-5 text-gray-400" />
                                <div>
                                  <p className="text-sm text-gray-500">Nutrition</p>
                                  <div className="text-xs space-y-1">
                                    {recipe.nutrition?.calories && <div>{recipe.nutrition.calories} Calories</div>}
                                    {recipe.nutrition?.protein && <div>{recipe.nutrition.protein}g Protein</div>}
                                    {recipe.nutrition?.fat && <div>{recipe.nutrition.fat}g Fat</div>}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                <BarChart3 className="h-5 w-5 text-gray-400" />
                                <div>
                                  <p className="text-sm text-gray-500">Rating</p>
                                  <div className="flex items-center gap-1">
                                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                    <span className="font-semibold">{(recipe.rating_avg || 0).toFixed(1)}</span>
                                    <span className="text-xs text-gray-500">({recipe.rating_count || 0})</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Tags */}
                          {recipe.dietary_tags && recipe.dietary_tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {recipe.dietary_tags.map((tag, index) => (
                                <Badge key={index} variant="secondary" className="bg-gray-100 text-gray-700">
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
                
                {/* Favorite button positioned absolutely to avoid Link interference */}
                <div className="absolute top-4 right-4 z-10">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    data-favorite-button
                    className={`bg-white/90 hover:bg-white ${favorites.has(recipe.id) ? "text-red-500" : "text-gray-600"}`}
                    onClick={(e) => toggleFavorite(recipe.id, e)}
                  >
                    <Heart className={`h-4 w-4 ${favorites.has(recipe.id) ? "fill-current" : ""}`} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
