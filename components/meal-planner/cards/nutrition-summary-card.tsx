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
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const textClass = isDark ? "text-[#e8dcc4]" : "text-gray-900"

  return (
    <div className={`rounded-2xl bg-card/60 shadow-sm p-2.5 md:p-3 transition-colors`}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-tutorial="planner-macros">
        {WEEKLY_STAT_FIELDS.map((stat) => (
          <div
            key={stat.key}
            className={`rounded-lg ${isDark ? "bg-[#181813]" : "bg-white"} p-3`}
          >
            <p className="text-xs font-medium text-muted-foreground mb-3">{stat.label}</p>
            <div className="space-y-2">
              <div>
                <p className={`text-xl font-bold ${textClass}`}>
                  {Math.round(weeklyTotals[stat.key as MacroKey]) || 0}
                  <span className="text-xs font-normal text-muted-foreground ml-1">{stat.unit}</span>
                </p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="pt-2 border-t border-border/10">
                <p className={`text-base font-semibold ${textClass}`}>
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
