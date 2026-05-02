import Link from "next/link"
import { revalidatePath } from "next/cache"
import type { ReactNode } from "react"
import { requireAdmin, getAdminUser } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { RecipeFlagsDB } from "@/lib/database/recipe-flags-db"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

type RecipeRow = {
  id: string
  title: string | null
  author_id: string | null
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
}

async function getDashboardData() {
  const supabase = createServiceSupabaseClient()
  const flagsDB = new RecipeFlagsDB(supabase)

  const [
    { count: totalRecipes },
    { count: activeRecipes },
    { count: deletedRecipes },
    openFlags,
    { data: recentRecipes, error: recentError },
  ] = await Promise.all([
    supabase.from("recipes").select("*", { count: "exact", head: true }),
    supabase.from("recipes").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("recipes").select("*", { count: "exact", head: true }).not("deleted_at", "is", null),
    flagsDB.fetchOpenFlags(50),
    supabase
      .from("recipes")
      .select("id, title, author_id, created_at, updated_at, deleted_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  if (recentError) {
    console.error("[dev/recipes] recent recipes error:", recentError)
  }

  const flagCounts = openFlags.reduce<Record<string, number>>((acc, flag) => {
    acc[flag.recipe_id] = (acc[flag.recipe_id] || 0) + 1
    return acc
  }, {})

  return {
    totalRecipes: totalRecipes || 0,
    activeRecipes: activeRecipes || 0,
    deletedRecipes: deletedRecipes || 0,
    openFlags,
    recentRecipes: (recentRecipes || []) as RecipeRow[],
    flagCounts,
  }
}

async function deleteRecipeAction(formData: FormData) {
  "use server"
  await requireAdmin()

  const recipeId = String(formData.get("recipe_id") ?? "")
  if (!recipeId) return

  const supabase = createServiceSupabaseClient()
  await supabase.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", recipeId)

  revalidatePath("/dev/recipes")
  revalidatePath(`/recipes/${recipeId}`)
}

async function restoreRecipeAction(formData: FormData) {
  "use server"
  await requireAdmin()

  const recipeId = String(formData.get("recipe_id") ?? "")
  if (!recipeId) return

  const supabase = createServiceSupabaseClient()
  await supabase.from("recipes").update({ deleted_at: null }).eq("id", recipeId)

  revalidatePath("/dev/recipes")
  revalidatePath(`/recipes/${recipeId}`)
}

async function resolveFlagAction(formData: FormData) {
  "use server"
  const admin = await getAdminUser()

  const flagId = String(formData.get("flag_id") ?? "")
  const resolution = String(formData.get("resolution") ?? "Resolved via admin panel")
  if (!flagId) return

  const supabase = createServiceSupabaseClient()
  const flagsDB = new RecipeFlagsDB(supabase)
  await flagsDB.resolveFlag(flagId, admin.id, resolution, "resolved")

  revalidatePath("/dev/recipes")
}

async function dismissFlagAction(formData: FormData) {
  "use server"
  const admin = await getAdminUser()

  const flagId = String(formData.get("flag_id") ?? "")
  const resolution = String(formData.get("resolution") ?? "Dismissed via admin panel")
  if (!flagId) return

  const supabase = createServiceSupabaseClient()
  const flagsDB = new RecipeFlagsDB(supabase)
  await flagsDB.resolveFlag(flagId, admin.id, resolution, "dismissed")

  revalidatePath("/dev/recipes")
}

export default async function AdminRecipesPage() {
  await requireAdmin()

  const {
    totalRecipes,
    activeRecipes,
    deletedRecipes,
    openFlags,
    recentRecipes,
    flagCounts,
  } = await getDashboardData()

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
          <h1 className="text-3xl font-bold text-gray-900">Recipe Moderation</h1>
          <p className="mt-2 text-gray-600">
            Review flags, soft-delete or restore recipes, and jump into the editor.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Recipes" value={totalRecipes} />
          <StatCard label="Active Recipes" value={activeRecipes} />
          <StatCard label="Deleted Recipes" value={deletedRecipes} />
          <StatCard label="Open Flags" value={openFlags.length} accent="text-red-600" />
        </div>

        <section className="mb-8 rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Open Flags</h2>
              <p className="text-sm text-gray-600">Newest reports appear first.</p>
            </div>
          </div>

          {openFlags.length === 0 ? (
            <p className="text-sm text-gray-500">No open flags.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Recipe</Th>
                    <Th>Reason</Th>
                    <Th>Reporter</Th>
                    <Th>Severity</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {openFlags.map((flag) => (
                    <tr key={flag.id} className="align-top hover:bg-gray-50">
                      <Td>
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900">{flag.recipe_title || flag.recipe_id}</div>
                          <div className="text-xs text-gray-500 font-mono">{flag.recipe_id}</div>
                        </div>
                      </Td>
                      <Td>
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">{flag.reason}</div>
                          {flag.details ? <div className="text-sm text-gray-600">{flag.details}</div> : null}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-sm text-gray-700">
                          {flag.reporter_name || flag.reporter_username || "Anonymous"}
                        </div>
                      </Td>
                      <Td>
                        <Badge variant="secondary" className={severityClass(flag.severity)}>
                          {flag.severity}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                          {flag.status}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <form action={resolveFlagAction}>
                            <input type="hidden" name="flag_id" value={flag.id} />
                            <input type="hidden" name="resolution" value="Resolved via admin panel" />
                            <Button type="submit" size="sm" variant="outline">
                              Resolve
                            </Button>
                          </form>
                          <form action={dismissFlagAction}>
                            <input type="hidden" name="flag_id" value={flag.id} />
                            <input type="hidden" name="resolution" value="Dismissed via admin panel" />
                            <Button type="submit" size="sm" variant="ghost">
                              Dismiss
                            </Button>
                          </form>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent Recipes</h2>
              <p className="text-sm text-gray-600">Use edit, delete, or restore depending on the current state.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Recipe</Th>
                  <Th>Author</Th>
                  <Th>Status</Th>
                  <Th>Flags</Th>
                  <Th>Created</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {recentRecipes.map((recipe) => {
                  const flaggedCount = flagCounts[recipe.id] || 0
                  const isDeleted = !!recipe.deleted_at

                  return (
                    <tr key={recipe.id} className="align-top hover:bg-gray-50">
                      <Td>
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900">{recipe.title || "Untitled recipe"}</div>
                          <div className="text-xs text-gray-500 font-mono">{recipe.id}</div>
                        </div>
                      </Td>
                      <Td className="text-sm text-gray-700 font-mono">{recipe.author_id || "—"}</Td>
                      <Td>
                        {isDeleted ? (
                          <Badge variant="secondary" className="bg-gray-200 text-gray-800">Deleted</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">Active</Badge>
                        )}
                      </Td>
                      <Td>
                        <Badge variant="secondary" className={flaggedCount > 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"}>
                          {flaggedCount} open
                        </Badge>
                      </Td>
                      <Td className="text-sm text-gray-600">
                        {recipe.created_at ? new Date(recipe.created_at).toLocaleString() : "—"}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/edit-recipe/${recipe.id}`}>Edit</Link>
                          </Button>
                          {isDeleted ? (
                            <form action={restoreRecipeAction}>
                              <input type="hidden" name="recipe_id" value={recipe.id} />
                              <Button type="submit" size="sm" variant="outline">
                                Restore
                              </Button>
                            </form>
                          ) : (
                            <form action={deleteRecipeAction}>
                              <input type="hidden" name="recipe_id" value={recipe.id} />
                              <Button type="submit" size="sm" variant="destructive">
                                Delete
                              </Button>
                            </form>
                          )}
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/recipes/${recipe.id}`}>View</Link>
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: string
}) {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent || "text-gray-900"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  )
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
      {children}
    </th>
  )
}

function Td({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <td className={`whitespace-nowrap px-6 py-4 ${className || ""}`}>{children}</td>
}

function severityClass(severity: string) {
  switch (severity) {
    case "high":
      return "bg-red-100 text-red-800"
    case "low":
      return "bg-blue-100 text-blue-800"
    default:
      return "bg-yellow-100 text-yellow-800"
  }
}
