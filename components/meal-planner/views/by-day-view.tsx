import React, { useEffect, useState, useMemo } from "react"
import { PlannerDayCard } from "../cards/planner-day-card"
import type { Recipe, MealWithRecipe } from "@/lib/types"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel"
import { useMediaQuery } from "@/hooks/use-media-query"
import { CarouselArrow } from "@/components/ui/carousel-arrow"


interface MealType {
  key: string
  label: string
}

interface DragData {
  recipe: Recipe
  source: "modal" | "slot"
  sourceMealType?: string
  sourceDate?: string
}

type DayMeals = { [mealType: string]: MealWithRecipe }

interface ByDayViewProps {
  dates: string[]
  weekdays: string[]
  mealTypes: MealType[]
  mealsByDate: { [date: string]: DayMeals }
  onRemove: (mealType: string, date: string) => void
  onAdd: (mealType: string, date: string) => void
  getDraggableProps: (
    recipe: Recipe,
    source: "modal" | "slot",
    mealType?: string,
    date?: string
  ) => { draggableId: string; data: DragData }
  getDroppableProps: (
    mealType: string,
    date: string
  ) => { droppableId: string; data: { mealType: string; date: string } }
  activeDragData: DragData | null
  activeDropTarget: { mealType: string; date: string } | null
  onLoadMore: () => void
  onLoadEarlier: () => void
  todayIndex: number
}

/* ----------------------------- Main View ----------------------------- */

export function ByDayView({
  dates,
  weekdays,
  mealTypes,
  mealsByDate,
  onRemove,
  onAdd,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
  onLoadMore,
  onLoadEarlier,
  todayIndex,
}: ByDayViewProps) {
  // 1. Setup responsive breakpoints
  const isDesktop = useMediaQuery("(min-width: 1400px)")
  const isTablet = useMediaQuery("(min-width: 768px)")

  const itemsPerView = isDesktop ? 7 : isTablet ? 3 : 1
  const slidesToScroll = itemsPerView

  // 2. Refresh "Today" reference to handle midnight rollovers
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // 3. Compute current date string (YYYY-MM-DD) for card highlighting
  const todayISO = useMemo(() => {
    const offset = currentTime.getTimezoneOffset()
    const localDate = new Date(currentTime.getTime() - offset * 60 * 1000)
    return localDate.toISOString().split("T")[0]
  }, [currentTime])

  return (
    <Carousel
      opts={{
        align: "start",
        skipSnaps: false,
        dragFree: false,
        containScroll: "trimSnaps",
        slidesToScroll,
        startIndex: todayIndex,
      }}
      className="w-full"
      onReachEnd={onLoadMore}
      onReachStart={onLoadEarlier}
      renderLayout={(content) => (
        <>
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
          // Use noon to avoid timezone offsets shifting the day (e.g. UTC midnight -> previous day local)
          const dateObj = new Date(`${date}T12:00:00`)
          const dayOfWeek = dateObj.getDay()
          const weekdayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
          const isToday = date === todayISO
          const dayMeals = mealsByDate[date]

          return (
            <CarouselItem key={date} itemsPerView={itemsPerView}>
              <PlannerDayCard
                date={date}
                dayIndex={weekdayIndex}
                isToday={isToday}
                mealTypes={mealTypes}
                weekdays={weekdays}
                meals={dayMeals}
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