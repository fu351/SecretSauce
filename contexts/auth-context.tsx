"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, useRef } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { performanceMonitor } from "@/lib/performance-monitor"

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)
  const fetchingProfile = useRef(false)

  useEffect(() => {
    mounted.current = true
    setLoading(true) // Set loading to true at the start

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted.current) return

      console.log(`[v0] Auth state changed: ${event} at ${new Date().toISOString()}`, session?.user?.email)
      
      if (session?.user) {
        // This handles:
        // 1. Initial page load (if session exists)
        // 2. User signing in
        // 3. Token refresh
        setUser(session.user)
        console.log("#################### Test  #########################################")
        
        await fetchProfile(session.user.id) // fetchProfile has its own 'fetchingProfile' guard
      } else {
        // This handles:
        // 1. Initial page load (if no session)
        // 2. User signing out
        setUser(null)
        setProfile(null)
        fetchingProfile.current = false
      }

      if (mounted.current) {
        setLoading(false)
      }
    })

    const memoryInterval = setInterval(() => {
      performanceMonitor.logMemoryUsage()
    }, 60000) // Every minute

    return () => {
      mounted.current = false
      subscription.unsubscribe()
      clearInterval(memoryInterval)
    }
  }, [])

  const fetchProfile = async (userId: string) => {
    if (fetchingProfile.current || !mounted.current) return

    fetchingProfile.current = true
    const startTime = performance.now()
    console.log(`[v0] Fetching profile for user: ${userId}`)

    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      const duration = performance.now() - startTime
      console.log(`[v0] Profile fetch completed in ${duration.toFixed(2)}ms`)

      if (error && error.code !== "PGRST116") {
        console.error("[v0] Error fetching profile:", error)
        return
      }

      if (mounted.current && data) {
        setProfile(data)
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
          emailRedirectTo: `${getSiteUrl()}/`,
        },
      })

      const duration = performance.now() - startTime
      console.log(`[v0] Sign up completed in ${duration.toFixed(2)}ms`)

      if (error) {
        console.error("[v0] Sign up error:", error)
        return { data: null, error }
      }

      console.log("[v0] Sign up successful:", data.user?.email)
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
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email!,
        ...updates,
        updated_at: new Date().toISOString(),
      })

      const duration = performance.now() - startTime
      console.log(`[v0] Profile update completed in ${duration.toFixed(2)}ms`)

      if (error) {
        console.error("[v0] Profile update error:", error)
        throw error
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
