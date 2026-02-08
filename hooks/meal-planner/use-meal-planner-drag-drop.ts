'use client'

import { useCallback, useState } from 'react'
import {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from '@dnd-kit/core'
import { useToast } from '@/hooks'
import type { Recipe } from '@/lib/types'

interface UseMealPlannerDragDropParams {
  mealPlanner: any // ReturnType<typeof useMealPlanner>
  /** Called after adding a recipe from the sidebar; return the next empty slot to highlight with the gold border. */
  getNextEmptySlotAfter?: (mealType: string, date: string) => { mealType: string; date: string } | null
}

interface DragData {
  recipe: Recipe
  source: 'modal' | 'slot'
  sourceMealType?: string
  sourceDate?: string
}

interface UseMealPlannerDragDropReturn {
  // Current drag state for UI feedback
  activeDragData: DragData | null

  // For draggable items
  getDraggableProps: (
    recipe: Recipe,
    source: 'modal' | 'slot',
    mealType?: string,
    date?: string
  ) => {
    draggableId: string
    data: DragData
  }

  // For drop zones
  getDroppableProps: (mealType: string, date: string, recipe?: Recipe | null) => {
    droppableId: string
    data: { mealType: string; date: string; hasRecipe?: boolean; existingRecipe?: Recipe }
  }

  // Current drop target for visual feedback
  activeDropTarget: { mealType: string; date: string } | null

  /** Call after adding a recipe by click (not drag) to highlight the next empty slot. */
  highlightNextEmptySlotAfter: (mealType: string, date: string) => void

  /** Set the highlighted slot (e.g. when user clicks a slot to select it). */
  setHighlightSlot: (mealType: string, date: string) => void

  // Sensors configuration
  sensors: ReturnType<typeof useSensors>

  // Handlers for DndContext
  handleDragStart: (event: any) => void
  handleDragOver: (event: DragOverEvent) => void
  handleDragEnd: (event: DragEndEvent) => void
  handleDragCancel: () => void
}

export function useMealPlannerDragDrop({
  mealPlanner,
  getNextEmptySlotAfter,
}: UseMealPlannerDragDropParams): UseMealPlannerDragDropReturn {
  // Track active drag and drop state
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null)
  const [activeDropTarget, setActiveDropTarget] = useState<{
    mealType: string
    date: string
  } | null>(null)
  const { toast } = useToast()

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag (prevents accidental drags)
      },
    }),
    useSensor(KeyboardSensor)
  )

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const dragData = event.active.data.current as DragData
    if (dragData) {
      setActiveDragData(dragData)

      // Hide the default browser drag preview by setting a transparent image
      const emptyImage = new Image()
      emptyImage.src = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22%3E%3C/svg%3E'
      // Note: dnd-kit handles this automatically through DragOverlay, but we set it for any HTML5 backend fallback
    }
  }, [])

  // Handle drag over
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (over?.data.current) {
      const dropData = over.data.current as { mealType: string; date: string }
      setActiveDropTarget(dropData)
    } else {
      // Clear drop target when dragging over empty space
      setActiveDropTarget(null)
    }
  }, [])

  // Handle drag cancel/leave
  const handleDragCancel = useCallback(() => {
    setActiveDragData(null)
    setActiveDropTarget(null)
  }, [])

  // Handle drop
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      setActiveDropTarget(null)

      if (!over) {
        // Dragged outside any drop zone
        setActiveDragData(null)
        return
      }

      const dragData = active.data.current as DragData
      const dropData = over.data.current as { mealType: string; date: string; hasRecipe?: boolean; existingRecipe?: Recipe }

      if (!dragData || !dropData) {
        setActiveDragData(null)
        return
      }

      const { recipe, source, sourceMealType, sourceDate } = dragData
      const { mealType: targetMealType, date: targetDate, hasRecipe, existingRecipe } = dropData

      try {
        if (source === 'modal') {
          // Add from modal/sidebar to slot
          await mealPlanner.addToMealPlan(recipe, targetMealType, targetDate)
          // Highlight the next available slot so the next drag goes there instead of replacing this one
          const next = getNextEmptySlotAfter?.(targetMealType, targetDate)
          if (next) setActiveDropTarget(next)
        } else if (source === 'slot') {
          // Move or swap between slots
          if (sourceMealType === targetMealType && sourceDate === targetDate) {
            // Same slot - do nothing
            setActiveDragData(null)
            return
          }

          // Check if target slot has a recipe (swap scenario)
          if (hasRecipe && existingRecipe) {
            // Swap operation: exchange recipes between slots
            try {
              // 1. Remove source recipe
              await mealPlanner.removeFromMealPlan(sourceMealType!, sourceDate!, { reload: false })

              try {
                // 2. Remove target recipe
                await mealPlanner.removeFromMealPlan(targetMealType, targetDate, { reload: false })
              } catch (e) {
                // Rollback 1
                await mealPlanner.addToMealPlan(recipe, sourceMealType!, sourceDate!, { reload: false })
                throw e
              }

              try {
                // 3. Add source recipe to target slot
                await mealPlanner.addToMealPlan(recipe, targetMealType, targetDate, { reload: false })
              } catch (e) {
                // Rollback 1 and 2
                await mealPlanner.addToMealPlan(recipe, sourceMealType!, sourceDate!, { reload: false })
                await mealPlanner.addToMealPlan(existingRecipe, targetMealType, targetDate, { reload: false })
                throw e
              }
              
              try {
                // 4. Add target recipe to source slot
                await mealPlanner.addToMealPlan(existingRecipe, sourceMealType!, sourceDate!, { reload: false })
              } catch (e) {
                // Rollback 1, 2, and 3
                await mealPlanner.removeFromMealPlan(targetMealType, targetDate, { reload: false })
                await mealPlanner.addToMealPlan(recipe, sourceMealType!, sourceDate!, { reload: false })
                await mealPlanner.addToMealPlan(existingRecipe, targetMealType, targetDate, { reload: false })
                throw e
              }

              console.log('[MealPlanner] Recipes swapped successfully')
            } catch (swapError) {
              console.error('Failed to swap recipes:', swapError)
              toast({
                title: 'Error',
                description: 'Failed to swap recipes. Restoring original state.',
                variant: 'destructive',
              })
              await mealPlanner.reload()
            }
          } else {
            // Move operation: remove from source, then add to target
            try {
              await mealPlanner.removeFromMealPlan(sourceMealType!, sourceDate!, { reload: false })
              try {
                await mealPlanner.addToMealPlan(recipe, targetMealType, targetDate, { reload: false })
              } catch (addError) {
                // Rollback: restore the meal to the source
                console.error('Failed to add meal to target, rolling back:', addError)
                await mealPlanner.addToMealPlan(recipe, sourceMealType!, sourceDate!, { reload: false })
                throw addError
              }
            } catch (moveError) {
              console.error('Failed to move meal:', moveError)
              toast({
                title: 'Error',
                description: 'Failed to move meal. Please try again.',
                variant: 'destructive',
              })
              await mealPlanner.reload()
            }
          }
        }
      } catch (error) {
        console.error('Failed to handle drop:', error)
        if (!(error instanceof Error) || !error.message.includes('already'))  {
          toast({
            title: 'Error',
            description: 'Failed to move meal. Please try again.',
            variant: 'destructive',
          })
        }
      } finally {
        setActiveDragData(null)
      }
    },
    [mealPlanner, toast, getNextEmptySlotAfter]
  )

  // Generate draggable properties
  const getDraggableProps = useCallback(
    (recipe: Recipe, source: 'modal' | 'slot', mealType?: string, date?: string) => ({
      draggableId: source === 'modal' ? `recipe-modal-${recipe.id}` : `recipe-slot-${mealType}-${date}`,
      data: {
        recipe,
        source,
        sourceMealType: mealType,
        sourceDate: date,
      } as DragData,
    }),
    []
  )

  // Generate droppable properties
  const getDroppableProps = useCallback((mealType: string, date: string, recipe?: Recipe | null) => ({
    droppableId: `slot-${mealType}-${date}`,
    data: {
      mealType,
      date,
      hasRecipe: !!recipe,
      existingRecipe: recipe || undefined,
    },
  }), [])

  const highlightNextEmptySlotAfter = useCallback((mealType: string, date: string) => {
    const next = getNextEmptySlotAfter?.(mealType, date)
    if (next) setActiveDropTarget(next)
  }, [getNextEmptySlotAfter])

  const setHighlightSlot = useCallback((mealType: string, date: string) => {
    setActiveDropTarget({ mealType, date })
  }, [])

  return {
    activeDragData,
    getDraggableProps,
    getDroppableProps,
    activeDropTarget,
    highlightNextEmptySlotAfter,
    setHighlightSlot,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}
