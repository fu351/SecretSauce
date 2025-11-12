"use client"

import type React from "react"

import { useTheme as useNextTheme, ThemeProvider as NextThemesProvider } from "next-themes"

type Theme = "dark" | "light"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
    </NextThemesProvider>
  )
}

export function useTheme() {
  const { theme, resolvedTheme, setTheme: setNextTheme } = useNextTheme()

  const getDocumentTheme = () => {
    if (typeof document === "undefined") return undefined
    return document.documentElement.classList.contains("dark") ? "dark" : "light"
  }

  // Use the currently applied theme when available; fall back to provider default or DOM class.
  const effective = (resolvedTheme ?? theme ?? getDocumentTheme()) as string | undefined
  const normalizedTheme: Theme = effective === "dark" ? "dark" : "light"

  const setTheme = (newTheme: Theme) => setNextTheme(newTheme)

  // Avoid stale closures by reading the live DOM class when available.
  const toggleTheme = () => {
    if (typeof document !== "undefined") {
      const isDarkNow = document.documentElement.classList.contains("dark")
      setNextTheme(isDarkNow ? "light" : "dark")
    } else {
      setNextTheme((resolvedTheme ?? theme) === "dark" ? "light" : "dark")
    }
  }

  return { theme: normalizedTheme, setTheme, toggleTheme }
}
