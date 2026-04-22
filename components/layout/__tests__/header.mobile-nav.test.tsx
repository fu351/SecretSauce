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

vi.mock("@/hooks", () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
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

    const profileLink = screen.getByLabelText("Profile")
    expect(profileLink).not.toHaveAttribute("aria-disabled", "true")

  })

  it("uses icon-only sign-in in signed-out mobile nav", async () => {
    useAuthMock.mockReturnValue({
      user: null,
      profile: null,
      signOut: vi.fn(),
    })
    const { Header } = await import("../header")
    render(<Header />)

    const signInLinks = screen.getAllByRole("link", { name: /sign in/i })
    expect(signInLinks.length).toBeGreaterThan(0)
    const mobileSignInLink = signInLinks.find((link) => link.querySelector("svg"))
    expect(mobileSignInLink).toBeTruthy()
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
    expect(screen.getByLabelText("Trackers")).toBeInTheDocument()
    expect(screen.queryByText("Sign In")).not.toBeInTheDocument()
  })

  it("shows the top-right menu only on profile pages", async () => {
    const { Header } = await import("../header")
    const user = userEvent.setup()

    pathnameMock.mockReturnValue("/home")
    const { rerender } = render(<Header />)
    expect(screen.queryByRole("button", { name: /open menu/i })).not.toBeInTheDocument()

    pathnameMock.mockReturnValue("/user/chef-taylor")
    rerender(<Header />)

    await user.click(screen.getByRole("button", { name: /open menu/i }))
    expect(screen.getByRole("menuitem", { name: /profile/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /pantry/i })).toBeInTheDocument()
  })
})

