"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"

/* ──────────────────────────────────────────────────────────────
   Golden Vine — fully-visible ornate SVG vine.

   The vine is ALWAYS rendered in dim gold.  As the user scrolls,
   a bright glowing "sauce flow" highlight traces through the
   trunk and branches — like liquid gold flowing through channels.

   The vine terminates exactly at the final CTA bottle.
   ────────────────────────────────────────────────────────────── */

const VW = 200
const VH = 8400 // tall to span full content

/* ── Leaf shape reused via <use> ── */
const LEAF_D = "M0,0 C-4,-10 -2,-22 0,-28 C2,-22 4,-10 0,0"
const LEAF_VEIN = "M0,-3 L0,-24"

/* ── Main trunk: hand-crafted organic S-curves ──
   The trunk snakes left–right with varying amplitude
   so it never feels mechanical.  Each segment is a
   cubic Bézier (C command) continuing from the previous.  */
const TRUNK = `
M100,0
C100,70 100,100 97,180
C92,300 130,380 124,520
C118,640 72,740 78,880
C84,1020 134,1120 126,1280
C118,1420 66,1540 74,1700
C82,1860 140,1960 130,2140
C120,2300 60,2420 72,2600
C84,2760 148,2860 134,3040
C120,3200 56,3320 70,3500
C84,3660 142,3760 128,3940
C114,4100 58,4220 74,4400
C90,4560 146,4660 130,4840
C114,5000 54,5120 72,5300
C90,5460 138,5560 122,5740
C108,5900 66,6000 80,6180
C94,6340 132,6440 118,6600
C106,6760 58,6860 76,7020
C88,7140 116,7220 108,7360
C104,7460 102,7540 100,7640
C100,7720 100,7800 100,7900
C100,7980 100,8060 100,8120
`

/* ── Secondary thinner strand weaving alongside trunk ── */
const STRAND2 = `
M103,40
C106,160 96,240 100,380
C104,500 126,580 120,700
C114,820 76,920 82,1060
C88,1180 130,1280 122,1440
C114,1580 70,1700 78,1860
C86,2000 136,2100 126,2280
C116,2440 64,2560 76,2740
C88,2900 144,3000 130,3180
C116,3340 60,3460 74,3640
C88,3800 138,3900 124,4080
C110,4240 62,4360 78,4540
C94,4700 142,4800 126,4980
C110,5140 58,5260 76,5440
C94,5600 134,5700 118,5880
C104,6040 70,6140 84,6320
C98,6480 128,6580 114,6740
C102,6880 62,6980 80,7160
C92,7280 112,7360 104,7500
C100,7600 102,7680 101,7800
`

/* ── Branch data: y-position, side, and unique shape params ── */
interface BranchDef {
  y: number
  side: 1 | -1
  d: string          // path data (relative to trunk x)
  leaves: { dx: number; dy: number; angle: number; scale: number }[]
  subBranches?: string[]
  tendrils?: string[]
}

function mkBranch(
  y: number, side: 1 | -1, reach: number, lift: number,
  curviness: number,
  leaves: { dx: number; dy: number; angle: number; scale: number }[],
  subBranches?: string[],
  tendrils?: string[]
): BranchDef {
  // Build a graceful branch curving outward and slightly up
  const s = side
  const x1 = s * reach * 0.3
  const y1 = -lift * 0.4
  const x2 = s * reach * 0.7
  const y2 = -lift * 0.8
  const x3 = s * reach
  const y3 = -lift
  const cp1x = x1 + s * curviness * 8
  const cp1y = y1 - curviness * 12
  const cp2x = x2 + s * curviness * 4
  const cp2y = y2 - curviness * 6

  const d = `M0,0 C${cp1x},${cp1y} ${x1},${y1} ${x2},${y2} S${cp2x},${cp2y} ${x3},${y3}`

  return { y, side, d, leaves, subBranches, tendrils }
}

