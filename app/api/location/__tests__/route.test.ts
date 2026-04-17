import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}))

const { mockEq, mockUpdate, mockFrom } = vi.hoisted(() => ({
  mockEq: vi.fn(),
  mockUpdate: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

import { POST } from "../route"

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

describe("POST /api/location", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({
      update: mockUpdate,
    })
    mockUpdate.mockReturnValue({
      eq: mockEq,
    })
    mockEq.mockResolvedValue({ error: null })
  })

  it("returns 401 when the user is unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const response = await POST(makeRequest({ lat: 37.7, lng: -122.4 }) as any)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Unauthorized" })
  })

  it("returns 400 when latitude or longitude are missing", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })

    const response = await POST(makeRequest({ lat: 37.7 }) as any)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "lat and lng are required",
    })
  })

  it("updates the authenticated user's profile coordinates", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })

    const response = await POST(makeRequest({ lat: 37.7749, lng: -122.4194 }) as any)
    const payload = mockUpdate.mock.calls[0][0]

    expect(mockFrom).toHaveBeenCalledWith("profiles")
    expect(payload).toMatchObject({
      latitude: 37.7749,
      longitude: -122.4194,
    })
    expect(payload.updated_at).toEqual(expect.any(String))
    expect(mockEq).toHaveBeenCalledWith("clerk_user_id", "user_1")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
  })

  it("returns 500 when Supabase returns an error", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockEq.mockResolvedValue({ error: { message: "write failed" } })

    const response = await POST(makeRequest({ lat: 37.7, lng: -122.4 }) as any)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "write failed" })
  })
})
