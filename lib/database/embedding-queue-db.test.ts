import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockFrom, mockRpc, fromChains } = vi.hoisted(() => {
  const fromChains: any[] = []
  const mockFrom = vi.fn((_tableName: string) => {
    const next = fromChains.shift()
    if (!next) {
      throw new Error("No mock chain queued for supabase.from()")
    }
    return next
  })

  return {
    mockFrom,
    mockRpc: vi.fn(),
    fromChains,
  }
})

vi.mock("@/lib/database/supabase", () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}))

import { embeddingQueueDB } from "./embedding-queue-db"

function createFindExistingChain(result: any) {
  const limit = vi.fn().mockResolvedValue(result)
  const eq2 = vi.fn().mockReturnValue({ limit })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })

  return {
    chain: { select },
    spies: { select, eq1, eq2, limit },
  }
}

function createUpdateBySourceChain(result: any) {
  const eq2 = vi.fn().mockResolvedValue(result)
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const update = vi.fn().mockReturnValue({ eq: eq1 })

  return {
    chain: { update },
    spies: { update, eq1, eq2 },
  }
}

function createInsertChain(result: any) {
  const insert = vi.fn().mockResolvedValue(result)
  return {
    chain: { insert },
    spies: { insert },
  }
}

describe("embeddingQueueDB.enqueueSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromChains.length = 0
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("updates an existing source row instead of inserting", async () => {
    const find = createFindExistingChain({ data: [{ id: "q-1" }], error: null })
    const update = createUpdateBySourceChain({ error: null })
    fromChains.push(find.chain, update.chain)

    const result = await embeddingQueueDB.enqueueSource({
      sourceType: "ingredient",
      sourceId: "ingredient-123",
      inputText: "roma tomato",
      model: "text-embedding-3-small",
    })

    expect(result).toBe("updated")
    expect(update.spies.update).toHaveBeenCalledWith(
      expect.objectContaining({
        input_text: "roma tomato",
        model: "text-embedding-3-small",
        status: "pending",
        last_error: null,
      })
    )
  })

  it("inserts a new queue row when no existing source row is found", async () => {
    const find = createFindExistingChain({ data: [], error: null })
    const insert = createInsertChain({ error: null })
    fromChains.push(find.chain, insert.chain)

    const result = await embeddingQueueDB.enqueueSource({
      sourceType: "recipe",
      sourceId: "recipe-55",
      inputText: "Simple soup",
      model: "text-embedding-3-small",
    })

    expect(result).toBe("inserted")
    expect(insert.spies.insert).toHaveBeenCalledWith({
      source_type: "recipe",
      source_id: "recipe-55",
      input_text: "Simple soup",
      status: "pending",
      model: "text-embedding-3-small",
    })
  })

  it("retries as update on unique constraint conflicts and returns updated", async () => {
    const find = createFindExistingChain({ data: [], error: null })
    const insert = createInsertChain({ error: { code: "23505", message: "duplicate key" } })
    const retryUpdate = createUpdateBySourceChain({ error: null })
    fromChains.push(find.chain, insert.chain, retryUpdate.chain)

    const result = await embeddingQueueDB.enqueueSource({
      sourceType: "ingredient",
      sourceId: "ingredient-dup",
      inputText: "green onion",
      model: "text-embedding-3-small",
    })

    expect(result).toBe("updated")
    expect(retryUpdate.spies.update).toHaveBeenCalledWith(
      expect.objectContaining({
        input_text: "green onion",
        status: "pending",
      })
    )
  })

  it("returns failed when finding existing rows errors", async () => {
    const find = createFindExistingChain({ data: null, error: { message: "db unavailable" } })
    fromChains.push(find.chain)

    const result = await embeddingQueueDB.enqueueSource({
      sourceType: "ingredient",
      sourceId: "ingredient-err",
      inputText: "chili pepper",
      model: "text-embedding-3-small",
    })

    expect(result).toBe("failed")
  })
})
