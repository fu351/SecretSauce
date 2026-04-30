/**
 * Analytics Event Type Definitions
 *
 * Type-safe event names and properties for analytics tracking.
 */

export type ABEventType = "exposure" | "click" | "conversion" | "signup" | "subscribe" | "custom"

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
  | "tutorial_back_step"
  | "tutorial_minimized"
  | "tutorial_restored"
  | "tutorial_element_not_found"
  | "tutorial_step_error_skipped"

  // Cooking mode
  | "cooking_mode_started"
  | "cooking_mode_completed"
  | "cooking_mode_exited"

  // Auth events
  | "user_signed_up"
  | "user_signed_in"

  // Subscription events
  | "subscription_checkout_started"
  | "subscription_purchased"
  | "subscription_activated"

  // Recipe creation
  | "recipe_created"
  | "recipe_imported"

  // Recipe editing
  | "recipe_edit_clicked"

  // Recipe social actions
  | "recipe_liked"
  | "recipe_unliked"
  | "recipe_reposted"
  | "recipe_unreposted"
  | "recipe_shared"
  | "recipe_added_to_planner"

  // General navigation
  | "page_view"
  | "view_mode_changed"
  | "feature_preferences_updated"
  | "product_event_recorded"
  | "media_asset_registered"
  | "verification_task_created"
  | "verification_task_confirmed"
  | "budget_goal_created"
  | "budget_goal_switched"
  | "budget_spend_logged"
  | "budget_surplus_allocated"

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
    steps_total: number
  }
  tutorial_step_completed: {
    step_index: number
  }
  tutorial_completed: {
    steps_completed: number
  }
  tutorial_skipped: {
    step_abandoned: number
  }
  tutorial_back_step: { from_step_index: number; to_step_index: number }
  tutorial_minimized: { step_index: number }
  tutorial_restored: { step_index: number }
  tutorial_element_not_found: { step_index: number; selector: string | null; page: string }
  tutorial_step_error_skipped: { step_index: number; selector: string | null }

  // Cooking mode events
  cooking_mode_started: { recipe_id: string; steps_total: number }
  cooking_mode_completed: { recipe_id: string; steps_total: number }
  cooking_mode_exited: { recipe_id: string; step_abandoned: number; steps_total: number }

  // Auth events
  user_signed_up: {
    method: "email"
    username: string
  }
  user_signed_in: {
    method: "email"
  }

  // Subscription events
  subscription_checkout_started: {
    item_count?: number
    total_amount?: number
  }
  subscription_purchased: {
    session_id?: string
  }
  subscription_activated: {
    supabase_user_id: string
    stripe_customer_id?: string
    subscription_id?: string
  }

  // Recipe creation events
  recipe_created: {
    recipe_id: string
    method: "manual" | "import"
  }
  recipe_imported: {
    source: "url" | "instagram" | "paragraph" | "image"
  }

  // Recipe editing
  recipe_edit_clicked: { recipe_id: string }

  // Recipe social action events
  recipe_liked: { recipe_id: string }
  recipe_unliked: { recipe_id: string }
  recipe_reposted: { recipe_id: string }
  recipe_unreposted: { recipe_id: string }
  recipe_shared: { recipe_id: string; method: "copy_link" }
  recipe_added_to_planner: { recipe_id: string }

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
  feature_preferences_updated: {
    changed_fields: string[]
  }
  product_event_recorded: {
    event_type: string
    duplicate: boolean
  }
  media_asset_registered: {
    purpose: "receipt" | "meal_verification" | "pantry_scan" | "social_post_derivative"
    retention_days?: number
  }
  verification_task_created: {
    feature_area: "budget" | "streaks" | "social" | "pantry" | "recipe" | "shopping"
    source_type: "manual" | "receipt" | "meal_photo" | "pantry_photo" | "recipe_try" | "system"
    status: "pending" | "auto_accepted" | "needs_confirmation"
  }
  verification_task_confirmed: {
    feature_area: "budget" | "streaks" | "social" | "pantry" | "recipe" | "shopping"
    decision: "confirm" | "reject"
  }
  budget_goal_created: {
    category: "travel" | "concert" | "gaming" | "dining" | "generic"
    target_cents: number
  }
  budget_goal_switched: {
    goal_id: string
    previous_goal_id?: string
  }
  budget_spend_logged: {
    source_type: "manual" | "receipt"
    amount_cents: number
    duplicate?: boolean
  }
  budget_surplus_allocated: {
    week_start_date: string
    duplicate?: boolean
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
  tutorial_back_step: "custom",
  tutorial_minimized: "custom",
  tutorial_restored: "custom",
  tutorial_element_not_found: "custom",
  tutorial_step_error_skipped: "custom",

  // Cooking mode → custom
  cooking_mode_started: "custom",
  cooking_mode_completed: "custom",
  cooking_mode_exited: "custom",

  // Auth events → signup/custom
  user_signed_up: "signup",
  user_signed_in: "custom",

  // Subscription events → conversion
  subscription_checkout_started: "conversion",
  subscription_purchased: "conversion",
  subscription_activated: "conversion",

  // Recipe creation events → custom
  recipe_created: "custom",
  recipe_imported: "custom",

  // Recipe editing → click
  recipe_edit_clicked: "click",

  // Recipe social actions → click/custom
  recipe_liked: "click",
  recipe_unliked: "click",
  recipe_reposted: "click",
  recipe_unreposted: "click",
  recipe_shared: "click",
  recipe_added_to_planner: "click",

  // General events → custom
  page_view: "custom",
  view_mode_changed: "custom",
  feature_preferences_updated: "custom",
  product_event_recorded: "custom",
  media_asset_registered: "custom",
  verification_task_created: "custom",
  verification_task_confirmed: "custom",
  budget_goal_created: "custom",
  budget_goal_switched: "custom",
  budget_spend_logged: "custom",
  budget_surplus_allocated: "custom",
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
