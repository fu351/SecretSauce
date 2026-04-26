import { FuzzyLogIdfGenerator } from "./fuzzy-log-idf-generator"
import { MinHashJaccardGenerator } from "./minhash-generator"
import type { Candidate, CandidateInput } from "./types"
import { bestCandidateScore, unionCandidates } from "./union"
import { VectorHNSWGenerator } from "./vector-hnsw-generator"

const DEFAULT_TOP_K = 15
const DEFAULT_HINT_LIMIT = 20

export interface ResolvedCandidatePool {
  candidates: Candidate[]
  hintNames: string[]
}

const generators = [
  new VectorHNSWGenerator(),
  new FuzzyLogIdfGenerator(),
  new MinHashJaccardGenerator(),
]

export async function resolveUnifiedIngredientCandidates(params: {
  cleanedName: string
  context: CandidateInput["context"]
  topK?: number
  hintLimit?: number
}): Promise<ResolvedCandidatePool> {
  const input: CandidateInput = {
    cleanedName: params.cleanedName,
    context: params.context,
    topK: params.topK ?? DEFAULT_TOP_K,
  }

  const batches = await Promise.all(generators.map((generator) => generator.generate(input)))
  const candidates = unionCandidates(...batches)
  const seenHintNames = new Set<string>()
  const hintNames: string[] = []

  for (const candidate of candidates) {
    if (hintNames.length >= (params.hintLimit ?? DEFAULT_HINT_LIMIT)) break
    const normalized = candidate.canonicalName.trim().toLowerCase()
    if (!normalized || seenHintNames.has(normalized)) continue
    seenHintNames.add(normalized)
    hintNames.push(candidate.canonicalName)
  }

  candidates.sort((a, b) => bestCandidateScore(b) - bestCandidateScore(a))
  return { candidates, hintNames }
}
