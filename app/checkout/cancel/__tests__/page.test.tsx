import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import CheckoutCancelPage from "../page"

describe("CheckoutCancelPage", () => {
  it("renders the cancellation message and navigation links", () => {
    render(<CheckoutCancelPage />)

    expect(screen.getByRole("heading", { name: /payment canceled/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute("href", "/checkout")
    expect(screen.getByRole("link", { name: /back to pricing/i })).toHaveAttribute("href", "/pricing")
  })
})
