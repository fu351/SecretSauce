"use client"

import { Button } from "@/components/ui/button"
import {
  ShoppingCart,
  Sparkles,
  Loader2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { useIsMobile } from "@/hooks"

interface PlannerActionsProps {
  onAiPlan: () => void
  onAddToCart: () => void
  onGoToToday: () => void
  onPreviousWeek: () => void
  onNextWeek: () => void
  aiLoading: boolean
}

export function PlannerActions({
  onAiPlan,
  onAddToCart,
  onGoToToday,
  onPreviousWeek,
  onNextWeek,
  aiLoading,
}: PlannerActionsProps) {
  const isMobile = useIsMobile()

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        className="shrink-0"
        onClick={onGoToToday}
        disabled={aiLoading}
      >
        <CalendarDays className="h-4 w-4 mr-2" />
        Today
      </Button>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={onPreviousWeek}
          disabled={aiLoading}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onNextWeek}
          disabled={aiLoading}
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <Button
        className="!bg-gradient-to-r !from-purple-600 !to-blue-600 !text-white hover:!from-purple-700 hover:!to-blue-700 shadow-sm shrink-0"
        onClick={onAiPlan}
        disabled={aiLoading}
        data-tutorial="planner-ai"
      >
        {aiLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        {isMobile ? "AI Plan" : "AI Weekly Planner"}
      </Button>
      <Button
        className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shrink-0"
        onClick={onAddToCart}
        data-tutorial="planner-add"
      >
        <ShoppingCart className="h-4 w-4 mr-2" />
        {isMobile ? "Add to Cart" : "Add to Shopping List"}
      </Button>
    </div>
  )
}

