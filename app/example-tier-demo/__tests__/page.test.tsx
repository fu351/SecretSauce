import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetUserTier = vi.fn()
const mockGetUserSubscription = vi.fn()

vi.mock("@/lib/auth/subscription", () => ({
  getUserTier: mockGetUserTier,
  getUserSubscription: mockGetUserSubscription,
}))

vi.mock("@/components/auth/tier-gate", () => ({
  TierGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tier-gate">{children}</div>
  ),
  TierBadge: ({ tier }: { tier: string }) => <span>{tier}</span>,
}))

vi.mock("../client-component", () => ({
  ExampleClientComponent: () => <div data-testid="example-client-component">Client Example</div>,
}))

describe("TierDemoPage", () => {
  let TierDemoPage: typeof import("../page").default

  beforeEach(async () => {
    vi.clearAllMocks()
    mockGetUserTier.mockResolvedValue("free")
    mockGetUserSubscription.mockResolvedValue({
      is_active: false,
      expires_at: null,
    })

    const mod = await import("../page")
    TierDemoPage = mod.default
  })

  it("renders the free-tier server state and client component examples", async () => {
    const page = await TierDemoPage()
    render(page)

    expect(screen.getByRole("heading", { name: /tier-based access demo/i })).toBeInTheDocument()
    expect(screen.getByTestId("tier-gate")).toBeInTheDocument()
    expect(screen.getByTestId("example-client-component")).toBeInTheDocument()
    expect(screen.getByText(/you're on the free tier/i)).toBeInTheDocument()
  })

  it("renders the premium server-side branch when the user has premium access", async () => {
    mockGetUserTier.mockResolvedValue("premium")
    mockGetUserSubscription.mockResolvedValue({
      is_active: true,
      expires_at: "2030-01-01T00:00:00.000Z",
    })

    const page = await TierDemoPage()
    render(page)

    expect(screen.getAllByText(/you have premium access/i)).toHaveLength(2)
  })
})
