/**
 * Analytics Library - Public API
 *
 * Type definitions for analytics events.
 * Runtime tracking is handled via PostHog (posthog-js/react).
 */

export type {
  ABEventType,
  AnalyticsEventName,
  EventProperties,
  AnalyticsEvent,
} from "./event-types"
export { EVENT_TYPE_MAPPING } from "./event-types"
