"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"

/**
 * Finalize Onboarding Page
 *
 * This page is loaded after email verification to save cached onboarding data
 * that was collected BEFORE the user verified their email.
 *
 * Flow:
 * 1. User signs up
 * 2. User completes onboarding (data cached in localStorage)
 * 3. User verifies email (gets redirected here)
 * 4. This page saves cached data to profile
 * 5. Redirects to welcome page to start tutorial
 */
export default function FinalizeOnboardingPage() {
  const { user, profile, updateProfile } = useAuth()
  const { setTheme } = useTheme()
  const router = useRouter()
  const [saving, setSaving] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const finalizePendingOnboarding = async () => {
      if (!user) {
        console.log('[Finalize] Waiting for user authentication...')
        return
      }

      console.log('[Finalize] User authenticated, checking for cached onboarding data')

      // Check if profile already has primary_goal (onboarding already done)
      if (profile?.primary_goal) {
        console.log('[Finalize] Profile already has primary_goal, redirecting to welcome')
        router.push('/welcome')
        return
      }

      // Retrieve cached onboarding data from localStorage
      const cachedDataString = localStorage.getItem('pending_onboarding_data')
      if (!cachedDataString) {
        console.warn('[Finalize] No cached onboarding data found, redirecting to onboarding')
        router.push('/onboarding')
        return
      }

      try {
        const cachedData = JSON.parse(cachedDataString)
        console.log('[Finalize] Found cached onboarding data, saving to profile...', cachedData)

        // Apply theme from cached data
        if (cachedData.theme_preference) {
          setTheme(cachedData.theme_preference)
        }

        // Save to profile
        await updateProfile(cachedData)

        // Clear cached data
        localStorage.removeItem('pending_onboarding_data')
        console.log('[Finalize] Successfully saved onboarding data and cleared cache')

        // Redirect to welcome page
        router.push('/welcome')
      } catch (err) {
        console.error('[Finalize] Error saving cached onboarding data:', err)
        setError('Failed to save your preferences. Please try again.')
        setSaving(false)
      }
    }

    finalizePendingOnboarding()
  }, [user, profile, updateProfile, setTheme, router])

  const { theme } = useTheme()
  const isDark = theme === "dark"

  if (error) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center px-6 ${
          isDark ? "bg-[#0a0a0a] text-[#e8dcc4]" : "bg-[#FAF4E5] text-gray-900"
        }`}
      >
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-serif font-light">Oops!</h1>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => router.push('/onboarding')}
            className={`px-6 py-3 rounded-lg ${
              isDark ? "bg-[#e8dcc4] text-[#0a0a0a]" : "bg-orange-500 text-white"
            }`}
          >
            Go to Onboarding
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-6 ${
        isDark ? "bg-[#0a0a0a] text-[#e8dcc4]" : "bg-[#FAF4E5] text-gray-900"
      }`}
    >
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current mx-auto" />
        <h1 className="text-2xl font-serif font-light">Finalizing your setup...</h1>
        <p className="text-sm opacity-70">Saving your preferences</p>
      </div>
    </div>
  )
}
