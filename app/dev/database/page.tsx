import { requireAdmin } from "@/lib/auth/admin"
import Link from "next/link"

export const dynamic = "force-dynamic"

const TABLES = [
  {
    schema: "public",
    tables: [
      { name: "profiles", description: "User profiles and account data" },
      { name: "recipes", description: "Recipe database" },
      { name: "recipe_ingredients", description: "Recipe ingredients list" },
      {
        name: "standardized_ingredients",
        description: "Normalized ingredient names",
      },
      { name: "ingredients_recent", description: "Recent price data" },
      { name: "ingredients_history", description: "Historical price data" },
      { name: "product_mappings", description: "External product mappings" },
      { name: "grocery_stores", description: "Store locations (PostGIS)" },
      { name: "meal_schedule", description: "User meal planning" },
      { name: "pantry_items", description: "User pantry inventory" },
      { name: "shopping_list_items", description: "Shopping list items" },
      { name: "recipe_favorites", description: "User favorite recipes" },
      { name: "recipe_reviews", description: "Recipe ratings and reviews" },
      { name: "feedback", description: "User feedback messages" },
    ],
  },
  {
    schema: "ab_testing",
    tables: [
      { name: "admin_roles", description: "Admin role assignments" },
      { name: "experiments", description: "A/B test experiments" },
      { name: "variants", description: "Experiment variants" },
      { name: "user_assignments", description: "User variant assignments" },
      { name: "events", description: "Event tracking for analytics" },
    ],
  },
]

export default async function DatabasePage() {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <Link
            href="/dev"
            className="mb-2 inline-block text-sm text-blue-600 hover:text-blue-700"
          >
            ← Back to Dev Tools
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            Database Inspector
          </h1>
          <p className="mt-2 text-gray-600">
            Browse database tables and schema
          </p>
        </div>

        {/* Database Schemas */}
        <div className="space-y-8">
          {TABLES.map((schema) => (
            <div key={schema.schema}>
              <h2 className="mb-4 text-xl font-semibold text-gray-900">
                <span className="rounded bg-purple-100 px-2 py-1 font-mono text-sm text-purple-800">
                  {schema.schema}
                </span>{" "}
                schema
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {schema.tables.map((table) => (
                  <div
                    key={table.name}
                    className="rounded-lg bg-white p-4 shadow transition-shadow hover:shadow-md"
                  >
                    <h3 className="font-mono text-sm font-semibold text-gray-900">
                      {table.name}
                    </h3>
                    <p className="mt-2 text-xs text-gray-600">
                      {table.description}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button className="rounded bg-blue-100 px-3 py-1 text-xs text-blue-700 hover:bg-blue-200">
                        Browse
                      </button>
                      <button className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200">
                        Schema
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Export Schema
            </button>
            <button className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Run Migration
            </button>
            <button className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              View Indexes
            </button>
            <button className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Analyze Performance
            </button>
          </div>
        </div>

        {/* Database Info */}
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Database Info
          </h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Database Type:</span>
              <span className="font-mono">PostgreSQL (Supabase)</span>
            </div>
            <div className="flex justify-between">
              <span>Extensions:</span>
              <span className="font-mono">PostGIS, pg_trgm</span>
            </div>
            <div className="flex justify-between">
              <span>Total Schemas:</span>
              <span className="font-mono">{TABLES.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Tables:</span>
              <span className="font-mono">
                {TABLES.reduce((acc, s) => acc + s.tables.length, 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
