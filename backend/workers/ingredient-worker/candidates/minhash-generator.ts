import { computeMinHash } from "../minhash/compute"
import { getCandidateSupabaseClient } from "./supabase-client"
import type { Candidate, CandidateGenerator, CandidateInput } from "./types"

type MinHashRow = {
  id: string
  canonical_name: string
  category: string | null
  jaccard_estimate: string | number | null
}

let warnedUnavailable = false

function num(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export class MinHashJaccardGenerator implements CandidateGenerator {
  readonly source = "minhash_jaccard" as const

  async generate(input: CandidateInput): Promise<Candidate[]> {
    try {
      const signature = computeMinHash(input.cleanedName, { bands: 128, kgram: 3 })
      const { data, error } = await (getCandidateSupabaseClient().rpc as any)("fn_match_ingredient_minhash", {
        p_signature: signature,
        p_top_k: input.topK,
      })

      if (error) throw error

      return ((data || []) as MinHashRow[]).map((row) => ({
        canonicalId: row.id,
        canonicalName: row.canonical_name,
        category: row.category,
        sources: ["minhash_jaccard"],
        scores: { minhash: num(row.jaccard_estimate) },
        features: {
          headNounMatch: false,
          categoryMatch: true,
          formMatch: false,
          contextMatch: true,
          wordRatio: 0,
        },
      }))
    } catch (error) {
      if (!warnedUnavailable) {
        warnedUnavailable = true
        console.warn("[CandidateLayer] minhash_jaccard unavailable; continuing without it:", error)
      }
      return []
    }
  }
}
