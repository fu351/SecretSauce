export type CandidateSource =
  | "vector_hnsw"
  | "fuzzy_log_idf"
  | "minhash_jaccard"
  | "alias_graph"
  | "learned_token_links"

export interface Candidate {
  canonicalId: string
  canonicalName: string
  category?: string | null
  sources: CandidateSource[]
  scores: {
    vector?: number
    fuzzyLogIdf?: number
    minhash?: number
    aliasGraph?: number
    historicalAcceptRate?: number
  }
  features: {
    headNounMatch: boolean
    categoryMatch: boolean
    formMatch: boolean
    contextMatch: boolean
    wordRatio: number
  }
  mergedScore?: number
}

export interface CandidateInput {
  cleanedName: string
  context: "scraper" | "recipe" | "pantry"
  topK: number
}

export interface CandidateGenerator {
  readonly source: CandidateSource
  generate(input: CandidateInput): Promise<Candidate[]>
}
