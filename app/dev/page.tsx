import { requireAdmin } from "@/lib/auth/admin"
import Link from "next/link"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
// Experiments are managed in PostHog — see /dev/feature-flags

export const dynamic = "force-dynamic"

async function getDevStats() {
  const supabase = createServiceSupabaseClient()

  const [{ count: userCount }, { count: recipeCount }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("recipes").select("*", { count: "exact", head: true }),
  ])

  return {
    userCount: userCount || 0,
    recipeCount: recipeCount || 0,
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
        </div>

        {/* Dev Tools Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Feature Flags & Experiments — PostHog */}
          <Link
            href="/dev/feature-flags"
            className="block rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              🚩 Feature Flags &amp; Experiments
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Manage A/B tests and feature flags in PostHog
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

          <Link
            href="/dev/recipes"
            className="block rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              🍲 Recipe Moderation
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Review flags, edit recipes, and manage deletes/restores
            </p>
          </Link>

          <Link
            href="/dev/posts"
            className="block rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              📝 Post Moderation
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Review post flags, edit content, and manage deletes/restores
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

          {/* A/B Hook Test Lab */}
          <Link
            href="/dev/ab-testing-lab"
            className="block rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              🧪 A/B Hook Test Lab
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Validate useExperiment and useFeatureFlag in-browser
            </p>
          </Link>

          {/* Social Challenges */}
          <Link
            href="/dev/challenges"
            className="block rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              🏆 Social Challenges
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Create and manage social challenges
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
