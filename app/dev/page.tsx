import { requireAdmin } from "@/lib/auth/admin"
import Link from "next/link"
import { createServerClient } from "@/lib/database/supabase"

export const dynamic = "force-dynamic"

async function getDevStats() {
  const supabase = createServerClient()

  // Get database stats
  const [
    { count: userCount },
    { count: recipeCount },
    { count: experimentCount },
    { count: activeExperimentCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("recipes").select("*", { count: "exact", head: true }),
    supabase
      .from("ab_testing.experiments")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("ab_testing.experiments")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
  ])

  return {
    userCount: userCount || 0,
    recipeCount: recipeCount || 0,
    experimentCount: experimentCount || 0,
    activeExperimentCount: activeExperimentCount || 0,
  }
}

export default async function DevPage() {
  // Require admin access
  await requireAdmin()

  const stats = await getDevStats()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Admin Dev Tools 🛠️
          </h1>
          <p className="mt-2 text-gray-600">
            Developer and admin utilities for managing the platform
          </p>
        </div>

        {/* Quick Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-500">Total Users</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">
              {stats.userCount.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-500">
              Total Recipes
            </div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">
              {stats.recipeCount.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-500">
              Total Experiments
            </div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">
              {stats.experimentCount}
            </div>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-500">
              Active Experiments
            </div>
            <div className="mt-2 text-3xl font-semibold text-green-600">
              {stats.activeExperimentCount}
            </div>
          </div>
        </div>

        {/* Dev Tools Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* A/B Testing Dashboard */}
          <Link
            href="/dev/experiments"
            className="block rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              🧪 Experiments
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Manage A/B tests and view analytics
            </p>
          </Link>

          {/* User Management */}
          <Link
            href="/dev/users"
            className="block rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              👥 User Management
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Manage users, roles, and subscriptions
            </p>
          </Link>

          {/* Database Inspector */}
          <Link
            href="/dev/database"
            className="block rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              🗄️ Database Inspector
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Browse tables and run queries
            </p>
          </Link>

          {/* Feature Flags */}
          <Link
            href="/dev/feature-flags"
            className="block rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              🚩 Feature Flags
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Manage feature access by user tier
            </p>
          </Link>

          {/* API Tester */}
          <Link
            href="/dev/api-tester"
            className="block rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900">⚡ API Tester</h3>
            <p className="mt-2 text-sm text-gray-600">
              Test API endpoints and functions
            </p>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
              Clear Cache
            </button>
            <button className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700">
              Sync Data
            </button>
            <button className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700">
              Run Migrations
            </button>
            <button className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700">
              Export Logs
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
