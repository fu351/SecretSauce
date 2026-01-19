"use client"

import { useTheme } from "@/contexts/theme-context"

type MacroKey = "calories" | "protein" | "carbs" | "fat"

interface NutritionSummaryCardProps {
  weeklyTotals: Record<MacroKey, number>
  weeklyAverages: Record<MacroKey, number>
}

const WEEKLY_STAT_FIELDS = [
  { key: "calories", label: "Calories", unit: "cal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
] as const

export function NutritionSummaryCard({ weeklyTotals, weeklyAverages }: NutritionSummaryCardProps) {
  return (
    <div className="rounded-2xl bg-card/60 shadow-sm p-2.5 md:p-3 transition-colors">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-tutorial="planner-macros">
        {WEEKLY_STAT_FIELDS.map((stat) => (
          <div
            key={stat.key}
            className="rounded-lg bg-background p-3"
          >
            <p className="text-xs font-medium text-muted-foreground mb-3">{stat.label}</p>
            <div className="space-y-2">
              <div>
                <p className="text-xl font-bold text-foreground">
                  {Math.round(weeklyTotals[stat.key as MacroKey]) || 0}
                  <span className="text-xs font-normal text-muted-foreground ml-1">{stat.unit}</span>
                </p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="pt-2 border-t border-border/10">
                <p className="text-base font-semibold text-foreground">
                  {Math.round(weeklyAverages[stat.key as MacroKey]) || 0}
                  <span className="text-xs font-normal text-muted-foreground ml-1">{stat.unit}</span>
                </p>
                <p className="text-xs text-muted-foreground">Daily Avg</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
