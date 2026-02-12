# A/B Testing System Guide

> Canonical tier model for agents: only `free` and `premium` are valid subscription tiers. Do not create or target `enterprise`.

## Overview

This A/B testing infrastructure provides a complete experimentation system with:
- **Tiered user access**: Anonymous, Free (logged in), Premium (subscribed)
- **Admin roles**: Admins manage experiments, Analysts view results
- **Event tracking**: Exposures, clicks, conversions, signups, subscriptions
- **Flexible targeting**: By user tier, anonymous users, custom rules
- **Statistical analysis**: Results broken down by variant and user tier

## Architecture

All A/B testing tables are in the `ab_testing` schema:
- `ab_testing.experiments` - Experiment definitions
- `ab_testing.variants` - A/B/C/... variants for each experiment
- `ab_testing.user_assignments` - Which users got which variant
- `ab_testing.events` - Event tracking for analytics
- `ab_testing.admin_roles` - Who can manage experiments

## User Tiers

### 1. Anonymous Users
- Can browse the website
- Most features locked
- Can participate in A/B tests (if `target_anonymous = true`)

### 2. Free Users (Logged In)
- Access to most features
- Some features behind paywall
- Full A/B test participation

### 3. Premium Users (Subscribed)
- Full access to all features
- Can be targeted separately in experiments

### 4. Admins
- Manage A/B experiments
- **Admin**: Create, edit, delete experiments
- **Analyst**: View experiment results only

## Quick Start

### 1. Run the Migration

```bash
# Apply the migration to your Supabase database
supabase migration up
```

### 2. Grant Admin Access

```sql
-- Make yourself an admin
INSERT INTO ab_testing.admin_roles (user_id, role, granted_by)
VALUES (
  'your-user-id-here',
  'admin',
  'your-user-id-here'
);
```

### 3. Create Your First Experiment

```typescript
import { supabase } from '@/lib/database/supabase'

// Create an experiment
const { data: experiment } = await supabase
  .from('ab_testing.experiments')
  .insert({
    name: 'Signup Button Color Test',
    description: 'Test blue vs green signup button',
    hypothesis: 'Green button will increase signups by 10%',
    status: 'active',
    allocation_method: 'random',
    traffic_percentage: 100, // Include 100% of users
    target_anonymous: true, // Include anonymous users
    primary_metric: 'signup_rate',
    created_by: userId
  })
  .select()
  .single()

// Create variants
await supabase.from('ab_testing.variants').insert([
  {
    experiment_id: experiment.id,
    name: 'Control (Blue)',
    description: 'Current blue button',
    is_control: true,
    weight: 50,
    config: { buttonColor: 'blue', buttonText: 'Sign Up' }
  },
  {
    experiment_id: experiment.id,
    name: 'Variant A (Green)',
    description: 'New green button',
    is_control: false,
    weight: 50,
    config: { buttonColor: 'green', buttonText: 'Get Started' }
  }
])
```

### 4. Implement in Your App

