"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Heart, Search, Filter, Clock, Star } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { RecipeCard } from "@/components/recipe-card"
import Link from "next/link"

interface Recipe {
  id: string
  title: string
  image_url: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: string
  cuisine_type: string
  dietary_tags: string[]
  rating_avg: number
  rating_count: number
  created_at: string
}

export default function FavoritesPage() {
  const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([])
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCuisine, setSelectedCuisine] = useState("all")
  const [selectedDifficulty, setSelectedDifficulty] = useState("all")
  const [sortBy, setSortBy] = useState("newest")
  const [loading, setLoading] = useState(true)

  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin")
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      fetchFavoriteRecipes()
    }
  }, [user])

  useEffect(() => {
    filterAndSortRecipes()
  }, [favoriteRecipes, searchTerm, selectedCuisine, selectedDifficulty, sortBy])

  const fetchFavoriteRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("recipe_favorites")
        .select(`
          created_at,
          recipes (
            id,
            title,
            image_url,
            prep_time,
            cook_time,
            servings,
            difficulty,
            cuisine_type,
            dietary_tags,
            rating_avg,
            rating_count,
            created_at
          )
        `)
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false })

      if (error && !error.message.includes("does not exist")) throw error

      const recipes =
        data
          ?.map((item) => ({
            ...item.recipes,
            favorited_at: item.created_at,
          }))
          .filter(Boolean) || []

      setFavoriteRecipes(recipes)
    } catch (error) {
      console.error("Error fetching favorite recipes:", error)
    } finally {
      setLoading(false)
    }
  }

  const filterAndSortRecipes = () => {
    let filtered = [...favoriteRecipes]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (recipe) =>
          recipe.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          recipe.cuisine_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          recipe.dietary_tags?.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase())),
      )
    }

    // Cuisine filter
    if (selectedCuisine !== "all") {
      filtered = filtered.filter((recipe) => recipe.cuisine_type === selectedCuisine)
    }

    // Difficulty filter
    if (selectedDifficulty !== "all") {
      filtered = filtered.filter((recipe) => recipe.difficulty === selectedDifficulty)
    }

    // Sort
    switch (sortBy) {
      case "newest":
        filtered.sort(
          (a, b) =>
            new Date(b.favorited_at || b.created_at).getTime() - new Date(a.favorited_at || a.created_at).getTime(),
        )
        break
      case "oldest":
        filtered.sort(
          (a, b) =>
            new Date(a.favorited_at || a.created_at).getTime() - new Date(b.favorited_at || b.created_at).getTime(),
        )
        break
      case "rating":
        filtered.sort((a, b) => (b.rating_avg || 0) - (a.rating_avg || 0))
        break
      case "time":
        filtered.sort((a, b) => (a.prep_time || 0) + (a.cook_time || 0) - ((b.prep_time || 0) + (b.cook_time || 0)))
        break
      case "alphabetical":
        filtered.sort((a, b) => a.title.localeCompare(b.title))
        break
    }

    setFilteredRecipes(filtered)
  }

  const getCuisineOptions = () => {
    const cuisines = new Set(favoriteRecipes.map((recipe) => recipe.cuisine_type).filter(Boolean))
    return Array.from(cuisines).sort()
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
              <Heart className="h-8 w-8 text-red-500" />
              My Favorite Recipes
            </h1>
            <p className="text-gray-600">Your collection of saved recipes</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{favoriteRecipes.length}</p>
            <p className="text-sm text-gray-600">Favorites</p>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search your favorites..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={selectedCuisine} onValueChange={setSelectedCuisine}>
                <SelectTrigger>
                  <SelectValue placeholder="All Cuisines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cuisines</SelectItem>
                  {getCuisineOptions().map((cuisine) => (
                    <SelectItem key={cuisine} value={cuisine}>
                      {cuisine}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                <SelectTrigger>
                  <SelectValue placeholder="All Difficulties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Difficulties</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="rating">Highest Rated</SelectItem>
                  <SelectItem value="time">Quickest First</SelectItem>
                  <SelectItem value="alphabetical">A-Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Recipe Grid */}
        {filteredRecipes.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Heart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {favoriteRecipes.length === 0 ? "No favorite recipes yet" : "No recipes match your filters"}
              </h3>
              <p className="text-gray-600 mb-6">
                {favoriteRecipes.length === 0
                  ? "Start exploring recipes and save your favorites here"
                  : "Try adjusting your search or filters"}
              </p>
              {favoriteRecipes.length === 0 && (
                <Button asChild className="bg-orange-500 hover:bg-orange-600">
                  <Link href="/recipes">Discover Recipes</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map((recipe) => (
              <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                <RecipeCard
                  id={recipe.id}
                  title={recipe.title}
                  image={recipe.image_url}
                  rating={recipe.rating_avg || 0}
                  difficulty={recipe.difficulty as "Beginner" | "Intermediate" | "Advanced"}
                  comments={recipe.rating_count || 0}
                  tags={recipe.dietary_tags || []}
                />
              </Link>
            ))}
          </div>
        )}

        {/* Stats */}
        {favoriteRecipes.length > 0 && (
          <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6 text-center">
                <Heart className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{favoriteRecipes.length}</p>
                <p className="text-sm text-gray-600">Total Favorites</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <Clock className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">
                  {Math.round(
                    favoriteRecipes.reduce(
                      (acc, recipe) => acc + (recipe.prep_time || 0) + (recipe.cook_time || 0),
                      0,
                    ) / favoriteRecipes.length,
                  )}
                </p>
                <p className="text-sm text-gray-600">Avg Cook Time (min)</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <Star className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">
                  {(
                    favoriteRecipes.reduce((acc, recipe) => acc + (recipe.rating_avg || 0), 0) / favoriteRecipes.length
                  ).toFixed(1)}
                </p>
                <p className="text-sm text-gray-600">Avg Rating</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <Filter className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{getCuisineOptions().length}</p>
                <p className="text-sm text-gray-600">Cuisines</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
