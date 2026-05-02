import { SupabaseClient } from "@supabase/supabase-js"
import { BaseTable } from "./base-db"
import type { Database } from "@/lib/database/supabase"

type PostRow    = Database["public"]["Tables"]["posts"]["Row"]
type PostInsert = Database["public"]["Tables"]["posts"]["Insert"]
type PostUpdate = Database["public"]["Tables"]["posts"]["Update"]

export type Post = PostRow

export type PostWithMeta = Post & {
  author: {
    id: string
    full_name: string | null
    avatar_url: string | null
    username?: string | null
  }
  like_count: number
  repost_count: number
  liked_by_viewer: boolean
  reposted_by_viewer: boolean
}

export type PostUpdateInput = {
  title?: string
  caption?: string | null
  imageUrl?: string
}

class PostTable extends BaseTable<"posts", PostRow, PostInsert, PostUpdate> {
  private static instance: PostTable | null = null
  readonly tableName = "posts" as const

  private serviceClient: SupabaseClient<Database> | null = null

  private constructor() {
    super()
  }

  static getInstance(): PostTable {
    if (!PostTable.instance) {
      PostTable.instance = new PostTable()
    }
    return PostTable.instance
  }

  private get db(): SupabaseClient<Database> {
    return (this.serviceClient ?? this.supabase) as SupabaseClient<Database>
  }

  withServiceClient(client: SupabaseClient<Database>): this {
    this.serviceClient = client
    return this
  }

  // -----------------------------------------------------------------------
  // WRITES
  // -----------------------------------------------------------------------

  async createPost(data: {
    authorId: string
    imageUrl: string
    title: string
    caption?: string
  }): Promise<PostRow | null> {
    const { data: row, error } = await this.db
      .from("posts")
      .insert({
        author_id: data.authorId,
        image_url: data.imageUrl,
        title: data.title,
        caption: data.caption ?? null,
        deleted_at: null,
      })
      .select()
      .single()

    if (error) {
      this.handleError(error, "createPost")
      return null
    }
    return row
  }

  async deletePost(postId: string, authorId: string): Promise<boolean> {
    const { error } = await this.db
      .from("posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", postId)
      .eq("author_id", authorId)
      .is("deleted_at", null)

    if (error) {
      this.handleError(error, `deletePost(${postId})`)
      return false
    }
    return true
  }

  async restorePost(postId: string, authorId: string): Promise<boolean> {
    const { error } = await this.db
      .from("posts")
      .update({ deleted_at: null })
      .eq("id", postId)
      .eq("author_id", authorId)

    if (error) {
      this.handleError(error, `restorePost(${postId})`)
      return false
    }
    return true
  }

  async updatePost(
    postId: string,
    authorId: string,
    updates: PostUpdateInput,
  ): Promise<PostRow | null> {
    const patch: Record<string, unknown> = {}
    if (updates.title !== undefined) patch.title = updates.title
    if (updates.caption !== undefined) patch.caption = updates.caption
    if (updates.imageUrl !== undefined) patch.image_url = updates.imageUrl

    const { data, error } = await this.db
      .from("posts")
      .update(patch)
      .eq("id", postId)
      .eq("author_id", authorId)
      .is("deleted_at", null)
      .select()
      .single()

    if (error) {
      this.handleError(error, `updatePost(${postId})`)
      return null
    }

    return data ?? null
  }

