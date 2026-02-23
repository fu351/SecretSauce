"use client"

import { useEffect, useRef, useCallback } from "react"

/* ──────────────────────────────────────────────────────────────
   Golden Sauce Flow — liquid waterfall / sauce drip.

   Sauce pours from the bottle at top, flows down as a central stream
   with sauce drips and droplets. No vine/leaves — all liquid.
   ────────────────────────────────────────────────────────────── */

const VW = 240
const VH = 7800

/* ── Teardrop shape for sauce drops (point at top, round at bottom) ── */
const DROP_SM = "M0,0 C3,0 6,5 6,10 C6,14 3,16 0,16 C-3,16 -6,14 -6,10 C-6,5 -3,0 0,0"
const DROP_MD = "M0,0 C4,0 8,6 8,14 C8,20 4,24 0,24 C-4,24 -8,20 -8,14 C-8,6 -4,0 0,0"

/* ── Drip from bottle at top (sauce pouring out) ── */
const BOTTLE_DRIP = "M120,-32 C122,-22 118,-10 120,0"

/* ── Main pour path — liquid waterfall down the center (smooth S-curves) ── */
const TRUNK = [
  "M120,0",
  "C120,60 119,110 117,165",
  "C114,240 118,320 115,400",
  "C110,520 142,600 138,700",
  "C132,820 88,920 94,1060",
  "C100,1200 148,1320 140,1480",
  "C130,1640 78,1780 88,1960",
  "C98,2120 156,2250 146,2420",
  "C136,2580 72,2720 84,2900",
  "C96,3060 158,3190 146,3360",
  "C132,3520 68,3660 82,3840",
  "C96,4000 152,4120 138,4290",
  "C124,4450 68,4580 82,4760",
  "C96,4920 150,5040 136,5210",
  "C122,5370 72,5500 86,5670",
  "C100,5820 140,5920 128,6080",
  "C116,6230 78,6320 90,6460",
  "C100,6580 120,6660 116,6780",
  "C112,6880 124,6960 122,7080",
  "C120,7180 121,7280 120,7380",
  "C120,7480 120,7580 120,7680",
  "C120,7620 120,7520 120,7600",
].join(" ")

/* ── Parallel secondary strand ── */
const STRAND2 = [
  "M123,60",
  "C126,200 114,300 118,460",
  "C122,600 144,700 138,860",
  "C132,1000 88,1120 94,1280",
  "C100,1420 148,1540 140,1720",
  "C132,1880 84,2000 92,2180",
  "C100,2340 154,2460 144,2640",
  "C134,2800 78,2920 88,3100",
  "C98,3260 152,3380 140,3560",
  "C128,3720 74,3840 86,4020",
  "C98,4180 146,4300 132,4480",
  "C118,4640 72,4760 86,4940",
  "C100,5100 144,5220 130,5400",
  "C116,5560 76,5680 90,5860",
  "C102,6000 134,6100 122,6260",
  "C112,6400 84,6480 96,6620",
  "C104,6740 116,6820 112,6940",
  "C108,7060 118,7180 118,7340",
  "C118,7500 119,7220 119,7200",
].join(" ")

/* ── Third trailing trunk (things work in threes) ── */
const STRAND3 = [
  "M117,80",
  "C120,220 108,380 115,540",
  "C122,700 138,820 132,980",
  "C126,1140 82,1280 90,1440",
  "C98,1600 152,1740 142,1920",
  "C132,2080 76,2240 86,2420",
  "C96,2580 158,2720 146,2900",
  "C134,3060 70,3220 82,3400",
  "C94,3560 150,3700 136,3880",
  "C122,4040 66,4200 80,4380",
  "C94,4540 146,4680 132,4860",
  "C118,5020 72,5180 86,5360",
  "C100,5520 142,5660 128,5840",
  "C114,6000 68,6160 82,6340",
  "C94,6500 136,6640 122,6820",
  "C110,6980 72,7140 84,7320",
  "C96,7480 118,7560 116,7600",
].join(" ")

/* ── Small drip curves removed (no drops) ── */
const DRIP_CURVES: string[] = []

/* ── Droplets removed (no drops) ── */
const NODES: { y: number; r: number }[] = []

/* Center of the pour at given y (horizontal sway) */
function trunkX(y: number): number {
  const t = y / VH
  const w1 = Math.sin(t * Math.PI * 9.5) * 42
  const w2 = Math.sin(t * Math.PI * 4.8 + 0.5) * 22
  const w3 = Math.sin(t * Math.PI * 2.3 + 1) * 8
  const converge = t > 0.82 ? ((t - 0.82) / 0.18) ** 2 : 0
  return 120 + (w1 + w2 + w3) * (1 - converge)
}

/* Estimated total path length for the trunk */
const TRUNK_LEN = 11500

