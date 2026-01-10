"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Smartphone, X } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"

interface IOSWebAppPromptBannerProps {
  onDismiss: () => void
  onShowInstructions: () => void
}

export default function IOSWebAppPromptBanner({
  onDismiss,
  onShowInstructions,
}: IOSWebAppPromptBannerProps) {
  const { isDark } = useTheme()

  return (
    <Card className={`mb-6 relative overflow-hidden ${
      isDark
        ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-blue-500/30"
        : "bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200"
    }`}>
      <button
        onClick={onDismiss}
        className={`absolute top-4 right-4 p-1 rounded-full transition-colors ${
          isDark
            ? "hover:bg-white/10 text-white/60 hover:text-white"
            : "hover:bg-gray-200 text-gray-400 hover:text-gray-600"
        }`}
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      <CardContent className="p-6 pr-12">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${
            isDark ? "bg-blue-500/20" : "bg-blue-100"
          }`}>
            <Smartphone className={`w-6 h-6 ${
              isDark ? "text-blue-400" : "text-blue-600"
            }`} />
          </div>

          <div className="flex-1">
            <h3 className={`text-xl font-serif font-light mb-2 ${
              isDark ? "text-white" : "text-gray-900"
            }`}>
              Install Secret Sauce App
            </h3>
            <p className={`text-sm mb-4 ${
              isDark ? "text-white/70" : "text-gray-600"
            }`}>
              Add Secret Sauce to your home screen for quick access and a better experience.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={onShowInstructions}
                className={
                  isDark
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }
              >
                <Smartphone className="w-4 h-4 mr-2" />
                Show Me How
              </Button>

              <Button
                onClick={onDismiss}
                variant="ghost"
                className={
                  isDark
                    ? "text-white/70 hover:text-white hover:bg-white/10"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }
              >
                Don&apos;t Show Again
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
