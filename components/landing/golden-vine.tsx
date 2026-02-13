"use client"

import { useEffect, useRef, useState } from "react"

export function GoldenVine() {
  const [scrollProgress, setScrollProgress] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const handleScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const scrollTop = window.scrollY
        const docHeight = document.documentElement.scrollHeight - window.innerHeight
        const progress = docHeight > 0 ? scrollTop / docHeight : 0
        setScrollProgress(Math.min(1, Math.max(0, progress)))
      })
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()

    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const totalLength = 6000
  const visibleLength = totalLength * scrollProgress

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-0 z-10 h-full -translate-x-1/2"
      aria-hidden="true"
    >
      <svg
        width="120"
        height="100%"
        viewBox="0 0 120 6000"
        preserveAspectRatio="xMidYMin slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full"
      >
        <defs>
          <linearGradient id="vineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4AF37" />
            <stop offset="50%" stopColor="#C9A84C" />
            <stop offset="100%" stopColor="#B8962E" />
          </linearGradient>
          <filter id="vineGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="nodeGlow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Glow layer */}
        <path
          d="M60 0 C60 200, 55 400, 60 600 S70 900, 55 1100 S45 1400, 60 1600 S75 1900, 55 2100 S40 2400, 60 2600 S80 2900, 60 3100 S40 3400, 55 3600 S70 3900, 60 4100 S50 4400, 60 4600 S65 4900, 60 5100 S55 5400, 60 5600 L60 6000"
          stroke="#D4AF37"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          opacity="0.15"
          filter="url(#vineGlow)"
          strokeDasharray={totalLength}
          strokeDashoffset={totalLength - visibleLength}
          style={{ transition: "stroke-dashoffset 0.1s linear" }}
        />

        {/* Main vine */}
        <path
          d="M60 0 C60 200, 55 400, 60 600 S70 900, 55 1100 S45 1400, 60 1600 S75 1900, 55 2100 S40 2400, 60 2600 S80 2900, 60 3100 S40 3400, 55 3600 S70 3900, 60 4100 S50 4400, 60 4600 S65 4900, 60 5100 S55 5400, 60 5600 L60 6000"
          stroke="url(#vineGradient)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
          strokeDasharray={totalLength}
          strokeDashoffset={totalLength - visibleLength}
          style={{ transition: "stroke-dashoffset 0.1s linear" }}
        />

        {/* Branch nodes - appear as vine grows */}
        {[750, 1350, 1950, 2550, 3150, 3750, 4350, 4950, 5550].map(
          (y, i) => {
            const nodeProgress = y / totalLength
            const isVisible = scrollProgress >= nodeProgress
            const xPositions = [35, 85, 40, 80, 35, 85, 40, 80, 60]
            const x = xPositions[i] ?? 60

            return (
              <g key={i}>
                {/* Small branch line from vine to node */}
                <line
                  x1="60"
                  y1={y}
                  x2={x}
                  y2={y}
                  stroke="#D4AF37"
                  strokeWidth="1"
                  opacity={isVisible ? 0.4 : 0}
                  style={{ transition: "opacity 0.6s ease-out" }}
                />
                {/* Node circle */}
                <circle
                  cx={x}
                  cy={y}
                  r={isVisible ? 4 : 0}
                  fill="#D4AF37"
                  opacity={isVisible ? 0.8 : 0}
                  filter="url(#nodeGlow)"
                  style={{
                    transition: "r 0.6s ease-out, opacity 0.6s ease-out",
                  }}
                />
              </g>
            )
          }
        )}
      </svg>
    </div>
  )
}
