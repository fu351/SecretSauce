"use client"

import { memo, useRef, useEffect } from "react"
import Image from "next/image"
import { X, Plus } from "lucide-react"
import type { Recipe } from "@/lib/types"
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
  onSlotSelect?: (mealType: string, date: string) => void
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
  onSlotSelect,
  onRecipeClick,
  getDraggableProps,
  getDroppableProps,
  activeDragData,
  activeDropTarget,
}: MealSlotCardProps) {
  const recipeImageUrl = recipe?.image_url ?? recipe?.content?.image_url
  const lastTapRef = useRef(0)
  const singleClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (singleClickTimeoutRef.current) clearTimeout(singleClickTimeoutRef.current)
    }
  }, [])

  const handleSlotClick = (e: React.MouseEvent) => {
    if (!recipe) return
    const now = Date.now()
    const isDoubleClick = e.detail === 2
    const isDoubleTap = now - lastTapRef.current < 500

    if (isDoubleClick || isDoubleTap) {
      lastTapRef.current = 0
      if (singleClickTimeoutRef.current) {
        clearTimeout(singleClickTimeoutRef.current)
        singleClickTimeoutRef.current = null
      }
      onRecipeClick?.(recipe.id)
      return
    }

    lastTapRef.current = now
    if (singleClickTimeoutRef.current) clearTimeout(singleClickTimeoutRef.current)
    singleClickTimeoutRef.current = setTimeout(() => {
      singleClickTimeoutRef.current = null
      onSlotSelect?.(mealType, date)
    }, 350)
  }

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
      className={`relative rounded-lg group w-full min-w-0 aspect-square md:aspect-auto md:h-[120px] ${isDropTarget ? "ring-2 ring-primary" : ""}`}
    >
      {recipe ? (
        // Filled state
        <div
          ref={setDragRef}
          className={`relative h-full w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-opacity ${isDragging ? "opacity-0 pointer-events-none" : ""} ${isDropTarget ? "brightness-75" : ""}`}
        >
          {/* Draggable area - image: single click = select slot, double click = recipe overlay */}
          <div
            {...attributes}
            {...listeners}
            onClick={handleSlotClick}
            className="cursor-grab active:cursor-grabbing w-full h-full"
          >
          <Image
              src={getRecipeImageUrl(recipeImageUrl)}
              alt={recipe.title}
              fill
              sizes="(max-width: 768px) 120px, 260px"
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110 pointer-events-none"
            />
          </div>

          {/* Remove button - not draggable */}
          <div className="absolute top-1 right-1 md:top-2 md:right-2 flex gap-1 z-20">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove(mealType, date)
              }}
              className="bg-destructive text-destructive-foreground rounded-full p-1 shadow-md hover:shadow-lg transition-shadow cursor-pointer touch-manipulation flex items-center justify-center min-w-[24px] min-h-[24px] md:min-w-0 md:min-h-0"
              aria-label={`Remove ${recipe.title}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Static Title Overlay (always visible) - also draggable; single click = select slot, double click = recipe overlay */}
          <div
            {...attributes}
            {...listeners}
            onClick={handleSlotClick}
            className="absolute inset-x-0 bottom-0 flex items-end p-1 md:p-2.5 z-10 cursor-grab active:cursor-grabbing bg-gradient-to-t from-black/80 to-transparent"
          >
            <h4 className="font-semibold text-[10px] md:text-sm line-clamp-1 md:line-clamp-2 text-white w-full pointer-events-none truncate">{recipe.title}</h4>
          </div>
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
          <div className={`rounded-full border-2 p-1.5 md:p-3 transition-colors ${isDropTarget ? "border-primary text-primary" : "border-accent/60 text-accent"}`}>
            <Plus className="h-4 w-4 md:h-6 md:w-6" />
          </div>
        </div>
      )}
    </div>
  )
}

export const MealSlotCard = memo(MealSlotCardComponent)
