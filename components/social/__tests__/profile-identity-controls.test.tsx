import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockToast = vi.fn()
const mockUpdateProfile = vi.fn()
const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt={String(props.alt ?? "")} />,
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

vi.mock("@/lib/database/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  },
}))

describe("ProfileIdentityControls", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateProfile.mockResolvedValue(undefined)
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn.test/avatar.png" } })
  })

  it("updates avatar, name, and username from the profile page", async () => {
    const user = userEvent.setup()
    const { ProfileIdentityControls } = await import("../profile-identity-controls")

    render(
      <ProfileIdentityControls
        isOwnProfile={true}
        fullName="Avery Cook"
        avatarUrl={null}
        username="avery_cook"
        isPrivate={false}
        fullNameHidden={false}
      />
    )

    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/public profile/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /^edit$/i }))

    await user.clear(screen.getByLabelText(/^full name$/i))
    await user.type(screen.getByLabelText(/^full name$/i), "Avery Baker")

    const file = new File(["avatar"], "avatar.png", { type: "image/png" })
    await user.upload(screen.getByLabelText(/upload avatar/i), file)

    await user.clear(screen.getByLabelText(/username/i))
    await user.type(screen.getByLabelText(/username/i), "avery_baker")

    await user.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenNthCalledWith(1, {
        avatar_url: "https://cdn.test/avatar.png",
      })
      expect(mockUpdateProfile).toHaveBeenNthCalledWith(2, {
        full_name: "Avery Baker",
        username: "avery_baker",
        is_private: false,
        full_name_hidden: false,
      })
    })
  })

  it("does not render for non-owners", async () => {
    const { ProfileIdentityControls } = await import("../profile-identity-controls")

    render(
      <ProfileIdentityControls
        isOwnProfile={false}
        fullName="Avery Cook"
        avatarUrl={null}
        username="avery_cook"
        isPrivate={false}
        fullNameHidden={false}
      />
    )

    expect(screen.getByText("Avery Cook")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/public profile/i)).toBeInTheDocument()
  })

  it("hides the full name when the profile is configured to hide it", async () => {
    const { ProfileIdentityControls } = await import("../profile-identity-controls")

    render(
      <ProfileIdentityControls
        isOwnProfile={false}
        fullName="Avery Cook"
        avatarUrl={null}
        username="avery_cook"
        isPrivate={false}
        fullNameHidden={true}
      />
    )

    expect(screen.getByRole("heading", { name: /@avery_cook/i })).toBeInTheDocument()
    expect(screen.queryByText("Avery Cook")).not.toBeInTheDocument()
  })
})
