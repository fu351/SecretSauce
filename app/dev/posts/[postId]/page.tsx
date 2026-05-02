import Link from "next/link"
import { revalidatePath } from "next/cache"
import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

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

export default async function AdminPostPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  await requireAdmin()

  const { postId } = await params
  const post = await getPost(postId)
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
          <div className="mb-4 text-sm text-gray-600">
            Author: <span className="font-medium text-gray-900">{authorName}</span>
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

        <div className="rounded-lg bg-white p-6 shadow">
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
      </div>
    </div>
  )
}
