type CaptureParams = {
  distinctId: string
  event: string
  properties?: Record<string, unknown>
}

/**
 * Minimal server-side PostHog capture using the REST API directly.
 * Used in API routes and webhooks where posthog-js is not available.
 */
export function getPostHogClient() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

  return {
    capture({ distinctId, event, properties }: CaptureParams) {
      if (!token || !host) return
      // Fire-and-forget; webhook handlers must not block on analytics
      fetch(`${host}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: token,
          distinct_id: distinctId,
          event,
          properties: { ...properties, $lib: "posthog-server-fetch" },
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {
        // Swallow errors so analytics never breaks webhook processing
      })
    },
  }
}
