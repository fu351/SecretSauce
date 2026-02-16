"use client"

import { useEffect, useRef, useCallback } from "react"

/* ──────────────────────────────────────────────────────────────
   Golden Vine  — ornate SVG spine with sauce-flow highlight.

   Architecture
   ────────────
   1. A centred, fixed-width SVG column (`preserveAspectRatio =
      xMidYMin meet`) so nothing is horizontally stretched.
   2. The full vine (trunk, secondary strand, branches, tendrils,
      leaves, nodes) is always rendered at LOW opacity — the
      "embossed gold filigree" look.
   3. On top, four "flow" path layers (ambient glow → main trail →
      bright leading edge → cream core) trace the trunk using
      `strokeDasharray`.  A requestAnimationFrame + lerp loop
      updates these via direct DOM style writes for 60 fps.
   4. Branches, tendrils, and nodes illuminate as the flow passes
      their Y-position.
   5. The vine fades in from 0 opacity once the user starts
      scrolling (controlled via `--vine-opacity` CSS var).
   6. Leaves use `translate → rotate → scale` with the rotation
      following the tangent of their parent branch so they always
      point naturally along the vine.
   ────────────────────────────────────────────────────────────── */

const VW = 240
const VH = 8400

/* ── Leaf shape (pointing upward along local Y-axis) ── */
const LEAF = "M0,-1 C3,-5 4,-12 2,-18 C1,-20 -1,-20 -2,-18 C-4,-12 -3,-5 0,-1Z"
const LEAF_VEIN = "M0,-2 L0,-17"

/* ── Main trunk path — organic S-curves ── */
const TRUNK = [
  "M120,0",
  "C120,80 118,140 116,200",
  "C112,340 140,440 136,600",
  "C130,740 90,880 96,1040",
  "C102,1200 146,1320 138,1500",
  "C130,1660 82,1800 90,1980",
  "C98,2140 152,2260 142,2440",
  "C132,2600 76,2740 86,2920",
  "C96,3080 156,3200 144,3380",
  "C132,3540 72,3680 84,3860",
  "C96,4020 150,4140 136,4320",
  "C122,4480 70,4600 84,4780",
  "C98,4940 148,5060 134,5240",
  "C120,5400 74,5520 88,5700",
  "C100,5840 138,5940 126,6100",
  "C116,6240 80,6340 92,6480",
  "C100,6580 118,6660 114,6780",
  "C110,6880 122,6960 120,7080",
  "C118,7200 120,7350 120,7500",
  "C120,7650 120,7800 120,7950",
  "C120,8050 120,8150 120,8200",
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
  "C118,7500 119,7660 119,7820",
].join(" ")

/* ── Branch definition ── */
interface Branch {
  y: number
  side: 1 | -1
  path: string
  subs?: string[]
  leaves: { x: number; y: number; rot: number; s: number }[]
  tendril?: string
}

function br(
  y: number, side: 1 | -1, reach: number, lift: number, curve: number,
  leaves: { x: number; y: number; rot: number; s: number }[],
  subs?: string[], tendril?: string
): Branch {
  const s = side
  const mx = s * reach * 0.4, my = -lift * 0.5
  const ex = s * reach, ey = -lift
  const c1x = s * curve * 10, c1y = -lift * 0.2
  const c2x = mx + s * curve * 6, c2y = my - curve * 4
  const path = `M0,0 C${c1x},${c1y} ${c2x},${c2y} ${mx},${my} S${ex + s * curve * 2},${ey + 4} ${ex},${ey}`
  return { y, side, path, leaves, subs, tendril }
}

