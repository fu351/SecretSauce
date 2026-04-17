import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH } from "../route"

const { mockRequireAdmin, mockFrom, mockHistoryUpdate, mockFeeUpdate } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFrom: vi.fn(),
  mockHistoryUpdate: vi.fn(),
  mockFeeUpdate: vi.fn(),
}))

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: mockRequireAdmin,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

function createUpdateChain() {
  const eq = vi.fn().mockResolvedValue({ error: null })
  return {
    update: vi.fn().mockReturnValue({ eq }),
    eq,
  }
}

describe("PATCH /api/dev/deliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdmin.mockResolvedValue(undefined)
    mockFrom.mockImplementation((table: string) => {
      if (table === "store_list_history") {
        const eq = vi.fn().mockResolvedValue({ error: null })
        mockHistoryUpdate.mockReturnValue({ eq })
        return { update: mockHistoryUpdate }
      }
      if (table === "delivery_orders") {
        const eq = vi.fn().mockResolvedValue({ error: null })
        mockFeeUpdate.mockReturnValue({ eq })
        return { update: mockFeeUpdate }
      }
      return createUpdateChain()
    })
  })

  it("marks an order as delivered or pending", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/dev/deliveries", {
        method: "PATCH",
        body: JSON.stringify({ orderId: "order_1", confirmed: true }),
      }) as any
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith("store_list_history")
    expect(mockFrom).toHaveBeenCalledWith("delivery_orders")
    expect(mockHistoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ is_delivery_confirmed: true })
    )
    expect(mockFeeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ updated_at: expect.any(String) })
    )
  })

  it("rejects missing input", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/dev/deliveries", {
        method: "PATCH",
        body: JSON.stringify({ confirmed: true }),
      }) as any
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "orderId and confirmed are required" })
  })
})
