"use client"

import { useEffect, useRef, useState } from "react"

const priceTags = [
  { price: "$6.99", x: "right-[8%]", y: "top-[15%]", delay: "0s" },
  { price: "$8.49", x: "right-[15%]", y: "top-[35%]", delay: "0.3s" },
  { price: "$12.99", x: "right-[5%]", y: "top-[60%]", delay: "0.6s" },
  { price: "$6.99", x: "right-[20%]", y: "top-[80%]", delay: "0.9s" },
]

export function FloatingPriceTags() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true)
      },
      { threshold: 0.2 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none overflow-hidden hidden md:block">
      {priceTags.map((tag, i) => (
        <div
          key={i}
          className={`absolute ${tag.x} ${tag.y} transition-all duration-700 ease-out ${
            isVisible ? "opacity-40 translate-y-0" : "opacity-0 translate-y-4"
          }`}
          style={{ transitionDelay: tag.delay }}
        >
          <div className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-3 py-1.5 backdrop-blur-sm">
            <span className="text-sm font-mono text-[#D4AF37]/70">{tag.price}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
