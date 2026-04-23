"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { disablePushNotifications, enablePushNotifications, isWebPushSupported } from "@/lib/notifications/push-client"
import { isPWAInstalled } from "@/lib/utils"

export function PushNotificationBootstrap() {
  const { profile } = useAuth()
  const lastSyncedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!profile || !isWebPushSupported() || !isPWAInstalled()) return

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
