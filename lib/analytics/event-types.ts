/**
 * Analytics Event Type Definitions
 *
 * Type-safe event names and properties for analytics tracking.
 * Maps to the database ab_event_type enum.
 */

import type { Database } from "@/lib/database/supabase"

// Database event type from ab_testing schema
export type ABEventType = Database["public"]["Enums"]["ab_event_type"]

/**
 * Application-specific event names
 * Organized by feature area for easy navigation
 */
export type AnalyticsEventName =
  // Recipe engagement (HIGH PRIORITY)
  | "recipe_viewed"
  | "recipe_added_to_favorites"
  | "recipe_removed_from_favorites"
  | "recipe_added_to_shopping_list"
  | "recipe_filtered"
  | "recipe_searched"
  | "recipe_sort_changed"

  // Shopping & pricing (HIGH PRIORITY)
  | "shopping_list_price_compared"
  | "shopping_checkout_initiated"
  | "delivery_order_created"
  | "store_comparison_viewed"
  | "shopping_item_replaced"

  // Meal planning (HIGH PRIORITY)
  | "meal_planner_accessed"
  | "meal_added_to_plan"
  | "meal_removed_from_plan"
  | "meal_plan_generated"

  // Pantry (MEDIUM PRIORITY)
  | "pantry_item_added"
  | "pantry_item_removed"
  | "pantry_item_updated"

  // Tier gates (AUTO-TRACKED)
  | "tier_gate_shown"
  | "auth_gate_shown"
  | "upgrade_button_clicked"
  | "signin_button_clicked"

  // Tutorial (MEDIUM PRIORITY)
  | "tutorial_started"
  | "tutorial_step_completed"
  | "tutorial_completed"
  | "tutorial_skipped"

  // General navigation
  | "page_view"
  | "view_mode_changed"

/**
 * Type-safe properties for each event
 * Enforces correct property structure at compile time
 */
export interface EventProperties {
  // Recipe events
  recipe_viewed: {
    recipe_id: string
    recipe_title?: string
    source?: "search" | "recommendation" | "favorites" | "direct" | "meal-plan"
  }
  recipe_added_to_favorites: {
    recipe_id: string
  }
  recipe_removed_from_favorites: {
    recipe_id: string
  }
  recipe_added_to_shopping_list: {
    recipe_id: string
    servings?: number
  }
  recipe_filtered: {
    filters: {
      difficulty?: string
      cuisine?: string
      protein?: string
      dietary?: string[]
    }
  }
  recipe_searched: {
    query: string
    results_count?: number
  }
  recipe_sort_changed: {
    sort_by: string
  }

  // Shopping events
  shopping_list_price_compared: {
    stores_compared: string[]
    total_items: number
  }
  shopping_checkout_initiated: {
    total_items: number
    store?: string
  }
  delivery_order_created: {
    order_id: string
    total_items: number
    store: string
  }
  store_comparison_viewed: {
    stores: string[]
    ingredient_id?: string
  }
  shopping_item_replaced: {
    original_product_id: string
    new_product_id: string
    store: string
  }

  // Meal planning events
  meal_planner_accessed: {
    week_index?: number
  }
  meal_added_to_plan: {
    recipe_id: string
    date: string
    meal_type: "breakfast" | "lunch" | "dinner"
  }
  meal_removed_from_plan: {
    meal_id: string
    recipe_id?: string
  }
  meal_plan_generated: {
    week_index: number
    recipe_count: number
  }

  // Pantry events
  pantry_item_added: {
    ingredient_id?: string
    ingredient_name: string
  }
  pantry_item_removed: {
    item_id: string
  }
  pantry_item_updated: {
    item_id: string
    field: string
  }

  // Tier gate events
  tier_gate_shown: {
    required_tier: "free" | "premium"
    page_url: string
    feature?: string
  }
  auth_gate_shown: {
    page_url: string
    intended_action?: string
  }
  upgrade_button_clicked: {
    source: "tier_gate" | "auth_gate" | "pricing_page" | "other"
    required_tier?: "free" | "premium"
  }
  signin_button_clicked: {
    source: "auth_gate" | "header" | "pricing_page" | "other"
  }

  // Tutorial events
  tutorial_started: {
    path: "cooking" | "budgeting" | "health"
  }
  tutorial_step_completed: {
    path: "cooking" | "budgeting" | "health"
    step_index: number
  }
  tutorial_completed: {
    path: "cooking" | "budgeting" | "health"
    steps_completed: number
  }
  tutorial_skipped: {
    path: "cooking" | "budgeting" | "health"
    step_abandoned: number
  }

  // General events
  page_view: {
    path: string
    referrer?: string
    title?: string
  }
  view_mode_changed: {
    mode: "grid" | "list"
    page: string
  }
}

/**
 * Map event names to database event types
 * This determines how events are categorized in the database
 */
export const EVENT_TYPE_MAPPING: Record<AnalyticsEventName, ABEventType> = {
  // Recipe events → custom
  recipe_viewed: "custom",
  recipe_added_to_favorites: "custom",
  recipe_removed_from_favorites: "custom",
  recipe_added_to_shopping_list: "custom",
  recipe_filtered: "custom",
  recipe_searched: "custom",
  recipe_sort_changed: "custom",

  // Shopping events → conversion (trackable for revenue)
  shopping_list_price_compared: "conversion",
  shopping_checkout_initiated: "conversion",
  delivery_order_created: "conversion",
  store_comparison_viewed: "custom",
  shopping_item_replaced: "custom",

  // Meal planning events → custom
  meal_planner_accessed: "custom",
  meal_added_to_plan: "custom",
  meal_removed_from_plan: "custom",
  meal_plan_generated: "custom",

  // Pantry events → custom
  pantry_item_added: "custom",
  pantry_item_removed: "custom",
  pantry_item_updated: "custom",

  // Tier gate events
  tier_gate_shown: "exposure",
  auth_gate_shown: "exposure",
  upgrade_button_clicked: "click",
  signin_button_clicked: "click",

  // Tutorial events → custom
  tutorial_started: "custom",
  tutorial_step_completed: "custom",
  tutorial_completed: "custom",
  tutorial_skipped: "custom",

  // General events → custom
  page_view: "custom",
  view_mode_changed: "custom",
}

/**
 * Type-safe event payload
 */
export type AnalyticsEvent<T extends AnalyticsEventName = AnalyticsEventName> = {
  eventName: T
  properties?: EventProperties[T]
  eventType?: ABEventType
  experimentId?: string
  variantId?: string
  eventValue?: number
}
