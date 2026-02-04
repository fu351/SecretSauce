"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface WeekNavigatorProps {
  weekStart: string
  onPrevious: () => void
  onNext: () => void
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function WeekNavigator({ weekStart, onPrevious, onNext }: WeekNavigatorProps) {
  return (
    <div className="flex items-center bg-card rounded-lg shadow-sm border border-border p-1.5">
      <Button variant="ghost" size="icon" onClick={onPrevious} className="h-9 w-9 hover:bg-accent">
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <span className="px-4 text-sm font-semibold text-foreground min-w-[140px] text-center">
        {formatDate(weekStart || "")}
      </span>
      <Button variant="ghost" size="icon" onClick={onNext} className="h-9 w-9 hover:bg-accent">
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  )
}
