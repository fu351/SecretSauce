# Analytics & User Behavior Tracking Guide

## Agent Metadata

- `Doc Kind`: `guide`
- `Canonicality`: `implementation-guide`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `lib/analytics/`, `hooks/use-analytics.ts`, `contexts/analytics-context.tsx`, `lib/database/analytics-db.ts`
- `Update Trigger`: Event schema, batching behavior, or analytics RPC contracts change.

## Agent Use

- `Read this when`: adding analytics events, debugging event delivery, or querying tracked behavior.
- `Stop reading when`: experimentation-specific behavior is the core task.
- `Escalate to`: `docs/ab-testing-guide.md`, `docs/database-guide.md`.


> Canonical tier model: only `free` and `premium` are valid subscription tiers.

## Overview

The analytics system provides comprehensive user behavior tracking across the application. Built on the existing `ab_testing` database schema, it automatically tracks tier gate interactions, page views, and custom events to help understand user engagement and popular features.

**Key Features**:
- 🎯 **Auto-tracking** - Tier gates and page views tracked automatically
- 📊 **Type-safe events** - Full TypeScript support with autocomplete
- ⚡ **Performance optimized** - Event batching reduces DB calls by ~80%
- 🔐 **Privacy-first** - No PII tracking, uses Supabase auth sessions
- 🎨 **Easy to use** - Simple `useAnalytics()` hook for components

---

## Quick Start

### 1. Track an Event in a Component

```typescript
'use client'

import { useAnalytics } from '@/hooks/use-analytics'

export function RecipeCard({ recipe }) {
  const { trackEvent } = useAnalytics()

  const handleFavorite = () => {
    trackEvent('recipe_added_to_favorites', {
      recipe_id: recipe.id
    })
    // ... rest of your logic
  }

  return (
    <button onClick={handleFavorite}>
      ♥ Favorite
    </button>
  )
}
```

### 2. View Analytics Data

```sql
-- See recent events
SELECT
  event_name,
  properties,
  page_url,
  user_tier,
  created_at
FROM ab_testing.events
ORDER BY created_at DESC
LIMIT 20;

-- Most popular features
SELECT
  event_name,
  COUNT(*) as total_events,
  COUNT(DISTINCT user_id) as unique_users
FROM ab_testing.events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY event_name
ORDER BY total_events DESC;
```

---

## Architecture

### System Flow

```
Component → useAnalytics() → AnalyticsClient → EventQueue → AnalyticsDB → ab_testing.track_event()
```

**Components**:
1. **useAnalytics()** - React hook for components
2. **AnalyticsClient** - Core tracking engine
3. **EventQueue** - Batches events (5 sec or 10 events)
4. **AnalyticsDB** - Supabase RPC wrapper
5. **ab_testing.track_event()** - Database function

### Session Management

- **Authenticated users**: Uses `user.id` from Supabase auth
- **Anonymous users**: UUID stored in localStorage (`analytics_anon_session_v1`)
- Leverages existing Supabase session infrastructure (no duplicate logic)

### Event Batching

Events are queued in memory and sent in batches:
- **Trigger**: Every 5 seconds OR when 10 events queued
- **Benefit**: Reduces database calls by ~80%
- **Reliability**: Failed events stored in localStorage for retry

---

## Available Events

### High Priority Events

#### Recipe Engagement
- `recipe_viewed` - When user views a recipe detail page
- `recipe_added_to_favorites` - When user favorites a recipe
- `recipe_removed_from_favorites` - When user unfavorites
- `recipe_added_to_shopping_list` - When recipe added to cart

#### Shopping & Pricing
- `shopping_list_price_compared` - When user compares prices
- `shopping_checkout_initiated` - When user starts checkout
- `delivery_order_created` - When order is created
- `store_comparison_viewed` - When user views store comparison

#### Meal Planning
- `meal_planner_accessed` - When user opens meal planner
- `meal_added_to_plan` - When recipe added to meal plan
- `meal_removed_from_plan` - When recipe removed from plan
- `meal_plan_generated` - When AI generates meal plan

