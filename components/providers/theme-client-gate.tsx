"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useTheme as useNextTheme } from "next-themes"

export function ThemeClientGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const { theme, resolvedTheme } = useNextTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || (!resolvedTheme && !theme)) {
    return <div className="min-h-screen bg-background" />
  }

  return <>{children}</>
}
