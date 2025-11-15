"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar, Heart, X, ChevronLeft, ChevronRight, ShoppingCart, ChevronRightIcon, List, Menu } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useIsMobile } from "@/hooks/use-mobile"
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
  const isMobile = useIsMobile()
  const { toast } = useToast()
  const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([])
  const [suggestedRecipes, setSuggestedRecipes] = useState<Recipe[]>([])
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [recipesById, setRecipesById] = useState<Record<string, Recipe>>({})
  const [loading, setLoading] = useState(true)
  const [weekDates, setWeekDates] = useState<string[]>([])
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date())
  const [draggedRecipe, setDraggedRecipe] = useState<Recipe | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
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
        .maybeSingle()

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
        .maybeSingle()

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

      const { data: existingListData, error: fetchError } = await supabase
        .from("shopping_lists")
        .select("items")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)

      if (fetchError && fetchError.code !== "PGRST116") throw fetchError

      const existingItems = existingListData && existingListData.length > 0 ? existingListData[0]?.items || [] : []
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

  const isDark = theme === "dark"
  const bgClass = isDark ? "bg-[#181813]" : "bg-gray-50"
  const textClass = isDark ? "text-[#e8dcc4]" : "text-gray-900"
  const mutedTextClass = isDark ? "text-[#e8dcc4]/70" : "text-gray-600"
  const cardBgClass = isDark ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white"
  const buttonClass = isDark
    ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
    : "bg-gray-900 hover:bg-gray-800 text-white"
  const buttonOutlineClass = isDark
    ? "border-[#e8dcc4]/40 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 hover:text-[#e8dcc4]"
    : "border-gray-300 hover:bg-[#e8dcc4]/10"
  function getSidebarClassName(isMobile: boolean, sidebarOpen: boolean) {
    if (isMobile) {
      return sidebarOpen
        ? "fixed inset-0 z-50 flex flex-col max-h-screen overflow-y-auto"
        : "hidden"
    } else {
      return sidebarOpen
        ? "w-80 md:w-96 max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
        : "w-0 max-h-[calc(100vh-2rem)]"
    }
  }

  const sidebarClassName = getSidebarClassName(isMobile, sidebarOpen)

  if (!user) {
    return (
      <div className={`h-screen flex items-center justify-center bg-background`}>
        <Card className="bg-card">
          <CardContent className="p-6 text-center">
            <h2 className={`text-2xl font-bold mb-4 text-text`}>Authentication Required</h2>
            <p className={`text-muted-foreground mb-6`}>You need to be logged in to use the meal planner.</p>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
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
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 md:mb-6 gap-3 md:gap-4">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 w-full md:w-auto">
              <h1 className={`text-2xl md:text-3xl font-bold text-text`}>Meal Planner</h1>

              {/* Mobile: Sidebar toggle (top control) */}
              {isMobile && (
                <Button
                  size="sm"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className={`${
                    isDark
                      ? "bg-accent text-accent-foreground hover:bg-accent/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  <Menu className="h-4 w-4 mr-1" />
                  Recipes
                </Button>
              )}

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className={`flex items-center gap-1 md:gap-2 bg-card rounded-lg p-1 shadow`}>
                  <Button variant="ghost" size="icon" onClick={goToPreviousWeek} className="h-8 w-8 md:h-10 md:w-10">
                    <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                  <span className={`px-2 md:px-4 text-xs md:text-sm font-medium text-text`}>
                    {formatDate(weekDates[0] || "")}
                  </span>
                  <Button variant="ghost" size="icon" onClick={goToNextWeek} className="h-8 w-8 md:h-10 md:w-10">
                    <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                </div>

                <div className={`flex items-center gap-1 bg-card rounded-lg p-1 shadow`}>
                  <Button
                    variant={viewMode === "by-day" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("by-day")}
                    className={`text-xs md:text-sm ${viewMode === "by-day" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                  >
                    <Calendar className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                    {!isMobile && "By Day"}
                  </Button>
                  <Button
                    variant={viewMode === "by-meal" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("by-meal")}
                    className={`text-xs md:text-sm ${viewMode === "by-meal" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                  >
                    <List className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                    {!isMobile && "By Meal"}
                  </Button>
                </div>
              </div>
            </div>

            <Button
              size={isMobile ? "sm" : "default"}
              className={`w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90 text-xs md:text-sm relative md:ml-4`}
              onClick={addToShoppingList}
              data-tutorial="meal-plan-add"
            >
              <ShoppingCart className="h-3 w-3 md:h-4 md:w-4 mr-2" />
              {isMobile ? "ADD TO CART" : "ADD TO SHOPPING LIST"}
            </Button>
          </div>

          {viewMode === "by-day" ? (
            <div className="space-y-4 md:space-y-8">
              {weekDates.slice(0, 7).map((date, dayIndex) => (
                <div key={date} className={`bg-card rounded-lg shadow p-3 md:p-6`}>
                  <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                    <div
                      className={`${isDark ? "bg-accent text-accent-foreground" : "bg-gray-100 text-gray-600"} rounded-full w-10 h-10 md:w-12 md:h-12 flex items-center justify-center font-bold text-sm md:text-base`}
                    >
                      {new Date(date).getDate()}
                    </div>
                    <div>
                      <h2 className={`text-xl md:text-2xl font-bold text-text`}>{weekdays[dayIndex]}</h2>
                      <p className={`text-xs md:text-sm text-muted-foreground`}>{formatDate(date)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    {mealTypes.map((mealType) => {
                      const recipe = getMealForSlot(date, mealType.key)

                      return (
                        <div key={mealType.key}>
                          <h3 className={`text-xs font-semibold text-text mb-2`}>{mealType.label}</h3>
                          <div
                            className={`relative rounded-lg border-2 border-dashed ${
                              recipe
                                ? "border-transparent"
                                : isDark
                                  ? "border-accent/20 bg-background"
                                  : "border-border bg-background"
                            } min-h-[150px] md:min-h-[180px] transition-colors`}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, mealType.key, date)}
                          >
                            {recipe ? (
                              <div className="relative group h-full">
                                <img
                                  src={recipe.image_url || "/placeholder.svg?height=180&width=300"}
                                  alt={recipe.title}
                                  className="w-full h-32 md:h-40 object-cover rounded-lg"
                                />
                                <button
                                  onClick={() => removeFromMealPlan(mealType.key, date)}
                                  className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3 md:h-4 md:w-4" />
                                </button>
                                <div className="p-2 md:p-3">
                                  <h4 className={`font-semibold text-xs md:text-sm mb-2 line-clamp-2 text-text`}>
                                    {recipe.title}
                                  </h4>
                                  {recipe.nutrition && !isMobile && (
                                    <div className="grid grid-cols-4 gap-1 md:gap-2 text-xs">
                                      <div>
                                        <div className="text-muted-foreground">CAL</div>
                                        <div className={`font-semibold text-text`}>
                                          {recipe.nutrition.calories || "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">FAT</div>
                                        <div className={`font-semibold text-text`}>
                                          {recipe.nutrition.fat ? `${recipe.nutrition.fat}g` : "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">PRO</div>
                                        <div className={`font-semibold text-text`}>
                                          {recipe.nutrition.protein ? `${recipe.nutrition.protein}g` : "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">CARB</div>
                                        <div className={`font-semibold text-text`}>
                                          {recipe.nutrition.carbs ? `${recipe.nutrition.carbs}g` : "-"}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div
                                className={`flex items-center justify-center h-full text-muted-foreground text-xs md:text-sm px-2 text-center`}
                              >
                                {isMobile ? "Tap recipe below" : "Drag recipe here"}
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
                  <div key={mealType.key} className={`bg-card rounded-lg shadow p-6`}>
                    <h2 className={`text-2xl font-bold text-text mb-4`}>{mealType.label}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {weekDates.map((date, dayIndex) => {
                        const recipe = getMealForSlot(date, mealType.key)
                        return (
                          <div key={date}>
                            <div
                              className={`relative rounded-lg border-2 ${
                                recipe
                                  ? isDark
                                    ? "border-accent/20"
                                    : "border-border"
                                  : isDark
                                    ? "border-dashed border-accent/20 bg-background"
                                    : "border-dashed border-border bg-background"
                              } min-h-[250px] transition-colors`}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDrop(e, mealType.key, date)}
                            >
                              <div
                                className={`${isDark ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"} text-xs font-semibold py-1 px-3 rounded-t-lg`}
                              >
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
                                    className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                  <div className="p-3">
                                    <h4 className={`font-semibold text-sm line-clamp-2 text-text`}>{recipe.title}</h4>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`flex items-center justify-center h-[200px] text-muted-foreground text-sm`}
                                >
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
        className={`${sidebarClassName} bg-card border-border ${isMobile ? "" : "border-l"} flex-shrink-0 transition-all duration-300 relative`}
      >
        {!isMobile && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`absolute -left-8 top-4 ${
              isDark
                ? "bg-accent text-accent-foreground hover:bg-accent/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            } rounded-xl p-2 shadow-lg z-20 transition-all border border-border`}
            aria-label={sidebarOpen ? "Hide recipes sidebar" : "Show recipes sidebar"}
          >
            {sidebarOpen ? <ChevronRightIcon className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        )}

        {sidebarOpen && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border p-4 md:p-6">
              <h3 className={`text-base md:text-lg font-semibold text-text`}>Recipes</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(false)}
                className="h-8 w-8"
                aria-label="Hide recipes sidebar"
              >
                {isMobile ? <X className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide p-4 md:p-6 space-y-6">
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-base md:text-lg font-semibold flex items-center gap-2 text-text`}>
                    <Heart className="w-4 h-4 md:w-5 md:h-5 text-destructive" />
                    Favorites ({favoriteRecipes.length})
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-2 md:gap-3">
                  {favoriteRecipes.slice(0, 6).map((recipe) => (
                    <div
                      key={recipe.id}
                      className="group relative cursor-pointer"
                      draggable={!isMobile}
                      onDragStart={() => !isMobile && handleDragStart(recipe)}
                      onClick={() => isMobile && addToMealPlan(recipe, "breakfast", weekDates[0])}
                    >
                      <img
                        src={recipe.image_url || "/placeholder.svg?height=100&width=150"}
                        alt={recipe.title}
                        className="w-full h-20 md:h-24 object-cover rounded-lg"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
                        <p className="text-white text-xs opacity-0 group-hover:opacity-100 text-center px-2">
                          {isMobile ? "Tap to add" : "Drag to add"}
                        </p>
                      </div>
                      <p className={`text-xs mt-1 line-clamp-2 text-text`}>{recipe.title}</p>
                    </div>
                  ))}
                </div>
                {favoriteRecipes.length === 0 && (
                  <div className="text-center py-6 md:py-8">
                    <p className={`text-muted-foreground text-sm mb-3`}>No favorites yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push("/recipes")}
                      className="border-border text-text hover:bg-accent hover:text-accent-foreground"
                    >
                      Browse Recipes
                    </Button>
                  </div>
                )}
              </section>

              <section>
                <h3 className={`text-base md:text-lg font-semibold mb-4 text-text`}>Suggested Recipes</h3>
                <div className="grid grid-cols-2 gap-2 md:gap-3">
                  {suggestedRecipes.slice(0, 20).map((recipe) => (
                    <div
                      key={recipe.id}
                      className="group relative cursor-pointer"
                      draggable={!isMobile}
                      onDragStart={() => !isMobile && handleDragStart(recipe)}
                      onClick={() => isMobile && addToMealPlan(recipe, "breakfast", weekDates[0])}
                    >
                      <img
                        src={recipe.image_url || "/placeholder.svg?height=100&width=150"}
                        alt={recipe.title}
                        className="w-full h-20 md:h-24 object-cover rounded-lg"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
                        <p className="text-white text-xs opacity-0 group-hover:opacity-100 text-center px-2">
                          {isMobile ? "Tap to add" : "Drag to add"}
                        </p>
                      </div>
                      <p className={`text-xs mt-1 line-clamp-2 text-text`}>{recipe.title}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: Always-accessible floating toggle when sidebar is closed */}
      {isMobile && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className={`fixed right-3 top-1/2 -translate-y-1/2 z-40 rounded-full p-3 shadow-lg ${
            isDark
              ? "bg-accent text-accent-foreground hover:bg-accent/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          } border border-border`}
          aria-label="Show recipes sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
