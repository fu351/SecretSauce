"use client"

import { memo } from "react"
import { MealSlotCard } from "./meal-slot-card"
import { useTheme } from "@/contexts/theme-context"
import type { Recipe } from "@/lib/types"

interface MealType {
  key: string
  label: string
}

interface PlannerDayCardProps {
  date: string
  dayIndex: number
  mealTypes: MealType[]
  weekdays: string[]
  getMealForSlot: (date: string, mealType: string) => Recipe | null
  onRemove: (mealType: string, date: string) => void
  onAdd: (mealType: string, date: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, mealType: string, date: string) => void
}

function PlannerDayCardComponent({
  date,
  dayIndex,
  mealTypes,
  weekdays,
  getMealForSlot,
  onRemove,
  onAdd,
  onDragOver,
  onDrop,
}: PlannerDayCardProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <div className={`bg-card rounded-2xl p-4 flex flex-col gap-3 w-full`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`${isDark ? "bg-accent text-accent-foreground" : "bg-gray-100 text-gray-600"} rounded-full w-9 h-9 flex items-center justify-center font-semibold text-sm`}
          >
            {new Date(date).getDate()}
          </div>
          <div>
            <h2 className={`text-lg font-semibold text-text`}>{weekdays[dayIndex]}</h2>
          </div>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border/20">
        {mealTypes.map((mealType) => {
          const recipe = getMealForSlot(date, mealType.key)
          return (
            <div key={mealType.key} className="flex flex-col py-2 first:pt-0 last:pb-0">
              <MealSlotCard
                recipe={recipe}
                mealType={mealType.key}
                date={date}
                onRemove={onRemove}
                onAdd={onAdd}
                onDragOver={onDragOver}
                onDrop={onDrop}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const PlannerDayCard = memo(PlannerDayCardComponent)
