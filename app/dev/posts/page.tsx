import Link from "next/link"
import { revalidatePath } from "next/cache"
import type { ReactNode } from "react"
import { requireAdmin, getAdminUser } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { PostFlagsDB } from "@/lib/database/post-flags-db"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

type AdminPostRow = {
  id: string
  author_id: string
  title: string
  caption: string | null
  image_url: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  author?: {
    id: string
    full_name: string | null
    username: string | null
  }
}

async function getDashboardData() {
  const supabase = createServiceSupabaseClient()
  const flagsDB = new PostFlagsDB(supabase)

  const [
    { count: totalPosts },
    { count: activePosts },
    { count: deletedPosts },
    openFlags,
    { data: recentPosts, error: recentError },
  ] = await Promise.all([
    supabase.from("posts").select("*", { count: "exact", head: true }),
    supabase.from("posts").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("posts").select("*", { count: "exact", head: true }).not("deleted_at", "is", null),
    flagsDB.fetchOpenFlags(50),
    supabase
      .from("posts")
      .select(`
        id, author_id, title, caption, image_url, created_at, updated_at, deleted_at,
        profiles!posts_author_id_fkey ( id, full_name, username )
      `)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  if (recentError) {
    console.error("[dev/posts] recent posts error:", recentError)
  }

  const normalizedRecentPosts = ((recentPosts || []) as any[]).map((row) => ({
    id: row.id,
    author_id: row.author_id,
    title: row.title,
    caption: row.caption,
    image_url: row.image_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
    author: {
      id: row.profiles?.id ?? row.author_id,
      full_name: row.profiles?.full_name ?? null,
      username: row.profiles?.username ?? null,
    },
  })) as AdminPostRow[]

  const flagCounts = openFlags.reduce<Record<string, number>>((acc, flag) => {
    acc[flag.post_id] = (acc[flag.post_id] || 0) + 1
    return acc
  }, {})

  return {
    totalPosts: totalPosts || 0,
    activePosts: activePosts || 0,
    deletedPosts: deletedPosts || 0,
    openFlags,
    recentPosts: normalizedRecentPosts,
    flagCounts,
  }
}

async function deletePostAction(formData: FormData) {
  "use server"
  await requireAdmin()

  const postId = String(formData.get("post_id") ?? "")
  if (!postId) return

  const supabase = createServiceSupabaseClient()
  await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId)
    .is("deleted_at", null)

  revalidatePath("/dev/posts")
  revalidatePath(`/dev/posts/${postId}`)
  revalidatePath("/home")
}

async function restorePostAction(formData: FormData) {
  "use server"
  await requireAdmin()

  const postId = String(formData.get("post_id") ?? "")
  if (!postId) return

  const supabase = createServiceSupabaseClient()
  await supabase
    .from("posts")
    .update({ deleted_at: null })
    .eq("id", postId)

  revalidatePath("/dev/posts")
  revalidatePath(`/dev/posts/${postId}`)
  revalidatePath("/home")
}

async function resolveFlagAction(formData: FormData) {
  "use server"
  const admin = await getAdminUser()

  const flagId = String(formData.get("flag_id") ?? "")
  const resolution = String(formData.get("resolution") ?? "Resolved via admin panel")
  if (!flagId) return

  const supabase = createServiceSupabaseClient()
  const flagsDB = new PostFlagsDB(supabase)
  await flagsDB.resolveFlag(flagId, admin.id, resolution, "resolved")

  revalidatePath("/dev/posts")
}

async function dismissFlagAction(formData: FormData) {
  "use server"
  const admin = await getAdminUser()

  const flagId = String(formData.get("flag_id") ?? "")
  const resolution = String(formData.get("resolution") ?? "Dismissed via admin panel")
  if (!flagId) return

  const supabase = createServiceSupabaseClient()
  const flagsDB = new PostFlagsDB(supabase)
  await flagsDB.resolveFlag(flagId, admin.id, resolution, "dismissed")

  revalidatePath("/dev/posts")
}

export default async function AdminPostsPage() {
  await requireAdmin()

  const {
    totalPosts,
    activePosts,
    deletedPosts,
    openFlags,
    recentPosts,
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
          <h1 className="text-3xl font-bold text-gray-900">Post Moderation</h1>
          <p className="mt-2 text-gray-600">
            Review flags, edit posts, and soft-delete or restore feed content.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Posts" value={totalPosts} />
          <StatCard label="Active Posts" value={activePosts} />
          <StatCard label="Deleted Posts" value={deletedPosts} />
          <StatCard label="Open Flags" value={openFlags.length} accent="text-red-600" />
        </div>

        <section className="mb-8 rounded-lg bg-white p-6 shadow">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Open Flags</h2>
            <p className="text-sm text-gray-600">Newest reports appear first.</p>
          </div>

          {openFlags.length === 0 ? (
            <p className="text-sm text-gray-500">No open flags.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Post</Th>
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
                          <div className="font-medium text-gray-900">{flag.post_title || flag.post_id}</div>
                          <div className="text-xs font-mono text-gray-500">{flag.post_id}</div>
                        </div>
                      </Td>
                      <Td>
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">{flag.reason}</div>
                          {flag.details ? <div className="text-sm text-gray-600">{flag.details}</div> : null}
                        </div>
                      </Td>
                      <Td className="text-sm text-gray-700">
                        {flag.reporter_name || flag.reporter_username || "Anonymous"}
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
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Posts</h2>
            <p className="text-sm text-gray-600">Edit, delete, or restore posts from one place.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Post</Th>
                  <Th>Author</Th>
                  <Th>Status</Th>
                  <Th>Flags</Th>
                  <Th>Created</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {recentPosts.map((post) => {
                  const flaggedCount = flagCounts[post.id] || 0
                  const isDeleted = !!post.deleted_at
                  const authorName = post.author?.full_name || post.author?.username || post.author_id

                  return (
                    <tr key={post.id} className="align-top hover:bg-gray-50">
                      <Td>
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900">{post.title}</div>
                          {post.caption ? <div className="text-sm text-gray-600">{post.caption}</div> : null}
                          <div className="text-xs font-mono text-gray-500">{post.id}</div>
                        </div>
                      </Td>
                      <Td className="text-sm text-gray-700">{authorName}</Td>
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
                        {new Date(post.created_at).toLocaleString()}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dev/posts/${post.id}`}>Edit</Link>
                          </Button>
                          {isDeleted ? (
                            <form action={restorePostAction}>
                              <input type="hidden" name="post_id" value={post.id} />
                              <Button type="submit" size="sm" variant="outline">
                                Restore
                              </Button>
                            </form>
                          ) : (
                            <form action={deletePostAction}>
                              <input type="hidden" name="post_id" value={post.id} />
                              <Button type="submit" size="sm" variant="destructive">
                                Delete
                              </Button>
                            </form>
                          )}
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
