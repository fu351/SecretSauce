"use client"

import { useEffect, useRef, useCallback } from "react"

/**
 * Golden vine that grows as the user scrolls.
 *
 * Implementation:
 * – A **fixed** full-viewport overlay holds the canvas.
 * – We maintain a virtual vine of total length = document scroll height.
 * – On every frame we compute how much vine to reveal (= scrollY) and
 *   where the "camera" window sits so the **growth tip is always in the
 *   bottom third** of the viewport.
 * – Everything above the camera window has already scrolled past; the
 *   tip is always near the bottom, giving the illusion of a vine that
 *   perpetually grows downward.
 *
 * Desktop-only (hidden on mobile via CSS).
 */

/* ── helpers ── */

interface Point { x: number; y: number }

/** Attempt a nice S-curve vine path.  We precompute waypoints
 *  so the drawing step is fast. */
function buildVineWaypoints(totalPts: number, amplitude: number): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= totalPts; i++) {
    const t = i / totalPts                     // 0 → 1
    const y = t                                // normalised y along vine
    const wave = Math.sin(t * Math.PI * 6) * amplitude
    const drift = Math.sin(t * Math.PI * 2.2) * amplitude * 0.4
    pts.push({ x: 0.5 + wave + drift, y })    // x in 0-1 range around 0.5
  }
  return pts
}

/** Cubic catmull-rom through points for smooth drawing */
function catmullRomTo(
  ctx: CanvasRenderingContext2D,
  p0: Point, p1: Point, p2: Point, p3: Point,
  scaleX: number, scaleY: number,
) {
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const t2 = t * t, t3 = t2 * t
    const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t
      + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
      + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
    const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t
      + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
      + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    ctx.lineTo(x * scaleX, y * scaleY)
  }
}

/* ── branch & leaf data (normalised y 0→1) ── */
const branches: { y: number; side: 1 | -1; length: number }[] = [
  { y: 0.07, side:  1, length: 55 },
  { y: 0.07, side: -1, length: 40 },
  { y: 0.14, side: -1, length: 60 },
  { y: 0.14, side:  1, length: 40 },
  { y: 0.22, side:  1, length: 65 },
  { y: 0.22, side: -1, length: 35 },
  { y: 0.30, side: -1, length: 60 },
  { y: 0.30, side:  1, length: 40 },
  { y: 0.38, side:  1, length: 55 },
  { y: 0.38, side: -1, length: 45 },
  { y: 0.46, side: -1, length: 65 },
  { y: 0.46, side:  1, length: 35 },
  { y: 0.54, side:  1, length: 60 },
  { y: 0.54, side: -1, length: 40 },
  { y: 0.62, side: -1, length: 55 },
  { y: 0.62, side:  1, length: 38 },
  { y: 0.70, side:  1, length: 60 },
  { y: 0.70, side: -1, length: 45 },
  { y: 0.78, side: -1, length: 55 },
  { y: 0.78, side:  1, length: 40 },
  { y: 0.86, side:  1, length: 50 },
  { y: 0.86, side: -1, length: 38 },
  { y: 0.93, side: -1, length: 45 },
  { y: 0.93, side:  1, length: 35 },
]

const glowNodes: { y: number; r: number }[] = [
  { y: 0.06, r: 5 },
  { y: 0.13, r: 6 },
  { y: 0.21, r: 5 },
  { y: 0.29, r: 6 },
  { y: 0.37, r: 5 },
  { y: 0.45, r: 6 },
  { y: 0.53, r: 5 },
  { y: 0.61, r: 6 },
  { y: 0.69, r: 5 },
  { y: 0.77, r: 6 },
  { y: 0.85, r: 5 },
  { y: 0.92, r: 7 },
]

/* ── component ── */

