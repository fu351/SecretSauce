import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center">
      <h1 className="text-4xl font-bold mb-4">Payment Cancelled</h1>
      <p className="text-lg mb-8">
        Your payment process was cancelled. You have not been charged.
      </p>
      <Link href="/checkout" className="text-blue-500 hover:underline">
        Try again
      </Link>
    </div>
  );
}
