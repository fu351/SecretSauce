"use client"

import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { useRouter } from "next/navigation"
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
  const router = useRouter()
  const isDark = theme === "dark"

  const handleSelectTutorial = (tutorialId: "cooking" | "budgeting" | "health") => {
    startTutorial(tutorialId)
    onClose()
    router.push("/dashboard")
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card
        className={clsx(
          "w-full max-w-2xl mx-4 p-8 relative",
          isDark ? "bg-[#181813] border-[#e8dcc4]/30" : "bg-white border-border"
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

        <div className="space-y-6">
          <div className="space-y-2">
            <h2
              className={clsx(
                "text-3xl font-serif font-light",
                isDark ? "text-[#e8dcc4]" : "text-gray-900"
              )}
            >
              Choose Your Tutorial
            </h2>
            <p
              className={clsx(
                "text-sm",
                isDark ? "text-[#e8dcc4]/60" : "text-gray-500"
              )}
            >
              Select which tutorial you'd like to explore
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tutorials.map((tutorial) => {
              const Icon = tutorial.icon
              return (
                <button
                  key={tutorial.id}
                  onClick={() => handleSelectTutorial(tutorial.id)}
                  className={clsx(
                    "p-6 rounded-lg border-2 transition-all duration-200",
                    "hover:scale-105 hover:shadow-lg",
                    isDark
                      ? "bg-[#1f1e1a] border-[#e8dcc4]/20 hover:border-[#e8dcc4]/50 text-[#e8dcc4]"
                      : "bg-gray-50 border-gray-200 hover:border-gray-300 text-gray-900"
                  )}
                >
                  <Icon className="w-8 h-8 mb-3 mx-auto opacity-80" />
                  <h3 className="font-serif font-light text-base mb-1">
                    {tutorial.title}
                  </h3>
                  <p
                    className={clsx(
                      "text-xs",
                      isDark ? "text-[#e8dcc4]/60" : "text-gray-500"
                    )}
                  >
                    {tutorial.description}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              className={isDark ? "border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
