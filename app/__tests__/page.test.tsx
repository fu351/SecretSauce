import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

let mockAuthState = { loading: false }

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} {...props} />
  ),
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => mockAuthState),
}))

vi.mock("@/components/landing/landing-page", () => ({
  LandingPage: () => <div data-testid="landing-page">Landing Page</div>,
}))

describe("Landing HomePage", () => {
  let HomePage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthState = { loading: false }
    const mod = await import("../page")
    HomePage = mod.default
  })

  it("renders the loading logo while auth is still loading", () => {
    mockAuthState = { loading: true }

    render(<HomePage />)

    expect(screen.getByAltText(/secret sauce/i)).toBeInTheDocument()
  })

  it("renders the landing page once mounted and auth has finished loading", async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByTestId("landing-page")).toBeInTheDocument()
    })
  })
})
