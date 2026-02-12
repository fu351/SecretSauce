# Subscription & Tier-Based Access Guide

> Canonical tier model for agents: only `free` and `premium` are valid subscription tiers. `enterprise` is deprecated and must not be used.

This guide explains how to lock pages and features behind authentication and subscription tiers.

## Overview

Your app has two subscription tiers:
- **Free**: Default tier for all authenticated users
- **Premium**: Paid tier with access to premium features

Anonymous (not signed in) users can browse but have limited access.

## Server-Side Protection

### Protecting Entire Pages

Use server-side helpers in your page components to require authentication or specific tiers:

```typescript
// app/premium-feature/page.tsx
import { requireTier } from "@/lib/auth/subscription"

export default async function PremiumFeaturePage() {
  // Redirect to pricing if user doesn't have premium
  await requireTier("premium")

  return (
    <div>
      <h1>Premium Feature</h1>
      {/* Your premium content */}
    </div>
  )
}
```

### Just Require Sign-In

```typescript
import { requireAuth } from "@/lib/auth/subscription"

export default async function ProtectedPage() {
  // Redirect to sign-in if not authenticated
  await requireAuth()

  return <div>Protected content</div>
}
```

### Check Access Without Redirecting

```typescript
import { hasAccessToTier } from "@/lib/auth/subscription"

export default async function ConditionalPage() {
  const hasPremium = await hasAccessToTier("premium")

  return (
    <div>
      {hasPremium ? (
        <PremiumContent />
      ) : (
        <UpgradePrompt />
      )}
    </div>
  )
}
```

## Client-Side Protection

### Using TierGate Component

Wrap content that requires a specific tier:

```typescript
"use client"

import { TierGate } from "@/components/auth/tier-gate"

export function MyComponent() {
  return (
    <div>
      <h1>My Page</h1>

      {/* Free content - visible to everyone */}
      <div>This is free content</div>

      {/* Premium content - shows paywall if not premium */}
      <TierGate requiredTier="premium">
        <div>This is premium content</div>
      </TierGate>
    </div>
  )
}
```

### Custom Fallback

```typescript
<TierGate
  requiredTier="premium"
  fallback={<div>Custom upgrade message</div>}
>
  <PremiumFeature />
</TierGate>
```

### Using Subscription Hooks

```typescript
"use client"

import { useHasAccess, useSubscription } from "@/hooks/use-subscription"

export function MyComponent() {
  const { subscription, loading } = useSubscription()
  const { hasAccess } = useHasAccess("premium")

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <p>Your tier: {subscription?.tier || "free"}</p>

      {hasAccess && (
        <button>Premium Feature</button>
      )}
    </div>
  )
}
```

### Conditional Rendering Based on Tier

```typescript
"use client"

import { useCurrentTier, useIsPaying } from "@/hooks/use-subscription"

export function Navigation() {
  const { tier } = useCurrentTier()
  const { isPaying } = useIsPaying()

  return (
    <nav>
      <a href="/">Home</a>
      <a href="/recipes">Recipes</a>

      {/* Show for all authenticated users */}
      {tier !== "free" && <a href="/meal-plans">Meal Plans</a>}

      {/* Show only for paying customers */}
      {isPaying && <a href="/advanced-analytics">Analytics</a>}
    </nav>
  )
}
```

## Common Patterns

### Mixed Content Page

```typescript
// app/recipes/page.tsx
import { getUserTier } from "@/lib/auth/subscription"
import { TierBadge } from "@/components/auth/tier-gate"

export default async function RecipesPage() {
  const tier = await getUserTier()

  return (
    <div>
      <h1>Recipes</h1>

      {/* Free recipes - everyone can see */}
      <RecipeCard
        title="Basic Pasta"
        badge={<TierBadge tier="free" />}
      />

      {/* Premium recipes - show to everyone but lock content */}
      <RecipeCard
        title="Gourmet Dish"
        badge={<TierBadge tier="premium" />}
        locked={tier !== "premium"}
      />
    </div>
  )
}
```

### Feature Flags Based on Tier

```typescript
"use client"

import { useHasAccess } from "@/hooks/use-subscription"

export function RecipeDetailPage({ recipe }) {
  const { hasAccess: canViewNutrition } = useHasAccess("premium")
  const { hasAccess: canExport } = useHasAccess("premium")

  return (
    <div>
      <h1>{recipe.title}</h1>
      <Ingredients items={recipe.ingredients} />

      {canViewNutrition && (
        <NutritionInfo nutrition={recipe.nutrition} />
      )}

      {canExport && (
        <button>Export Recipe</button>
      )}
    </div>
  )
}
```

## Testing Tiers

### Grant User a Tier (SQL)

Run this in Supabase SQL Editor to test different tiers:

```sql
-- Grant premium for 30 days
UPDATE profiles
SET
  subscription_tier = 'premium',
  subscription_started_at = NOW(),
  subscription_expires_at = NOW() + INTERVAL '30 days'
WHERE id = 'your-user-id';

-- Remove subscription (back to free)
UPDATE profiles
SET
  subscription_tier = NULL,
  subscription_started_at = NULL,
  subscription_expires_at = NULL
WHERE id = 'your-user-id';
```

### Check Current Subscription

```sql
SELECT
  email,
  subscription_tier,
  subscription_started_at,
  subscription_expires_at,
  CASE
    WHEN subscription_expires_at IS NULL THEN true
    WHEN subscription_expires_at > NOW() THEN true
    ELSE false
  END as is_active
FROM profiles
WHERE id = 'your-user-id';
```

## Pricing Page

You should create a pricing page at `/pricing` that users are redirected to when they lack a required tier.

The URL includes query parameters:
- `?required=premium` - Shows which tier is needed
- `?reason=expired` - Shows why they were redirected
- `?reason=tier` - They need to upgrade

Example pricing page:

```typescript
// app/pricing/page.tsx
export default function PricingPage({
  searchParams,
}: {
  searchParams: { required?: string; reason?: string }
}) {
  return (
    <div>
      <h1>Choose Your Plan</h1>

      {searchParams.reason === "expired" && (
        <Alert>Your subscription has expired</Alert>
      )}

      {searchParams.required && (
        <Alert>
          {searchParams.required.charAt(0).toUpperCase() + searchParams.required.slice(1)}
          {" "}tier required for this feature
        </Alert>
      )}

      {/* Pricing cards */}
    </div>
  )
}
```

## Best Practices

1. **Server-side for pages**: Always use `requireTier()` or `requireAuth()` for entire pages
2. **Client-side for features**: Use `<TierGate>` or hooks for UI elements within pages
3. **Graceful degradation**: Show upgrade prompts instead of hiding features entirely
4. **Clear messaging**: Tell users what tier they need and why
5. **Test thoroughly**: Test with different tiers and expired subscriptions
6. **Cache carefully**: Subscription status can change, so avoid long caching

## API Routes

For API routes, use the same helpers:

```typescript
// app/api/premium-feature/route.ts
import { requireTier } from "@/lib/auth/subscription"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    await requireTier("premium")

    // User has premium access
    return NextResponse.json({ data: "premium data" })
  } catch (error) {
    return NextResponse.json(
      { error: "Premium subscription required" },
      { status: 403 }
    )
  }
}
```
