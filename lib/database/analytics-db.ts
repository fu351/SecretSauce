/**
 * Analytics Database Layer
 *
 * Wrapper around ab_testing.track_event() RPC function
 * Handles both experiment-based and general analytics tracking
 */

import { supabase } from "./supabase"
import type { Database } from "./supabase"
import type { ABEventType } from "@/lib/analytics/event-types"

// Reserved UUID for general analytics (not part of an A/B test)
const NULL_EXPERIMENT_ID = "00000000-0000-0000-0000-000000000000"
const NULL_VARIANT_ID = "00000000-0000-0000-0000-000000000000"

interface TrackEventParams {
  experimentId?: string
  variantId?: string
  eventType: ABEventType
  eventName: string
  userId?: string
  sessionId?: string
  deviceId?: string
  eventValue?: number
  pageUrl?: string
  referrer?: string
  properties?: Record<string, any>
}

interface TrackEventResult {
  success: boolean
  error?: string
  eventId?: string
}

export class AnalyticsDB {
  /**
   * Track a single event using the ab_testing.track_event RPC function
   *
   * For general analytics (not part of an A/B test):
   * - Use NULL_EXPERIMENT_ID and NULL_VARIANT_ID
   *
   * For A/B test tracking:
   * - Provide actual experimentId and variantId
   */
  static async trackEvent(params: TrackEventParams): Promise<TrackEventResult> {
    try {
      const { data, error } = await supabase.rpc("ab_testing.track_event", {
        p_experiment_id: params.experimentId || NULL_EXPERIMENT_ID,
        p_variant_id: params.variantId || NULL_VARIANT_ID,
        p_event_type: params.eventType,
        p_event_name: params.eventName,
        p_user_id: params.userId || null,
        p_session_id: params.sessionId || null,
        p_device_id: params.deviceId || null,
        p_event_value: params.eventValue || null,
        p_page_url: params.pageUrl || null,
        p_referrer: params.referrer || null,
        p_properties: params.properties || {},
      })

      if (error) {
        console.error("[Analytics] Track event error:", error)
        return { success: false, error: error.message }
      }

      return { success: true, eventId: data as string }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error("[Analytics] Track event exception:", err)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Track multiple events in a batch
   * Sends all events in parallel for better performance
   */
  static async trackEventBatch(events: TrackEventParams[]): Promise<void> {
    if (events.length === 0) return

    try {
      // Send all events in parallel
      const results = await Promise.allSettled(
        events.map((event) => this.trackEvent(event))
      )

      // Log any failures
      const failures = results.filter(
        (result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.success)
      )

      if (failures.length > 0) {
        console.warn(`[Analytics] ${failures.length}/${events.length} events failed to track`)
      } else {
        console.log(`[Analytics] Successfully tracked ${events.length} events`)
      }
    } catch (err) {
      console.error("[Analytics] Batch tracking exception:", err)
      throw err
    }
  }

  /**
   * Check if analytics tracking is available
   * Useful for feature detection
   */
  static async isAvailable(): Promise<boolean> {
    try {
      const { error } = await supabase.rpc("ab_testing.track_event", {
        p_experiment_id: NULL_EXPERIMENT_ID,
        p_variant_id: NULL_VARIANT_ID,
        p_event_type: "custom",
        p_event_name: "_health_check",
        p_session_id: "health-check",
      })

      return !error
    } catch {
      return false
    }
  }
}
