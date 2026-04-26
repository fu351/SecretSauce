import { getCandidateSupabaseClient } from "./supabase-client"
import type { Candidate, CandidateGenerator, CandidateInput } from "./types"

type FuzzyLogIdfRow = {
  id: string
  canonical_name: string
  category: string | null
  score: string | number | null
  head_noun_match: boolean | null
  form_match: boolean | null
  word_ratio: string | number | null
}

let warnedUnavailable = false

function num(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export class FuzzyLogIdfGenerator implements CandidateGenerator {
  readonly source = "fuzzy_log_idf" as const

  async generate(input: CandidateInput): Promise<Candidate[]> {
    try {
      const { data, error } = await (getCandidateSupabaseClient().rpc as any)("fn_match_ingredient_fuzzy_idf", {
        p_query: input.cleanedName,
        p_top_k: input.topK,
        p_context: input.context,
      })

      if (error) throw error

      return ((data || []) as FuzzyLogIdfRow[]).map((row) => ({
        canonicalId: row.id,
        canonicalName: row.canonical_name,
        category: row.category,
        sources: ["fuzzy_log_idf"],
        scores: { fuzzyLogIdf: num(row.score) },
        features: {
          headNounMatch: row.head_noun_match === true,
          categoryMatch: true,
          formMatch: row.form_match === true,
          contextMatch: true,
          wordRatio: num(row.word_ratio),
        },
      }))
    } catch (error) {
      if (!warnedUnavailable) {
        warnedUnavailable = true
        console.warn("[CandidateLayer] fuzzy_log_idf unavailable; continuing without it:", error)
      }
      return []
    }
  }
}