#### Tier Gates (Auto-Tracked)
- `tier_gate_shown` - When paywall is displayed
- `auth_gate_shown` - When sign-in gate is shown
- `upgrade_button_clicked` - When upgrade button clicked
- `signin_button_clicked` - When sign-in button clicked

#### General
- `page_view` - Automatic on route change
- `tutorial_completed` - When tutorial is finished

### Medium Priority Events

- `recipe_filtered` - Recipe filter applied
- `recipe_searched` - Recipe search performed
- `pantry_item_added` - Item added to pantry
- `tutorial_started` - Tutorial initiated
- `tutorial_step_completed` - Tutorial step finished

**Full Event List**: See `/lib/analytics/event-types.ts` for complete definitions

---

## Usage Examples

### Track Recipe View

```typescript
'use client'

import { useAnalytics } from '@/hooks/use-analytics'
import { useEffect } from 'react'

export function RecipeDetailPage({ recipe }) {
  const { trackEvent } = useAnalytics()

  useEffect(() => {
    if (recipe) {
      trackEvent('recipe_viewed', {
        recipe_id: recipe.id,
        recipe_title: recipe.title,
        source: 'direct' // or 'search', 'recommendation', 'favorites'
      })
    }
  }, [recipe, trackEvent])

  return <div>...</div>
}
```

### Track Shopping Actions

```typescript
const { trackEvent } = useAnalytics()

const handlePriceComparison = () => {
  trackEvent('shopping_list_price_compared', {
    stores_compared: ['aldi', 'kroger', 'safeway'],
    total_items: items.length
  })
}

const handleCheckout = () => {
  trackEvent('shopping_checkout_initiated', {
    total_items: items.length
  }, {
    eventValue: calculateTotal() // Track monetary value
  })
}
```

### Track Meal Planning

```typescript
const { trackEvent } = useAnalytics()

const addMealToPlan = (recipeId: string, date: string, mealType: string) => {
  // Your logic here...

  trackEvent('meal_added_to_plan', {
    recipe_id: recipeId,
    date: date,
    meal_type: mealType as 'breakfast' | 'lunch' | 'dinner'
  })
}
```

### Track with A/B Test

```typescript
const { trackEvent } = useAnalytics()

trackEvent('recipe_viewed', {
  recipe_id: recipe.id
}, {
  experimentId: 'exp-123',
  variantId: 'variant-456'
})
```

---

## Auto-Tracked Events

These events are tracked automatically without any code changes:

### Page Views
Every route change is automatically tracked with:
- Page path
- Page title
- Referrer URL

### Tier Gate Interactions
When users hit paywalls or auth gates:
- **tier_gate_shown** - Paywall displayed
- **upgrade_button_clicked** - Upgrade button clicked
- **auth_gate_shown** - Sign-in gate shown
- **signin_button_clicked** - Sign-in button clicked

All tracked with page context automatically included.

---

## Analytics Hook API

### useAnalytics()

```typescript
const {
  trackEvent,      // Track custom events
  sessionId,       // Current session ID
  userId,          // Current user ID (if authenticated)
  userTier,        // Current tier ('free' | 'premium')
  isAuthenticated  // Whether user is logged in
} = useAnalytics()
```

### trackEvent()

```typescript
trackEvent<T extends AnalyticsEventName>(
  eventName: T,
  properties?: EventProperties[T],
  options?: {
    experimentId?: string
    variantId?: string
    eventValue?: number    // For revenue tracking
    immediate?: boolean    // Skip queue, send now
  }
): void
```

**Type Safety**: Properties are validated at compile-time based on event name.

---

## Event Properties Reference

### Recipe Events

```typescript
recipe_viewed: {
  recipe_id: string
  recipe_title?: string
  source?: 'search' | 'recommendation' | 'favorites' | 'direct' | 'meal-plan'
}

recipe_added_to_favorites: {
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
```

### Shopping Events

```typescript
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
```

### Meal Planning Events

```typescript
meal_planner_accessed: {
  week_index?: number
}

meal_added_to_plan: {
  recipe_id: string
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner'
}

meal_plan_generated: {
  week_index: number
  recipe_count: number
}
```

