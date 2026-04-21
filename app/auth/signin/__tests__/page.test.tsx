import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useRouter } from "next/navigation"

const mockToast = vi.fn()
const mockCreate = vi.fn()
const mockPrepareSecondFactor = vi.fn()
const mockAttemptSecondFactor = vi.fn()
const mockSetActive = vi.fn()

let mockAuthState = {
  user: null,
  loading: false,
}

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} {...props} />
  ),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => mockAuthState),
}))

vi.mock("@clerk/nextjs", () => ({
  useSignIn: vi.fn(() => ({
    isLoaded: true,
    signIn: {
      create: mockCreate,
      prepareSecondFactor: mockPrepareSecondFactor,
      attemptSecondFactor: mockAttemptSecondFactor,
    },
    setActive: mockSetActive,
  })),
}))

async function fillAndSubmitPasswordStep(
  user: ReturnType<typeof userEvent.setup>,
  values = { email: "chef@example.com", password: "secret123" }
) {
  await user.type(screen.getByLabelText(/^email$/i), values.email)
  await user.type(screen.getByLabelText(/^password$/i), values.password)
  await user.click(screen.getByRole("button", { name: /^sign in$/i }))
}

describe("SignInPage", () => {
  let SignInPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    mockAuthState = {
      user: null,
      loading: false,
    }
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as any)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ profile: { id: "profile_1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    )

    const mod = await import("../page")
    SignInPage = mod.default
  })

  it("renders the credential form and sign-up link", () => {
    render(<SignInPage />)

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /request access/i })).toHaveAttribute(
      "href",
      "/auth/signup"
    )
  })

  it("completes sign-in, ensures the profile exists, and routes to the dashboard", async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue({ status: "complete", createdSessionId: "sess_1" })
    mockSetActive.mockResolvedValue(undefined)

    render(<SignInPage />)
    await fillAndSubmitPasswordStep(user)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        identifier: "chef@example.com",
        password: "secret123",
      })
      expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_1" })
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/ensure-profile", { method: "POST" })
      expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/dashboard")
    })

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Welcome Back" })
    )
  })

  it("enters the MFA flow, prepares an email code, and shows the verification step", async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue({
      status: "needs_second_factor",
      supportedSecondFactors: [
        {
          strategy: "email_code",
          safeIdentifier: "chef@example.com",
          emailAddressId: "email_1",
        },
      ],
    })
    mockPrepareSecondFactor.mockResolvedValue(undefined)

    render(<SignInPage />)
    await fillAndSubmitPasswordStep(user)

    await waitFor(() => {
      expect(mockPrepareSecondFactor).toHaveBeenCalledWith({
        strategy: "email_code",
        emailAddressId: "email_1",
      })
    })

    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    expect(screen.getByText(/code destination:/i)).toHaveTextContent("chef@example.com")
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Code sent" })
    )
  })

  it("submits the second-factor code and completes the session", async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue({
      status: "needs_second_factor",
      supportedSecondFactors: [
        {
          strategy: "email_code",
          safeIdentifier: "chef@example.com",
          emailAddressId: "email_1",
        },
      ],
    })
    mockPrepareSecondFactor.mockResolvedValue(undefined)
    mockAttemptSecondFactor.mockResolvedValue({
      status: "complete",
      createdSessionId: "sess_2",
    })

    render(<SignInPage />)
    await fillAndSubmitPasswordStep(user)
    await user.type(screen.getByLabelText(/verification code/i), "123456")
    await user.click(screen.getByRole("button", { name: /verify & sign in/i }))

    await waitFor(() => {
      expect(mockAttemptSecondFactor).toHaveBeenCalledWith({
        strategy: "email_code",
        code: "123456",
      })
      expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_2" })
      expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/dashboard")
    })
  })

  it("resends the MFA code when requested", async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue({
      status: "needs_second_factor",
      supportedSecondFactors: [
        {
          strategy: "email_code",
          safeIdentifier: "chef@example.com",
          emailAddressId: "email_1",
        },
      ],
    })
    mockPrepareSecondFactor.mockResolvedValue(undefined)

    render(<SignInPage />)
    await fillAndSubmitPasswordStep(user)
    await user.click(screen.getByRole("button", { name: /resend code/i }))

    await waitFor(() => {
      expect(mockPrepareSecondFactor).toHaveBeenCalledTimes(2)
    })
  })

  it("shows a destructive toast when the primary sign-in step fails", async () => {
    const user = userEvent.setup()
    mockCreate.mockRejectedValue({
      errors: [{ longMessage: "Invalid credentials" }],
    })

    render(<SignInPage />)
    await fillAndSubmitPasswordStep(user)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Access Denied",
          description: "Invalid credentials",
          variant: "destructive",
        })
      )
    })
  })
})
