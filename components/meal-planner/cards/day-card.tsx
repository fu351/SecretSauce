"use client"

import { memo } from "react"
import { MealSlotCard } from "./meal-slot-card"
import { useTheme } from "@/contexts/theme-context"
import type { Recipe, MealWithRecipe } from "@/lib/types"

const mealTypes = [
  { key: "breakfast", label: "BREAKFAST" },
  { key: "lunch", label: "LUNCH" },
  { key: "dinner", label: "DINNER" },
]

const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

interface DayCardProps {
  date: Date
  meals: { [mealType: string]: MealWithRecipe }
  onRemove: (mealType: string, date: string) => void
  onAdd: (mealType: string, date: string) => void
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
  onRecipeClick,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: DayCardProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()

  const dayNumber = date.getDate()
  const dayIndex = date.getDay()

  return (
    <div
      className={`bg-card rounded-2xl p-4 flex flex-col gap-3 w-full border-2 ${
        isToday
          ? "border-accent bg-accent/5"
          : "border-transparent"
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`rounded-full w-9 h-9 flex items-center justify-center font-semibold text-sm ring-offset-background ${
            isToday
              ? "bg-accent text-accent-foreground ring-2 ring-accent ring-offset-1"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {dayNumber}
        </div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            {weekdays[dayIndex]}
          </h2>
          {isToday && (
            <span
              className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-accent/20 text-accent"
            >
              Today
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {mealTypes.map((mealType) => {
          const meal = meals?.[mealType.key]
          const recipe = meal?.recipe ?? null
          return (
            <div key={mealType.key} className="flex flex-col">
              <MealSlotCard
                recipe={recipe}
                mealType={mealType.key}
                date={date.toISOString().split("T")[0]}
                onRemove={onRemove}
                onAdd={onAdd}
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
