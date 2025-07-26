"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock, Users, Heart, Grid, CalendarIcon } from "lucide-react"
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
  const [viewMode, setViewMode] = useState<"daily" | "weekly">("daily")
  const [draggedRecipe, setDraggedRecipe] = useState<string | null>(null)
  const [weekDates, setWeekDates] = useState<string[]>([])
  const [weeklyMealPlans, setWeeklyMealPlans] = useState<Record<string, MealPlan[]>>({})

  // Generate week dates based on selected date
  useEffect(() => {
    const date = new Date(selectedDate)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
    const monday = new Date(date.setDate(diff))

    const weekDays = []
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday)
      nextDay.setDate(monday.getDate() + i)
      weekDays.push(nextDay.toISOString().split("T")[0])
    }

    setWeekDates(weekDays)
  }, [selectedDate])

  useEffect(() => {
    if (user) {
      if (viewMode === "daily") {
        loadData()
      } else {
        loadWeekData()
      }
    }
  }, [user, selectedDate, viewMode, weekDates])

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

  const loadWeekData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadFavoriteRecipes(), loadSuggestedRecipes(), loadWeeklyMealPlans()])
    } catch (error) {
      console.error("Error loading weekly data:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadFavoriteRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("recipe_favorites")
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

  const loadWeeklyMealPlans = async () => {
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
        .in("date", weekDates)
        .order("meal_type")

      if (error) throw error

      // Group by date
      const groupedByDate: Record<string, MealPlan[]> = {}
      weekDates.forEach((date) => {
        groupedByDate[date] = []
      })

      data?.forEach((plan) => {
        if (groupedByDate[plan.date]) {
          groupedByDate[plan.date].push(plan)
        } else {
          groupedByDate[plan.date] = [plan]
        }
      })

      setWeeklyMealPlans(groupedByDate)
    } catch (error) {
      console.error("Error loading weekly meal plans:", error)
    }
  }

  const addToMealPlan = async (recipeId: string, mealType: string, date = selectedDate) => {
    if (!user) return

    try {
      const { error } = await supabase.from("meal_plans").insert({
        user_id: user.id,
        recipe_id: recipeId,
        date: date,
        meal_type: mealType,
      })

      if (error) throw error

      if (viewMode === "daily") {
        await loadMealPlans()
      } else {
        await loadWeeklyMealPlans()
      }
    } catch (error) {
      console.error("Error adding to meal plan:", error)
    }
  }

  const removeFromMealPlan = async (mealPlanId: string) => {
    try {
      const { error } = await supabase.from("meal_plans").delete().eq("id", mealPlanId)

      if (error) throw error

      if (viewMode === "daily") {
        await loadMealPlans()
      } else {
        await loadWeeklyMealPlans()
      }
    } catch (error) {
      console.error("Error removing from meal plan:", error)
    }
  }

  const handleDragStart = (recipeId: string) => {
    setDraggedRecipe(recipeId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, mealType: string, date = selectedDate) => {
    e.preventDefault()
    if (draggedRecipe) {
      addToMealPlan(draggedRecipe, mealType, date)
      setDraggedRecipe(null)
    }
  }

  const getMealsByType = (mealType: string) => {
    return mealPlans.filter((plan) => plan.meal_type === mealType)
  }

  const getMealsByTypeAndDate = (mealType: string, date: string) => {
    return weeklyMealPlans[date]?.filter((plan) => plan.meal_type === mealType) || []
  }

  const mealTypes = [
    { key: "breakfast", label: "Breakfast", icon: "🌅" },
    { key: "lunch", label: "Lunch", icon: "☀️" },
    { key: "dinner", label: "Dinner", icon: "🌙" },
    { key: "snack", label: "Snacks", icon: "🍎" },
  ]

  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <p className="text-gray-500">You need to be logged in to use the meal planner.</p>
          </CardHeader>
          <CardContent>
            <Link href="/auth/signin">
              <Button className="w-full bg-orange-500 hover:bg-orange-600">Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-white border-b px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meal Planner</h1>
            <p className="text-sm text-gray-600">Plan your meals and organize your week</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "daily" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("daily")}
                className={viewMode === "daily" ? "bg-orange-500 hover:bg-orange-600" : ""}
              >
                <CalendarIcon className="w-4 h-4 mr-1" />
                Daily View
              </Button>
              <Button
                variant={viewMode === "weekly" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("weekly")}
                className={viewMode === "weekly" ? "bg-orange-500 hover:bg-orange-600" : ""}
              >
                <Grid className="w-4 h-4 mr-1" />
                Weekly View
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Meal Plan Grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          {viewMode === "daily" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-fit">
              {mealTypes.map((mealType) => {
                const meals = getMealsByType(mealType.key)

                return (
                  <Card
                    key={mealType.key}
                    className="h-fit"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, mealType.key)}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <span>{mealType.icon}</span>
                        {mealType.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {meals.length === 0 ? (
                        <div
                          className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg"
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, mealType.key)}
                        >
                          <p className="text-sm">No {mealType.label.toLowerCase()} planned</p>
                          <p className="text-xs">Drag recipes from the sidebar</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {meals.map((meal) => (
                            <div key={meal.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                              <img
                                src={meal.recipe.image_url || "/placeholder.svg?height=60&width=60"}
                                alt={meal.recipe.title}
                                className="w-15 h-15 object-cover rounded"
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-sm truncate">{meal.recipe.title}</h3>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {(meal.recipe.prep_time || 0) + (meal.recipe.cook_time || 0)}m
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {meal.recipe.servings}
                                  </span>
                                </div>
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => removeFromMealPlan(meal.id)}>
                                ×
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="w-24 p-2 border-b-2 border-r-2 border-gray-200"></th>
                    {weekDates.map((date, index) => (
                      <th key={date} className="p-2 border-b-2 border-gray-200 text-center">
                        <div className="font-medium">{weekdays[index]}</div>
                        <div className="text-xs text-gray-500">{formatDate(date)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mealTypes.map((mealType) => (
                    <tr key={mealType.key}>
                      <td className="p-2 border-r-2 border-gray-200 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{mealType.icon}</span>
                          {mealType.label}
                        </div>
                      </td>
                      {weekDates.map((date) => {
                        const meals = getMealsByTypeAndDate(mealType.key, date)
                        return (
                          <td
                            key={`${date}-${mealType.key}`}
                            className="p-2 border border-gray-100 align-top h-24"
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, mealType.key, date)}
                          >
                            {meals.length === 0 ? (
                              <div className="h-full w-full flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-200 rounded">
                                Drop here
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {meals.map((meal) => (
                                  <div key={meal.id} className="flex gap-2 p-1 bg-gray-50 rounded text-xs">
                                    <img
                                      src={meal.recipe.image_url || "/placeholder.svg?height=20&width=20"}
                                      alt={meal.recipe.title}
                                      className="w-5 h-5 object-cover rounded"
                                    />
                                    <span className="truncate flex-1">{meal.recipe.title}</span>
                                    <button
                                      onClick={() => removeFromMealPlan(meal.id)}
                                      className="text-gray-400 hover:text-red-500"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recipe Sidebar */}
        <div className="w-80 border-l bg-white flex flex-col">
          {/* Favorites Section */}
          <div className="flex-shrink-0 border-b">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500" />
                  Favorites ({favoriteRecipes.length})
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setShowFavorites(!showFavorites)}>
                  {showFavorites ? "Hide" : "Show"}
                </Button>
              </div>

              {showFavorites && (
                <div className="max-h-64 overflow-y-auto">
                  {favoriteRecipes.length === 0 ? (
                    <p className="text-center text-gray-500 py-4 text-sm">No favorites yet</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {favoriteRecipes.slice(0, 8).map((recipe) => (
                        <div
                          key={recipe.id}
                          className="group relative"
                          draggable
                          onDragStart={() => handleDragStart(recipe.id)}
                        >
                          <img
                            src={recipe.image_url || "/placeholder.svg?height=80&width=80"}
                            alt={recipe.title}
                            className="w-full h-20 object-cover rounded cursor-move"
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded flex items-center justify-center">
                            <p className="text-white opacity-0 group-hover:opacity-100 text-xs text-center px-1">
                              Drag to add
                            </p>
                          </div>
                          <p className="text-xs mt-1 truncate">{recipe.title}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Suggested Recipes */}
          <div className="flex-1 overflow-hidden">
            <div className="p-4 h-full flex flex-col">
              <h3 className="font-semibold mb-3">Recipe Suggestions</h3>
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {suggestedRecipes.slice(0, 12).map((recipe) => (
                    <div
                      key={recipe.id}
                      className="group relative"
                      draggable
                      onDragStart={() => handleDragStart(recipe.id)}
                    >
                      <img
                        src={recipe.image_url || "/placeholder.svg?height=80&width=80"}
                        alt={recipe.title}
                        className="w-full h-20 object-cover rounded cursor-move"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded flex items-center justify-center">
                        <p className="text-white opacity-0 group-hover:opacity-100 text-xs text-center px-1">
                          Drag to add
                        </p>
                      </div>
                      <p className="text-xs mt-1 truncate">{recipe.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
