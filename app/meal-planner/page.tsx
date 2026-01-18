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
  useMealPlannerDragDrop,
} from "@/hooks"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { SignInNotification } from "@/components/shared/signin-notification"
import { WeekNavigator } from "@/components/meal-planner/controls/week-navigator"
import { PlannerActions } from "@/components/meal-planner/controls/planner-actions"
import { NutritionSummaryCard } from "@/components/meal-planner/cards/nutrition-summary-card"
import { ByDayView } from "@/components/meal-planner/views/by-day-view"
import { RecipeSelectionModal } from "@/components/meal-planner/modals/recipe-selection-modal"
import { AiPlannerModal } from "@/components/meal-planner/modals/ai-planner-modal"
import { RecipeSearchPanel } from "@/components/meal-planner/panels/recipe-search-panel"
import { CompactRecipeCard } from "@/components/recipe/cards/compact-recipe-card"
import { DragPreviewCard } from "@/components/meal-planner/cards/drag-preview-card"

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
  const [focusMode, setFocusMode] = useState<{
    date: string
    mealType: string
  } | null>(null)
  const [hasAutoScrolledIntoGrid, setHasAutoScrolledIntoGrid] = useState(false)
  const [showRecipeSidebar, setShowRecipeSidebar] = useState(false)

  // Custom hooks
  const mealPlanner = useMealPlanner(user?.id, weekDates)
  const recipes = useMealPlannerRecipes(user?.id)
  const nutrition = useMealPlannerNutrition(mealPlanner.meals, weekDates, mealPlanner.recipesById)
  const aiPlanner = useMealPlannerAi(user?.id, weekDates, mealPlanner.meals)

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
  }, [user, weekDates, mealPlanner, recipes])

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

  // Show sidebar when + button is clicked
  useEffect(() => {
    if (focusMode) {
      setShowRecipeSidebar(true)
    }
  }, [focusMode])

  // Drag and drop hook
  const dnd = useMealPlannerDragDrop({ mealPlanner })

  // Focus mode handlers
  const openRecipeSelector = (mealType: string, date: string) => {
    setFocusMode({ mealType, date })
  }

  const closeFocusMode = () => {
    setFocusMode(null)
  }

  const handleRecipeSelection = async (recipe: Recipe) => {
    if (focusMode) {
      await mealPlanner.addToMealPlan(recipe, focusMode.mealType, focusMode.date)
      // Keep focus mode open for adding more recipes
    }
  }

  const handleFocusModeDateChange = (newDate: string) => {
    if (focusMode) {
      setFocusMode({ ...focusMode, date: newDate })
    }
  }

  const handleFocusModeSlotChange = (newMealType: string) => {
    if (focusMode) {
      setFocusMode({ ...focusMode, mealType: newMealType })
    }
  }

  const getMealForSlot = (date: string, mealType: string) => {
    const meal = mealPlanner.meals.find((m) => m.date === date && m.meal_type === mealType)
    return meal ? mealPlanner.recipesById[meal.recipe_id] : null
  }

  const handleAddToShoppingList = async () => {
    if (!user || mealPlanner.meals.length === 0) return

    try {
      let addedCount = 0
      const recipesProcessed = new Set<string>()

      for (const meal of mealPlanner.meals) {
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
    const success = await aiPlanner.applyAiPlanToMealPlanner()
    if (success) {
      await mealPlanner.loadAllData()
    }
  }

  if (!user) {
    return (
      <div className={`h-screen flex items-center justify-center bg-background`}>
        <SignInNotification featureName="Meal Planner" />
      </div>
    )
  }

  return (
    <DndContext
      sensors={dnd.sensors}
      onDragStart={dnd.handleDragStart}
      onDragOver={dnd.handleDragOver}
      onDragEnd={dnd.handleDragEnd}
      onDragCancel={dnd.handleDragCancel}
    >
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

                <PlannerActions
                  onAiPlan={handleGenerateAiPlan}
                  onAddToCart={handleAddToShoppingList}
                  aiLoading={aiPlanner.aiPlannerLoading}
                />
              </div>
            </div>
          </div>

          <div className="mb-6">
            <ByDayView
              weekDates={weekDates}
              weekdays={weekdays}
              mealTypes={mealTypes}
              getMealForSlot={getMealForSlot}
              onRemove={mealPlanner.removeFromMealPlan}
              onAdd={openRecipeSelector}
              getDraggableProps={dnd.getDraggableProps}
              getDroppableProps={dnd.getDroppableProps}
              activeDragData={dnd.activeDragData}
              activeDropTarget={dnd.activeDropTarget}
            />
          </div>

          {showRecipeSidebar && (
            <div className="mb-6 max-w-full overflow-hidden">
              <div className="overflow-x-auto scrollbar-hide">
                <RecipeSearchPanel
                  mealType={null}
                  mealTypes={mealTypes}
                  favoriteRecipes={recipes.favoriteRecipes}
                  suggestedRecipes={recipes.suggestedRecipes}
                  onSelect={(recipe) => {
                    handleRecipeSelection(recipe)
                    setShowRecipeSidebar(false)
                  }}
                  onMealTypeChange={() => {}}
                  getDraggableProps={dnd.getDraggableProps}
                  activeDragData={dnd.activeDragData}
                  isCollapsed={false}
                  onToggleCollapse={() => setShowRecipeSidebar(false)}
                />
              </div>
            </div>
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

        {/* Modal for Recipe Selection - Mobile Only */}
        {isMobile && (
          <RecipeSelectionModal
            open={focusMode !== null}
            onClose={closeFocusMode}
            mealType={focusMode?.mealType || null}
            date={focusMode?.date || null}
            favoriteRecipes={recipes.favoriteRecipes}
            suggestedRecipes={recipes.suggestedRecipes}
            mealTypes={mealTypes}
            weekdays={weekdays}
            getMealForSlot={getMealForSlot}
            onSelect={handleRecipeSelection}
            getDraggableProps={dnd.getDraggableProps}
          />
        )}

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

      {/* Drag Overlay */}
      <DragOverlay>
        {dnd.activeDragData ? (
          <DragPreviewCard
            recipe={dnd.activeDragData.recipe}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
