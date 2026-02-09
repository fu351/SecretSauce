"use client"

import { memo } from "react"
import { MealSlotCard } from "./meal-slot-card"
import type { Recipe } from "@/lib/types"
import type { MealScheduleRow } from "@/lib/database/meal-planner-db"

const mealTypes = [
  { key: "breakfast", label: "BREAKFAST" },
  { key: "lunch", label: "LUNCH" },
  { key: "dinner", label: "DINNER" },
]

const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

interface DayCardProps {
  date: Date
  meals: { [mealType: string]: MealScheduleRow & { recipe: Recipe } }
  onRemove: (mealType: string, date: string) => void
  onAdd: (mealType: string, date: string) => void
  onSlotSelect?: (mealType: string, date: string) => void
  onRecipeClick?: (recipeId: string) => void
  getDraggableProps: (
    recipe: Recipe,
    source: "modal" | "slot",
    mealType?: string,
    date?: string
  ) => { draggableId: string; data: any }
  getDroppableProps: (
    mealType: string,
    date: string,
    recipe?: Recipe | null
  ) => { droppableId: string; data: any }
  activeDragData: any | null
  activeDropTarget: { mealType: string; date: string } | null
}

function DayCardComponent({
  date,
  meals,
  onRemove,
  onAdd,
  onSlotSelect,
  onRecipeClick,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: DayCardProps) {
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()

  const dayNumber = date.getDate()
  const dayIndex = date.getDay()

  return (
    <div
      className={`bg-card rounded-lg md:rounded-2xl p-2 md:p-4 flex flex-row md:flex-col gap-2 md:gap-3 w-full border-2 items-center ${
        isToday
          ? "border-accent bg-accent/5"
          : "border-transparent"
      }`}
    >
      <div className="flex items-center gap-1.5 md:gap-2 shrink-0 w-12 md:w-auto">
        <div
          className={`rounded-full w-6 h-6 md:w-9 md:h-9 flex items-center justify-center font-semibold text-[10px] md:text-sm ring-offset-background flex-shrink-0 ${
            isToday
              ? "bg-accent text-accent-foreground ring-2 ring-accent ring-offset-1"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {dayNumber}
        </div>
        <h2 className="text-xs md:text-lg font-semibold text-foreground">
          {weekdays[dayIndex]}
        </h2>
      </div>

      <div className="flex flex-1 md:flex-none flex-row md:flex-col gap-1.5 md:gap-2.5 min-w-0">
        {mealTypes.map((mealType) => {
          const meal = meals?.[mealType.key]
          const recipe = meal?.recipe ?? null
          return (
            <div key={mealType.key} className="flex-1 min-w-0 md:flex-none md:w-full">
              <MealSlotCard
                recipe={recipe}
                mealType={mealType.key}
                date={date.toISOString().split("T")[0]}
                onRemove={onRemove}
                onAdd={onAdd}
                onSlotSelect={onSlotSelect}
                onRecipeClick={onRecipeClick}
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

export const DayCard = memo(DayCardComponent)
