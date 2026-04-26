import type { Candidate } from "./types"

function maxDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}

export function bestCandidateScore(candidate: Candidate): number {
  return Math.max(
    candidate.scores.vector ?? 0,
    candidate.scores.fuzzyLogIdf ?? 0,
    candidate.scores.minhash ?? 0,
    candidate.scores.aliasGraph ?? 0,
    candidate.scores.historicalAcceptRate ?? 0,
    candidate.mergedScore ?? 0
  )
}

export function unionCandidates(...batches: Candidate[][]): Candidate[] {
  const byCanonicalId = new Map<string, Candidate>()

  for (const batch of batches) {
    for (const candidate of batch) {
      const existing = byCanonicalId.get(candidate.canonicalId)
      if (!existing) {
        byCanonicalId.set(candidate.canonicalId, {
          ...candidate,
          sources: [...candidate.sources],
          scores: { ...candidate.scores },
          features: { ...candidate.features },
        })
        continue
      }

      existing.sources = Array.from(new Set([...existing.sources, ...candidate.sources]))
      existing.scores = {
        vector: maxDefined(existing.scores.vector, candidate.scores.vector),
        fuzzyLogIdf: maxDefined(existing.scores.fuzzyLogIdf, candidate.scores.fuzzyLogIdf),
        minhash: maxDefined(existing.scores.minhash, candidate.scores.minhash),
        aliasGraph: maxDefined(existing.scores.aliasGraph, candidate.scores.aliasGraph),
        historicalAcceptRate: maxDefined(
          existing.scores.historicalAcceptRate,
          candidate.scores.historicalAcceptRate
        ),
      }
      existing.features = {
        headNounMatch: existing.features.headNounMatch || candidate.features.headNounMatch,
        categoryMatch: existing.features.categoryMatch || candidate.features.categoryMatch,
        formMatch: existing.features.formMatch || candidate.features.formMatch,
        contextMatch: existing.features.contextMatch || candidate.features.contextMatch,
        wordRatio: Math.max(existing.features.wordRatio, candidate.features.wordRatio),
      }
      existing.mergedScore = maxDefined(existing.mergedScore, candidate.mergedScore)
    }
  }

  return Array.from(byCanonicalId.values()).sort((a, b) => {
    const scoreDelta = bestCandidateScore(b) - bestCandidateScore(a)
    if (scoreDelta !== 0) return scoreDelta
    return a.canonicalName.localeCompare(b.canonicalName)
  })
}
