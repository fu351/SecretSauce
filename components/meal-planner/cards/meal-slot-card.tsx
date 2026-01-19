"use client"

import { memo } from "react"
import Image from "next/image"
import { X, Plus } from "lucide-react"
import type { Recipe } from "@/lib/types"
import { useTheme } from "@/contexts/theme-context"
import { useDroppable } from "@dnd-kit/core"
import { getRecipeImageUrl } from "@/lib/image-helper"

interface DragData {
  recipe: Recipe
  source: 'modal' | 'slot'
  sourceMealType?: string
  sourceDate?: string
}

interface MealSlotCardProps {
  recipe: Recipe | null
  mealType: string
  date: string
  onRemove: (mealType: string, date: string) => void
  onAdd?: (mealType: string, date: string) => void
  getDraggableProps: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  getDroppableProps: (mealType: string, date: string) => { droppableId: string; data: { mealType: string; date: string } }
  activeDragData: DragData | null
  activeDropTarget: { mealType: string; date: string } | null
}

function MealSlotCardComponent({
  recipe,
  mealType,
  date,
  onRemove,
  onAdd,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: MealSlotCardProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  // Make slot droppable
  const droppableProps = getDroppableProps(mealType, date)
  const { setNodeRef: setDropRef } = useDroppable({
    id: droppableProps.droppableId,
    data: droppableProps.data,
  })

  // Get draggable props for display
  const draggableProps = recipe ? getDraggableProps(recipe, 'slot', mealType, date) : null

  // Check if this is being dragged
  const isDragging = activeDragData?.source === 'slot' &&
                     activeDragData?.sourceMealType === mealType &&
                     activeDragData?.sourceDate === date

  // Check if this is the drop target
  const isDropTarget = activeDropTarget?.mealType === mealType &&
                       activeDropTarget?.date === date

  return (
    <div
      ref={setDropRef}
      id={droppableProps.droppableId}
      data-droppable-id={droppableProps.droppableId}
      className={`relative rounded-lg group w-full h-[120px] ${isDropTarget ? "ring-2 ring-primary" : ""}`}
    >
      {recipe ? (
        // Filled state
        <div
          className={`relative h-full w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md ${isDragging ? "opacity-0 pointer-events-none" : ""} ${isDropTarget ? "brightness-75" : ""}`}
          id={draggableProps?.draggableId}
          data-draggable="true"
          data-draggable-id={draggableProps?.draggableId}
          data-drag-data={draggableProps ? JSON.stringify(draggableProps.data) : ""}
        >
          <Image
            src={getRecipeImageUrl(recipe.content?.image_url)}
            alt={recipe.title}
            fill
            sizes="260px"
            className="w-full h-full object-cover cursor-grab active:cursor-grabbing transition-transform duration-200 group-hover:scale-110"
          />
          <button
            onClick={() => onRemove(mealType, date)}
            className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 z-20 shadow-md hover:shadow-lg transition-shadow"
            aria-label={`Remove ${recipe.title}`}
          >
            <X className="h-3 w-3" />
          </button>
          
          {/* Static Title Overlay (always visible) */}
          {!isDropTarget && (
            <div className={`absolute inset-x-0 bottom-0 flex items-end p-2.5 z-10 ${isDark ? "bg-gradient-to-t from-black/80 to-transparent" : "bg-gradient-to-t from-black/75 to-transparent"}`}>
              <h4 className={`font-semibold text-sm line-clamp-2 text-white w-full`}>{recipe.title}</h4>
            </div>
          )}

          {/* Nutrition Info - Slides up on hover, above the title */}
          {recipe.nutrition && !isDropTarget && (
            <div
              className={`absolute inset-x-0 rounded-b-lg text-white text-[10px] p-3 pointer-events-none z-20 transition-transform duration-300 transform translate-y-full group-hover:-translate-y-[40px] ${isDark ? "bg-black/60" : "bg-black/50"} backdrop-blur-sm`}
              style={{ bottom: 0 }}
            >
              <p className="uppercase tracking-wider text-[9px] mb-1 text-white/80 font-medium">Nutrition</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-white/70 text-[8px] font-medium">CAL</div>
                  <div className="font-bold text-xs">{recipe.nutrition.calories || "-"}</div>
                </div>
                <div>
                  <div className="text-white/70 text-[8px] font-medium">FAT</div>
                  <div className="font-bold text-xs">
                    {recipe.nutrition.fat ? `${recipe.nutrition.fat}g` : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-white/70 text-[8px] font-medium">PRO</div>
                  <div className="font-bold text-xs">
                    {recipe.nutrition.protein ? `${recipe.nutrition.protein}g` : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-white/70 text-[8px] font-medium">CARB</div>
                  <div className="font-bold text-xs">
                    {recipe.nutrition.carbs ? `${recipe.nutrition.carbs}g` : "-"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Empty state
        <div
          className={`relative h-full w-full flex items-center justify-center rounded-lg cursor-pointer transition-colors ${isDropTarget ? "bg-primary/10" : "hover:bg-accent/5"}`}
          data-draggable="true"
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
          <div className={`rounded-full border-2 p-3 transition-colors ${isDropTarget ? "border-primary text-primary" : isDark ? "border-accent/60 text-accent" : "border-accent/60 text-accent"}`}>
            <Plus className="h-6 w-6" />
          </div>
        </div>
      )}
    </div>
  )
}

export const MealSlotCard = memo(MealSlotCardComponent)