/* ── All branches — each unique ── */
const BRANCHES: BranchDef[] = [
  // Section 1 area (y ~400–700)
  mkBranch(420, 1, 55, 30, 1.2,
    [{ dx: 50, dy: -28, angle: -25, scale: 1 }, { dx: 32, dy: -16, angle: -50, scale: 0.7 }],
    ["M30,-14 C38,-22 46,-18 50,-26"],
    ["M50,-28 C56,-32 58,-40 54,-46 C50,-52 44,-50 42,-44"]
  ),
  mkBranch(480, -1, 42, 20, 0.8,
    [{ dx: -38, dy: -18, angle: 155, scale: 0.85 }],
    undefined,
    ["M-38,-18 C-44,-24 -42,-34 -36,-38"]
  ),
  mkBranch(620, -1, 60, 35, 1.5,
    [{ dx: -56, dy: -32, angle: 160, scale: 1.1 }, { dx: -34, dy: -18, angle: 135, scale: 0.65 }],
    ["M-34,-18 C-42,-26 -52,-20 -58,-28", "M-56,-32 C-62,-40 -58,-52 -50,-56"],
    ["M-20,-10 C-26,-16 -24,-26 -18,-30"]
  ),
  mkBranch(700, 1, 48, 24, 1.0,
    [{ dx: 44, dy: -22, angle: -35, scale: 0.9 }]
  ),

  // Section 2 area (y ~900–1200)
  mkBranch(920, 1, 65, 38, 1.4,
    [{ dx: 60, dy: -36, angle: -30, scale: 1.15 }, { dx: 38, dy: -20, angle: -55, scale: 0.7 }],
    ["M38,-20 C48,-30 56,-24 64,-32"],
    ["M60,-36 C66,-42 64,-52 58,-56 C52,-60 48,-54 50,-48"]
  ),
  mkBranch(1000, -1, 52, 28, 1.1,
    [{ dx: -48, dy: -26, angle: 150, scale: 0.95 }, { dx: -28, dy: -14, angle: 130, scale: 0.6 }],
    ["M-28,-14 C-36,-22 -44,-16 -50,-24"],
  ),
  mkBranch(1160, -1, 58, 32, 1.3,
    [{ dx: -54, dy: -30, angle: 155, scale: 1 }],
    ["M-32,-16 C-40,-24 -50,-18 -56,-26"],
    ["M-54,-30 C-60,-36 -58,-48 -50,-52"]
  ),
  mkBranch(1240, 1, 44, 22, 0.9,
    [{ dx: 40, dy: -20, angle: -40, scale: 0.8 }]
  ),

  // Section 3 area (y ~1500–1800)
  mkBranch(1540, -1, 62, 36, 1.5,
    [{ dx: -58, dy: -34, angle: 162, scale: 1.1 }, { dx: -36, dy: -18, angle: 138, scale: 0.7 }],
    ["M-36,-18 C-46,-28 -54,-22 -62,-30", "M-58,-34 C-66,-42 -62,-54 -52,-58"],
    ["M-22,-12 C-28,-18 -26,-28 -20,-32", "M-62,-30 C-68,-38 -66,-48 -60,-52"]
  ),
  mkBranch(1660, 1, 50, 26, 1.0,
    [{ dx: 46, dy: -24, angle: -32, scale: 0.9 }],
    undefined,
    ["M46,-24 C52,-30 50,-40 44,-44"]
  ),
  mkBranch(1780, 1, 58, 34, 1.3,
    [{ dx: 54, dy: -32, angle: -28, scale: 1.05 }, { dx: 32, dy: -16, angle: -52, scale: 0.65 }],
    ["M32,-16 C40,-24 50,-18 56,-26"],
  ),
  mkBranch(1860, -1, 46, 22, 0.85,
    [{ dx: -42, dy: -20, angle: 145, scale: 0.8 }],
    undefined,
    ["M-42,-20 C-48,-26 -46,-36 -40,-40"]
  ),

  // Section 4 area (y ~2200–2600)
  mkBranch(2280, -1, 64, 38, 1.6,
    [{ dx: -60, dy: -36, angle: 158, scale: 1.15 }, { dx: -38, dy: -20, angle: 132, scale: 0.7 }],
    ["M-38,-20 C-48,-30 -56,-24 -64,-32"],
    ["M-60,-36 C-66,-44 -64,-56 -56,-60"]
  ),
  mkBranch(2420, 1, 54, 30, 1.2,
    [{ dx: 50, dy: -28, angle: -34, scale: 1 }],
    ["M28,-14 C36,-22 46,-16 52,-24"],
  ),
  mkBranch(2560, 1, 48, 24, 0.9,
    [{ dx: 44, dy: -22, angle: -38, scale: 0.85 }],
    undefined,
    ["M44,-22 C50,-28 48,-38 42,-42"]
  ),

  // Section 5 area (y ~2900–3400)
  mkBranch(2940, -1, 60, 34, 1.4,
    [{ dx: -56, dy: -32, angle: 156, scale: 1.08 }, { dx: -34, dy: -16, angle: 134, scale: 0.65 }],
    ["M-34,-16 C-42,-24 -52,-18 -58,-26"],
    ["M-56,-32 C-62,-38 -60,-50 -52,-54"]
  ),
  mkBranch(3100, 1, 56, 32, 1.3,
    [{ dx: 52, dy: -30, angle: -30, scale: 1.05 }, { dx: 30, dy: -14, angle: -54, scale: 0.6 }],
    ["M30,-14 C38,-22 48,-16 54,-24", "M52,-30 C58,-38 56,-50 48,-54"],
  ),
  mkBranch(3260, -1, 44, 20, 0.8,
    [{ dx: -40, dy: -18, angle: 148, scale: 0.8 }]
  ),
  mkBranch(3380, 1, 50, 28, 1.1,
    [{ dx: 46, dy: -26, angle: -36, scale: 0.95 }],
    undefined,
    ["M46,-26 C52,-32 50,-42 44,-46"]
  ),

  // Section 6 area (y ~3800–4200)
  mkBranch(3860, 1, 62, 36, 1.5,
    [{ dx: 58, dy: -34, angle: -28, scale: 1.12 }, { dx: 36, dy: -18, angle: -52, scale: 0.7 }],
    ["M36,-18 C44,-26 54,-20 60,-28"],
    ["M58,-34 C64,-40 62,-52 54,-56", "M24,-10 C30,-16 28,-26 22,-30"]
  ),
  mkBranch(4020, -1, 56, 30, 1.2,
    [{ dx: -52, dy: -28, angle: 154, scale: 1 }],
    ["M-30,-14 C-38,-22 -48,-16 -54,-24"],
  ),
  mkBranch(4180, -1, 48, 24, 0.9,
    [{ dx: -44, dy: -22, angle: 146, scale: 0.85 }],
    undefined,
    ["M-44,-22 C-50,-28 -48,-38 -42,-42"]
  ),

  // Section 7 area (y ~4500–4900)
  mkBranch(4520, -1, 58, 32, 1.3,
    [{ dx: -54, dy: -30, angle: 158, scale: 1.05 }, { dx: -32, dy: -16, angle: 136, scale: 0.65 }],
    ["M-32,-16 C-40,-24 -50,-18 -56,-26"],
  ),
  mkBranch(4700, 1, 52, 28, 1.1,
    [{ dx: 48, dy: -26, angle: -34, scale: 0.95 }],
    ["M26,-12 C34,-20 44,-14 50,-22"],
    ["M48,-26 C54,-32 52,-42 46,-46"]
  ),
  mkBranch(4840, 1, 46, 22, 0.85,
    [{ dx: 42, dy: -20, angle: -40, scale: 0.8 }]
  ),

  // Section 8 area (y ~5200–5600)
  mkBranch(5240, -1, 60, 34, 1.4,
    [{ dx: -56, dy: -32, angle: 160, scale: 1.1 }, { dx: -34, dy: -18, angle: 140, scale: 0.7 }],
    ["M-34,-18 C-44,-28 -52,-22 -60,-30"],
    ["M-56,-32 C-62,-40 -60,-52 -52,-56"]
  ),
  mkBranch(5440, 1, 54, 30, 1.2,
    [{ dx: 50, dy: -28, angle: -32, scale: 1 }],
    ["M28,-14 C36,-22 46,-16 52,-24"],
  ),
  mkBranch(5620, -1, 42, 20, 0.8,
    [{ dx: -38, dy: -18, angle: 150, scale: 0.8 }],
    undefined,
    ["M-38,-18 C-44,-24 -42,-34 -36,-38"]
  ),

  // Converging area near bottle (y ~5900–6400)
  mkBranch(5920, 1, 44, 24, 1.0,
    [{ dx: 40, dy: -22, angle: -36, scale: 0.75 }],
    undefined,
    ["M40,-22 C44,-28 42,-36 38,-40"]
  ),
  mkBranch(6060, -1, 40, 20, 0.8,
    [{ dx: -36, dy: -18, angle: 148, scale: 0.7 }]
  ),
  mkBranch(6200, 1, 36, 16, 0.7,
    [{ dx: 32, dy: -14, angle: -40, scale: 0.6 }]
  ),
  mkBranch(6340, -1, 34, 14, 0.6,
    [{ dx: -30, dy: -12, angle: 145, scale: 0.55 }]
  ),

  // Final small branches approaching bottle
  mkBranch(6500, 1, 28, 12, 0.5,
    [{ dx: 24, dy: -10, angle: -42, scale: 0.5 }]
  ),
  mkBranch(6600, -1, 26, 10, 0.4,
    [{ dx: -22, dy: -8, angle: 148, scale: 0.45 }]
  ),
]