```typescript
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/database/supabase'

export function SignupButton() {
  const [variant, setVariant] = useState(null)
  const [sessionId] = useState(() =>
    sessionStorage.getItem('session_id') ||
    crypto.randomUUID()
  )

  useEffect(() => {
    // Store session ID
    sessionStorage.setItem('session_id', sessionId)

    // Assign user to variant
    const assignVariant = async () => {
      const user = await supabase.auth.getUser()

      const { data } = await supabase.rpc(
        'ab_testing.assign_user_to_variant',
        {
          p_experiment_id: 'your-experiment-id',
          p_user_id: user?.data?.user?.id,
          p_session_id: !user?.data?.user ? sessionId : null
        }
      )

      if (data) {
        // Get variant config
        const { data: variants } = await supabase.rpc(
          'ab_testing.get_active_experiments',
          {
            p_user_id: user?.data?.user?.id,
            p_session_id: !user?.data?.user ? sessionId : null
          }
        )

        const myVariant = variants?.find(
          v => v.experiment_id === 'your-experiment-id'
        )
        setVariant(myVariant)

        // Track exposure
        await supabase.rpc('ab_testing.track_event', {
          p_experiment_id: 'your-experiment-id',
          p_variant_id: data,
          p_event_type: 'exposure',
          p_event_name: 'signup_button_shown',
          p_user_id: user?.data?.user?.id,
          p_session_id: !user?.data?.user ? sessionId : null,
          p_page_url: window.location.href
        })
      }
    }

    assignVariant()
  }, [sessionId])

  const handleClick = async () => {
    // Track click
    const user = await supabase.auth.getUser()

    await supabase.rpc('ab_testing.track_event', {
      p_experiment_id: 'your-experiment-id',
      p_variant_id: variant.variant_id,
      p_event_type: 'click',
      p_event_name: 'signup_button_clicked',
      p_user_id: user?.data?.user?.id,
      p_session_id: !user?.data?.user ? sessionId : null
    })

    // Navigate to signup
    // ...
  }

  if (!variant) return <div>Loading...</div>

  return (
    <button
      onClick={handleClick}
      style={{ backgroundColor: variant.variant_config.buttonColor }}
    >
      {variant.variant_config.buttonText}
    </button>
  )
}
```

### 5. Track Conversions

```typescript
// After successful signup
await supabase.rpc('ab_testing.track_event', {
  p_experiment_id: 'your-experiment-id',
  p_variant_id: variantId,
  p_event_type: 'signup',
  p_event_name: 'user_signed_up',
  p_user_id: newUserId,
  p_session_id: sessionId
})

// After subscription purchase
await supabase.rpc('ab_testing.track_event', {
  p_experiment_id: 'your-experiment-id',
  p_variant_id: variantId,
  p_event_type: 'subscribe',
  p_event_name: 'subscription_purchased',
  p_user_id: userId,
  p_event_value: 29.99 // Subscription price
})
```

### 6. View Results

```typescript
// Get experiment results
const { data: results } = await supabase.rpc(
  'ab_testing.get_experiment_results',
  { p_experiment_id: experimentId }
)

console.log(results)
// [
//   {
//     variant_name: "Control (Blue)",
//     is_control: true,
//     user_tier: "free",
//     total_assignments: 1000,
//     total_exposures: 950,
//     total_clicks: 120,
//     total_conversions: 45,
//     total_signups: 45,
//     conversion_rate: 4.74,
//     avg_event_value: null
//   },
//   {
//     variant_name: "Variant A (Green)",
//     is_control: false,
//     user_tier: "free",
//     total_assignments: 1020,
//     total_exposures: 970,
//     total_clicks: 145,
//     total_conversions: 58,
//     total_signups: 58,
//     conversion_rate: 5.98,
//     avg_event_value: null
//   }
// ]
```

## Common Use Cases

### 1. Test Pricing Page Visibility

```sql
-- Target only free users to test showing pricing
INSERT INTO ab_testing.experiments (
  name, status, created_by,
  target_user_tiers, target_anonymous
) VALUES (
  'Show Pricing to Free Users',
  'active',
  'admin-user-id',
  ARRAY['free']::subscription_tier[],
  false -- Don't include anonymous
);
```

### 2. Test New Feature for Premium Users

```sql
-- Target only premium subscribers
INSERT INTO ab_testing.experiments (
  name, status, created_by,
  target_user_tiers
) VALUES (
  'New Recipe Filter Feature',
  'active',
  'admin-user-id',
  ARRAY['premium']::subscription_tier[]
);
```

### 3. Test Onboarding Flow

```sql
-- Target anonymous and free users
INSERT INTO ab_testing.experiments (
  name, status, created_by,
  target_user_tiers, target_anonymous
) VALUES (
  'Simplified Onboarding',
  'active',
  'admin-user-id',
  ARRAY['free']::subscription_tier[],
  true -- Include anonymous
);
```

