"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, useRef } from "react"
import { useAuth as useClerkAuth, useClerk } from "@clerk/nextjs"
import { setBrowserAccessTokenProvider } from "@/lib/database/supabase"

type AuthUser = {
  id: string
  email: string
  created_at: string | null
}

interface AuthContextType {
  user: AuthUser | null
  profile: any | null
  loading: boolean
  signOut: () => Promise<void>
  updateProfile: (updates: any) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const TOKEN_REFRESH_BUFFER_SECONDS = 30
const ENSURE_PROFILE_TIMEOUT_MS = 4500
const ENSURE_PROFILE_BREAKER_MS = 15000
const ENSURE_PROFILE_BREAKER_FAILURES = 2

function readJwtExp(token: string): number | null {
  try {
    const payloadSegment = token.split(".")[1]
    if (!payloadSegment) return null
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/")
    const padding = normalized.length % 4
    const padded = padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), "=")
    const payloadJson = atob(padded)
    const payload = JSON.parse(payloadJson) as { exp?: unknown }
    return typeof payload.exp === "number" ? payload.exp : null
  } catch {
    return null
  }
}

function isJwtExpiredOrExpiring(token: string, bufferSeconds = TOKEN_REFRESH_BUFFER_SECONDS): boolean {
  const exp = readJwtExp(token)
  if (!exp) return false
  return exp * 1000 <= Date.now() + bufferSeconds * 1000
}

