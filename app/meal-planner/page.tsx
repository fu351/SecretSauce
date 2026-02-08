"use client"

import { useState, useEffect, useCallback, useMemo, memo } from "react"
import dynamic from "next/dynamic"
import { useAuth } from "@/contexts/auth-context"
import { useIsMobile, useToast, useShoppingList } from "@/hooks"
import { useRouter } from "next/navigation"
import {
  useMealPlannerRecipes,
  useMealPlannerNutrition,
  useHeuristicPlan,
  useMealPlannerDragDrop,
  useWeeklyMealPlan,
} from "@/hooks"
import { getCurrentWeekIndex, getDatesForWeek } from "@/lib/date-utils"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { SignInNotification } from "@/components/shared/signin-notification"
import { PlannerActions } from "@/components/meal-planner/controls/planner-actions"
import { NutritionSummaryCard } from "@/components/meal-planner/cards/nutrition-summary-card"
import { WeeklyView } from "@/components/meal-planner/views/weekly-view"
import { DragPreviewCard } from "@/components/meal-planner/cards/drag-preview-card"
import { RecipeDetailModal } from "@/components/recipe/detail/recipe-detail-modal"
import { Sheet, SheetContent } from "@/components/ui/sheet"

import { cn } from "@/lib/utils"
import type { Recipe } from "@/lib/types"

// --- MEMOIZED SUB-COMPONENTS ---
// This ensures that scrolling or dragging doesn't force a re-render of heavy UI
const MemoizedWeeklyView = memo(WeeklyView)
const MemoizedNutritionSummary = memo(NutritionSummaryCard)

// Lazy-load the recipe search panel — it's only needed after the user opens the sidebar,
// so deferring its bundle keeps the initial page load lighter.
const RecipeSearchPanel = dynamic(
  () => import("@/components/meal-planner/panels/recipe-search-panel").then((mod) => mod.RecipeSearchPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col h-full bg-card">
        <div className="flex flex-col border-b border-border p-4 gap-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
          </div>
          <div className="h-10 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="flex-1 p-4 grid grid-cols-2 gap-4 auto-rows-max bg-muted/30">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    ),
  }
)