### 4. Weighted Allocation

```sql
-- Give 80% to control, 20% to variant (safer rollout)
INSERT INTO ab_testing.variants (experiment_id, name, weight, config) VALUES
  ('exp-id', 'Control', 80, '{"feature_enabled": false}'),
  ('exp-id', 'Variant', 20, '{"feature_enabled": true}');
```

## Helper Hook (React)

Create a reusable hook:

```typescript
// hooks/useABTest.ts
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/database/supabase'

export function useABTest(experimentId: string) {
  const [variant, setVariant] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getVariant = async () => {
      const sessionId = sessionStorage.getItem('ab_session') ||
        crypto.randomUUID()
      sessionStorage.setItem('ab_session', sessionId)

      const { data: { user } } = await supabase.auth.getUser()

      // Assign variant
      const { data: variantId } = await supabase.rpc(
        'ab_testing.assign_user_to_variant',
        {
          p_experiment_id: experimentId,
          p_user_id: user?.id,
          p_session_id: !user ? sessionId : null
        }
      )

      if (variantId) {
        // Get variant details
        const { data: experiments } = await supabase.rpc(
          'ab_testing.get_active_experiments',
          {
            p_user_id: user?.id,
            p_session_id: !user ? sessionId : null
          }
        )

        const exp = experiments?.find(e => e.experiment_id === experimentId)
        setVariant(exp)

        // Track exposure
        await supabase.rpc('ab_testing.track_event', {
          p_experiment_id: experimentId,
          p_variant_id: variantId,
          p_event_type: 'exposure',
          p_event_name: 'variant_shown',
          p_user_id: user?.id,
          p_session_id: !user ? sessionId : null
        })
      }

      setLoading(false)
    }

    getVariant()
  }, [experimentId])

  const trackEvent = async (
    eventType: string,
    eventName: string,
    value?: number
  ) => {
    const { data: { user } } = await supabase.auth.getUser()
    const sessionId = sessionStorage.getItem('ab_session')

    await supabase.rpc('ab_testing.track_event', {
      p_experiment_id: experimentId,
      p_variant_id: variant?.variant_id,
      p_event_type: eventType,
      p_event_name: eventName,
      p_user_id: user?.id,
      p_session_id: !user ? sessionId : null,
      p_event_value: value
    })
  }

  return { variant, loading, trackEvent }
}

// Usage:
// const { variant, trackEvent } = useABTest('exp-id')
// <button onClick={() => trackEvent('click', 'cta_clicked')}>
//   {variant?.variant_config.buttonText}
// </button>
```

## Best Practices

1. **Always have a control variant** - Mark one variant with `is_control: true`
2. **Track exposures separately** - Only count conversions from exposed users
3. **Set clear success metrics** - Define `primary_metric` upfront
4. **Run for sufficient time** - Wait for statistical significance
5. **Document your hypothesis** - Write it in the `hypothesis` field
6. **Target appropriately** - Don't test premium features on free users
7. **Monitor results** - Check `get_experiment_results` regularly
8. **Clean up old experiments** - Archive completed experiments

## Subscription Management

Update user subscription:

```typescript
// When user subscribes
await supabase
  .from('profiles')
  .update({
    subscription_tier: 'premium',
    subscription_started_at: new Date().toISOString(),
    subscription_expires_at: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId
  })
  .eq('id', userId)

// The system automatically downgrades expired subscriptions
// when you call ab_testing.get_user_tier()
```

## Admin Dashboard Ideas

Build an admin panel to:
- Create/edit/archive experiments
- View real-time results
- Compare conversion rates
- Export data for statistical analysis
- Manage admin roles

## Next Steps

1. Run the migration
2. Grant yourself admin access
3. Create your first experiment
4. Implement in your app using the examples above
5. Track events
6. Analyze results
7. Make data-driven decisions!
