# Stripe and Clerk Integration

This document provides a comprehensive guide to the Stripe and Clerk integration for handling payments, subscriptions, and user authentication. It serves as a map for developers working on this implementation.

## Overview

The Stripe and Clerk integration is designed to provide a seamless and secure way to handle subscription-based payments and user management. It leverages Clerk for user authentication and Stripe for payment processing.

## Clerk Integration

Clerk is used for user authentication and management. It provides a simple and secure way to handle user sign-up, sign-in, and profile management.

- **Authentication:** The application uses Clerk's `auth()` middleware in `app/api/checkout/route.ts` to protect routes and get the user's ID.

    ```typescript
    // app/api/checkout/route.ts
    import { auth } from "@clerk/nextjs/server"

    // ...

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in to create a checkout session." }, { status: 401 })
    }
    ```

- **User ID:** The Clerk `userId` is used to associate payments and subscriptions with a specific user. It's passed to the Stripe checkout session's metadata.

    ```typescript
    // app/api/checkout/route.ts
    const session = await stripe.checkout.sessions.create({
      // ...
      metadata: {
        userId,
      },
    })
    ```

## Checkout Flow

The checkout flow is initiated from the `/checkout` page. Here's how it works:

1. **Authentication:** The user must be signed in to access the checkout page. The application uses Clerk to manage user authentication. The `CheckoutPage` component in `app/checkout/page.tsx` is a client-side component that initiates the checkout process.

2. **Initiate Checkout:** The user clicks the "Proceed to Payment" button on the `/checkout` page. The `handleCheckout` function is called inside the `CheckoutPage` component.

    ```tsx
    // app/checkout/page.tsx
    "use client"

    import { Button } from "@/components/ui/button"
    import { useTransition } from "react"

    export default function CheckoutPage() {
      const [isPending, startTransition] = useTransition()

      const handleCheckout = () => {
        startTransition(async () => {
          const response = await fetch("/api/checkout", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          })

          const session = await response.json()

          if (response.ok) {
            if (session.url) {
              window.location.href = session.url
            }
          } else {
            console.error("Failed to create checkout session:", session.error)
          }
        })
      }
      // ...
    }
    ```

3. **Create Checkout Session:** A POST request is sent to the `/api/checkout/route.ts` endpoint. The `POST` function in this file retrieves the `userId` from Clerk's `auth()` middleware and uses it to create a new Stripe checkout session.

    ```typescript
    // app/api/checkout/route.ts
    export async function POST() {
      try {
        const { userId } = await auth();
        // ...
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            // ...
          ],
          mode: "subscription",
          success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout/cancel`,
          metadata: {
            userId,
          },
        })

        return NextResponse.json({ url: session.url })
      } catch (error:any) {
        // ...
      }
    }
    ```

4. **Redirect to Stripe:** The user is redirected to the Stripe checkout page using the URL returned from the `/api/checkout` endpoint.

5. **Payment Status:**
    - **Success:** If the payment is successful, the user is redirected to the `app/checkout/success/page.tsx` page, which displays a success message.
    - **Cancel:** If the payment is canceled, the user is redirected to the `app/checkout/cancel/page.tsx` page, which displays a cancellation message and an option to try again.

## Webhooks

The application uses Stripe webhooks to receive and handle payment-related events.

- **Endpoint:** The webhook endpoint is located at `app/api/webhooks/stripe/route.ts`. The `POST` function in this file handles the incoming webhook events.

- **Verification:** The endpoint verifies the webhook signature to ensure that the request is coming from Stripe.

    ```typescript
    // app/api/webhooks/stripe/route.ts
    const body = await req.text();
    const sig = headers().get("stripe-signature")!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      // ...
    }
    ```

- **Event Handling:** The endpoint handles the `checkout.session.completed` event. When this event is received, it retrieves the `clerkUserId` from the session's metadata and logs the successful payment for that user.

    ```typescript
    // app/api/webhooks/stripe/route.ts
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const clerkUserId = session.metadata?.clerkUserId;

      if (clerkUserId) {
        console.log(`💰 Payment successful for user ${clerkUserId}`);
        // TODO: Add your business logic here.
      } else {
          console.log(`💰 Payment successful but no clerkUserId found in metadata`);
      }
    }
    ```

## Stripe and Clerk Account Interactions

### Stripe Details

- **Data Stored:**
- **Customer Information:** Stripe creates a customer object for each new user who initiates a checkout. This may include the user's email address and name.
- **Payment Methods:** Stripe securely stores the user's payment method details (e.g., credit card information).
- **Subscriptions:** Stripe manages the subscription status, billing cycles, and payment history for each user.
- **Metadata:** The Clerk `userId` is stored in the metadata of the Stripe checkout session to link Stripe customers to Clerk users.

- **Permissions (API Keys):**
- **`STRIPE_SECRET_KEY`**: This secret key is used for all server-side API requests, such as creating checkout sessions and handling webhooks. It has full access to the Stripe account, so it must be kept confidential.
- **`STRIPE_WEBHOOK_SECRET`**: This secret is used to verify the authenticity of incoming webhooks, ensuring they are sent from Stripe and not from a malicious third party.

### Clerk Details

- **Data Stored:**
- **User Profiles:** Clerk stores user information such as email address, name, and profile picture.
- **Authentication Data:** Clerk manages all aspects of user authentication, including passwords, sessions, and multi-factor authentication.

- **Permissions (API Keys):**
- The application uses the Clerk Next.js SDK, which handles authentication via environment variables. These keys grant the application permission to:
  - Verify user sessions.
  - Retrieve user information, including the `userId`.
  - Sign users in and out.
  
## Moving to Production

When moving from a development environment to a production environment, several changes are required for both Clerk and Stripe to ensure that you are using your live accounts and data.

### Clerk Settings

Your Clerk application is currently in a **development setup**. To move to production, you will need to create a **production instance** from your Clerk dashboard.

Key changes:

- **API Keys:**
  - You will need to replace your development API keys with the production keys in your environment variables.
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
- **Domains & Redirects:**
  - In your Clerk production instance settings, you must update the application's domain and redirect URLs to match your production URLs.

### Stripe Settings

Your Stripe account is currently in **test mode**. To process real payments, you must activate your account and switch to **live mode**.

Key changes:

- **API Keys:**
  - You will need to replace your test API keys with the live keys in your environment variables.
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_SECRET_KEY`
- **Webhooks:**
  - You need to create a new webhook endpoint in your Stripe live mode dashboard. The URL should point to your production application's webhook handler (`https://<your-production-domain>/api/webhooks/stripe`).
  - You will get a new webhook signing secret that you must update in your environment variables (`STRIPE_WEBHOOK_SECRET`).
- **Products and Prices:**
  - Any products and subscription prices you created in test mode need to be recreated in live mode.
  - Update the price IDs in your application code or environment variables to use the new live mode price IDs.

By default, the Clerk and Stripe accounts are in a development setup. The accounts store user authentication information and payment details respectively. No sensitive user information is stored on our end. To move to production, you would need to switch to a production instance on Clerk and activate your Stripe account to live mode. This would involve updating the API keys and webhook endpoints in the environment variables to reflect the production values.