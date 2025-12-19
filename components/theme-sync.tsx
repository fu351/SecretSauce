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
  const { theme: currentTheme, setTheme } = useTheme()

  useEffect(() => {
    const preferredTheme = profile?.theme_preference

    // Validate theme value - must be 'light' or 'dark'
    const isValidTheme = (value: any): value is 'light' | 'dark' => {
      return value === 'light' || value === 'dark'
    }

    // If no preference or invalid value, default to dark and apply it
    if (!isValidTheme(preferredTheme)) {
      if (currentTheme !== 'dark') {
        setTheme('dark')
      }
      return
    }

    // If valid and different from current, update to user's preference
    if (preferredTheme !== currentTheme) {
      setTheme(preferredTheme)
    }
  }, [profile?.theme_preference, currentTheme, setTheme])

  return null
}
