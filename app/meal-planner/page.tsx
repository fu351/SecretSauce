"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
  useDatePagination,
} from "@/hooks"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { SignInNotification } from "@/components/shared/signin-notification"
import { PlannerActions } from "@/components/meal-planner/controls/planner-actions"
import { NutritionSummaryCard } from "@/components/meal-planner/cards/nutrition-summary-card"
import { ByDayView } from "@/components/meal-planner/views/by-day-view"
import { AiPlannerModal } from "@/components/meal-planner/modals/ai-planner-modal"
import { RecipeSearchPanel } from "@/components/meal-planner/panels/recipe-search-panel"
import { DragPreviewCard } from "@/components/meal-planner/cards/drag-preview-card"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { Recipe } from "@/lib/types"

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
  const [focusMode, setFocusMode] = useState<{
    date: string
    mealType: string
  } | null>(null)
  const [hasAutoScrolledIntoGrid, setHasAutoScrolledIntoGrid] = useState(false)
  const [showRecipeSidebar, setShowRecipeSidebar] = useState(false)
  const scrollToTodayRef = useRef<(() => void) | null>(null)

  // Date pagination hook - starts with 14 days centered around today
  const { dates, loadMoreFuture, loadMorePast, todayIndex } = useDatePagination(14)

  const handleGoToToday = useCallback(() => {
    scrollToTodayRef.current?.()
  }, [])

  // Custom hooks
  const mealPlanner = useMealPlanner(user?.id, dates)
  const recipes = useMealPlannerRecipes(user?.id)
  const nutrition = useMealPlannerNutrition(mealPlanner.meals, dates, mealPlanner.recipesById)
  const aiPlanner = useMealPlannerAi(user?.id, dates, mealPlanner.meals)

  const isDark = theme === "dark"

  // Load data when user or dates change
  useEffect(() => {
    if (user && dates.length > 0) {
      mealPlanner.loadAllData()
      recipes.loadAllRecipes()
    }
  }, [user?.id, dates])

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
  const openRecipeSelector = useCallback((mealType: string, date: string) => {
    setFocusMode({ mealType, date })
  }, [])

  const closeFocusMode = useCallback(() => {
    setFocusMode(null)
  }, [])

  const handleRecipeSelection = useCallback(
    async (recipe: Recipe) => {
      if (focusMode) {
        await mealPlanner.addToMealPlan(recipe, focusMode.mealType, focusMode.date)
        // Keep focus mode open for adding more recipes
      }
    },
    [focusMode, mealPlanner.addToMealPlan]
  )

  const handleFocusModeDateChange = useCallback((newDate: string) => {
    if (focusMode) {
      setFocusMode({ ...focusMode, date: newDate })
    }
  }, [focusMode])

  const handleFocusModeSlotChange = useCallback((newMealType: string) => {
    if (focusMode) {
      setFocusMode({ ...focusMode, mealType: newMealType })
    }
  }, [focusMode])

  const getMealForSlot = useCallback(
    (date: string, mealType: string) => {
      const meal = mealPlanner.meals.find((m) => m.date === date && m.meal_type === mealType)
      return meal ? mealPlanner.recipesById[meal.recipe_id] : null
    },
    [mealPlanner.meals, mealPlanner.recipesById]
  )

  const handleAddToShoppingList = useCallback(async () => {
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
  }, [user, mealPlanner.meals, shoppingList, toast, router])

  const handleGenerateAiPlan = useCallback(async () => {
    await aiPlanner.generateAiWeeklyPlan(mealPlanner.recipesById)
  }, [aiPlanner.generateAiWeeklyPlan, mealPlanner.recipesById])

  const handleApplyAiPlan = useCallback(async () => {
    const success = await aiPlanner.applyAiPlanToMealPlanner()
    if (success) {
      await mealPlanner.loadAllData()
    }
  }, [aiPlanner.applyAiPlanToMealPlanner, mealPlanner.loadAllData])

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
      <div className="min-h-screen flex flex-col bg-background" data-tutorial="planner-overview">
        <div
          className={cn(
            "flex-1 overflow-y-auto p-3 md:p-6 transition-all duration-300",
            showRecipeSidebar && "md:mr-[600px]"
          )}
        >
          <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col gap-4 mb-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-text">Meal Planner</h1>
              <p className="text-sm text-muted-foreground mt-1">Plan your weekly meals and track nutrition</p>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-3">
  
              <div className="flex flex-wrap items-center gap-2 w-full">
                <PlannerActions
                  onAiPlan={handleGenerateAiPlan}
                  onAddToCart={handleAddToShoppingList}
                  onGoToToday={handleGoToToday}
                  aiLoading={aiPlanner.aiPlannerLoading}
                />
              </div>
            </div>
          </div>

          <div className="mb-6">
            <ByDayView
              dates={dates}
              weekdays={weekdays}
              mealTypes={mealTypes}
              getMealForSlot={getMealForSlot}
              onRemove={mealPlanner.removeFromMealPlan}
              onAdd={openRecipeSelector}
              getDraggableProps={dnd.getDraggableProps}
              getDroppableProps={dnd.getDroppableProps}
              activeDragData={dnd.activeDragData}
              activeDropTarget={dnd.activeDropTarget}
              onLoadMore={loadMoreFuture}
              onLoadEarlier={loadMorePast}
              todayIndex={todayIndex}
              onScrollToTodayReady={(fn) => { scrollToTodayRef.current = fn }}
            />
          </div>

          {/* Nutrition Summary */}
          {dates.length > 0 && (
            <div className="mt-4 pt-2">
              <NutritionSummaryCard
                weeklyTotals={nutrition.weeklyNutritionSummary.totals}
                weeklyAverages={nutrition.weeklyNutritionSummary.averages}
              />
            </div>
          )}
        </div>

        {/* Sidebar for Recipe Selection */}
        <Sheet open={showRecipeSidebar} onOpenChange={setShowRecipeSidebar}>
          <SheetContent side="right" className="w-full md:w-[600px] p-0 flex flex-col">
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
          </SheetContent>
        </Sheet>
      </div>

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
