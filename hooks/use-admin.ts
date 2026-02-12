/**
 * Client-side hook to check if user has admin access
 */

import { useAuth } from "@/contexts/auth-context"
import { adminRolesDB } from "@/lib/database/admin-roles-db"
import { useEffect, useState } from "react"

export function useIsAdmin() {
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function checkAdmin() {
      if (!user) {
        if (!cancelled) {
          setIsAdmin(false)
          setLoading(false)
        }
        return
      }

      try {
        const hasAdminAccess = await adminRolesDB.isAdmin(user.id)
        if (!cancelled) {
          setIsAdmin(hasAdminAccess)
        }
      } catch (error) {
        console.error("[useIsAdmin] Exception checking admin status:", error)
        if (!cancelled) {
          setIsAdmin(false)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    checkAdmin()

    return () => {
      cancelled = true
    }
  }, [user])

  return { isAdmin, loading }
}

export function useCanViewAnalytics() {
  const { user } = useAuth()
  const [canView, setCanView] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function checkAccess() {
      if (!user) {
        if (!cancelled) {
          setCanView(false)
          setLoading(false)
        }
        return
      }

      try {
        const hasAnalyticsAccess = await adminRolesDB.canViewAnalytics(user.id)
        if (!cancelled) {
          setCanView(hasAnalyticsAccess)
        }
      } catch (error) {
        console.error("[useCanViewAnalytics] Exception checking analytics access:", error)
        if (!cancelled) {
          setCanView(false)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    checkAccess()

    return () => {
      cancelled = true
    }
  }, [user])

  return { canView, loading }
}
