"use client"

import { Button } from "@/components/ui/button"
import {
  ShoppingCart,
  Sparkles,
  Loader2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react"
import { useIsMobile } from "@/hooks"

interface PlannerActionsProps {
  onHeuristicPlan: () => void
  onAddToCart: () => void
  onGoToToday: () => void
  onPreviousWeek: () => void
  onNextWeek: () => void
  onClearWeek: () => void
  heuristicLoading: boolean
}

export function PlannerActions({
  onHeuristicPlan,
  onAddToCart,
  onGoToToday,
  onPreviousWeek,
  onNextWeek,
  onClearWeek,
  heuristicLoading,
}: PlannerActionsProps) {
  const isMobile = useIsMobile()

  return (
    <div className="flex flex-row items-center gap-1.5 md:gap-2 w-full min-w-0 overflow-hidden">
      <Button
          variant="outline"
          size={isMobile ? "sm" : "default"}
          className="shrink-0 h-8 md:h-10 px-2 md:px-4"
          onClick={onGoToToday}
          disabled={heuristicLoading}
        >
          <CalendarDays className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
          Today
        </Button>
        <div className="flex items-center shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 md:h-10 md:w-10 shrink-0"
            onClick={onPreviousWeek}
            disabled={heuristicLoading}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 md:h-10 md:w-10 shrink-0"
            onClick={onNextWeek}
            disabled={heuristicLoading}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          className="shrink-0 h-8 w-8 md:h-10 md:w-auto md:px-3 md:px-4 md:max-w-[220px] text-sm !bg-gradient-to-r !from-purple-600 !to-blue-600 !text-white hover:!from-purple-700 hover:!to-blue-700 shadow-sm"
          onClick={onHeuristicPlan}
          disabled={heuristicLoading}
          data-tutorial="planner-smart"
          aria-label={isMobile ? "Smart Plan" : undefined}
        >
          {heuristicLoading ? (
            <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 md:mr-2 shrink-0 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 md:h-4 md:w-4 md:mr-2 shrink-0" />
          )}
          <span className="hidden md:inline truncate">Smart Weekly Planner</span>
        </Button>
        <Button
          size={isMobile ? "icon" : "default"}
          className="shrink-0 md:flex-initial h-8 w-8 md:!h-10 md:!w-auto md:!px-4 bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
          onClick={onAddToCart}
          data-tutorial="planner-add"
          aria-label="Add to Shopping List"
        >
          <ShoppingCart className="h-3.5 w-3.5 md:h-4 md:w-4 md:mr-2 shrink-0" />
          <span className="hidden md:inline">Add to Shopping List</span>
        </Button>
        <Button
          variant="outline"
          size={isMobile ? "icon" : "default"}
          className="shrink-0 h-8 w-8 md:h-10 md:w-auto md:px-4 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 hover:border-red-300 dark:border-red-900/50"
          onClick={onClearWeek}
          disabled={heuristicLoading}
          aria-label="Clear Week"
        >
          <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4 md:mr-2 shrink-0" />
          <span className="hidden md:inline">Clear Week</span>
        </Button>
    </div>
  )
}