/* ── Curling tendrils (decorative spirals at various y) ── */
const CURLING_TENDRILS = [
  "M100,340 C108,330 112,318 108,308 C104,298 96,296 94,304",
  "M80,760 C70,750 64,736 68,726 C72,716 82,714 84,722",
  "M128,1100 C136,1090 142,1076 138,1066 C134,1056 124,1054 122,1062",
  "M70,1460 C60,1450 54,1436 58,1426 C62,1416 72,1414 74,1422",
  "M134,1940 C142,1930 148,1916 144,1906 C140,1896 130,1894 128,1902",
  "M66,2360 C56,2350 50,2336 54,2326 C58,2316 68,2314 70,2322",
  "M138,2780 C146,2770 152,2756 148,2746 C144,2736 134,2734 132,2742",
  "M68,3180 C58,3170 52,3156 56,3146 C60,3136 70,3134 72,3142",
  "M136,3620 C144,3610 150,3596 146,3586 C142,3576 132,3574 130,3582",
  "M70,4060 C60,4050 54,4036 58,4026 C62,4016 72,4014 74,4022",
  "M132,4480 C140,4470 146,4456 142,4446 C138,4436 128,4434 126,4442",
  "M72,4920 C62,4910 56,4896 60,4886 C64,4876 74,4874 76,4882",
  "M128,5380 C136,5370 142,5356 138,5346 C134,5336 124,5334 122,5342",
  "M76,5780 C66,5770 60,5756 64,5746 C68,5736 78,5734 80,5742",
  "M112,6120 C118,6112 120,6100 116,6092 C112,6084 106,6086 104,6094",
  "M92,6420 C86,6412 82,6400 86,6392 C90,6384 96,6386 98,6394",
]

