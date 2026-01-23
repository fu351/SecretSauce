"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, useRef } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/database/supabase"
import { performanceMonitor } from "@/lib/performance-monitor"
import { profileDB } from "@/lib/database/profile-db"

interface AuthContextType {
  user: User | null
  profile: any | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<any>
  signUp: (email: string, password: string) => Promise<any>
  signOut: () => Promise<void>
  updateProfile: (updates: any) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)
  const fetchingProfile = useRef(false)

  useEffect(() => {
    mounted.current = true
    setLoading(true)

    let currentUserId: string | null = null
    let authSubscription: { unsubscribe: () => void } | null = null

    const applySession = (sessionUser: User | null) => {
      if (!mounted.current) return

      const newUserId = sessionUser?.id ?? null
      if (newUserId === currentUserId) {
        if (mounted.current) setLoading(false)
        return
      }

      currentUserId = newUserId
      setUser(sessionUser)

      if (sessionUser) {
        console.log(`[v0] User state changed to: ${sessionUser.id}. Fetching profile.`)
        // Fire and forget; fetchProfile already guards against concurrent fetches.
        fetchProfile(sessionUser.id)
      } else {
        console.log("[v0] User state changed to null. Clearing profile.")
        setProfile(null)
        fetchingProfile.current = false
      }

      if (mounted.current) {
        setLoading(false)
      }
    }

    const bootstrapSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error

        if (!mounted.current) return

        applySession(data.session?.user ?? null)
      } catch (error) {
        console.error("[v0] Error retrieving initial session:", error)
        if (mounted.current) setLoading(false)
      } finally {
        if (!authSubscription) {
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`[v0] Auth state changed: ${event} at ${new Date().toISOString()}`, session?.user?.email)
            applySession(session?.user ?? null)
          })
          authSubscription = subscription
        }
      }
    }

    ;(async () => {
      await bootstrapSession()
    })()

    const memoryInterval = setInterval(() => {
      performanceMonitor.logMemoryUsage()
    }, 60000) // Every minute

    return () => {
      mounted.current = false
      authSubscription?.unsubscribe()
      clearInterval(memoryInterval)
    }
  }, []) // Empty dependency array is correct

  const fetchProfile = async (userId: string) => {
    if (fetchingProfile.current || !mounted.current) return

    fetchingProfile.current = true
    const startTime = performance.now()
    console.log(`[v0] Fetching profile for user: ${userId}`)

    try {
      const profile = await profileDB.fetchProfileById(userId)

      const duration = performance.now() - startTime
      console.log(`[v0] Profile fetch completed in ${duration.toFixed(2)}ms`)

      // Profile doesn't exist - create one (trigger may have failed)
      if (!profile) {
        console.log("[v0] Profile not found, creating one...")
        const { data: session } = await supabase.auth.getSession()
        const userEmail = session?.session?.user?.email

        if (userEmail) {
          const newProfile = await profileDB.createProfile({
            id: userId,
            email: userEmail
          })

          if (!newProfile) {
            console.error("[v0] Error creating profile")
            return
          }

          if (mounted.current) {
            console.log("[v0] Profile created successfully")
            setProfile(newProfile)
          }
        }
        return
      }

      if (mounted.current) {
        setProfile(profile)
      }
    } catch (error) {
      const duration = performance.now() - startTime
      console.error(`[v0] Error fetching profile after ${duration.toFixed(2)}ms:`, error)
    } finally {
      fetchingProfile.current = false
    }
  }

  const signIn = async (email: string, password: string) => {
    const startTime = performance.now()
    console.log(`[v0] Sign in attempt for: ${email}`)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      const duration = performance.now() - startTime
      console.log(`[v0] Sign in completed in ${duration.toFixed(2)}ms`)

      if (error) {
        console.error("[v0] Sign in error:", error)
        return { data: null, error }
      }

      console.log("[v0] Sign in successful:", data.user?.email)
      return { data, error: null }
    } catch (error) {
      const duration = performance.now() - startTime
      console.error(`[v0] Sign in exception after ${duration.toFixed(2)}ms:`, error)
      return { data: null, error }
    }
  }

  const signUp = async (email: string, password: string) => {
    const startTime = performance.now()
    console.log(`[v0] Sign up attempt for: ${email}`)

    try {
      const getSiteUrl = () => {
        if (typeof window !== "undefined") {
          return window.location.origin
        }
        const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL
        if (vercelUrl) {
          return `https://${vercelUrl}`
        }
        return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/welcome`,
        },
      })

      const duration = performance.now() - startTime
      console.log(`[v0] Sign up completed in ${duration.toFixed(2)}ms`)

      if (error) {
        console.error("[v0] Sign up error:", error)
        return { data: null, error }
      }

      console.log("[v0] Sign up successful:", data.user?.email)

      // Store email in localStorage for check-email page
      if (typeof window !== "undefined" && email) {
        localStorage.setItem("pending_verification_email", email)
      }

      return { data, error: null }
    } catch (error) {
      const duration = performance.now() - startTime
      console.error(`[v0] Sign up exception after ${duration.toFixed(2)}ms:`, error)
      return { data: null, error }
    }
  }

  const signOut = async () => {
    const startTime = performance.now()
    console.log("[v0] Signing out...")

    try {
      fetchingProfile.current = false

      const { error } = await supabase.auth.signOut()

      const duration = performance.now() - startTime
      console.log(`[v0] Sign out completed in ${duration.toFixed(2)}ms`)

      if (error) {
        console.error("[v0] Sign out error:", error)
        throw error
      }

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
    if (!user || !mounted.current) return

    const startTime = performance.now()
    console.log("[v0] Updating profile...")

    try {
      const updatedProfile = await profileDB.upsertProfile({
        id: user.id,
        email: user.email!,
        ...updates
      })

      const duration = performance.now() - startTime
      console.log(`[v0] Profile update completed in ${duration.toFixed(2)}ms`)

      if (!updatedProfile) {
        throw new Error("Failed to update profile")
      }

      if (mounted.current) {
        await fetchProfile(user.id)
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
    signIn,
    signUp,
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
