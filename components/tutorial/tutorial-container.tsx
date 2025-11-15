"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { X } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import clsx from "clsx"

export interface TutorialStep {
  id: number
  title: string
  description: string
  longDescription?: string
  icon?: React.ReactNode
  action: "navigate" | "screenshot"
  actionTarget?: string
  actionLabel: string
  estimatedSeconds?: number
  notes?: string[]
}

interface TutorialContainerProps {
  steps: TutorialStep[]
  tutorialPath: "cooking" | "budgeting" | "health"
  onComplete: () => void
}

/**
 * Tutorial Container - Main wrapper for interactive tutorials
 * Handles step progression, navigation, and completion
 */
export function TutorialContainer({ steps, tutorialPath, onComplete }: TutorialContainerProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [hasStartedNavigation, setHasStartedNavigation] = useState(false)
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const currentStep = steps[currentStepIndex]
  const progressPercent = ((currentStepIndex + 1) / steps.length) * 100
  const isLastStep = currentStepIndex === steps.length - 1

  const handleSkip = async () => {
    await fetch("/api/tutorial/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tutorial_path: tutorialPath }),
    })
    onComplete()
    router.push("/dashboard")
  }

  const handleNext = () => {
    if (isLastStep) {
      onComplete()
    } else {
      setCurrentStepIndex((prev) => prev + 1)
      setHasStartedNavigation(false)
    }
  }

  const handleNavigate = () => {
    if (currentStep.actionTarget) {
      setHasStartedNavigation(true)
      router.push(currentStep.actionTarget)
    }
  }

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
      setHasStartedNavigation(false)
    }
  }

  const bgClass = isDark
    ? "bg-background"
    : "bg-gradient-to-br from-orange-50 to-yellow-50"

  const cardClass = clsx(
    "shadow-lg border rounded-2xl",
    isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0"
  )

  return (
    <div className={clsx("min-h-screen transition-colors", bgClass)}>
      {/* Header with progress and skip */}
      <div className={clsx(
        "border-b sticky top-0 z-40",
        isDark ? "bg-card/80 border-border backdrop-blur-sm" : "bg-white/80 backdrop-blur-sm"
      )}>
        <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                Step {currentStepIndex + 1} of {steps.length}
              </p>
              <Progress value={progressPercent} className="h-2" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="ml-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Step content */}
          <div className="lg:col-span-2 space-y-6">
            <Card className={cardClass}>
              <div className="p-8 space-y-6">
                {/* Icon and title */}
                <div className="flex items-start gap-4">
                  {currentStep.icon && (
                    <div className={clsx(
                      "p-3 rounded-lg flex-shrink-0",
                      isDark ? "bg-primary/10" : "bg-orange-100"
                    )}>
                      {currentStep.icon}
                    </div>
                  )}
                  <div className="flex-1">
                    <h2 className={clsx(
                      "text-3xl font-serif font-light mb-2",
                      isDark ? "text-foreground" : "text-gray-900"
                    )}>
                      {currentStep.title}
                    </h2>
                    <p className={clsx(
                      "text-lg",
                      isDark ? "text-muted-foreground" : "text-gray-600"
                    )}>
                      {currentStep.description}
                    </p>
                  </div>
                </div>

                {/* Long description if provided */}
                {currentStep.longDescription && (
                  <p className={clsx(
                    "text-base leading-relaxed",
                    isDark ? "text-muted-foreground" : "text-gray-600"
                  )}>
                    {currentStep.longDescription}
                  </p>
                )}

                {/* Notes/tips if provided */}
                {currentStep.notes && currentStep.notes.length > 0 && (
                  <div className="space-y-2 pt-4 border-t border-border">
                    <p className={clsx(
                      "text-sm font-medium",
                      isDark ? "text-foreground" : "text-gray-700"
                    )}>
                      💡 Quick Tips:
                    </p>
                    <ul className="space-y-1">
                      {currentStep.notes.map((note, idx) => (
                        <li key={idx} className={clsx(
                          "text-sm",
                          isDark ? "text-muted-foreground" : "text-gray-600"
                        )}>
                          • {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action button */}
                {currentStep.actionTarget && (
                  <Button
                    onClick={handleNavigate}
                    className={clsx(
                      "w-full py-6 text-base mt-4",
                      isDark
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-orange-500 hover:bg-orange-600 text-white"
                    )}
                  >
                    {currentStep.actionLabel}
                  </Button>
                )}

                {/* Estimated time */}
                {currentStep.estimatedSeconds && (
                  <p className={clsx(
                    "text-xs text-center",
                    isDark ? "text-muted-foreground" : "text-gray-500"
                  )}>
                    ⏱️ This step takes about {currentStep.estimatedSeconds} seconds
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Right: Summary/guide */}
          <div className="lg:col-span-1">
            <Card className={cardClass}>
              <div className="p-6 space-y-4">
                <h3 className={clsx(
                  "font-serif text-lg font-light",
                  isDark ? "text-foreground" : "text-gray-900"
                )}>
                  Tutorial Path
                </h3>
                <div className="space-y-2">
                  {steps.map((step, idx) => (
                    <div
                      key={step.id}
                      className={clsx(
                        "p-2 rounded text-sm transition-colors cursor-pointer",
                        idx === currentStepIndex
                          ? isDark
                            ? "bg-primary/20 text-primary"
                            : "bg-orange-100 text-orange-700 font-medium"
                          : isDark
                            ? "text-muted-foreground hover:text-foreground"
                            : "text-gray-600 hover:text-gray-900",
                        idx < currentStepIndex && "opacity-60"
                      )}
                      onClick={() => {
                        if (idx < currentStepIndex) {
                          setCurrentStepIndex(idx)
                          setHasStartedNavigation(false)
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={clsx(
                          "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                          idx < currentStepIndex
                            ? isDark
                              ? "bg-primary text-primary-foreground"
                              : "bg-orange-500 text-white"
                            : idx === currentStepIndex
                              ? isDark
                                ? "bg-primary/40 text-primary"
                                : "bg-orange-200 text-orange-700"
                              : isDark
                                ? "border border-muted text-muted-foreground"
                                : "border border-gray-300 text-gray-500"
                        )}>
                          {idx < currentStepIndex ? "✓" : idx + 1}
                        </div>
                        <span className="truncate">{step.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="mt-8 flex gap-3 justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="px-6"
          >
            ← Back
          </Button>

          <Button
            variant="outline"
            onClick={handleSkip}
            className="px-6"
          >
            Skip Tutorial
          </Button>

          <Button
            onClick={handleNext}
            className={clsx(
              "px-6",
              isDark
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-orange-500 hover:bg-orange-600 text-white"
            )}
          >
            {isLastStep ? "Complete Tutorial" : "Next →"}
          </Button>
        </div>
      </div>
    </div>
  )
}
