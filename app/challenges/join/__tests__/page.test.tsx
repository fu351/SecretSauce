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
    const mod = await import("../page")
    JoinChallengePage = mod.default
  })

  it("renders the challenge overview and action buttons", () => {
    render(<JoinChallengePage />)

    expect(screen.getByRole("heading", { name: /pantry rescue/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /join challenge/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /post your dish/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute("href", "/home")
  })

  it("opens the post-dish dialog and clears the form", async () => {
    const user = userEvent.setup()
    render(<JoinChallengePage />)

    await user.click(screen.getByRole("button", { name: /post your dish/i }))
    await user.type(screen.getByLabelText(/dish name/i), "Late Night Pasta")
    await user.type(screen.getByLabelText(/caption/i), "Comfort food")
    await user.click(screen.getByRole("button", { name: /^clear$/i }))

    expect(screen.getByLabelText(/dish name/i)).toHaveValue("")
    expect(screen.getByLabelText(/caption/i)).toHaveValue("")
  })

  it("posts the placeholder entry and shows a toast", async () => {
    const user = userEvent.setup()
    render(<JoinChallengePage />)

    await user.click(screen.getByRole("button", { name: /post your dish/i }))
    await user.type(screen.getByLabelText(/dish name/i), "Late Night Pasta")
    await user.click(screen.getByRole("button", { name: /^post$/i }))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Posted (placeholder)" })
      )
    })
  })
})
