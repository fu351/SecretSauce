import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockToast = vi.fn()
const mockSignInCreate = vi.fn()
const mockAttemptFirstFactor = vi.fn()
const mockSetActive = vi.fn()

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} {...props} />
  ),
}))

vi.mock("@/hooks/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: mockSignInCreate,
      attemptFirstFactor: mockAttemptFirstFactor,
    },
    setActive: mockSetActive,
  }),
}))

describe("ForgotPasswordPage", () => {
  let ForgotPasswordPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSignInCreate.mockResolvedValue({ status: "needs_first_factor" })
    mockAttemptFirstFactor.mockResolvedValue({ status: "complete", createdSessionId: "sess_1" })
    mockSetActive.mockResolvedValue(undefined)

    const mod = await import("../page")
    ForgotPasswordPage = mod.default
  })

  it("renders the email form and sign-in link", () => {
    render(<ForgotPasswordPage />)

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /send reset code/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute(
      "href",
      "/auth/signin"
    )
  })

  it("submits the email, calls Clerk, and shows the code entry state", async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/email address/i), "chef@example.com")
    await user.click(screen.getByRole("button", { name: /send reset code/i }))

    await waitFor(() => {
      expect(mockSignInCreate).toHaveBeenCalledWith({
        strategy: "reset_password_email_code",
        identifier: "chef@example.com",
      })
    })
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Check your email" })
    )
    expect(screen.getByText(/we've sent a password reset code to/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/reset code/i)).toBeInTheDocument()
  })

  it("shows an error toast when Clerk returns an error", async () => {
    const user = userEvent.setup()
    mockSignInCreate.mockRejectedValue({
      errors: [{ message: "No account found" }],
    })

    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/email address/i), "chef@example.com")
    await user.click(screen.getByRole("button", { name: /send reset code/i }))

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
    await user.click(screen.getByRole("button", { name: /send reset code/i }))

    await screen.findByRole("button", { name: /send another code/i })
    await user.click(screen.getByRole("button", { name: /send another code/i }))

    expect(screen.getByLabelText(/email address/i)).toHaveValue("")
  })

  it("verifies the code and updates the password", async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/email address/i), "chef@example.com")
    await user.click(screen.getByRole("button", { name: /send reset code/i }))
    await user.type(await screen.findByLabelText(/reset code/i), "123456")
    await user.type(screen.getByLabelText(/^new password$/i), "newpass1")
    await user.type(screen.getByLabelText(/confirm password/i), "newpass1")
    await user.click(screen.getByRole("button", { name: /reset password/i }))

    await waitFor(() => {
      expect(mockAttemptFirstFactor).toHaveBeenCalledWith({
        strategy: "reset_password_email_code",
        code: "123456",
        password: "newpass1",
      })
    })
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_1" })
    expect(screen.getByText(/your password has been reset/i)).toBeInTheDocument()
  })
})
