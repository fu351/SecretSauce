"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Share, PlusSquare, Check, X } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"

interface IOSWebAppInstallModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function IOSWebAppInstallModal({
  isOpen,
  onClose,
}: IOSWebAppInstallModalProps) {
  const { isDark } = useTheme()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className={`relative w-full max-w-lg mx-4 ${
        isDark
          ? "bg-[#181813] border-[#e8dcc4]/30"
          : "bg-white border-gray-200"
      }`}>
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 p-1 rounded-full transition-colors ${
            isDark
              ? "hover:bg-white/10 text-white/60 hover:text-white"
              : "hover:bg-gray-200 text-gray-400 hover:text-gray-600"
          }`}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <CardHeader className="pb-4">
          <CardTitle className={`text-2xl font-serif font-light ${
            isDark ? "text-white" : "text-gray-900"
          }`}>
            Add to Home Screen
          </CardTitle>
          <p className={`text-sm mt-2 ${
            isDark ? "text-white/70" : "text-gray-600"
          }`}>
            Follow these steps to install Secret Sauce on your iPhone
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex items-center justify-center min-w-10 w-10 h-10 rounded-full bg-blue-600 text-white font-semibold text-sm flex-shrink-0">
              1
            </div>
            <div className="pt-1 flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-full ${
                  isDark ? "bg-gray-700" : "bg-gray-100"
                }`}>
                  <Share className={`w-5 h-5 ${
                    isDark ? "text-gray-300" : "text-gray-600"
                  }`} />
                </div>
                <h4 className={`font-medium ${
                  isDark ? "text-white" : "text-gray-900"
                }`}>
                  Tap the Share button
                </h4>
              </div>
              <p className={`text-sm ${
                isDark ? "text-white/60" : "text-gray-500"
              }`}>
                Look for the share icon at the bottom of your Safari screen
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex items-center justify-center min-w-10 w-10 h-10 rounded-full bg-blue-600 text-white font-semibold text-sm flex-shrink-0">
              2
            </div>
            <div className="pt-1 flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-full ${
                  isDark ? "bg-gray-700" : "bg-gray-100"
                }`}>
                  <PlusSquare className={`w-5 h-5 ${
                    isDark ? "text-gray-300" : "text-gray-600"
                  }`} />
                </div>
                <h4 className={`font-medium ${
                  isDark ? "text-white" : "text-gray-900"
                }`}>
                  Scroll and tap &quot;Add to Home Screen&quot;
                </h4>
              </div>
              <p className={`text-sm ${
                isDark ? "text-white/60" : "text-gray-500"
              }`}>
                You may need to scroll down in the menu to find this option
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex items-center justify-center min-w-10 w-10 h-10 rounded-full bg-blue-600 text-white font-semibold text-sm flex-shrink-0">
              3
            </div>
            <div className="pt-1 flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-full ${
                  isDark ? "bg-gray-700" : "bg-gray-100"
                }`}>
                  <Check className={`w-5 h-5 ${
                    isDark ? "text-gray-300" : "text-gray-600"
                  }`} />
                </div>
                <h4 className={`font-medium ${
                  isDark ? "text-white" : "text-gray-900"
                }`}>
                  Tap &quot;Add&quot; to confirm
                </h4>
              </div>
              <p className={`text-sm ${
                isDark ? "text-white/60" : "text-gray-500"
              }`}>
                The app will appear on your home screen for instant access
              </p>
            </div>
          </div>
        </CardContent>

        <div className="px-6 py-4 border-t border-[#e8dcc4]/20 dark:border-[#e8dcc4]/20">
          <Button
            onClick={onClose}
            className="w-full bg-blue-600 text-white hover:bg-blue-700"
          >
            Got It
          </Button>
        </div>
      </Card>
    </div>
  )
}
