import type { ReactNode } from "react"

import { getUserSubscription } from "@/lib/auth/subscription"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight, Check, Crown, Sparkles } from "lucide-react"
import Link from "next/link"

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string; reason?: string }>
}) {
  const [subscription, { required, reason }] = await Promise.all([
    getUserSubscription(),
    searchParams,
  ])

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <Card className="mb-6 overflow-hidden border-orange-200/70 bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 shadow-sm">
          <CardContent className="p-4 md:p-6">
            <div className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-sm md:p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div className="max-w-3xl space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Plans
                  </div>
                  <h1 className="font-serif text-3xl font-light tracking-tight text-neutral-950 md:text-4xl">
                    Choose Your Plan
                  </h1>
                  <p className="max-w-2xl text-sm text-neutral-800 md:text-base">
                    Start free, upgrade when you need more, and keep your cooking workflow in one place.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-xs font-medium text-neutral-700">
                  <span className="rounded-full border border-orange-200 bg-white px-3 py-1 shadow-sm">
                    Recipes
                  </span>
                  <span className="rounded-full border border-orange-200 bg-white px-3 py-1 shadow-sm">
                    Planning
                  </span>
                  <span className="rounded-full border border-orange-200 bg-white px-3 py-1 shadow-sm">
                    Nutrition
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {reason === "expired" && (
          <AlertBanner tone="amber">
            Your subscription has expired. Upgrade to continue accessing premium features.
          </AlertBanner>
        )}

        {required && (
          <AlertBanner tone="blue">
            <strong className="capitalize">{required}</strong> tier required for this feature
          </AlertBanner>
        )}

        {subscription?.tier && (
          <div className="mb-6">
            <Card className="border-border bg-card">
              <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between md:p-5">
                <p className="text-sm text-muted-foreground">
                  Current plan:{" "}
                  <span className="font-semibold capitalize text-foreground">{subscription.tier}</span>
                  {subscription.expires_at && (
                    <>
                      {" "}
                      • Expires: {new Date(subscription.expires_at).toLocaleDateString()}
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  You can upgrade or downgrade anytime.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <PricingCard
            name="Free"
            price="$0"
            period="forever"
            description="Best for getting started"
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

          <PricingCard
            name="Premium"
            price="$9.99"
            period="month"
            description="For serious home cooks"
            features={[
              "Discounted delivery",
              "Better nutrition statistics",
              "Unlimited auto meal planning",
              "Price comparison across stores",
              "Export recipes to PDF",
            ]}
            cta={subscription?.tier === "premium" ? "Current Plan" : "Upgrade to Premium"}
            ctaHref="/checkout"
            current={subscription?.tier === "premium"}
            highlighted={true}
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <FAQ
            question="Can I change plans later?"
            answer="Yes. Upgrade or downgrade whenever you need to."
          />
          <FAQ
            question="What payment methods do you accept?"
            answer="All major credit cards through Stripe."
          />
          <FAQ
            question="Can I cancel anytime?"
            answer="Absolutely. Cancel from your account settings anytime."
          />
        </div>
      </div>
    </main>
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
    <Card
      className={`overflow-hidden ${
        highlighted
          ? "border-orange-200/70 bg-gradient-to-br from-orange-600 via-orange-600 to-rose-600 text-white shadow-lg ring-1 ring-orange-200/80"
          : "border-border bg-card"
      }`}
    >
      <CardContent className="p-4 md:p-6">
        <div
          className={`rounded-2xl p-5 md:p-6 ${
            highlighted ? "bg-white/10 shadow-sm backdrop-blur-sm" : "bg-background"
          }`}
        >
          {highlighted && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/90">
              <Crown className="h-3.5 w-3.5" />
              Most popular
            </div>
          )}

          <h3 className={`text-2xl font-semibold ${highlighted ? "text-white" : "text-foreground"}`}>
            {name}
          </h3>
          <p className={`mt-2 text-sm ${highlighted ? "text-white/85" : "text-muted-foreground"}`}>
            {description}
          </p>

          <div className="mt-6 flex items-end gap-1">
            <span className={`text-5xl font-semibold tracking-tight ${highlighted ? "text-white" : "text-foreground"}`}>
              {price}
            </span>
            <span className={`pb-1 text-sm ${highlighted ? "text-white/80" : "text-muted-foreground"}`}>
              /{period}
            </span>
          </div>

          <ul className="mt-8 space-y-3">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check
                  className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                    highlighted ? "text-orange-100" : "text-orange-600"
                  }`}
                />
                <span className={`text-sm ${highlighted ? "text-white/92" : "text-foreground"}`}>
                  {feature}
                </span>
              </li>
            ))}
          </ul>

          <Button
            asChild
            className={`mt-8 w-full ${
              current
                ? highlighted
                  ? "cursor-default bg-orange-700 text-white hover:bg-orange-700"
                  : "cursor-default bg-muted text-muted-foreground hover:bg-muted"
                : highlighted
                  ? "bg-white text-orange-700 hover:bg-orange-50"
                  : "bg-orange-600 text-white hover:bg-orange-700"
            }`}
          >
            <Link href={ctaHref}>
              {cta}
              {!current && <ArrowRight className="h-4 w-4" />}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function FAQ({ question, answer }: { question: string; answer: string }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-5">
        <h3 className="mb-2 text-sm font-semibold text-foreground">{question}</h3>
        <p className="text-sm text-muted-foreground">{answer}</p>
      </CardContent>
    </Card>
  )
}

function AlertBanner({
  tone,
  children,
}: {
  tone: "amber" | "blue"
  children: ReactNode
}) {
  const styles =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-blue-200 bg-blue-50 text-blue-900"

  return (
    <Card className={`mb-4 border ${styles}`}>
      <CardContent className="p-4">
        <p className="text-sm">{children}</p>
      </CardContent>
    </Card>
  )
}
