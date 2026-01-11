"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Calendar,
  Heart,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  ChevronRightIcon,
  List,
  Menu,
  Sparkles,
  Loader2,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useIsMobile } from "@/hooks"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks"
import { useShoppingList } from "@/hooks"
import { Recipe } from "@/lib/types"

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

type NutritionTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
  meals: number
}

type MacroKey = "calories" | "protein" | "carbs" | "fat"

const createEmptyNutritionTotals = (): NutritionTotals => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  meals: 0,
})

const WEEKLY_STAT_FIELDS = [
  { key: "calories", label: "Calories", unit: "cal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
] as const

export default function MealPlannerPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const { toast } = useToast()
  const shoppingList = useShoppingList()
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
  const [weeklySummaryPinnedOpen, setWeeklySummaryPinnedOpen] = useState(false)
  const [hasAutoScrolledIntoGrid, setHasAutoScrolledIntoGrid] = useState(false)
  const [recipeSelectionModal, setRecipeSelectionModal] = useState<{
    open: boolean
    mealType: string | null
    date: string | null
  }>({ open: false, mealType: null, date: null })
  const [aiPlannerLoading, setAiPlannerLoading] = useState(false)
  const [aiPlannerProgress, setAiPlannerProgress] = useState<{
    step: number
    message: string
  }>({ step: 0, message: "" })
  const [aiPlanResult, setAiPlanResult] = useState<{
    storeId: string
    totalCost: number
    dinners: Array<{ dayIndex: number; recipeId: string }>
    explanation: string
  } | null>(null)
  const [showAiPlanDialog, setShowAiPlanDialog] = useState(false)
  const router = useRouter()
  const showSidebarOverlayLayout = isMobile && sidebarOpen

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

  useEffect(() => {
    if (loading || hasAutoScrolledIntoGrid) return
    if (typeof window === "undefined") return
    if (window.scrollY > 80) {
      setHasAutoScrolledIntoGrid(true)
      return
    }
    window.requestAnimationFrame(() => {
      window.scrollBy({ top: isMobile ? 240 : 180, behavior: "smooth" })
    })
    setHasAutoScrolledIntoGrid(true)
  }, [hasAutoScrolledIntoGrid, isMobile, loading])

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

  const generateAiWeeklyPlan = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "Please sign in to use the AI planner",
        variant: "destructive",
      })
      return
    }

    // Show dialog immediately with loading state
    setAiPlanResult(null)
    setAiPlannerLoading(true)
    setAiPlannerProgress({ step: 1, message: "Analyzing your preferences and pantry..." })
    setShowAiPlanDialog(true)

    try {
      // Simulate progress updates (the API doesn't stream, so we estimate timing)
      const progressTimer = setTimeout(() => {
        setAiPlannerProgress({ step: 2, message: "Searching recipes that match your taste..." })
      }, 1500)

      const progressTimer2 = setTimeout(() => {
        setAiPlannerProgress({ step: 3, message: "Comparing prices across stores..." })
      }, 4000)

      const progressTimer3 = setTimeout(() => {
        setAiPlannerProgress({ step: 4, message: "Optimizing for variety and budget..." })
      }, 7000)

      const response = await fetch("/api/weekly-dinner-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      })

      // Clear progress timers
      clearTimeout(progressTimer)
      clearTimeout(progressTimer2)
      clearTimeout(progressTimer3)

      if (!response.ok) {
        throw new Error("Failed to generate plan")
      }

      setAiPlannerProgress({ step: 5, message: "Finalizing your meal plan..." })

      const plan = await response.json()

      // Fetch recipe details for the plan
      if (plan.dinners && plan.dinners.length > 0) {
        const recipeIds = plan.dinners.map((d: any) => d.recipeId)
        const { data: recipes } = await supabase
          .from("recipes")
          .select("*")
          .in("id", recipeIds)

        if (recipes) {
          const newRecipesById = { ...recipesById }
          recipes.forEach((recipe: any) => {
            newRecipesById[recipe.id] = recipe as Recipe
          })
          setRecipesById(newRecipesById)
        }
      }

      setAiPlanResult(plan)
      setAiPlannerProgress({ step: 6, message: "Complete!" })
    } catch (error) {
      console.error("[AI Planner] Error:", error)
      setShowAiPlanDialog(false)
      toast({
        title: "AI Planner Error",
        description: "Failed to generate weekly plan. Please try again.",
        variant: "destructive",
      })
    } finally {
      setAiPlannerLoading(false)
    }
  }

  const applyAiPlanToMealPlanner = async () => {
    if (!aiPlanResult || !user) return

    try {
      const newMeals: MealEntry[] = []

      for (const dinner of aiPlanResult.dinners) {
        const date = weekDates[dinner.dayIndex]
        if (date) {
          newMeals.push({
            meal_type: "dinner",
            date,
            recipe_id: dinner.recipeId,
          })
        }
      }

      const existingMeals = mealPlan?.meals || []
      const nonDinnerMeals = existingMeals.filter(m => m.meal_type !== "dinner" || !weekDates.includes(m.date))
      const updatedMeals = [...nonDinnerMeals, ...newMeals]

      const planData = {
        user_id: user.id,
        week_start: weekDates[0],
        meals: updatedMeals,
        shopping_list: mealPlan?.shopping_list || null,
        total_budget: mealPlan?.total_budget || null,
      }

      if (mealPlan?.id) {
        await supabase.from("meal_plans").update(planData).eq("id", mealPlan.id)
      } else {
        const { data } = await supabase.from("meal_plans").insert(planData).select().single()
        if (data) {
          setMealPlan(data as MealPlan)
        }
      }

      await loadAllData()
      setShowAiPlanDialog(false)

      toast({
        title: "Success",
        description: `7-day dinner plan applied! Estimated cost: $${aiPlanResult.totalCost.toFixed(2)} at ${aiPlanResult.storeId}`,
      })
    } catch (error) {
      console.error("[AI Planner] Error applying plan:", error)
      toast({
        title: "Error",
        description: "Failed to apply AI plan. Please try again.",
        variant: "destructive",
      })
    }
  }

  const addToShoppingList = async () => {
    if (!mealPlan || !user) return

    try {
      let addedCount = 0
      const recipesProcessed = new Set<string>()

      // Add each unique recipe from the meal plan to the shopping list
      for (const meal of mealPlan.meals) {
        if (recipesProcessed.has(meal.recipe_id)) continue
        recipesProcessed.add(meal.recipe_id)

        await shoppingList.addRecipeToCart(meal.recipe_id)
        addedCount += 1
      }

      toast({
        title: "Added to shopping list",
        description: `Added ${addedCount} recipe${addedCount !== 1 ? "s" : ""} to your shopping list.`,
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

  const openRecipeSelector = (mealType: string, date: string) => {
    setRecipeSelectionModal({ open: true, mealType, date })
  }

  const closeRecipeSelector = () => {
    setRecipeSelectionModal({ open: false, mealType: null, date: null })
  }

  const handleRecipeSelection = async (recipe: Recipe) => {
    if (recipeSelectionModal.mealType && recipeSelectionModal.date) {
      await addToMealPlan(recipe, recipeSelectionModal.mealType, recipeSelectionModal.date)
      closeRecipeSelector()
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

  const dailyNutritionTotals = useMemo(() => {
    if (!weekDates.length) return {} as Record<string, NutritionTotals>
    const totals: Record<string, NutritionTotals> = {}
    weekDates.forEach((date) => {
      totals[date] = { ...createEmptyNutritionTotals() }
    })

    const weekSet = new Set(weekDates)
    const meals = mealPlan?.meals || []
    meals.forEach((meal) => {
      if (!weekSet.has(meal.date)) return
      const recipe = recipesById[meal.recipe_id]
      if (!recipe?.nutrition) return
      const dayTotals = totals[meal.date] ?? (totals[meal.date] = { ...createEmptyNutritionTotals() })
      dayTotals.calories += recipe.nutrition.calories || 0
      dayTotals.protein += recipe.nutrition.protein || 0
      dayTotals.carbs += recipe.nutrition.carbs || 0
      dayTotals.fat += recipe.nutrition.fat || 0
      dayTotals.meals += 1
    })

    return totals
  }, [mealPlan?.meals, weekDates, recipesById])

  const weeklyNutritionSummary = useMemo<{
    totals: Record<MacroKey, number>
    averages: Record<MacroKey, number>
  }>(() => {
    const totals: Record<MacroKey, number> = { calories: 0, protein: 0, carbs: 0, fat: 0 }
    weekDates.forEach((date) => {
      const dayTotals = dailyNutritionTotals[date]
      if (!dayTotals) return
      totals.calories += dayTotals.calories
      totals.protein += dayTotals.protein
      totals.carbs += dayTotals.carbs
      totals.fat += dayTotals.fat
    })
    const divisor = weekDates.length || 1
    const averages: Record<MacroKey, number> = {
      calories: totals.calories / divisor,
      protein: totals.protein / divisor,
      carbs: totals.carbs / divisor,
      fat: totals.fat / divisor,
    }
    return { totals, averages }
  }, [dailyNutritionTotals, weekDates])
  function getSidebarClassName(isMobile: boolean, sidebarOpen: boolean) {
    if (isMobile) {
      return sidebarOpen
        ? "fixed top-16 left-0 right-0 bottom-0 z-50 flex flex-col max-h-screen overflow-y-auto"
        : "hidden"
    } else {
      return sidebarOpen
        ? "w-80 md:w-96 max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
        : "w-0 max-h-[calc(100vh-2rem)]"
    }
  }

  const sidebarClassName = getSidebarClassName(isMobile, sidebarOpen)
  const stickySidebarClass = isMobile ? "" : "md:sticky md:top-6 md:h-[calc(100vh-3rem)] md:self-start"
  const dayContainerClass = showSidebarOverlayLayout ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-wrap gap-3 xl:flex-nowrap"
  const dayCardFlexStyle = showSidebarOverlayLayout
    ? undefined
    : ({ flex: "1 1 calc(14.285% - 12px)", minWidth: 140, maxWidth: 210 } as React.CSSProperties)

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
    <div className="min-h-screen flex flex-col md:flex-row bg-background"
    data-tutorial="planner-overview"
    >
      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header Section */}
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold text-text">Meal Planner</h1>
                {isMobile && (
                  <Button
                    size="sm"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className={
                      isDark
                        ? "bg-accent text-accent-foreground hover:bg-accent/90"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }
                  >
                    <Menu className="h-4 w-4 mr-2" />
                    Recipes
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full">
                <div className="flex items-center bg-card rounded-lg shadow-sm border border-border p-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={goToPreviousWeek}
                    className="h-9 w-9 hover:bg-accent"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <span className="px-4 text-sm font-semibold text-text min-w-[140px] text-center">
                    {formatDate(weekDates[0] || "")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={goToNextWeek}
                    className="h-9 w-9 hover:bg-accent"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>

                <div className="flex items-center bg-card rounded-lg shadow-sm border border-border p-1">
                  <Button
                    variant={viewMode === "by-day" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("by-day")}
                    className={`flex-1 sm:flex-none transition-all ${
                      viewMode === "by-day" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent"
                    }`}
                    title="By Day"
                  >
                    <Calendar className={`h-4 w-4 ${!sidebarOpen && !isMobile ? "mr-2" : ""}`} />
                    {!sidebarOpen && !isMobile && "By Day"}
                  </Button>
                  <Button
                    variant={viewMode === "by-meal" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("by-meal")}
                    className={`flex-1 sm:flex-none transition-all ${
                      viewMode === "by-meal" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent"
                    }`}
                    title="By Meal"
                  >
                    <List className={`h-4 w-4 ${!sidebarOpen && !isMobile ? "mr-2" : ""}`} />
                    {!sidebarOpen && !isMobile && "By Meal"}
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="!bg-gradient-to-r !from-purple-600 !to-blue-600 !text-white hover:!from-purple-700 hover:!to-blue-700 shadow-sm shrink-0"
                    onClick={generateAiWeeklyPlan}
                    disabled={aiPlannerLoading}
                    data-tutorial= "planner-ai"
                  >
                    {aiPlannerLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {isMobile ? "AI Plan" : "AI Weekly Planner"}
                  </Button>
                  <Button
                    className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shrink-0"
                    onClick={async () => {
                      await addToShoppingList()
                      // Navigate to shopping page with expanded list
                      router.push("/shopping?expandList=true")
                    }}
                    data-tutorial="planner-add"
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    {isMobile ? "Add to Cart" : "Add to Shopping List"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

            {weekDates.length > 0 && (
              <div
                className={`rounded-2xl border border-border bg-card/60 shadow-sm p-2.5 md:p-3 transition-colors`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2"
                data-tutorial="planner-macros">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Weekly snapshot</p>
                    <p className={`text-sm font-semibold ${textClass}`}>
                      {Math.round(weeklyNutritionSummary.averages.calories) || 0} cal avg · {Math.round(weeklyNutritionSummary.totals.calories) || 0} total
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={weeklySummaryPinnedOpen}
                    aria-expanded={weeklySummaryPinnedOpen}
                    aria-controls="weekly-summary-panel"
                    onClick={() => setWeeklySummaryPinnedOpen((prev) => !prev)}
                    className={`h-7 px-2 text-[11px] ${isDark ? "text-[#e8dcc4] hover:bg-[#e8dcc4]/10" : "text-gray-700"}`}
                  >
                    {weeklySummaryPinnedOpen ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" /> Hide
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" /> Macros
                      </>
                    )}
                  </Button>
                </div>
                <div
                  id="weekly-summary-panel"
                  className={`transition-[max-height,margin-top] duration-300 ease-out overflow-hidden ${
                    weeklySummaryPinnedOpen ? "max-h-40 mt-2" : "max-h-0 mt-0 pointer-events-none"
                  }`}
                  aria-hidden={!weeklySummaryPinnedOpen}
                >
                  <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
                    {WEEKLY_STAT_FIELDS.map((stat) => (
                      <div
                        key={stat.key}
                        className={`rounded-lg border border-border/50 ${isDark ? "bg-[#181813]" : "bg-white"} p-2`}
                      >
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                        <p className={`text-sm font-semibold ${textClass}`}>
                          {Math.round(weeklyNutritionSummary.averages[stat.key as MacroKey]) || 0} {stat.unit}
                          <span className="text-[10px] font-normal text-muted-foreground ml-1">avg</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          total {Math.round(weeklyNutritionSummary.totals[stat.key as MacroKey]) || 0} {stat.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          {viewMode === "by-day" ? (
            <div className={dayContainerClass}>
              {weekDates.slice(0, 7).map((date, dayIndex) => {
                const dayTotals = dailyNutritionTotals[date] || createEmptyNutritionTotals()
                return (
                  <div
                    key={date}
                    style={dayCardFlexStyle}
                    className={`bg-card border border-border/40 rounded-2xl p-4 flex flex-col gap-3 w-full`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`${isDark ? "bg-accent text-accent-foreground" : "bg-gray-100 text-gray-600"} rounded-full w-9 h-9 flex items-center justify-center font-semibold text-sm`}
                        >
                          {new Date(date).getDate()}
                        </div>
                        <div>
                          <h2 className={`text-lg font-semibold text-text`}>{weekdays[dayIndex]}</h2>
                          <p className={`text-xs text-muted-foreground`}>{formatDate(date)}</p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{dayTotals.meals} meals</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {WEEKLY_STAT_FIELDS.map((stat) => (
                        <div
                          key={`${date}-${stat.key}`}
                          className={`${isDark ? "bg-[#181813]" : "bg-gray-50"} rounded-md p-2`}
                        >
                          <p className="text-[10px] uppercase text-muted-foreground">{stat.label}</p>
                          <p className={`font-semibold ${textClass}`}>
                            {Math.round(dayTotals[stat.key as MacroKey]) || 0} {stat.unit}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col divide-y divide-border/40">
                      {mealTypes.map((mealType) => {
                        const recipe = getMealForSlot(date, mealType.key)
                        return (
                          <div key={mealType.key} className="flex flex-col py-2 first:pt-0 last:pb-0">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className={`text-[11px] font-semibold text-text`}>{mealType.label}</h3>
                            </div>
                            <div
                              className={`relative rounded-lg border group ${
                                recipe
                                  ? "border-border/40"
                                  : isDark
                                    ? "border-accent/20 bg-background"
                                    : "border-border bg-background"
                              } min-h-[100px] transition-colors`}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDrop(e, mealType.key, date)}
                            >
                              {recipe ? (
                                <div className="relative h-full">
                                  <img
                                    src={recipe.image_url || "/placeholder.svg?height=160&width=260"}
                                    alt={recipe.title}
                                    className="w-full h-24 object-cover rounded-lg"
                                  />
                                  <button
                                    onClick={() => removeFromMealPlan(mealType.key, date)}
                                    className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 z-20"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                  <div className="p-2">
                                    <h4 className={`font-semibold text-xs mb-1 line-clamp-2 text-text`}>
                                      {recipe.title}
                                    </h4>
                                  </div>
                                  {recipe.nutrition && (
                                    <div
                                      className={`absolute inset-0 rounded-lg ${
                                        isDark ? "bg-black/70" : "bg-black/60"
                                      } text-white opacity-0 group-hover:opacity-100 transition-opacity text-[10px] flex flex-col justify-center p-3 pointer-events-none z-10`}
                                    >
                                      <p className="uppercase tracking-wide text-[9px] mb-2 text-white/70">Nutrition</p>
                                      <div className="grid grid-cols-4 gap-2 text-center">
                                        <div>
                                          <div className="text-white/60">CAL</div>
                                          <div className="font-semibold">{recipe.nutrition.calories || "-"}</div>
                                        </div>
                                        <div>
                                          <div className="text-white/60">FAT</div>
                                          <div className="font-semibold">
                                            {recipe.nutrition.fat ? `${recipe.nutrition.fat}g` : "-"}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-white/60">PRO</div>
                                          <div className="font-semibold">
                                            {recipe.nutrition.protein ? `${recipe.nutrition.protein}g` : "-"}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-white/60">CARB</div>
                                          <div className="font-semibold">
                                            {recipe.nutrition.carbs ? `${recipe.nutrition.carbs}g` : "-"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div
                                  className={`flex items-center justify-center h-full text-muted-foreground text-[10px] sm:text-xs px-2 text-center cursor-pointer hover:bg-accent/10 transition-colors`}
                                  onClick={() => openRecipeSelector(mealType.key, date)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      openRecipeSelector(mealType.key, date)
                                    }
                                  }}
                                >
                                  {isMobile ? "Tap to add recipe" : "Click or drag recipe here"}
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
          ) : (
            <div className="space-y-8">
              {mealTypes.map((mealType) => {
                const meals = getMealsByType(mealType.key)
                return (
                  <div key={mealType.key} className={`bg-card rounded-lg border border-border/40 p-5`}>
                    <h2 className={`text-2xl font-bold text-text mb-3`}>{mealType.label}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {weekDates.map((date, dayIndex) => {
                        const recipe = getMealForSlot(date, mealType.key)
                        return (
                          <div key={date}>
                            <div
                              className={`relative rounded-lg border-2 group ${
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
                                <div className="relative">
                                  <img
                                    src={recipe.image_url || "/placeholder.svg?height=180&width=300"}
                                    alt={recipe.title}
                                    className="w-full h-40 object-cover"
                                  />
                                  <button
                                    onClick={() => removeFromMealPlan(mealType.key, date)}
                                    className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 z-20"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                  <div className="p-3">
                                    <h4 className={`font-semibold text-sm line-clamp-2 text-text`}>{recipe.title}</h4>
                                  </div>
                                  {recipe.nutrition && (
                                    <div
                                      className={`absolute inset-0 rounded-lg ${
                                        isDark ? "bg-black/70" : "bg-black/60"
                                      } text-white opacity-0 group-hover:opacity-100 transition-opacity text-xs flex flex-col justify-center p-4 pointer-events-none z-10`}
                                    >
                                      <p className="uppercase tracking-wide text-[11px] mb-2 text-white/70">Nutrition</p>
                                      <div className="grid grid-cols-4 gap-3 text-center text-[11px]">
                                        <div>
                                          <div className="text-white/60">CAL</div>
                                          <div className="font-semibold">{recipe.nutrition.calories || "-"}</div>
                                        </div>
                                        <div>
                                          <div className="text-white/60">FAT</div>
                                          <div className="font-semibold">
                                            {recipe.nutrition.fat ? `${recipe.nutrition.fat}g` : "-"}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-white/60">PRO</div>
                                          <div className="font-semibold">
                                            {recipe.nutrition.protein ? `${recipe.nutrition.protein}g` : "-"}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-white/60">CARB</div>
                                          <div className="font-semibold">
                                            {recipe.nutrition.carbs ? `${recipe.nutrition.carbs}g` : "-"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div
                                  className={`flex items-center justify-center h-[200px] text-muted-foreground text-sm cursor-pointer hover:bg-accent/10 transition-colors`}
                                  onClick={() => openRecipeSelector(mealType.key, date)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      openRecipeSelector(mealType.key, date)
                                    }
                                  }}
                                >
                                  {isMobile ? "Tap to add recipe" : "Click or drag recipe here"}
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
        className={`${sidebarClassName} ${stickySidebarClass} bg-card border-border ${
          isMobile ? "" : "border-l"
        } flex-shrink-0 transition-all duration-300 relative`}
      >
        {!isMobile && (
          <button
            data-tutorial= "planner-sidebar"
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
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border p-4 md:p-6 bg-card">
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

      {/* Recipe Selection Dialog */}
      <Dialog open={recipeSelectionModal.open} onOpenChange={closeRecipeSelector}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {recipeSelectionModal.mealType && recipeSelectionModal.date && (
                <>
                  Select Recipe for {mealTypes.find(m => m.key === recipeSelectionModal.mealType)?.label} on{" "}
                  {formatDate(recipeSelectionModal.date)}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {favoriteRecipes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Heart className="w-5 h-5 text-destructive" />
                  <h3 className="text-lg font-semibold">Favorites ({favoriteRecipes.length})</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {favoriteRecipes.map((recipe) => (
                    <div
                      key={recipe.id}
                      className="group relative cursor-pointer rounded-lg border border-border hover:border-primary transition-colors"
                      onClick={() => handleRecipeSelection(recipe)}
                    >
                      <img
                        src={recipe.image_url || "/placeholder.svg?height=120&width=180"}
                        alt={recipe.title}
                        className="w-full h-24 object-cover rounded-t-lg"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
                        <p className="text-white text-sm opacity-0 group-hover:opacity-100 text-center px-2 font-medium">
                          Add to Plan
                        </p>
                      </div>
                      <div className="p-2">
                        <p className="text-xs line-clamp-2">{recipe.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-lg font-semibold mb-4">Suggested Recipes</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {suggestedRecipes.slice(0, 12).map((recipe) => (
                  <div
                    key={recipe.id}
                    className="group relative cursor-pointer rounded-lg border border-border hover:border-primary transition-colors"
                    onClick={() => handleRecipeSelection(recipe)}
                  >
                    <img
                      src={recipe.image_url || "/placeholder.svg?height=120&width=180"}
                      alt={recipe.title}
                      className="w-full h-24 object-cover rounded-t-lg"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
                      <p className="text-white text-sm opacity-0 group-hover:opacity-100 text-center px-2 font-medium">
                        Add to Plan
                      </p>
                    </div>
                    <div className="p-2">
                      <p className="text-xs line-clamp-2">{recipe.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Weekly Planner Dialog */}
      <Dialog open={showAiPlanDialog} onOpenChange={(open) => {
        if (!open && aiPlannerLoading) return // Prevent closing while loading
        setShowAiPlanDialog(open)
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              AI Weekly Dinner Plan
            </DialogTitle>
          </DialogHeader>

          {/* Loading State with Progress */}
          {aiPlannerLoading && !aiPlanResult && (
            <div className="py-12 space-y-8">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
                  <Sparkles className="h-5 w-5 text-purple-400 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <p className="text-lg font-medium text-center">{aiPlannerProgress.message}</p>
              </div>

              {/* Progress Steps */}
              <div className="space-y-3 max-w-sm mx-auto">
                {[
                  { step: 1, label: "Analyzing preferences" },
                  { step: 2, label: "Searching recipes" },
                  { step: 3, label: "Comparing store prices" },
                  { step: 4, label: "Optimizing for budget" },
                  { step: 5, label: "Finalizing plan" },
                ].map(({ step, label }) => (
                  <div key={step} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                      aiPlannerProgress.step > step
                        ? "bg-green-500 text-white"
                        : aiPlannerProgress.step === step
                          ? "bg-purple-600 text-white animate-pulse"
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {aiPlannerProgress.step > step ? "✓" : step}
                    </div>
                    <span className={`text-sm ${
                      aiPlannerProgress.step >= step ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aiPlanResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Store</p>
                    <p className="font-semibold text-lg capitalize">{aiPlanResult.storeId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Cost</p>
                    <p className="font-semibold text-lg text-green-600 dark:text-green-400">
                      ${aiPlanResult.totalCost.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Explanation */}
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">{aiPlanResult.explanation}</p>
              </div>

              {/* Weekly Schedule */}
              <div>
                <h3 className="font-semibold mb-3">7-Day Dinner Schedule</h3>
                <div className="space-y-2">
                  {aiPlanResult.dinners.map((dinner) => {
                    const recipe = recipesById[dinner.recipeId]
                    const dayName = weekdaysFull[dinner.dayIndex] || `Day ${dinner.dayIndex + 1}`

                    return (
                      <div
                        key={dinner.dayIndex}
                        className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="w-16 text-center">
                          <p className="text-xs text-muted-foreground">{dayName.slice(0, 3).toUpperCase()}</p>
                        </div>
                        {recipe ? (
                          <>
                            {recipe.image_url && (
                              <img
                                src={recipe.image_url}
                                alt={recipe.title}
                                className="w-12 h-12 rounded object-cover"
                              />
                            )}
                            <div className="flex-1">
                              <p className="font-medium text-sm">{recipe.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {recipe.prep_time ? `${recipe.prep_time + (recipe.cook_time || 0)} min` : ""}
                              </p>
                            </div>
                          </>
                        ) : (
                          <div className="flex-1">
                            <p className="text-sm text-muted-foreground">Loading recipe...</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAiPlanDialog(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={applyAiPlanToMealPlanner}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                >
                  Apply to Meal Planner
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
