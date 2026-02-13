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
        const progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0
        setScrollProgress(progress)
      })
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()

    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Main vine path length
  const totalLength = 6000
  const visibleLength = totalLength * scrollProgress

  // Branch offsets - they appear at specific scroll points
  const branches = [
    { startAt: 0.12, path: "M 0,0 C 20,-30 50,-20 70,-50", x: 52, y: 680, side: "right" },
    { startAt: 0.2, path: "M 0,0 C -25,-20 -45,-35 -65,-55", x: 48, y: 1150, side: "left" },
    { startAt: 0.32, path: "M 0,0 C 30,-15 55,-40 75,-60", x: 52, y: 1850, side: "right" },
    { startAt: 0.42, path: "M 0,0 C -20,-25 -50,-30 -70,-50", x: 48, y: 2450, side: "left" },
    { startAt: 0.55, path: "M 0,0 C 25,-20 60,-25 80,-45", x: 52, y: 3200, side: "right" },
    { startAt: 0.65, path: "M 0,0 C -30,-20 -55,-40 -75,-55", x: 48, y: 3850, side: "left" },
    { startAt: 0.75, path: "M 0,0 C 20,-30 45,-45 65,-60", x: 52, y: 4500, side: "right" },
    { startAt: 0.85, path: "M 0,0 C -25,-15 -50,-35 -70,-50", x: 48, y: 5100, side: "left" },
  ]

  // Dots/nodes that glow along the vine
  const nodes = [
    { y: 400, at: 0.06 },
    { y: 900, at: 0.15 },
    { y: 1500, at: 0.25 },
    { y: 2100, at: 0.35 },
    { y: 2800, at: 0.46 },
    { y: 3500, at: 0.58 },
    { y: 4200, at: 0.7 },
    { y: 4800, at: 0.8 },
    { y: 5400, at: 0.9 },
  ]

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 z-0 hidden md:block"
      aria-hidden="true"
    >
      <svg
        width="200"
        height="5800"
        viewBox="0 0 200 5800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="opacity-60"
      >
        <defs>
          <linearGradient id="vineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4AF37" />
            <stop offset="50%" stopColor="#C5A028" />
            <stop offset="100%" stopColor="#B8962E" />
          </linearGradient>
          <filter id="vineGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
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

        {/* Main vine trunk */}
        <path
          d="M 100,0 C 100,200 95,400 100,600 C 105,800 98,1000 100,1200 C 102,1400 96,1600 100,1800 C 104,2000 97,2200 100,2400 C 103,2600 98,2800 100,3000 C 102,3200 96,3400 100,3600 C 104,3800 98,4000 100,4200 C 102,4400 97,4600 100,4800 C 103,5000 98,5200 100,5400 C 102,5600 100,5800 100,5800"
          stroke="url(#vineGradient)"
          strokeWidth="2"
          strokeLinecap="round"
          filter="url(#vineGlow)"
          strokeDasharray={totalLength}
          strokeDashoffset={totalLength - visibleLength}
          style={{ transition: "stroke-dashoffset 0.1s ease-out" }}
        />

        {/* Branches */}
        {branches.map((branch, i) => {
          const branchProgress = Math.max(0, Math.min(1, (scrollProgress - branch.startAt) / 0.08))
          const branchLength = 200
          return (
            <g key={i} transform={`translate(${branch.x === 52 ? 105 : 95}, ${branch.y})`}>
              <path
                d={branch.path}
                stroke="#D4AF37"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                opacity={branchProgress * 0.5}
                strokeDasharray={branchLength}
                strokeDashoffset={branchLength - branchLength * branchProgress}
                style={{ transition: "stroke-dashoffset 0.3s ease-out, opacity 0.3s ease-out" }}
              />
              {/* Leaf node at branch end */}
              {branchProgress > 0.8 && (
                <circle
                  cx={branch.side === "right" ? 70 : -65}
                  cy={-50}
                  r="3"
                  fill="#D4AF37"
                  opacity={branchProgress * 0.6}
                  filter="url(#nodeGlow)"
                />
              )}
            </g>
          )
        })}

        {/* Glowing nodes along vine */}
        {nodes.map((node, i) => {
          const nodeOpacity = scrollProgress > node.at ? Math.min(1, (scrollProgress - node.at) / 0.05) : 0
          return (
            <g key={`node-${i}`}>
              <circle
                cx="100"
                cy={node.y}
                r="4"
                fill="#D4AF37"
                opacity={nodeOpacity * 0.8}
                filter="url(#nodeGlow)"
                style={{ transition: "opacity 0.5s ease-out" }}
              />
              <circle
                cx="100"
                cy={node.y}
                r="2"
                fill="#F5E6A3"
                opacity={nodeOpacity}
                style={{ transition: "opacity 0.5s ease-out" }}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
