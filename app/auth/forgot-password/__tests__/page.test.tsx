import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockToast = vi.fn()
const mockResetPasswordForEmail = vi.fn()

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} {...props} />
  ),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock("@/lib/database/supabase", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  },
}))

describe("ForgotPasswordPage", () => {
  let ForgotPasswordPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockResetPasswordForEmail.mockResolvedValue({ error: null })

    const mod = await import("../page")
    ForgotPasswordPage = mod.default
  })

  it("renders the email form and sign-in link", () => {
    render(<ForgotPasswordPage />)

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute(
      "href",
      "/auth/signin"
    )
  })

  it("submits the email, calls Supabase, and shows the confirmation state", async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/email address/i), "chef@example.com")
    await user.click(screen.getByRole("button", { name: /send reset link/i }))

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith("chef@example.com", {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
    })
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Check your email" })
    )
    expect(screen.getByText(/we've sent a password reset link to/i)).toBeInTheDocument()
  })

  it("shows an error toast when Supabase returns an error", async () => {
    const user = userEvent.setup()
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: "No account found" } })

    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/email address/i), "chef@example.com")
    await user.click(screen.getByRole("button", { name: /send reset link/i }))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "No account found",
          variant: "destructive",
        })
      )
    })
  })

  it("lets the user reset the form after a successful request", async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/email address/i), "chef@example.com")
    await user.click(screen.getByRole("button", { name: /send reset link/i }))

    await screen.findByRole("button", { name: /send another link/i })
    await user.click(screen.getByRole("button", { name: /send another link/i }))

    expect(screen.getByLabelText(/email address/i)).toHaveValue("")
  })
})
