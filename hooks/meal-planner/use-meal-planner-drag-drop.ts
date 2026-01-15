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

type Recipe = any

interface UseMealPlannerDragDropParams {
  mealPlanner: any // ReturnType<typeof useMealPlanner>
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
  getDroppableProps: (mealType: string, date: string) => {
    droppableId: string
    data: { mealType: string; date: string }
  }

  // Current drop target for visual feedback
  activeDropTarget: { mealType: string; date: string } | null

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
}: UseMealPlannerDragDropParams): UseMealPlannerDragDropReturn {
  // Track active drag and drop state
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null)
  const [activeDropTarget, setActiveDropTarget] = useState<{
    mealType: string
    date: string
  } | null>(null)

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
      const dropData = over.data.current as { mealType: string; date: string }

      if (!dragData || !dropData) {
        setActiveDragData(null)
        return
      }

      const { recipe, source, sourceMealType, sourceDate } = dragData
      const { mealType: targetMealType, date: targetDate } = dropData

      try {
        if (source === 'modal') {
          // Add from modal to slot
          await mealPlanner.addToMealPlan(recipe, targetMealType, targetDate)
        } else if (source === 'slot') {
          // Move between slots
          if (sourceMealType === targetMealType && sourceDate === targetDate) {
            // Same slot - do nothing
            setActiveDragData(null)
            return
          }

          // Remove from source, then add to target
          await mealPlanner.removeFromMealPlan(sourceMealType!, sourceDate!)
          await mealPlanner.addToMealPlan(recipe, targetMealType, targetDate)
        }
      } catch (error) {
        console.error('Failed to handle drop:', error)
        // TODO: Show error toast to user
      } finally {
        setActiveDragData(null)
      }
    },
    [mealPlanner]
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
  const getDroppableProps = useCallback((mealType: string, date: string) => ({
    droppableId: `slot-${mealType}-${date}`,
    data: {
      mealType,
      date,
    },
  }), [])

  return {
    activeDragData,
    getDraggableProps,
    getDroppableProps,
    activeDropTarget,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}
