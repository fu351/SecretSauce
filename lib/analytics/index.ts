/**
 * Analytics Library - Public API
 *
 * Centralized exports for the analytics system
 */

// Core client
export { AnalyticsClient } from "./analytics-client"

// Session management
export { SessionManager } from "./session-manager"

// Event queue
export { EventQueue } from "./event-queue"
export type { QueuedEvent } from "./event-queue"

// Type definitions
export type {
  ABEventType,
  AnalyticsEventName,
  EventProperties,
  AnalyticsEvent,
} from "./event-types"
export { EVENT_TYPE_MAPPING } from "./event-types"
