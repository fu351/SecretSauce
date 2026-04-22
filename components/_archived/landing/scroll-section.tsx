"use client"

import { useEffect, useRef, useState } from "react"

interface ScrollSectionProps {
  label: string
  headline: string
  body: React.ReactNode
  caption?: string
  align?: "left" | "right"
  accent?: React.ReactNode
  className?: string
  /** Warm background glow – used for section 7 */
  warmBg?: boolean
}

export function ScrollSection({
  label,
  headline,
  body,
  caption,
  align = "left",
  accent,
  className = "",
  warmBg = false,
}: ScrollSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true)
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const textOrder = align === "right" ? "md:order-2" : "md:order-1"
  const accentOrder = align === "right" ? "md:order-1" : "md:order-2"

  return (
    <section
      ref={sectionRef}
      className={`relative min-h-[90vh] flex items-center px-6 md:px-16 lg:px-24 py-28 md:py-40 ${className}`}
    >
      {/* Warm amber background for highlighted sections */}
      {warmBg && (
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a1508]/90 via-[#1a1508]/60 to-[#010101] pointer-events-none" />
      )}

      <div className="relative max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 items-center gap-10 md:gap-20">
        {/* Text content — above vine (z-20) */}
        <div
          className={`relative z-20 ${textOrder} transition-all duration-700 ease-out ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <p className="text-[11px] md:text-xs font-light tracking-[0.25em] uppercase mb-5 text-[#D4AF37]/60">
            {label}
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] font-serif font-bold tracking-tight leading-[1.15] mb-6 text-[#F5F2E8] text-balance">
            {headline}
          </h2>
          <div className="text-[#CFC6B0]/80 text-[15px] md:text-base font-light leading-relaxed space-y-3">
            {body}
          </div>
          {caption && (
            <p className="mt-5 text-sm italic text-[#D4AF37]/40 font-light">
              {caption}
            </p>
          )}
        </div>

        {/* Accent visual — below vine (z-[5]) */}
        {accent && (
          <div
            className={`relative z-[5] ${accentOrder} flex justify-center transition-all duration-700 ease-out delay-150 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
          >
            {accent}
          </div>
        )}
      </div>
    </section>
  )
}
