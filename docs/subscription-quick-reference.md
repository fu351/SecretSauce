# Subscription Infrastructure - Quick Reference

## Agent Metadata

- `Doc Kind`: `guide`
- `Canonicality`: `implementation-guide`
- `Owner`: `Application Engineering`
- `Last Reviewed`: `2026-02-13`
- `Primary Surfaces`: `lib/auth/subscription.ts`, `hooks/use-subscription.ts`, `components/auth/tier-gate.tsx`
- `Update Trigger`: Subscription helpers/hooks or tier checks change.

## Agent Use

- `Read this when`: you need quick server/client subscription API usage patterns.
- `Stop reading when`: you need conflict resolution across docs.
- `Escalate to`: `docs/agent-canonical-context.md`, `docs/auth-gates-complete-guide.md`.


> Canonical tier model for agents: only `free` and `premium` are valid subscription tiers. Do not use `enterprise` in code or docs.

## 📦 Available Tools

### Server-Side Functions (lib/auth/subscription.ts)

```typescript
// Require authentication - redirects to /auth/signin if not logged in
await requireAuth() // Returns user ID

// Require specific tier - redirects to /pricing if insufficient
await requireTier("premium")  // "free" | "premium"

// Check access without redirecting
const hasAccess = await hasAccessToTier("premium") // Returns boolean

// Get user's subscription info
const subscription = await getUserSubscription()
// Returns: { tier, started_at, expires_at, is_active, stripe_customer_id, stripe_subscription_id }

// Get just the tier
const tier = await getUserTier() // Returns: "free" | "premium" | null
```

### Client-Side Hooks (hooks/use-subscription.ts)

```typescript
// Get full subscription info
const { subscription, loading } = useSubscription()

// Check if user has access to a tier
const { hasAccess, loading } = useHasAccess("premium")

// Check if user is paying
const { isPaying, loading } = useIsPaying()

// Get current tier
const { tier, isActive, loading } = useCurrentTier()
```

### React Components (components/auth/tier-gate.tsx)

```typescript
// Gate content behind a tier
<TierGate requiredTier="premium">
  <PremiumContent />
</TierGate>

// With custom fallback
<TierGate requiredTier="premium" fallback={<CustomMessage />}>
  <PremiumContent />
</TierGate>

// Tier badge
<TierBadge tier="premium" />
```

## 🚀 Common Use Cases

### 1. Lock an Entire Page (Server Component)

```typescript
// app/premium-feature/page.tsx
import { requireTier } from "@/lib/auth/subscription"

export default async function PremiumPage() {
  await requireTier("premium")

  return <div>Premium content</div>
}
```

### 2. Mixed Content Page (Server Component)

```typescript
import { getUserTier } from "@/lib/auth/subscription"

export default async function RecipesPage() {
  const tier = await getUserTier()

  return (
    <div>
      <FreeRecipes />
      {tier === "premium" && <PremiumRecipes />}
    </div>
  )
}
```

### 3. Client Component with Gates

```typescript
"use client"
import { TierGate } from "@/components/auth/tier-gate"

export function RecipeDetail() {
  return (
    <div>
      <BasicInfo />

      <TierGate requiredTier="premium">
        <NutritionAnalysis />
      </TierGate>
    </div>
  )
}
```

### 4. Conditional UI (Client Component)

```typescript
"use client"
import { useHasAccess } from "@/hooks/use-subscription"

export function Toolbar() {
  const { hasAccess: hasPremium } = useHasAccess("premium")

  return (
    <div>
      <Button>Free Action</Button>
      {hasPremium && <Button>Premium Action</Button>}
    </div>
  )
}
```

### 5. Show Tier in UI

```typescript
"use client"
import { useCurrentTier } from "@/hooks/use-subscription"
import { TierBadge } from "@/components/auth/tier-gate"

export function UserProfile() {
  const { tier } = useCurrentTier()

  return (
    <div>
      <h2>Your Plan</h2>
      <TierBadge tier={tier} />
    </div>
  )
}
```

## 🧪 Testing

### Grant Yourself Premium (SQL)

```sql
-- 30-day premium trial
UPDATE profiles
SET
  subscription_tier = 'premium',
  subscription_started_at = NOW(),
  subscription_expires_at = NOW() + INTERVAL '30 days'
WHERE email = 'your@email.com';
```

### Check Your Subscription

```sql
SELECT
  email,
  subscription_tier,
  subscription_expires_at,
  subscription_expires_at > NOW() as is_active
FROM profiles
WHERE email = 'your@email.com';
```

### Reset to Free

```sql
UPDATE profiles
SET
  subscription_tier = NULL,
  subscription_started_at = NULL,
  subscription_expires_at = NULL
WHERE email = 'your@email.com';
```

## 📝 Tier Hierarchy

- **Anonymous**: Not signed in → Can browse public content only
- **Free**: Signed in, no subscription → Basic features
- **Premium**: Paid subscription → Advanced features

When checking tiers:
- `requireTier("free")` = Any authenticated user
- `requireTier("premium")` = Premium users only

## ⚡ Performance Tips

1. **Use server components when possible** - Faster, no hydration needed
2. **Gate at page level** - Use `requireTier()` for entire pages
3. **Use `<TierGate>` for features** - Fine-grained control within pages
4. **Cache subscription data** - It's already cached in the hooks
5. **Don't over-check** - Check once per page/component, not per feature

## 🎨 UI Patterns

### Feature Toggle
```typescript
{hasAccess && <FeatureButton />}
```

### Show Upgrade Prompt
```typescript
{!hasAccess && <UpgradeButton />}
```

### Disabled State
```typescript
<button disabled={!hasAccess}>
  {hasAccess ? "Use Feature" : "Upgrade to Use"}
</button>
```

### Blur/Lock Effect
```typescript
<div className={!hasAccess ? "blur-sm pointer-events-none" : ""}>
  <PremiumContent />
</div>
{!hasAccess && <LockOverlay />}
```
