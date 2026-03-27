export interface CanonicalCandidate {
  canonicalName: string
  category: string | null
}

function foldLatinCharacters(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/ß/g, "ss")
    .replace(/[Ææ]/g, "ae")
    .replace(/[Œœ]/g, "oe")
    .replace(/[Øø]/g, "o")
    .replace(/[Łł]/g, "l")
    .replace(/[Đđ]/g, "d")
    .replace(/[Þþ]/g, "th")
}

export function normalizeCanonicalName(value: string): string {
  return foldLatinCharacters(value)
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

function sharedUniqueTokenCount(a: string, b: string): number {
  const aTokens = tokenSet(a)
  const bTokens = tokenSet(b)
  if (!aTokens.size || !bTokens.size) return 0

  let shared = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) shared += 1
  }
  return shared
}

function sharedTokenProjection(a: string, b: string): { aShared: string[]; bShared: string[] } {
  const aTokens = tokenList(a)
  const bTokens = tokenList(b)

  const aSet = new Set(aTokens)
  const bSet = new Set(bTokens)

  const aShared = aTokens.filter((token) => bSet.has(token))
  const bShared = bTokens.filter((token) => aSet.has(token))

  if (aShared.length && bShared.length) {
    return { aShared, bShared }
  }

  return { aShared: aTokens, bShared: bTokens }
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

function tokenContainment(a: string, b: string): number {
  const aTokens = tokenSet(a)
  const bTokens = tokenSet(b)
  if (aTokens.size === 0 || bTokens.size === 0) return 0

  let intersection = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1
  }

  const smallerSize = Math.min(aTokens.size, bTokens.size)
  if (!smallerSize) return 0
  return intersection / smallerSize
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
  const { aShared, bShared } = sharedTokenProjection(a, b)
  const aPhrases = tokenPhraseSet(aShared.join(" "))
  const bPhrases = tokenPhraseSet(bShared.join(" "))
  if (aPhrases.size === 0 || bPhrases.size === 0) return 0

  let overlap = 0
  for (const phrase of aPhrases) {
    if (bPhrases.has(phrase)) overlap += 1
  }
  return (2 * overlap) / (aPhrases.size + bPhrases.size)
}

function positionalTokenSimilarity(a: string, b: string): number {
  const { aShared: aTokens, bShared: bTokens } = sharedTokenProjection(a, b)
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

const GENERIC_HEAD_NOUNS = new Set([
  "sauce",
  "onion",
  "tea",
  "wine",
  "cheese",
  "milk",
  "oil",
  "bread",
  "rice",
  "bean",
  "pepper",
  "tomato",
])

function modifierConflictPenalty(candidate: string, existing: string): number {
  const candidateTokens = tokenList(singularizeCanonicalName(candidate))
  const existingTokens = tokenList(singularizeCanonicalName(existing))
  if (candidateTokens.length < 2 || existingTokens.length < 2) return 0

  const candidateHead = candidateTokens[candidateTokens.length - 1]
  const existingHead = existingTokens[existingTokens.length - 1]
  if (!candidateHead || candidateHead !== existingHead) return 0
  if (!GENERIC_HEAD_NOUNS.has(candidateHead)) return 0

  const candidateModifiers = new Set(candidateTokens.slice(0, -1))
  const existingModifiers = new Set(existingTokens.slice(0, -1))
  if (!candidateModifiers.size || !existingModifiers.size) return 0

  let overlap = 0
  for (const token of candidateModifiers) {
    if (existingModifiers.has(token)) overlap += 1
  }

  if (overlap > 0) return 0
  return 0.18
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
  const containmentScore = tokenContainment(normalizedCandidate, normalizedExisting)
  const charScore = diceSimilarity(normalizedCandidate, normalizedExisting)
  const sharedTokenCount = sharedUniqueTokenCount(normalizedCandidate, normalizedExisting)
  const phraseOrderScore =
    sharedTokenCount >= 2 ? phraseDiceSimilarity(normalizedCandidate, normalizedExisting) : 0
  const positionOrderScore =
    sharedTokenCount >= 2 ? positionalTokenSimilarity(normalizedCandidate, normalizedExisting) : 0
  const modifierPenalty = modifierConflictPenalty(normalizedCandidate, normalizedExisting)

  const score =
    (tokenScore * 0.45) +
    (containmentScore * 0.35) +
    (charScore * 0.08) +
    (phraseOrderScore * 0.07) +
    (positionOrderScore * 0.05)
  return Math.max(0, score - modifierPenalty)
}
