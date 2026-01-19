"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles } from "lucide-react"
import type { Recipe } from "@/lib/types"

interface AiProgress {
  step: number
  message: string
}

interface AiPlanResult {
  storeId: string
  totalCost: number
  meals: Array<{ dayIndex: number; mealType: 'breakfast' | 'lunch' | 'dinner'; recipeId: string }>
  explanation: string
}

interface AiPlannerModalProps {
  open: boolean
  onClose: () => void
  loading: boolean
  progress: AiProgress
  result: AiPlanResult | null
  recipesById: Record<string, Recipe>
  weekdaysFull: string[]
  onApply: () => void
}

export function AiPlannerModal({
  open,
  onClose,
  loading,
  progress,
  result,
  recipesById,
  weekdaysFull,
  onApply,
}: AiPlannerModalProps) {
  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen && loading) return // Prevent closing while loading
      onClose()
    }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI Weekly Meal Plan
          </DialogTitle>
        </DialogHeader>

        {/* Loading State with Progress */}
        {loading && !result && (
          <div className="py-12 space-y-8">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
                <Sparkles className="h-5 w-5 text-purple-400 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <p className="text-lg font-medium text-center">{progress.message}</p>
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
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                      progress.step > step
                        ? "bg-green-500 text-white"
                        : progress.step === step
                          ? "bg-purple-600 text-white animate-pulse"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {progress.step > step ? "✓" : step}
                  </div>
                  <span
                    className={`text-sm ${progress.step >= step ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Store</p>
                  <p className="font-semibold text-lg capitalize">{result.storeId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="font-semibold text-lg text-green-600 dark:text-green-400">
                    ${result.totalCost.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Explanation */}
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">{result.explanation}</p>
            </div>

            {/* Weekly Schedule */}
            <div>
              <h3 className="font-semibold mb-3">Weekly Meal Plan ({result.meals.length} meals)</h3>
              <div className="space-y-3">
                {Object.entries(
                  result.meals.reduce((acc, meal) => {
                    if (!acc[meal.dayIndex]) acc[meal.dayIndex] = []
                    acc[meal.dayIndex].push(meal)
                    return acc
                  }, {} as Record<number, typeof result.meals>)
                ).map(([dayIndex, dayMeals]) => {
                  const dayName = weekdaysFull[Number(dayIndex)] || `Day ${Number(dayIndex) + 1}`

                  return (
                    <div key={dayIndex} className="border border-border rounded-lg p-3">
                      <p className="text-sm font-semibold text-muted-foreground mb-2">{dayName}</p>
                      <div className="space-y-2">
                        {dayMeals.map((meal) => {
                          const recipe = recipesById[meal.recipeId]
                          const mealTypeLabel = meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)

                          return (
                            <div key={`${dayIndex}-${meal.mealType}`} className="flex items-center gap-3 p-2 bg-accent/30 rounded-lg">
                              <div className="w-16 text-center">
                                <p className="text-xs font-medium text-muted-foreground">{mealTypeLabel}</p>
                              </div>
                              {recipe ? (
                                <>
                                  {recipe.content?.image_url && (
                                    <img
                                      src={recipe.content.image_url}
                                      alt={recipe.title}
                                      className="w-10 h-10 rounded object-cover"
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
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={onApply}
                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
              >
                Apply to Meal Planner
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
