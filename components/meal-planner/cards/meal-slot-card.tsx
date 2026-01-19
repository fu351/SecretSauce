"use client"

import { memo } from "react"
import Image from "next/image"
import { X, Plus } from "lucide-react"
import type { Recipe } from "@/lib/types"
import { useTheme } from "@/contexts/theme-context"
import { useDroppable, useDraggable } from "@dnd-kit/core"
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
  onRecipeClick?: (recipeId: string) => void
  getDraggableProps: (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => { draggableId: string; data: DragData }
  getDroppableProps: (mealType: string, date: string, recipe?: Recipe | null) => { droppableId: string; data: { mealType: string; date: string; hasRecipe?: boolean; existingRecipe?: Recipe } }
  activeDragData: DragData | null
  activeDropTarget: { mealType: string; date: string } | null
}

function MealSlotCardComponent({
  recipe,
  mealType,
  date,
  onRemove,
  onAdd,
  onRecipeClick,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: MealSlotCardProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  // Make slot droppable
  const droppableProps = getDroppableProps(mealType, date, recipe)
  const { setNodeRef: setDropRef } = useDroppable({
    id: droppableProps.droppableId,
    data: droppableProps.data,
  })

  // Make recipe draggable (when slot has a recipe)
  const draggableProps = recipe ? getDraggableProps(recipe, 'slot', mealType, date) : null
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: draggableProps?.draggableId || '',
    data: draggableProps?.data,
    disabled: !recipe,
  })

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
          ref={setDragRef}
          className={`relative h-full w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-opacity ${isDragging ? "opacity-0 pointer-events-none" : ""} ${isDropTarget ? "brightness-75" : ""}`}
        >
          {/* Draggable area - image */}
          <div
            {...attributes}
            {...listeners}
            onClick={() => onRecipeClick?.(recipe.id)}
            className="cursor-grab active:cursor-grabbing w-full h-full"
          >
            <Image
              src={getRecipeImageUrl(recipe.content?.image_url)}
              alt={recipe.title}
              fill
              sizes="260px"
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110 pointer-events-none"
            />
          </div>

          {/* Remove button - not draggable */}
          <div className="absolute top-2 right-2 flex gap-1 z-20">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove(mealType, date)
              }}
              className="bg-destructive text-destructive-foreground rounded-full p-1 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              aria-label={`Remove ${recipe.title}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Static Title Overlay (always visible) - also draggable */}
          {!isDropTarget && (
            <div
              {...attributes}
              {...listeners}
              onClick={() => onRecipeClick?.(recipe.id)}
              className={`absolute inset-x-0 bottom-0 flex items-end p-2.5 z-10 cursor-grab active:cursor-grabbing ${isDark ? "bg-gradient-to-t from-black/80 to-transparent" : "bg-gradient-to-t from-black/75 to-transparent"}`}
            >
              <h4 className={`font-semibold text-sm line-clamp-2 text-white w-full pointer-events-none`}>{recipe.title}</h4>
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
