"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useUser } from "@clerk/nextjs"
import { useTutorial } from "@/contexts/tutorial-context"
import { useTheme } from "@/contexts/theme-context"
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react"

export default function WelcomePage() {
  const { user, isLoaded } = useUser()
  const profile = user?.unsafeMetadata
  const { startTutorial, skipTutorial, isActive } = useTutorial()
  const { theme } = useTheme()
  const router = useRouter()
  const [isStarting, setIsStarting] = useState(false)

  const isDark = theme === "dark"

  useEffect(() => {
    if (isLoaded && !user) {
      router.push("/auth/signin")
    }
  }, [user, isLoaded, router])

  const handleStartTutorial = () => {
    console.log('[Welcome] handleStartTutorial called', {
      profile,
      primaryGoal: profile?.primary_goal,
      isActive
    })

    if (!profile?.primary_goal) {
      console.warn('[Welcome] No primary_goal found, redirecting to dashboard')
      router.push("/dashboard")
      return
    }

    setIsStarting(true)

    const pathMap: Record<string, "cooking" | "budgeting" | "health"> = {
      cooking: "cooking",
      budgeting: "budgeting",
      both: "health",
    }

    const tutorialPath = pathMap[profile.primary_goal]
    console.log('[Welcome] Mapped primary_goal to tutorial path:', {
      primaryGoal: profile.primary_goal,
      tutorialPath
    })

    if (tutorialPath) {
      console.log('[Welcome] Starting tutorial and navigating to dashboard')
      startTutorial(tutorialPath)
      // Give the tutorial state time to update before navigation
      setTimeout(() => {
        router.push("/dashboard")
      }, 300)
    } else {
      console.warn('[Welcome] No tutorial path found for primary_goal:', profile.primary_goal)
      router.push("/dashboard")
    }
  }

  const handleSkipTutorial = () => {
    // Call skipTutorial to set localStorage flag and prevent auto-start
    skipTutorial()
    router.push("/dashboard")
  }

  if (!isLoaded) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0a0a0a]" : "bg-[#FAF4E5]"}`}
      >
        <div className={`text-center ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current mx-auto mb-4" />
          <p className="font-light">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-6 py-12 ${
        isDark ? "bg-[#0a0a0a] text-[#e8dcc4]" : "bg-[#FAF4E5] text-gray-900"
      }`}
    >
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: isDark
              ? "radial-gradient(circle at 2px 2px, #e8dcc4 1px, transparent 0)"
              : "radial-gradient(circle at 2px 2px, #f97316 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <Card
        className={`w-full max-w-2xl relative z-10 ${
          isDark ? "bg-[#181813] border-[#e8dcc4]/20" : "bg-white border-orange-200"
        }`}
      >
        <div className="p-8 md:p-12 space-y-8">
          <div className="flex justify-center">
            <div className={`relative ${isDark ? "text-[#e8dcc4]" : "text-orange-600"}`}>
              <CheckCircle2 className="w-20 h-20" />
              <Sparkles className="w-8 h-8 absolute -top-2 -right-2 animate-pulse" />
            </div>
          </div>

          <div className="text-center space-y-3">
            <h1
              className={`text-3xl md:text-4xl font-serif font-light tracking-tight ${
                isDark ? "text-[#e8dcc4]" : "text-gray-900"
              }`}
            >
              Welcome to Secret Sauce!
            </h1>
            <p className={`text-lg font-light ${isDark ? "text-[#e8dcc4]/70" : "text-gray-700"}`}>
              Your email has been verified. Let's get you started.
            </p>
          </div>

          <div
            className={`p-6 rounded-lg border ${
              isDark ? "bg-[#e8dcc4]/5 border-[#e8dcc4]/20" : "bg-orange-50 border-orange-200"
            }`}
          >
            <h2 className={`text-xl font-serif font-light mb-3 ${isDark ? "text-[#e8dcc4]" : "text-gray-900"}`}>
              Quick Tour
            </h2>
            <p className={`text-sm mb-4 ${isDark ? "text-[#e8dcc4]/60" : "text-gray-700"}`}>
              We've prepared a personalized tour based on your preferences.
              It will guide you through:
            </p>
            <ul className={`space-y-2 text-sm ${isDark ? "text-[#e8dcc4]/70" : "text-gray-700"}`}>
              <li className="flex items-start gap-2">
                <ArrowRight className={`w-4 h-4 mt-0.5 ${isDark ? "text-[#e8dcc4]" : "text-orange-600"}`} />
                <span>Finding and filtering recipes that match your taste</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className={`w-4 h-4 mt-0.5 ${isDark ? "text-[#e8dcc4]" : "text-orange-600"}`} />
                <span>Planning your weekly meals</span>
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight className={`w-4 h-4 mt-0.5 ${isDark ? "text-[#e8dcc4]" : "text-orange-600"}`} />
                <span>Comparing grocery prices across stores</span>
              </li>
            </ul>
            <p className={`text-xs mt-4 ${isDark ? "text-[#e8dcc4]/50" : "text-gray-600"}`}>
              Takes about 2-3 minutes • You can skip or exit anytime
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleStartTutorial}
              disabled={isStarting || !profile}
              className={`w-full py-6 text-base font-light tracking-wide ${
                isDark ? "bg-[#e8dcc4] text-[#0a0a0a] hover:bg-[#d4c8b0]" : "bg-orange-500 text-white hover:bg-orange-600"
              }`}
            >
              {isStarting ? "Starting tour..." : "Start the tour"}
            </Button>

            <Button
              onClick={handleSkipTutorial}
              variant="ghost"
              className={`w-full py-6 text-base font-light ${
                isDark ? "text-[#e8dcc4]/70 hover:text-[#e8dcc4] hover:bg-[#e8dcc4]/10" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              Skip for now
            </Button>
          </div>

          <p className={`text-center text-xs ${isDark ? "text-[#e8dcc4]/50" : "text-gray-500"}`}>
            You can always restart the tour from your settings
          </p>
        </div>
      </Card>
    </div>
  )
}