/* ── Glow nodes along the trunk ── */
const GLOW_NODES = [
  { y: 380, r: 3 }, { y: 720, r: 3.5 }, { y: 1040, r: 3 },
  { y: 1360, r: 3.5 }, { y: 1700, r: 3 }, { y: 2040, r: 4 },
  { y: 2380, r: 3 }, { y: 2740, r: 3.5 }, { y: 3080, r: 3 },
  { y: 3440, r: 3.5 }, { y: 3800, r: 3 }, { y: 4160, r: 4 },
  { y: 4540, r: 3 }, { y: 4900, r: 3.5 }, { y: 5260, r: 3 },
  { y: 5620, r: 3.5 }, { y: 5980, r: 3 }, { y: 6340, r: 3.5 },
  { y: 6660, r: 4 },
]

/* ── Compute trunk x at a given y for positioning branches ── */
function trunkXAtY(y: number): number {
  // Parse a few key waypoints from the trunk path and interpolate
  // We use a simplified oscillating model matching the trunk shape
  const t = y / VH
  const wave1 = Math.sin(t * Math.PI * 10) * 30
  const wave2 = Math.sin(t * Math.PI * 5.5) * 15
  const converge = t > 0.85 ? (t - 0.85) / 0.15 : 0
  return 100 + (wave1 + wave2) * (1 - converge * converge)
}

