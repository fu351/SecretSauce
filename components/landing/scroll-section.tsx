"use client"

import { useEffect, useRef, useState } from "react"

interface ScrollSectionProps {
  sectionLabel: string
  headline: string
  children: React.ReactNode
  align?: "left" | "right"
  closingLine?: string
}

export function ScrollSection({
  sectionLabel,
  headline,
  children,
  align = "left",
  closingLine,
}: ScrollSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
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
      ref={ref}
      className={`relative min-h-screen flex flex-col justify-center px-6 md:px-12 lg:px-20 py-24 md:py-32 transition-all duration-700 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      <div
        className={`max-w-xl ${
          align === "right"
            ? "ml-auto mr-0 md:mr-[10%] text-left"
            : "mr-auto ml-0 md:ml-[10%] text-left"
        }`}
      >
        <p className="text-xs tracking-[0.25em] uppercase mb-4 text-[hsl(45,32%,52%)] font-light">
          {sectionLabel}
        </p>

        <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-light leading-tight mb-6 md:mb-8 text-balance text-foreground">
          {headline}
        </h2>

        <div className="space-y-4 text-sm md:text-base leading-relaxed font-light text-muted-foreground">
          {children}
        </div>

        {closingLine && (
          <p className="mt-8 text-sm md:text-base font-light tracking-wide text-foreground/60 italic">
            {closingLine}
          </p>
        )}
      </div>
    </section>
  )
}
