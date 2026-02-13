"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks"
import { GoldenVine } from "./golden-vine"
import { ScrollSection } from "./scroll-section"
import { FloatingPriceTags } from "./floating-price-tags"
import {
  DecisionFatigueIllustration,
  RecipeFrictionIllustration,
  PantryDisconnectIllustration,
  ConnectsEverythingIllustration,
  MealPlanIllustration,
  CostOptimizationIllustration,
  EffortlessIllustration,
} from "./section-illustrations"

export function LandingPage() {
  const [mounted, setMounted] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="relative min-h-screen bg-[#0B0B0B] overflow-hidden">
      {/* Subtle noise texture */}
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none z-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      {/* Golden vine - only on desktop */}
      <GoldenVine />

      {/* ───────── HERO ───────── */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        <div
          className={`text-center transition-all duration-1000 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          {/* Logo / Bottle */}
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <Image
                src="/logo-dark.png"
                alt="Secret Sauce"
                width={isMobile ? 90 : 120}
                height={isMobile ? 90 : 120}
                className="opacity-90"
                priority
              />
              {/* Golden drip below logo */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-px h-10 bg-gradient-to-b from-[#D4AF37] to-transparent opacity-60" />
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-7xl font-serif font-light tracking-tight leading-tight mb-5 text-[#F5F2E8] text-balance">
            The secret to
            <br />
            better meals
          </h1>

          <p className="text-sm md:text-base lg:text-lg font-light tracking-wide text-[#CFC6B0]/60 mb-10">
            Save your health, money, and time.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size={isMobile ? "default" : "lg"}
              className="px-8 md:px-10 py-5 md:py-6 text-sm md:text-base font-normal bg-gradient-to-b from-[#D4AF37] to-[#B8962E] text-[#0B0B0B] hover:from-[#E0BF4A] hover:to-[#C5A028] shadow-lg shadow-[#D4AF37]/20 transition-all duration-300 rounded-xl"
              asChild
            >
              <Link href="/auth/signup">
                Get Early Access
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size={isMobile ? "default" : "lg"}
              variant="ghost"
              className="px-8 md:px-10 py-5 md:py-6 text-sm md:text-base font-light text-[#CFC6B0]/50 hover:text-[#F5F2E8] hover:bg-transparent transition-all duration-300"
              asChild
            >
              <Link href="/auth/signin">Sign In</Link>
            </Button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          className={`absolute bottom-10 left-1/2 -translate-x-1/2 transition-all duration-1000 delay-700 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] tracking-[0.3em] uppercase text-[#D4AF37]/30 font-light">
              Scroll
            </span>
            <div className="w-px h-8 bg-gradient-to-b from-[#D4AF37]/40 to-transparent landing-scroll-pulse" />
          </div>
        </div>
      </section>

      {/* ───────── SECTION 1: Decision Anxiety ───────── */}
      <ScrollSection
        label="Section 1 — Decision Anxiety"
        headline="You shouldn't have to think this hard about food."
        align="left"
        accent={<DecisionFatigueIllustration />}
        body={
          <>
            <p>
              Between classes, work, and everything else — food becomes another
              problem to solve. What should I cook? What can I afford? What do I
              even have?
            </p>
            <p>
              Most students default to whatever is easiest — not what{"'"}s best.
            </p>
          </>
        }
      />

      {/* ───────── SECTION 2: Recipe Friction ───────── */}
      <ScrollSection
        label="Section 2 — Recipe Discovery Friction"
        headline="Recipes don't work in real life."
        align="right"
        accent={<RecipeFrictionIllustration />}
        body={
          <>
            <p>
              You find something you want to cook. Then realize you don{"'"}t have
              the ingredients. Or they cost too much. Or you{"'"}ll only use them
              once.
            </p>
            <p>
              So you abandon it. Not because you didn{"'"}t want to cook — because
              it didn{"'"}t fit your reality.
            </p>
          </>
        }
      />

      {/* ───────── SECTION 3: Grocery Cost ───────── */}
      <ScrollSection
        label="Section 3 — Grocery Cost Pain"
        headline="Groceries are more expensive than they should be."
        align="left"
        accent={<FloatingPriceTags />}
        body={
          <>
            <p>
              Prices keep rising. You spend more than planned. You don{"'"}t know
              what{"'"}s worth buying.
            </p>
            <p>
              Students quietly overspend every week — without realizing it.
            </p>
            <p className="text-[#D4AF37]/40 text-sm italic">
              Costs rise silently.
            </p>
          </>
        }
      />

      {/* ───────── SECTION 4: Pantry Disconnect ───────── */}
      <ScrollSection
        label="Section 4 — Food Waste and Pantry Disconnect"
        headline="You forget what you already have."
        align="right"
        accent={<PantryDisconnectIllustration />}
        body={
          <>
            <p>
              Ingredients expire. Food sits unused. Money gets wasted.
            </p>
            <p>
              Not because you didn{"'"}t care — because nothing was helping you
              manage it.
            </p>
            <p className="text-[#D4AF37]/40 text-sm italic">
              Waste becomes normal.
            </p>
          </>
        }
      />

      {/* ───────── SECTION 5: Secret Sauce Awakens ───────── */}
      <ScrollSection
        label="Section 5 — Secret Sauce Awakens"
        headline="Secret Sauce connects everything."
        align="left"
        accent={<ConnectsEverythingIllustration />}
        body={
          <>
            <p>It understands:</p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>What you like.</li>
              <li>What you can afford.</li>
              <li>What you already have.</li>
              <li>What actually makes sense.</li>
            </ul>
            <p className="mt-2">And builds around you.</p>
            <p className="text-[#D4AF37]/40 text-sm italic">
              Intelligence replaces guesswork.
            </p>
          </>
        }
      />

      {/* ───────── SECTION 6: Automatic Planning ───────── */}
      <ScrollSection
        label="Section 6 — Automatic Meal Planning"
        headline="Meals plan themselves."
        align="right"
        accent={<MealPlanIllustration />}
        body={
          <>
            <p>
              Secret Sauce builds personalized meal plans based on:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>Your budget</li>
              <li>Your taste</li>
              <li>Your schedule</li>
              <li>Your goals</li>
            </ul>
            <p className="mt-2 font-medium text-[#F5F2E8]">
              Everything connects.
            </p>
          </>
        }
      />

      {/* ───────── SECTION 7: Cost Optimization ───────── */}
      <ScrollSection
        label="Section 7 — Cost Optimization and Financial Relief"
        headline="You stop overpaying."
        align="left"
        accent={<CostOptimizationIllustration />}
        body={
          <>
            <p>
              Secret Sauce generates grocery lists designed to minimize cost and
              maximize efficiency. You buy exactly what you need.
            </p>
            <p>Nothing wasted. Nothing unnecessary.</p>
            <p className="text-[#D4AF37]/40 text-sm italic">
              Control replaces uncertainty.
            </p>
          </>
        }
      />

      {/* ───────── SECTION 8: Outcome ───────── */}
      <ScrollSection
        label="Section 8 — Outcome and Student Empowerment"
        headline="Eating well becomes effortless."
        align="right"
        accent={<EffortlessIllustration />}
        body={
          <>
            <p>
              You spend less. Waste less. Think less.
            </p>
            <p>
              The system works quietly in the background. You just live your life.
            </p>
            <p className="font-medium text-[#F5F2E8]">
              The system works for you.
            </p>
          </>
        }
      />

      {/* ───────── FINAL CTA ───────── */}
      <section className="relative z-10 min-h-[60vh] flex flex-col items-center justify-center px-6 py-24">
        {/* Warm gradient background for final section */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1a1508]/80 via-transparent to-transparent" />

        <div className="relative z-10 text-center max-w-2xl mx-auto">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <Image
              src="/logo-dark.png"
              alt="Secret Sauce"
              width={80}
              height={80}
              className="opacity-80"
            />
          </div>

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif font-light tracking-tight text-[#F5F2E8] mb-6 text-balance">
            This is the secret.
          </h2>

          <p className="text-[#CFC6B0]/60 text-base md:text-lg font-light mb-10 max-w-lg mx-auto">
            Built for students who want to eat better, spend less, and stop
            worrying about food.
          </p>

          <Button
            size="lg"
            className="px-10 py-6 text-base font-normal bg-gradient-to-b from-[#D4AF37] to-[#B8962E] text-[#0B0B0B] hover:from-[#E0BF4A] hover:to-[#C5A028] shadow-lg shadow-[#D4AF37]/20 transition-all duration-300 rounded-xl"
            asChild
          >
            <Link href="/auth/signup">
              Get Early Access
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          <p className="mt-6 text-xs font-light tracking-wide text-[#CFC6B0]/30">
            Join Berkeley students already using Secret Sauce.
          </p>
        </div>
      </section>

      {/* Footer spacer */}
      <div className="h-16" />
    </div>
  )
}