export function GoldenVine() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const waypointsRef = useRef<Point[]>([])
  const dprRef = useRef(1)

  /* Rebuild waypoints (doesn't change, only on mount) */
  useEffect(() => {
    waypointsRef.current = buildVineWaypoints(600, 0.04)
    dprRef.current = Math.min(window.devicePixelRatio || 1, 2)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = dprRef.current
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Resize canvas to viewport
    if (canvas.width !== vw * dpr || canvas.height !== vh * dpr) {
      canvas.width = vw * dpr
      canvas.height = vh * dpr
      canvas.style.width = `${vw}px`
      canvas.style.height = `${vh}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    ctx.clearRect(0, 0, vw, vh)

    const scrollTop = window.scrollY
    const docHeight = document.documentElement.scrollHeight - vh
    if (docHeight <= 0) return

    const progress = Math.min(scrollTop / docHeight, 1) // 0 → 1

    // Virtual vine total height in px (maps to full page)
    const vineHeight = docHeight + vh

    // How far the vine has grown (in virtual vine px)
    const grownLength = progress * vineHeight + vh * 0.3  // starts a bit visible

    // Camera: the vine tip should be at the bottom ~66% of viewport
    const tipTarget = vh * 0.66
    // The tip is at `grownLength` in virtual coords
    // Camera top in virtual coords:
    const cameraTop = grownLength - tipTarget
    // So virtual coord Y maps to screen Y = (virtualY - cameraTop)

    const wp = waypointsRef.current
    if (wp.length === 0) return

    const centerX = vw * 0.5

    /* ── helper: virtual normalised y → screen y ── */
    const toScreenY = (normY: number) => {
      const virtualY = normY * vineHeight
      return virtualY - cameraTop
    }

    const toScreenX = (normX: number) => {
      return centerX + (normX - 0.5) * vw * 0.15
    }

    /* ── draw ambient glow spots ── */
    for (const node of glowNodes) {
      if (node.y > progress + 0.02) continue  // not grown yet
      const sy = toScreenY(node.y)
      if (sy < -80 || sy > vh + 80) continue
      const fadeIn = Math.min(1, (progress - node.y) / 0.03)
      const grad = ctx.createRadialGradient(centerX, sy, 0, centerX, sy, 70)
      grad.addColorStop(0, `rgba(212,175,55,${0.12 * fadeIn})`)
      grad.addColorStop(1, `rgba(212,175,55,0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(centerX, sy, 70, 0, Math.PI * 2)
      ctx.fill()
    }

    /* ── draw vine trunk ── */
    // Only draw the portion that's grown
    const grownNormY = Math.min(grownLength / vineHeight, 1)

    // Find the last waypoint index within the grown region
    let lastIdx = 0
    for (let i = 0; i < wp.length; i++) {
      if (wp[i].y <= grownNormY) lastIdx = i
      else break
    }

    if (lastIdx < 2) return // need at least a few points

    // -- Glow layer
    ctx.save()
    ctx.strokeStyle = "rgba(212,175,55,0.15)"
    ctx.lineWidth = 8
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    let started = false
    for (let i = 1; i < lastIdx - 1; i++) {
      const sy = toScreenY(wp[i].y)
      if (sy < -100 || sy > vh + 100) {
        started = false
        continue
      }
      const sx = toScreenX(wp[i].x)
      if (!started) { ctx.moveTo(sx, sy); started = true; continue }
      const p0 = { x: toScreenX(wp[i-1].x), y: toScreenY(wp[i-1].y) }
      const p1 = { x: sx, y: sy }
      const p2 = { x: toScreenX(wp[i+1].x), y: toScreenY(wp[i+1].y) }
      const p3i = Math.min(i + 2, lastIdx)
      const p3 = { x: toScreenX(wp[p3i].x), y: toScreenY(wp[p3i].y) }
      catmullRomTo(ctx, p0, p1, p2, p3, 1, 1)
    }
    ctx.stroke()
    ctx.restore()

    // -- Main line
    ctx.save()
    const goldGrad = ctx.createLinearGradient(0, 0, 0, vh)
    goldGrad.addColorStop(0, "#A68523")
    goldGrad.addColorStop(0.3, "#D4AF37")
    goldGrad.addColorStop(0.7, "#D4AF37")
    goldGrad.addColorStop(1, "#E8C84A")
    ctx.strokeStyle = goldGrad
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    started = false
    for (let i = 1; i < lastIdx - 1; i++) {
      const sy = toScreenY(wp[i].y)
      if (sy < -100 || sy > vh + 100) {
        started = false
        continue
      }
      const sx = toScreenX(wp[i].x)
      if (!started) { ctx.moveTo(sx, sy); started = true; continue }
      const p0 = { x: toScreenX(wp[i-1].x), y: toScreenY(wp[i-1].y) }
      const p1 = { x: sx, y: sy }
      const p2 = { x: toScreenX(wp[i+1].x), y: toScreenY(wp[i+1].y) }
      const p3i = Math.min(i + 2, lastIdx)
      const p3 = { x: toScreenX(wp[p3i].x), y: toScreenY(wp[p3i].y) }
      catmullRomTo(ctx, p0, p1, p2, p3, 1, 1)
    }
    ctx.stroke()
    ctx.restore()

    // -- Thinner parallel strand
    ctx.save()
    ctx.strokeStyle = "rgba(212,175,55,0.18)"
    ctx.lineWidth = 1
    ctx.lineCap = "round"
    ctx.beginPath()
    started = false
    for (let i = 1; i < lastIdx - 1; i += 2) {
      const sy = toScreenY(wp[i].y)
      if (sy < -100 || sy > vh + 100) { started = false; continue }
      const sx = toScreenX(wp[i].x) + 4
      if (!started) { ctx.moveTo(sx, sy); started = true }
      else ctx.lineTo(sx, sy)
    }
    ctx.stroke()
    ctx.restore()

    /* ── branches & leaves ── */
    for (const br of branches) {
      if (br.y > progress + 0.01) continue
      const sy = toScreenY(br.y)
      if (sy < -80 || sy > vh + 80) continue

      const fadeIn = Math.min(1, (progress - br.y) / 0.04)
      // Find the x of the vine at this y
      const wpIdx = Math.min(Math.floor(br.y * wp.length), wp.length - 1)
      const sx = toScreenX(wp[wpIdx].x)

      ctx.save()
      ctx.globalAlpha = fadeIn * 0.6

      // Branch tendril
      const endX = sx + br.side * br.length
      const cpX = sx + br.side * br.length * 0.6
      const cpY = sy - 20
      ctx.strokeStyle = "#D4AF37"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.quadraticCurveTo(cpX, cpY, endX, sy - br.length * 0.5)
      ctx.stroke()

      // Leaf at end
      if (fadeIn > 0.4) {
        const leafX = endX
        const leafY = sy - br.length * 0.5
        ctx.globalAlpha = (fadeIn - 0.4) * 1.6 * 0.6

        ctx.fillStyle = "#D4AF37"
        ctx.beginPath()
        const lSize = 10
        const angle = br.side > 0 ? -0.5 : 0.5 + Math.PI
        ctx.ellipse(leafX, leafY, lSize, lSize * 0.45, angle, 0, Math.PI * 2)
        ctx.fill()

        // Leaf vein
        ctx.strokeStyle = "#A68523"
        ctx.lineWidth = 0.5
        ctx.globalAlpha *= 0.6
        ctx.beginPath()
        ctx.moveTo(leafX - Math.cos(angle) * lSize * 0.8, leafY - Math.sin(angle) * lSize * 0.8)
        ctx.lineTo(leafX + Math.cos(angle) * lSize * 0.8, leafY + Math.sin(angle) * lSize * 0.8)
        ctx.stroke()
      }

      // Second smaller leaf on longer branches
      if (fadeIn > 0.6 && br.length > 45) {
        const midX = sx + br.side * br.length * 0.45
        const midY = sy - br.length * 0.2
        ctx.globalAlpha = (fadeIn - 0.6) * 2.5 * 0.4
        ctx.fillStyle = "#D4AF37"
        ctx.beginPath()
        ctx.ellipse(midX, midY, 7, 3, br.side > 0 ? -0.3 : 0.3 + Math.PI, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    }

    /* ── glowing nodes ── */
    for (const node of glowNodes) {
      if (node.y > progress + 0.01) continue
      const sy = toScreenY(node.y)
      if (sy < -40 || sy > vh + 40) continue

      const wpIdx = Math.min(Math.floor(node.y * wp.length), wp.length - 1)
      const sx = toScreenX(wp[wpIdx].x)
      const fadeIn = Math.min(1, (progress - node.y) / 0.03)

      // Outer glow
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, node.r + 10)
      glow.addColorStop(0, `rgba(212,175,55,${0.4 * fadeIn})`)
      glow.addColorStop(0.5, `rgba(212,175,55,${0.1 * fadeIn})`)
      glow.addColorStop(1, `rgba(212,175,55,0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(sx, sy, node.r + 10, 0, Math.PI * 2)
      ctx.fill()

      // Main node
      ctx.fillStyle = `rgba(212,175,55,${0.8 * fadeIn})`
      ctx.beginPath()
      ctx.arc(sx, sy, node.r, 0, Math.PI * 2)
      ctx.fill()

      // Bright core
      ctx.fillStyle = `rgba(245,230,163,${fadeIn})`
      ctx.beginPath()
      ctx.arc(sx, sy, node.r * 0.4, 0, Math.PI * 2)
      ctx.fill()
    }

    /* ── growth tip glow ── */
    if (progress > 0.01 && progress < 0.98) {
      const tipWpIdx = Math.min(Math.floor(grownNormY * wp.length), wp.length - 1)
      const tipSx = toScreenX(wp[tipWpIdx].x)
      const tipSy = toScreenY(wp[tipWpIdx].y)

      if (tipSy > 0 && tipSy < vh) {
        const tipGlow = ctx.createRadialGradient(tipSx, tipSy, 0, tipSx, tipSy, 20)
        tipGlow.addColorStop(0, "rgba(245,230,163,0.6)")
        tipGlow.addColorStop(0.3, "rgba(212,175,55,0.3)")
        tipGlow.addColorStop(1, "rgba(212,175,55,0)")
        ctx.fillStyle = tipGlow
        ctx.beginPath()
        ctx.arc(tipSx, tipSy, 20, 0, Math.PI * 2)
        ctx.fill()

        // Bright dot at tip
        ctx.fillStyle = "rgba(245,230,163,0.9)"
        ctx.beginPath()
        ctx.arc(tipSx, tipSy, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [])

  useEffect(() => {
    const loop = () => {
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(rafRef.current) }
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[1] hidden md:block"
      aria-hidden="true"
    />
  )
}
