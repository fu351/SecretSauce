import { afterEach, describe, expect, it, vi } from "vitest"
import { runPythonRecipeImportPipeline } from "@/backend/orchestrators/python-api-pipeline/pipeline"

const originalPythonServiceUrl = process.env.PYTHON_SERVICE_URL
const originalNextPublicPythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL

afterEach(() => {
  process.env.PYTHON_SERVICE_URL = originalPythonServiceUrl
  process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL = originalNextPublicPythonServiceUrl
  vi.unstubAllGlobals()
})

describe("python api pipeline", () => {
  it("routes recipe import requests through the configured python service", async () => {
    process.env.PYTHON_SERVICE_URL = "https://python.example.com/"
    process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL = ""
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await runPythonRecipeImportPipeline("url", { url: "https://example.com/recipe" })

    expect(result).toEqual({ status: 200, body: { success: true } })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://python.example.com/recipe-import/url",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/recipe" }),
      })
    )
  })

  it("returns a service-unavailable response when the python service is not configured", async () => {
    process.env.PYTHON_SERVICE_URL = ""
    process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL = ""

    const result = await runPythonRecipeImportPipeline("text", { text: "recipe text" })

    expect(result).toEqual({
      status: 503,
      body: { success: false, error: "Python service URL not configured" },
    })
  })

  it("maps successful python errors to route-level validation status when requested", async () => {
    process.env.PYTHON_SERVICE_URL = "https://python.example.com"
    process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL = ""
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: "Private post" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    )

    const result = await runPythonRecipeImportPipeline(
      "instagram",
      { url: "https://www.instagram.com/p/abc123/" },
      { mapUnsuccessfulResponseToStatus: 422 }
    )

    expect(result).toEqual({
      status: 422,
      body: { success: false, error: "Private post" },
    })
  })
})
