import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockToast = vi.fn()

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} {...props} />
  ),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: mockToast }),
}))

describe("JoinChallengePage", () => {
  let JoinChallengePage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            challenge: {
              id: "c1",
              title: "Pantry Rescue",
              description: "Use what you have.",
              points: 100,
              starts_at: "2026-01-01T00:00:00.000Z",
              ends_at: "2099-01-02T00:00:00.000Z",
              created_at: "2026-01-01T00:00:00.000Z",
              participant_count: 42,
            },
            rank: 8,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    const mod = await import("../page")
    JoinChallengePage = mod.default
  })

  it("loads challenge from API and shows actions", async () => {
    render(<JoinChallengePage />)

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /pantry rescue/i })).toBeInTheDocument()
    })

    expect(screen.getByRole("link", { name: /go to home to enter/i })).toHaveAttribute("href", "/home")
    expect(screen.getByRole("button", { name: /post your dish \(from home\)/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute("href", "/home")
  })

  it("opens the post-dish dialog and clears the form", async () => {
    const user = userEvent.setup()
    render(<JoinChallengePage />)

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /pantry rescue/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /post your dish \(from home\)/i }))
    await user.type(screen.getByLabelText(/dish name/i), "Late Night Pasta")
    await user.type(screen.getByLabelText(/caption/i), "Comfort food")
    await user.click(screen.getByRole("button", { name: /^clear$/i }))

    expect(screen.getByLabelText(/dish name/i)).toHaveValue("")
    expect(screen.getByLabelText(/caption/i)).toHaveValue("")
  })

  it("dialog Got it shows toast directing user to home", async () => {
    const user = userEvent.setup()
    render(<JoinChallengePage />)

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /pantry rescue/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /post your dish \(from home\)/i }))
    await user.click(screen.getByRole("button", { name: /^got it$/i }))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Post from home" }),
      )
    })
  })
})
