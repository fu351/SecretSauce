import {
  getEmbeddingModel,
  resolveVectorCandidates,
  type VectorMatchCandidate,
} from "../scoring/vector-match"
import type { Candidate, CandidateGenerator, CandidateInput } from "./types"

export function vectorMatchToCandidate(raw: VectorMatchCandidate): Candidate {
  return {
    canonicalId: raw.matchedId,
    canonicalName: raw.matchedName,
    category: raw.matchedCategory,
    sources: ["vector_hnsw"],
    scores: { vector: raw.finalScore },
    features: {
      headNounMatch: raw.headBonus > 0,
      categoryMatch: raw.categoryPenalty === 0,
      formMatch: raw.formPenalty === 0,
      contextMatch: true,
      wordRatio: 0,
    },
  }
}

export class VectorHNSWGenerator implements CandidateGenerator {
  readonly source = "vector_hnsw" as const

  async generate(input: CandidateInput): Promise<Candidate[]> {
    const raw = await resolveVectorCandidates(input.cleanedName, getEmbeddingModel(), input.topK)
    return raw.map(vectorMatchToCandidate)
  }
}
