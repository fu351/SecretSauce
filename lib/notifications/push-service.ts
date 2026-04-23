import webpush from "web-push"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database/supabase"

type PushSubscriptionRow = Database["public"]["Tables"]["push_subscriptions"]["Row"]

type WebPushPayload = {
  title: string
  body: string
  url: string
  tag?: string
  icon?: string
  badge?: string
}

let vapidConfigured = false

function configureWebPush(): boolean {
  if (vapidConfigured) return true

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? "mailto:notifications@secretsauce.test"

  if (!publicKey || !privateKey) {
    console.warn("[push] Missing VAPID keys; skipping push delivery")
    return false
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

async function deleteBrokenSubscription(db: SupabaseClient<Database>, id: string) {
  const { error } = await db.from("push_subscriptions").delete().eq("id", id)
  if (error) {
    console.error("[push] failed to delete broken subscription:", error)
  }
}

export async function sendPushNotificationToRecipient(
  db: SupabaseClient<Database>,
  recipientId: string,
  payload: WebPushPayload
): Promise<number> {
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id, notification_push_enabled")
    .eq("id", recipientId)
    .maybeSingle()

  if (profileError) {
    console.error("[push] failed to load profile:", profileError)
    return 0
  }

  if (!profile?.notification_push_enabled) {
    return 0
  }

  const { data: subscriptions, error } = await db
    .from("push_subscriptions")
    .select("id, endpoint, subscription, user_agent")
    .eq("recipient_id", recipientId)

  if (error) {
    console.error("[push] failed to load subscriptions:", error)
    return 0
  }

  if (!subscriptions?.length || !configureWebPush()) {
    return 0
  }

  let sent = 0
  for (const row of subscriptions as PushSubscriptionRow[]) {
    try {
      await webpush.sendNotification(row.subscription as any, JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag,
        icon: payload.icon ?? "/icon",
        badge: payload.badge ?? "/icon",
      }))
      sent += 1
    } catch (error) {
      const candidate = error as { statusCode?: number }
      if (candidate?.statusCode === 410 || candidate?.statusCode === 404) {
        await deleteBrokenSubscription(db, row.id)
      } else {
        console.error("[push] failed to send push notification:", error)
      }
    }
  }

  return sent
}
