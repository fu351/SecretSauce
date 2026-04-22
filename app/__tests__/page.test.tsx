import { describe, expect, it, vi, beforeEach } from "vitest"

const redirectMock = vi.fn()

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectMock(url)
  },
}))

describe("Root page", () => {
  beforeEach(() => {
    vi.resetModules()
    redirectMock.mockClear()
  })

  it("redirects to /home", async () => {
    const { default: RootPage } = await import("../page")
    RootPage()
    expect(redirectMock).toHaveBeenCalledWith("/home")
  })
})
