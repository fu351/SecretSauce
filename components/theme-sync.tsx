"use client"

import { useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"

/**
 * Syncs the user's saved theme preference from their profile
 * to the theme provider on initial page load
 * Defaults to dark mode for users without a saved preference
 */
export function ThemeSync() {
  const { profile } = useAuth()
  const { setTheme } = useTheme()

  useEffect(() => {
    // If user has a profile with a saved theme preference, use it
    if (profile && profile.theme_preference) {
      setTheme(profile.theme_preference)
    } else {
      // Default to dark mode for all users (logged in or not)
      setTheme("dark")
    }
  }, [profile?.theme_preference, setTheme])

  return null
}