### Tier Gate Events

```typescript
tier_gate_shown: {
  required_tier: 'free' | 'premium'
  page_url: string
  feature?: string
}

upgrade_button_clicked: {
  source: 'tier_gate' | 'auth_gate' | 'pricing_page' | 'other'
  required_tier?: 'free' | 'premium'
}
```

**See Full List**: `/lib/analytics/event-types.ts`

---

## Database Schema

Events are stored in `ab_testing.events` table:

```sql
CREATE TABLE ab_testing.events (
  id UUID PRIMARY KEY,
  experiment_id UUID,        -- '00000000-0000-0000-0000-000000000000' for general analytics
  variant_id UUID,
  event_type ab_event_type,  -- 'exposure', 'click', 'conversion', 'signup', 'subscribe', 'custom'
  event_name TEXT,           -- e.g., 'recipe_viewed'
  event_value NUMERIC,       -- Optional: for revenue tracking
  user_id UUID,              -- Null for anonymous users
  session_id TEXT,           -- Session identifier
  user_tier subscription_tier,
  page_url TEXT,
  referrer TEXT,
  properties JSONB,          -- Event-specific data
  created_at TIMESTAMPTZ
);
```

**Note**: General analytics events (not part of A/B tests) use the reserved UUID `00000000-0000-0000-0000-000000000000` for both `experiment_id` and `variant_id`.

---

## Common Queries

### Most Popular Features

```sql
SELECT
  event_name,
  COUNT(*) as total_events,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT session_id) as unique_sessions
FROM ab_testing.events
WHERE created_at > NOW() - INTERVAL '7 days'
  AND experiment_id = '00000000-0000-0000-0000-000000000000'
GROUP BY event_name
ORDER BY total_events DESC;
```

### Tier Gate Conversion Funnel

```sql
SELECT
  COUNT(*) FILTER (WHERE event_name = 'tier_gate_shown') as gates_shown,
  COUNT(*) FILTER (WHERE event_name = 'upgrade_button_clicked') as upgrade_clicks,
  COUNT(*) FILTER (WHERE event_name = 'subscribe') as subscriptions,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE event_name = 'upgrade_button_clicked') /
    NULLIF(COUNT(*) FILTER (WHERE event_name = 'tier_gate_shown'), 0),
    2
  ) as click_through_rate
FROM ab_testing.events
WHERE created_at > NOW() - INTERVAL '7 days';
```

### Recipe Engagement by Tier

```sql
SELECT
  user_tier,
  COUNT(*) FILTER (WHERE event_name = 'recipe_viewed') as views,
  COUNT(*) FILTER (WHERE event_name = 'recipe_added_to_favorites') as favorites,
  COUNT(*) FILTER (WHERE event_name = 'recipe_added_to_shopping_list') as to_cart,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE event_name = 'recipe_added_to_favorites') /
    NULLIF(COUNT(*) FILTER (WHERE event_name = 'recipe_viewed'), 0),
    2
  ) as favorite_rate
FROM ab_testing.events
WHERE created_at > NOW() - INTERVAL '7 days'
  AND event_name IN ('recipe_viewed', 'recipe_added_to_favorites', 'recipe_added_to_shopping_list')
GROUP BY user_tier;
```

### User Journey Analysis

```sql
SELECT
  session_id,
  user_id,
  user_tier,
  ARRAY_AGG(event_name ORDER BY created_at) as event_sequence,
  COUNT(*) as event_count,
  MIN(created_at) as session_start,
  MAX(created_at) as session_end
FROM ab_testing.events
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY session_id, user_id, user_tier
ORDER BY session_start DESC
LIMIT 20;
```

### Events by Page

```sql
SELECT
  page_url,
  event_name,
  COUNT(*) as count
FROM ab_testing.events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY page_url, event_name
ORDER BY page_url, count DESC;
```

---

## Performance & Best Practices

### Event Batching

✅ **Events are automatically batched** - No configuration needed
- Flushes every 5 seconds OR 10 events
- Automatic flush on page unload
- Failed events retry on next session

