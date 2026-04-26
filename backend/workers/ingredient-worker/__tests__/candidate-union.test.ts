import { describe, expect, it } from "vitest"

import { bestCandidateScore, unionCandidates } from "../candidates/union"
import type { Candidate } from "../candidates/types"

function candidate(fields: Partial<Candidate> & Pick<Candidate, "canonicalId" | "canonicalName">): Candidate {
  return {
    category: null,
    sources: [],
    scores: {},
    features: {
      headNounMatch: false,
      categoryMatch: false,
      formMatch: false,
      contextMatch: true,
      wordRatio: 0,
    },
    ...fields,
  }
}

describe("unionCandidates", () => {
  it("merges sources, scores, and strongest features by canonical id", () => {
    const result = unionCandidates(
      [
        candidate({
          canonicalId: "1",
          canonicalName: "olive oil",
          sources: ["vector_hnsw"],
          scores: { vector: 0.83 },
          features: { headNounMatch: true, categoryMatch: true, formMatch: false, contextMatch: true, wordRatio: 0.5 },
        }),
      ],
      [
        candidate({
          canonicalId: "1",
          canonicalName: "olive oil",
          sources: ["fuzzy_log_idf"],
          scores: { fuzzyLogIdf: 0.91 },
          features: { headNounMatch: false, categoryMatch: true, formMatch: true, contextMatch: true, wordRatio: 0.8 },
        }),
      ]
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      canonicalId: "1",
      sources: ["vector_hnsw", "fuzzy_log_idf"],
      scores: { vector: 0.83, fuzzyLogIdf: 0.91 },
      features: {
        headNounMatch: true,
        categoryMatch: true,
        formMatch: true,
        contextMatch: true,
        wordRatio: 0.8,
      },
    })
  })

  it("sorts by the best available candidate score", () => {
    const result = unionCandidates([
      candidate({ canonicalId: "low", canonicalName: "low", scores: { vector: 0.5 } }),
      candidate({ canonicalId: "high", canonicalName: "high", scores: { minhash: 0.9 } }),
    ])

    expect(result.map((item) => item.canonicalId)).toEqual(["high", "low"])
    expect(bestCandidateScore(result[0])).toBe(0.9)
  })
})
