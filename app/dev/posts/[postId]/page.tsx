import Link from "next/link"
import { revalidatePath } from "next/cache"
import { notFound } from "next/navigation"
import { requireAdmin, getAdminUser } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { PostFlagsDB } from "@/lib/database/post-flags-db"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

async function getPost(postId: string) {
  const supabase = createServiceSupabaseClient()
  const { data, error } = await supabase
    .from("posts")
    .select(`
      id, author_id, image_url, title, caption, created_at, updated_at, deleted_at,
      profiles!posts_author_id_fkey ( id, full_name, username )
    `)
    .eq("id", postId)
    .maybeSingle()

  if (error || !data) return null
  return data as any
}

async function getPostFlags(postId: string) {
  const supabase = createServiceSupabaseClient()
  const flagsDB = new PostFlagsDB(supabase)
  return flagsDB.fetchFlagsForPost(postId, 25)
}

async function savePostAction(formData: FormData) {
  "use server"
  await requireAdmin()

  const postId = String(formData.get("post_id") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const imageUrl = String(formData.get("image_url") ?? "").trim()
  const caption = String(formData.get("caption") ?? "").trim()
  if (!postId || !title || !imageUrl) return

  const supabase = createServiceSupabaseClient()
  await supabase
    .from("posts")
    .update({
      title,
      image_url: imageUrl,
      caption: caption || null,
    })
    .eq("id", postId)

  revalidatePath("/dev/posts")
  revalidatePath(`/dev/posts/${postId}`)
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
}

async function markReviewingFlagAction(formData: FormData) {
  "use server"
  await requireAdmin()

  const postId = String(formData.get("post_id") ?? "")
  const flagId = String(formData.get("flag_id") ?? "")
  if (!postId || !flagId) return

  const supabase = createServiceSupabaseClient()
  const flagsDB = new PostFlagsDB(supabase)
  await flagsDB.markReviewing(flagId)

  revalidatePath("/dev/posts")
  revalidatePath(`/dev/posts/${postId}`)
}

async function resolveFlagAction(formData: FormData) {
  "use server"
  const admin = await getAdminUser()

  const postId = String(formData.get("post_id") ?? "")
  const flagId = String(formData.get("flag_id") ?? "")
  const resolution = String(formData.get("resolution") ?? "Resolved via post editor")
  if (!postId || !flagId) return

  const supabase = createServiceSupabaseClient()
  const flagsDB = new PostFlagsDB(supabase)
  await flagsDB.resolveFlag(flagId, admin.id, resolution, "resolved")

  revalidatePath("/dev/posts")
  revalidatePath(`/dev/posts/${postId}`)
}

async function dismissFlagAction(formData: FormData) {
  "use server"
  const admin = await getAdminUser()

  const postId = String(formData.get("post_id") ?? "")
  const flagId = String(formData.get("flag_id") ?? "")
  const resolution = String(formData.get("resolution") ?? "Dismissed via post editor")
  if (!postId || !flagId) return

  const supabase = createServiceSupabaseClient()
  const flagsDB = new PostFlagsDB(supabase)
  await flagsDB.resolveFlag(flagId, admin.id, resolution, "dismissed")

  revalidatePath("/dev/posts")
  revalidatePath(`/dev/posts/${postId}`)
}

export default async function AdminPostPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  await requireAdmin()

  const { postId } = await params
  const [post, flags] = await Promise.all([getPost(postId), getPostFlags(postId)])
  if (!post) notFound()

  const authorName = post.profiles?.full_name || post.profiles?.username || post.author_id

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link href="/dev/posts" className="mb-2 inline-block text-sm text-blue-600 hover:text-blue-700">
            ← Back to Post Moderation
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Edit Post</h1>
          <p className="mt-2 text-gray-600">
            Update the post content or remove it from circulation.
          </p>
        </div>

        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 text-sm text-gray-600">
            <div>
              Author: <span className="font-medium text-gray-900">{authorName}</span>
              <div className="mt-1 font-mono text-xs text-gray-500">{post.id}</div>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href={post.image_url} target="_blank" rel="noreferrer">
                Open image
              </a>
            </Button>
          </div>
          {post.deleted_at ? (
            <div className="mb-4">
              <Badge className="bg-gray-200 text-gray-800">Deleted</Badge>
            </div>
          ) : null}

          <form action={savePostAction} className="space-y-4">
            <input type="hidden" name="post_id" value={post.id} />
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="title">Title</label>
              <Input id="title" name="title" defaultValue={post.title} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="image_url">Image URL</label>
              <Input id="image_url" name="image_url" defaultValue={post.image_url} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="caption">Caption</label>
              <Textarea id="caption" name="caption" defaultValue={post.caption || ""} className="min-h-28" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </div>

        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <div className="flex flex-wrap gap-2">
            {post.deleted_at ? (
              <form action={restorePostAction}>
                <input type="hidden" name="post_id" value={post.id} />
                <Button type="submit" variant="outline">Restore</Button>
              </form>
            ) : (
              <form action={deletePostAction}>
                <input type="hidden" name="post_id" value={post.id} />
                <Button type="submit" variant="destructive">Delete</Button>
              </form>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Flag History</h2>
              <p className="text-sm text-gray-600">Newest reports and moderator resolutions for this post.</p>
            </div>
            <Badge variant="secondary" className={openFlagCount(flags) > 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"}>
              {openFlagCount(flags)} active
            </Badge>
          </div>

          {flags.length === 0 ? (
            <p className="text-sm text-gray-500">No flags have been submitted for this post.</p>
          ) : (
            <div className="space-y-4">
              {flags.map((flag) => (
                <div key={flag.id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className={severityClass(flag.severity)}>
                          {flag.severity}
                        </Badge>
                        <Badge variant="secondary" className={statusClass(flag.status)}>
                          {flag.status}
                        </Badge>
                      </div>
                      <div className="font-medium text-gray-900">{flag.reason}</div>
                      {flag.details ? <p className="text-sm text-gray-600">{flag.details}</p> : null}
                      <p className="text-xs text-gray-500">
                        Reported by {flag.reporter_name || flag.reporter_username || "Anonymous"} on {formatDateTime(flag.created_at)}
                      </p>
                      {flag.resolution ? (
                        <p className="text-xs text-gray-500">
                          {flag.status} by {flag.resolver_name || "admin"} on {formatDateTime(flag.resolved_at)}: {flag.resolution}
                        </p>
                      ) : null}
                    </div>
                    {flag.status === "open" || flag.status === "reviewing" ? (
                      <div className="flex flex-wrap gap-2">
                        {flag.status === "open" ? (
                          <form action={markReviewingFlagAction}>
                            <input type="hidden" name="post_id" value={post.id} />
                            <input type="hidden" name="flag_id" value={flag.id} />
                            <Button type="submit" size="sm" variant="secondary">
                              Review
                            </Button>
                          </form>
                        ) : null}
                        <form action={resolveFlagAction}>
                          <input type="hidden" name="post_id" value={post.id} />
                          <input type="hidden" name="flag_id" value={flag.id} />
                          <input type="hidden" name="resolution" value="Resolved via post editor" />
                          <Button type="submit" size="sm" variant="outline">
                            Resolve
                          </Button>
                        </form>
                        <form action={dismissFlagAction}>
                          <input type="hidden" name="post_id" value={post.id} />
                          <input type="hidden" name="flag_id" value={flag.id} />
                          <input type="hidden" name="resolution" value="Dismissed via post editor" />
                          <Button type="submit" size="sm" variant="ghost">
                            Dismiss
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function openFlagCount(flags: Array<{ status: string }>) {
  return flags.filter((flag) => flag.status === "open" || flag.status === "reviewing").length
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
    status === "resolved" && "bg-green-100 text-green-800",
    status === "dismissed" && "bg-gray-100 text-gray-700",
    status === "reviewing" && "bg-blue-100 text-blue-800",
    status === "open" && "bg-amber-100 text-amber-800"
  )
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "unknown date"
}
