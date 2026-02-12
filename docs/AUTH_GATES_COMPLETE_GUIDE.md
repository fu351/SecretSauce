# Complete Authentication & Tier Gates Guide

## 🎯 All Available Components

### 1. `<ShowWhenLoggedIn>` - Show content only to logged-in users
Hides content if user is not logged in. No fallback shown.

```typescript
import { ShowWhenLoggedIn } from "@/components/auth/tier-gate"

<ShowWhenLoggedIn>
  <button>Save to Favorites</button>
</ShowWhenLoggedIn>
```

### 2. `<ShowWhenLoggedOut>` - Show content only to logged-out users
Hides content if user is logged in. Perfect for sign-up CTAs.

```typescript
import { ShowWhenLoggedOut } from "@/components/auth/tier-gate"

<ShowWhenLoggedOut>
  <button>Sign Up Now!</button>
</ShowWhenLoggedOut>
```

### 3. `<AuthGate>` - Require login with sign-in prompt
Shows sign-in prompt if user is not logged in. Use when you want to force authentication.

```typescript
import { AuthGate } from "@/components/auth/tier-gate"

<AuthGate>
  <div>Content that requires login</div>
</AuthGate>

// With custom fallback
<AuthGate fallback={<div>Please log in</div>}>
  <UserDashboard />
</AuthGate>
```

### 4. `<TierGate>` - Require specific subscription tier
Shows paywall if user doesn't have required tier.

```typescript
import { TierGate } from "@/components/auth/tier-gate"

<TierGate requiredTier="premium">
  <PremiumFeature />
</TierGate>

// With custom fallback
<TierGate requiredTier="premium" fallback={<UpgradePrompt />}>
  <AdvancedAnalytics />
</TierGate>
```

## 📊 Component Comparison

| Component | When Shown | When Hidden | Fallback Behavior |
|-----------|------------|-------------|-------------------|
| `<ShowWhenLoggedIn>` | User logged in | User logged out | None - just hides |
| `<ShowWhenLoggedOut>` | User logged out | User logged in | None - just hides |
| `<AuthGate>` | User logged in | User logged out | Sign-in prompt (default) |
| `<TierGate requiredTier="premium">` | User has premium | User lacks premium | Paywall or sign-in prompt |

## 🎨 Real-World Examples

### Example 1: Navigation Bar

```typescript
"use client"
import { ShowWhenLoggedIn, ShowWhenLoggedOut } from "@/components/auth/tier-gate"

export function Navigation() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/recipes">Recipes</Link>

      {/* Show only when logged out */}
      <ShowWhenLoggedOut>
        <Link href="/auth/signin">Sign In</Link>
        <Link href="/auth/signup">Sign Up</Link>
      </ShowWhenLoggedOut>

      {/* Show only when logged in */}
      <ShowWhenLoggedIn>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/meal-plans">Meal Plans</Link>
        <UserMenu />
      </ShowWhenLoggedIn>
    </nav>
  )
}
```

### Example 2: Homepage with Mixed Content

```typescript
export function HomePage() {
  return (
    <div>
      {/* Public content - everyone sees */}
      <Hero />
      <Features />

      {/* CTA for logged-out users */}
      <ShowWhenLoggedOut>
        <div className="bg-orange-600 text-white p-12 text-center">
          <h2>Ready to get started?</h2>
          <Link href="/auth/signup">
            <button>Sign Up Free</button>
          </Link>
        </div>
      </ShowWhenLoggedOut>

      {/* Content for logged-in users */}
      <ShowWhenLoggedIn>
        <RecentRecipes />
        <YourMealPlans />
      </ShowWhenLoggedIn>
    </div>
  )
}
```

### Example 3: Recipe Page (All Gates)

```typescript
export function RecipePage({ recipe }) {
  return (
    <div>
      {/* Public info */}
      <h1>{recipe.title}</h1>
      <img src={recipe.image} />
      <Ingredients items={recipe.ingredients} />

      {/* Encourage sign-up for logged-out users */}
      <ShowWhenLoggedOut>
        <div className="bg-blue-50 p-4 rounded">
          <p>Sign up to save this recipe!</p>
          <Link href="/auth/signup">Create Account</Link>
        </div>
      </ShowWhenLoggedOut>

      {/* Basic features for logged-in users */}
      <ShowWhenLoggedIn>
        <SaveToFavoritesButton recipe={recipe} />
        <AddToMealPlanButton recipe={recipe} />
      </ShowWhenLoggedIn>

      {/* Premium features */}
      <TierGate requiredTier="premium">
        <NutritionAnalysis nutrition={recipe.nutrition} />
        <PriceCalculator ingredients={recipe.ingredients} />
        <ExportToPDFButton recipe={recipe} />
      </TierGate>
    </div>
  )
}
```

