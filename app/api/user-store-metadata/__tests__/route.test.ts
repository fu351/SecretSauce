import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}))

const { mockMaybeSingle, mockEq, mockSelect, mockFrom, mockSupabaseClient } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn()
  const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
  const mockSelect = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ select: mockSelect }))
  const mockSupabaseClient = { from: mockFrom }
  return { mockMaybeSingle, mockEq, mockSelect, mockFrom, mockSupabaseClient }
})

const { mockGetUserPreferredStores } = vi.hoisted(() => ({
  mockGetUserPreferredStores: vi.fn(),
}))

const { mockBuildStoreMetadataFromStoreData } = vi.hoisted(() => ({
  mockBuildStoreMetadataFromStoreData: vi.fn(),
}))

const { mockFindByStoreAndZip } = vi.hoisted(() => ({
  mockFindByStoreAndZip: vi.fn(),
}))

const { mockProfileIdFromClerkUserId } = vi.hoisted(() => ({
  mockProfileIdFromClerkUserId: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createUserSupabaseClient: vi.fn(() => mockSupabaseClient),
}))

vi.mock("@/lib/store/user-preferred-stores", () => ({
  getUserPreferredStores: mockGetUserPreferredStores,
}))

vi.mock("@/lib/store/store-metadata", () => ({
  buildStoreMetadataFromStoreData: mockBuildStoreMetadataFromStoreData,
}))

vi.mock("@/lib/database/grocery-stores-db", () => ({
  groceryStoresDB: {
    findByStoreAndZip: mockFindByStoreAndZip,
  },
}))

vi.mock("@/lib/auth/clerk-profile-id", () => ({
  profileIdFromClerkUserId: mockProfileIdFromClerkUserId,
}))

import { GET } from "../route"

describe("GET /api/user-store-metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "clerk_1" })
    mockMaybeSingle.mockResolvedValue({ data: { id: "profile_1" }, error: null })
    mockProfileIdFromClerkUserId.mockReturnValue("derived_profile")
    mockGetUserPreferredStores.mockResolvedValue(new Map([["walmart", { zipCode: "94110" }]]))
    mockBuildStoreMetadataFromStoreData.mockReturnValue(
      new Map([
        [
          "walmart",
          {
            zipCode: "94110",
            latitude: null,
            longitude: null,
            preferred: true,
          },
        ],
      ])
    )
    mockFindByStoreAndZip.mockResolvedValue([{ geom: "POINT(-122.4 37.7)" }])
  })

  it("returns 401 when the request is unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const response = await GET(new NextRequest("http://localhost/api/user-store-metadata"))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Unauthorized" })
  })

  it("returns 403 when the requested userId does not match the authenticated profile", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/user-store-metadata?userId=someone_else")
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "Forbidden userId" })
  })

  it("builds metadata for the authenticated user and hydrates missing coordinates from cached locations", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/user-store-metadata?zipCode=94110")
    )
    const payload = await response.json()

    expect(mockGetUserPreferredStores).toHaveBeenCalledWith(
      mockSupabaseClient,
      "profile_1",
      expect.any(Array),
      "94110"
    )
    expect(mockFindByStoreAndZip).toHaveBeenCalledWith("walmart", "94110")
    expect(response.status).toBe(200)
    expect(payload.metadata).toEqual([
      {
        storeName: "walmart",
        zipCode: "94110",
        latitude: 37.7,
        longitude: -122.4,
        preferred: true,
      },
    ])
  })

  it("falls back to a derived profile id when the clerk profile lookup returns no row", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    await GET(new NextRequest("http://localhost/api/user-store-metadata"))

    expect(mockGetUserPreferredStores).toHaveBeenCalledWith(
      mockSupabaseClient,
      "derived_profile",
      expect.any(Array),
      ""
    )
  })

  it("returns 500 when metadata lookup fails", async () => {
    mockGetUserPreferredStores.mockRejectedValue(new Error("lookup failed"))

    const response = await GET(new NextRequest("http://localhost/api/user-store-metadata"))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: "Failed to fetch store metadata",
    })
  })
})