  /**
   * Toggle like. Returns new liked state.
   */
  async toggleLike(postId: string, profileId: string): Promise<boolean> {
    const { data: existing } = await this.db
      .from("post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("profile_id", profileId)
      .maybeSingle()

    if (existing) {
      await this.db.from("post_likes").delete().eq("id", existing.id)
      return false
    } else {
      await this.db.from("post_likes").insert({ post_id: postId, profile_id: profileId })
      return true
    }
  }

  /**
   * Toggle repost. Returns new reposted state.
   */
  async toggleRepost(postId: string, profileId: string): Promise<boolean> {
    const { data: existing } = await this.db
      .from("post_reposts")
      .select("id")
      .eq("post_id", postId)
      .eq("profile_id", profileId)
      .maybeSingle()

    if (existing) {
      await this.db.from("post_reposts").delete().eq("id", existing.id)
      return false
    } else {
      await this.db.from("post_reposts").insert({ post_id: postId, profile_id: profileId })
      return true
    }
  }

  // -----------------------------------------------------------------------
  // READS
  // -----------------------------------------------------------------------

  /**
   * Get feed posts: posts from followed users + own posts.
   * Falls back to recent global posts if viewer has no follows.
   */
  async getFeedPosts(
    viewerProfileId: string | null,
    limit = 20,
    offset = 0
  ): Promise<PostWithMeta[]> {
    let authorIds: string[] = []

    if (viewerProfileId) {
      const { data: following } = await this.db
        .from("follow_requests")
        .select("following_id")
        .eq("follower_id", viewerProfileId)
        .eq("status", "accepted")

      authorIds = [
        viewerProfileId,
        ...((following ?? []).map((f) => f.following_id)),
      ]
    }

    let query = this.db
      .from("posts")
      .select(`
        id, author_id, image_url, title, caption, created_at, updated_at, deleted_at,
        profiles!posts_author_id_fkey ( id, full_name, avatar_url, username ),
        post_likes ( id, profile_id ),
        post_reposts ( id, profile_id )
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (authorIds.length > 0) {
      query = query.in("author_id", authorIds)
    }

    const { data, error } = await query

    if (error) {
      this.handleError(error, "getFeedPosts")
      return []
    }

    return ((data ?? []) as any[]).map((row) => ({
      id:           row.id,
      author_id:    row.author_id,
      image_url:    row.image_url,
      title:        row.title,
      caption:      row.caption,
      created_at:   row.created_at,
      updated_at:   row.updated_at,
      deleted_at:   row.deleted_at ?? null,
      author: {
        id:         row.profiles?.id ?? row.author_id,
        full_name:  row.profiles?.full_name ?? null,
        avatar_url: row.profiles?.avatar_url ?? null,
        username:   row.profiles?.username ?? null,
      },
      like_count:          (row.post_likes ?? []).length,
      repost_count:        (row.post_reposts ?? []).length,
      liked_by_viewer:     viewerProfileId
        ? (row.post_likes ?? []).some((l: any) => l.profile_id === viewerProfileId)
        : false,
      reposted_by_viewer:  viewerProfileId
        ? (row.post_reposts ?? []).some((r: any) => r.profile_id === viewerProfileId)
        : false,
    }))
  }

  /**
   * Get posts by a specific author.
   */
  async getPostsByAuthor(
    authorId: string,
    viewerProfileId: string | null,
    limit = 20,
    offset = 0
  ): Promise<PostWithMeta[]> {
    const { data, error } = await this.db
      .from("posts")
      .select(`
        id, author_id, image_url, title, caption, created_at, updated_at, deleted_at,
        profiles!posts_author_id_fkey ( id, full_name, avatar_url, username ),
        post_likes ( id, profile_id ),
        post_reposts ( id, profile_id )
      `)
      .eq("author_id", authorId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      this.handleError(error, `getPostsByAuthor(${authorId})`)
      return []
    }

    return ((data ?? []) as any[]).map((row) => ({
      id:           row.id,
      author_id:    row.author_id,
      image_url:    row.image_url,
      title:        row.title,
      caption:      row.caption,
      created_at:   row.created_at,
      updated_at:   row.updated_at,
      deleted_at:   row.deleted_at ?? null,
      author: {
        id:         row.profiles?.id ?? row.author_id,
        full_name:  row.profiles?.full_name ?? null,
        avatar_url: row.profiles?.avatar_url ?? null,
        username:   row.profiles?.username ?? null,
      },
      like_count:          (row.post_likes ?? []).length,
      repost_count:        (row.post_reposts ?? []).length,
      liked_by_viewer:     viewerProfileId
        ? (row.post_likes ?? []).some((l: any) => l.profile_id === viewerProfileId)
        : false,
      reposted_by_viewer:  viewerProfileId
        ? (row.post_reposts ?? []).some((r: any) => r.profile_id === viewerProfileId)
        : false,
    }))
  }

  async fetchPostById(postId: string): Promise<PostWithMeta | null> {
    const { data, error } = await this.db
      .from("posts")
      .select(`
        id, author_id, image_url, title, caption, created_at, updated_at, deleted_at,
        profiles!posts_author_id_fkey ( id, full_name, avatar_url, username ),
        post_likes ( id, profile_id ),
        post_reposts ( id, profile_id )
      `)
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle()

    if (error) {
      this.handleError(error, `fetchPostById(${postId})`)
      return null
    }

    if (!data) return null

    const row = data as any
    return {
      id: row.id,
      author_id: row.author_id,
      image_url: row.image_url,
      title: row.title,
      caption: row.caption,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at ?? null,
      author: {
        id: row.profiles?.id ?? row.author_id,
        full_name: row.profiles?.full_name ?? null,
        avatar_url: row.profiles?.avatar_url ?? null,
        username: row.profiles?.username ?? null,
      },
      like_count: (row.post_likes ?? []).length,
      repost_count: (row.post_reposts ?? []).length,
      liked_by_viewer: false,
      reposted_by_viewer: false,
    }
  }
}

export const postDB = PostTable.getInstance()
