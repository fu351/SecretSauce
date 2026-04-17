import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useRouter } from "next/navigation"

const mockStartTutorial = vi.fn()
const mockSkipTutorial = vi.fn()

let mockAuthState = {
  profile: { id: "profile_1" },
  loading: false,
}

let mockThemeState = { theme: "dark" }

vi.mock("@/components/auth/tier-gate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => mockAuthState),
}))

vi.mock("@/contexts/tutorial-context", () => ({
  useTutorial: vi.fn(() => ({
    startTutorial: mockStartTutorial,
    skipTutorial: mockSkipTutorial,
  })),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: vi.fn(() => mockThemeState),
}))

describe("WelcomePage", () => {
  let WelcomePage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthState = {
      profile: { id: "profile_1" },
      loading: false,
    }
    mockThemeState = { theme: "dark" }
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as any)

    const mod = await import("../page")
    WelcomePage = mod.default
  })

  it("shows a loading state while auth is still loading", () => {
    mockAuthState = { profile: null, loading: true }

    render(<WelcomePage />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it("starts the tutorial when the user has a profile", async () => {
    const user = userEvent.setup()
    render(<WelcomePage />)

    await user.click(screen.getByRole("button", { name: /start the tour/i }))

    expect(mockStartTutorial).toHaveBeenCalledTimes(1)
    expect(vi.mocked(useRouter)().push).not.toHaveBeenCalled()
  })

  it("disables the start-tour button when the profile is missing", async () => {
    mockAuthState = { profile: null, loading: false }
    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)

    expect(screen.getByRole("button", { name: /start the tour/i })).toBeDisabled()
  })

  it("skips the tutorial and routes to the dashboard", async () => {
    const user = userEvent.setup()
    render(<WelcomePage />)

    await user.click(screen.getByRole("button", { name: /skip for now/i }))

    await waitFor(() => {
      expect(mockSkipTutorial).toHaveBeenCalledTimes(1)
      expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/dashboard")
    })
  })
})
