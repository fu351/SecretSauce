import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSearchParams } from "next/navigation"

describe("CheckoutSuccessPage", () => {
  let CheckoutSuccessPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("session_id=sess_123") as any
    )

    const mod = await import("../page")
    CheckoutSuccessPage = mod.default
  })

  it("shows the checkout success message and dashboard link", () => {
    render(<CheckoutSuccessPage />)

    expect(screen.getByRole("heading", { name: /payment successful/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /go to dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard"
    )
  })

  it("renders the Stripe session id when it is present in the query string", () => {
    render(<CheckoutSuccessPage />)

    expect(screen.getByText(/session id: sess_123/i)).toBeInTheDocument()
  })

  it("hides the session id block when the query string does not contain one", async () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any)
    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)

    expect(screen.queryByText(/session id:/i)).not.toBeInTheDocument()
  })
})
