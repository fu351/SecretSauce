"use client"

import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChefHat, DollarSign, Users, X } from "lucide-react"
import clsx from "clsx"

interface TutorialSelectionModalProps {
  isOpen: boolean
  onClose: () => void
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

export function TutorialSelectionModal({
  isOpen,
  onClose,
}: TutorialSelectionModalProps) {
  const { startTutorial } = useTutorial()
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const handleSelectTutorial = (tutorialId: "cooking" | "budgeting" | "health") => {
    startTutorial(tutorialId)
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
              Your Primary Intention
            </h2>
            <p
              className={clsx(
                "text-sm font-light",
                isDark ? "text-[#e8dcc4]/65" : "text-amber-900/80"
              )}
            >
              Choose where you want to focus first, just like onboarding.
            </p>
          </div>

          <div className="px-8 py-6">
            <div className="space-y-3">
              {tutorials.map((tutorial, index) => {
                const Icon = tutorial.icon
                return (
                  <button
                    key={tutorial.id}
                    onClick={() => handleSelectTutorial(tutorial.id)}
                    className={clsx(
                      "w-full p-5 rounded-lg border text-left transition-all duration-200",
                      "hover:scale-[1.01]",
                      isDark
                        ? "bg-[#181813] border-[#e8dcc4]/20 hover:border-[#e8dcc4]/45 text-[#e8dcc4]"
                        : "bg-[#FFF8F0] border-orange-400 hover:border-orange-600 text-amber-950"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={clsx(
                        "w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                        isDark ? "bg-[#e8dcc4]/10 text-[#e8dcc4]" : "bg-orange-100 text-orange-700"
                      )}>
                        {index + 1}
                      </div>
                      <div className={clsx(
                        "p-2 rounded-lg border shrink-0",
                        isDark ? "border-[#e8dcc4]/20 bg-[#e8dcc4]/5" : "border-orange-600 bg-orange-100"
                      )}>
                        <Icon className={clsx("w-5 h-5", isDark ? "text-[#e8dcc4]" : "text-orange-700")} />
                      </div>
                      <div className="min-w-0">
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
                  </button>
                )
              })}
            </div>

            <p className={clsx(
              "text-xs mt-4",
              isDark ? "text-[#e8dcc4]/45" : "text-amber-900/80"
            )}>
              Pick any path to begin immediately. You can restart and switch paths anytime in Settings.
            </p>
          </div>

          <div className="flex gap-3 justify-end px-8 pb-8">
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