export function GoldenVine() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const containerH = containerRef.current.offsetHeight
    const viewH = window.innerHeight
    const raw = (viewH - rect.top) / (containerH + viewH)
    setProgress(Math.max(0, Math.min(1, raw)))
  }, [])

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  // Compute total trunk length for dash animation (approximate)
  const trunkLen = 12000 // generous estimate for the long curvy path
  // The sauce flow position in path-length units
  const flowLen = progress * trunkLen
  // Trail length — the sauce leaves a glowing trail behind
  const trailLen = trunkLen * 0.15

  // Build branch paths positioned at trunk
  const branchPaths = useMemo(() => {
    return BRANCHES.map((b) => {
      const tx = trunkXAtY(b.y)
      return { ...b, tx }
    })
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none hidden md:block" aria-hidden="true">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Leaf shape */}
          <g id="vineLeaf">
            <path d={LEAF_D} fill="currentColor" opacity="0.7" />
            <path d={LEAF_VEIN} fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />
          </g>

          {/* Glow filters */}
          <filter id="sauceGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="b2" />
            <feMerge>
              <feMergeNode in="b1" />
              <feMergeNode in="b2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="wideGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
          </filter>

          <filter id="nodeGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
          </filter>

          {/* Leading-edge gradient for the sauce flow */}
          <linearGradient id="sauceFlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0" />
            <stop offset="70%" stopColor="#D4AF37" stopOpacity="0.55" />
            <stop offset="88%" stopColor="#FFCC44" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#FFF8DC" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* ═══ LAYER 1: Dim vine structure (always visible) ═══ */}
        <g opacity="0.12" style={{ color: "#D4AF37" }}>
          {/* Main trunk */}
          <path d={TRUNK} fill="none" stroke="#D4AF37" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Secondary strand */}
          <path d={STRAND2} fill="none" stroke="#D4AF37" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />

          {/* All branches */}
          {branchPaths.map((b, i) => (
            <g key={`br-dim-${i}`} transform={`translate(${b.tx},${b.y})`}>
              <path d={b.d} fill="none" stroke="#D4AF37" strokeWidth="1.3" strokeLinecap="round" />
              {b.subBranches?.map((sb, j) => (
                <path key={j} d={sb} fill="none" stroke="#D4AF37" strokeWidth="0.9" strokeLinecap="round" />
              ))}
              {b.tendrils?.map((t, j) => (
                <path key={j} d={t} fill="none" stroke="#D4AF37" strokeWidth="0.5" strokeLinecap="round" />
              ))}
              {b.leaves.map((l, j) => (
                <use
                  key={j}
                  href="#vineLeaf"
                  x={l.dx}
                  y={l.dy}
                  transform={`rotate(${l.angle} ${l.dx} ${l.dy}) scale(${l.scale})`}
                />
              ))}
            </g>
          ))}

          {/* Curling tendrils */}
          {CURLING_TENDRILS.map((d, i) => (
            <path key={`ct-${i}`} d={d} fill="none" stroke="#D4AF37" strokeWidth="0.6" strokeLinecap="round" />
          ))}

          {/* Dim nodes */}
          {GLOW_NODES.map((n, i) => (
            <circle key={`nd-${i}`} cx={trunkXAtY(n.y)} cy={n.y} r={n.r} fill="#D4AF37" />
          ))}
        </g>

        {/* ═══ LAYER 2: Ambient glow behind sauce trail on trunk ═══ */}
        <path
          d={TRUNK}
          fill="none"
          stroke="#D4AF37"
          strokeWidth="10"
          strokeLinecap="round"
          filter="url(#wideGlow)"
          opacity="0.07"
          strokeDasharray={`${flowLen} ${trunkLen}`}
          strokeDashoffset="0"
          style={{ transition: "stroke-dasharray 0.08s linear" }}
        />

        {/* ═══ LAYER 3: Sauce trail (bright gold flowing down) ═══ */}
        <path
          d={TRUNK}
          fill="none"
          stroke="#D4AF37"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.55"
          strokeDasharray={`${flowLen} ${trunkLen}`}
          strokeDashoffset="0"
          style={{ transition: "stroke-dasharray 0.08s linear" }}
        />

        {/* ═══ LAYER 4: Bright leading edge glow ═══ */}
        <path
          d={TRUNK}
          fill="none"
          stroke="#FFCC44"
          strokeWidth="1.8"
          strokeLinecap="round"
          filter="url(#sauceGlow)"
          opacity="0.75"
          strokeDasharray={`${trailLen} ${trunkLen}`}
          strokeDashoffset={`${-(flowLen - trailLen)}`}
          style={{ transition: "stroke-dashoffset 0.08s linear, stroke-dasharray 0.08s linear" }}
        />

        {/* ═══ LAYER 5: Bright core of leading edge ═══ */}
        <path
          d={TRUNK}
          fill="none"
          stroke="#FFF8DC"
          strokeWidth="0.8"
          strokeLinecap="round"
          filter="url(#sauceGlow)"
          opacity="0.6"
          strokeDasharray={`${trailLen * 0.3} ${trunkLen}`}
          strokeDashoffset={`${-(flowLen - trailLen * 0.3)}`}
          style={{ transition: "stroke-dashoffset 0.08s linear, stroke-dasharray 0.08s linear" }}
        />

        {/* ═══ LAYER 6: Secondary strand sauce flow ═══ */}
        <path
          d={STRAND2}
          fill="none"
          stroke="#D4AF37"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.3"
          strokeDasharray={`${flowLen * 0.95} ${trunkLen}`}
          strokeDashoffset="0"
          style={{ transition: "stroke-dasharray 0.08s linear" }}
        />

        {/* ═══ LAYER 7: Branches light up as sauce passes ═══ */}
        {branchPaths.map((b, i) => {
          const branchNorm = b.y / VH
          const isLit = progress > branchNorm * 0.92
          const intensity = isLit ? Math.min(1, (progress - branchNorm * 0.92) * 12) : 0

          return (
            <g
              key={`br-lit-${i}`}
              transform={`translate(${b.tx},${b.y})`}
              opacity={intensity}
              style={{ transition: "opacity 0.6s ease-out", color: "#D4AF37" }}
            >
              {/* Branch glow */}
              <path d={b.d} fill="none" stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              <path d={b.d} fill="none" stroke="#FFCC44" strokeWidth="0.8" strokeLinecap="round" filter="url(#sauceGlow)" opacity="0.4" />

              {/* Sub-branches */}
              {b.subBranches?.map((sb, j) => (
                <g key={j}>
                  <path d={sb} fill="none" stroke="#D4AF37" strokeWidth="1" strokeLinecap="round" opacity="0.45" />
                  <path d={sb} fill="none" stroke="#FFCC44" strokeWidth="0.5" strokeLinecap="round" filter="url(#sauceGlow)" opacity="0.3" />
                </g>
              ))}

              {/* Tendrils */}
              {b.tendrils?.map((t, j) => (
                <path key={j} d={t} fill="none" stroke="#FFCC44" strokeWidth="0.5" strokeLinecap="round" opacity="0.3" />
              ))}

              {/* Leaves glow */}
              {b.leaves.map((l, j) => (
                <use
                  key={j}
                  href="#vineLeaf"
                  x={l.dx}
                  y={l.dy}
                  transform={`rotate(${l.angle} ${l.dx} ${l.dy}) scale(${l.scale})`}
                  style={{ color: "#FFCC44" }}
                  opacity="0.6"
                />
              ))}
            </g>
          )
        })}

        {/* ═══ LAYER 8: Curling tendrils light up ═══ */}
        {CURLING_TENDRILS.map((d, i) => {
          const yMatch = d.match(/M[\d.]+,([\d.]+)/)
          const tendrilY = yMatch ? parseFloat(yMatch[1]) : 0
          const tendrilNorm = tendrilY / VH
          const isLit = progress > tendrilNorm * 0.92
          const opacity = isLit ? Math.min(1, (progress - tendrilNorm * 0.92) * 12) * 0.35 : 0

          return (
            <path
              key={`ct-lit-${i}`}
              d={d}
              fill="none"
              stroke="#FFCC44"
              strokeWidth="0.6"
              strokeLinecap="round"
              opacity={opacity}
              style={{ transition: "opacity 0.6s ease-out" }}
            />
          )
        })}

        {/* ═══ LAYER 9: Glowing nodes light up as sauce passes ═══ */}
        {GLOW_NODES.map((n, i) => {
          const nodeNorm = n.y / VH
          const isLit = progress > nodeNorm * 0.92
          const intensity = isLit ? Math.min(1, (progress - nodeNorm * 0.92) * 14) : 0
          const nx = trunkXAtY(n.y)

          return (
            <g key={`nl-${i}`} opacity={intensity} style={{ transition: "opacity 0.5s ease-out" }}>
              <circle cx={nx} cy={n.y} r={n.r + 8} fill="#D4AF37" opacity="0.2" filter="url(#nodeGlow)" />
              <circle cx={nx} cy={n.y} r={n.r + 2} fill="#D4AF37" opacity="0.5" />
              <circle cx={nx} cy={n.y} r={n.r} fill="#FFCC44" opacity="0.7" />
              <circle cx={nx} cy={n.y} r={n.r * 0.4} fill="#FFF8DC" opacity="0.9" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
