"use client"

import { PlannerDayCard } from "../cards/planner-day-card"
import type { Recipe } from "@/lib/types"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel"
import { useMediaQuery } from "@/hooks/use-media-query"

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

interface ByDayViewProps {
  weekDates: string[]
  weekdays: string[]
  mealTypes: MealType[]
  getMealForSlot: (date: string, mealType: string) => Recipe | null
  onRemove: (mealType: string, date: string) => void
  onAdd: (mealType: string, date: string) => void
  getDraggableProps: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  getDroppableProps: (mealType: string, date: string) => { droppableId: string; data: { mealType: string; date: string } }
  activeDragData: DragData | null
  activeDropTarget: { mealType: string; date: string } | null
}

export function ByDayView({
  weekDates,
  weekdays,
  mealTypes,
  getMealForSlot,
  onRemove,
  onAdd,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: ByDayViewProps) {
  const isXL = useMediaQuery("(min-width: 1280px)")
  const dayCardFlexStyle = { minWidth: 160, maxWidth: 240 } as React.CSSProperties

  // On large screens (1280px+), show all 7 days with flex layout
  if (isXL) {
    return (
      <div className="flex flex-wrap gap-3 xl:flex-nowrap">
        {weekDates.slice(0, 7).map((date, dayIndex) => (
          <div
            key={date}
            style={{ flex: "1 1 calc(14.285% - 12px)", ...dayCardFlexStyle }}
            className="w-full"
          >
            <PlannerDayCard
              date={date}
              dayIndex={dayIndex}
              mealTypes={mealTypes}
              weekdays={weekdays}
              getMealForSlot={getMealForSlot}
              onRemove={onRemove}
              onAdd={onAdd}
              getDraggableProps={getDraggableProps}
              getDroppableProps={getDroppableProps}
              activeDragData={activeDragData}
              activeDropTarget={activeDropTarget}
            />
          </div>
        ))}
      </div>
    )
  }

  // On smaller screens, use carousel
  return (
    <Carousel
      opts={{
        align: "start",
        skipSnaps: false,
        dragFree: false,
        containScroll: "trimSnaps",
        watchDrag: (_emblaApi, evt) => {
          // Prevent carousel drag on recipe/meal slots
          const target = evt.target as HTMLElement
          return !target.closest("[data-draggable]")
        },
      }}
      className="w-full"
    >
      <CarouselContent className="gap-3">
        {weekDates.slice(0, 7).map((date, dayIndex) => (
          <CarouselItem
            key={date}
            className="basis-full sm:basis-1/2 md:basis-1/3 lg:basis-1/4 xl:basis-1/5"
            style={dayCardFlexStyle}
          >
            <PlannerDayCard
              date={date}
              dayIndex={dayIndex}
              mealTypes={mealTypes}
              weekdays={weekdays}
              getMealForSlot={getMealForSlot}
              onRemove={onRemove}
              onAdd={onAdd}
              getDraggableProps={getDraggableProps}
              getDroppableProps={getDroppableProps}
              activeDragData={activeDragData}
              activeDropTarget={activeDropTarget}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  )
}
