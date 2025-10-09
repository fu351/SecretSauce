"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Users, Heart, ShoppingCart, ArrowLeft, ChefHat, Star, BarChart3, Utensils } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { RecipeDetailSkeleton } from "@/components/recipe-skeleton"
import { RecipeReviews } from "@/components/recipe-reviews"

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
  cuisine: string
  image_url: string
  dietary_tags: string[]
  ingredients: Ingredient[]
  instructions: any[]
  author_id: string
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
  const { theme } = useTheme()
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
      const navbarHeight = 80
      setIsFloating(scrollTop >= navbarHeight)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const loadRecipe = async () => {
    try {
      const { data, error } = await supabase.from("recipes").select("*").eq("id", params.id).single()

      if (error) throw error

      const processedRecipe = {
        ...data,
        ingredients: data.ingredients || [],
        instructions: data.instructions || [],
        dietary_tags: data.dietary_tags || [],
        cuisine: data.cuisine || "",
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
        .from("recipe_favorites") // Use recipe_favorites table
        .select("id")
        .eq("user_id", user?.id)
        .eq("recipe_id", params.id)
        .single()

      if (data) {
        setIsFavorite(true)
      }
    } catch (error) {
      setIsFavorite(false)
    }
  }

  const toggleFavorite = async () => {
    if (!user) return

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from("recipe_favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("recipe_id", params.id) // Use recipe_favorites

        if (error) throw error
        setIsFavorite(false)
      } else {
        const { error } = await supabase.from("recipe_favorites").insert({
          // Use recipe_favorites
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
      const { data: existingList, error: fetchError } = await supabase
        .from("shopping_lists")
        .select("items")
        .eq("user_id", user.id)
        .single()

      if (fetchError && fetchError.code !== "PGRST116") throw fetchError

      const currentItems = existingList?.items || []

      const newItems = recipe.ingredients.map((ingredient, index) => ({
        id: `recipe-${recipe.id}-${index}-${Date.now()}`,
        name: ingredient.name,
        quantity: Number.parseFloat(ingredient.amount) || 1,
        unit: ingredient.unit,
        checked: false,
        recipeId: recipe.id,
        recipeName: recipe.title,
      }))

      const updatedItems = [...currentItems, ...newItems]

      const { error } = await supabase.from("shopping_lists").upsert({
        user_id: user.id,
        items: updatedItems,
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

  const bgClass = theme === "dark" ? "bg-[#181813]" : "bg-gradient-to-br from-orange-50 to-yellow-50"
  const textClass = theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
  const mutedTextClass = theme === "dark" ? "text-[#e8dcc4]/70" : "text-gray-600"
  const cardBgClass = theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white/90"
  const infoBgClass = theme === "dark" ? "bg-[#252520] border-[#e8dcc4]/10" : "bg-white/80"

  if (loading) {
    return <RecipeDetailSkeleton />
  }

  if (!recipe) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bgClass}`}>
        {" "}
        {/* Use theme-aware background */}
        <Card className={`max-w-md mx-auto shadow-lg ${cardBgClass}`}>
          {" "}
          {/* Use theme-aware card */}
          <CardContent className="p-6 text-center">
            <h2 className={`text-2xl font-bold mb-4 ${textClass}`}>Recipe Not Found</h2>
            <p className={`mb-6 ${mutedTextClass}`}>The recipe you're looking for doesn't exist.</p>
            <Button
              onClick={() => router.push("/recipes")}
              className={
                theme === "dark"
                  ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
                  : "bg-orange-500 hover:bg-orange-600"
              }
            >
              Browse Recipes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${bgClass}`}>
      <div className={`fixed z-50 ${isFloating ? "top-8" : "top-24"} left-8 transition-all duration-300`}>
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="hover:bg-white/90 bg-white/80 backdrop-blur-sm text-gray-700 font-bold text-lg px-6 py-3 shadow-lg border border-gray-200"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-center">
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

          <div className="lg:w-2/5">
            <Card className={`${cardBgClass} backdrop-blur-sm border-0 shadow-lg`}>
              <CardContent className="p-8">
                <div className="space-y-8">
                  <div>
                    <h1 className={`text-3xl font-serif font-light ${textClass} leading-tight`}>{recipe.title}</h1>
                  </div>

                  <p className={`${mutedTextClass} leading-relaxed text-lg`}>{recipe.description}</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className={`flex items-center gap-3 p-4 backdrop-blur-sm rounded-lg shadow-sm ${infoBgClass}`}>
                      <Clock className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`} />
                      <div>
                        <p className={`text-sm ${mutedTextClass}`}>Total Time</p>
                        <p className={`font-semibold ${textClass}`}>{getTotalTime()} minutes</p>
                      </div>
                    </div>

                    <div className={`flex items-center gap-3 p-4 backdrop-blur-sm rounded-lg shadow-sm ${infoBgClass}`}>
                      <BarChart3 className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`} />
                      <div>
                        <p className={`text-sm ${mutedTextClass}`}>Difficulty</p>
                        <p className={`font-semibold capitalize ${textClass}`}>{recipe.difficulty}</p>
                      </div>
                    </div>

                    <div className={`flex items-center gap-3 p-4 backdrop-blur-sm rounded-lg shadow-sm ${infoBgClass}`}>
                      <Users className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`} />
                      <div>
                        <p className={`text-sm ${mutedTextClass}`}>Servings</p>
                        <p className={`font-semibold ${textClass}`}>{recipe.servings} servings</p>
                      </div>
                    </div>

                    <div className={`flex items-center gap-3 p-4 backdrop-blur-sm rounded-lg shadow-sm ${infoBgClass}`}>
                      <Star className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`} />
                      <div>
                        <p className={`text-sm ${mutedTextClass}`}>Rating</p>
                        <div className="flex items-center gap-1">
                          <Star
                            className={`h-4 w-4 ${theme === "dark" ? "fill-[#e8dcc4] text-[#e8dcc4]" : "fill-yellow-400 text-yellow-400"}`}
                          />{" "}
                          {/* Use theme color for star */}
                          <span className={`font-semibold ${textClass}`}>{(recipe.rating_avg || 0).toFixed(1)}</span>
                          <span className={`text-xs ${mutedTextClass}`}>({recipe.rating_count || 0})</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {recipe.nutrition && (
                    <div className={`flex items-center gap-3 p-4 backdrop-blur-sm rounded-lg shadow-sm ${infoBgClass}`}>
                      <Utensils className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"}`} />
                      <div>
                        <p className={`text-sm ${mutedTextClass}`}>Nutrition</p>
                        <div className={`flex gap-4 text-sm ${textClass}`}>
                          {recipe.nutrition.calories && (
                            <span className="font-semibold">{recipe.nutrition.calories} Calories</span>
                          )}
                          {recipe.nutrition.protein && (
                            <span className="font-semibold">{recipe.nutrition.protein}g Protein</span>
                          )}
                          {recipe.nutrition.fat && <span className="font-semibold">{recipe.nutrition.fat}g Fat</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {(recipe.dietary_tags.length > 0 || recipe.cuisine) && (
                    <div className="flex flex-wrap gap-2">
                      {recipe.cuisine && (
                        <Badge
                          variant="secondary"
                          className={theme === "dark" ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-blue-100 text-blue-700"}
                        >
                          {recipe.cuisine}
                        </Badge>
                      )}
                      {recipe.dietary_tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className={theme === "dark" ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-gray-100 text-gray-700"}
                        >
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

        <div className="mt-12 flex justify-center">
          <div className="w-full max-w-6xl" style={{ width: "95%" }}>
            <Card className={`${cardBgClass} backdrop-blur-sm border-0 shadow-lg`}>
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-2xl font-bold ${textClass}`}>Ingredients</h3>
                    {user && (
                      <Button
                        size="sm"
                        onClick={addIngredientsToShoppingList}
                        className={
                          theme === "dark"
                            ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
                            : "bg-orange-500 hover:bg-orange-600"
                        }
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Add All to Shopping List
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {recipe.ingredients.map((ingredient, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-3 p-3 backdrop-blur-sm rounded-lg shadow-sm ${infoBgClass}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 w-4 h-4 text-orange-600 rounded"
                          aria-label={`Check ingredient: ${ingredient.amount} ${ingredient.unit} ${ingredient.name}`}
                        />
                        <span className={`text-sm leading-relaxed font-medium ${textClass}`}>
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

        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-4xl" style={{ width: "85%" }}>
            <Card className={`${cardBgClass} backdrop-blur-sm border-0 shadow-lg`}>
              <CardContent className="p-8">
                <div className="space-y-6">
                  <h3 className={`text-2xl font-bold ${textClass} flex items-center gap-2`}>
                    <ChefHat className="h-6 w-6 text-orange-500" />
                    Instructions
                  </h3>
                  <div className="space-y-4">
                    {recipe.instructions.map((instruction, index) => (
                      <div
                        key={index}
                        className={`flex gap-4 p-4 backdrop-blur-sm rounded-lg shadow-sm ${infoBgClass}`}
                      >
                        <div
                          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${theme === "dark" ? "bg-[#e8dcc4] text-[#181813]" : "bg-orange-500 text-white"}`}
                        >
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className={`leading-relaxed ${textClass}`}>
                            {typeof instruction === "string"
                              ? instruction
                              : instruction.description || instruction.step || "Step description not available"}
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

        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-6xl" style={{ width: "95%" }}>
            <RecipeReviews recipeId={recipe.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