const BRANCHES: Branch[] = [
  br(380, 1, 52, 28, 1.4, [{ x: 24, y: -14, rot: -30, s: 0.85 }, { x: 46, y: -26, rot: -15, s: 1.0 }], ["M26,-15 C34,-22 42,-18 48,-24"], "M48,-26 C54,-30 56,-38 52,-44 C48,-48 42,-44 44,-38"),
  br(500, -1, 44, 22, 1.0, [{ x: -38, y: -18, rot: 155, s: 0.8 }], undefined, "M-38,-18 C-44,-22 -42,-30 -36,-34"),
  br(660, -1, 58, 34, 1.6, [{ x: -28, y: -16, rot: 140, s: 0.7 }, { x: -52, y: -32, rot: 160, s: 1.1 }], ["M-30,-17 C-38,-24 -48,-18 -54,-26"], "M-52,-32 C-58,-38 -56,-48 -48,-50"),
  br(780, 1, 40, 18, 0.8, [{ x: 34, y: -14, rot: -25, s: 0.75 }]),
  br(1020, 1, 60, 36, 1.5, [{ x: 30, y: -18, rot: -35, s: 0.8 }, { x: 54, y: -34, rot: -20, s: 1.1 }], ["M32,-19 C40,-28 50,-22 56,-30"], "M54,-34 C60,-40 58,-50 50,-52"),
  br(1160, -1, 48, 26, 1.2, [{ x: -42, y: -24, rot: 148, s: 0.9 }, { x: -22, y: -12, rot: 125, s: 0.6 }], ["M-24,-13 C-32,-20 -40,-14 -46,-22"]),
  br(1320, -1, 56, 32, 1.4, [{ x: -50, y: -30, rot: 155, s: 1.0 }], ["M-28,-16 C-36,-24 -46,-18 -52,-26"], "M-50,-30 C-56,-36 -54,-46 -46,-48"),
  br(1460, 1, 38, 16, 0.7, [{ x: 32, y: -14, rot: -30, s: 0.7 }]),
  br(1640, -1, 62, 38, 1.7, [{ x: -30, y: -18, rot: 135, s: 0.7 }, { x: -56, y: -36, rot: 165, s: 1.15 }], ["M-32,-19 C-42,-28 -52,-22 -60,-30", "M-56,-36 C-64,-44 -60,-54 -50,-56"], "M-60,-30 C-66,-36 -64,-46 -58,-48"),
  br(1800, 1, 46, 24, 1.0, [{ x: 40, y: -22, rot: -28, s: 0.85 }], undefined, "M40,-22 C46,-28 44,-36 38,-40"),
  br(1940, 1, 54, 30, 1.3, [{ x: 26, y: -14, rot: -40, s: 0.65 }, { x: 48, y: -28, rot: -22, s: 1.0 }], ["M28,-15 C36,-22 46,-16 52,-24"]),
  br(2240, -1, 58, 34, 1.5, [{ x: -52, y: -32, rot: 158, s: 1.1 }, { x: -28, y: -16, rot: 130, s: 0.7 }], ["M-30,-17 C-40,-26 -48,-20 -56,-28"], "M-52,-32 C-58,-38 -56,-50 -48,-52"),
  br(2420, 1, 50, 28, 1.2, [{ x: 44, y: -26, rot: -25, s: 0.95 }], ["M24,-14 C32,-22 42,-16 48,-24"]),
  br(2580, 1, 42, 20, 0.9, [{ x: 36, y: -18, rot: -32, s: 0.78 }], undefined, "M36,-18 C42,-24 40,-32 34,-36"),
  br(2920, -1, 56, 32, 1.4, [{ x: -50, y: -30, rot: 152, s: 1.05 }, { x: -26, y: -14, rot: 128, s: 0.6 }], ["M-28,-15 C-36,-22 -46,-16 -52,-24"], "M-50,-30 C-56,-38 -54,-48 -46,-50"),
  br(3100, 1, 54, 30, 1.3, [{ x: 48, y: -28, rot: -22, s: 1.0 }, { x: 24, y: -12, rot: -45, s: 0.6 }], ["M26,-13 C34,-20 44,-14 50,-22", "M48,-28 C54,-36 52,-46 44,-48"]),
  br(3280, -1, 40, 18, 0.8, [{ x: -34, y: -16, rot: 145, s: 0.75 }]),
  br(3640, 1, 60, 36, 1.6, [{ x: 54, y: -34, rot: -18, s: 1.12 }, { x: 28, y: -16, rot: -42, s: 0.7 }], ["M30,-17 C38,-24 50,-18 56,-26"], "M54,-34 C60,-40 58,-52 50,-54"),
  br(3820, -1, 50, 28, 1.2, [{ x: -44, y: -26, rot: 150, s: 0.95 }], ["M-24,-14 C-32,-22 -42,-14 -48,-22"]),
  br(3960, -1, 44, 22, 0.9, [{ x: -38, y: -20, rot: 142, s: 0.8 }], undefined, "M-38,-20 C-44,-26 -42,-34 -36,-38"),
  br(4340, -1, 54, 30, 1.3, [{ x: -48, y: -28, rot: 156, s: 1.0 }, { x: -24, y: -14, rot: 132, s: 0.6 }], ["M-26,-15 C-34,-22 -44,-16 -50,-24"]),
  br(4520, 1, 48, 26, 1.1, [{ x: 42, y: -24, rot: -28, s: 0.9 }], ["M22,-12 C30,-20 40,-14 46,-22"], "M42,-24 C48,-30 46,-40 40,-42"),
  br(4680, 1, 38, 16, 0.7, [{ x: 32, y: -14, rot: -34, s: 0.7 }]),
  br(5040, -1, 56, 32, 1.4, [{ x: -50, y: -30, rot: 160, s: 1.08 }, { x: -26, y: -16, rot: 136, s: 0.65 }], ["M-28,-17 C-38,-26 -46,-20 -54,-28"], "M-50,-30 C-56,-38 -54,-48 -46,-50"),
  br(5240, 1, 50, 28, 1.2, [{ x: 44, y: -26, rot: -26, s: 0.95 }], ["M24,-14 C32,-20 42,-14 48,-22"]),
  br(5400, -1, 36, 16, 0.7, [{ x: -30, y: -14, rot: 148, s: 0.7 }], undefined, "M-30,-14 C-36,-20 -34,-28 -28,-32"),
  br(5720, 1, 42, 22, 1.0, [{ x: 36, y: -20, rot: -30, s: 0.75 }], undefined, "M36,-20 C40,-26 38,-34 32,-36"),
  br(5900, -1, 38, 18, 0.8, [{ x: -32, y: -16, rot: 146, s: 0.7 }]),
  br(6080, 1, 32, 14, 0.6, [{ x: 26, y: -12, rot: -34, s: 0.6 }]),
  br(6240, -1, 28, 12, 0.5, [{ x: -22, y: -10, rot: 150, s: 0.55 }]),
  br(6400, 1, 22, 10, 0.4, [{ x: 18, y: -8, rot: -36, s: 0.45 }]),
  br(6560, -1, 18, 8, 0.35, [{ x: -14, y: -6, rot: 152, s: 0.4 }]),
]

