import Link from "next/link"
import { revalidatePath } from "next/cache"
import type { ReactNode } from "react"
import { requireAdmin, getAdminUser } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { PostFlagsDB } from "@/lib/database/post-flags-db"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

type ModerationStatusFilter = "all" | "open" | "reviewing"
type ModerationSeverityFilter = "all" | "low" | "medium" | "high"

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

type ModerationFilters = {
  q: string
  status: ModerationStatusFilter
  severity: ModerationSeverityFilter
  flaggedOnly: boolean
}

async function getDashboardData(filters: ModerationFilters) {
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
    flagsDB.fetchOpenFlags(100),
    supabase
      .from("posts")
      .select(`
        id, author_id, title, caption, image_url, created_at, updated_at, deleted_at,
        profiles!posts_author_id_fkey ( id, full_name, username )
      `)
      .order("created_at", { ascending: false })
      .limit(50),
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

  const q = filters.q.toLowerCase()
  const matchesSearch = (...values: Array<string | null | undefined>) =>
    !q || values.some((value) => value?.toLowerCase().includes(q))

  const filteredFlags = openFlags
    .filter((flag) => filters.status === "all" || flag.status === filters.status)
    .filter((flag) => filters.severity === "all" || flag.severity === filters.severity)
    .filter((flag) =>
      matchesSearch(flag.post_title, flag.post_id, flag.reason, flag.details, flag.reporter_name, flag.reporter_username)
    )
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))

  const filteredRecentPosts = normalizedRecentPosts.filter((post) => {
    if (filters.flaggedOnly && !flagCounts[post.id]) return false
    return matchesSearch(post.title, post.caption, post.id, post.author_id, post.author?.full_name, post.author?.username)
  })

  const highOpenFlags = openFlags.filter((flag) => flag.severity === "high").length

  return {
    totalPosts: totalPosts || 0,
    activePosts: activePosts || 0,
    deletedPosts: deletedPosts || 0,
    openFlags,
    filteredFlags,
    highOpenFlags,
    recentPosts: filteredRecentPosts,
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

async function markReviewingFlagAction(formData: FormData) {
  "use server"
  await requireAdmin()

  const flagId = String(formData.get("flag_id") ?? "")
  if (!flagId) return

  const supabase = createServiceSupabaseClient()
  const flagsDB = new PostFlagsDB(supabase)
  await flagsDB.markReviewing(flagId)

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

async function deletePostAndResolveFlagAction(formData: FormData) {
  "use server"
  const admin = await getAdminUser()

  const postId = String(formData.get("post_id") ?? "")
  const flagId = String(formData.get("flag_id") ?? "")
  if (!postId || !flagId) return

  const supabase = createServiceSupabaseClient()
  await supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId)
    .is("deleted_at", null)

  const flagsDB = new PostFlagsDB(supabase)
  await flagsDB.resolveFlag(flagId, admin.id, "Post removed from circulation via moderation queue", "resolved")

  revalidatePath("/dev/posts")
  revalidatePath(`/dev/posts/${postId}`)
  revalidatePath("/home")
}

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()

  const resolvedSearchParams = await searchParams
  const filters = parseModerationFilters(resolvedSearchParams)
  const {
    totalPosts,
    activePosts,
    deletedPosts,
    openFlags,
    filteredFlags,
    highOpenFlags,
    recentPosts,
    flagCounts,
  } = await getDashboardData(filters)

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
          <StatCard label="High Severity" value={highOpenFlags} accent="text-orange-600" />
        </div>

        <section className="mb-8 rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Open Flags</h2>
              <p className="text-sm text-gray-600">High severity reports are pinned first.</p>
            </div>
            <ModerationFiltersForm filters={filters} />
          </div>

          {filteredFlags.length === 0 ? (
            <p className="text-sm text-gray-500">No flags match the current filters.</p>
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
                  {filteredFlags.map((flag) => (
                    <tr key={flag.id} className="align-top hover:bg-gray-50">
                      <Td className="min-w-64 whitespace-normal">
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900">{flag.post_title || flag.post_id}</div>
                          <div className="text-xs font-mono text-gray-500">{flag.post_id}</div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <Link href={`/dev/posts/${flag.post_id}`} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                              Edit post
                            </Link>
                          </div>
                        </div>
                      </Td>
                      <Td className="min-w-80 whitespace-normal">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">{flag.reason}</div>
                          {flag.details ? <div className="text-sm text-gray-600">{flag.details}</div> : null}
                          <div className="text-xs text-gray-500">
                            Reported {formatDateTime(flag.created_at)}
                          </div>
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
                        <Badge variant="secondary" className={statusClass(flag.status)}>
                          {flag.status}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          {flag.status === "open" ? (
                            <form action={markReviewingFlagAction}>
                              <input type="hidden" name="flag_id" value={flag.id} />
                              <Button type="submit" size="sm" variant="secondary">
                                Review
                              </Button>
                            </form>
                          ) : null}
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
                          <form action={deletePostAndResolveFlagAction}>
                            <input type="hidden" name="post_id" value={flag.post_id} />
                            <input type="hidden" name="flag_id" value={flag.id} />
                            <Button type="submit" size="sm" variant="destructive">
                              Delete + resolve
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
            <p className="text-sm text-gray-600">
              Showing {recentPosts.length} recent posts{filters.flaggedOnly ? " with open flags" : ""}.
            </p>
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
                      <Td className="min-w-72 whitespace-normal">
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

function ModerationFiltersForm({ filters }: { filters: ModerationFilters }) {
  return (
    <form className="flex flex-wrap items-end gap-2" action="/dev/posts">
      <div className="space-y-1">
        <label className="text-xs font-medium uppercase tracking-wider text-gray-500" htmlFor="q">
          Search
        </label>
        <Input id="q" name="q" defaultValue={filters.q} placeholder="Title, ID, reason" className="h-9 w-56" />
      </div>
      <SelectFilter
        id="status"
        label="Status"
        name="status"
        value={filters.status}
        options={[
          ["all", "All active"],
          ["open", "Open"],
          ["reviewing", "Reviewing"],
        ]}
      />
      <SelectFilter
        id="severity"
        label="Severity"
        name="severity"
        value={filters.severity}
        options={[
          ["all", "All"],
          ["high", "High"],
          ["medium", "Medium"],
          ["low", "Low"],
        ]}
      />
      <label className="flex h-9 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-700">
        <input type="checkbox" name="flagged" value="1" defaultChecked={filters.flaggedOnly} />
        Flagged only
      </label>
      <Button type="submit" size="sm">Apply</Button>
      <Button asChild size="sm" variant="ghost">
        <Link href="/dev/posts">Reset</Link>
      </Button>
    </form>
  )
}

function SelectFilter({
  id,
  label,
  name,
  value,
  options,
}: {
  id: string
  label: string
  name: string
  value: string
  options: Array<[string, string]>
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium uppercase tracking-wider text-gray-500" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  )
}

function parseModerationFilters(
  searchParams: Record<string, string | string[] | undefined> | undefined
): ModerationFilters {
  const status = firstSearchParam(searchParams?.status)
  const severity = firstSearchParam(searchParams?.severity)
  return {
    q: firstSearchParam(searchParams?.q).trim(),
    status: status === "open" || status === "reviewing" ? status : "all",
    severity: severity === "low" || severity === "medium" || severity === "high" ? severity : "all",
    flaggedOnly: firstSearchParam(searchParams?.flagged) === "1",
  }
}

function firstSearchParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function severityRank(severity: string) {
  switch (severity) {
    case "high":
      return 3
    case "medium":
      return 2
    case "low":
      return 1
    default:
      return 0
  }
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

function statusClass(status: string) {
  return cn(
    "capitalize",
    status === "reviewing" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
  )
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "unknown date"
}
