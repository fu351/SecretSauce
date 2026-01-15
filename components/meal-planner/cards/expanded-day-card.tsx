"use client"

import { memo } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MealSlotCard } from "./meal-slot-card"
import type { Recipe } from "@/lib/types"
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

interface ExpandedDayCardProps {
  date: string
  mealType: string
  weekDates: string[]
  mealTypes: MealType[]
  weekdays: string[]
  getMealForSlot: (date: string, mealType: string) => Recipe | null
  onRemove: (mealType: string, date: string) => void
  onClose: () => void
  onPreviousDay: () => void
  onNextDay: () => void
  onMealTypeChange: (mealType: string) => void
  getDraggableProps: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  getDroppableProps: (mealType: string, date: string) => { droppableId: string; data: { mealType: string; date: string } }
  activeDragData: DragData | null
  activeDropTarget: { mealType: string; date: string } | null
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

function ExpandedDayCardComponent({
  date,
  mealType,
  weekDates,
  mealTypes,
  weekdays,
  getMealForSlot,
  onRemove,
  onClose,
  onPreviousDay,
  onNextDay,
  onMealTypeChange,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: ExpandedDayCardProps) {
  const currentIndex = weekDates.indexOf(date)
  const canGoBack = currentIndex > 0
  const canGoForward = currentIndex < weekDates.length - 1
  const weekdayName = getWeekdayName(date, weekdays)
  const formattedDate = formatDate(date)

  return (
    <div className="bg-card rounded-2xl p-4 flex flex-col gap-3 h-full">
      {/* Header with Navigation */}
      <div className="flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            onClick={onPreviousDay}
            disabled={!canGoBack}
            size="icon"
            variant="ghost"
            className="h-8 w-8 flex-shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text">{weekdayName}</h2>
            <p className="text-xs text-muted-foreground">{formattedDate}</p>
          </div>

          <Button
            onClick={onNextDay}
            disabled={!canGoForward}
            size="icon"
            variant="ghost"
            className="h-8 w-8 flex-shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button
          onClick={onClose}
          size="icon"
          variant="ghost"
          className="h-8 w-8 hover:bg-destructive/10 flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Meal Slots */}
      <div className="flex flex-col divide-y divide-border/20 flex-1 overflow-y-auto">
        {mealTypes.map((mealTypeItem) => {
          const meal = getMealForSlot(date, mealTypeItem.key)

          return (
            <div
              key={mealTypeItem.key}
              className="flex flex-col py-2 first:pt-0 last:pb-0"
            >
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 px-2">
                {mealTypeItem.label}
              </p>

              <MealSlotCard
                recipe={meal}
                mealType={mealTypeItem.key}
                date={date}
                onRemove={onRemove}
                getDraggableProps={getDraggableProps}
                getDroppableProps={getDroppableProps}
                activeDragData={activeDragData}
                activeDropTarget={activeDropTarget}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const ExpandedDayCard = memo(ExpandedDayCardComponent)
