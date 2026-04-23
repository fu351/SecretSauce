import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database/supabase"

type Json = Database["public"]["Tables"]["notifications"]["Row"]["payload"]

export type NotificationType = Database["public"]["Enums"]["notification_type"]

export type ProfileSnippet = {
  id: string
  full_name: string | null
  avatar_url: string | null
  username: string | null
}

export type NotificationFeedItem =
  | { id: string; type: "follow_request"; requestId: string; from: ProfileSnippet; created_at: string; read_at: string | null }
  | { id: string; type: "new_follower"; from: ProfileSnippet; created_at: string; read_at: string | null }
  | { id: string; type: "post_like"; from: ProfileSnippet; post: { id: string; title: string }; created_at: string; read_at: string | null }
  | { id: string; type: "post_repost"; from: ProfileSnippet; post: { id: string; title: string }; created_at: string; read_at: string | null }

export type NotificationInsertInput = {
  recipientId: string
  actorId: string | null
  type: NotificationType
  entityType: string
  entityId?: string | null
  title: string
  body?: string | null
  payload?: Record<string, unknown>
}

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"]

type DigestRecipientRow = {
  id: string
  email: string
  full_name: string | null
  notification_email_digest_enabled: boolean
}

type DigestNotificationRow = NotificationRow & {
  recipient: DigestRecipientRow | null
  actor: ProfileSnippet | null
}

type DigestBucket = {
  recipient: DigestRecipientRow
  notifications: DigestNotificationRow[]
}

function mapProfileSnippet(value: unknown): ProfileSnippet | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<ProfileSnippet>
  if (typeof candidate.id !== "string") return null
  return {
    id: candidate.id,
    full_name: typeof candidate.full_name === "string" ? candidate.full_name : null,
    avatar_url: typeof candidate.avatar_url === "string" ? candidate.avatar_url : null,
    username: typeof candidate.username === "string" ? candidate.username : null,
  }
}

