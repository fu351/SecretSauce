"use client"

import { useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"

/**
 * Syncs the user's saved theme preference from their profile
 * to the theme provider on initial page load
 */
export function ThemeSync() {
  const { profile } = useAuth()
  const { setTheme } = useTheme()

  useEffect(() => {
    // Only apply theme if user has a profile with a saved theme preference
    if (profile && profile.theme_preference) {
      setTheme(profile.theme_preference)
    }
  }, [profile?.theme_preference, setTheme])

  return null
}
