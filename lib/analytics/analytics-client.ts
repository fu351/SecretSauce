/**
 * Analytics Client
 *
 * Core tracking engine that orchestrates all analytics functionality
 * - Maps event names to event types
 * - Enriches events with context (session, page, user)
 * - Handles queuing and batching
 */

import { SessionManager } from "./session-manager"
import { EventQueue, type QueuedEvent } from "./event-queue"
import { EVENT_TYPE_MAPPING, type AnalyticsEventName, type EventProperties, type ABEventType } from "./event-types"
import { AnalyticsDB } from "@/lib/database/analytics-db"

type SubscriptionTier = "free" | "premium"

interface TrackOptions<T extends AnalyticsEventName> {
  properties?: EventProperties[T]
  experimentId?: string
  variantId?: string
  eventValue?: number
  immediate?: boolean // Skip queue, send immediately
}

export class AnalyticsClient {
  private static initialized = false
  private static isDevelopment = process.env.NODE_ENV === "development"
  private static currentUserId?: string
  private static currentUserTier?: SubscriptionTier

  /**
   * Initialize the analytics client
   * Sets up event queue and batch flushing
   */
  static initialize(): void {
    if (this.initialized) return

    EventQueue.initialize(async (events) => {
      await this.sendBatch(events)
    })

    this.initialized = true

    if (this.isDevelopment) {
      console.log("[Analytics] Client initialized in development mode")
    }
  }

  /**
   * Track an analytics event
   *
   * @param eventName - Type-safe event name
   * @param options - Event properties and configuration
   */
  static async track<T extends AnalyticsEventName>(
    eventName: T,
    options: TrackOptions<T> = {}
  ): Promise<void> {
    // Ensure initialized
    if (!this.initialized) {
      this.initialize()
    }

    // Skip tracking in development if desired
    if (this.isDevelopment) {
      console.log("[Analytics] Track event:", eventName, options.properties)
      // Still track in dev for testing - remove this return to skip
      // return
    }

    try {
      // Get session metadata
      const sessionMetadata = await SessionManager.getSessionMetadata()

      // Get event type from mapping
      const eventType = this.getEventType(eventName)

      // Get page context
      const pageContext = this.getPageContext()

      // Create queued event
      const event: QueuedEvent = {
        eventType,
        eventName,
        experimentId: options.experimentId,
        variantId: options.variantId,
        properties: {
          ...options.properties,
          ...pageContext,
          // Auto-include user context
          user_tier: this.currentUserTier,
          is_authenticated: sessionMetadata.isAuthenticated,
        },
        timestamp: Date.now(),
        userId: sessionMetadata.userId || this.currentUserId,
        sessionId: sessionMetadata.sessionId,
        eventValue: options.eventValue,
        pageUrl: pageContext.page_url,
        referrer: pageContext.referrer,
      }

      // Send immediately or queue
      if (options.immediate) {
        await this.sendEvent(event)
      } else {
        EventQueue.enqueue(event)
      }
    } catch (err) {
      console.error("[Analytics] Error tracking event:", err)
    }
  }

  /**
   * Track a page view
   * Convenience method for common page view tracking
   */
  static trackPageView(path: string, title?: string): void {
    this.track("page_view", {
      properties: {
        path,
        title: title || (typeof document !== "undefined" ? document.title : undefined),
        referrer: typeof document !== "undefined" ? document.referrer : undefined,
      },
    })
  }

  /**
   * Identify a user
   * Called when user logs in or user context changes
   */
  static identify(userId: string, tier: SubscriptionTier): void {
    this.currentUserId = userId
    this.currentUserTier = tier

    // Clear anonymous session when user logs in
    SessionManager.clearAnonymousSession()

    if (this.isDevelopment) {
      console.log("[Analytics] User identified:", userId, tier)
    }
  }

  /**
   * Reset analytics
   * Called when user logs out
   */
  static reset(): void {
    // Flush any pending events
    EventQueue.flush()

    // Clear user context
    this.currentUserId = undefined
    this.currentUserTier = undefined

    if (this.isDevelopment) {
      console.log("[Analytics] Analytics reset")
    }
  }

  /**
   * Get event type from event name
   */
  private static getEventType(eventName: AnalyticsEventName): ABEventType {
    return EVENT_TYPE_MAPPING[eventName] || "custom"
  }

  /**
   * Get current page context
   */
  private static getPageContext(): {
    page_url?: string
    referrer?: string
  } {
    if (typeof window === "undefined") {
      return {}
    }

    return {
      page_url: window.location.pathname,
      referrer: document.referrer || undefined,
    }
  }

  /**
   * Send a single event immediately
   */
  private static async sendEvent(event: QueuedEvent): Promise<void> {
    await AnalyticsDB.trackEvent({
      experimentId: event.experimentId,
      variantId: event.variantId,
      eventType: event.eventType,
      eventName: event.eventName,
      userId: event.userId,
      sessionId: event.sessionId,
      eventValue: event.eventValue,
      pageUrl: event.pageUrl,
      referrer: event.referrer,
      properties: event.properties,
    })
  }

  /**
   * Send a batch of events
   */
  private static async sendBatch(events: QueuedEvent[]): Promise<void> {
    if (events.length === 0) return

    const eventParams = events.map((event) => ({
      experimentId: event.experimentId,
      variantId: event.variantId,
      eventType: event.eventType,
      eventName: event.eventName,
      userId: event.userId,
      sessionId: event.sessionId,
      eventValue: event.eventValue,
      pageUrl: event.pageUrl,
      referrer: event.referrer,
      properties: event.properties,
    }))

    await AnalyticsDB.trackEventBatch(eventParams)
  }

  /**
   * Flush the event queue manually
   * Useful before page unload or for testing
   */
  static flush(): void {
    EventQueue.flush()
  }

  /**
   * Get queue status (for debugging)
   */
  static getQueueStatus(): {
    queueSize: number
    failedEvents: number
  } {
    return {
      queueSize: EventQueue.getQueueSize(),
      failedEvents: EventQueue.getFailedEventsCount(),
    }
  }
}
