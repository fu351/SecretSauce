import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  runPythonRecipeImportPipeline: vi.fn(),
  auth: vi.fn(),
  hasAccessToTier: vi.fn(),
}))

vi.mock("@/backend/orchestrators/python-api-pipeline/pipeline", () => ({
  runPythonRecipeImportPipeline: mocks.runPythonRecipeImportPipeline,
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}))

vi.mock("@/lib/auth/subscription", () => ({
  hasAccessToTier: mocks.hasAccessToTier,
}))

import { POST as imagePost } from "@/app/api/recipe-import/image/route"
import { POST as instagramPost } from "@/app/api/recipe-import/instagram/route"
import { POST as urlPost } from "@/app/api/recipe-import/url/route"

function jsonPost(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("recipe import routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runPythonRecipeImportPipeline.mockResolvedValue({
      status: 200,
      body: { success: true },
    })
    mocks.auth.mockResolvedValue({ userId: "user_1" })
    mocks.hasAccessToTier.mockResolvedValue(true)
  })

  it("rejects invalid URL imports before calling the python orchestrator", async () => {
    const response = await urlPost(jsonPost("/api/recipe-import/url", { url: "not-a-url" }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ success: false, error: "Invalid URL format" })
    expect(mocks.runPythonRecipeImportPipeline).not.toHaveBeenCalled()
  })

  it("routes valid URL imports through the python orchestrator", async () => {
    const response = await urlPost(
      jsonPost("/api/recipe-import/url", { url: "https://example.com/recipe" })
    )

    expect(response.status).toBe(200)
    expect(mocks.runPythonRecipeImportPipeline).toHaveBeenCalledWith(
      "url",
      { url: "https://example.com/recipe" }
    )
  })

  it("rejects short OCR text before calling the python orchestrator", async () => {
    const response = await imagePost(jsonPost("/api/recipe-import/image", { text: "too short" }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "OCR text is too short or empty",
    })
    expect(mocks.runPythonRecipeImportPipeline).not.toHaveBeenCalled()
  })

  it("rejects unauthenticated image OCR imports", async () => {
    mocks.auth.mockResolvedValue({ userId: null })

    const response = await imagePost(
      jsonPost("/api/recipe-import/image", {
        text: "1 cup rice\n2 cups water\nCook until tender and serve warm.",
      })
    )

    expect(response.status).toBe(401)
    expect(mocks.runPythonRecipeImportPipeline).not.toHaveBeenCalled()
  })

  it("rejects non-premium image OCR imports", async () => {
    mocks.hasAccessToTier.mockResolvedValue(false)

    const response = await imagePost(
      jsonPost("/api/recipe-import/image", {
        text: "1 cup rice\n2 cups water\nCook until tender and serve warm.",
      })
    )

    expect(response.status).toBe(403)
    expect(mocks.runPythonRecipeImportPipeline).not.toHaveBeenCalled()
  })

  it("rejects oversized OCR text before calling the python orchestrator", async () => {
    const response = await imagePost(
      jsonPost("/api/recipe-import/image", { text: "a".repeat(10001) })
    )

    expect(response.status).toBe(400)
    expect(mocks.runPythonRecipeImportPipeline).not.toHaveBeenCalled()
  })

  it("routes image OCR text through the python text import endpoint", async () => {
    const text = "1 cup rice\n2 cups water\nCook until tender and serve warm."
    const response = await imagePost(jsonPost("/api/recipe-import/image", { text }))

    expect(response.status).toBe(200)
    expect(mocks.runPythonRecipeImportPipeline).toHaveBeenCalledWith(
      "text",
      { text, source_type: "image" }
    )
  })

  it("rejects invalid Instagram URLs before calling the python orchestrator", async () => {
    const response = await instagramPost(
      jsonPost("/api/recipe-import/instagram", { url: "https://example.com/post/abc123" })
    )

    expect(response.status).toBe(400)
    expect(mocks.runPythonRecipeImportPipeline).not.toHaveBeenCalled()
  })

  it("rejects unauthenticated Instagram imports before calling the python orchestrator", async () => {
    mocks.auth.mockResolvedValue({ userId: null })

    const response = await instagramPost(
      jsonPost("/api/recipe-import/instagram", {
        url: "https://www.instagram.com/p/ABC123/",
      })
    )

    expect(response.status).toBe(401)
    expect(mocks.runPythonRecipeImportPipeline).not.toHaveBeenCalled()
  })

  it("does not leak internal Instagram import errors to clients", async () => {
    mocks.runPythonRecipeImportPipeline.mockRejectedValue(
      new Error("python stack included scraper token SECRET_TOKEN")
    )

    const response = await instagramPost(
      jsonPost("/api/recipe-import/instagram", {
        url: "https://www.instagram.com/p/ABC123/",
      })
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Failed to import recipe from Instagram. Please try again.",
    })
  })

  it("normalizes Instagram URLs and routes them through the python orchestrator", async () => {
    mocks.runPythonRecipeImportPipeline.mockResolvedValue({
      status: 422,
      body: { success: false, error: "Private post" },
    })

    const response = await instagramPost(
      jsonPost("/api/recipe-import/instagram", {
        url: "https://www.instagram.com/reel/ABC_123/?utm_source=ig_web_copy_link",
      })
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ success: false, error: "Private post" })
    expect(mocks.runPythonRecipeImportPipeline).toHaveBeenCalledWith(
      "instagram",
      { url: "https://www.instagram.com/p/ABC_123/" },
      {
        timeoutMs: 90_000,
        unavailableMessage: "Import service is not configured. Please try again later.",
        mapUnsuccessfulResponseToStatus: 422,
      }
    )
  })
})
