import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockToast = vi.fn()
const mockUpdateProfile = vi.fn()

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: "user_1",
      email: "chef@example.com",
      created_at: "2030-01-01T00:00:00.000Z",
    },
    updateProfile: mockUpdateProfile,
  })),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: mockToast }),
}))

describe("ProfilePrivacyControls", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateProfile.mockResolvedValue(undefined)
  })

  it("updates profile visibility from the profile page", async () => {
    const user = userEvent.setup()
    const { ProfilePrivacyControls } = await import("../profile-privacy-controls")

    render(<ProfilePrivacyControls isOwnProfile={true} isPrivate={false} />)

    const toggle = screen.getByRole("switch", { name: /toggle profile privacy/i })
    await user.click(toggle)

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ is_private: true })
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Profile set to private",
        })
      )
    })
  })

  it("does not render for non-owners", async () => {
    const { ProfilePrivacyControls } = await import("../profile-privacy-controls")

    render(<ProfilePrivacyControls isOwnProfile={false} isPrivate={false} />)

    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
  })
})
