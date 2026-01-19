"use client"

import { memo } from "react"
import { X, Plus } from "lucide-react"
import type { Recipe } from "@/lib/types"
import { useTheme } from "@/contexts/theme-context"

interface StaticMealSlotCardProps {
  recipe: Recipe | null
  mealType: string
  date: string
  onRemove: (mealType: string, date: string) => void
  onAdd?: (mealType: string, date: string) => void
}

function StaticMealSlotCardComponent({
  recipe,
  mealType,
  date,
  onRemove,
  onAdd,
}: StaticMealSlotCardProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <div
      className={`relative rounded-lg group w-full h-[120px] transition-all`}
    >
      {recipe ? (
        // Filled state
        <div
          className={`relative h-full w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-all`}
        >
          <img
            src={recipe.image_url || "/placeholder.svg?height=160&width=260"}
            alt={recipe.title}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110"
          />
          <button
            onClick={() => onRemove(mealType, date)}
            className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 z-20 shadow-md hover:shadow-lg transition-shadow"
            aria-label={`Remove ${recipe.title}`}
          >
            <X className="h-3 w-3" />
          </button>
          <div className={`absolute inset-0 rounded-lg flex items-end ${isDark ? "bg-gradient-to-t from-black/80 to-transparent" : "bg-gradient-to-t from-black/75 to-transparent"} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`}>
              <h4 className={`font-semibold text-sm line-clamp-2 text-white w-full p-2.5`}>{recipe.title}</h4>
          </div>
        </div>
      ) : (
        // Empty state
        <div
          className={`relative h-full w-full flex items-center justify-center rounded-lg cursor-pointer transition-colors hover:bg-accent/5`}
          onClick={() => onAdd?.(mealType, date)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              onAdd?.(mealType, date)
            }
          }}
          aria-label={`Add recipe to ${mealType} on ${date}`}
        >
          <div className={`rounded-full border-2 p-3 transition-colors ${isDark ? "border-accent/60 text-accent" : "border-accent/60 text-accent"}`}>
            <Plus className="h-6 w-6" />
          </div>
        </div>
      )}
    </div>
  )
}

export const StaticMealSlotCard = memo(StaticMealSlotCardComponent)
