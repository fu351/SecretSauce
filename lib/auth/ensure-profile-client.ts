"use client"

const ENSURE_PROFILE_TIMEOUT_MS = 4500

export async function ensureProfileWithTimeout(payload?: Record<string, unknown>) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => {
    controller.abort(new Error("ensure-profile timeout"))
  }, ENSURE_PROFILE_TIMEOUT_MS)

  try {
    const requestInit: RequestInit = {
      method: "POST",
      signal: controller.signal,
    }

    if (payload) {
      requestInit.headers = { "Content-Type": "application/json" }
      requestInit.body = JSON.stringify(payload)
    }

    const response = await fetch("/api/auth/ensure-profile", requestInit)

    if (!response.ok) {
      const parsed = await response.json().catch(() => ({}))
      throw new Error(parsed?.error ?? parsed?.detail ?? "Failed to create profile")
    }

    return await response.json().catch(() => ({}))
  } finally {
    window.clearTimeout(timeoutId)
  }
}
