"use client"

import { useEffect } from "react"
import { PlannerDayCard } from "../cards/planner-day-card"
import type { Recipe } from "@/lib/types"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "@/components/ui/carousel"
import { CarouselArrow } from "@/components/ui/carousel-arrow"

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
  dates: string[]
  weekdays: string[]
  mealTypes: MealType[]
  getMealForSlot: (date: string, mealType: string) => Recipe | null
  onRemove: (mealType: string, date: string) => void
  onAdd: (mealType: string, date: string) => void
  getDraggableProps: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  getDroppableProps: (mealType: string, date: string) => { droppableId: string; data: { mealType: string; date: string } }
  activeDragData: DragData | null
  activeDropTarget: { mealType: string; date: string } | null
  onLoadMore: () => void
  onLoadEarlier: () => void
  todayIndex: number
  onScrollToTodayReady?: (scrollFn: () => void) => void
}

function ScrollToTodayHandler({ todayIndex, onReady }: { todayIndex: number; onReady?: (scrollFn: () => void) => void }) {
  const { scrollToIndex } = useCarousel()

  useEffect(() => {
    if (onReady) {
      onReady(() => scrollToIndex(todayIndex))
    }
  }, [scrollToIndex, todayIndex, onReady])

  return null
}

export function ByDayView({
  dates,
  weekdays,
  mealTypes,
  getMealForSlot,
  onRemove,
  onAdd,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
  onLoadMore,
  onLoadEarlier,
  todayIndex,
  onScrollToTodayReady,
}: ByDayViewProps) {
  return (
    <Carousel
      opts={{
        align: "start",
        skipSnaps: false,
        dragFree: false,
        containScroll: "trimSnaps",
        slidesToScroll: 1,
        watchDrag: (_emblaApi, evt) => {
          // Prevent carousel drag when interacting with recipes/meals
          const target = evt.target as HTMLElement
          return !target.closest("[data-draggable]") && !target.closest("[data-droppable]")
        },
      }}
      className="w-full"
      onReachEnd={onLoadMore}
      onReachStart={onLoadEarlier}
      renderLayout={(content) => (
        <>
          <ScrollToTodayHandler todayIndex={todayIndex} onReady={onScrollToTodayReady} />
          <div className="flex items-stretch gap-2">
            <CarouselArrow direction="prev" />
            {content}
            <CarouselArrow direction="next" />
          </div>
        </>
      )}
    >
      <CarouselContent className="gap-3">
        {dates.map((date) => {
          const dayOfWeek = new Date(date).getDay()
          // Convert Sunday (0) to index 6, Monday (1) to index 0, etc.
          const weekdayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
          return (
            <CarouselItem key={date} itemsPerView={7}>
              <PlannerDayCard
                date={date}
                dayIndex={weekdayIndex}
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
          )
        })}
      </CarouselContent>
    </Carousel>
  )
}
