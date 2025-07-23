"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Clock, Users, ChefHat, Heart, ShoppingCart, Share2, ArrowLeft } from "lucide-react"
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
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
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
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Recipe Not Found</CardTitle>
            <CardDescription>The recipe you're looking for doesn't exist.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/recipes")} className="w-full">
              Browse Recipes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recipe Header */}
            <Card>
              <CardContent className="p-0">
                <div className="relative">
                  <img
                    src={recipe.image_url || "/placeholder.svg?height=400&width=600"}
                    alt={recipe.title}
                    className="w-full h-64 md:h-80 object-cover rounded-t-lg"
                  />
                  <div className="absolute top-4 right-4 flex gap-2">
                    {user && (
                      <Button size="sm" variant={isFavorite ? "default" : "secondary"} onClick={toggleFavorite}>
                        <Heart className={`w-4 h-4 ${isFavorite ? "fill-current" : ""}`} />
                      </Button>
                    )}
                    <Button size="sm" variant="secondary">
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {recipe.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <h1 className="text-3xl font-bold mb-4">{recipe.title}</h1>

                  <p className="text-muted-foreground mb-6 text-lg leading-relaxed">{recipe.description}</p>

                  {/* Recipe Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <Clock className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Prep Time</p>
                        <p className="font-medium">{recipe.prep_time || 0} min</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <Clock className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Cook Time</p>
                        <p className="font-medium">{recipe.cook_time || 0} min</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <Users className="w-5 h-5 text-purple-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Servings</p>
                        <p className="font-medium">{recipe.servings}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <ChefHat className="w-5 h-5 text-orange-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Difficulty</p>
                        <p className="font-medium">{recipe.difficulty}</p>
                      </div>
                    </div>
                  </div>

                  {recipe.cuisine && (
                    <div className="mb-6">
                      <Badge variant="outline" className="text-sm">
                        {recipe.cuisine} Cuisine
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {recipe.instructions.map((instruction, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-medium">
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

          {/* Sticky Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              {/* Ingredients */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Ingredients</CardTitle>
                    {user && (
                      <Button size="sm" variant="outline" onClick={addIngredientsToShoppingList}>
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Add to List
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Serving Adjuster */}
                  <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
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

                  <Separator className="mb-4" />

                  {/* Ingredients List */}
                  <div className="space-y-3">
                    {getAdjustedIngredients().map((ingredient, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <input type="checkbox" className="mt-1 w-4 h-4 text-blue-600 rounded" />
                        <span className="text-sm leading-relaxed">{ingredient}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recipe Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Recipe Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Time:</span>
                    <span className="text-sm font-medium">
                      {(recipe.prep_time || 0) + (recipe.cook_time || 0)} minutes
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Difficulty:</span>
                    <span className="text-sm font-medium">{recipe.difficulty}</span>
                  </div>
                  {recipe.cuisine && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Cuisine:</span>
                      <span className="text-sm font-medium">{recipe.cuisine}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Created:</span>
                    <span className="text-sm font-medium">{new Date(recipe.created_at).toLocaleDateString()}</span>
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