/* ── Standalone curling tendrils along the trunk ── */
const TENDRILS = [
  "M120,300 C128,290 132,276 128,268 C124,260 116,262 118,270",
  "M90,820 C82,810 76,796 80,786 C84,776 92,778 90,786",
  "M140,1180 C148,1170 154,1156 150,1146 C146,1136 138,1138 140,1146",
  "M84,1560 C76,1550 70,1536 74,1526 C78,1516 86,1518 84,1526",
  "M144,2020 C152,2010 158,1996 154,1986 C150,1976 142,1978 144,1986",
  "M82,2480 C74,2470 68,2456 72,2446 C76,2436 84,2438 82,2446",
  "M148,2960 C156,2950 162,2936 158,2926 C154,2916 146,2918 148,2926",
  "M80,3440 C72,3430 66,3416 70,3406 C74,3396 82,3398 80,3406",
  "M142,3900 C150,3890 156,3876 152,3866 C148,3856 140,3858 142,3866",
  "M86,4380 C78,4370 72,4356 76,4346 C80,4336 88,4338 86,4346",
  "M136,4860 C144,4850 150,4836 146,4826 C142,4816 134,4818 136,4826",
  "M90,5340 C82,5330 76,5316 80,5306 C84,5296 92,5298 90,5306",
  "M130,5780 C136,5772 140,5760 136,5752 C132,5744 126,5748 128,5756",
  "M96,6160 C90,6152 86,6140 90,6132 C94,6124 98,6128 96,6136",
  "M114,6500 C118,6494 120,6484 116,6478 C112,6472 110,6478 112,6484",
]

