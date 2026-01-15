"use client"

import type { Recipe } from "@/lib/types"
import { ExpandedDayCard } from "../cards/expanded-day-card"
import { RecipeSearchPanel } from "../panels/recipe-search-panel"

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

interface FocusModeViewProps {
  date: string
  mealType: string
  weekDates: string[]
  weekdays: string[]
  mealTypes: MealType[]
  getMealForSlot: (date: string, mealType: string) => Recipe | null
  onRemove: (mealType: string, date: string) => void
  favoriteRecipes: Recipe[]
  suggestedRecipes: Recipe[]
  onSelect: (recipe: Recipe) => void
  onClose: () => void
  onDateChange: (newDate: string) => void
  onMealTypeChange: (newMealType: string) => void
  getDraggableProps: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  getDroppableProps: (mealType: string, date: string) => { droppableId: string; data: { mealType: string; date: string } }
  activeDragData: DragData | null
  activeDropTarget: { mealType: string; date: string } | null
}

export function FocusModeView({
  date,
  mealType,
  weekDates,
  weekdays,
  mealTypes,
  getMealForSlot,
  onRemove,
  favoriteRecipes,
  suggestedRecipes,
  onSelect,
  onClose,
  onDateChange,
  onMealTypeChange,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: FocusModeViewProps) {
  const currentIndex = weekDates.indexOf(date)

  const handlePreviousDay = () => {
    if (currentIndex > 0) {
      onDateChange(weekDates[currentIndex - 1])
    }
  }

  const handleNextDay = () => {
    if (currentIndex < weekDates.length - 1) {
      onDateChange(weekDates[currentIndex + 1])
    }
  }

  return (
    <div className="flex gap-4 h-full">
      {/* LEFT: 40% - Expanded Day Card */}
      <div className="w-[40%] flex flex-col overflow-hidden">
        <ExpandedDayCard
          date={date}
          mealType={mealType}
          weekDates={weekDates}
          weekdays={weekdays}
          mealTypes={mealTypes}
          getMealForSlot={getMealForSlot}
          onRemove={onRemove}
          onClose={onClose}
          onPreviousDay={handlePreviousDay}
          onNextDay={handleNextDay}
          onMealTypeChange={onMealTypeChange}
          getDraggableProps={getDraggableProps}
          getDroppableProps={getDroppableProps}
          activeDragData={activeDragData}
          activeDropTarget={activeDropTarget}
        />
      </div>

      {/* RIGHT: 60% - Recipe Search Panel */}
      <div className="w-[60%] flex flex-col overflow-hidden">
        <RecipeSearchPanel
          mealType={mealType}
          mealTypes={mealTypes}
          favoriteRecipes={favoriteRecipes}
          suggestedRecipes={suggestedRecipes}
          onSelect={onSelect}
          onMealTypeChange={onMealTypeChange}
          getDraggableProps={getDraggableProps}
        />
      </div>
    </div>
  )
}
