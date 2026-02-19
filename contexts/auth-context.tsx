"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, useRef } from "react"
import { useAuth as useClerkAuth, useClerk } from "@clerk/nextjs"
import { setBrowserAccessTokenProvider } from "@/lib/database/supabase"
import { profileDB } from "@/lib/database/profile-db"

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const { isLoaded: clerkLoaded, userId: clerkUserId, getToken } = useClerkAuth()
  const clerk = useClerk()
  const mounted = useRef(true)
  const fetchingProfile = useRef(false)

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

    const bootstrap = async () => {
      try {
        if (!clerkLoaded) {
          return
        }

        if (!clerkUserId) {
          clearAuthState()
          return
        }

        const response = await fetch("/api/auth/ensure-profile", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        })
        if (cancelled || !mounted.current) return

        if (!response.ok) {
          console.warn("[v0] Failed to ensure Clerk profile:", response.status)
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
          buildAuthUser(
            linkedProfile.id,
            linkedProfile.email,
            linkedProfile.created_at ?? null
          )
        )
        setProfile(linkedProfile)
      } catch (error) {
        console.error("[v0] Error retrieving Clerk-backed session:", error)
        if (!cancelled && mounted.current) {
          clearAuthState()
        }
      } finally {
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

    const startTime = performance.now()
    console.log("[v0] Updating profile...")

    try {
      const updatedProfile = await profileDB.upsertProfile({
        id: user.id,
        email: user.email,
        ...updates,
      })

      const duration = performance.now() - startTime
      console.log(`[v0] Profile update completed in ${duration.toFixed(2)}ms`)

      if (!updatedProfile) {
        throw new Error("Failed to update profile")
      }

      if (mounted.current) {
        setProfile(updatedProfile)
      }
    } catch (error) {
      const duration = performance.now() - startTime
      console.error(`[v0] Profile update exception after ${duration.toFixed(2)}ms:`, error)
      throw error
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
