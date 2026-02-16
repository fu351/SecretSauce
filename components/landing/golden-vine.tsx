"use client"

import { useEffect, useRef, useState } from "react"

/**
 * A rich, organic golden vine SVG that grows as the user scrolls.
 * Features: main trunk with sinuous curves, branching tendrils with
 * leaf shapes, glowing nodes, and a warm gold-leaf aesthetic.
 * 
 * The vine runs the FULL height of the page and is absolutely positioned
 * to the center.  On mobile it is hidden.
 */
export function GoldenVine() {
  const [scrollProgress, setScrollProgress] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const handleScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const scrollTop = window.scrollY
        const docHeight =
          document.documentElement.scrollHeight - window.innerHeight
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

  const totalLength = 8000
  const visibleLength = totalLength * scrollProgress

  /* ---------- branches: tendrils that sprout from the main vine ---------- */
  const branches = [
    { at: 0.08, y: 620,  side: "right" as const, path: "M0,0 C12,-18 30,-28 52,-22 C68,-18 78,-30 90,-48", leafX: 88, leafY: -52, leafAngle: -30 },
    { at: 0.08, y: 650,  side: "left"  as const, path: "M0,0 C-10,-14 -26,-22 -44,-18 C-58,-14 -66,-28 -72,-40", leafX: -72, leafY: -44, leafAngle: 200 },
    { at: 0.17, y: 1150, side: "left"  as const, path: "M0,0 C-16,-20 -38,-32 -60,-26 C-76,-22 -88,-36 -98,-52", leafX: -98, leafY: -56, leafAngle: 210 },
    { at: 0.17, y: 1180, side: "right" as const, path: "M0,0 C14,-12 32,-24 50,-20 C64,-16 74,-30 82,-44", leafX: 80, leafY: -48, leafAngle: -20 },
    { at: 0.27, y: 1800, side: "right" as const, path: "M0,0 C18,-22 44,-34 70,-28 C86,-24 98,-40 108,-58", leafX: 106, leafY: -62, leafAngle: -25 },
    { at: 0.27, y: 1840, side: "left"  as const, path: "M0,0 C-12,-16 -30,-26 -48,-22", leafX: -48, leafY: -26, leafAngle: 195 },
    { at: 0.36, y: 2400, side: "left"  as const, path: "M0,0 C-18,-24 -40,-36 -66,-30 C-82,-26 -94,-42 -104,-58", leafX: -104, leafY: -62, leafAngle: 215 },
    { at: 0.36, y: 2430, side: "right" as const, path: "M0,0 C10,-14 28,-22 46,-18", leafX: 46, leafY: -22, leafAngle: -15 },
    { at: 0.47, y: 3100, side: "right" as const, path: "M0,0 C20,-26 48,-38 76,-32 C92,-28 104,-44 114,-62", leafX: 112, leafY: -66, leafAngle: -30 },
    { at: 0.47, y: 3140, side: "left"  as const, path: "M0,0 C-14,-18 -34,-28 -54,-24 C-68,-20 -78,-34 -86,-48", leafX: -86, leafY: -52, leafAngle: 205 },
    { at: 0.57, y: 3800, side: "left"  as const, path: "M0,0 C-16,-22 -38,-34 -62,-28 C-78,-24 -90,-40 -100,-56", leafX: -100, leafY: -60, leafAngle: 210 },
    { at: 0.57, y: 3830, side: "right" as const, path: "M0,0 C12,-14 30,-24 50,-20", leafX: 50, leafY: -24, leafAngle: -10 },
    { at: 0.67, y: 4500, side: "right" as const, path: "M0,0 C18,-24 44,-36 72,-30 C88,-26 100,-42 110,-60", leafX: 108, leafY: -64, leafAngle: -25 },
    { at: 0.67, y: 4540, side: "left"  as const, path: "M0,0 C-14,-18 -34,-28 -56,-22 C-70,-18 -80,-32 -88,-46", leafX: -88, leafY: -50, leafAngle: 200 },
    { at: 0.77, y: 5200, side: "left"  as const, path: "M0,0 C-18,-22 -42,-34 -68,-28 C-84,-24 -96,-40 -106,-56", leafX: -106, leafY: -60, leafAngle: 215 },
    { at: 0.77, y: 5230, side: "right" as const, path: "M0,0 C10,-12 26,-20 44,-16", leafX: 44, leafY: -20, leafAngle: -10 },
    { at: 0.87, y: 5900, side: "right" as const, path: "M0,0 C16,-20 40,-30 64,-24 C80,-20 92,-36 102,-52", leafX: 100, leafY: -56, leafAngle: -30 },
    { at: 0.87, y: 5940, side: "left"  as const, path: "M0,0 C-12,-16 -30,-26 -50,-20 C-66,-16 -76,-30 -84,-44", leafX: -84, leafY: -48, leafAngle: 205 },
  ]

  /* ---------- glowing nodes along the main vine ---------- */
  const nodes = [
    { y: 560,  at: 0.06, size: 5 },
    { y: 1100, at: 0.15, size: 6 },
    { y: 1750, at: 0.25, size: 5 },
    { y: 2350, at: 0.34, size: 6 },
    { y: 3050, at: 0.45, size: 5 },
    { y: 3750, at: 0.55, size: 6 },
    { y: 4450, at: 0.65, size: 5 },
    { y: 5150, at: 0.75, size: 6 },
    { y: 5850, at: 0.85, size: 5 },
    { y: 6300, at: 0.92, size: 7 },
  ]

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 z-[1] hidden md:block"
      aria-hidden="true"
    >
      <svg
        width="400"
        height="6600"
        viewBox="0 0 400 6600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="opacity-70"
      >
        <defs>
          {/* Gold gradient for the main trunk */}
          <linearGradient id="vineGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E8C84A" />
            <stop offset="40%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#A68523" />
          </linearGradient>

          {/* Warm glow filter for vine */}
          <filter id="vineGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="blur" in2="SourceGraphic" operator="over" />
          </filter>

          {/* Strong glow for nodes */}
          <filter id="nodeGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Leaf shape */}
          <path
            id="leafShape"
            d="M0,-14 C6,-12 10,-6 10,0 C10,6 6,12 0,14 C-4,10 -6,4 -6,0 C-6,-4 -4,-10 0,-14Z"
            fill="url(#vineGold)"
          />

          {/* Radial glow for ambient warmth */}
          <radialGradient id="warmGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ====== Ambient warm glow spots along vine ====== */}
        {nodes.map((node, i) => {
          const opacity = scrollProgress > node.at
            ? Math.min(1, (scrollProgress - node.at) / 0.04) * 0.35
            : 0
          return (
            <circle
              key={`glow-${i}`}
              cx="200"
              cy={node.y}
              r="60"
              fill="url(#warmGlow)"
              opacity={opacity}
              style={{ transition: "opacity 0.6s ease-out" }}
            />
          )
        })}

        {/* ====== Main vine trunk – sinuous S-curves ====== */}
        <path
          d={`
            M 200,0
            C 200,120 194,250 198,380
            C 202,510 210,580 204,660
            C 198,740 188,850 196,960
            C 204,1070 214,1120 206,1220
            C 198,1320 186,1420 194,1520
            C 202,1620 216,1680 208,1780
            C 200,1880 186,1960 194,2060
            C 202,2160 218,2220 210,2320
            C 202,2420 184,2520 194,2620
            C 204,2720 220,2780 212,2880
            C 204,2980 186,3060 194,3160
            C 202,3260 218,3320 210,3420
            C 202,3520 184,3620 194,3720
            C 204,3820 220,3880 212,3980
            C 204,4080 186,4160 194,4260
            C 202,4360 218,4420 210,4520
            C 202,4620 184,4720 194,4820
            C 204,4920 220,4980 212,5080
            C 204,5180 186,5260 194,5360
            C 202,5460 218,5520 210,5620
            C 202,5720 192,5820 196,5920
            C 200,6020 202,6140 200,6280
            C 200,6400 200,6500 200,6600
          `}
          stroke="url(#vineGold)"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter="url(#vineGlow)"
          strokeDasharray={totalLength}
          strokeDashoffset={totalLength - visibleLength}
          style={{ transition: "stroke-dashoffset 0.08s linear" }}
        />

        {/* Thinner secondary vine strand for depth */}
        <path
          d={`
            M 200,100
            C 204,230 196,360 200,490
            C 204,620 210,700 206,800
            C 202,900 192,1000 198,1100
            C 204,1200 212,1300 206,1400
            C 200,1500 190,1600 196,1700
            C 202,1800 214,1900 208,2000
            C 202,2100 190,2200 196,2300
            C 202,2400 214,2500 208,2600
            C 202,2700 190,2800 196,2900
            C 202,3000 214,3100 208,3200
            C 202,3300 190,3400 196,3500
            C 202,3600 214,3700 208,3800
            C 202,3900 190,4000 196,4100
            C 202,4200 214,4300 208,4400
            C 202,4500 190,4600 196,4700
            C 202,4800 214,4900 208,5000
            C 202,5100 190,5200 196,5300
            C 202,5400 214,5500 208,5600
            C 202,5700 194,5800 198,5900
            C 202,6000 200,6200 200,6400
          `}
          stroke="#D4AF37"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.25"
          strokeDasharray={totalLength}
          strokeDashoffset={totalLength - visibleLength}
          style={{ transition: "stroke-dashoffset 0.08s linear" }}
        />

        {/* ====== Branches with leaves ====== */}
        {branches.map((branch, i) => {
          const branchProgress = Math.max(
            0,
            Math.min(1, (scrollProgress - branch.at) / 0.06)
          )
          const branchLen = 350
          return (
            <g
              key={i}
              transform={`translate(200, ${branch.y})`}
              opacity={branchProgress}
              style={{ transition: "opacity 0.4s ease-out" }}
            >
              {/* Branch tendril */}
              <path
                d={branch.path}
                stroke="#D4AF37"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                opacity={0.6}
                strokeDasharray={branchLen}
                strokeDashoffset={branchLen - branchLen * branchProgress}
                style={{ transition: "stroke-dashoffset 0.3s ease-out" }}
              />
              {/* Leaf at the end */}
              {branchProgress > 0.5 && (
                <g
                  transform={`translate(${branch.leafX}, ${branch.leafY}) rotate(${branch.leafAngle})`}
                  opacity={Math.min(1, (branchProgress - 0.5) * 2) * 0.7}
                  style={{ transition: "opacity 0.4s ease-out" }}
                >
                  <use href="#leafShape" />
                </g>
              )}
              {/* Small extra leaves along some branches */}
              {branchProgress > 0.7 && Math.abs(branch.leafX) > 60 && (
                <g
                  transform={`translate(${branch.leafX * 0.5}, ${branch.leafY * 0.5}) rotate(${branch.leafAngle + 20}) scale(0.6)`}
                  opacity={Math.min(1, (branchProgress - 0.7) * 3.3) * 0.5}
                  style={{ transition: "opacity 0.4s ease-out" }}
                >
                  <use href="#leafShape" />
                </g>
              )}
            </g>
          )
        })}

        {/* ====== Glowing nodes along trunk ====== */}
        {nodes.map((node, i) => {
          const nodeOpacity =
            scrollProgress > node.at
              ? Math.min(1, (scrollProgress - node.at) / 0.04)
              : 0
          return (
            <g key={`node-${i}`}>
              {/* Outer glow */}
              <circle
                cx="200"
                cy={node.y}
                r={node.size + 4}
                fill="#D4AF37"
                opacity={nodeOpacity * 0.3}
                filter="url(#nodeGlow)"
                style={{ transition: "opacity 0.5s ease-out" }}
              />
              {/* Main node */}
              <circle
                cx="200"
                cy={node.y}
                r={node.size}
                fill="#D4AF37"
                opacity={nodeOpacity * 0.8}
                style={{ transition: "opacity 0.5s ease-out" }}
              />
              {/* Bright core */}
              <circle
                cx="200"
                cy={node.y}
                r={node.size * 0.4}
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
