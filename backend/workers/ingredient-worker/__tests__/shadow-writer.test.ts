import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  from: vi.fn(),
  createClient: vi.fn(),
  findByCanonicalName: vi.fn(),
}))

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}))

vi.mock("../../../../lib/database/standardized-ingredients-db", () => ({
  standardizedIngredientsDB: {
    findByCanonicalName: mocks.findByCanonicalName,
  },
}))

import { writeShadowComparison } from "../shadow-writer"

describe("writeShadowComparison", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role"
    mocks.insert.mockResolvedValue({ error: null })
    mocks.from.mockReturnValue({ insert: mocks.insert })
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.findByCanonicalName.mockResolvedValue({ id: "std-1" })
  })

  it("writes successful shadow comparisons with canonical existence", async () => {
    await writeShadowComparison({
      inputKey: "olive oil",
      sourceName: "Olive Oil",
      primaryProvider: "openai",
      shadowProvider: "ollama",
      primaryCanonical: "olive oil",
      shadowCanonical: "olive oil",
      primaryConfidence: 0.94,
      shadowConfidence: 0.91,
      shadowStartedAt: Date.now() - 25,
      primaryLatencyMs: 1234,
      canonicalAgreement: true,
      categoryAgreement: true,
      queueRowId: "queue-1",
    })

    expect(mocks.findByCanonicalName).toHaveBeenCalledWith("olive oil")
    expect(mocks.from).toHaveBeenCalledWith("ingredient_shadow_comparisons")
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        queue_row_id: "queue-1",
        input_key: "olive oil",
        source_name: "Olive Oil",
        primary_provider: "openai",
        shadow_provider: "ollama",
        primary_canonical: "olive oil",
        shadow_canonical: "olive oil",
        primary_confidence: 0.94,
        shadow_confidence: 0.91,
        canonical_agreement: true,
        category_agreement: true,
        shadow_canonical_exists: true,
        shadow_error: null,
      })
    )
  })

  it("writes shadow failures without canonical existence lookup", async () => {
    await writeShadowComparison({
      inputKey: "chicken",
      sourceName: "Chicken",
      primaryProvider: "openai",
      shadowProvider: "ollama",
      primaryCanonical: "chicken",
      shadowCanonical: undefined,
      primaryConfidence: 0.88,
      shadowConfidence: undefined,
      shadowStartedAt: Date.now() - 10,
      primaryLatencyMs: 900,
      canonicalAgreement: false,
      categoryAgreement: false,
      shadowError: "Unexpected token in JSON",
      queueRowId: "queue-2",
    })

    expect(mocks.findByCanonicalName).not.toHaveBeenCalled()
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        queue_row_id: "queue-2",
        shadow_canonical: null,
        shadow_confidence: null,
        canonical_agreement: false,
        category_agreement: false,
        shadow_canonical_exists: null,
        shadow_error: "Unexpected token in JSON",
      })
    )
  })
})
