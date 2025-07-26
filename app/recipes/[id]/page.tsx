"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Heart, ShoppingCart, Share2, ArrowLeft, ChefHat, Star } from "lucide-react"
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
}

export default function RecipeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [servings, setServings] = useState(1)

  useEffect(() => {
    if (params.id) {
      loadRecipe()
      if (user) {
        checkIfFavorite()
      }
    }
  }, [params.id, user])

  useEffect(() => {
    if (recipe) {
      setServings(recipe.servings)
    }
  }, [recipe])

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

  const adjustServings = (newServings: number) => {
    if (newServings < 1) return
    setServings(newServings)
  }

  const getAdjustedIngredients = () => {
    if (!recipe) return []

    const multiplier = servings / recipe.servings
    return recipe.ingredients.map((ingredient) => {
      // Adjust the amount if it's a number, otherwise leave as is
      const originalAmount = parseFloat(ingredient.amount)
      let adjustedAmount = ingredient.amount
      if (!isNaN(originalAmount)) {
        const newAmount = (originalAmount * multiplier).toFixed(2)
        adjustedAmount = parseFloat(newAmount) % 1 === 0 ? parseInt(newAmount).toString() : newAmount
      }
      return `${adjustedAmount} ${ingredient.unit} ${ingredient.name}`
    })
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
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => router.back()} className="hover:bg-gray-100">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 truncate max-w-md">{recipe.title}</h1>
                <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {(recipe.prep_time || 0) + (recipe.cook_time || 0)} min
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {recipe.servings} servings
                  </span>
                  <Badge variant="outline" className="text-xs">{recipe.difficulty}</Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user && (
                <Button size="sm" variant={isFavorite ? "default" : "outline"} onClick={toggleFavorite} className="h-10 w-10 p-0">
                  <Heart className={`w-4 h-4 ${isFavorite ? "fill-current" : ""}`} />
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-10 w-10 p-0">
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recipe Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Recipe Image and Description */}
            <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm overflow-hidden">
              <div className="relative">
                <img
                  src={recipe.image_url || "/placeholder.svg?height=400&width=600"}
                  alt={recipe.title}
                  className="w-full h-64 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
              </div>
              <CardContent className="p-6">
                <p className="text-gray-700 leading-relaxed mb-6 text-lg">{recipe.description}</p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {recipe.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-sm">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg">
                    <Clock className="w-6 h-6 text-orange-600" />
                    <div>
                      <p className="text-sm text-gray-600">Prep Time</p>
                      <p className="font-bold text-lg">{recipe.prep_time || 0} min</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                    <Clock className="w-6 h-6 text-green-600" />
                    <div>
                      <p className="text-sm text-gray-600">Cook Time</p>
                      <p className="font-bold text-lg">{recipe.cook_time || 0} min</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ChefHat className="h-6 w-6 text-orange-500" />
                  Instructions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {recipe.instructions.map((instruction, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold text-lg">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-700 leading-relaxed text-lg">
                          {typeof instruction === 'string' ? instruction : instruction.description || instruction.step || 'Step description not available'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sticky Ingredients Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5 text-orange-500" />
                      Ingredients
                    </CardTitle>
                    {user && (
                      <Button size="sm" onClick={addIngredientsToShoppingList} className="bg-orange-500 hover:bg-orange-600">
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Add All
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Serving Adjuster */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium">Servings:</span>
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => adjustServings(servings - 1)}
                        disabled={servings <= 1}
                        className="h-8 w-8 p-0"
                      >
                        -
                      </Button>
                      <span className="w-12 text-center font-bold text-lg">{servings}</span>
                      <Button size="sm" variant="outline" onClick={() => adjustServings(servings + 1)} className="h-8 w-8 p-0">
                        +
                      </Button>
                    </div>
                  </div>

                  {/* Ingredients List */}
                  <div className="space-y-3">
                    {getAdjustedIngredients().map((ingredient, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <input 
                          type="checkbox" 
                          className="mt-1 w-4 h-4 text-orange-600 rounded" 
                          aria-label={`Check ingredient: ${ingredient}`}
                        />
                        <span className="text-sm leading-relaxed font-medium">{ingredient}</span>
                      </div>
                    ))}
                  </div>

                  {/* Recipe Info */}
                  <div className="pt-4 border-t">
                    <h4 className="font-bold mb-4 flex items-center gap-2">
                      <Star className="h-4 w-4 text-orange-500" />
                      Recipe Info
                    </h4>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Time:</span>
                        <span className="font-bold">{(recipe.prep_time || 0) + (recipe.cook_time || 0)} minutes</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Difficulty:</span>
                        <span className="font-bold">{recipe.difficulty}</span>
                      </div>
                      {recipe.cuisine_type && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cuisine:</span>
                          <span className="font-bold">{recipe.cuisine_type}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Created:</span>
                        <span className="font-bold">{new Date(recipe.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