/* ── Glowing nodes along the trunk ── */
const NODES = [
  { y: 340, r: 2.5 }, { y: 720, r: 3 }, { y: 1080, r: 2.5 },
  { y: 1400, r: 3 }, { y: 1760, r: 2.5 }, { y: 2100, r: 3.5 },
  { y: 2460, r: 2.5 }, { y: 2800, r: 3 }, { y: 3140, r: 2.5 },
  { y: 3500, r: 3 }, { y: 3860, r: 2.5 }, { y: 4200, r: 3.5 },
  { y: 4560, r: 2.5 }, { y: 4920, r: 3 }, { y: 5280, r: 2.5 },
  { y: 5600, r: 3 }, { y: 5920, r: 2.5 }, { y: 6200, r: 2.5 },
  { y: 6440, r: 2 }, { y: 6640, r: 2 },
]

/* Approximate trunk x at given y */
function trunkX(y: number): number {
  const t = y / VH
  const w1 = Math.sin(t * Math.PI * 9.5) * 28
  const w2 = Math.sin(t * Math.PI * 4.8 + 0.5) * 14
  const converge = t > 0.82 ? ((t - 0.82) / 0.18) ** 2 : 0
  return 120 + (w1 + w2) * (1 - converge)
}

/* Estimated total path length for the trunk */
const TRUNK_LEN = 13000