function clearLegacySupabaseCookies() {
  if (typeof document === "undefined") return
  const secureFlag = window.location.protocol === "https:" ? "; Secure" : ""
  const baseFlags = `; Path=/; SameSite=Lax${secureFlag}; Max-Age=0`
  document.cookie = `sb-access-token=${baseFlags}`
  document.cookie = `sb-refresh-token=${baseFlags}`
  document.cookie = `supabase-access-token=${baseFlags}`
  document.cookie = `supabase-auth-token=${baseFlags}`
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError"
  }

  if (!error || typeof error !== "object") return false

  const candidate = error as {
    name?: string
    message?: string
    code?: string | number
    cause?: { name?: string; message?: string; code?: string | number }
  }

  return (
    candidate.name === "AbortError" ||
    candidate.message === "aborted" ||
    candidate.code === "ECONNRESET" ||
    candidate.cause?.name === "AbortError" ||
    candidate.cause?.message === "aborted" ||
    candidate.cause?.code === "ECONNRESET"
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const { isLoaded: clerkLoaded, userId: clerkUserId, getToken } = useClerkAuth()
  const clerk = useClerk()
  const mounted = useRef(true)
  const fetchingProfile = useRef(false)
  const hasTriggeredForceReload = useRef(false)
  const ensureProfileInFlightRef = useRef<{ userId: string; promise: Promise<void> } | null>(null)
  const ensureProfileFailureCountRef = useRef(0)
  const ensureProfileBreakerUntilRef = useRef(0)

  const clearAuthState = () => {
    if (!mounted.current) return
    setUser(null)
    setProfile(null)
    fetchingProfile.current = false
  }

  const buildAuthUser = (id: string, email: string, createdAt: string | null): AuthUser => ({
    id,
    email,
    created_at: createdAt,
  })

  useEffect(() => {
    setBrowserAccessTokenProvider(async () => {
      if (!clerkLoaded) return null
      let token = await getToken()

      if (token && isJwtExpiredOrExpiring(token)) {
        token = await getToken({ skipCache: true })
      }

      if (!token || isJwtExpiredOrExpiring(token, 0)) {
        return null
      }

      return token
    })

    return () => {
      setBrowserAccessTokenProvider(null)
    }
  }, [clerkLoaded, getToken])

  useEffect(() => {
    mounted.current = true
    setLoading(true)

    let cancelled = false
    let forceReloadTimeoutId: ReturnType<typeof setTimeout> | undefined
    let ensureProfileController: AbortController | undefined
    let fetchTimeoutId: ReturnType<typeof setTimeout> | undefined

    const triggerForceReloadOnce = () => {
      if (cancelled || !mounted.current) return
      if (hasTriggeredForceReload.current) return
      hasTriggeredForceReload.current = true

      // Prevent infinite reload loops if the underlying issue persists.
      const COOLDOWN_MS = 60_000
      const cooldownKey = "secretSauce__forceReloadAuthCooldown"
      try {
        const now = Date.now()
        const last = Number(sessionStorage.getItem(cooldownKey) ?? "0")
        if (!Number.isNaN(last) && now - last < COOLDOWN_MS) return
        sessionStorage.setItem(cooldownKey, String(now))
      } catch {
        // If sessionStorage isn't available, still attempt reload once.
      }

      window.location.reload()
    }

    const bootstrap = async () => {
      try {
        if (!clerkLoaded) {
          // Clerk still booting: don't leave the app in an indefinite loading state.
          if (!cancelled && mounted.current) {
            setLoading(false)
          }
          return
        }

        // Safety net: the landing page shows a centered logo while `loading` is true.
        // If auth bootstrap hangs (e.g. ensure-profile fetch), the user sees that logo forever.
        forceReloadTimeoutId = window.setTimeout(triggerForceReloadOnce, 5000)

        if (!clerkUserId) {
          clearAuthState()
          return
        }

        // Avoid duplicate ensure-profile requests (common in React StrictMode during dev).
        const userId = clerkUserId
        if (ensureProfileInFlightRef.current?.userId === userId) {
          await ensureProfileInFlightRef.current.promise
          return
        }

        // Circuit-breaker: if ensure-profile repeatedly fails, fail-open for a short window.
        if (Date.now() < ensureProfileBreakerUntilRef.current) {
          console.warn("[auth] ensure-profile breaker active; skipping bootstrap call")
          return
        }

        const controller = new AbortController()
        ensureProfileController = controller
        fetchTimeoutId = window.setTimeout(() => {
          controller.abort(new Error("ensure-profile timeout"))
        }, ENSURE_PROFILE_TIMEOUT_MS)

        const promise = (async () => {
          const response = await fetch("/api/auth/ensure-profile", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            signal: controller.signal,
          })
          if (cancelled || !mounted.current) return

          if (!response.ok) {
            console.warn("[v0] Failed to ensure Clerk profile:", response.status)
            // For transient backend failures, fail-open to avoid blocking the app forever.
            if (response.status >= 500 || response.status === 429) {
              ensureProfileFailureCountRef.current += 1
              if (ensureProfileFailureCountRef.current >= ENSURE_PROFILE_BREAKER_FAILURES) {
                ensureProfileBreakerUntilRef.current = Date.now() + ENSURE_PROFILE_BREAKER_MS
                ensureProfileFailureCountRef.current = 0
              }
              return
            }
            clearAuthState()
            return
          }

          const payload = await response.json()
          const linkedProfile = payload?.profile
          if (!linkedProfile?.id || !linkedProfile?.email) {
            clearAuthState()
            return
          }

          setUser(
            buildAuthUser(linkedProfile.id, linkedProfile.email, linkedProfile.created_at ?? null),
          )
          setProfile(linkedProfile)
          ensureProfileFailureCountRef.current = 0
          ensureProfileBreakerUntilRef.current = 0
        })()

        ensureProfileInFlightRef.current = { userId, promise }
        try {
          await promise
        } finally {
          if (fetchTimeoutId) {
            clearTimeout(fetchTimeoutId)
            fetchTimeoutId = undefined
          }
          if (ensureProfileInFlightRef.current?.userId === userId) {
            ensureProfileInFlightRef.current = null
          }
          if (ensureProfileController === controller) {
            ensureProfileController = undefined
          }
        }
      } catch (error) {
        if (isAbortLikeError(error)) {
          ensureProfileFailureCountRef.current += 1
          if (ensureProfileFailureCountRef.current >= ENSURE_PROFILE_BREAKER_FAILURES) {
            ensureProfileBreakerUntilRef.current = Date.now() + ENSURE_PROFILE_BREAKER_MS
            ensureProfileFailureCountRef.current = 0
          }
          return
        }

        console.error("[v0] Error retrieving Clerk-backed session:", error)
        if (!cancelled && mounted.current) {
          clearAuthState()
        }
      } finally {
        if (forceReloadTimeoutId) {
          clearTimeout(forceReloadTimeoutId)
        }
        if (!cancelled && mounted.current && clerkLoaded) {
          setLoading(false)
        }
      }
    }

    ;(async () => {
      await bootstrap()
    })()

    return () => {
      cancelled = true
      if (fetchTimeoutId) {
        clearTimeout(fetchTimeoutId)
      }
      ensureProfileController?.abort()
      mounted.current = false
    }
  }, [clerkLoaded, clerkUserId])

  const signOut = async () => {
    const startTime = performance.now()
    console.log("[v0] Signing out...")

    try {
      fetchingProfile.current = false
      if (clerkLoaded && clerkUserId) {
        await clerk.signOut()
      }

      const duration = performance.now() - startTime
      console.log(`[v0] Sign out completed in ${duration.toFixed(2)}ms`)

      clearLegacySupabaseCookies()
      console.log("[v0] Sign out successful")

      if (mounted.current) {
        setUser(null)
        setProfile(null)
      }

      if (typeof window !== "undefined") {
        localStorage.removeItem("supabase.auth.token")
        sessionStorage.clear()
      }
    } catch (error) {
      const duration = performance.now() - startTime
      console.error(`[v0] Sign out exception after ${duration.toFixed(2)}ms:`, error)
      throw error
    }
  }

  const updateProfile = async (updates: any) => {
    if (!user?.id || !user.email || !mounted.current) return

    const response = await fetch("/api/auth/update-profile", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.detail ?? payload?.error ?? "Failed to update profile")
    }

    const payload = await response.json()
    if (mounted.current && payload?.profile) {
      setProfile(payload.profile)
    }
  }

  const value = {
    user,
    profile,
    loading,
    signOut,
    updateProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
