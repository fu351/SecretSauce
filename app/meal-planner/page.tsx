"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock, Users, Heart, Grid, CalendarIcon } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import Link from "next/link"
import { uniq } from "lodash" // Add lodash or use a simple deduplication function
import { useRouter } from "next/navigation"

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
  instructions: any[]
  user_id: string
}

interface MealEntry {
  meal_type: "breakfast" | "lunch" | "dinner" | "snack"
  date: string // ISO date string
  recipe_id: string
}

interface MealPlan {
  id: string
  week_start: string
  meals: MealEntry[]
  shopping_list: any
  total_budget: number
  created_at: string
  updated_at: string
}

export default function MealPlannerPage() {
  const { user } = useAuth()
  const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([])
  const [suggestedRecipes, setSuggestedRecipes] = useState<Recipe[]>([])
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [recipesById, setRecipesById] = useState<Record<string, Recipe>>({})
  const [loading, setLoading] = useState(true)
  const [showFavorites, setShowFavorites] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0])
  const [viewMode, setViewMode] = useState<"daily" | "weekly">("daily")
  const [draggedRecipe, setDraggedRecipe] = useState<string | null>(null)
  const [weekDates, setWeekDates] = useState<string[]>([])
  const router = useRouter()

  // Generate week dates based on selected date
  useEffect(() => {
    const date = new Date(selectedDate)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Monday as start
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
    if (user && user.id) {
      console.log("User authenticated, loading data for:", user.id)
      loadAllData()
    } else {
      console.log("No authenticated user, skipping data load")
      setLoading(false)
    }
    // eslint-disable-next-line
  }, [user, selectedDate, viewMode, weekDates])

  const loadAllData = async () => {
    setLoading(true)
    try {
      console.log("Loading all data for user:", user?.id, "User object:", user)
      
      // Load data sequentially to better handle errors
      await loadFavoriteRecipes()
      await loadSuggestedRecipes()
      await loadMealPlan()
      
    } catch (error) {
      console.error("Error loading data:", error)
      // Don't let errors crash the component
    } finally {
      setLoading(false)
    }
  }

  // 1. Load meal plan for the week and fetch all referenced recipes
  const loadMealPlan = async () => {
    try {
      // Find the start of the week for the selected date
      const date = new Date(selectedDate)
      const day = date.getDay()
      const diff = date.getDate() - day + (day === 0 ? -6 : 1)
      const weekStart = new Date(date.setDate(diff)).toISOString().split("T")[0]

      const { data, error } = await supabase
        .from("meal_plans")
        .select("*")
        .eq("user_id", user?.id)
        .eq("week_start", weekStart)
        .single()

      if (error && error.code !== "PGRST116") throw error

      if (!data) {
        setMealPlan(null)
        setRecipesById({})
        return
      }

      setMealPlan(data)

      // Gather all recipe_ids from meals JSONB
      const meals: MealEntry[] = data.meals || []
      const recipeIds = uniq(meals.map((m) => m.recipe_id))

      if (recipeIds.length === 0) {
        setRecipesById({})
        return
      }

      // Fetch all recipes for this week
      const { data: recipes, error: recipesError } = await supabase
        .from("recipes")
        .select("*")
        .in("id", recipeIds)

      if (recipesError) throw recipesError

      // Map recipes by ID for quick lookup
      const recipesMap: Record<string, Recipe> = {}
      recipes.forEach((r: Recipe) => {
        recipesMap[r.id] = r
      })
      setRecipesById(recipesMap)
    } catch (error) {
      setMealPlan(null)
      setRecipesById({})
      console.error("Error loading meal plan:", error)
    }
  }

  // 2. Load favorite recipes
  const loadFavoriteRecipes = async () => {
    try {
      console.log("Loading favorite recipes for user:", user?.id)
      
      if (!user?.id) {
        console.log("No user ID, skipping favorite recipes load")
        setFavoriteRecipes([])
        return
      }

      // First get the favorite recipe IDs
      const { data: favoritesData, error: favoritesError } = await supabase
        .from("recipe_favorites")
        .select("recipe_id")
        .eq("user_id", user.id)

      console.log("Favorites data:", favoritesData, "Error:", favoritesError)

      if (favoritesError) {
        console.error("Database error loading favorites:", favoritesError)
        if (favoritesError.code === 'PGRST116' || favoritesError.message?.includes('relation') || favoritesError.message?.includes('table')) {
          console.log("Database table doesn't exist yet, returning empty favorites")
          setFavoriteRecipes([])
          return
        }
        throw favoritesError
      }

      if (!favoritesData || favoritesData.length === 0) {
        console.log("No favorites found")
        setFavoriteRecipes([])
        return
      }

      // Get the recipe IDs
      const recipeIds = favoritesData.map(fav => fav.recipe_id)
      console.log("Recipe IDs to fetch:", recipeIds)

      // Fetch the actual recipes
      const { data: recipesData, error: recipesError } = await supabase
        .from("recipes")
        .select("*")
        .in("id", recipeIds)

      console.log("Recipes data:", recipesData, "Error:", recipesError)

      if (recipesError) {
        console.error("Error fetching recipe details:", recipesError)
        setFavoriteRecipes([])
        return
      }

      console.log("Processed favorite recipes:", recipesData)
      setFavoriteRecipes(recipesData || [])
    } catch (error) {
      console.error("Error loading favorite recipes:", error)
      setFavoriteRecipes([])
    }
  }

  // 3. Load suggested recipes
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
      setSuggestedRecipes([])
      console.error("Error loading suggested recipes:", error)
    }
  }

  // 4. Add a recipe to the meal plan for a specific day/meal_type
  const addToMealPlan = async (recipeId: string, mealType: string, date = selectedDate) => {
    if (!user) return

    // Find the start of the week for the given date
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const weekStart = new Date(d.setDate(diff)).toISOString().split("T")[0]

    // Fetch or create the meal plan for this week
    let currentPlan = mealPlan
    if (!currentPlan || currentPlan.week_start !== weekStart) {
      // Try to fetch from DB
      const { data, error } = await supabase
        .from("meal_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_start", weekStart)
        .single()
      if (error && error.code !== "PGRST116") throw error
      currentPlan = data
    }

    let meals: MealEntry[] = currentPlan?.meals || []
    // Remove any existing entry for this mealType/date
    meals = meals.filter((m) => !(m.date === date && m.meal_type === mealType))
    // Add the new entry
    meals.push({ meal_type: mealType as MealEntry["meal_type"], date, recipe_id: recipeId })

    if (currentPlan) {
      // Update
      const { error } = await supabase
        .from("meal_plans")
        .update({ meals })
        .eq("id", currentPlan.id)
      if (error) throw error
    } else {
      // Insert
      const { error } = await supabase
        .from("meal_plans")
        .insert({
          user_id: user.id,
          week_start: weekStart,
          meals,
        })
      if (error) throw error
    }
    await loadMealPlan()
  }

  // 5. Remove a recipe from the meal plan
  const removeFromMealPlan = async (mealType: string, date: string) => {
    if (!mealPlan) return
    let meals: MealEntry[] = mealPlan.meals || []
    meals = meals.filter((m) => !(m.date === date && m.meal_type === mealType))
    const { error } = await supabase
      .from("meal_plans")
      .update({ meals })
      .eq("id", mealPlan.id)
    if (error) throw error
    await loadMealPlan()
  }

  // Drag and drop handlers
  const handleDragStart = (recipeId: string) => setDraggedRecipe(recipeId)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDrop = (e: React.DragEvent, mealType: string, date = selectedDate) => {
    e.preventDefault()
    if (draggedRecipe) {
      addToMealPlan(draggedRecipe, mealType, date)
      setDraggedRecipe(null)
    }
  }

  // Helpers to get meals for a day/meal type
  const getMealsByType = (mealType: string) => {
    if (!mealPlan) return []
    return (mealPlan.meals || []).filter((m) => m.date === selectedDate && m.meal_type === mealType)
  }
  const getMealsByTypeAndDate = (mealType: string, date: string) => {
    if (!mealPlan) return []
    return (mealPlan.meals || []).filter((m) => m.date === date && m.meal_type === mealType)
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
                aria-label="Select date"
                title="Select date for meal planning"
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
                          {meals.map((meal) => {
                            const recipe = recipesById[meal.recipe_id]
                            if (!recipe) return null
                            return (
                              <div key={meal.recipe_id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                                <img
                                  src={recipe.image_url || "/placeholder.svg?height=60&width=60"}
                                  alt={recipe.title}
                                  className="w-15 h-15 object-cover rounded"
                                />
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-medium text-sm truncate">{recipe.title}</h3>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {(recipe.prep_time || 0) + (recipe.cook_time || 0)}m
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      {recipe.servings}
                                    </span>
                                  </div>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => removeFromMealPlan(meal.meal_type, meal.date)}>
                                  ×
                                </Button>
                              </div>
                            )
                          })}
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
                                {meals.map((meal) => {
                                  const recipe = recipesById[meal.recipe_id]
                                  if (!recipe) return null
                                  return (
                                    <div key={meal.recipe_id} className="flex gap-2 p-1 bg-gray-50 rounded text-xs">
                                      <img
                                        src={recipe.image_url || "/placeholder.svg?height=20&width=20"}
                                        alt={recipe.title}
                                        className="w-5 h-5 object-cover rounded"
                                      />
                                      <span className="truncate flex-1">{recipe.title}</span>
                                      <button
                                        onClick={() => removeFromMealPlan(meal.meal_type, meal.date)}
                                        className="text-gray-400 hover:text-red-500"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  )
                                })}
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
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowFavorites(!showFavorites)}>
                    {showFavorites ? "Hide" : "Show"}
                  </Button>
                  {process.env.NODE_ENV === 'development' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={async () => {
                        // Add a test favorite for debugging
                        if (user && suggestedRecipes.length > 0) {
                          try {
                            const { error } = await supabase
                              .from("recipe_favorites")
                              .insert({
                                user_id: user.id,
                                recipe_id: suggestedRecipes[0].id
                              })
                            if (error) throw error
                            await loadFavoriteRecipes()
                            console.log("Added test favorite")
                          } catch (error) {
                            console.error("Error adding test favorite:", error)
                          }
                        }
                      }}
                    >
                      Add Test
                    </Button>
                  )}
                </div>
              </div>
              {showFavorites && (
                <div className="max-h-64 overflow-y-auto">
                  {favoriteRecipes.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-gray-500 text-sm mb-2">No favorites yet</p>
                      <p className="text-xs text-gray-400 mb-3">
                        Go to the recipes page and click the heart icon to add favorites
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => router.push('/recipes')}
                        className="text-xs"
                      >
                        Browse Recipes
                      </Button>
                    </div>
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
