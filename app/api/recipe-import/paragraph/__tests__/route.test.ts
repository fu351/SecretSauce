import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}))

const { mockHasAccessToTier } = vi.hoisted(() => ({
  mockHasAccessToTier: vi.fn(),
}))

const { mockParseRecipeParagraphWithAI } = vi.hoisted(() => ({
  mockParseRecipeParagraphWithAI: vi.fn(),
}))

const { mockExtractTimes } = vi.hoisted(() => ({
  mockExtractTimes: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

vi.mock("@/lib/auth/subscription", () => ({
  hasAccessToTier: mockHasAccessToTier,
}))

vi.mock("@/lib/recipe-paragraph-parser", () => ({
  parseRecipeParagraphWithAI: mockParseRecipeParagraphWithAI,
}))

vi.mock("@/lib/recipe-time-extractor", () => ({
  extractTimes: mockExtractTimes,
}))

import { POST } from "../route"

describe("POST /api/recipe-import/paragraph", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockHasAccessToTier.mockResolvedValue(true)
    mockParseRecipeParagraphWithAI.mockResolvedValue({
      instructions: [{ description: "Mix ingredients" }],
      ingredients: [{ name: "Milk" }],
    })
    mockExtractTimes.mockReturnValue({ prep_time: 15, cook_time: 30 })
  })

  it("returns 401 when the user is unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const response = await POST(
      new Request("http://localhost/api/recipe-import/paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Cook the onions." }),
      }) as any
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Authentication required" })
  })

  it("returns 403 when the user lacks premium access", async () => {
    mockHasAccessToTier.mockResolvedValue(false)

    const response = await POST(
      new Request("http://localhost/api/recipe-import/paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Cook the onions." }),
      }) as any
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "Premium subscription required" })
  })

  it("returns 400 for invalid text payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/recipe-import/paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "text is required" })
  })

  it("returns 400 when the text exceeds the maximum length", async () => {
    const response = await POST(
      new Request("http://localhost/api/recipe-import/paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "x".repeat(10001) }),
      }) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "text too long (max 10000 characters)",
    })
  })

  it("parses recipe text and merges extracted times", async () => {
    const bodyText = "Mix ingredients and bake for 30 minutes."

    const response = await POST(
      new Request("http://localhost/api/recipe-import/paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: bodyText }),
      }) as any
    )

    expect(mockParseRecipeParagraphWithAI).toHaveBeenCalledWith(bodyText)
    expect(mockExtractTimes).toHaveBeenCalledWith(bodyText)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      instructions: [{ description: "Mix ingredients" }],
      ingredients: [{ name: "Milk" }],
      prep_time: 15,
      cook_time: 30,
    })
  })

  it("returns a warning when the parser cannot extract any structure", async () => {
    mockParseRecipeParagraphWithAI.mockResolvedValue({
      instructions: [],
      ingredients: [],
    })

    const response = await POST(
      new Request("http://localhost/api/recipe-import/paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "A family story about dinner." }),
      }) as any
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      warning: "Could not extract structured data from the provided text",
    })
  })

  it("returns 500 when parsing fails", async () => {
    mockParseRecipeParagraphWithAI.mockRejectedValue(new Error("Parser failed"))

    const response = await POST(
      new Request("http://localhost/api/recipe-import/paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Cook the onions." }),
      }) as any
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Failed to parse recipe" })
  })
})
