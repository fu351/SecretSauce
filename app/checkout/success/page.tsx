import Link from "next/link";

export default function CheckoutSuccessPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center">
      <h1 className="text-4xl font-bold mb-4">Payment Successful!</h1>
      <p className="text-lg mb-8">
        Thank you for your purchase. Your subscription is now active.
      </p>
      <Link href="/dashboard" className="text-blue-500 hover:underline">
        Go to your Dashboard
      </Link>
    </div>
  );
}
