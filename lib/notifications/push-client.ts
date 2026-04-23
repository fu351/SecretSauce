"use client"

import { isPWAInstalled } from "@/lib/utils"

export type PushSubscriptionJSON = {
  endpoint: string
  expirationTime: number | null
  keys: {
    auth: string
    p256dh: string
  }
}

export function isWebPushSupported(): boolean {
  if (typeof window === "undefined") return false
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser")
  }

  return navigator.serviceWorker.register("/sw.js", { scope: "/" })
}

function getVapidPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY")
  }
  return key
}

async function syncSubscription(
  method: "POST" | "DELETE",
  subscription: PushSubscriptionJSON,
): Promise<void> {
  const body =
    method === "DELETE"
      ? JSON.stringify({ endpoint: subscription.endpoint })
      : JSON.stringify({ subscription })

  const response = await fetch("/api/push-subscriptions", {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.error ?? "Failed to sync push subscription")
  }
}

export async function enablePushNotifications(): Promise<PushSubscriptionJSON> {
  if (!isWebPushSupported()) {
    throw new Error("Push notifications are not supported in this browser")
  }

  if (!isPWAInstalled()) {
    throw new Error("Install the app as a web app before enabling push notifications")
  }

  if (Notification.permission === "denied") {
    throw new Error("Push notifications are blocked in browser settings")
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      throw new Error("Push notification permission was not granted")
    }
  }

  const registration = await getServiceWorkerRegistration()
  const existing = await registration.pushManager.getSubscription()
  if (existing) {
    const existingJson = existing.toJSON() as PushSubscriptionJSON
    await syncSubscription("POST", existingJson)
    return existingJson
  }

  const publicKey = getVapidPublicKey()
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  const subscriptionJson = subscription.toJSON() as PushSubscriptionJSON
  await syncSubscription("POST", subscriptionJson)
  return subscriptionJson
}

export async function disablePushNotifications(): Promise<void> {
  if (!isWebPushSupported()) return

  const registration = await navigator.serviceWorker.getRegistration("/")
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  await syncSubscription("DELETE", subscription.toJSON() as PushSubscriptionJSON)
  await subscription.unsubscribe()
}
