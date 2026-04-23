"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { disablePushNotifications, enablePushNotifications, isPushConfigured, isWebPushSupported } from "@/lib/notifications/push-client"
import { isPWAInstalled } from "@/lib/utils"

export function PushNotificationBootstrap() {
  const { profile } = useAuth()
  const lastSyncedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!profile || !isWebPushSupported() || !isPWAInstalled()) return

    if (!isPushConfigured()) {
      if (profile.notification_push_enabled) {
        console.warn("[push] push notifications are enabled in profile but VAPID is not configured")
      }
      return
    }

    const enabled = Boolean(profile.notification_push_enabled)
    const syncKey = `${profile.id}:${enabled ? "enabled" : "disabled"}`
    if (lastSyncedKeyRef.current === syncKey) return
    lastSyncedKeyRef.current = syncKey

    if (!enabled) {
      void disablePushNotifications().catch((error) => {
        console.warn("[push] failed to disable push notifications:", error)
      })
      return
    }

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      void enablePushNotifications().catch((error) => {
        console.warn("[push] failed to bootstrap push notifications:", error)
      })
    }
  }, [profile?.id, profile?.notification_push_enabled])

  return null
}
