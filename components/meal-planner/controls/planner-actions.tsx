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
    <div className="flex gap-2">
      <Button
        variant="outline"
        className="shrink-0"
        onClick={onGoToToday}
        disabled={heuristicLoading}
      >
        <CalendarDays className="h-4 w-4 mr-2" />
        Today
      </Button>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={onPreviousWeek}
          disabled={heuristicLoading}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onNextWeek}
          disabled={heuristicLoading}
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {/* AI planner temporarily disabled until we rely on the heuristic smart planner */}
      {/*
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
      */}
      <Button
        className="!bg-gradient-to-r !from-purple-600 !to-blue-600 !text-white hover:!from-purple-700 hover:!to-blue-700 shadow-sm shrink-0"
        onClick={onHeuristicPlan}
        disabled={heuristicLoading}
        data-tutorial="planner-smart"
      >
        {heuristicLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        {isMobile ? "Smart Plan" : "Smart Weekly Planner"}
      </Button>
      <Button
        className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm shrink-0"
        onClick={onAddToCart}
        data-tutorial="planner-add"
      >
        <ShoppingCart className="h-4 w-4 mr-2" />
        {isMobile ? "Add to Cart" : "Add to Shopping List"}
      </Button>
      <Button
        variant="outline"
        className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300"
        onClick={onClearWeek}
        disabled={heuristicLoading}
      >
        <Trash2 className="h-4 w-4 mr-2" />
        {isMobile ? "Clear" : "Clear Week"}
      </Button>
    </div>
    
  )
}