export function GoldenVine() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const currentProgress = useRef(0)
  const targetProgress = useRef(0)
  const vineOpacity = useRef(0)
  const targetVineOpacity = useRef(0)

  const animate = useCallback(() => {
    /* ── Lerp progress smoothly ── */
    const diff = targetProgress.current - currentProgress.current
    currentProgress.current += diff * 0.04 // slower lerp = smoother, more Apple-like
    if (Math.abs(diff) < 0.0001) currentProgress.current = targetProgress.current

    /* ── Lerp vine opacity smoothly ── */
    const opDiff = targetVineOpacity.current - vineOpacity.current
    vineOpacity.current += opDiff * 0.03
    if (Math.abs(opDiff) < 0.001) vineOpacity.current = targetVineOpacity.current

    const container = containerRef.current
    if (!container) {
      rafRef.current = requestAnimationFrame(animate)
      return
    }

    /* Apply vine container opacity */
    const svgEl = container.querySelector("svg")
    if (svgEl) svgEl.style.opacity = String(vineOpacity.current)

    const p = currentProgress.current
    const flow = p * TRUNK_LEN
    const trail = TRUNK_LEN * 0.15 // length of the bright leading edge

    /* ── Update flow paths via direct style ── */
    const amb = container.querySelector<SVGPathElement>("[data-flow='ambient']")
    const main = container.querySelector<SVGPathElement>("[data-flow='main']")
    const edge = container.querySelector<SVGPathElement>("[data-flow='edge']")
    const core = container.querySelector<SVGPathElement>("[data-flow='core']")
    const s2 = container.querySelector<SVGPathElement>("[data-flow='strand2']")

    if (amb) {
      amb.style.strokeDasharray = `${flow} ${TRUNK_LEN}`
    }
    if (main) {
      main.style.strokeDasharray = `${flow} ${TRUNK_LEN}`
    }
    if (edge) {
      const edgeStart = Math.max(0, flow - trail)
      edge.style.strokeDasharray = `${trail} ${TRUNK_LEN}`
      edge.style.strokeDashoffset = `${-edgeStart}`
    }
    if (core) {
      const tipLen = trail * 0.3
      const coreStart = Math.max(0, flow - tipLen)
      core.style.strokeDasharray = `${tipLen} ${TRUNK_LEN}`
      core.style.strokeDashoffset = `${-coreStart}`
    }
    if (s2) {
      s2.style.strokeDasharray = `${flow * 0.92} ${TRUNK_LEN}`
    }

    /* ── Update branches, tendrils, nodes ── */
    /* Branches illuminate when the flow reaches their Y position */
    container.querySelectorAll<SVGGElement>("[data-by]").forEach((g) => {
      const by = parseFloat(g.dataset.by || "0") / VH
      const localP = (p - by * 0.9) / 0.06 // smooth ramp over 6% of progress
      g.style.opacity = String(Math.max(0, Math.min(1, localP)))
    })
    /* Tendrils */
    container.querySelectorAll<SVGPathElement>("[data-ty]").forEach((el) => {
      const ty = parseFloat(el.dataset.ty || "0") / VH
      const localP = (p - ty * 0.9) / 0.08
      el.style.opacity = String(Math.max(0, Math.min(0.45, localP * 0.45)))
    })
    /* Nodes */
    container.querySelectorAll<SVGGElement>("[data-ny]").forEach((g) => {
      const ny = parseFloat(g.dataset.ny || "0") / VH
      const localP = (p - ny * 0.9) / 0.04
      g.style.opacity = String(Math.max(0, Math.min(1, localP)))
    })

    rafRef.current = requestAnimationFrame(animate)
  }, [])

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const h = containerRef.current.offsetHeight
    const vh = window.innerHeight

    /* Calculate scroll progress through the vine container */
    const raw = (vh - rect.top) / (h + vh)
    targetProgress.current = Math.max(0, Math.min(1, raw))

    /* Vine fades in once user scrolls even a tiny amount */
    const scrollY = window.scrollY || window.pageYOffset
    targetVineOpacity.current = scrollY > 20 ? 1 : 0
  }, [])

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      window.removeEventListener("scroll", handleScroll)
      cancelAnimationFrame(rafRef.current)
    }
  }, [handleScroll, animate])

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none hidden md:block" aria-hidden="true">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMin meet"
        className="absolute top-0 left-1/2 -translate-x-1/2 h-full"
        style={{ width: "min(600px, 50vw)", overflow: "visible", opacity: 0 }}
      >
        <defs>
          {/* ── Leaf template ── */}
          <g id="vL">
            <path d={LEAF} fill="currentColor" opacity="0.75" />
            <path d={LEAF_VEIN} fill="none" stroke="currentColor" strokeWidth="0.3" opacity="0.35" />
          </g>
          {/* ── Filters ── */}
          <filter id="gS" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="b2" />
            <feMerge>
              <feMergeNode in="b1" />
              <feMergeNode in="b2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="gW" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
          <filter id="gN" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>
        </defs>

        {/* ═══════════ DIM STRUCTURE (always visible) ═══════════ */}
        <g opacity="0.12" style={{ color: "#D4AF37" }}>
          {/* Trunk */}
          <path d={TRUNK} fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Secondary strand */}
          <path d={STRAND2} fill="none" stroke="#D4AF37" strokeWidth="0.7" strokeLinecap="round" opacity="0.5" />

          {/* Branches */}
          {BRANCHES.map((b, i) => (
            <g key={`d${i}`} transform={`translate(${trunkX(b.y)},${b.y})`}>
              <path d={b.path} fill="none" stroke="#D4AF37" strokeWidth="1.2" strokeLinecap="round" />
              {b.subs?.map((s, j) => <path key={j} d={s} fill="none" stroke="#D4AF37" strokeWidth="0.8" strokeLinecap="round" />)}
              {b.tendril && <path d={b.tendril} fill="none" stroke="#D4AF37" strokeWidth="0.45" strokeLinecap="round" />}
              {b.leaves.map((l, j) => (
                <g key={j} transform={`translate(${l.x},${l.y}) rotate(${l.rot}) scale(${l.s})`}>
                  <use href="#vL" />
                </g>
              ))}
            </g>
          ))}

          {/* Tendrils */}
          {TENDRILS.map((d, i) => (
            <path key={`t${i}`} d={d} fill="none" stroke="#D4AF37" strokeWidth="0.5" strokeLinecap="round" />
          ))}

          {/* Nodes */}
          {NODES.map((n, i) => (
            <circle key={`n${i}`} cx={trunkX(n.y)} cy={n.y} r={n.r} fill="#D4AF37" />
          ))}
        </g>

        {/* ═══════════ SAUCE FLOW LAYERS ═══════════ */}
        {/* 1. Wide ambient glow */}
        <path data-flow="ambient" d={TRUNK} fill="none" stroke="#D4AF37" strokeWidth="10" strokeLinecap="round" filter="url(#gW)" opacity="0.06" style={{ strokeDasharray: `0 ${TRUNK_LEN}` }} />
        {/* 2. Main trail */}
        <path data-flow="main" d={TRUNK} fill="none" stroke="#D4AF37" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" style={{ strokeDasharray: `0 ${TRUNK_LEN}` }} />
        {/* 3. Bright leading edge */}
        <path data-flow="edge" d={TRUNK} fill="none" stroke="#FFCC44" strokeWidth="1.6" strokeLinecap="round" filter="url(#gS)" opacity="0.65" style={{ strokeDasharray: `0 ${TRUNK_LEN}`, strokeDashoffset: "0" }} />
        {/* 4. Cream-white core (tip only) */}
        <path data-flow="core" d={TRUNK} fill="none" stroke="#FFF8DC" strokeWidth="0.7" strokeLinecap="round" filter="url(#gS)" opacity="0.5" style={{ strokeDasharray: `0 ${TRUNK_LEN}`, strokeDashoffset: "0" }} />
        {/* 5. Secondary strand flow */}
        <path data-flow="strand2" d={STRAND2} fill="none" stroke="#D4AF37" strokeWidth="0.9" strokeLinecap="round" opacity="0.2" style={{ strokeDasharray: `0 ${TRUNK_LEN}` }} />

        {/* ═══════════ ILLUMINATED BRANCHES ═══════════ */}
        {BRANCHES.map((b, i) => (
          <g key={`l${i}`} data-by={b.y} transform={`translate(${trunkX(b.y)},${b.y})`} opacity="0" style={{ color: "#D4AF37" }}>
            <path d={b.path} fill="none" stroke="#D4AF37" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
            <path d={b.path} fill="none" stroke="#FFCC44" strokeWidth="0.7" strokeLinecap="round" filter="url(#gS)" opacity="0.3" />
            {b.subs?.map((s, j) => (
              <g key={j}>
                <path d={s} fill="none" stroke="#D4AF37" strokeWidth="0.9" strokeLinecap="round" opacity="0.4" />
                <path d={s} fill="none" stroke="#FFCC44" strokeWidth="0.4" strokeLinecap="round" filter="url(#gS)" opacity="0.2" />
              </g>
            ))}
            {b.tendril && <path d={b.tendril} fill="none" stroke="#FFCC44" strokeWidth="0.4" strokeLinecap="round" opacity="0.2" />}
            {b.leaves.map((l, j) => (
              <g key={j} transform={`translate(${l.x},${l.y}) rotate(${l.rot}) scale(${l.s})`}>
                <use href="#vL" style={{ color: "#FFCC44" }} opacity="0.55" />
              </g>
            ))}
          </g>
        ))}

        {/* ═══════════ ILLUMINATED TENDRILS ═══════════ */}
        {TENDRILS.map((d, i) => {
          const m = d.match(/M[\d.]+,([\d.]+)/)
          return (
            <path key={`lt${i}`} data-ty={m ? m[1] : "0"} d={d} fill="none" stroke="#FFCC44" strokeWidth="0.5" strokeLinecap="round" opacity="0" />
          )
        })}

        {/* ═══════════ ILLUMINATED NODES ═══════════ */}
        {NODES.map((n, i) => (
          <g key={`ln${i}`} data-ny={n.y} opacity="0">
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r + 6} fill="#D4AF37" opacity="0.15" filter="url(#gN)" />
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r + 1.5} fill="#D4AF37" opacity="0.4" />
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r} fill="#FFCC44" opacity="0.6" />
            <circle cx={trunkX(n.y)} cy={n.y} r={n.r * 0.35} fill="#FFF8DC" opacity="0.8" />
          </g>
        ))}
      </svg>
    </div>
  )
}
