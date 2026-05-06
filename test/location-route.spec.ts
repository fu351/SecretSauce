import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createServiceSupabaseClient: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient,
}))

import { POST } from "@/app/api/location/route"

function locationPost(body: unknown): Request {
  return new Request("http://localhost/api/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("location route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ userId: "user_1" })
    mocks.eq.mockResolvedValue({ error: null })
    mocks.update.mockReturnValue({ eq: mocks.eq })
    mocks.from.mockReturnValue({ update: mocks.update })
    mocks.createServiceSupabaseClient.mockReturnValue({ from: mocks.from })
  })

  it("rejects coordinates outside valid latitude and longitude ranges", async () => {
    const response = await POST(locationPost({ lat: 123.45, lng: -222.22 }))

    expect(response.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("does not leak database error messages to clients", async () => {
    mocks.eq.mockResolvedValue({
      error: { message: "profiles table policy exposed internal details" },
    })

    const response = await POST(locationPost({ lat: 37.7749, lng: -122.4194 }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "Failed to update location",
    })
  })
})
