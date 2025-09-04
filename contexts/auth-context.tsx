"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

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

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error("Error getting initial session:", error)
          setLoading(false)
          return
        }

        if (session?.user) {
          setUser(session.user)
          await fetchProfile(session.user.id)
        } else {
          setUser(null)
          setProfile(null)
        }
      } catch (error) {
        console.error("Error in getInitialSession:", error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user?.email)
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id)
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        // Clear any stored data
        if (typeof window !== 'undefined') {
          localStorage.removeItem('supabase.auth.token')
        }
      }
      
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching profile:", error)
        return
      }

      setProfile(data)
    } catch (error) {
      console.error("Error fetching profile:", error)
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) {
        console.error("Sign in error:", error)
        return { data: null, error }
      }
      
      console.log("Sign in successful:", data.user?.email)
      return { data, error: null }
    } catch (error) {
      console.error("Sign in exception:", error)
      return { data: null, error }
    }
  }

  const signUp = async (email: string, password: string) => {
    try {
      const getSiteUrl = () => {
        if (typeof window !== 'undefined') {
          return window.location.origin
        }
        const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL
        if (vercelUrl) {
          return `https://${vercelUrl}`
        }
        return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${getSiteUrl()}/`,
        },
      })
      
      if (error) {
        console.error("Sign up error:", error)
        return { data: null, error }
      }
      
      console.log("Sign up successful:", data.user?.email)
      return { data, error: null }
    } catch (error) {
      console.error("Sign up exception:", error)
      return { data: null, error }
    }
  }

  const signOut = async () => {
    try {
      console.log("Signing out...")
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        console.error("Sign out error:", error)
        throw error
      }
      
      console.log("Sign out successful")
      // Clear local state immediately
      setUser(null)
      setProfile(null)
      
      // Clear any stored data
      if (typeof window !== 'undefined') {
        localStorage.removeItem('supabase.auth.token')
        sessionStorage.clear()
      }
    } catch (error) {
      console.error("Sign out exception:", error)
      throw error
    }
  }

  const updateProfile = async (updates: any) => {
    if (!user) return

    try {
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email!,
        ...updates,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        console.error("Profile update error:", error)
        throw error
      }

      await fetchProfile(user.id)
    } catch (error) {
      console.error("Profile update exception:", error)
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
