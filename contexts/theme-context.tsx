"use client"

import type React from "react"
import { useCallback } from "react"

import { useTheme as useNextTheme, ThemeProvider as NextThemesProvider } from "next-themes"

type Theme = "dark" | "light"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange={false}
      storageKey="secret-sauce-theme"
    >
      {children}
    </NextThemesProvider>
  )
}

export function useTheme() {
  const { theme, resolvedTheme, setTheme: setNextTheme } = useNextTheme()

  const getDocumentTheme = useCallback(() => {
    if (typeof document === "undefined") return undefined
    return document.documentElement.classList.contains("dark") ? "dark" : "light"
  }, [])

  // Use the currently applied theme when available; fall back to provider default or DOM class.
  const effective = (resolvedTheme ?? theme ?? getDocumentTheme()) as string | undefined
  const normalizedTheme: Theme = effective === "dark" ? "dark" : "light"

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setNextTheme(newTheme)
    },
    [setNextTheme],
  )

  // Avoid stale closures by deriving the next theme from normalizedTheme.
  const toggleTheme = useCallback(() => {
    setNextTheme(normalizedTheme === "dark" ? "light" : "dark")
  }, [normalizedTheme, setNextTheme])

  return { theme: normalizedTheme, setTheme, toggleTheme }
}
