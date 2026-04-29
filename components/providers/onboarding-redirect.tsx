"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { isProfileOnboardingComplete } from "@/lib/auth/onboarding"

const ALLOWED_PATH_PREFIXES = [
  "/onboarding",
  "/auth",
  "/api",
]

export function OnboardingRedirect() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (loading || !user) return
    if (ALLOWED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return
    if (isProfileOnboardingComplete(profile)) return

    router.replace("/onboarding")
  }, [loading, pathname, profile, router, user])

  return null
}
