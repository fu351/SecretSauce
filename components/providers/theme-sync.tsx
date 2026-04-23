"use client"

import { useLayoutEffect, useRef } from "react"
import { useTheme as useNextTheme } from "next-themes"
import { useAuth } from "@/contexts/auth-context"

/**
 * Syncs the user's saved theme preference from their profile
 * to next-themes after auth/profile hydration.
 */
export function ThemeSync() {
  const { profile, loading } = useAuth()
  const { setTheme } = useNextTheme()
  const lastSyncedPreference = useRef<"light" | "dark" | null>(null)

  useLayoutEffect(() => {
    if (loading) return

    const preferredTheme = profile?.theme_preference

    const isValidTheme = (value: unknown): value is "light" | "dark" => {
      return value === "light" || value === "dark"
    }

    if (!isValidTheme(preferredTheme)) return

    if (typeof document === "undefined") return

    const activeTheme: "light" | "dark" = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light"

    if (activeTheme === preferredTheme) {
      lastSyncedPreference.current = preferredTheme
      return
    }

    if (lastSyncedPreference.current !== preferredTheme) {
      lastSyncedPreference.current = preferredTheme
      setTheme(preferredTheme)
    }
  }, [loading, profile?.theme_preference, setTheme])

  return null
}
