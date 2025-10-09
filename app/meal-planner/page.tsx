"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar, Heart, X, ChevronLeft, ChevronRight, ShoppingCart, ChevronRightIcon, List } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

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
  ingredients: any[]
  instructions: any[]
  author_id: string
  nutrition: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  } | null
}

interface MealEntry {
  meal_type: "breakfast" | "lunch" | "dinner"
  date: string
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
  const { theme } = useTheme()
  const { toast } = useToast()
  const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([])
  const [suggestedRecipes, setSuggestedRecipes] = useState<Recipe[]>([])
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [recipesById, setRecipesById] = useState<Record<string, Recipe>>({})
  const [loading, setLoading] = useState(true)
  const [weekDates, setWeekDates] = useState<string[]>([])
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date())
  const [draggedRecipe, setDraggedRecipe] = useState<Recipe | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [viewMode, setViewMode] = useState<"by-day" | "by-meal">("by-day")
  const router = useRouter()

  const mealTypes = [
    { key: "breakfast", label: "BREAKFAST" },
    { key: "lunch", label: "LUNCH" },
    { key: "dinner", label: "DINNER" },
  ]

  const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
  const weekdaysFull = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

  useEffect(() => {
    const date = new Date(currentWeekStart)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(date.setDate(diff))

    const weekDays: string[] = []
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday)
      nextDay.setDate(monday.getDate() + i)
      weekDays.push(nextDay.toISOString().split("T")[0])
    }

    setWeekDates(weekDays)
  }, [currentWeekStart])

  useEffect(() => {
    if (user) {
      loadAllData()
    } else {
      setLoading(false)
    }
  }, [user, weekDates])

  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadFavoriteRecipes(), loadSuggestedRecipes(), loadMealPlan()])
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadMealPlan = async () => {
    if (!user || weekDates.length === 0) return

    try {
      const weekStart = weekDates[0]
      const { data, error } = await supabase
        .from("meal_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_start", weekStart)
        .single()

      if (error && error.code !== "PGRST116") throw error

      if (!data) {
        setMealPlan(null)
        setRecipesById({})
        return
      }

      setMealPlan(data)

      const meals: MealEntry[] = data.meals || []
      const recipeIds = Array.from(new Set(meals.map((m) => m.recipe_id)))

      if (recipeIds.length === 0) {
        setRecipesById({})
        return
      }

      const { data: recipes, error: recipesError } = await supabase.from("recipes").select("*").in("id", recipeIds)

      if (recipesError) throw recipesError

      const recipesMap: Record<string, Recipe> = {}
      recipes.forEach((r: Recipe) => {
        recipesMap[r.id] = r
      })
      setRecipesById(recipesMap)
    } catch (error) {
      console.error("Error loading meal plan:", error)
      setMealPlan(null)
      setRecipesById({})
    }
  }

  const loadFavoriteRecipes = async () => {
    if (!user) return

    try {
      const { data: favoritesData, error: favoritesError } = await supabase
        .from("recipe_favorites")
        .select("recipe_id")
        .eq("user_id", user.id)

      if (favoritesError) {
        if (favoritesError.code === "PGRST116" || favoritesError.message?.includes("relation")) {
          setFavoriteRecipes([])
          return
        }
        throw favoritesError
      }

      if (!favoritesData || favoritesData.length === 0) {
        setFavoriteRecipes([])
        return
      }

      const recipeIds = favoritesData.map((fav) => fav.recipe_id)

      const { data: recipesData, error: recipesError } = await supabase.from("recipes").select("*").in("id", recipeIds)

      if (recipesError) throw recipesError

      setFavoriteRecipes(recipesData || [])
    } catch (error) {
      console.error("Error loading favorite recipes:", error)
      setFavoriteRecipes([])
    }
  }

  const loadSuggestedRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .limit(20)
        .order("created_at", { ascending: false })

      if (error) throw error

      setSuggestedRecipes(data || [])
    } catch (error) {
      console.error("Error loading suggested recipes:", error)
      setSuggestedRecipes([])
    }
  }

  const addToMealPlan = async (recipe: Recipe, mealType: string, date: string) => {
    if (!user) return

    const weekStart = weekDates[0]
    let currentPlan = mealPlan

    if (!currentPlan || currentPlan.week_start !== weekStart) {
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
    meals = meals.filter((m) => !(m.date === date && m.meal_type === mealType))
    meals.push({ meal_type: mealType as MealEntry["meal_type"], date, recipe_id: recipe.id })

    if (currentPlan) {
      const { error } = await supabase.from("meal_plans").update({ meals }).eq("id", currentPlan.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from("meal_plans").insert({
        user_id: user.id,
        week_start: weekStart,
        meals,
      })
      if (error) throw error
    }

    setRecipesById((prev) => ({ ...prev, [recipe.id]: recipe }))
    await loadMealPlan()
  }

  const removeFromMealPlan = async (mealType: string, date: string) => {
    if (!mealPlan) return

    let meals: MealEntry[] = mealPlan.meals || []
    meals = meals.filter((m) => !(m.date === date && m.meal_type === mealType))

    const { error } = await supabase.from("meal_plans").update({ meals }).eq("id", mealPlan.id)
    if (error) throw error

    await loadMealPlan()
  }

  const addToShoppingList = async () => {
    if (!mealPlan || !user) return

    try {
      const ingredientsByRecipe: Record<string, { recipeName: string; ingredients: any[] }> = {}

      mealPlan.meals.forEach((meal) => {
        const recipe = recipesById[meal.recipe_id]
        if (recipe && recipe.ingredients) {
          if (!ingredientsByRecipe[recipe.id]) {
            ingredientsByRecipe[recipe.id] = {
              recipeName: recipe.title,
              ingredients: [],
            }
          }
          ingredientsByRecipe[recipe.id].ingredients.push(...recipe.ingredients)
        }
      })

      const { data: existingList, error: fetchError } = await supabase
        .from("shopping_lists")
        .select("items")
        .eq("user_id", user.id)
        .single()

      if (fetchError && fetchError.code !== "PGRST116") throw fetchError

      const existingItems = existingList?.items || []
      const newItems: any[] = []

      Object.entries(ingredientsByRecipe).forEach(([recipeId, { recipeName, ingredients }]) => {
        ingredients.forEach((ingredient) => {
          newItems.push({
            id: Date.now().toString() + Math.random(),
            name: ingredient.name,
            quantity: Number.parseFloat(ingredient.amount) || 1,
            unit: ingredient.unit || "piece",
            checked: false,
            recipeId: recipeId,
            recipeName: recipeName,
          })
        })
      })

      const mergedItems = [...existingItems, ...newItems]

      const { error: upsertError } = await supabase.from("shopping_lists").upsert({
        user_id: user.id,
        items: mergedItems,
      })

      if (upsertError) throw upsertError

      toast({
        title: "Added to shopping list",
        description: `${newItems.length} ingredients added to your shopping list.`,
      })
    } catch (error) {
      console.error("Error adding to shopping list:", error)
      toast({
        title: "Error",
        description: "Failed to add ingredients to shopping list.",
        variant: "destructive",
      })
    }
  }

  const handleDragStart = (recipe: Recipe) => {
    setDraggedRecipe(recipe)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent, mealType: string, date: string) => {
    e.preventDefault()
    e.stopPropagation()

    if (draggedRecipe) {
      await addToMealPlan(draggedRecipe, mealType, date)
      setDraggedRecipe(null)
    }
  }

  const getMealForSlot = (date: string, mealType: string) => {
    if (!mealPlan) return null
    const meal = (mealPlan.meals || []).find((m) => m.date === date && m.meal_type === mealType)
    return meal ? recipesById[meal.recipe_id] : null
  }

  const getMealsByType = (mealType: string) => {
    if (!mealPlan) return []
    return mealPlan.meals.filter((m) => m.meal_type === mealType)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeekStart)
    newDate.setDate(newDate.getDate() - 7)
    setCurrentWeekStart(newDate)
  }

  const goToNextWeek = () => {
    const newDate = new Date(currentWeekStart)
    newDate.setDate(newDate.getDate() + 7)
    setCurrentWeekStart(newDate)
  }

  const bgClass = theme === "dark" ? "bg-[#181813]" : "bg-gray-50"
  const textClass = theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
  const mutedTextClass = theme === "dark" ? "text-[#e8dcc4]/70" : "text-gray-600"
  const cardBgClass = theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white"
  const sidebarBgClass = theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white"
  const buttonClass =
    theme === "dark" ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]" : "bg-orange-500 hover:bg-orange-600 text-white"
  const dropZoneBgClass = theme === "dark" ? "border-[#e8dcc4]/30 bg-[#252520]" : "border-gray-200 bg-gray-50"

  if (!user) {
    return (
      <div className={`h-screen flex items-center justify-center ${bgClass}`}>
        <Card className={cardBgClass}>
          <CardContent className="p-6 text-center">
            <h2 className={`text-2xl font-serif font-light ${textClass} mb-4`}>Authentication Required</h2>
            <p className={`${mutedTextClass} mb-6`}>You need to be logged in to use the meal planner.</p>
            <Button
              className={
                theme === "dark"
                  ? "w-full bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
                  : "w-full bg-orange-500 hover:bg-orange-600"
              }
              onClick={() => router.push("/auth/signin")}
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={`h-screen flex ${bgClass}`}>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h1 className={`text-3xl font-serif font-light ${textClass}`}>Meal Planner</h1>
              <div className={`flex items-center gap-2 rounded-lg p-1 shadow ${cardBgClass}`}>
                <Button variant="ghost" size="icon" onClick={goToPreviousWeek}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className={`px-4 text-sm font-medium ${textClass}`}>{formatDate(weekDates[0] || "")}</span>
                <Button variant="ghost" size="icon" onClick={goToNextWeek}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex items-center gap-2 rounded-lg p-1 shadow">
                <Button
                  variant={viewMode === "by-day" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("by-day")}
                  className={viewMode === "by-day" ? buttonClass : ""}
                >
                  <Calendar className="h-4 w-4 mr-1" />
                  By Day
                </Button>
                <Button
                  variant={viewMode === "by-meal" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("by-meal")}
                  className={viewMode === "by-meal" ? buttonClass : ""}
                >
                  <List className="h-4 w-4 mr-1" />
                  By Meal
                </Button>
              </div>
            </div>
            <Button className={buttonClass} onClick={addToShoppingList}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              ADD TO SHOPPING LIST
            </Button>
          </div>

          {viewMode === "by-day" ? (
            <div className="space-y-8">
              {weekDates.slice(0, 7).map((date, dayIndex) => (
                <div key={date} className={`rounded-lg shadow p-6 ${cardBgClass}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`rounded-full w-12 h-12 flex items-center justify-center font-bold ${theme === "dark" ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-orange-100 text-orange-600"}`}
                    >
                      {new Date(date).getDate()}
                    </div>
                    <div>
                      <h2 className={`text-2xl font-bold ${textClass}`}>{weekdays[dayIndex]}</h2>
                      <p className={`text-sm ${mutedTextClass}`}>{formatDate(date)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {mealTypes.map((mealType) => {
                      const recipe = getMealForSlot(date, mealType.key)

                      return (
                        <div key={mealType.key}>
                          <h3
                            className={`text-xs font-semibold mb-2 ${theme === "dark" ? "text-[#e8dcc4]" : "text-orange-500"}`}
                          >
                            {mealType.label}
                          </h3>
                          <div
                            className={`relative rounded-lg border-2 border-dashed ${
                              recipe ? `border-transparent ${cardBgClass}` : dropZoneBgClass
                            } min-h-[180px] transition-colors`}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, mealType.key, date)}
                          >
                            {recipe ? (
                              <div className="relative group h-full">
                                <img
                                  src={recipe.image_url || "/placeholder.svg?height=180&width=300"}
                                  alt={recipe.title}
                                  className="w-full h-40 object-cover rounded-lg"
                                />
                                <button
                                  onClick={() => removeFromMealPlan(mealType.key, date)}
                                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                                <div className="p-3">
                                  <h4 className={`font-semibold text-sm mb-2 line-clamp-2 ${textClass}`}>
                                    {recipe.title}
                                  </h4>
                                  {recipe.nutrition && (
                                    <div className="grid grid-cols-4 gap-2 text-xs">
                                      <div>
                                        <div className={mutedTextClass}>CALORIES</div>
                                        <div className={`font-semibold ${textClass}`}>
                                          {recipe.nutrition.calories || "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className={mutedTextClass}>FAT</div>
                                        <div className={`font-semibold ${textClass}`}>
                                          {recipe.nutrition.fat ? `${recipe.nutrition.fat}g` : "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className={mutedTextClass}>PROTEIN</div>
                                        <div className={`font-semibold ${textClass}`}>
                                          {recipe.nutrition.protein ? `${recipe.nutrition.protein}g` : "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className={mutedTextClass}>CARBS</div>
                                        <div className={`font-semibold ${textClass}`}>
                                          {recipe.nutrition.carbs ? `${recipe.nutrition.carbs}g` : "-"}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className={`flex items-center justify-center h-full text-sm ${mutedTextClass}`}>
                                Drag recipe here
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              {mealTypes.map((mealType) => {
                const meals = getMealsByType(mealType.key)
                return (
                  <div key={mealType.key} className={`rounded-lg shadow p-6 ${cardBgClass}`}>
                    <h2 className={`text-2xl font-bold ${textClass} mb-4`}>{mealType.label}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {weekDates.map((date, dayIndex) => {
                        const recipe = getMealForSlot(date, mealType.key)
                        return (
                          <div key={date}>
                            <div
                              className={`relative rounded-lg border-2 ${
                                recipe ? "border-orange-200 bg-white" : "border-dashed border-gray-200 bg-gray-50"
                              } min-h-[250px] transition-colors`}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDrop(e, mealType.key, date)}
                            >
                              <div className="bg-orange-500 text-white text-xs font-semibold py-1 px-3 rounded-t-lg">
                                {weekdaysFull[dayIndex].toUpperCase()}
                              </div>
                              {recipe ? (
                                <div className="relative group">
                                  <img
                                    src={recipe.image_url || "/placeholder.svg?height=180&width=300"}
                                    alt={recipe.title}
                                    className="w-full h-40 object-cover"
                                  />
                                  <button
                                    onClick={() => removeFromMealPlan(mealType.key, date)}
                                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                  <div className="p-3">
                                    <h4 className="font-semibold text-sm line-clamp-2">{recipe.title}</h4>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">
                                  Drag recipe here
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div
        className={`${
          sidebarOpen ? "w-96" : "w-12"
        } ${sidebarBgClass} border-l flex-shrink-0 transition-all duration-300 relative`}
      >
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`absolute left-0 top-20 -translate-x-1/2 border rounded-full p-1.5 shadow-lg z-20 ${theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/20 hover:bg-[#252520]" : "bg-white hover:bg-gray-50"}`}
          style={{ marginLeft: "-2px" }}
        >
          <ChevronRightIcon
            className={`h-4 w-4 transition-transform ${sidebarOpen ? "rotate-180" : ""} ${theme === "dark" ? "text-[#e8dcc4]" : ""}`}
          />
        </button>

        {sidebarOpen && (
          <div className="p-6 overflow-y-auto h-full" style={{ paddingRight: "1.5rem" }}>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold flex items-center gap-2 ${textClass}`}>
                  <Heart className="w-5 h-5 text-red-500" />
                  Favorites ({favoriteRecipes.length})
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {favoriteRecipes.slice(0, 6).map((recipe) => (
                  <div
                    key={recipe.id}
                    className="cursor-move group relative"
                    draggable
                    onDragStart={() => handleDragStart(recipe)}
                  >
                    <img
                      src={recipe.image_url || "/placeholder.svg?height=100&width=150"}
                      alt={recipe.title}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
                      <p className="text-white text-xs opacity-0 group-hover:opacity-100 text-center px-2">
                        Drag to add
                      </p>
                    </div>
                    <p className={`text-xs mt-1 line-clamp-2 ${textClass}`}>{recipe.title}</p>
                  </div>
                ))}
              </div>
              {favoriteRecipes.length === 0 && (
                <div className="text-center py-8">
                  <p className={`${mutedTextClass} text-sm mb-3`}>No favorites yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/recipes")}
                    className={theme === "dark" ? "border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#252520]" : ""}
                  >
                    Browse Recipes
                  </Button>
                </div>
              )}
            </div>

            <div>
              <h3 className={`text-lg font-semibold mb-4 ${textClass}`}>Suggested Recipes</h3>
              <div className="grid grid-cols-2 gap-3">
                {suggestedRecipes.slice(0, 20).map((recipe) => (
                  <div
                    key={recipe.id}
                    className="cursor-move group relative"
                    draggable
                    onDragStart={() => handleDragStart(recipe)}
                  >
                    <img
                      src={recipe.image_url || "/placeholder.svg?height=100&width=150"}
                      alt={recipe.title}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
                      <p className="text-white text-xs opacity-0 group-hover:opacity-100 text-center px-2">
                        Drag to add
                      </p>
                    </div>
                    <p className={`text-xs mt-1 line-clamp-2 ${textClass}`}>{recipe.title}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
