"use client"

import React, { useMemo } from "react"
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

export function WeeklyView({
  weekIndex,
  meals,
  recipesById,
  onRemove,
  onAdd,
  onRecipeClick,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: WeeklyViewProps) {
  // Memoize week dates calculation
  const weekDates = useMemo(() => getDatesForWeek(weekIndex), [weekIndex])

  // Memoize date strings to avoid repeated ISO conversions
  const dateStrings = useMemo(
    () => weekDates.map((date) => date.toISOString().split("T")[0]),
    [weekDates]
  )

  // Optimize mealsByDate calculation with better data structure
  const mealsByDate = useMemo(() => {
    const byDate: Record<string, Record<string, MealWithRecipe>> = {}

    if (!meals?.length || !recipesById) return byDate

    // Pre-allocate objects for all dates
    for (const dateStr of dateStrings) {
      byDate[dateStr] = {}
    }

    // Single pass through meals array
    for (const meal of meals) {
      const recipe = recipesById[meal.recipe_id]
      if (recipe && byDate[meal.date]) {
        byDate[meal.date][meal.meal_type] = { ...meal, recipe }
      }
    }

    return byDate
  }, [meals, recipesById, dateStrings])

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
      {weekDates.map((date, index) => {
        const dateStr = dateStrings[index]
        const dayMeals = mealsByDate[dateStr]

        return (
          <DayCard
            key={dateStr}
            date={date}
            meals={dayMeals}
            onRemove={onRemove}
            onAdd={onAdd}
            onRecipeClick={onRecipeClick}
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


