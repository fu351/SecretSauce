"use client"

import React from "react"
import { DayCard } from "../cards/day-card"
import type { MealScheduleRow } from "@/lib/database/meal-planner-db"
import { getDatesForWeek } from "@/lib/date-utils"
import type { Recipe, MealWithRecipe } from "@/lib/types"

interface WeeklyViewProps {
  weekIndex: number
  meals: MealScheduleRow[]
  recipesById: Record<string, Recipe>
  onRemove: (mealType: string, date: string) => void
  onAdd: (mealType: string, date: string) => void
  getDraggableProps: (
    recipe: Recipe,
    source: "modal" | "slot",
    mealType?: string,
    date?: string
  ) => { draggableId: string; data: any }
  getDroppableProps: (
    mealType: string,
    date: string
  ) => { droppableId: string; data: any }
  activeDragData: any | null
  activeDropTarget: { mealType: string; date: string } | null
}

export function WeeklyView({
  weekIndex,
  meals,
  recipesById,
  onRemove,
  onAdd,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: WeeklyViewProps) {
  const weekDates = getDatesForWeek(weekIndex)

  const mealsByDate = React.useMemo(() => {
    const byDate: { [date: string]: { [mealType: string]: MealWithRecipe } } =
      {}
    if (!meals || !recipesById) return byDate

    for (const meal of meals) {
      if (!byDate[meal.date]) {
        byDate[meal.date] = {}
      }
      const recipe = recipesById[meal.recipe_id]
      if (recipe) {
        byDate[meal.date][meal.meal_type] = { ...meal, recipe }
      }
    }
    return byDate
  }, [meals, recipesById])

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
      {weekDates.map((date) => {
        const dateStr = date.toISOString().split("T")[0]
        const dayMeals = mealsByDate[dateStr] || {}

        return (
          <DayCard
            key={dateStr}
            date={date}
            meals={dayMeals}
            onRemove={onRemove}
            onAdd={onAdd}
            getDraggableProps={getDraggableProps}
            getDroppableProps={getDroppableProps}
            activeDragData={activeDragData}
            activeDropTarget={activeDropTarget}
          />
        )
      })}
    </div>
  )
}


