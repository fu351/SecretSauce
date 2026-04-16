import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetUserSubscription = vi.fn()

vi.mock("@/lib/auth/subscription", () => ({
  getUserSubscription: mockGetUserSubscription,
}))

describe("PricingPage", () => {
  let PricingPage: typeof import("../page").default

  beforeEach(async () => {
    vi.clearAllMocks()
    mockGetUserSubscription.mockResolvedValue({
      tier: "premium",
      expires_at: "2030-01-01T00:00:00.000Z",
    })

    const mod = await import("../page")
    PricingPage = mod.default
  })

  it("renders pricing cards and current subscription details", async () => {
    const page = await PricingPage({
      searchParams: Promise.resolve({}),
    })

    render(page)

    expect(screen.getByRole("heading", { name: /choose your plan/i })).toBeInTheDocument()
    expect(screen.getByText(/current plan:/i)).toBeInTheDocument()
    const currentPlanLinks = screen.getAllByRole("link", { name: /current plan/i })
    expect(currentPlanLinks[1]).toHaveAttribute("href", "/checkout")
  })

  it("shows required-tier and expired alerts from the query string", async () => {
    const page = await PricingPage({
      searchParams: Promise.resolve({ required: "premium", reason: "expired" }),
    })

    render(page)

    expect(screen.getByText(/your subscription has expired/i)).toBeInTheDocument()
    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === "P" && node.textContent === "premium tier required for this feature"
      )
    ).toBeInTheDocument()
  })

  it("marks the free plan as current when the user has no subscription", async () => {
    mockGetUserSubscription.mockResolvedValue(null)
    const page = await PricingPage({
      searchParams: Promise.resolve({}),
    })

    render(page)

    expect(screen.getAllByText(/current plan/i)[0]).toBeInTheDocument()
  })
})
