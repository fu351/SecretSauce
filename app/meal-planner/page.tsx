"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock, Users, ChevronDown, ChevronUp, Heart } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import Link from "next/link"

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
}

interface MealPlan {
  id: string
  date: string
  meal_type: "breakfast" | "lunch" | "dinner" | "snack"
  recipe_id: string
  recipe: Recipe
}

export default function MealPlannerPage() {
  const { user } = useAuth()
  const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([])
  const [suggestedRecipes, setSuggestedRecipes] = useState<Recipe[]>([])
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showFavorites, setShowFavorites] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0])

  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [user, selectedDate])

  const loadData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadFavoriteRecipes(), loadSuggestedRecipes(), loadMealPlans()])
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadFavoriteRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("favorites")
        .select(`
          recipe:recipes (
            id, title, description, prep_time, cook_time, servings,
            difficulty, cuisine, image_url, tags, ingredients, instructions, user_id
          )
        `)
        .eq("user_id", user?.id)

      if (error) throw error

      const recipes = data?.map((item) => item.recipe).filter(Boolean) || []
      setFavoriteRecipes(recipes)
    } catch (error) {
      console.error("Error loading favorite recipes:", error)
    }
  }

  const loadSuggestedRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .limit(12)
        .order("created_at", { ascending: false })

      if (error) throw error

      setSuggestedRecipes(data || [])
    } catch (error) {
      console.error("Error loading suggested recipes:", error)
    }
  }

  const loadMealPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("meal_plans")
        .select(`
          *,
          recipe:recipes (
            id, title, description, prep_time, cook_time, servings,
            difficulty, cuisine, image_url, tags, ingredients, instructions, user_id
          )
        `)
        .eq("user_id", user?.id)
        .eq("date", selectedDate)
        .order("meal_type")

      if (error) throw error

      setMealPlans(data || [])
    } catch (error) {
      console.error("Error loading meal plans:", error)
    }
  }

  const addToMealPlan = async (recipeId: string, mealType: string) => {
    if (!user) return

    try {
      const { error } = await supabase.from("meal_plans").insert({
        user_id: user.id,
        recipe_id: recipeId,
        date: selectedDate,
        meal_type: mealType,
      })

      if (error) throw error

      await loadMealPlans()
    } catch (error) {
      console.error("Error adding to meal plan:", error)
    }
  }

  const removeFromMealPlan = async (mealPlanId: string) => {
    try {
      const { error } = await supabase.from("meal_plans").delete().eq("id", mealPlanId)

      if (error) throw error

      await loadMealPlans()
    } catch (error) {
      console.error("Error removing from meal plan:", error)
    }
  }

  const getMealsByType = (mealType: string) => {
    return mealPlans.filter((plan) => plan.meal_type === mealType)
  }

  const mealTypes = [
    { key: "breakfast", label: "Breakfast", icon: "🌅" },
    { key: "lunch", label: "Lunch", icon: "☀️" },
    { key: "dinner", label: "Dinner", icon: "🌙" },
    { key: "snack", label: "Snacks", icon: "🍎" },
  ]

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>You need to be logged in to use the meal planner.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/auth/signin">
              <Button className="w-full">Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Meal Planner</h1>
        <p className="text-muted-foreground">Plan your meals and organize your week</p>
      </div>

      {/* Date Selection */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Calendar className="w-5 h-5" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
            <span className="text-sm text-muted-foreground">
              {new Date(selectedDate).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Meal Plan for Selected Date */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-bold">Today's Meal Plan</h2>

          {mealTypes.map((mealType) => {
            const meals = getMealsByType(mealType.key)

            return (
              <Card key={mealType.key}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span>{mealType.icon}</span>
                    {mealType.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {meals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No meals planned for {mealType.label.toLowerCase()}</p>
                      <p className="text-sm">Add recipes from your favorites or suggestions</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {meals.map((meal) => (
                        <div key={meal.id} className="flex gap-4 p-4 border rounded-lg">
                          <img
                            src={meal.recipe.image_url || "/placeholder.svg?height=80&width=80"}
                            alt={meal.recipe.title}
                            className="w-20 h-20 object-cover rounded-lg"
                          />
                          <div className="flex-1">
                            <h3 className="font-medium">{meal.recipe.title}</h3>
                            <p className="text-sm text-muted-foreground line-clamp-2">{meal.recipe.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {(meal.recipe.prep_time || 0) + (meal.recipe.cook_time || 0)} min
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {meal.recipe.servings} servings
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Link href={`/recipes/${meal.recipe.id}`}>
                              <Button size="sm" variant="outline">
                                View
                              </Button>
                            </Link>
                            <Button size="sm" variant="destructive" onClick={() => removeFromMealPlan(meal.id)}>
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Recipe Selection Sidebar */}
        <div className="space-y-6">
          {/* Favorite Recipes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-red-500" />
                  Favorite Recipes
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowFavorites(!showFavorites)}>
                  {showFavorites ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>
            </CardHeader>
            {showFavorites && (
              <CardContent>
                {favoriteRecipes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No favorite recipes yet</p>
                ) : (
                  <div className="space-y-4">
                    {favoriteRecipes.slice(0, 6).map((recipe) => (
                      <div key={recipe.id} className="group">
                        <div className="relative">
                          <img
                            src={recipe.image_url || "/placeholder.svg?height=200&width=300"}
                            alt={recipe.title}
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded-lg flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    addToMealPlan(recipe.id, e.target.value)
                                    e.target.value = ""
                                  }
                                }}
                                className="px-2 py-1 rounded text-sm"
                                defaultValue=""
                              >
                                <option value="">Add to...</option>
                                <option value="breakfast">Breakfast</option>
                                <option value="lunch">Lunch</option>
                                <option value="dinner">Dinner</option>
                                <option value="snack">Snack</option>
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2">
                          <h3 className="font-medium text-sm">{recipe.title}</h3>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {(recipe.prep_time || 0) + (recipe.cook_time || 0)} min
                            <Users className="w-3 h-3 ml-2" />
                            {recipe.servings}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Suggested Recipes */}
          <Card>
            <CardHeader>
              <CardTitle>Recipe Suggestions</CardTitle>
              <CardDescription>Discover new recipes to try</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {suggestedRecipes.slice(0, 8).map((recipe) => (
                  <div key={recipe.id} className="group">
                    <div className="relative">
                      <img
                        src={recipe.image_url || "/placeholder.svg?height=120&width=120"}
                        alt={recipe.title}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded-lg flex items-center justify-center">
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              addToMealPlan(recipe.id, e.target.value)
                              e.target.value = ""
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded text-xs"
                          defaultValue=""
                        >
                          <option value="">Add to...</option>
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="dinner">Dinner</option>
                          <option value="snack">Snack</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-1">
                      <h3 className="font-medium text-xs truncate">{recipe.title}</h3>
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Clock className="w-2 h-2" />
                        {(recipe.prep_time || 0) + (recipe.cook_time || 0)}m
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
