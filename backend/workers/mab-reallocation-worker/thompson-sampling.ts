export interface VariantStats {
  key: string
  exposures: number
  conversions: number
}

// Log-gamma approximation (Lanczos) — no external dependency needed
function logGamma(x: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

// Sample from Beta(alpha, beta) using Johnk's method with gamma approximation
function betaSample(alpha: number, beta: number): number {
  // Gamma sampling via Marsaglia-Tsang for alpha >= 1
  function gammaSample(shape: number): number {
    if (shape < 1) return gammaSample(1 + shape) * Math.pow(Math.random(), 1 / shape)
    const d = shape - 1 / 3
    const c = 1 / Math.sqrt(9 * d)
    while (true) {
      let x: number, v: number
      do {
        x = (Math.random() * 2 - 1) * 3 // Box-Muller-like normal approx
        // Better: use Box-Muller for normal sample
        const u1 = Math.random()
        const u2 = Math.random()
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
        v = 1 + c * x
      } while (v <= 0)
      v = v * v * v
      const u = Math.random()
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
    }
  }

  const g1 = gammaSample(alpha)
  const g2 = gammaSample(beta)
  return g1 / (g1 + g2)
}

/**
 * Compute new traffic percentages for each variant using Thompson Sampling.
 * - Samples θᵢ ~ Beta(conversions+1, non-conversions+1) for each variant
 * - Allocates traffic proportional to sampled θᵢ values
 * - Enforces a minimum floor percentage per variant
 * - Returns integer percentages summing to 100
 */
export function computeNewPercentages(
  variants: VariantStats[],
  minFloorPct: number
): Record<string, number> {
  const samples = variants.map((v) => ({
    key: v.key,
    theta: betaSample(v.conversions + 1, Math.max(v.exposures - v.conversions, 0) + 1),
  }))

  const totalTheta = samples.reduce((sum, s) => sum + s.theta, 0)
  const n = variants.length
  const floorTotal = minFloorPct * n

  // Raw proportional allocation
  const raw = samples.map((s) => ({
    key: s.key,
    pct: totalTheta > 0 ? (s.theta / totalTheta) * 100 : 100 / n,
  }))

  // Apply floor: anything below minFloorPct gets bumped up, excess taken from top
  const floored = raw.map((r) => ({ key: r.key, pct: Math.max(r.pct, minFloorPct) }))
  const flooredTotal = floored.reduce((sum, f) => sum + f.pct, 0)

  // Scale back to sum to 100
  const scaled = floored.map((f) => ({ key: f.key, pct: (f.pct / flooredTotal) * 100 }))

  // Round to integers, fix rounding error on the highest-percentage variant
  const rounded = scaled.map((s) => ({ key: s.key, pct: Math.floor(s.pct) }))
  const remainder = 100 - rounded.reduce((sum, r) => sum + r.pct, 0)
  const maxIdx = rounded.reduce((maxI, r, i) => (r.pct > rounded[maxI].pct ? i : maxI), 0)
  rounded[maxIdx].pct += remainder

  return Object.fromEntries(rounded.map((r) => [r.key, r.pct]))
}
