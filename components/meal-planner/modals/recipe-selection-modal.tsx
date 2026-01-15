"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChevronDown, Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RecipeSearchPanel } from "../panels/recipe-search-panel"
import { useIsMobile } from "@/hooks"
import { useState } from "react"
import type { Recipe } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface MealType {
  key: string
  label: string
}

interface DragData {
  recipe: Recipe
  source: 'modal' | 'slot'
  sourceMealType?: string
  sourceDate?: string
}

interface RecipeSelectionModalProps {
  open: boolean
  onClose: () => void
  mealType: string | null
  date: string | null
  favoriteRecipes: Recipe[]
  suggestedRecipes: Recipe[]
  mealTypes: MealType[]
  weekdays: string[]
  getMealForSlot: (date: string, mealType: string) => Recipe | null
  onSelect: (recipe: Recipe) => void
  getDraggableProps: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  onSlotSelect?: (slotKey: string) => void
  onDateChange?: (date: string) => void
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const getWeekdayName = (dateString: string, weekdays: string[]): string => {
  const date = new Date(dateString)
  const dayOfWeek = date.getDay()
  const adjustedIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  return weekdays[adjustedIndex] || "Unknown"
}

export function RecipeSelectionModal({
  open,
  onClose,
  mealType,
  date,
  favoriteRecipes,
  suggestedRecipes,
  mealTypes,
  weekdays,
  getMealForSlot,
  onSelect,
  getDraggableProps,
  onSlotSelect,
  onDateChange,
}: RecipeSelectionModalProps) {
  const isMobile = useIsMobile()
  const mealTypeLabel = mealTypes.find((m) => m.key === mealType)?.label
  const [displayDate, setDisplayDate] = useState<string | null>(null)

  // Update display date when the modal opens with a new date
  if (open && date && displayDate !== date) {
    setDisplayDate(date)
  }

  const handlePreviousDay = () => {
    if (displayDate) {
      const newDate = new Date(displayDate)
      newDate.setDate(newDate.getDate() - 1)
      const newDateStr = newDate.toISOString().split("T")[0]
      setDisplayDate(newDateStr)
      onDateChange?.(newDateStr)
    }
  }

  const handleNextDay = () => {
    if (displayDate) {
      const newDate = new Date(displayDate)
      newDate.setDate(newDate.getDate() + 1)
      const newDateStr = newDate.toISOString().split("T")[0]
      setDisplayDate(newDateStr)
      onDateChange?.(newDateStr)
    }
  }

  const currentDate = displayDate || date

  // Helper to render the Day Overview (Sidebar content)
  const DayOverview = () => {
    if (!currentDate) return null
    return (
      <div className={cn("flex flex-col", !isMobile && "h-full")}>
        {!isMobile && (
          <div className="flex items-center gap-2 text-muted-foreground pb-4 shrink-0">
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-medium uppercase tracking-wide">
              {getWeekdayName(currentDate, weekdays)}
            </span>
          </div>
        )}

        <div className={cn("grid gap-3", !isMobile && "flex-1 flex flex-col")}>
          {["breakfast", "lunch", "dinner"].map((type) => {
            const meal = getMealForSlot(currentDate, type)
            const typeLabel = mealTypes.find((m) => m.key === type)?.label
            const isCurrentTarget = type === mealType

            return (
              <div
                key={type}
                onClick={() => !isCurrentTarget && onSlotSelect?.(type)}
                className={cn(
                  "relative rounded-lg border transition-all duration-200 p-3 flex flex-col",
                  // Layout props for full height on desktop
                  !isMobile && "flex-1",
                  // Interactive styles
                  isCurrentTarget
                    ? "border-primary ring-1 ring-primary bg-primary/5 cursor-default"
                    : "border-transparent bg-background/50 hover:bg-background hover:border-border cursor-pointer hover:shadow-sm"
                )}
              >
                {isCurrentTarget && (
                  <div className="absolute -right-2 -top-2 z-10">
                    <Badge variant="default" className="text-[10px] px-1.5 h-5 shadow-sm">
                      Selecting
                    </Badge>
                  </div>
                )}

                <div className="flex items-center justify-between mb-2">
                  <p
                    className={cn(
                      "text-xs font-semibold uppercase",
                      isCurrentTarget ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {typeLabel}
                  </p>
                </div>

                <div className="flex-1">
                  {meal ? (
                    <div className="flex gap-3 items-start h-full">
                      <div className="h-12 w-12 shrink-0 rounded bg-muted overflow-hidden border border-border/50">
                        {meal.image_url ? (
                          <img
                            src={meal.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Utensils className="h-5 w-5 m-auto text-muted-foreground mt-3.5" />
                        )}
                      </div>
                      <span className="text-xs font-medium line-clamp-3 leading-snug pt-0.5">
                        {meal.title}
                      </span>
                    </div>
                  ) : (
                    <div className="h-full min-h-[40px] border border-dashed rounded flex items-center justify-center bg-muted/20">
                      <span className="text-[10px] text-muted-foreground italic">
                        {isCurrentTarget ? "Empty (Select a recipe)" : "Empty"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] p-0 gap-0 overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0 flex flex-row items-center justify-between">
          <DialogTitle className="flex flex-col gap-1">
            <span className="text-lg font-semibold">Select Meal</span>
            {mealType && currentDate && (
              <span className="text-sm font-normal text-muted-foreground">
                Adding to{" "}
                <span className="font-medium text-foreground">{mealTypeLabel}</span>{" "}
                for {getWeekdayName(currentDate, weekdays)}, {formatDate(currentDate)}
              </span>
            )}
          </DialogTitle>
          {currentDate && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePreviousDay}
                className="h-8 w-8 hover:bg-accent"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextDay}
                className="h-8 w-8 hover:bg-accent"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden relative">
          {/* Sidebar (Desktop) / Collapsible (Mobile) */}
          <div
            className={cn(
              "bg-muted/30 border-r flex-shrink-0 overflow-y-auto",
              isMobile
                ? "absolute top-0 left-0 right-0 z-20 bg-background/95 backdrop-blur border-b shadow-sm max-h-[60%]"
                : "w-[300px] p-4 flex flex-col"
            )}
          >
            {isMobile && currentDate ? (
              <details className="group px-4 py-2">
                <summary className="list-none flex items-center justify-between text-xs font-medium text-muted-foreground cursor-pointer select-none">
                  <span>
                    View Day's Menu ({getWeekdayName(currentDate, weekdays)})
                  </span>
                  <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="pt-4 pb-2 animate-in slide-in-from-top-2">
                  <DayOverview />
                </div>
              </details>
            ) : (
              <DayOverview />
            )}
          </div>

          {/* Main Recipe List - Using RecipeSearchPanel */}
          <div className={cn("flex-1 overflow-y-auto scroll-smooth", isMobile && "pt-10")}>
            <div className="p-4 md:p-6">
              <RecipeSearchPanel
                mealType={mealType}
                mealTypes={mealTypes}
                favoriteRecipes={favoriteRecipes}
                suggestedRecipes={suggestedRecipes.slice(0, 20)}
                onSelect={onSelect}
                onMealTypeChange={onSlotSelect || (() => {})}
                getDraggableProps={getDraggableProps}
              />
            </div>
          </div>
        </div>

        {/* Mobile Footer */}
        {isMobile && (
          <div className="p-4 border-t bg-background flex-shrink-0 z-30">
            <Button onClick={onClose} variant="outline" className="w-full">
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}