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
    <div className="relative min-h-screen bg-[#0B0B0B] overflow-x-hidden">
      {/* Subtle noise texture */}
      <div className="fixed inset-0 opacity-[0.015] pointer-events-none z-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      {/* Golden vine - desktop only */}
      <GoldenVine />

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        <div
          className={`text-center transition-all duration-1000 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Bottle / Logo */}
          <div className="mb-6 md:mb-8 flex justify-center">
            <div className="relative">
              <Image
                src="/logo-dark.png"
                alt="Secret Sauce"
                width={isMobile ? 90 : 120}
                height={isMobile ? 90 : 120}
                className="opacity-90"
                priority
              />
              {/* Golden drip below bottle */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
                <svg width="6" height="32" viewBox="0 0 6 32" fill="none">
                  <path
                    d="M3 0 C3 8 1 14 3 20 C4.5 26 3 32 3 32"
                    stroke="#D4AF37"
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity="0.6"
                  />
                  <circle cx="3" cy="30" r="2.5" fill="#D4AF37" opacity="0.5" />
                </svg>
              </div>
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-7xl font-serif font-bold tracking-tight leading-[1.1] mb-4 md:mb-5 text-[#F5F2E8] text-balance">
            The secret to
            <br />
            better meals
          </h1>

          <p className="text-sm md:text-base lg:text-lg font-light tracking-wide text-[#CFC6B0]/50 mb-4">
            Save your health, money, and time.
          </p>
        </div>

        {/* Slow pulsing scroll-down indicator */}
        <div
          className={`absolute bottom-10 left-1/2 -translate-x-1/2 transition-all duration-[1.5s] delay-1000 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex flex-col items-center gap-3 landing-scroll-breathe">
            <span className="text-[10px] tracking-[0.3em] uppercase text-[#D4AF37]/30 font-light">
              Scroll
            </span>
            <svg width="16" height="24" viewBox="0 0 16 24" fill="none" className="text-[#D4AF37]/40">
              <path
                d="M8 0 L8 18 M2 13 L8 20 L14 13"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </section>

      {/* Spacer to let vine establish before content */}
      <div className="h-16 md:h-24" />

      {/* ═══════════ SECTION 1: Decision Anxiety ═══════════ */}
      <ScrollSection
        label="Section 1 — Decision Anxiety"
        headline="You shouldn't have to think this hard about food."
        caption="Decision fatigue starts here."
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

      {/* ═══════════ SECTION 2: Recipe Friction ═══════════ */}
      <ScrollSection
        label="Section 2 — Recipe Discovery Friction"
        headline="Recipes don't work in real life."
        caption="Discovery without execution."
        align="right"
        accent={<RecipeFrictionIllustration />}
        body={
          <>
            <p>
              You find something you want to cook. Then realize you don{"'"}t
              have the ingredients. Or they cost too much. Or you{"'"}ll only use
              them once.
            </p>
            <p>
              So you abandon it. Not because you didn{"'"}t want to cook —
              because it didn{"'"}t fit your reality.
            </p>
          </>
        }
      />

      {/* ═══════════ SECTION 3: Grocery Cost ═══════════ */}
      <ScrollSection
        label="Section 3 — Grocery Cost Pain"
        headline="Groceries are more expensive than they should be."
        caption="Costs rise silently."
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
          </>
        }
      />

      {/* ═══════════ SECTION 4: Pantry Disconnect ═══════════ */}
      <ScrollSection
        label="Section 4 — Food Waste and Pantry Disconnect"
        headline="You forget what you already have."
        caption="Waste becomes normal."
        align="right"
        accent={<PantryDisconnectIllustration />}
        body={
          <>
            <p>Ingredients expire. Food sits unused. Money gets wasted.</p>
            <p>
              Not because you didn{"'"}t care — because nothing was helping you
              manage it.
            </p>
          </>
        }
      />

      {/* ═══════════ SECTION 5: Secret Sauce Awakens ═══════════ */}
      <ScrollSection
        label="Section 5 — Secret Sauce Awakens"
        headline="Secret Sauce connects everything."
        caption="Intelligence replaces guesswork."
        align="left"
        accent={<ConnectsEverythingIllustration />}
        body={
          <>
            <p>It understands:</p>
            <ul className="space-y-1.5 ml-0.5">
              <li className="flex items-start gap-2">
                <span className="text-[#D4AF37]/50 mt-0.5">{">"}</span>
                What you like.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D4AF37]/50 mt-0.5">{">"}</span>
                What you can afford.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D4AF37]/50 mt-0.5">{">"}</span>
                What you already have.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D4AF37]/50 mt-0.5">{">"}</span>
                What actually makes sense.
              </li>
            </ul>
            <p className="mt-3 font-medium text-[#F5F2E8]">
              And builds around you.
            </p>
          </>
        }
      />

      {/* ═══════════ SECTION 6: Automatic Planning ═══════════ */}
      <ScrollSection
        label="Section 6 — Automatic Meal Planning"
        headline="Meals plan themselves."
        caption="Planning without effort."
        align="right"
        accent={<MealPlanIllustration />}
        body={
          <>
            <p>
              Secret Sauce builds personalized meal plans based on:
            </p>
            <ul className="space-y-1.5 ml-0.5">
              <li className="flex items-start gap-2">
                <span className="text-[#D4AF37]/50 mt-0.5">{">"}</span>
                Your budget
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D4AF37]/50 mt-0.5">{">"}</span>
                Your taste
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D4AF37]/50 mt-0.5">{">"}</span>
                Your schedule
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#D4AF37]/50 mt-0.5">{">"}</span>
                Your goals
              </li>
            </ul>
            <p className="mt-3 font-medium text-[#F5F2E8]">
              Everything connects.
            </p>
          </>
        }
      />

      {/* ═══════════ SECTION 7: Cost Optimization (WARM BG) ═══════════ */}
      <ScrollSection
        label="Section 7 — Cost Optimization and Financial Relief"
        headline="You stop overpaying."
        caption="Control replaces uncertainty."
        align="left"
        accent={<CostOptimizationIllustration />}
        warmBg
        body={
          <>
            <p>
              Secret Sauce generates grocery lists designed to minimize cost and
              maximize efficiency. You buy exactly what you need.
            </p>
            <p>Nothing wasted. Nothing unnecessary.</p>
          </>
        }
      />

      {/* ═══════════ SECTION 8: Outcome ═══════════ */}
      <ScrollSection
        label="Section 8 — Outcome and Student Empowerment"
        headline="Eating well becomes effortless."
        align="right"
        accent={<EffortlessIllustration />}
        body={
          <>
            <p>You spend less. Waste less. Think less.</p>
            <p>
              The system works quietly in the background. You just live your
              life.
            </p>
            <p className="font-medium text-[#F5F2E8]">
              The system works for you.
            </p>
          </>
        }
      />

      {/* ═══════════ FINAL CTA: Vine terminates at the bottle ═══════════ */}
      <section className="relative z-10 min-h-[80vh] flex flex-col items-center justify-center px-6 py-32 md:py-44">
        {/* Warm radial glow behind the bottle */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#D4AF37]/[0.05] blur-[120px]" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto">
          {/* Bottle — the vine path in the SVG ends right here */}
          <div className="mb-10 flex justify-center relative">
            <div className="relative">
              {/* Multi-layered glow behind bottle */}
              <div className="absolute inset-0 -z-10 rounded-full bg-[#D4AF37]/[0.06] blur-2xl scale-[2]" />
              <div className="absolute inset-0 -z-10 rounded-full bg-[#D4AF37]/[0.12] blur-xl scale-[1.5]" />
              <Image
                src="/logo-dark.png"
                alt="Secret Sauce"
                width={isMobile ? 90 : 110}
                height={isMobile ? 90 : 110}
                className="opacity-90"
              />
            </div>
          </div>

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold tracking-tight text-[#F5F2E8] mb-5 text-balance">
            This is the secret.
          </h2>

          <p className="text-[#CFC6B0]/50 text-base md:text-lg font-light mb-10 max-w-lg mx-auto leading-relaxed">
            Built for students who want to eat better, spend less, and stop
            worrying about food.
          </p>

          <Button
            size="lg"
            className="px-10 py-6 text-base font-normal bg-gradient-to-b from-[#D4AF37] to-[#B8962E] text-[#0B0B0B] hover:from-[#E0BF4A] hover:to-[#C5A028] shadow-lg shadow-[#D4AF37]/20 hover:shadow-[#D4AF37]/30 transition-all duration-300 rounded-xl"
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
      <div className="h-8" />
    </div>
  )
}
