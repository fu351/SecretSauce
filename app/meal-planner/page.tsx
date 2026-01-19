"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useIsMobile, useToast, useShoppingList } from "@/hooks"
import { useRouter } from "next/navigation"
import {
  useMealPlannerRecipes,
  useMealPlannerNutrition,
  useMealPlannerAi,
  useMealPlannerDragDrop,
  useWeeklyMealPlan,
} from "@/hooks"
import { getCurrentWeekIndex, getDatesForWeek } from "@/lib/date-utils"
import {
  DndContext,
  DragOverlay,
} from "@dnd-kit/core"
import { SignInNotification } from "@/components/shared/signin-notification"
import { PlannerActions } from "@/components/meal-planner/controls/planner-actions"
import { NutritionSummaryCard } from "@/components/meal-planner/cards/nutrition-summary-card"
import { WeeklyView } from "@/components/meal-planner/views/weekly-view"
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

const weekdaysFull = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]

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
  const [showRecipeSidebar, setShowRecipeSidebar] = useState(false)
  const [weekIndex, setWeekIndex] = useState(getCurrentWeekIndex())

  // Custom hooks
  const {
    meals,
    recipesById,
    loading: weeklyPlanLoading,
    reload: reloadWeeklyPlan,
    addToMealPlan,
    removeFromMealPlan,
  } = useWeeklyMealPlan(user?.id, weekIndex)
  const recipes = useMealPlannerRecipes(user?.id)
  const dnd = useMealPlannerDragDrop({
    mealPlanner: { addToMealPlan, removeFromMealPlan },
  })

  const weekDates = useMemo(() => getDatesForWeek(weekIndex), [weekIndex])
  const weekDateStrings = useMemo(
    () => weekDates.map((d) => d.toISOString().split("T")[0]),
    [weekDates]
  )

  const nutrition = useMealPlannerNutrition(
    meals,
    weekDateStrings,
    recipesById
  )
  const aiPlanner = useMealPlannerAi(user?.id, weekIndex)

  const allRecipesById = useMemo(
    () => ({ ...recipesById, ...aiPlanner.aiRecipesById }),
    [recipesById, aiPlanner.aiRecipesById]
  )

  const isDark = theme === "dark"

  // Load data when user changes
  useEffect(() => {
    if (user) {
      recipes.loadAllRecipes()
    }
  }, [user?.id])

  // Show sidebar when + button is clicked
  useEffect(() => {
    if (focusMode) {
      setShowRecipeSidebar(true)
    }
  }, [focusMode])

  const handleGoToToday = useCallback(() => {
    setWeekIndex(getCurrentWeekIndex())
  }, [])

  const handlePreviousWeek = useCallback(() => {
    const year = Math.floor(weekIndex / 100)
    const week = weekIndex % 100
    // This is a simplification. A proper implementation would use date-fns to handle week boundaries.
    if (week > 1) {
      setWeekIndex(weekIndex - 1)
    } else {
      setWeekIndex((year - 1) * 100 + 52)
    }
  }, [weekIndex])

  const handleNextWeek = useCallback(() => {
    const year = Math.floor(weekIndex / 100)
    const week = weekIndex % 100
    // This is a simplification. A proper implementation would use date-fns to handle week boundaries.
    if (week < 52) {
      setWeekIndex(weekIndex + 1)
    } else {
      setWeekIndex((year + 1) * 100 + 1)
    }
  }, [weekIndex])

  const handleAddToShoppingList = useCallback(async () => {
    if (!user || meals.length === 0) return

    try {
      let addedCount = 0
      const recipesProcessed = new Set<string>()

      for (const meal of meals) {
        if (recipesProcessed.has(meal.recipe_id)) continue
        recipesProcessed.add(meal.recipe_id)

        await shoppingList.addRecipeToCart(meal.recipe_id)
        addedCount += 1
      }

      toast({
        title: "Added to shopping list",
        description: `Added ${addedCount} recipe${
          addedCount !== 1 ? "s" : ""
        } to your shopping list.`,
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
  }, [user, meals, shoppingList, toast, router])
  const handleGenerateAiPlan = useCallback(async () => {
    await aiPlanner.generateAiWeeklyPlan(recipesById)
  }, [aiPlanner, recipesById])

  const handleApplyAiPlan = useCallback(async () => {
    const success = await aiPlanner.applyAiPlanToMealPlanner()
    if (success) {
      reloadWeeklyPlan()
    }
  }, [aiPlanner, reloadWeeklyPlan])
  const openRecipeSelector = useCallback((mealType: string, date: string) => {
    setFocusMode({ mealType, date })
  }, [])
  const handleRecipeSelection = useCallback(
    async (recipe: Recipe) => {
      if (focusMode) {
        await addToMealPlan(recipe, focusMode.mealType, focusMode.date)
        // Keep focus mode open for adding more recipes
      }
    },
    [focusMode, addToMealPlan]
  )
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
      <div
        className="min-h-screen flex flex-col bg-background"
        data-tutorial="planner-overview"
      >
        <div className="flex-1 flex flex-row overflow-y-auto">
          <main className="flex-1 overflow-y-auto p-3 md:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="flex flex-col gap-4 mb-3">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-text">
                    Meal Planner
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Plan your weekly meals and track nutrition
                  </p>
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex flex-wrap items-center gap-2 w-full">
                    <PlannerActions
                      onAiPlan={handleGenerateAiPlan}
                      onAddToCart={handleAddToShoppingList}
                      onGoToToday={handleGoToToday}
                      onPreviousWeek={handlePreviousWeek}
                      onNextWeek={handleNextWeek}
                      aiLoading={aiPlanner.aiPlannerLoading}
                    />
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <WeeklyView
                  weekIndex={weekIndex}
                  meals={meals}
                  recipesById={recipesById}
                  onAdd={openRecipeSelector}
                  onRemove={removeFromMealPlan}
                  getDraggableProps={dnd.getDraggableProps}
                  getDroppableProps={dnd.getDroppableProps}
                  activeDragData={dnd.activeDragData}
                  activeDropTarget={dnd.activeDropTarget}
                />
              </div>

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
          </main>
          {/* Desktop Sidebar */}
          <aside
            className={cn(
              "hidden md:block bg-background transition-all duration-300 ease-in-out overflow-hidden",
              showRecipeSidebar ? "w-[350px]" : "w-0"
            )}
          >
            <div className="h-full border-l border-border">
              <RecipeSearchPanel
                mealType={null}
                mealTypes={mealTypes}
                favoriteRecipes={recipes.favoriteRecipes}
                suggestedRecipes={recipes.suggestedRecipes}
                onSelect={(recipe) => {
                  handleRecipeSelection(recipe)
                  // Keep sidebar open on desktop
                }}
                onMealTypeChange={() => {}}
                getDraggableProps={dnd.getDraggableProps}
                activeDragData={dnd.activeDragData}
                isCollapsed={false}
                onToggleCollapse={() => setShowRecipeSidebar(false)}
              />
            </div>
          </aside>
        </div>

        {/* Mobile Sidebar */}
        <Sheet open={showRecipeSidebar && isMobile} onOpenChange={setShowRecipeSidebar}>
          <SheetContent
            side="right"
            className="w-full p-0 flex flex-col"
          >
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

        <AiPlannerModal
          open={aiPlanner.showAiPlanDialog}
          onClose={() => aiPlanner.setShowAiPlanDialog(false)}
          loading={aiPlanner.aiPlannerLoading}
          progress={aiPlanner.aiPlannerProgress}
          result={aiPlanner.aiPlanResult}
          recipesById={allRecipesById}
          weekdaysFull={weekdaysFull}
          onApply={handleApplyAiPlan}
        />
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {dnd.activeDragData ? (
          <DragPreviewCard recipe={dnd.activeDragData.recipe} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}