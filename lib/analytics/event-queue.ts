/**
 * Event Queue for Analytics
 *
 * Batches events to reduce database calls by ~80%
 * - Flushes every 5 seconds OR when 10 events are queued
 * - Immediate flush on page unload
 * - Failed events retry once, then stored in localStorage
 */

import type { ABEventType } from "./event-types"

const BATCH_SIZE = 10
const FLUSH_INTERVAL_MS = 5000 // 5 seconds
const FAILED_EVENTS_KEY = "analytics_failed_events_v1"
const MAX_FAILED_EVENTS = 100

export interface QueuedEvent {
  eventType: ABEventType
  eventName: string
  experimentId?: string
  variantId?: string
  properties?: Record<string, any>
  timestamp: number
  userId?: string
  sessionId: string
  eventValue?: number
  pageUrl?: string
  referrer?: string
}

type FlushCallback = (events: QueuedEvent[]) => Promise<void>

export class EventQueue {
  private static queue: QueuedEvent[] = []
  private static flushTimer: ReturnType<typeof setTimeout> | null = null
  private static flushCallback: FlushCallback | null = null
  private static isFlushing = false

  /**
   * Initialize the queue with a flush callback
   */
  static initialize(flushCallback: FlushCallback): void {
    this.flushCallback = flushCallback

    // Set up page unload handler
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.flush()
      })

      // Retry failed events from previous session
      this.retryFailedEvents()
    }
  }

  /**
   * Add an event to the queue
   */
  static enqueue(event: QueuedEvent): void {
    this.queue.push(event)

    // Auto-flush if batch size reached
    if (this.queue.length >= BATCH_SIZE) {
      this.flush()
    } else {
      // Schedule auto-flush
      this.scheduleFlush()
    }
  }

  /**
   * Schedule an auto-flush after interval
   */
  private static scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }

    this.flushTimer = setTimeout(() => {
      this.flush()
    }, FLUSH_INTERVAL_MS)
  }

  /**
   * Immediately flush all queued events
   */
  static flush(): void {
    if (this.isFlushing || this.queue.length === 0 || !this.flushCallback) {
      return
    }

    this.isFlushing = true

    // Clear the timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    // Get current batch and clear queue
    const batch = [...this.queue]
    this.queue = []

    // Send batch
    this.sendBatch(batch)
      .catch((err) => {
        console.error("[Analytics] Flush error:", err)
      })
      .finally(() => {
        this.isFlushing = false
      })
  }

  /**
   * Send a batch of events
   */
  private static async sendBatch(events: QueuedEvent[]): Promise<void> {
    if (!this.flushCallback) {
      console.warn("[Analytics] No flush callback set")
      return
    }

    try {
      await this.flushCallback(events)
    } catch (err) {
      console.error("[Analytics] Failed to send batch:", err)

      // Store failed events for retry
      this.storeFailedEvents(events)
    }
  }

  /**
   * Store failed events in localStorage for retry
   */
  private static storeFailedEvents(events: QueuedEvent[]): void {
    if (typeof window === "undefined") return

    try {
      const existing = this.getFailedEvents()
      const combined = [...existing, ...events]

      // Keep only last MAX_FAILED_EVENTS
      const trimmed = combined.slice(-MAX_FAILED_EVENTS)

      localStorage.setItem(FAILED_EVENTS_KEY, JSON.stringify(trimmed))
    } catch (err) {
      console.error("[Analytics] Error storing failed events:", err)
    }
  }

  /**
   * Get failed events from localStorage
   */
  private static getFailedEvents(): QueuedEvent[] {
    if (typeof window === "undefined") return []

    try {
      const stored = localStorage.getItem(FAILED_EVENTS_KEY)
      if (!stored) return []

      return JSON.parse(stored) as QueuedEvent[]
    } catch (err) {
      console.error("[Analytics] Error reading failed events:", err)
      return []
    }
  }

  /**
   * Retry failed events from previous session
   */
  private static retryFailedEvents(): void {
    const failed = this.getFailedEvents()

    if (failed.length === 0) return

    console.log(`[Analytics] Retrying ${failed.length} failed events`)

    // Send failed events
    this.sendBatch(failed)
      .then(() => {
        // Clear failed events on success
        if (typeof window !== "undefined") {
          localStorage.removeItem(FAILED_EVENTS_KEY)
        }
      })
      .catch((err) => {
        console.error("[Analytics] Failed to retry events:", err)
      })
  }

  /**
   * Get current queue size (for debugging)
   */
  static getQueueSize(): number {
    return this.queue.length
  }

  /**
   * Get number of failed events (for debugging)
   */
  static getFailedEventsCount(): number {
    return this.getFailedEvents().length
  }

  /**
   * Clear all queued and failed events (for testing)
   */
  static clear(): void {
    this.queue = []
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(FAILED_EVENTS_KEY)
    }
  }
}
