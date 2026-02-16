# Stripe + Clerk Integration Guide

This guide reflects the current implementation in:
- `app/api/checkout/route.ts`
- `app/api/webhooks/stripe/route.ts`
- `app/api/webhooks/clerk/route.ts`

## Overview

The app uses:
- Clerk for auth identity
- Stripe for subscriptions
- Supabase `public.profiles` as the app-side subscription/profile state

`public.profiles` remains the central record. Stripe and Clerk both sync into it.

## Data Model (Profiles)

The integration expects these profile columns:
- `clerk_user_id`
- `stripe_customer_id`
- `stripe_subscription_id`
- `subscription_tier`
- `subscription_started_at`
- `subscription_expires_at`
- `subscription_status`
- `stripe_price_id`
- `stripe_current_period_end`

Documentation SQL for these exists in:
- `docs/profiles-clerk-bridge-migrations.sql`
- `docs/profiles-stripe-migrations.sql`

## Checkout Flow (`POST /api/checkout`)

Checkout is created in `app/api/checkout/route.ts`.

Request flow:
1. Validate required server config.
2. Resolve user identity.
3. Find or create Stripe customer.
4. Create Stripe Checkout Session (`mode: "subscription"`).
5. Return `{ url }` and redirect client-side.

Identity resolution order:
1. Clerk-authenticated user:
   - Match `profiles.clerk_user_id = clerkUserId`.
   - If missing, match by Clerk primary email to `profiles.email`, then backfill `clerk_user_id`.
2. Fallback: Supabase access token from `Authorization` header or auth cookies.

If neither identity path resolves a profile, API returns `401` with:
- `"Unauthorized or missing linked profile"`

## Required Environment Variables

For checkout route:
- `STRIPE_SECRET_KEY`
- `STRIPE_PREMIUM_PRICE_ID` (must start with `price_`, not `prod_`)
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY` fallback)
- `NEXT_PUBLIC_SITE_URL` (recommended in production; falls back to request origin)

For Stripe webhook route:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

For Clerk webhook route:
- `CLERK_WEBHOOK_SIGNING_SECRET`

For Clerk auth generally:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

## Webhooks

### Stripe Webhook (`POST /api/webhooks/stripe`)

Location: `app/api/webhooks/stripe/route.ts`

Signature verification:
- Uses `stripe-signature` header + `STRIPE_WEBHOOK_SECRET`.

Handled events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Profile update behavior:
- Maps Stripe status to app tier:
  - `active`, `trialing`, `past_due` -> `premium`
  - else -> `free`
- Updates lifecycle fields on `profiles`.
- Lookup priority:
  1. `supabase_user_id` from session metadata
  2. `clerk_user_id` from session metadata
  3. `stripe_customer_id`

### Clerk Webhook (`POST /api/webhooks/clerk`)

Location: `app/api/webhooks/clerk/route.ts`

Signature verification:
- Uses Clerk `verifyWebhook(req)` and `CLERK_WEBHOOK_SIGNING_SECRET`.

Handled events:
- `user.created`
- `user.updated`
- `user.deleted`

Profile sync behavior:
- On `user.created` / `user.updated`:
  - syncs `clerk_user_id`, `email`, `full_name`, `avatar_url`, `email_verified`
  - tries match by `clerk_user_id`, then by `email`
- On `user.deleted`:
  - nulls `clerk_user_id` for matched row

Note:
- This webhook does not create brand-new profile rows if none match.
- Reason: `profiles.id` is FK to `auth.users.id`.

## Production Checklist

1. Clerk production instance:
   - set production domain + redirect URLs
   - use production Clerk keys
2. Stripe live mode:
   - use `sk_live_...`
   - create live product + live price
   - set `STRIPE_PREMIUM_PRICE_ID` to live `price_...`
3. Supabase:
   - set `SUPABASE_SERVICE_ROLE_KEY` in deployment env
   - do not use anon or publishable key
4. Configure webhook endpoints:
   - Stripe: `https://<domain>/api/webhooks/stripe`
   - Clerk: `https://<domain>/api/webhooks/clerk`
5. Redeploy after any env changes.

## Local Development

Stripe:
```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Clerk:
- expose local app via tunnel (ngrok/cloudflared)
- configure Clerk webhook endpoint to your tunnel URL `/api/webhooks/clerk`
- use signing secret in local `.env`

## Troubleshooting

`[checkout-page] Failed to create session` with:
- `"Missing configuration. Set STRIPE_SECRET_KEY, STRIPE_PREMIUM_PRICE_ID, and SUPABASE_SERVICE_ROLE_KEY."`
  - One or more env vars are missing in deployed runtime.
  - Add vars in your host's production env settings and redeploy.

- `"SUPABASE_SERVICE_ROLE_KEY is invalid... not a publishable key."`
  - You used a publishable/anon key.
  - Replace with Supabase service-role secret.

- `"STRIPE_PREMIUM_PRICE_ID must be ... price_..., not prod_..."`
  - You used a Product ID instead of Price ID.
  - Use Stripe Price ID.

- `401 Unauthorized or missing linked profile`
  - Clerk/Supabase user exists but no matching profile row.
  - Ensure profile row exists and is linkable via `clerk_user_id` or email.
