export interface MinHashOptions {
  bands?: number
  kgram?: number
}

const DEFAULT_BANDS = 128
const DEFAULT_KGRAM = 3
const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function hash(value: string, seed: number): number {
  let h = (FNV_OFFSET ^ seed) >>> 0
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, FNV_PRIME) >>> 0
  }
  return h >>> 0
}

export function charKgrams(value: string, kgram = DEFAULT_KGRAM): string[] {
  const normalized = normalize(value)
  if (!normalized) return []

  const padded = ` ${normalized} `
  if (padded.length <= kgram) return [padded]

  const grams = new Set<string>()
  for (let i = 0; i <= padded.length - kgram; i += 1) {
    grams.add(padded.slice(i, i + kgram))
  }
  return Array.from(grams)
}

export function computeMinHash(value: string, options: MinHashOptions = {}): number[] {
  const bands = Math.max(1, Math.floor(options.bands ?? DEFAULT_BANDS))
  const kgram = Math.max(1, Math.floor(options.kgram ?? DEFAULT_KGRAM))
  const grams = charKgrams(value, kgram)
  const signature = new Array<number>(bands).fill(0)

  if (!grams.length) return signature

  for (let band = 0; band < bands; band += 1) {
    let min = Number.MAX_SAFE_INTEGER
    const seed = Math.imul(band + 1, 0x9e3779b1) >>> 0
    for (const gram of grams) {
      min = Math.min(min, hash(gram, seed) & 0x7fffffff)
    }
    signature[band] = min
  }

  return signature
}
