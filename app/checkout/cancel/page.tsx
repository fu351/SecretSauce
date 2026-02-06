"use client"

import Link from "next/link"

export default function CheckoutCancelPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold mb-4">Payment Canceled</h1>
      <p className="text-lg mb-8">
        Your payment was not processed. You can try again.
      </p>
      <Link href="/checkout" className="text-blue-500 hover:underline">
        Try again
      </Link>
    </div>
  )
}