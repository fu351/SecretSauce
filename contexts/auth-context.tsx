"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, useRef } from "react"
import type { Session, User as SupabaseUser } from "@supabase/supabase-js"
import { useAuth as useClerkAuth, useClerk } from "@clerk/nextjs"
import { setBrowserAccessTokenProvider, supabase } from "@/lib/database/supabase"
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

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function syncSessionCookies(session: Session | null) {
  if (typeof document === "undefined") return

  const secureFlag = window.location.protocol === "https:" ? "; Secure" : ""
  const baseFlags = `; Path=/; SameSite=Lax${secureFlag}`

  if (session?.access_token) {
    document.cookie = `sb-access-token=${encodeURIComponent(session.access_token)}${baseFlags}; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`
  } else {
    document.cookie = `sb-access-token=${baseFlags}; Max-Age=0`
  }

  if (session?.refresh_token) {
    document.cookie = `sb-refresh-token=${encodeURIComponent(session.refresh_token)}${baseFlags}; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`
  } else {
    document.cookie = `sb-refresh-token=${baseFlags}; Max-Age=0`
  }
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
      const token = await getToken({ template: "supabase" })
      return token ?? null
    })

    return () => {
      setBrowserAccessTokenProvider(null)
    }
  }, [clerkLoaded, getToken])

  const fetchProfileBySupabaseUser = async (sessionUser: SupabaseUser): Promise<any | null> => {
    if (fetchingProfile.current || !mounted.current) return null

    fetchingProfile.current = true
    const startTime = performance.now()
    console.log(`[v0] Fetching profile for user: ${sessionUser.id}`)

    try {
      const profile = await profileDB.fetchProfileById(sessionUser.id)

      const duration = performance.now() - startTime
      console.log(`[v0] Profile fetch completed in ${duration.toFixed(2)}ms`)

      // Profile doesn't exist - create one (trigger may have failed)
      if (!profile) {
        console.log("[v0] Profile not found, creating one...")
        const userEmail = sessionUser.email

        if (userEmail) {
          const newProfile = await profileDB.createProfile({
            id: sessionUser.id,
            email: userEmail,
          })

          if (!newProfile) {
            console.error("[v0] Error creating profile")
            return null
          }

          console.log("[v0] Profile created successfully")
          return newProfile
        }

        return null
      }

      return profile
    } catch (error) {
      const duration = performance.now() - startTime
      console.error(`[v0] Error fetching profile after ${duration.toFixed(2)}ms:`, error)
      return null
    } finally {
      fetchingProfile.current = false
    }
  }

  useEffect(() => {
    mounted.current = true
    setLoading(true)

    let authSubscription: { unsubscribe: () => void } | null = null
    let cancelled = false

    const applySupabaseUser = async (sessionUser: SupabaseUser | null) => {
      if (cancelled || !mounted.current) return

      if (!sessionUser?.id || !sessionUser.email) {
        clearAuthState()
        setLoading(false)
        return
      }

      const nextProfile = await fetchProfileBySupabaseUser(sessionUser)
      if (cancelled || !mounted.current) return

      setUser(buildAuthUser(sessionUser.id, sessionUser.email, sessionUser.created_at ?? null))
      setProfile(nextProfile)
      setLoading(false)
    }

    const bootstrap = async () => {
      try {
        if (clerkLoaded && clerkUserId) {
          const resolveProfileFromClerk = async (): Promise<any | null> => {
            const response = await fetch("/api/auth/ensure-profile", {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
              },
            })

            if (!response.ok) {
              console.warn("[v0] Failed to ensure Clerk profile:", response.status)
              return null
            }

            const payload = await response.json()
            if (!payload?.profile?.id || !payload?.profile?.email) {
              return null
            }

            return payload.profile
          }

          const linkedProfile = await resolveProfileFromClerk()
          if (cancelled || !mounted.current) return

          if (linkedProfile?.id && linkedProfile?.email) {
            setUser(
              buildAuthUser(
                linkedProfile.id,
                linkedProfile.email,
                linkedProfile.created_at ?? null
              )
            )
            setProfile(linkedProfile)
            setLoading(false)
            return
          }

          console.warn("[v0] Clerk session found but no linked profile. Falling back to logged-out state.")
          clearAuthState()
          setLoading(false)
          return
        }

        const { data, error } = await supabase.auth.getSession()
        if (error) throw error

        if (cancelled || !mounted.current) return
        syncSessionCookies(data.session ?? null)
        await applySupabaseUser(data.session?.user ?? null)
      } catch (error) {
        console.error("[v0] Error retrieving initial session:", error)
        if (!cancelled && mounted.current) {
          clearAuthState()
          setLoading(false)
        }
      } finally {
        if (!authSubscription && !(clerkLoaded && clerkUserId)) {
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(
              `[v0] Auth state changed: ${event} at ${new Date().toISOString()}`,
              session?.user?.email
            )
            syncSessionCookies(session)
            await applySupabaseUser(session?.user ?? null)
          })
          authSubscription = subscription
        }
      }
    }

    ;(async () => {
      await bootstrap()
    })()

    return () => {
      cancelled = true
      mounted.current = false
      authSubscription?.unsubscribe()
    }
  }, [clerkLoaded, clerkUserId])

  const signOut = async () => {
    const startTime = performance.now()
    console.log("[v0] Signing out...")

    try {
      fetchingProfile.current = false
      const shouldSignOutClerk = clerkLoaded && Boolean(clerkUserId)

      if (shouldSignOutClerk) {
        await clerk.signOut()
      }

      const { error } = await supabase.auth.signOut()

      const duration = performance.now() - startTime
      console.log(`[v0] Sign out completed in ${duration.toFixed(2)}ms`)

      if (error && !shouldSignOutClerk) {
        console.error("[v0] Sign out error:", error)
        throw error
      }

      syncSessionCookies(null)
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
