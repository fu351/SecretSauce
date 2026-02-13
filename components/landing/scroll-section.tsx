"use client"

import { useEffect, useRef, useState } from "react"

interface ScrollSectionProps {
  label: string
  headline: string
  body: React.ReactNode
  align?: "left" | "right"
  accent?: React.ReactNode
  className?: string
}

export function ScrollSection({
  label,
  headline,
  body,
  align = "left",
  accent,
  className = "",
}: ScrollSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px" }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className={`min-h-[70vh] flex items-center px-6 md:px-12 lg:px-20 py-16 md:py-24 relative ${className}`}
    >
      <div
        className={`max-w-6xl mx-auto w-full flex flex-col ${
          align === "right" ? "md:flex-row-reverse" : "md:flex-row"
        } items-center gap-8 md:gap-16`}
      >
        {/* Text content */}
        <div
          className={`flex-1 transition-all duration-700 ease-out ${
            isVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          }`}
        >
          <p className="text-[#D4AF37] text-xs font-light tracking-[0.2em] uppercase mb-4">
            {label}
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-light tracking-tight leading-tight mb-6 text-balance text-[#F5F2E8]">
            {headline}
          </h2>
          <div className="text-[#CFC6B0] text-base md:text-lg font-light leading-relaxed space-y-3">
            {body}
          </div>
        </div>

        {/* Accent / visual element */}
        {accent && (
          <div
            className={`flex-1 flex justify-center transition-all duration-700 ease-out delay-200 ${
              isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            {accent}
          </div>
        )}
      </div>
    </section>
  )
}