function buildDigestText(bucket: DigestBucket, startAt: Date, endAt: Date): { subject: string; text: string; html: string } {
  const countByType = bucket.notifications.reduce<Record<NotificationType, number>>((acc, row) => {
    acc[row.type] = (acc[row.type] ?? 0) + 1
    return acc
  }, {
    follow_request: 0,
    new_follower: 0,
    post_like: 0,
    post_repost: 0,
  })

  const total = bucket.notifications.length
  const displayName = bucket.recipient.full_name ?? bucket.recipient.email
  const title = `Your weekly Secret Sauce digest`
  const rangeLabel = `${startAt.toLocaleDateString()} - ${endAt.toLocaleDateString()}`
  const centerUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard#notifications`
  const getPostTitle = (row: DigestNotificationRow) => {
    const payload = row.payload as Record<string, any>
    return typeof payload.post_title === "string" ? payload.post_title : row.title
  }
  const lines = bucket.notifications.slice(0, 8).map((row) => {
    const actorName = row.actor?.full_name ?? row.actor?.username ?? "Someone"
    if (row.type === "follow_request") return `- ${actorName} wants to follow you`
    if (row.type === "new_follower") return `- ${actorName} started following you`
    if (row.type === "post_like") return `- ${actorName} liked "${getPostTitle(row)}"`
    return `- ${actorName} reposted "${getPostTitle(row)}"`
  })

  const summaryLines = [
    `Weekly digest for ${displayName}`,
    `Window: ${rangeLabel}`,
    `Total notifications: ${total}`,
    `Follow requests: ${countByType.follow_request}`,
    `New followers: ${countByType.new_follower}`,
    `Likes: ${countByType.post_like}`,
    `Reposts: ${countByType.post_repost}`,
    "",
    ...lines,
    "",
    `Open notifications: ${centerUrl}`,
  ]

  const categoryRows = [
    ["Follow requests", countByType.follow_request],
    ["New followers", countByType.new_follower],
    ["Likes", countByType.post_like],
    ["Reposts", countByType.post_repost],
  ]
    .map(([label, value]) => `<tr><td style="padding:4px 0;color:#444">${label}</td><td style="padding:4px 0;text-align:right;font-weight:600">${value}</td></tr>`)
    .join("")

  const itemRows = bucket.notifications
    .slice(0, 8)
    .map((row) => {
      const actorName = row.actor?.full_name ?? row.actor?.username ?? "Someone"
      const payload = row.payload as Record<string, any>
      const postTitle = typeof payload.post_title === "string" ? payload.post_title : row.title
      const description =
        row.type === "follow_request"
          ? "wants to follow you"
          : row.type === "new_follower"
            ? "started following you"
            : row.type === "post_like"
              ? `liked “${postTitle}”`
              : `reposted “${postTitle}”`

      return `<li style="margin-bottom:10px"><strong>${escapeHtml(actorName)}</strong> ${escapeHtml(description)}</li>`
    })
    .join("")

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
      <h1 style="font-size:20px;margin:0 0 12px 0">Weekly notifications</h1>
      <p style="margin:0 0 16px 0">You have ${total} social updates from the last week.</p>
      <table style="border-collapse:collapse;margin-bottom:16px">${categoryRows}</table>
      <ul style="padding-left:18px;margin:0 0 16px 0">${itemRows}</ul>
      <p style="margin:0"><a href="${centerUrl}">Open your notification center</a></p>
    </div>
  `

  return {
    subject: `${title} (${total})`,
    text: summaryLines.join("\n"),
    html,
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
}

function mapNotificationRow(row: NotificationRow & { profiles?: unknown }): NotificationFeedItem | null {
  const from = mapProfileSnippet((row as any).profiles)
  if (!from) return null

  const read_at = row.read_at ?? null
  const payload = (row.payload ?? {}) as Record<string, any>

  if (row.type === "follow_request") {
    return {
      id: row.id,
      type: "follow_request",
      requestId: typeof payload.requestId === "string" ? payload.requestId : row.entity_id ?? row.id,
      from,
      created_at: row.created_at,
      read_at,
    }
  }

  if (row.type === "new_follower") {
    return {
      id: row.id,
      type: "new_follower",
      from,
      created_at: row.created_at,
      read_at,
    }
  }

  const post = {
    id: typeof payload.post_id === "string" ? payload.post_id : row.entity_id ?? row.id,
    title: typeof payload.post_title === "string" ? payload.post_title : row.title,
  }

  if (row.type === "post_like") {
    return {
      id: row.id,
      type: "post_like",
      from,
      post,
      created_at: row.created_at,
      read_at,
    }
  }

  return {
    id: row.id,
    type: "post_repost",
    from,
    post,
    created_at: row.created_at,
    read_at,
  }
}

export async function createNotification(
  db: SupabaseClient<Database>,
  input: NotificationInsertInput
): Promise<NotificationRow | null> {
  const { data, error } = await db
    .from("notifications")
    .insert({
      recipient_id: input.recipientId,
      actor_id: input.actorId,
      type: input.type,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      title: input.title,
      body: input.body ?? null,
      payload: (input.payload ?? {}) as Json,
    })
    .select()
    .single()

  if (error) {
    console.error("[notifications] failed to create notification:", error)
    return null
  }

  return data
}

export async function fetchUnreadNotificationCount(
  db: SupabaseClient<Database>,
  recipientId: string
): Promise<number> {
  const { count, error } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .is("read_at", null)

  if (error) {
    console.error("[notifications] failed to fetch unread count:", error)
    return 0
  }

  return count ?? 0
}

export async function markAllNotificationsRead(
  db: SupabaseClient<Database>,
  recipientId: string
): Promise<boolean> {
  const { error } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", recipientId)
    .is("read_at", null)

  if (error) {
    console.error("[notifications] failed to mark all read:", error)
    return false
  }

  return true
}

export async function markNotificationRead(
  db: SupabaseClient<Database>,
  recipientId: string,
  notificationId: string
): Promise<boolean> {
  const { error } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", recipientId)

  if (error) {
    console.error("[notifications] failed to mark notification read:", error)
    return false
  }

  return true
}

export async function fetchNotifications(
  db: SupabaseClient<Database>,
  recipientId: string,
  options?: { limit?: number; unreadOnly?: boolean }
): Promise<NotificationFeedItem[]> {
  let query = db
    .from("notifications")
    .select(`
      id, recipient_id, actor_id, type, entity_type, entity_id, title, body, payload, read_at, created_at,
      profiles!notifications_actor_id_fkey ( id, full_name, avatar_url, username )
    `)
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.unreadOnly) {
    query = query.is("read_at", null)
  }

  const { data, error } = await query
  if (error) {
    console.error("[notifications] failed to fetch notifications:", error)
    return []
  }

  return ((data ?? []) as Array<NotificationRow & { profiles?: unknown }>)
    .map(mapNotificationRow)
    .filter((item): item is NotificationFeedItem => Boolean(item))
}

function groupDigestNotifications(rows: DigestNotificationRow[]): DigestBucket[] {
  const buckets = new Map<string, DigestBucket>()

  for (const row of rows) {
    if (!row.recipient) continue
    if (!row.recipient.notification_email_digest_enabled) continue
    if (!row.recipient.email) continue

    const bucket = buckets.get(row.recipient.id)
    if (bucket) {
      bucket.notifications.push(row)
      continue
    }

    buckets.set(row.recipient.id, {
      recipient: row.recipient,
      notifications: [row],
    })
  }

  return [...buckets.values()]
}

async function sendDigestEmail(params: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.NOTIFICATIONS_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    console.warn("[notifications] missing RESEND_API_KEY or NOTIFICATIONS_FROM_EMAIL; skipping email send")
    return false
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      html: params.html,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    console.error("[notifications] resend send failed:", response.status, body)
    return false
  }

  return true
}

export async function sendWeeklyNotificationDigests(
  db: SupabaseClient<Database>,
  options?: { now?: Date; windowDays?: number }
): Promise<{ recipientsProcessed: number; digestsSent: number }> {
  const now = options?.now ?? new Date()
  const windowDays = options?.windowDays ?? 7
  const startAt = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  const startIso = startAt.toISOString()
  const endIso = now.toISOString()

  const { data, error } = await db
    .from("notifications")
    .select(`
      id, recipient_id, actor_id, type, entity_type, entity_id, title, body, payload, read_at, created_at,
      recipient:profiles!notifications_recipient_id_fkey ( id, email, full_name, notification_email_digest_enabled ),
      actor:profiles!notifications_actor_id_fkey ( id, full_name, avatar_url, username )
    `)
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .is("read_at", null)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[notifications] failed to load digest notifications:", error)
    return { recipientsProcessed: 0, digestsSent: 0 }
  }

  const rows = ((data ?? []) as DigestNotificationRow[]).filter(
    (row) => Boolean(row.recipient) && Boolean(row.actor || row.actor_id)
  )
  const buckets = groupDigestNotifications(rows)

  let digestsSent = 0
  for (const bucket of buckets) {
    const digestCount = bucket.notifications.length
    const { data: existing, error: existingError } = await db
      .from("notification_email_digests")
      .select("id, sent_at")
      .eq("recipient_id", bucket.recipient.id)
      .eq("digest_start_at", startIso)
      .eq("digest_end_at", endIso)
      .maybeSingle()

    if (existingError) {
      console.error("[notifications] failed to check digest send log:", existingError)
      continue
    }
    if (existing?.sent_at) {
      continue
    }
    if (existing && !existing.sent_at) {
      continue
    }

    const insertResult = await db
      .from("notification_email_digests")
      .insert({
        recipient_id: bucket.recipient.id,
        digest_start_at: startIso,
        digest_end_at: endIso,
        notification_count: digestCount,
      })
      .select("id")
      .single()

    if (insertResult.error) {
      console.error("[notifications] failed to create digest send log:", insertResult.error)
      continue
    }

    const { subject, text, html } = buildDigestText(bucket, startAt, now)
    const sent = await sendDigestEmail({
      to: bucket.recipient.email,
      subject,
      text,
      html,
    })

    if (!sent) {
      continue
    }

    const { error: updateError } = await db
      .from("notification_email_digests")
      .update({ sent_at: new Date().toISOString(), notification_count: digestCount })
      .eq("id", insertResult.data.id)

    if (updateError) {
      console.error("[notifications] failed to finalize digest send log:", updateError)
      continue
    }

    digestsSent += 1
  }

  return { recipientsProcessed: buckets.length, digestsSent }
}

export async function createNotificationAndReturn(
  db: SupabaseClient<Database>,
  input: NotificationInsertInput
) {
  return createNotification(db, input)
}
