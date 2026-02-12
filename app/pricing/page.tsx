import { getUserSubscription } from "@/lib/auth/subscription"
import { Check } from "lucide-react"
import Link from "next/link"

export default async function PricingPage({
  searchParams,
}: {
  searchParams: { required?: string; reason?: string }
}) {
  const subscription = await getUserSubscription()

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-16 px-4">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600">
            Start free, upgrade when you need more
          </p>

          {/* Alert Messages */}
          {searchParams.reason === "expired" && (
            <div className="mt-6 mx-auto max-w-2xl rounded-lg bg-yellow-50 border border-yellow-200 p-4">
              <p className="text-yellow-800">
                Your subscription has expired. Upgrade to continue accessing premium features.
              </p>
            </div>
          )}

          {searchParams.required && (
            <div className="mt-6 mx-auto max-w-2xl rounded-lg bg-blue-50 border border-blue-200 p-4">
              <p className="text-blue-800">
                <strong className="capitalize">{searchParams.required}</strong> tier required for this feature
              </p>
            </div>
          )}
        </div>

        {/* Current Subscription */}
        {subscription?.tier && (
          <div className="mb-8 text-center">
            <p className="text-sm text-gray-600">
              Current plan:{" "}
              <span className="font-semibold capitalize">{subscription.tier}</span>
              {subscription.expires_at && (
                <>
                  {" "}• Expires: {new Date(subscription.expires_at).toLocaleDateString()}
                </>
              )}
            </p>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Tier */}
          <PricingCard
            name="Free"
            price="$0"
            period="forever"
            description="Perfect for getting started"
            features={[
              "Browse unlimited recipes",
              "Create basic meal plans",
              "Shopping lists",
              "Save favorite recipes",
            ]}
            cta="Current Plan"
            ctaHref="#"
            current={subscription?.tier === null || subscription?.tier === "free"}
            highlighted={false}
          />

          {/* Premium Tier */}
          <PricingCard
            name="Premium"
            price="$9.99"
            period="month"
            description="For serious home cooks"
            features={[
              "Everything in Free",
              "Advanced nutrition tracking",
              "Price comparison across stores",
              "Unlimited meal plans",
              "Export recipes to PDF",
              "Advanced analytics",
              "Priority support",
            ]}
            cta={subscription?.tier === "premium" ? "Current Plan" : "Upgrade to Premium"}
            ctaHref="/api/stripe/checkout?tier=premium"
            current={subscription?.tier === "premium"}
            highlighted={true}
          />
        </div>

        {/* FAQ Section */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <FAQ
              question="Can I change plans later?"
              answer="Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately."
            />
            <FAQ
              question="What payment methods do you accept?"
              answer="We accept all major credit cards through Stripe. Your payment information is secure and encrypted."
            />
            <FAQ
              question="Can I cancel anytime?"
              answer="Absolutely. You can cancel your subscription at any time from your account settings. No questions asked."
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function PricingCard({
  name,
  price,
  period,
  description,
  features,
  cta,
  ctaHref,
  current = false,
  highlighted = false,
}: {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  cta: string
  ctaHref: string
  current?: boolean
  highlighted?: boolean
}) {
  return (
    <div
      className={`rounded-2xl p-8 ${
        highlighted
          ? "bg-orange-600 text-white ring-4 ring-orange-200"
          : "bg-white border-2 border-gray-200"
      }`}
    >
      {highlighted && (
        <div className="mb-4 inline-block rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold">
          Most Popular
        </div>
      )}

      <h3
        className={`text-2xl font-bold ${highlighted ? "text-white" : "text-gray-900"}`}
      >
        {name}
      </h3>
      <p className={`mt-2 text-sm ${highlighted ? "text-orange-100" : "text-gray-600"}`}>
        {description}
      </p>

      <div className="mt-6">
        <span className={`text-5xl font-bold ${highlighted ? "text-white" : "text-gray-900"}`}>
          {price}
        </span>
        <span className={`text-lg ${highlighted ? "text-orange-100" : "text-gray-600"}`}>
          /{period}
        </span>
      </div>

      <ul className="mt-8 space-y-4">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check
              className={`h-5 w-5 flex-shrink-0 ${
                highlighted ? "text-orange-200" : "text-orange-600"
              }`}
            />
            <span className={`text-sm ${highlighted ? "text-orange-50" : "text-gray-700"}`}>
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={`mt-8 block w-full rounded-lg py-3 text-center font-semibold transition ${
          current
            ? highlighted
              ? "bg-orange-700 text-white cursor-default"
              : "bg-gray-100 text-gray-400 cursor-default"
            : highlighted
            ? "bg-white text-orange-600 hover:bg-orange-50"
            : "bg-orange-600 text-white hover:bg-orange-700"
        }`}
      >
        {cta}
      </Link>
    </div>
  )
}

function FAQ({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-6">
      <h3 className="font-semibold text-gray-900 mb-2">{question}</h3>
      <p className="text-gray-600 text-sm">{answer}</p>
    </div>
  )
}