export function GoldenVine() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const currentProgress = useRef(0)

  const animate = useCallback(() => {
    const container = containerRef.current
    if (!container) {
      rafRef.current = requestAnimationFrame(animate)
      return
    }

    /* ── Progress from scroll every frame so glow tracks 1:1 with scroll ── */
    const scrollY = window.scrollY ?? window.pageYOffset ?? 0
    const vh = window.innerHeight
    const scrollHeight = document.documentElement.scrollHeight
    const maxScroll = Math.max(1, scrollHeight - vh)
    const raw = scrollY / maxScroll
    const p = Math.max(0, Math.min(1, raw))
    currentProgress.current = p

    /* Ensure SVG is visible */
    const svgEl = container.querySelector("svg")
    if (svgEl) svgEl.style.opacity = "1"

    const flow = Math.max(0, p * TRUNK_LEN)
    const trail = TRUNK_LEN * 0.15 // length of the bright leading edge

    /* ── Update flow paths via direct style ── */
    const amb = container.querySelector<SVGPathElement>("[data-flow='ambient']")
    const main = container.querySelector<SVGPathElement>("[data-flow='main']")
    const edge = container.querySelector<SVGPathElement>("[data-flow='edge']")
    const core = container.querySelector<SVGPathElement>("[data-flow='core']")
    const s2 = container.querySelector<SVGPathElement>("[data-flow='strand2']")
    const s3 = container.querySelector<SVGPathElement>("[data-flow='strand3']")

    if (amb) {
      amb.style.strokeDasharray = `${flow} ${TRUNK_LEN}`
      amb.style.strokeDashoffset = "0"
    }
    if (main) {
      main.style.strokeDasharray = `${flow} ${TRUNK_LEN}`
      main.style.strokeDashoffset = "0"
    }
    if (edge) {
      const edgeStart = Math.max(0, flow - trail)
      edge.style.strokeDasharray = `${trail} ${TRUNK_LEN}`
      edge.style.strokeDashoffset = String(-edgeStart)
    }
    if (core) {
      const tipLen = trail * 0.3
      const coreStart = Math.max(0, flow - tipLen)
      core.style.strokeDasharray = `${tipLen} ${TRUNK_LEN}`
      core.style.strokeDashoffset = String(-coreStart)
    }
    if (s2) {
      s2.style.strokeDasharray = `${flow * 0.92} ${TRUNK_LEN}`
      s2.style.strokeDashoffset = "0"
      if (s3) {
        s3.style.strokeDasharray = `${flow * 0.88} ${TRUNK_LEN}`
        s3.style.strokeDashoffset = "0"
      }
    }

    /* ── Reveal mask: vine grows from top with scroll (narrative progression) ── */
    const revealRect = container.querySelector<SVGRectElement>("[data-reveal-rect]")
    if (revealRect) revealRect.setAttribute("height", String(Math.ceil(p * VH)))

    /* ── Update branches, tendrils, nodes ── */
    /* Branches illuminate when the flow reaches their Y position */
    container.querySelectorAll<SVGGElement>("[data-by]").forEach((g) => {
      const by = parseFloat(g.dataset.by || "0") / VH
      const localP = (p - by * 0.9) / 0.06 // smooth ramp over 6% of progress
      g.style.opacity = String(Math.max(0, Math.min(0.65, localP * 0.65)))
    })
    /* Tendrils */
    container.querySelectorAll<SVGPathElement>("[data-ty]").forEach((el) => {
      const ty = parseFloat(el.dataset.ty || "0") / VH
      const localP = (p - ty * 0.9) / 0.08
      el.style.opacity = String(Math.max(0, Math.min(0.28, localP * 0.28)))
    })
    /* Nodes */
    container.querySelectorAll<SVGGElement>("[data-ny]").forEach((g) => {
      const ny = parseFloat(g.dataset.ny || "0") / VH
      const localP = (p - ny * 0.9) / 0.04
      g.style.opacity = String(Math.max(0, Math.min(0.65, localP * 0.65)))
    })

    rafRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    // Start animation after a brief delay to ensure SVG is rendered
    const startAnimation = () => {
      rafRef.current = requestAnimationFrame(animate)
    }
    const timeoutId = setTimeout(startAnimation, 50)
    return () => {
      clearTimeout(timeoutId)
      cancelAnimationFrame(rafRef.current)
    }
  }, [animate])

  return (
    <div
      ref={containerRef}
      className="absolute left-0 right-0 bottom-0 z-10 pointer-events-none block"
      style={{ top: "38vh" }}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMin meet"
        className="absolute top-0 left-1/2 -translate-x-1/2 h-full min-h-full"
        style={{ width: "min(600px, 50vw)", overflow: "visible", opacity: 0.4 }}
      >
        <defs>
          {/* ── Reveal mask: vine “grows” from top as user scrolls (narrative stages) ── */}
          <mask id="vineRevealMask">
            <rect data-reveal-rect x="0" y="0" width={VW} height="0" fill="white" />
          </mask>
          {/* ── Gold gradient (ChatGPT-style core) ── */}
          <linearGradient id="goldCore" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F2DA94" />
            <stop offset="45%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#8E6E1F" />
          </linearGradient>
          {/* ── Filters: soft liquid glow ── */}
          <filter id="gS" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="b2" />
            <feMerge>
              <feMergeNode in="b1" />
              <feMergeNode in="b2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="gW" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
          </filter>
          <filter id="gN" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
          {/* Sauce drop shapes (teardrop: point at top, round at bottom) */}
          <g id="sauceDropSm">
            <path d={DROP_SM} fill="currentColor" stroke="none" opacity="0.9" />
          </g>
          <g id="sauceDropMd">
            <path d={DROP_MD} fill="currentColor" stroke="none" opacity="0.9" />
          </g>
        </defs>

        {/* ═══════════ DIM STRUCTURE — sauce stream + drips + droplets ═══════════ */}
        <g mask="url(#vineRevealMask)" opacity="0.14" style={{ color: "#D4AF37" }}>
          {/* Sauce pouring from bottle at top */}
          <path d={BOTTLE_DRIP} fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <g transform="translate(120,0)">
            <use href="#sauceDropSm" style={{ color: "#D4AF37" }} opacity="0.35" />
          </g>
          {/* Main sauce stream + two trailing trunks */}
          <path d={TRUNK} fill="none" stroke="#D4AF37" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={STRAND2} fill="none" stroke="#D4AF37" strokeWidth="1" strokeLinecap="round" opacity="0.25" />
          <path d={STRAND3} fill="none" stroke="#D4AF37" strokeWidth="0.95" strokeLinecap="round" opacity="0.22" />

          {/* Small sauce beads along stream */}
          {DRIP_CURVES.map((d, i) => (
            <path key={`t${i}`} d={d} fill="none" stroke="#D4AF37" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {/* Sauce droplets along main stream */}
          {NODES.map((n, i) => (
            <g key={`n${i}`}>
              <circle cx={trunkX(n.y)} cy={n.y} r={n.r + 1} fill="#D4AF37" opacity="0.2" />
              <circle cx={trunkX(n.y)} cy={n.y} r={n.r} fill="#D4AF37" opacity="0.5" />
            </g>
          ))}
        </g>

        {/* ═══════════ SAUCE FLOW LAYERS (liquid stream: halo + core, revealed with scroll) ═══════════ */}
        <g mask="url(#vineRevealMask)">
          {/* 1. Wide ambient glow */}
          <path data-flow="ambient" d={TRUNK} fill="none" stroke="#D4AF37" strokeWidth="14" strokeLinecap="round" filter="url(#gW)" opacity="0.04" style={{ strokeDasharray: `0 ${TRUNK_LEN}` }} />
          {/* 2. Main trail (gold gradient option) */}
          <path data-flow="main" d={TRUNK} fill="none" stroke="url(#goldCore)" strokeWidth="2.6" strokeLinecap="round" opacity="0.28" style={{ strokeDasharray: `0 ${TRUNK_LEN}` }} />
          {/* 3. Bright leading edge */}
          <path data-flow="edge" d={TRUNK} fill="none" stroke="#FFCC44" strokeWidth="2" strokeLinecap="round" filter="url(#gS)" opacity="0.22" style={{ strokeDasharray: `0 ${TRUNK_LEN}`, strokeDashoffset: "0" }} />
          {/* 4. Cream-white core (tip only) */}
          <path data-flow="core" d={TRUNK} fill="none" stroke="#FFF8DC" strokeWidth="0.9" strokeLinecap="round" filter="url(#gS)" opacity="0.28" style={{ strokeDasharray: `0 ${TRUNK_LEN}`, strokeDashoffset: "0" }} />
          {/* 5. Secondary strand flow */}
          <path data-flow="strand2" d={STRAND2} fill="none" stroke="#D4AF37" strokeWidth="0.9" strokeLinecap="round" opacity="0.12" style={{ strokeDasharray: `0 ${TRUNK_LEN}` }} />
          {/* 6. Third strand flow */}
          <path data-flow="strand3" d={STRAND3} fill="none" stroke="#D4AF37" strokeWidth="0.85" strokeLinecap="round" opacity="0.1" style={{ strokeDasharray: `0 ${TRUNK_LEN}` }} />

        {/* ═══════════ ILLUMINATED SAUCE BEADS (along stream) ═══════════ */}
        {DRIP_CURVES.map((d, i) => {
          const m = d.match(/M[\d.]+,([\d.]+)/)
          return (
            <path key={`lt${i}`} data-ty={m ? m[1] : "0"} d={d} fill="none" stroke="#FFCC44" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" opacity="0" />
          )
        })}

        {/* ═══════════ ILLUMINATED SAUCE DROPLETS (along main stream) ═══════════ */}
        {NODES.map((n, i) => (
          <g key={`ln${i}`} data-ny={n.y} opacity="0">
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r + 5} fill="#D4AF37" opacity="0.12" filter="url(#gN)" />
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r + 1.5} fill="#D4AF37" opacity="0.3" />
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r} fill="#FFCC44" opacity="0.45" />
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r * 0.4} fill="#FFF8DC" opacity="0.9" />
          </g>
        ))}

        </g>
      </svg>
    </div>
  )
}