### When to Use `immediate: true`

```typescript
// Normal events - use batching (default)
trackEvent('recipe_viewed', { recipe_id: recipe.id })

// Critical events - send immediately
trackEvent('subscription_purchased', {
  plan: 'premium',
  amount: 9.99
}, {
  immediate: true,  // Send now, don't queue
  eventValue: 9.99
})
```

### Privacy Considerations

✅ **What We Track**:
- User IDs (internal UUIDs only)
- Session IDs (random UUIDs)
- Page URLs and navigation
- Feature interactions

❌ **What We DON'T Track**:
- Email addresses
- Passwords
- Payment information
- Full names
- Exact locations

### Development Mode

Events are logged to console in development:
```
[Analytics] Track event: recipe_viewed { recipe_id: '123' }
```

Set `NODE_ENV=production` to disable console logs.

---

## Troubleshooting

### Events Not Appearing in Database

1. **Check browser console** for analytics logs
2. **Verify AnalyticsProvider** is in app layout
3. **Check database** with: `SELECT * FROM ab_testing.events ORDER BY created_at DESC LIMIT 5`
4. **Verify RPC function** exists: `SELECT * FROM ab_testing.track_event`

### Type Errors

```typescript
// ❌ Wrong - property name typo
trackEvent('recipe_viewed', { recipeId: '123' })

// ✅ Correct - TypeScript will autocomplete
trackEvent('recipe_viewed', { recipe_id: '123' })
```

### Session ID Always "ssr-temp-session"

This means code is running on the server. Ensure:
- Component has `'use client'` directive
- Hook is called inside a client component

---

## File Structure

```
/lib/analytics/
├── analytics-client.ts     # Core tracking engine
├── session-manager.ts      # Session ID management (wraps Supabase auth)
├── event-queue.ts         # Event batching & queuing
├── event-types.ts         # Type-safe event definitions
└── index.ts              # Public API exports

/lib/database/
└── analytics-db.ts        # Wrapper around ab_testing.track_event() RPC

/contexts/
└── analytics-context.tsx  # React context provider (auto page views)

/hooks/
└── use-analytics.ts       # Main hook for components
```

---

## Integration with A/B Testing

Analytics uses the same database infrastructure as A/B testing:

### General Analytics (No Experiment)

```typescript
// Normal event tracking
trackEvent('recipe_viewed', { recipe_id: '123' })
// Uses experiment_id: '00000000-0000-0000-0000-000000000000'
```

### A/B Test Event Tracking

```typescript
// Event tied to an experiment
trackEvent('recipe_viewed', {
  recipe_id: '123'
}, {
  experimentId: 'exp-abc-123',
  variantId: 'variant-xyz-456'
})
```

Both types of events are stored in the same `ab_testing.events` table.

---

## Next Steps

### To Add Custom Events

1. Add event name to `AnalyticsEventName` type in `/lib/analytics/event-types.ts`
2. Add properties interface to `EventProperties`
3. Add event type mapping to `EVENT_TYPE_MAPPING`
4. Use `trackEvent()` in your component

### To View Analytics Dashboard

Build a dashboard at `/app/dashboard/analytics/page.tsx`:
- Use the SQL queries above
- Visualize with charts (Recharts, etc.)
- Filter by date range, user tier, page

### To Export Data

```typescript
// In a server component or API route
import { AnalyticsDB } from '@/lib/database/analytics-db'

const events = await supabase
  .from('ab_testing.events')
  .select('*')
  .gte('created_at', startDate)
  .lte('created_at', endDate)

// Export as CSV, JSON, etc.
```

---

## Support

**Documentation**:
- Event Types: `/lib/analytics/event-types.ts`
- Implementation Plan: `~/.claude/plans/fluffy-popping-wombat.md`
- A/B Testing: `/docs/ab-testing-guide.md`

**Common Issues**:
- Type errors → Check event name and property names match definitions
- Events not tracking → Ensure `'use client'` directive on component
- Session issues → Verify AnalyticsProvider in layout

**Database**: All events stored in `ab_testing.events` table in Supabase.
