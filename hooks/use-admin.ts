/**
 * Client-side hook to check if user has admin access
 */

import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/database/supabase"
import { useEffect, useState } from "react"

export function useIsAdmin() {
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAdmin() {
      console.log("[useIsAdmin] Starting admin check", {
        hasUser: !!user,
        userId: user?.id,
        userEmail: user?.email,
      })

      if (!user) {
        console.log("[useIsAdmin] No user found, setting isAdmin to false")
        setIsAdmin(false)
        setLoading(false)
        return
      }

      try {
        console.log("[useIsAdmin] Calling RPC function ab_testing.is_admin for user:", user.id)

        // Use RPC function to check admin role (handles schema properly)
        const { data, error } = await supabase.rpc("is_admin", {
          p_user_id: user.id,
        })

        console.log("[useIsAdmin] RPC result:", {
          data,
          error,
          isAdmin: data === true,
        })

        if (error) {
          console.error("[useIsAdmin] Error checking admin status:", error)
          setIsAdmin(false)
        } else {
          const isAdminUser = data === true
          console.log("[useIsAdmin] Setting isAdmin to:", isAdminUser)
          setIsAdmin(isAdminUser)
        }
      } catch (error) {
        console.error("[useIsAdmin] Exception checking admin status:", error)
        setIsAdmin(false)
      } finally {
        console.log("[useIsAdmin] Completed check, loading set to false")
        setLoading(false)
      }
    }

    checkAdmin()
  }, [user])

  console.log("[useIsAdmin] Current state:", { isAdmin, loading, hasUser: !!user })

  return { isAdmin, loading }
}

export function useCanViewAnalytics() {
  const { user } = useAuth()
  const [canView, setCanView] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAccess() {
      console.log("[useCanViewAnalytics] Starting analytics access check", {
        hasUser: !!user,
        userId: user?.id,
      })

      if (!user) {
        console.log("[useCanViewAnalytics] No user found, setting canView to false")
        setCanView(false)
        setLoading(false)
        return
      }

      try {
        console.log("[useCanViewAnalytics] Calling RPC function can_view_analytics for user:", user.id)

        // Use RPC function to check analytics access (handles schema properly)
        const { data, error } = await supabase.rpc("can_view_analytics", {
          p_user_id: user.id,
        })

        console.log("[useCanViewAnalytics] RPC result:", {
          data,
          error,
          canView: data === true,
        })

        if (error) {
          console.error("[useCanViewAnalytics] Error checking analytics access:", error)
          setCanView(false)
        } else {
          const hasAccess = data === true
          console.log("[useCanViewAnalytics] Setting canView to:", hasAccess)
          setCanView(hasAccess)
        }
      } catch (error) {
        console.error("[useCanViewAnalytics] Exception checking analytics access:", error)
        setCanView(false)
      } finally {
        console.log("[useCanViewAnalytics] Completed check, loading set to false")
        setLoading(false)
      }
    }

    checkAccess()
  }, [user])

  console.log("[useCanViewAnalytics] Current state:", { canView, loading, hasUser: !!user })

  return { canView, loading }
}
