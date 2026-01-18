"use client"

import { Button } from "@/components/ui/button"
import { ShoppingCart, Sparkles, Loader2, CalendarDays } from "lucide-react"
import { useIsMobile } from "@/hooks"

interface PlannerActionsProps {
  onAiPlan: () => void
  onAddToCart: () => void
  onGoToToday: () => void
  aiLoading: boolean
}

export function PlannerActions({ onAiPlan, onAddToCart, onGoToToday, aiLoading }: PlannerActionsProps) {
  const isMobile = useIsMobile()

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        className="shrink-0"
        onClick={onGoToToday}
      >
        <CalendarDays className="h-4 w-4 mr-2" />
        Today
      </Button>
      <Button
        className="!bg-gradient-to-r !from-purple-600 !to-blue-600 !text-white hover:!from-purple-700 hover:!to-blue-700 shadow-sm shrink-0"
        onClick={onAiPlan}
        disabled={aiLoading}
        data-tutorial="planner-ai"
      >
        {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
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
