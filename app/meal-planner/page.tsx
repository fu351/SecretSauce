"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useIsMobile, useToast, useShoppingList } from "@/hooks"
import { useRouter } from "next/navigation"
import {
  useMealPlanner,
  useMealPlannerRecipes,
  useMealPlannerNutrition,
  useMealPlannerAi,
} from "@/hooks"
import { SignInNotification } from "@/components/shared/signin-notification"
import { WeekNavigator } from "@/components/meal-planner/controls/week-navigator"
import { ViewModeToggle } from "@/components/meal-planner/controls/view-mode-toggle"
import { PlannerActions } from "@/components/meal-planner/controls/planner-actions"
import { NutritionSummaryCard } from "@/components/meal-planner/cards/nutrition-summary-card"
import { ByDayView } from "@/components/meal-planner/views/by-day-view"
import { ByMealView } from "@/components/meal-planner/views/by-meal-view"
import { RecipeSidebar } from "@/components/meal-planner/sidebar/recipe-sidebar"
import { RecipeSelectionModal } from "@/components/meal-planner/modals/recipe-selection-modal"
import { AiPlannerModal } from "@/components/meal-planner/modals/ai-planner-modal"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"

type Recipe = any

const mealTypes = [
  { key: "breakfast", label: "BREAKFAST" },
  { key: "lunch", label: "LUNCH" },
  { key: "dinner", label: "DINNER" },
]

const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
const weekdaysFull = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

