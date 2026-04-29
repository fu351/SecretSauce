"use client"

import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { X } from "lucide-react"
import clsx from "clsx"

interface TutorialSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  confirmLabel?: string
}

export function TutorialSelectionModal({
  isOpen,
  onClose,
  title = "Start Tutorial",
  description = "We'll guide you through the main parts of Secret Sauce so you can get oriented quickly.",
  confirmLabel = "Start Tutorial",
}: TutorialSelectionModalProps) {
  const { startTutorial } = useTutorial()
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const handleStartTour = () => {
    startTutorial()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card
        className={clsx(
          "relative mx-4 w-full max-w-lg overflow-hidden p-0",
          isDark ? "bg-[#0a0a0a] border-[#e8dcc4]/30" : "bg-[#FAF4E5] border-orange-200"
        )}
      >
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

        <div>
          <div
            className={clsx(
              "border-b px-8 pb-5 pt-8",
              isDark ? "bg-[#181813] border-[#e8dcc4]/15" : "bg-orange-50 border-orange-200"
            )}
          >
            <h2
              className={clsx(
                "mb-2 text-3xl font-serif font-light",
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

          <div className="space-y-4 px-8 py-6">
            <p className={clsx("text-sm leading-6", isDark ? "text-[#e8dcc4]/75" : "text-amber-950/80")}>
              The tutorial covers the dashboard, recipes, planning, shopping, and home screen in a short guided flow.
            </p>
            <p className={clsx("text-sm leading-6", isDark ? "text-[#e8dcc4]/60" : "text-amber-900/70")}>
              You can leave at any time, and your place will be saved while the tutorial is active.
            </p>
          </div>

          <div className="flex justify-end gap-3 px-8 pb-8">
            <Button
              onClick={handleStartTour}
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
