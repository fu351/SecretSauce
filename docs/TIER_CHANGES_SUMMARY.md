# Enterprise Tier Removal & Auth Gates - Summary

> Canonical tier model for agents: only `free` and `premium` are valid subscription tiers now.

## ✅ What Changed

### 1. Removed Enterprise Tier
- Now only **2 tiers**: `free` and `premium`
- Migration created to update database
- All existing enterprise users will be converted to premium
- All files updated to remove enterprise references

### 2. Added Authentication Gates
- New `<AuthGate>` component for requiring login (any tier)
- Separate from `<TierGate>` which requires specific subscription tiers

## 🔄 Migration Required

**Run this migration to update your database:**

```bash
# Option 1: Supabase Dashboard
# Go to SQL Editor and run: supabase/migrations/0009_remove_enterprise_tier.sql

# Option 2: CLI
npx supabase db push
```

**What the migration does:**
1. Converts any existing enterprise users to premium
2. Updates the enum to only include `free` and `premium`
3. Updates all tables that reference subscription_tier
4. Safely migrates all existing data

## 🎯 Available Tiers

### Free Tier (Default)
- All authenticated users start here
- Basic features available
- No payment required

### Premium Tier (Paid)
- Paid subscription ($9.99/month)
- All advanced features unlocked
- Priority support

## 🛠️ How to Use

### 1. Require Login (Any Tier)

Use `<AuthGate>` when you just need the user to be logged in:

```typescript
"use client"
import { AuthGate } from "@/components/auth/tier-gate"

export function MyComponent() {
  return (
    <AuthGate>
      <div>This content requires login (free tier is OK)</div>
    </AuthGate>
  )
}
```

**Server-side version:**
```typescript
import { requireAuth } from "@/lib/auth/subscription"

export default async function Page() {
  await requireAuth() // Redirects to /auth/signin if not logged in

  return <div>Authenticated content</div>
}
```

### 2. Require Premium Tier

Use `<TierGate>` for premium-only features:

```typescript
"use client"
import { TierGate } from "@/components/auth/tier-gate"

export function MyComponent() {
  return (
    <div>
      {/* Free content - everyone logged in can see */}
      <AuthGate>
        <div>Logged-in users see this</div>
      </AuthGate>

      {/* Premium content - shows paywall if not premium */}
      <TierGate requiredTier="premium">
        <div>Premium users see this</div>
      </TierGate>
    </div>
  )
}
```

**Server-side version:**
```typescript
import { requireTier } from "@/lib/auth/subscription"

export default async function PremiumPage() {
  await requireTier("premium") // Redirects to /pricing if not premium

  return <div>Premium content</div>
}
```

### 3. Custom Fallback Messages

```typescript
<AuthGate fallback={<div>Please log in to continue</div>}>
  <UserContent />
</AuthGate>

<TierGate
  requiredTier="premium"
  fallback={<div>Upgrade to premium for this feature</div>}
>
  <PremiumFeature />
</TierGate>
```

## 📊 Component Comparison

| Component | Requires | Shows If Not Met | Use Case |
|-----------|----------|------------------|----------|
| `<AuthGate>` | Logged in (any tier) | Sign-in prompt | Features for any logged-in user |
| `<TierGate requiredTier="free">` | Logged in | Sign-in prompt | Same as AuthGate |
| `<TierGate requiredTier="premium">` | Premium subscription | Paywall | Premium features only |

## 🧪 Testing

### Grant Yourself Premium

```sql
-- 30-day premium subscription
UPDATE profiles
SET
  subscription_tier = 'premium',
  subscription_started_at = NOW(),
  subscription_expires_at = NOW() + INTERVAL '30 days'
WHERE email = 'your@email.com';
```

### Check Your Tier

```sql
SELECT
  email,
  subscription_tier,
  subscription_expires_at,
  CASE
    WHEN subscription_tier IS NULL THEN 'free'
    ELSE subscription_tier::text
  END as effective_tier
FROM profiles
WHERE email = 'your@email.com';
```

### Remove Subscription (Back to Free)

```sql
UPDATE profiles
SET
  subscription_tier = NULL,
  subscription_started_at = NULL,
  subscription_expires_at = NULL
WHERE email = 'your@email.com';
```

## 📝 Examples

### Example 1: Recipe Page (Mixed Access)

```typescript
export function RecipePage({ recipe }) {
  return (
    <div>
      {/* Public - everyone can see */}
      <h1>{recipe.title}</h1>
      <img src={recipe.image} />

      {/* Requires login - free tier OK */}
      <AuthGate>
        <SaveToFavoritesButton recipe={recipe} />
        <AddToMealPlanButton recipe={recipe} />
      </AuthGate>

      {/* Requires premium subscription */}
      <TierGate requiredTier="premium">
        <NutritionAnalysis nutrition={recipe.nutrition} />
        <ExportToPDFButton recipe={recipe} />
      </TierGate>
    </div>
  )
}
```

### Example 2: Feature with Multiple Gates

```typescript
export function ShoppingList() {
  return (
    <AuthGate>
      {/* User is logged in */}
      <div>
        <h2>Your Shopping List</h2>

        {/* Free users see basic list */}
        <BasicShoppingList />

        {/* Premium users see price comparison */}
        <TierGate requiredTier="premium">
          <PriceComparisonTable />
        </TierGate>
      </div>
    </AuthGate>
  )
}
```

### Example 3: Server-Side Page Protection

```typescript
// app/meal-plans/page.tsx
import { requireAuth } from "@/lib/auth/subscription"

export default async function MealPlansPage() {
  // Require login but allow free tier
  await requireAuth()

  return <MealPlansContent />
}

// app/analytics/page.tsx
import { requireTier } from "@/lib/auth/subscription"

export default async function AnalyticsPage() {
  // Require premium tier
  await requireTier("premium")

  return <AdvancedAnalytics />
}
```

## 🔑 Quick Reference

**All Available Imports:**

```typescript
// Components (client-side)
import { AuthGate, TierGate, TierBadge } from "@/components/auth/tier-gate"

// Server-side functions
import {
  requireAuth,
  requireTier,
  getUserTier,
  getUserSubscription,
  hasAccessToTier,
} from "@/lib/auth/subscription"

// Client-side hooks
import {
  useSubscription,
  useHasAccess,
  useIsPaying,
  useCurrentTier,
} from "@/hooks/use-subscription"
```

**Tier Type:**
```typescript
type SubscriptionTier = "free" | "premium"
```
