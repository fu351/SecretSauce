export interface CanonicalCandidate {
  canonicalName: string
  category: string | null
}

export function normalizeCanonicalName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function singularizeWord(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2)
  if (
    word.endsWith("sses") ||
    word.endsWith("shes") ||
    word.endsWith("ches") ||
    word.endsWith("xes") ||
    word.endsWith("zes")
  ) {
    return word.slice(0, -2)
  }
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1)
  return word
}

export function singularizeCanonicalName(value: string): string {
  return normalizeCanonicalName(value)
    .split(" ")
    .filter(Boolean)
    .map(singularizeWord)
    .join(" ")
}

export function buildCanonicalQueryTerms(value: string): string[] {
  const normalized = normalizeCanonicalName(value)
  if (!normalized) return []

  const singular = singularizeCanonicalName(normalized)
  return Array.from(new Set([normalized, singular].filter(Boolean)))
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeCanonicalName(value)
      .split(" ")
      .filter(Boolean)
  )
}

function tokenList(value: string): string[] {
  return normalizeCanonicalName(value)
    .split(" ")
    .filter(Boolean)
}

function tokenJaccard(a: string, b: string): number {
  const aTokens = tokenSet(a)
  const bTokens = tokenSet(b)
  if (aTokens.size === 0 || bTokens.size === 0) return 0

  let intersection = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1
  }

  const union = aTokens.size + bTokens.size - intersection
  return union === 0 ? 0 : intersection / union
}

function tokenPhraseSet(value: string): Set<string> {
  const tokens = tokenList(value)
  if (!tokens.length) return new Set()
  if (tokens.length === 1) return new Set(tokens)

  const phrases = new Set<string>()
  for (let index = 0; index < tokens.length - 1; index += 1) {
    phrases.add(`${tokens[index]} ${tokens[index + 1]}`)
  }
  return phrases
}

function phraseDiceSimilarity(a: string, b: string): number {
  const aPhrases = tokenPhraseSet(a)
  const bPhrases = tokenPhraseSet(b)
  if (aPhrases.size === 0 || bPhrases.size === 0) return 0

  let overlap = 0
  for (const phrase of aPhrases) {
    if (bPhrases.has(phrase)) overlap += 1
  }
  return (2 * overlap) / (aPhrases.size + bPhrases.size)
}

function positionalTokenSimilarity(a: string, b: string): number {
  const aTokens = tokenList(a)
  const bTokens = tokenList(b)
  if (!aTokens.length || !bTokens.length) return 0

  const minLength = Math.min(aTokens.length, bTokens.length)
  const maxLength = Math.max(aTokens.length, bTokens.length)
  let positionMatches = 0

  for (let index = 0; index < minLength; index += 1) {
    if (aTokens[index] === bTokens[index]) {
      positionMatches += 1
    }
  }

  return positionMatches / maxLength
}

function bigramSet(value: string): Set<string> {
  const normalized = normalizeCanonicalName(value).replace(/\s/g, "")
  if (normalized.length < 2) return new Set([normalized])

  const output = new Set<string>()
  for (let index = 0; index < normalized.length - 1; index += 1) {
    output.add(normalized.slice(index, index + 2))
  }
  return output
}

function diceSimilarity(a: string, b: string): number {
  const aBigrams = bigramSet(a)
  const bBigrams = bigramSet(b)
  if (aBigrams.size === 0 || bBigrams.size === 0) return 0

  let overlap = 0
  for (const bg of aBigrams) {
    if (bBigrams.has(bg)) overlap += 1
  }
  return (2 * overlap) / (aBigrams.size + bBigrams.size)
}

export function scoreCanonicalSimilarity(candidate: string, existing: string): number {
  const normalizedCandidate = normalizeCanonicalName(candidate)
  const normalizedExisting = normalizeCanonicalName(existing)
  if (!normalizedCandidate || !normalizedExisting) return 0
  if (normalizedCandidate === normalizedExisting) return 1

  const singularCandidate = singularizeCanonicalName(normalizedCandidate)
  const singularExisting = singularizeCanonicalName(normalizedExisting)
  if (singularCandidate === singularExisting) return 0.995

  const tokenScore = tokenJaccard(normalizedCandidate, normalizedExisting)
  const charScore = diceSimilarity(normalizedCandidate, normalizedExisting)
  const phraseOrderScore = phraseDiceSimilarity(normalizedCandidate, normalizedExisting)
  const positionOrderScore = positionalTokenSimilarity(normalizedCandidate, normalizedExisting)
  return (tokenScore * 0.25) + (charScore * 0.15) + (phraseOrderScore * 0.35) + (positionOrderScore * 0.25)
}
