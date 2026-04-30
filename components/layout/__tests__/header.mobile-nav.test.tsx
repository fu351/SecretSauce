import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const pushMock = vi.fn()
const pathnameMock = vi.fn(() => "/home")

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt={String(props.alt ?? "")} />,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
  useRouter: vi.fn(() => ({ push: pushMock, refresh: vi.fn() })),
}))

const useAuthMock = vi.fn(() => ({
  user: { id: "u_1", email: "cook@example.com" },
  signOut: vi.fn(),
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: vi.fn(() => ({ theme: "dark" })),
}))

vi.mock("@/hooks/use-admin", () => ({
  useIsAdmin: vi.fn(() => ({ isAdmin: false })),
}))

vi.mock("@/hooks/ui/use-toast", () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}))

vi.mock("@/hooks/use-feature-flag", () => ({
  useFoundationFeatureFlag: vi.fn(() => ({ isEnabled: false })),
}))

vi.mock("@/hooks/use-feature-preferences", () => ({
  useFeaturePreferences: vi.fn(() => ({
    preferences: { budgetTrackingEnabled: false },
  })),
}))

describe("Header mobile nav", () => {
  beforeEach(() => {
    pushMock.mockReset()
    pathnameMock.mockReturnValue("/home")
    useAuthMock.mockReturnValue({
      user: { id: "u_1", email: "cook@example.com" },
      profile: { username: "chef-taylor" },
      signOut: vi.fn(),
    })
  })

  it("keeps meal planner in the bottom bar and removes recipes icon", async () => {
    const { Header } = await import("../header")
    const user = userEvent.setup()
    render(<Header />)

    expect(screen.queryByLabelText("Recipes")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Meal Planner")).toBeInTheDocument()

    const fabToggle = screen.getByRole("button", { name: /toggle quick menu/i })
    await user.click(fabToggle)

    const homeLink = screen.getByLabelText("Home")
    expect(homeLink).not.toHaveAttribute("aria-disabled", "true")

    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument()

  })

  it("shows auth options in hamburger menu when signed out", async () => {
    useAuthMock.mockReturnValue({
      user: null,
      profile: null,
      signOut: vi.fn(),
    })
    const { Header } = await import("../header")
    const user = userEvent.setup()
    render(<Header />)

    await user.click(screen.getByRole("button", { name: /open menu/i }))
    expect(screen.getByRole("menuitem", { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /sign up/i })).toBeInTheDocument()
  })

  it("shows updated logged-in FAB actions and omits FAB sign-in action", async () => {
    const { Header } = await import("../header")
    const user = userEvent.setup()
    render(<Header />)

    await user.click(screen.getByRole("button", { name: /toggle quick menu/i }))

    expect(screen.getByLabelText("Leaderboard")).toBeInTheDocument()
    expect(screen.getByLabelText("Pantry")).toBeInTheDocument()
    expect(screen.getByLabelText("Add Recipe")).toBeInTheDocument()
    expect(screen.getByLabelText("Recipes")).toBeInTheDocument()
    expect(screen.getByLabelText("Send Feedback")).toBeInTheDocument()
    expect(screen.queryByText("Sign In")).not.toBeInTheDocument()
  })

  it("hides app navigation during onboarding", async () => {
    pathnameMock.mockReturnValue("/onboarding")
    const { Header } = await import("../header")
    render(<Header />)

    expect(screen.queryByLabelText("Home")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /toggle quick menu/i })).not.toBeInTheDocument()
  })

  it("shows sleek bottom-nav menu with profile options", async () => {
    const { Header } = await import("../header")
    const user = userEvent.setup()
    render(<Header />)

    await user.click(screen.getByRole("button", { name: /open menu/i }))
    expect(screen.getByRole("menuitem", { name: /profile/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /pantry/i })).not.toBeInTheDocument()
  })
})
