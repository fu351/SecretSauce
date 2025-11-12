"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"

export function ThemeSynchronizer() {
  const { profile } = useAuth()
  const { setTheme } = useTheme()
  const pathname = usePathname()
  const appliedTheme = useRef<string | null>(null)

  useEffect(() => {
    const preferred = profile?.preferred_theme
    if (!preferred) return
    if (pathname?.startsWith("/onboarding")) return
    if (appliedTheme.current === preferred) return

    setTheme(preferred)
    appliedTheme.current = preferred
  }, [profile?.preferred_theme, pathname, setTheme])

  return null
}
