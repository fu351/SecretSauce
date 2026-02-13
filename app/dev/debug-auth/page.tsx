import { createServerClient } from "@/lib/database/supabase-server"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

export default async function DebugAuthPage() {
  const supabase = createServerClient()

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  // Try to get admin role
  let adminRole = null
  let adminError = null

  if (user) {
    const { data, error } = await supabase
      .from("ab_testing.admin_roles")
      .select("*")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle()

    adminRole = data
    adminError = error
  }

  // Try RPC function
  let rpcResult = null
  let rpcError = null

  if (user) {
    const { data, error } = await supabase.rpc("ab_testing.is_admin", {
      p_user_id: user.id,
    })
    rpcResult = data
    rpcError = error
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-3xl font-bold">Auth Debug Page</h1>

        {/* User Info */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">User Authentication</h2>
          {userError ? (
            <div className="rounded bg-red-50 p-4 text-red-800">
              <strong>Error:</strong> {userError.message}
            </div>
          ) : user ? (
            <div className="space-y-2">
              <div>
                <strong>User ID:</strong>{" "}
                <code className="rounded bg-gray-100 px-2 py-1 text-sm">
                  {user.id}
                </code>
              </div>
              <div>
                <strong>Email:</strong> {user.email}
              </div>
              <div>
                <strong>Status:</strong>{" "}
                <span className="text-green-600">✓ Authenticated</span>
              </div>
            </div>
          ) : (
            <div className="text-red-600">❌ Not authenticated</div>
          )}
        </div>

        {/* Admin Role Check */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">Admin Role (Direct Query)</h2>
          {!user ? (
            <div className="text-gray-500">User must be logged in</div>
          ) : adminError ? (
            <div className="rounded bg-red-50 p-4 text-red-800">
              <strong>Error:</strong> {adminError.message}
              <pre className="mt-2 text-xs">{JSON.stringify(adminError, null, 2)}</pre>
            </div>
          ) : adminRole ? (
            <div className="space-y-2">
              <div>
                <strong>Role:</strong>{" "}
                <span className="rounded bg-green-100 px-2 py-1 text-green-800">
                  {adminRole.role}
                </span>
              </div>
              <div>
                <strong>Granted At:</strong> {adminRole.granted_at}
              </div>
              <div>
                <strong>Status:</strong>{" "}
                <span className="text-green-600">✓ Admin Access</span>
              </div>
            </div>
          ) : (
            <div className="text-yellow-600">
              ⚠️ No admin role found for this user
            </div>
          )}
        </div>

        {/* RPC Function Check */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">
            RPC Function (ab_testing.is_admin)
          </h2>
          {!user ? (
            <div className="text-gray-500">User must be logged in</div>
          ) : rpcError ? (
            <div className="rounded bg-red-50 p-4 text-red-800">
              <strong>Error:</strong> {rpcError.message}
              <pre className="mt-2 text-xs">{JSON.stringify(rpcError, null, 2)}</pre>
            </div>
          ) : (
            <div>
              <strong>Result:</strong>{" "}
              {rpcResult === true ? (
                <span className="text-green-600">✓ Is Admin</span>
              ) : (
                <span className="text-red-600">❌ Not Admin</span>
              )}
            </div>
          )}
        </div>

        {/* Fix Instructions */}
        {user && !adminRole && (
          <div className="rounded-lg bg-yellow-50 p-6">
            <h2 className="mb-4 text-xl font-semibold text-yellow-900">
              🔧 How to Fix
            </h2>
            <p className="mb-4 text-yellow-800">
              Run this SQL in your Supabase SQL Editor:
            </p>
            <pre className="rounded bg-yellow-100 p-4 text-sm">
              {`INSERT INTO ab_testing.admin_roles (user_id, role, granted_by)
VALUES ('${user.id}', 'admin', '${user.id}')
ON CONFLICT (user_id, role) DO NOTHING;`}
            </pre>
            <p className="mt-4 text-sm text-yellow-700">
              After running this, refresh this page to verify.
            </p>
          </div>
        )}

        {user && adminRole && (
          <div className="rounded-lg bg-green-50 p-6">
            <h2 className="mb-4 text-xl font-semibold text-green-900">
              ✅ All Good!
            </h2>
            <p className="text-green-800">
              You should now be able to access{" "}
              <a href="/dev" className="font-semibold underline">
                /dev
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
