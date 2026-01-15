"use client"

import { memo } from "react"
import { MealSlotCard } from "./meal-slot-card"
import { useTheme } from "@/contexts/theme-context"
import type { Recipe } from "@/lib/types"

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

interface PlannerDayCardProps {
  date: string
  dayIndex: number
  mealTypes: MealType[]
  weekdays: string[]
  getMealForSlot: (date: string, mealType: string) => Recipe | null
  onRemove: (mealType: string, date: string) => void
  onAdd: (mealType: string, date: string) => void
  getDraggableProps: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  getDroppableProps: (mealType: string, date: string) => { droppableId: string; data: { mealType: string; date: string } }
  activeDragData: DragData | null
  activeDropTarget: { mealType: string; date: string } | null
}

function PlannerDayCardComponent({
  date,
  dayIndex,
  mealTypes,
  weekdays,
  getMealForSlot,
  onRemove,
  onAdd,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: PlannerDayCardProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  // Check if this is today
  const today = new Date().toISOString().split('T')[0]
  const isToday = date === today

  return (
    <div className={`bg-card rounded-2xl p-4 flex flex-col gap-3 w-full transition-all ${isToday ? (isDark ? "border-2 border-accent" : "border-2 border-orange-400 bg-orange-50/50") : ""}`}>
      <div className="flex items-center gap-2">
        <div
          className={`rounded-full w-9 h-9 flex items-center justify-center font-semibold text-sm transition-all ${
            isToday
              ? isDark
                ? "bg-accent text-accent-foreground ring-2 ring-accent ring-offset-1"
                : "bg-orange-400 text-white ring-2 ring-orange-400 ring-offset-1"
              : isDark
                ? "bg-accent text-accent-foreground"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {new Date(date).getDate()}
        </div>
        <div className="flex items-center gap-2">
          <h2 className={`text-lg font-semibold text-text`}>{weekdays[dayIndex]}</h2>
          {isToday && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isDark ? "bg-accent/20 text-accent" : "bg-orange-100 text-orange-700"}`}>
              Today
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {mealTypes.map((mealType) => {
          const recipe = getMealForSlot(date, mealType.key)
          return (
            <div key={mealType.key} className="flex flex-col">
              <MealSlotCard
                recipe={recipe}
                mealType={mealType.key}
                date={date}
                onRemove={onRemove}
                onAdd={onAdd}
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

export const PlannerDayCard = memo(PlannerDayCardComponent)
