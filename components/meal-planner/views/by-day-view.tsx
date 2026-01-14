"use client"

import { PlannerDayCard } from "../cards/planner-day-card"
import type { Recipe } from "@/lib/types"

interface MealType {
  key: string
  label: string
}

interface ByDayViewProps {
  weekDates: string[]
  weekdays: string[]
  mealTypes: MealType[]
  getMealForSlot: (date: string, mealType: string) => Recipe | null
  showSidebarOverlay: boolean
  onRemove: (mealType: string, date: string) => void
  onAdd: (mealType: string, date: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, mealType: string, date: string) => void
}

export function ByDayView({
  weekDates,
  weekdays,
  mealTypes,
  getMealForSlot,
  showSidebarOverlay,
  onRemove,
  onAdd,
  onDragOver,
  onDrop,
}: ByDayViewProps) {
  const dayContainerClass = showSidebarOverlay ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-wrap gap-3 xl:flex-nowrap"
  const dayCardFlexStyle = showSidebarOverlay
    ? undefined
    : ({ flex: "1 1 calc(14.285% - 12px)", minWidth: 140, maxWidth: 210 } as React.CSSProperties)

  return (
    <div className={dayContainerClass}>
      {weekDates.slice(0, 7).map((date, dayIndex) => (
        <div key={date} style={dayCardFlexStyle} className={`w-full`}>
          <PlannerDayCard
            date={date}
            dayIndex={dayIndex}
            mealTypes={mealTypes}
            weekdays={weekdays}
            getMealForSlot={getMealForSlot}
            onRemove={onRemove}
            onAdd={onAdd}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        </div>
      ))}
    </div>
  )
}