export default function MealPlannerPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const { toast } = useToast()
  const shoppingList = useShoppingList()
  const router = useRouter()

  // State
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date())
  const [weekDates, setWeekDates] = useState<string[]>([])
  const [draggedRecipe, setDraggedRecipe] = useState<Recipe | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
  const [viewMode, setViewMode] = useState<"by-day" | "by-meal">("by-day")
  const [recipeSelectionModal, setRecipeSelectionModal] = useState<{
    open: boolean
    mealType: string | null
    date: string | null
  }>({ open: false, mealType: null, date: null })
  const [hasAutoScrolledIntoGrid, setHasAutoScrolledIntoGrid] = useState(false)

  // Custom hooks
  const mealPlanner = useMealPlanner(user?.id, weekDates)
  const recipes = useMealPlannerRecipes(user?.id)
  const nutrition = useMealPlannerNutrition(mealPlanner.mealPlan, weekDates, mealPlanner.recipesById)
  const aiPlanner = useMealPlannerAi(user?.id, weekDates, mealPlanner.mealPlan)

  const isDark = theme === "dark"

  // Week calculation
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

  // Load data when user or weekDates change
  useEffect(() => {
    if (user && weekDates.length > 0) {
      mealPlanner.loadAllData()
      recipes.loadAllRecipes()
    }
  }, [user, weekDates])

  // Auto-scroll to planner
  useEffect(() => {
    if (mealPlanner.loading || hasAutoScrolledIntoGrid) return
    if (typeof window === "undefined") return
    if (window.scrollY > 80) {
      setHasAutoScrolledIntoGrid(true)
      return
    }
    window.requestAnimationFrame(() => {
      window.scrollBy({ top: isMobile ? 240 : 180, behavior: "smooth" })
    })
    setHasAutoScrolledIntoGrid(true)
  }, [hasAutoScrolledIntoGrid, isMobile, mealPlanner.loading])

  // Drag handlers
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
      await mealPlanner.addToMealPlan(draggedRecipe, mealType, date)
      setDraggedRecipe(null)
    }
  }

  // Modal handlers
  const openRecipeSelector = (mealType: string, date: string) => {
    setRecipeSelectionModal({ open: true, mealType, date })
  }

  const closeRecipeSelector = () => {
    setRecipeSelectionModal({ open: false, mealType: null, date: null })
  }

  const handleRecipeSelection = async (recipe: Recipe) => {
    if (recipeSelectionModal.mealType && recipeSelectionModal.date) {
      await mealPlanner.addToMealPlan(recipe, recipeSelectionModal.mealType, recipeSelectionModal.date)
      closeRecipeSelector()
    }
  }

  const getMealForSlot = (date: string, mealType: string) => {
    if (!mealPlanner.mealPlan) return null
    const meal = (mealPlanner.mealPlan.meals || []).find((m: any) => m.date === date && m.meal_type === mealType)
    return meal ? mealPlanner.recipesById[meal.recipe_id] : null
  }

  const handleAddToShoppingList = async () => {
    if (!mealPlanner.mealPlan || !user) return

    try {
      let addedCount = 0
      const recipesProcessed = new Set<string>()

      for (const meal of mealPlanner.mealPlan.meals) {
        if (recipesProcessed.has(meal.recipe_id)) continue
        recipesProcessed.add(meal.recipe_id)

        await shoppingList.addRecipeToCart(meal.recipe_id)
        addedCount += 1
      }

      toast({
        title: "Added to shopping list",
        description: `Added ${addedCount} recipe${addedCount !== 1 ? "s" : ""} to your shopping list.`,
      })
      router.push("/shopping?expandList=true")
    } catch (error) {
      console.error("Error adding to shopping list:", error)
      toast({
        title: "Error",
        description: "Failed to add ingredients to shopping list.",
        variant: "destructive",
      })
    }
  }

  const handleGenerateAiPlan = async () => {
    await aiPlanner.generateAiWeeklyPlan(mealPlanner.recipesById)
  }

  const handleApplyAiPlan = async () => {
    const success = await aiPlanner.applyAiPlanToMealPlanner(mealPlanner.recipesById)
    if (success) {
      await mealPlanner.loadAllData()
    }
  }

  const showSidebarOverlay = isMobile && sidebarOpen

  if (!user) {
    return (
      <div className={`h-screen flex items-center justify-center bg-background`}>
        <SignInNotification featureName="Meal Planner" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background" data-tutorial="planner-overview">
      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col gap-4 mb-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-text">Meal Planner</h1>
              <p className="text-sm text-muted-foreground mt-1">Plan your weekly meals and track nutrition</p>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex items-center gap-3">
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
                <WeekNavigator
                  weekStart={weekDates[0] || ""}
                  onPrevious={() => {
                    const newDate = new Date(currentWeekStart)
                    newDate.setDate(newDate.getDate() - 7)
                    setCurrentWeekStart(newDate)
                  }}
                  onNext={() => {
                    const newDate = new Date(currentWeekStart)
                    newDate.setDate(newDate.getDate() + 7)
                    setCurrentWeekStart(newDate)
                  }}
                />

                <ViewModeToggle
                  viewMode={viewMode}
                  onChange={setViewMode}
                  sidebarOpen={sidebarOpen}
                />

                <PlannerActions
                  onAiPlan={handleGenerateAiPlan}
                  onAddToCart={handleAddToShoppingList}
                  aiLoading={aiPlanner.aiPlannerLoading}
                />
              </div>
            </div>
          </div>

          {/* Main View */}
          {viewMode === "by-day" ? (
            <ByDayView
              weekDates={weekDates}
              weekdays={weekdays}
              mealTypes={mealTypes}
              getMealForSlot={getMealForSlot}
              showSidebarOverlay={showSidebarOverlay}
              onRemove={mealPlanner.removeFromMealPlan}
              onAdd={openRecipeSelector}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          ) : (
            <ByMealView
              weekDates={weekDates}
              weekdaysFull={weekdaysFull}
              mealTypes={mealTypes}
              getMealForSlot={getMealForSlot}
              onRemove={mealPlanner.removeFromMealPlan}
              onAdd={openRecipeSelector}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          )}

          {/* Nutrition Summary */}
          {weekDates.length > 0 && (
            <div className="mt-4 pt-2">
              <NutritionSummaryCard
                weeklyTotals={nutrition.weeklyNutritionSummary.totals}
                weeklyAverages={nutrition.weeklyNutritionSummary.averages}
              />
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <RecipeSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        favoriteRecipes={recipes.favoriteRecipes}
        suggestedRecipes={recipes.suggestedRecipes}
        onDragStart={handleDragStart}
        onRecipeClick={(recipe) => {
          if (isMobile) {
            mealPlanner.addToMealPlan(recipe, "breakfast", weekDates[0])
          }
        }}
        isMobile={isMobile}
      />

      {/* Mobile floating toggle */}
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

      {/* Modals */}
      <RecipeSelectionModal
        open={recipeSelectionModal.open}
        onClose={closeRecipeSelector}
        mealType={recipeSelectionModal.mealType}
        date={recipeSelectionModal.date}
        favoriteRecipes={recipes.favoriteRecipes}
        suggestedRecipes={recipes.suggestedRecipes}
        mealTypes={mealTypes}
        onSelect={handleRecipeSelection}
      />

      <AiPlannerModal
        open={aiPlanner.showAiPlanDialog}
        onClose={() => aiPlanner.setShowAiPlanDialog(false)}
        loading={aiPlanner.aiPlannerLoading}
        progress={aiPlanner.aiPlannerProgress}
        result={aiPlanner.aiPlanResult}
        recipesById={mealPlanner.recipesById}
        weekdaysFull={weekdaysFull}
        onApply={handleApplyAiPlan}
      />
    </div>
  )
}
