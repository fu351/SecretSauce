import { NextResponse } from "next/server"
import Stripe from "stripe"
import { auth } from "@clerk/nextjs/server"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
})

export async function POST() {
  try {
    const { userId } = await auth();
    console.log("DEBUG: userId is", userId); // Check if userId is still valid
    console.log("DEBUG: Checkout Route accessed by userId:", userId);

    if (!userId) {
      return NextResponse.json({ error: "You must be signed in to create a checkout session." }, { status: 401 })
    }

    console.log("DEBUG: Using APP_URL:", process.env.NEXT_PUBLIC_APP_URL);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Dummy Product",
              description: "This is a dummy product for testing purposes.",
            },
            unit_amount: 1000, // $10.00
            recurring: {
              interval: "month", // Can be "day", "week", "month", or "year"
            },
          },
          quantity: 1,
        },
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
    console.error("Error creating checkout session:", error)
    console.error("STRIPE ERROR:", error.message);
    console.error("STRIPE ERROR DETAILS:", error.raw);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 })
  }
}