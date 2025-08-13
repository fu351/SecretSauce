"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Heart, ShoppingCart, ArrowLeft, ChefHat, Star, BarChart3, Utensils } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"

interface Ingredient {
  amount: string
  unit: string
  name: string
}

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
  tags: string[]
  ingredients: Ingredient[]
  instructions: any[]
  user_id: string
  created_at: string
  rating_avg?: number
  rating_count?: number
  nutrition?: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  }
}

export default function RecipeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isFloating, setIsFloating] = useState(false)

  useEffect(() => {
    if (params.id) {
      loadRecipe()
      if (user) {
        checkIfFavorite()
      }
    }
  }, [params.id, user])

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      const navbarHeight = 80 // Approximate navbar height
      setIsFloating(scrollTop >= navbarHeight)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const loadRecipe = async () => {
    try {
      const { data, error } = await supabase.from("recipes").select("*").eq("id", params.id).single()

      if (error) throw error

      // Ensure arrays are properly initialized and map database fields to frontend model
      const processedRecipe = {
        ...data,
        ingredients: data.ingredients || [],
        instructions: data.instructions || [],
        tags: data.dietary_tags || [],
        cuisine_type: data.cuisine_type || ""
      }

      setRecipe(processedRecipe)
    } catch (error) {
      console.error("Error loading recipe:", error)
      router.push("/recipes")
    } finally {
      setLoading(false)
    }
  }

  const checkIfFavorite = async () => {
    try {
      const { data, error } = await supabase
        .from("recipe_favorites")
        .select("id")
        .eq("user_id", user?.id)
        .eq("recipe_id", params.id)
        .single()

      if (data) {
        setIsFavorite(true)
      }
    } catch (error) {
      // Not a favorite or error occurred
      setIsFavorite(false)
    }
  }

  const toggleFavorite = async () => {
    if (!user) return

    try {
      if (isFavorite) {
        const { error } = await supabase.from("recipe_favorites").delete().eq("user_id", user.id).eq("recipe_id", params.id)

        if (error) throw error
        setIsFavorite(false)
      } else {
        const { error } = await supabase.from("recipe_favorites").insert({
          user_id: user.id,
          recipe_id: params.id,
        })

        if (error) throw error
        setIsFavorite(true)
      }
    } catch (error) {
      console.error("Error toggling favorite:", error)
    }
  }

  const addIngredientsToShoppingList = async () => {
    if (!user || !recipe) return

    try {
      // Get existing shopping list
      const { data: existingList, error: fetchError } = await supabase
        .from("shopping_lists")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)

      if (fetchError) throw fetchError

      const currentItems = existingList?.[0]?.items || []

      // Add recipe ingredients to shopping list
      const newItems = recipe.ingredients.map((ingredient, index) => ({
        id: `recipe-${recipe.id}-${index}-${Date.now()}`,
        name: ingredient.name,
        quantity: parseFloat(ingredient.amount) || 1,
        unit: ingredient.unit,
        checked: false,
      }))

      const updatedItems = [...currentItems, ...newItems]

      const { error } = await supabase.from("shopping_lists").upsert({
        user_id: user.id,
        items: updatedItems,
        updated_at: new Date().toISOString(),
      })

      if (error) throw error

      alert("Ingredients added to shopping list!")
    } catch (error) {
      console.error("Error adding to shopping list:", error)
      alert("Error adding ingredients to shopping list")
    }
  }

  const getTotalTime = () => {
    return (recipe?.prep_time || 0) + (recipe?.cook_time || 0)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50 flex items-center justify-center">
        <div className="animate-pulse space-y-4 max-w-md w-full px-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto shadow-lg border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Recipe Not Found</CardTitle>
            <CardDescription>The recipe you're looking for doesn't exist.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/recipes")} className="w-full bg-orange-500 hover:bg-orange-600">
              Browse Recipes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
      {/* Floating Back Button - Always visible, moves to top position when scrolled */}
      <div className={`fixed z-50 ${isFloating ? 'top-8' : 'top-24'} left-8`}>
        <Button 
          variant="ghost" 
          onClick={() => router.back()} 
          className="hover:bg-white/90 bg-white/80 backdrop-blur-sm text-gray-700 font-bold text-lg px-6 py-3 shadow-lg border border-gray-200"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
      </div>

      {/* Main Content - Split Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-center">
          {/* Left: Large Recipe Image */}
          <div className="lg:w-3/5">
            <div className="relative overflow-hidden rounded-2xl shadow-xl">
              <img
                src={recipe.image_url || "/placeholder.svg?height=600&width=800"}
                alt={recipe.title}
                className="w-full h-[500px] object-cover"
              />
              <div className="absolute top-4 right-4">
                <Button variant="ghost" size="sm" className="bg-white/90 hover:bg-white" onClick={toggleFavorite}>
                  <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : "text-gray-700"}`} />
                </Button>
              </div>
            </div>
          </div>

          {/* Right: Recipe Details - One Unified Section */}
          <div className="lg:w-2/5">
            <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-8">
                <div className="space-y-8">
                  {/* Recipe Title */}
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 leading-tight">{recipe.title}</h1>
                  </div>

                  {/* Description */}
                  <p className="text-gray-600 leading-relaxed text-lg">{recipe.description}</p>

                  {/* Recipe Metrics Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm">
                      <Clock className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Total Time</p>
                        <p className="font-semibold">{getTotalTime()} minutes</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm">
                      <BarChart3 className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Difficulty</p>
                        <p className="font-semibold capitalize">{recipe.difficulty}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm">
                      <Users className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Servings</p>
                        <p className="font-semibold">{recipe.servings} servings</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm">
                      <Star className="h-5 w-5 text-gray-400" />
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

                  {/* Nutrition */}
                  {recipe.nutrition && (
                    <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm">
                      <Utensils className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Nutrition</p>
                        <div className="flex gap-4 text-sm">
                          {recipe.nutrition.calories && <span className="font-semibold">{recipe.nutrition.calories} Calories</span>}
                          {recipe.nutrition.protein && <span className="font-semibold">{recipe.nutrition.protein}g Protein</span>}
                          {recipe.nutrition.fat && <span className="font-semibold">{recipe.nutrition.fat}g Fat</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {(recipe.tags.length > 0 || recipe.cuisine_type) && (
                    <div className="flex flex-wrap gap-2">
                      {recipe.cuisine_type && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                          {recipe.cuisine_type}
                        </Badge>
                      )}
                      {recipe.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="bg-gray-100 text-gray-700">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Ingredients Section - 85% width centered */}
        <div className="mt-12 flex justify-center">
          <div className="w-full max-w-6xl" style={{ width: '95%' }}>
            <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-gray-900">Ingredients</h3>
                    {user && (
                      <Button size="sm" onClick={addIngredientsToShoppingList} className="bg-orange-500 hover:bg-orange-600">
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Add All to Shopping List
                      </Button>
                    )}
                  </div>

                  {/* Ingredients List - Two Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {recipe.ingredients.map((ingredient, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm">
                        <input 
                          type="checkbox" 
                          className="mt-1 w-4 h-4 text-orange-600 rounded" 
                          aria-label={`Check ingredient: ${ingredient.amount} ${ingredient.unit} ${ingredient.name}`}
                        />
                        <span className="text-sm leading-relaxed font-medium">
                          {ingredient.amount} {ingredient.unit} {ingredient.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Instructions Section - 85% width centered */}
        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-4xl" style={{ width: '85%' }}>
            <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <ChefHat className="h-6 w-6 text-orange-500" />
                    Instructions
                  </h3>
                  <div className="space-y-4">
                    {recipe.instructions.map((instruction, index) => (
                      <div key={index} className="flex gap-4 p-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm">
                        <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-700 leading-relaxed">
                            {typeof instruction === 'string' ? instruction : instruction.description || instruction.step || 'Step description not available'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