export default function MealPlannerPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const { toast } = useToast()
  const shoppingList = useShoppingList()
  const router = useRouter()

  // State
  const [focusMode, setFocusMode] = useState<{ date: string; mealType: string } | null>(null)
  const [showRecipeSidebar, setShowRecipeSidebar] = useState(false)
  const [weekIndex, setWeekIndex] = useState(getCurrentWeekIndex())
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [heuristicPlanLoading, setHeuristicPlanLoading] = useState(false)

  // Custom hooks
  const {
    meals,
    recipesById,
    reload: reloadWeeklyPlan,
    addToMealPlan,
    removeFromMealPlan,
    clearWeek,
  } = useWeeklyMealPlan(user?.id, weekIndex)

  const recipes = useMealPlannerRecipes(user?.id)

  // 1. MEMOIZE DRAG HANDLERS
  // This prevents the dnd hook from changing references and causing unnecessary updates
  const mealPlannerHandlers = useMemo(() => ({
    addToMealPlan,
    removeFromMealPlan,
    reload: reloadWeeklyPlan,
  }), [addToMealPlan, removeFromMealPlan, reloadWeeklyPlan])

  // 2. MEMOIZE DATA CALCULATIONS (needed for getNextEmptySlotAfter and nutrition)
  const weekDates = useMemo(() => getDatesForWeek(weekIndex), [weekIndex])
  const weekDateStrings = useMemo(() =>
    weekDates.map((d) => d.toISOString().split("T")[0]),
    [weekDates]
  )

  const MEAL_TYPES_ORDER = useMemo(() => ["breakfast", "lunch", "dinner"] as const, [])

  const getNextEmptySlotAfter = useCallback(
    (justFilledMealType: string, justFilledDate: string) => {
      const slots = weekDateStrings.flatMap((date) =>
        MEAL_TYPES_ORDER.map((mealType) => ({ date, mealType }))
      )
      const filled = new Set(meals.map((m) => `${m.date}-${m.meal_type}`))
      filled.add(`${justFilledDate}-${justFilledMealType}`)
      const filledIndex = slots.findIndex(
        (s) => s.date === justFilledDate && s.mealType === justFilledMealType
      )
      if (filledIndex < 0) return null
      for (let i = filledIndex + 1; i < slots.length; i++) {
        const s = slots[i]
        if (!filled.has(`${s.date}-${s.mealType}`))
          return { date: s.date, mealType: s.mealType }
      }
      return null
    },
    [weekDateStrings, meals, MEAL_TYPES_ORDER]
  )

  const dnd = useMealPlannerDragDrop({
    mealPlanner: mealPlannerHandlers,
    getNextEmptySlotAfter,
  })

  const nutrition = useMealPlannerNutrition(meals, weekDateStrings, recipesById)

  // 3. MEMOIZED CALLBACKS
  const handleGoToToday = useCallback(() => setWeekIndex(getCurrentWeekIndex()), [])

  const handlePreviousWeek = useCallback(() => {
    setWeekIndex(prev => {
      const year = Math.floor(prev / 100)
      const week = prev % 100
      return week > 1 ? prev - 1 : (year - 1) * 100 + 52
    })
  }, [])

  const handleNextWeek = useCallback(() => {
    setWeekIndex(prev => {
      const year = Math.floor(prev / 100)
      const week = prev % 100
      return week < 52 ? prev + 1 : (year + 1) * 100 + 1
    })
  }, [])

  const handleAddToShoppingList = useCallback(async () => {
    if (!user || meals.length === 0) return
    try {
      const recipeIds = meals.map(meal => meal.recipe_id)
      const addedCount = await shoppingList.addRecipesToCart(recipeIds)
      toast({
        title: "Added to shopping list",
        description: `Added ${addedCount} recipes (${meals.length} meals) to cart.`,
      })
      router.push("/shopping?expandList=true")
    } catch (error) {
      toast({ title: "Error", variant: "destructive" })
    }
  }, [user, meals, shoppingList, toast, router])

  const handleGenerateHeuristicPlan = useCallback(async () => {
    if (!user?.id) return
    setHeuristicPlanLoading(true)

    try {
      const heuristicPlan = await useHeuristicPlan(user.id, weekIndex)

      if (heuristicPlan.meals && heuristicPlan.meals.length > 0) {
        const weekDates = getDatesForWeek(weekIndex).map((d) => d.toISOString().split("T")[0])

        for (const meal of heuristicPlan.meals) {
          const date = weekDates[meal.dayIndex]
          if (date) {
            await addToMealPlan(
              { id: meal.recipeId } as Recipe,
              meal.mealType,
              date,
              { reload: false }
            )
          }
        }

        await reloadWeeklyPlan()

        toast({
          title: "Success",
          description: `${heuristicPlan.meals.length} meals added! Estimated cost: $${heuristicPlan.totalCost.toFixed(2)} at ${heuristicPlan.storeId}`,
        })
      } else {
        toast({
          title: "Smart planner",
          description: heuristicPlan.explanation || "Week already planned.",
        })
      }
    } catch (error) {
      console.error("[MealPlanner] Heuristic plan failed:", error)
      toast({
        title: "Error",
        description: "Failed to generate meal plan. Please try again.",
        variant: "destructive",
      })
    } finally {
      setHeuristicPlanLoading(false)
    }
  }, [user?.id, weekIndex, addToMealPlan, reloadWeeklyPlan, toast])

  const handleClearWeek = useCallback(async () => {
    if (!user) return
    try {
      const success = await clearWeek()
      if (success) {
        toast({
          title: "Week cleared",
          description: "All meals for this week have been removed.",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear week",
        variant: "destructive",
      })
    }
  }, [user, clearWeek, toast])

  const openRecipeSelector = useCallback(
    (mealType: string, date: string) => {
      setFocusMode({ mealType, date })
      dnd.setHighlightSlot(mealType, date)
    },
    [dnd.setHighlightSlot]
  )

  const handleRecipeSelection = useCallback(
    async (recipe: Recipe) => {
      if (focusMode) {
        await addToMealPlan(recipe, focusMode.mealType, focusMode.date)
        dnd.highlightNextEmptySlotAfter(focusMode.mealType, focusMode.date)
        const next = getNextEmptySlotAfter(focusMode.mealType, focusMode.date)
        if (next) setFocusMode(next)
        if (isMobile) setShowRecipeSidebar(false)
      }
    },
    [focusMode, addToMealPlan, isMobile, dnd.highlightNextEmptySlotAfter, getNextEmptySlotAfter]
  )

  const handleRecipeClick = useCallback((id: string) => setSelectedRecipeId(id), [])
  const handleCloseRecipeModal = useCallback(() => setSelectedRecipeId(null), [])

  const handleAddToCart = useCallback(async (recipe: Recipe, servings: number) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to add items to your shopping list.", variant: "destructive" })
      return
    }
    try {
      await shoppingList.addRecipeToCart(recipe.id, servings)
      toast({ title: "Success", description: `Added ${recipe.title} to shopping list` })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to add recipe to shopping list"
      console.error("Error adding to cart:", e)
      toast({ title: "Error", description: errorMessage, variant: "destructive" })
    }
  }, [user, shoppingList, toast])

  // Effects
  useEffect(() => {
    if (user?.id) recipes.loadAllRecipes()
  }, [user?.id])

  useEffect(() => {
    if (focusMode) setShowRecipeSidebar(true)
  }, [focusMode])

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
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
      {/* Container Optimization: 
        1. h-[100dvh] fixes mobile browser UI jitter.
        2. overscroll-none prevents the "bounce" effect from locking the main thread.
      */}
      <div className="h-[100dvh] flex flex-col bg-background overflow-hidden overscroll-none selection:bg-primary/10">
        <div className="flex-1 flex flex-row overflow-hidden">

          {/* Main Scroll Area:
            1. transform-gpu forces layer compositing.
            2. backface-hidden reduces paint flashing.
          */}
          <main className="flex-1 overflow-y-auto p-3 md:p-6 transform-gpu backface-hidden scroll-smooth">
            <div className="max-w-7xl mx-auto will-change-transform">
              {/* Header */}
              <div className="flex flex-col gap-4 mb-6">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                    Meal Planner
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Plan your weekly meals and track nutrition
                  </p>
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-3">
                <PlannerActions
                  onHeuristicPlan={handleGenerateHeuristicPlan}
                  onAddToCart={handleAddToShoppingList}
                  onGoToToday={handleGoToToday}
                  onPreviousWeek={handlePreviousWeek}
                  onNextWeek={handleNextWeek}
                  onClearWeek={handleClearWeek}
                  heuristicLoading={heuristicPlanLoading}
                />
                </div>
              </div>

              {/* Weekly Grid with Content Visibility Optimization */}
              <div className="mb-6 [content-visibility:auto] contain-intrinsic-size-[1000px]">
                <MemoizedWeeklyView
                  weekIndex={weekIndex}
                  meals={meals}
                  recipesById={recipesById}
                  onAdd={openRecipeSelector}
                  onSlotSelect={openRecipeSelector}
                  onRemove={removeFromMealPlan}
                  onRecipeClick={handleRecipeClick}
                  getDraggableProps={dnd.getDraggableProps}
                  getDroppableProps={dnd.getDroppableProps}
                  activeDragData={dnd.activeDragData}
                  activeDropTarget={dnd.activeDropTarget}
                />
              </div>

              {/* Nutrition Summary */}
              {weekDates.length > 0 && (
                <div className="pb-20">
                  <MemoizedNutritionSummary
                    weeklyTotals={nutrition.weeklyNutritionSummary.totals}
                    weeklyAverages={nutrition.weeklyNutritionSummary.averages}
                  />
                </div>
              )}
            </div>
          </main>

          {/* Desktop Sidebar: Strict layout containment for smooth width transitions */}
          <aside
            className={cn(
              "hidden md:flex flex-col bg-background border-l border-border transition-[width] duration-300 ease-in-out overflow-hidden h-full",
              showRecipeSidebar ? "w-[380px]" : "w-0"
            )}
            style={{ contain: 'layout paint size' }}
          >
            {showRecipeSidebar && (
              <div className="w-[380px] h-full overflow-hidden">
                <RecipeSearchPanel
                  onSelect={handleRecipeSelection}
                  getDraggableProps={dnd.getDraggableProps}
                  activeDragData={dnd.activeDragData}
                  onToggleCollapse={() => setShowRecipeSidebar(false)}
                />
              </div>
            )}
          </aside>
        </div>

        {/* Mobile Sidebar */}
        <Sheet open={showRecipeSidebar && isMobile} onOpenChange={setShowRecipeSidebar}>
          <SheetContent side="right" className="w-full p-0">
            <RecipeSearchPanel
              onSelect={(recipe) => {
                handleRecipeSelection(recipe)
                setShowRecipeSidebar(false)
              }}
              getDraggableProps={dnd.getDraggableProps}
              activeDragData={dnd.activeDragData}
              onToggleCollapse={() => setShowRecipeSidebar(false)}
            />
          </SheetContent>
        </Sheet>

        <RecipeDetailModal
          recipeId={selectedRecipeId}
          onClose={handleCloseRecipeModal}
          onAddToCart={handleAddToCart}
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {dnd.activeDragData ? (
          <DragPreviewCard recipe={dnd.activeDragData.recipe} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
