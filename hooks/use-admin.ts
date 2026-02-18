/**
 * Client-side hook to check if user has admin access
 */

import { useAuth } from "@/contexts/auth-context"
import { useEffect, useState } from "react"

type AdminStatusResponse = {
  isAdmin: boolean
  canViewAnalytics: boolean
}

async function fetchAdminStatus(signal?: AbortSignal): Promise<AdminStatusResponse> {
  const response = await fetch("/api/auth/admin-status", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch admin status (${response.status})`)
  }

  const payload = (await response.json()) as Partial<AdminStatusResponse>

  return {
    isAdmin: payload.isAdmin === true,
    canViewAnalytics: payload.canViewAnalytics === true,
  }
}

function useAdminStatus() {
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [canViewAnalytics, setCanViewAnalytics] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)

    async function checkStatus() {
      if (!user) {
        setIsAdmin(false)
        setCanViewAnalytics(false)
        setLoading(false)
        return
      }

      try {
        const status = await fetchAdminStatus(controller.signal)
        setIsAdmin(status.isAdmin)
        setCanViewAnalytics(status.canViewAnalytics)
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          console.error("[useAdminStatus] Exception checking admin status:", error)
        }
        setIsAdmin(false)
        setCanViewAnalytics(false)
      } finally {
        setLoading(false)
      }
    }

    checkStatus()

    return () => {
      controller.abort()
    }
  }, [user])

  return { isAdmin, canViewAnalytics, loading }
}

export function useIsAdmin() {
  const { isAdmin, loading } = useAdminStatus()
  return { isAdmin, loading }
}

export function useCanViewAnalytics() {
  const { canViewAnalytics: canView, loading } = useAdminStatus()
  return { canView, loading }
}
