"use client"

import { useEffect, useState } from "react"
import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChefHat, DollarSign, GripVertical, Users, X } from "lucide-react"
import type { RankedGoals } from "@/lib/types/tutorial"
import clsx from "clsx"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface TutorialSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  confirmLabel?: string
}

const tutorials = [
  {
    id: "cooking" as const,
    title: "Mastering the Craft",
    description: "Learn to cook with confidence",
    icon: ChefHat,
  },
  {
    id: "budgeting" as const,
    title: "Optimize Resources",
    description: "Save money on groceries",
    icon: DollarSign,
  },
  {
    id: "health" as const,
    title: "Elevate Your Journey",
    description: "Save time and prioritize your health",
    icon: Users,
  },
]

type TutorialId = (typeof tutorials)[number]["id"]
const defaultTutorialOrder: TutorialId[] = ["cooking", "budgeting", "health"]

function isTutorialId(value: unknown): value is TutorialId {
  return value === "cooking" || value === "budgeting" || value === "health"
}

function isTutorialRanking(value: unknown): value is TutorialId[] {
  return Array.isArray(value) && value.length > 0 && value.every(isTutorialId)
}

function SortableTutorialItem({
  tutorial,
  rank,
  isDark,
}: {
  tutorial: (typeof tutorials)[number]
  rank: number
  isDark: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tutorial.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  const Icon = tutorial.icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "w-full p-5 rounded-lg border transition-all duration-200",
        isDark
          ? "bg-[#181813] border-[#e8dcc4]/20 text-[#e8dcc4]"
          : "bg-[#FFF8F0] border-orange-400 text-amber-950"
      )}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={clsx(
            "cursor-grab active:cursor-grabbing p-1 touch-none rounded",
            isDark ? "hover:bg-[#e8dcc4]/10" : "hover:bg-orange-100"
          )}
          aria-label={`Reorder ${tutorial.title}`}
        >
          <GripVertical className={clsx("h-5 w-5", isDark ? "text-[#e8dcc4]/40" : "text-orange-500")} />
        </button>

        <div className={clsx(
          "w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
          isDark ? "bg-[#e8dcc4]/10 text-[#e8dcc4]" : "bg-orange-100 text-orange-700"
        )}>
          {rank}
        </div>

        <div className={clsx(
          "p-2 rounded-lg border shrink-0",
          isDark ? "border-[#e8dcc4]/20 bg-[#e8dcc4]/5" : "border-orange-600 bg-orange-100"
        )}>
          <Icon className={clsx("w-5 h-5", isDark ? "text-[#e8dcc4]" : "text-orange-700")} />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className={clsx(
            "font-light text-base",
            isDark ? "text-[#e8dcc4]" : "text-amber-950"
          )}>
            {tutorial.title}
          </h3>
          <p
            className={clsx(
              "text-xs font-light",
              isDark ? "text-[#e8dcc4]/60" : "text-amber-900"
            )}
          >
            {tutorial.description}
          </p>
        </div>
      </div>
    </div>
  )
}

export function TutorialSelectionModal({
  isOpen,
  onClose,
  title = "Guided Product Tour",
  description = "We’ll walk through one shared tour in a steady page-by-page flow. Your goal order is still saved for personalization outside the tutorial.",
  confirmLabel = "Start Tour",
}: TutorialSelectionModalProps) {
  const { startRankedSession } = useTutorial()
  const { profile } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [rankedTutorials, setRankedTutorials] = useState<TutorialId[]>(defaultTutorialOrder)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (!isOpen) return

    const savedRanking = profile?.tutorial_goals_ranking
    if (isTutorialRanking(savedRanking)) {
      setRankedTutorials(savedRanking)
      return
    }

    setRankedTutorials(defaultTutorialOrder)
  }, [isOpen, profile?.tutorial_goals_ranking])

  const handleRankDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setRankedTutorials((prev) => {
      const oldIndex = prev.indexOf(active.id as TutorialId)
      const newIndex = prev.indexOf(over.id as TutorialId)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const handleStartRankedTour = () => {
    startRankedSession(rankedTutorials as RankedGoals)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card
        className={clsx(
          "w-full max-w-2xl mx-4 p-0 relative overflow-hidden",
          isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/30" : "bg-[#FAF4E5] border-orange-200"
        )}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className={clsx(
            "absolute top-4 right-4 p-2 rounded hover:opacity-70 transition-opacity",
            isDark ? "text-[#e8dcc4]/60 hover:bg-[#e8dcc4]/10" : "text-gray-400 hover:bg-gray-100"
          )}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-0">
          <div className={clsx(
            "px-8 pt-8 pb-6 border-b",
            isDark ? "bg-[#181813] border-[#e8dcc4]/15" : "bg-orange-50 border-orange-200"
          )}>
            <p className={clsx(
              "uppercase tracking-[0.25em] text-[11px] mb-2",
              isDark ? "text-[#e8dcc4]/60" : "text-orange-700/80"
            )}>
              Tutorial
            </p>
            <h2
              className={clsx(
                "text-3xl font-serif font-light mb-2",
                isDark ? "text-[#e8dcc4]" : "text-amber-950"
              )}
            >
              {title}
            </h2>
            <p
              className={clsx(
                "text-sm font-light",
                isDark ? "text-[#e8dcc4]/65" : "text-amber-900/80"
              )}
            >
              {description}
            </p>
          </div>

          <div className="px-8 py-6">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleRankDragEnd}
            >
              <SortableContext items={rankedTutorials} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {rankedTutorials.map((tutorialId, index) => {
                    const tutorial = tutorials.find((item) => item.id === tutorialId)
                    if (!tutorial) return null

                    return (
                      <SortableTutorialItem
                        key={tutorial.id}
                        tutorial={tutorial}
                        rank={index + 1}
                        isDark={isDark}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>

          </div>

          <div className="flex gap-3 justify-end px-8 pb-8">
            <Button
              onClick={handleStartRankedTour}
              className={clsx(
                isDark
                  ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
                  : "bg-orange-500 text-white hover:bg-orange-600"
              )}
            >
              {confirmLabel}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className={isDark ? "border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#e8dcc4]/10" : "border-orange-300 text-orange-800 hover:bg-orange-100"}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
