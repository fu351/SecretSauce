"use client"

import { MealSlotCard } from "../cards/meal-slot-card"
import { useIsMobile } from "@/hooks"
import type { Recipe } from "@/lib/types"

interface MealType {
  key: string
  label: string
}

interface ByMealViewProps {
  weekDates: string[]
  weekdaysFull: string[]
  mealTypes: MealType[]
  getMealForSlot: (date: string, mealType: string) => Recipe | null
  onRemove: (mealType: string, date: string) => void
  onAdd: (mealType: string, date: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, mealType: string, date: string) => void
}

export function ByMealView({
  weekDates,
  weekdaysFull,
  mealTypes,
  getMealForSlot,
  onRemove,
  onAdd,
  onDragOver,
  onDrop,
}: ByMealViewProps) {
  const isMobile = useIsMobile()

  return (
    <div className="space-y-8">
      {mealTypes.map((mealType) => (
        <div key={mealType.key} className={`bg-card rounded-lg border border-border/40 p-5`}>
          <h2 className={`text-2xl font-bold text-text mb-3`}>{mealType.label}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {weekDates.map((date, dayIndex) => {
              const recipe = getMealForSlot(date, mealType.key)
              return (
                <div key={date} className="flex flex-col">
                  <div className="text-xs font-semibold py-2 px-3 text-muted-foreground">
                    {weekdaysFull[dayIndex]?.slice(0, 3).toUpperCase()}
                  </div>
                  <MealSlotCard
                    recipe={recipe}
                    mealType={mealType.key}
                    date={date}
                    isMobile={isMobile}
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
      ))}
    </div>
  )
}
