"use client"

import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { BookOpen, CheckCircle2, Sparkles, X } from "lucide-react"
import clsx from "clsx"

interface TutorialSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  confirmLabel?: string
}

const TOUR_HIGHLIGHTS = [
  "Learn the dashboard, recipe library, planner, shopping flow, and home screen in one steady order.",
  "Follow one shared walkthrough that moves top to bottom on each page.",
  "Jump in anytime and exit whenever you want.",
]

export function TutorialSelectionModal({
  isOpen,
  onClose,
  title = "Guided Product Tour",
  description = "Take the shared Secret Sauce tour for a clear, start-to-finish walkthrough of the app.",
  confirmLabel = "Start Tour",
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
          "relative w-full max-w-2xl overflow-hidden p-0 mx-4",
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

        <div className="space-y-0">
          <div
            className={clsx(
              "px-8 pt-8 pb-6 border-b",
              isDark ? "bg-[#181813] border-[#e8dcc4]/15" : "bg-orange-50 border-orange-200"
            )}
          >
            <p
              className={clsx(
                "uppercase tracking-[0.25em] text-[11px] mb-2",
                isDark ? "text-[#e8dcc4]/60" : "text-orange-700/80"
              )}
            >
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

          <div className="px-8 py-8">
            <div
              className={clsx(
                "rounded-2xl border p-6",
                isDark ? "border-[#e8dcc4]/20 bg-[#181813]" : "border-orange-200 bg-white/80"
              )}
            >
              <div className="flex items-center gap-3 mb-5">
                <div
                  className={clsx(
                    "rounded-xl p-3",
                    isDark ? "bg-[#e8dcc4]/10 text-[#e8dcc4]" : "bg-orange-100 text-orange-700"
                  )}
                >
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <p className={clsx("text-base font-medium", isDark ? "text-[#e8dcc4]" : "text-amber-950")}>
                    One shared tour
                  </p>
                  <p className={clsx("text-sm", isDark ? "text-[#e8dcc4]/60" : "text-amber-900/70")}>
                    No branching paths, just the clearest route through the product.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {TOUR_HIGHLIGHTS.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2
                      className={clsx(
                        "w-4 h-4 mt-0.5 shrink-0",
                        isDark ? "text-[#e8dcc4]/80" : "text-orange-600"
                      )}
                    />
                    <p className={clsx("text-sm font-light", isDark ? "text-[#e8dcc4]/75" : "text-amber-950/80")}>
                      {item}
                    </p>
                  </div>
                ))}
              </div>

              <div
                className={clsx(
                  "mt-6 rounded-xl px-4 py-3 text-sm flex items-center gap-3",
                  isDark ? "bg-[#e8dcc4]/5 text-[#e8dcc4]/70" : "bg-orange-50 text-orange-900/80"
                )}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <p>The walkthrough saves your place automatically while it is active.</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end px-8 pb-8">
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
