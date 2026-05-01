"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks"
import { GoldenVine } from "./golden-vine"
import { ScrollSection } from "./scroll-section"
import { LandingSectionImage } from "./landing-section-image"

export function LandingPage() {
  const [mounted, setMounted] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="relative min-h-screen bg-[#010101] overflow-x-hidden">
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

      {/* ═══════════ HERO (no CTA — only at end of scroll) ═══════════ */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 pt-16 pb-28">
        <div
          className={`text-center max-w-2xl mx-auto transition-all duration-1000 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Bottle / Logo — slightly larger for emphasis */}
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <Image
                src="/logo-dark.png"
                alt="Secret Sauce"
                width={216}
                height={216}
                className="opacity-90 object-contain"
                priority
              />
              {/* Golden drip below bottle */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
                <svg width="5" height="24" viewBox="0 0 6 32" fill="none">
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

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif font-bold tracking-tight leading-[1.15] text-[#F5F2E8] text-balance mb-4">
            The secret to better meals
          </h1>

          <p className="text-sm md:text-base font-light tracking-wide text-[#CFC6B0]/60 leading-relaxed mb-2">
            Save your health, money, and time.
          </p>

          <p className="text-[10px] md:text-xs font-light tracking-[0.2em] uppercase text-[#D4AF37]/50">
            Built for Berkeley students
          </p>
        </div>

        {/* Scroll-down — small, thin, elegant */}
        <div
          className={`absolute bottom-8 left-1/2 flex flex-col items-center gap-2 transition-all duration-1000 delay-700 landing-scroll-breathe landing-scroll-glow ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-white font-light">
            Learn more
          </span>
          <svg
            width={18}
            height={24}
            viewBox="0 0 16 24"
            fill="none"
            className="text-white shrink-0"
          >
            <path
              d="M8 0 L8 18 M2 13 L8 20 L14 13"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </section>

      {/* Spacer to let vine establish before content */}
      <div className="h-16 md:h-24" />

      {/* ═══════════ SECTION 1: Decision fatigue ═══════════ */}
      <ScrollSection
        label="Section 1 — Decision fatigue"
        headline="Food shouldn't be this stressful."
        caption="Decision fatigue adds up."
        align="left"
        accent={<LandingSectionImage src="/Decision.png" alt="Decision fatigue — same question every day" />}
        body={
          <>
            <p>The same question gets asked every single day.</p>
            <p>What should I make for dinner?</p>
          </>
        }
      />

      {/* ═══════════ SECTION 2: Recipe friction ═══════════ */}
      <ScrollSection
        label="Section 2 — Recipe friction"
        headline="Recipes are clickbait and ad-driven."
        caption="Built for clicks, not cooking."
        align="right"
        accent={<LandingSectionImage src="/recipe.png" alt="Recipes built for clicks, not cooking" />}
        body={
          <>
            <p>Popups. Ads. Endless scrolling.</p>
            <p>Finding the instructions should be the easy part of cooking.</p>
          </>
        }
      />

      {/* ═══════════ SECTION 3: Cost of living crisis ═══════════ */}
      <ScrollSection
        label="Section 3 — Cost of living crisis"
        headline="Groceries are overpriced."
        caption="Overpaying is the default."
        align="left"
        accent={<LandingSectionImage src="/overprice.png" alt="Groceries overpriced — overpaying is the default" />}
        body={
          <>
            <p>The same cart costs more every week.</p>
            <p>You don{"'"}t realize how much you{"'"}re overpaying.</p>
          </>
        }
      />

      {/* ═══════════ SECTION 4: Waste and disconnect ═══════════ */}
      <ScrollSection
        label="Section 4 — Waste and disconnect"
        headline="Food gets wasted without you noticing."
        caption="Waste becomes normal."
        align="right"
        accent={<LandingSectionImage src="/pantry.png" alt="Food wasted without you noticing" />}
        body={
          <>
            <p>Ingredients expire quietly in the background.</p>
            <p>Money disappears with them.</p>
          </>
        }
      />

      {/* ═══════════ SECTION 5: The turn (Secret Sauce appears) ═══════════ */}
      <ScrollSection
        label="Section 5 — The turn"
        headline="Secret Sauce connects everything."
        caption="The system becomes intelligent."
        align="left"
        accent={<LandingSectionImage src="/connect.png" alt="Secret Sauce connects meals, groceries, and your real life" />}
        body={
          <>
            <p>Meals, groceries, and your real life.</p>
            <p>Finally working together.</p>
          </>
        }
      />

      {/* ═══════════ SECTION 6: Automatic meal planning ═══════════ */}
      <ScrollSection
        label="Section 6 — Automatic meal planning"
        headline="Meals plan themselves."
        caption="Planning disappears."
        align="right"
        accent={<LandingSectionImage src="/plan.png" alt="Meals plan themselves — personalized to your taste, diet, and budget" />}
        body={
          <>
            <p>Personalized to your taste, diet, and budget.</p>
            <p>No guesswork required.</p>
          </>
        }
      />

      {/* ═══════════ SECTION 7: Value optimized baskets ═══════════ */}
      <ScrollSection
        label="Section 7 — Value optimized baskets"
        headline="Stop overpaying for groceries."
        caption="Efficiency becomes automatic."
        align="left"
        accent={<LandingSectionImage src="/deals.png" alt="Value optimized baskets — stop overpaying for groceries" />}
        body={
          <>
            <p>Buy only what you need.</p>
            <p>Use everything you buy.</p>
          </>
        }
      />

      {/* ═══════════ SECTION 8: Identity outcome ═══════════ */}
      <ScrollSection
        label="Section 8 — Identity outcome"
        headline="Food stops being a problem."
        caption="Control replaces chaos."
        align="right"
        accent={<LandingSectionImage src="/easy.png" alt="Food stops being a problem — everything just works" />}
        body={
          <>
            <p>Less stress. Less waste. Less effort.</p>
            <p>Everything just works.</p>
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
          {/* Section 8 “easy” image replaces logo at bottom */}
          <div className="mb-2 w-full">
            <Image
              src="/end.png"
              alt="Secret Sauce"
              width={1200}
              height={800}
              className="w-full h-auto object-contain"
              sizes="100vw"
            />
          </div>

          {/* Solid backing so sauce flow doesn't run under final CTA text */}
          <div className="relative z-20 w-full bg-[#010101] pt-2">
            {/* Short fade in padding only so "This is the secret." has no gradient overlay */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-b from-transparent to-[#010101]" />

            <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold tracking-tight text-[#F5F2E8] mb-2 text-balance">
              This is the secret.
            </h2>

            <p className="text-[#CFC6B0]/50 text-base md:text-lg font-light mb-10 max-w-lg mx-auto leading-relaxed">
              Built for students who want to eat better and spend less.
            </p>

            <Button
              size="lg"
              className="px-10 py-6 text-base font-normal bg-gradient-to-b from-[#D4AF37] to-[#B8962E] text-[#0B0B0B] hover:from-[#E0BF4A] hover:to-[#C5A028] shadow-lg shadow-[#D4AF37]/20 hover:shadow-[#D4AF37]/30 transition-all duration-300 rounded-xl"
              asChild
            >
              <Link
                href="https://docs.google.com/forms/d/e/1FAIpQLSdg1GDVDx8PNL_R3-w3aaVbx9IL9CUQcy4CWQcFwMmzpwq-7Q/viewform?usp=publish-editor"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get early access
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            <p className="mt-6 text-xs font-light tracking-wide text-[#CFC6B0]/30">
              Join Berkeley students already using Secret Sauce
            </p>
          </div>
        </div>
      </section>

      {/* Footer spacer */}
      <div className="h-8" />
    </div>
  )
}
