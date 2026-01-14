"use client"

import { memo } from "react"
import { X, Plus } from "lucide-react"
import type { Recipe } from "@/lib/types"
import { useTheme } from "@/contexts/theme-context"

interface MealSlotCardProps {
  recipe: Recipe | null
  mealType: string
  date: string
  onRemove: (mealType: string, date: string) => void
  onAdd?: (mealType: string, date: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, mealType: string, date: string) => void
}

function MealSlotCardComponent({
  recipe,
  mealType,
  date,
  onRemove,
  onAdd,
  onDragOver,
  onDrop,
}: MealSlotCardProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <div
      className={`relative rounded-lg group ${
        recipe
          ? ""
          : isDark
            ? "bg-background"
            : "bg-background"
      } min-h-[100px] transition-colors`}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, mealType, date)}
    >
      {recipe ? (
        <div className="relative h-full">
          <img
            src={recipe.image_url || "/placeholder.svg?height=160&width=260"}
            alt={recipe.title}
            className="w-full h-24 object-cover rounded-lg"
          />
          <button
            onClick={() => onRemove(mealType, date)}
            className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 z-20"
            aria-label={`Remove ${recipe.title}`}
          >
            <X className="h-3 w-3" />
          </button>
          <div className="p-2">
            <h4 className={`font-semibold text-xs mb-1 line-clamp-2 text-text`}>{recipe.title}</h4>
          </div>
          {recipe.nutrition && (
            <div
              className={`absolute inset-0 rounded-lg ${
                isDark ? "bg-black/70" : "bg-black/60"
              } text-white opacity-0 group-hover:opacity-100 transition-opacity text-[10px] flex flex-col justify-center p-3 pointer-events-none z-10`}
            >
              <p className="uppercase tracking-wide text-[9px] mb-2 text-white/70">Nutrition</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-white/60">CAL</div>
                  <div className="font-semibold">{recipe.nutrition.calories || "-"}</div>
                </div>
                <div>
                  <div className="text-white/60">FAT</div>
                  <div className="font-semibold">
                    {recipe.nutrition.fat ? `${recipe.nutrition.fat}g` : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-white/60">PRO</div>
                  <div className="font-semibold">
                    {recipe.nutrition.protein ? `${recipe.nutrition.protein}g` : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-white/60">CARB</div>
                  <div className="font-semibold">
                    {recipe.nutrition.carbs ? `${recipe.nutrition.carbs}g` : "-"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`flex items-center justify-center min-h-[100px] cursor-pointer hover:bg-accent/5 transition-colors`}
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
          <div className={`rounded-full border-2 p-3 ${isDark ? "border-accent/60 text-accent" : "border-accent/60 text-accent"}`}>
            <Plus className="h-6 w-6" />
          </div>
        </div>
      )}
    </div>
  )
}

export const MealSlotCard = memo(MealSlotCardComponent)