### Example 4: Pricing Page

```typescript
export function PricingPage() {
  return (
    <div>
      <h1>Choose Your Plan</h1>

      {/* Show current plan for logged-in users */}
      <ShowWhenLoggedIn>
        <CurrentPlanBanner />
      </ShowWhenLoggedIn>

      {/* Show sign-up incentive for logged-out users */}
      <ShowWhenLoggedOut>
        <div className="bg-green-50 p-4 rounded mb-8">
          <p>Sign up now and get 7 days free!</p>
        </div>
      </ShowWhenLoggedOut>

      <PricingCards />
    </div>
  )
}
```

### Example 5: Dashboard (Force Login)

```typescript
export function Dashboard() {
  return (
    <AuthGate>
      {/* Only logged-in users can see this */}
      <div>
        <h1>Your Dashboard</h1>
        <Stats />
        <RecentActivity />

        {/* Premium section within dashboard */}
        <TierGate requiredTier="premium">
          <AdvancedAnalytics />
        </TierGate>
      </div>
    </AuthGate>
  )
}
```

## 🚀 Quick Decision Tree

**Choose the right component:**

1. **Want to hide/show based on login status?**
   - Hide from logged-in → `<ShowWhenLoggedOut>`
   - Hide from logged-out → `<ShowWhenLoggedIn>`

2. **Want to force user to log in?**
   - Use `<AuthGate>` (shows sign-in prompt)
   - Or server-side: `await requireAuth()`

3. **Want to require premium subscription?**
   - Use `<TierGate requiredTier="premium">` (shows paywall)
   - Or server-side: `await requireTier("premium")`

## 📝 Migration Summary

### Run This Migration

```bash
# Apply the migration to remove enterprise tier
npx supabase db push
```

This will:
- Remove "enterprise" from the tier enum
- Keep only "free" and "premium"
- Convert any existing enterprise users to premium
- Update all related tables

## 🎯 Available Tiers

After migration, only two tiers:
- **free**: Default for all users (no subscription)
- **premium**: Paid tier ($9.99/month)

## 💡 Best Practices

1. **Use `ShowWhen*` for simple hide/show** - No prompts, just conditional rendering
2. **Use `AuthGate` when forcing login** - Shows sign-in prompt
3. **Use `TierGate` for premium features** - Shows paywall with upgrade button
4. **Combine gates for complex flows** - Nest them as needed
5. **Server-side for pages, client-side for features** - Protect entire pages on server
6. **Don't over-gate** - Make core browsing experience accessible

## 🔑 Complete Import Reference

```typescript
// Client Components
import {
  ShowWhenLoggedIn,    // Hide/show based on login
  ShowWhenLoggedOut,   // Hide/show based on logout
  AuthGate,            // Require login (with prompt)
  TierGate,            // Require tier (with paywall)
  TierBadge,           // Display tier badge
} from "@/components/auth/tier-gate"

// Server Functions
import {
  requireAuth,         // Require login (redirect if not)
  requireTier,         // Require tier (redirect if not)
  getUserTier,         // Get current tier
  getUserSubscription, // Get full subscription info
  hasAccessToTier,     // Check tier access
} from "@/lib/auth/subscription"

// Client Hooks
import {
  useSubscription,     // Get subscription info
  useHasAccess,        // Check tier access
  useIsPaying,         // Check if paying customer
  useCurrentTier,      // Get current tier
} from "@/hooks/use-subscription"
```

## ✅ You Now Have

✅ Show/hide content for logged-in users
✅ Show/hide content for logged-out users
✅ Require login with sign-in prompt
✅ Require premium with paywall
✅ Server-side page protection
✅ Client-side feature gates
✅ Only 2 tiers (free & premium)
✅ Beautiful default UI for all prompts
