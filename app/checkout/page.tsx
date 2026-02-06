"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { loadStripe } from "@stripe/stripe-js";

// Make sure to add your publishable key to your .env.local file
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export default function CheckoutPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!user) {
      // This should not happen if the page is protected by middleware
      alert("You must be logged in to check out.");
      return;
    }

    setLoading(true);

    try {
      const success_url = `${window.location.origin}/checkout/success`;
      const cancel_url = `${window.location.origin}/checkout/cancel`;

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          success_url,
          cancel_url,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create Stripe session");
      }

      const { sessionId } = await response.json();
      const stripe = await stripePromise;

      if (stripe) {
        const { error } = await stripe.redirectToCheckout({ sessionId });
        if (error) {
          throw new Error(error.message);
        }
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center text-gray-900">Checkout</h1>
        <div className="flex justify-between items-center text-gray-800">
          <span>Secret Sauce Subscription</span>
          <span className="font-semibold">$10.00</span>
        </div>
        <p className="text-sm text-gray-600">
          You will be redirected to Stripe to complete your payment securely.
        </p>
        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
        >
          {loading ? "Processing..." : "Proceed to Payment"}
        </button>
      </div>
    </div>
  );
}
