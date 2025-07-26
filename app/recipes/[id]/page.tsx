"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Heart, ShoppingCart, Share2, ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"

interface Recipe {
  id: string
  title: string
  description: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: string
  cuisine: string
  image_url: string
  tags: string[]
  ingredients: string[]
  instructions: string[]
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

      setRecipe(data)
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
        .from("favorites")
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
        const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("recipe_id", params.id)

        if (error) throw error
        setIsFavorite(false)
      } else {
        const { error } = await supabase.from("favorites").insert({
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
        name: ingredient,
        quantity: 1,
        unit: "piece",
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
      // Simple regex to find numbers in ingredients
      return ingredient.replace(/(\d+(?:\.\d+)?)/g, (match) => {
        const num = Number.parseFloat(match)
        const adjusted = (num * multiplier).toFixed(2)
        return Number.parseFloat(adjusted) % 1 === 0 ? Number.parseInt(adjusted).toString() : adjusted
      })
    })
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse space-y-4 max-w-md w-full">
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
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md mx-auto">
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
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 truncate max-w-md">{recipe.title}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {(recipe.prep_time || 0) + (recipe.cook_time || 0)} min
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {recipe.servings} servings
                </span>
                <Badge variant="outline">{recipe.difficulty}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <Button size="sm" variant={isFavorite ? "default" : "outline"} onClick={toggleFavorite}>
                <Heart className={`w-4 h-4 ${isFavorite ? "fill-current" : ""}`} />
              </Button>
            )}
            <Button size="sm" variant="outline">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Recipe Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Recipe Image and Description */}
            <div className="flex gap-6">
              <img
                src={recipe.image_url || "/placeholder.svg?height=300&width=400"}
                alt={recipe.title}
                className="w-80 h-60 object-cover rounded-lg flex-shrink-0"
              />
              <div className="flex-1">
                <p className="text-gray-700 leading-relaxed mb-4">{recipe.description}</p>

                <div className="flex flex-wrap gap-2 mb-4">
                  {recipe.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-sm text-gray-600">Prep Time</p>
                      <p className="font-medium">{recipe.prep_time || 0} min</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <Clock className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-sm text-gray-600">Cook Time</p>
                      <p className="font-medium">{recipe.cook_time || 0} min</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recipe.instructions.map((instruction, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-medium text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-700 leading-relaxed">{instruction}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sticky Ingredients Sidebar */}
        <div className="w-80 border-l bg-white flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Ingredients</h3>
              {user && (
                <Button size="sm" onClick={addIngredientsToShoppingList} className="bg-orange-500 hover:bg-orange-600">
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add All
                </Button>
              )}
            </div>

            {/* Serving Adjuster */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Servings:</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => adjustServings(servings - 1)}
                  disabled={servings <= 1}
                >
                  -
                </Button>
                <span className="w-8 text-center font-medium">{servings}</span>
                <Button size="sm" variant="outline" onClick={() => adjustServings(servings + 1)}>
                  +
                </Button>
              </div>
            </div>
          </div>

          {/* Ingredients List */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {getAdjustedIngredients().map((ingredient, index) => (
                <div key={index} className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 w-4 h-4 text-orange-600 rounded" />
                  <span className="text-sm leading-relaxed">{ingredient}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recipe Info */}
          <div className="p-4 border-t bg-gray-50">
            <h4 className="font-medium mb-3">Recipe Info</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Time:</span>
                <span className="font-medium">{(recipe.prep_time || 0) + (recipe.cook_time || 0)} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Difficulty:</span>
                <span className="font-medium">{recipe.difficulty}</span>
              </div>
              {recipe.cuisine && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Cuisine:</span>
                  <span className="font-medium">{recipe.cuisine}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Created:</span>
                <span className="font-medium">{new Date(recipe.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
