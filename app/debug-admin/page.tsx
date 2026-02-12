"use client"

import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/database/supabase"
import { useEffect, useState } from "react"

export default function DebugAdminPage() {
  const { user } = useAuth()
  const [adminCheck, setAdminCheck] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAdminStatus() {
      if (!user) {
        setAdminCheck({ error: "No user logged in" })
        setLoading(false)
        return
      }

      console.log("=== ADMIN DEBUG CHECK ===")
      console.log("User ID:", user.id)
      console.log("User Email:", user.email)

      try {
        // Use RPC function to properly access ab_testing schema
        const { data: rpcData, error: rpcError } = await supabase.rpc("is_admin", {
          p_user_id: user.id,
        })

        console.log("RPC Result:", { rpcData, rpcError })

        setAdminCheck({
          userId: user.id,
          userEmail: user.email,
          queryData: rpcData,
          queryError: rpcError,
          isAdmin: rpcData === true,
          rawRole: rpcData === true ? "admin" : "not admin",
        })
      } catch (err) {
        console.error("Exception:", err)
        setAdminCheck({ exception: err })
      } finally {
        setLoading(false)
      }
    }

    checkAdminStatus()
  }, [user])

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Admin Status Debug</h1>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-lg mb-2">User Info</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto">
              {JSON.stringify(
                {
                  userId: adminCheck?.userId,
                  userEmail: adminCheck?.userEmail,
                },
                null,
                2
              )}
            </pre>
          </div>

          <div>
            <h2 className="font-semibold text-lg mb-2">Query Result</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto">
              {JSON.stringify(
                {
                  data: adminCheck?.queryData,
                  error: adminCheck?.queryError,
                },
                null,
                2
              )}
            </pre>
          </div>

          <div>
            <h2 className="font-semibold text-lg mb-2">Admin Check Result</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto">
              {JSON.stringify(
                {
                  isAdmin: adminCheck?.isAdmin,
                  rawRole: adminCheck?.rawRole,
                },
                null,
                2
              )}
            </pre>
          </div>

          {adminCheck?.exception && (
            <div>
              <h2 className="font-semibold text-lg mb-2 text-red-600">Exception</h2>
              <pre className="bg-red-50 p-4 rounded overflow-auto">
                {JSON.stringify(adminCheck.exception, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Expected Database Entry</h3>
          <p className="text-sm text-gray-700">
            Your user ID should match: <code className="bg-white px-2 py-1 rounded">99bfd6f8-199b-4927-a7c3-c3d5a2b9ba36</code>
          </p>
          <p className="text-sm text-gray-700 mt-2">
            If they don't match, you need to update the admin_roles table with the correct user_id.
          </p>
        </div>
      </div>
    </div>
  )
}
