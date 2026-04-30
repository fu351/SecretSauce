import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { mockRouter } from "@/test/utils/navigation"

const mockToast = vi.fn()
const mockUpdateProfile = vi.fn()
const mockSignOut = vi.fn()
const mockSetTheme = vi.fn()
const mockResetTutorial = vi.fn()
const mockFetchProfileById = vi.fn()
const mockUpdatePassword = vi.fn()
const mockCreateEmailAddress = vi.fn()
const mockUploadAvatar = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockUpdateFeaturePreferences = vi.fn()

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt={String(props.alt ?? "")} />,
}))

vi.mock("@/components/auth/tier-gate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: "user_1",
      email: "avery@example.com",
      created_at: "2030-01-01T00:00:00.000Z",
    },
    updateProfile: mockUpdateProfile,
    signOut: mockSignOut,
  })),
}))

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      updatePassword: mockUpdatePassword,
      createEmailAddress: mockCreateEmailAddress,
    },
  }),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: vi.fn(() => ({
    theme: "dark",
    setTheme: mockSetTheme,
  })),
}))

vi.mock("@/contexts/tutorial-context", () => ({
  useTutorial: vi.fn(() => ({
    tutorialCompletedAt: "2030-01-05T00:00:00.000Z",
    resetTutorial: mockResetTutorial,
  })),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock("@/lib/database/profile-db", () => ({
  profileDB: {
    fetchProfileById: mockFetchProfileById,
  },
}))

vi.mock("@/lib/database/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mockUploadAvatar,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  },
}))

vi.mock("@/hooks/use-feature-preferences", () => ({
  useFeaturePreferences: () => ({
    preferences: {
      budgetTrackingEnabled: true,
      streaksEnabled: true,
      socialEnabled: false,
      pantryEnabled: true,
      socialVisibilityDefault: "private",
      autoDraftSocialEnabled: false,
      showReactionCounts: true,
      rawMediaRetentionDays: 7,
      confirmationMode: "ask_when_uncertain",
      pantryAutoDeductEnabled: false,
      nudgesEnabled: true,
      hapticsEnabled: true,
      audioEnabled: false,
      respectReducedMotion: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    },
    updatePreferences: mockUpdateFeaturePreferences,
    updatePreferencesAsync: vi.fn(),
    updating: false,
    loading: false,
    error: null,
  }),
}))

vi.mock("@/components/tutorial/tutorial-selection-modal", () => ({
  TutorialSelectionModal: () => null,
}))

vi.mock("@/components/shared/address-autocomplete", () => ({
  AddressAutocomplete: () => <div>Address autocomplete</div>,
}))

describe("SettingsPage", () => {
  let SettingsPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockUpdateProfile.mockResolvedValue(undefined)
    mockSignOut.mockResolvedValue(undefined)
    mockUpdatePassword.mockResolvedValue(undefined)
    mockCreateEmailAddress.mockResolvedValue({
      id: "email_new",
      prepareVerification: vi.fn().mockResolvedValue(undefined),
      attemptVerification: vi.fn().mockResolvedValue({ id: "email_new" }),
    })
    mockUploadAvatar.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn.test/avatar.png" } })
    mockUpdateFeaturePreferences.mockReset()
    mockFetchProfileById.mockResolvedValue({
      id: "user_1",
      email: "avery@example.com",
      full_name: "Avery Cook",
      avatar_url: null,
      primary_goal: "cooking",
      cooking_level: "intermediate",
      budget_range: "medium",
      cuisine_preferences: ["Italian"],
      cooking_time_preference: "any",
      zip_code: "94105",
      formatted_address: "1 Ferry Building, San Francisco, CA 94105",
      latitude: 37.7955,
      longitude: -122.3937,
      grocery_distance_miles: 10,
      dietary_preferences: ["vegetarian"],
      theme_preference: "dark",
    })
    mockRouter()
    vi.stubGlobal("confirm", vi.fn(() => true))

    const mod = await import("../page")
    SettingsPage = mod.default
  })

  it("loads profile data and persists theme changes", async () => {
    const user = userEvent.setup()

    render(<SettingsPage />)

    const themeSwitch = await screen.findByRole("switch", { name: /dark mode/i })
    await user.click(themeSwitch)

    await waitFor(() => {
      expect(mockSetTheme).toHaveBeenCalledWith("light")
      expect(mockUpdateProfile).toHaveBeenCalledWith({ theme_preference: "light" })
    })
  })

  it("uses direct settings labels instead of marketing copy", async () => {
    render(<SettingsPage />)

    expect(await screen.findByText("App features")).toBeInTheDocument()
    expect(await screen.findByText("Food preferences")).toBeInTheDocument()
    expect(screen.getByText("Cook better meals")).toBeInTheDocument()
    expect(screen.getByText("Save money")).toBeInTheDocument()
    expect(screen.getByText("Cooking level")).toBeInTheDocument()
    expect(screen.getByText("Grocery budget")).toBeInTheDocument()
    expect(screen.queryByText("Master the Craft")).not.toBeInTheDocument()
    expect(screen.queryByText("Elevate Your Journey")).not.toBeInTheDocument()
    expect(screen.queryByText("Feature Controls")).not.toBeInTheDocument()
    expect(screen.queryByText("Recommendation inputs")).not.toBeInTheDocument()
  })

  it("updates shared feature foundation controls", async () => {
    const user = userEvent.setup()

    render(<SettingsPage />)

    const socialSwitch = await screen.findByRole("switch", { name: /social/i })
    await user.click(socialSwitch)

    expect(mockUpdateFeaturePreferences).toHaveBeenCalledWith({ socialEnabled: true })
  })

  it("blocks mismatched passwords and surfaces the validation error", async () => {
    const user = userEvent.setup()

    render(<SettingsPage />)

    await screen.findByRole("heading", { name: /settings/i })
    await user.click(screen.getByRole("button", { name: /change password/i }))
    await user.type(screen.getByPlaceholderText("New password (min 6 characters)"), "newpass1")
    await user.type(screen.getByPlaceholderText("Confirm new password"), "different2")
    await user.click(screen.getByRole("button", { name: /update password/i }))

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Passwords don't match",
        variant: "destructive",
      })
    )
    expect(mockUpdatePassword).not.toHaveBeenCalled()
  })

  it("signs the user out and routes them home after confirmation", async () => {
    const router = mockRouter()
    const user = userEvent.setup()

    render(<SettingsPage />)

    await screen.findByRole("heading", { name: /settings/i })
    await user.click(screen.getByRole("button", { name: /sign out/i }))

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
      expect(router.push).toHaveBeenCalledWith("/home")
      expect(router.refresh).toHaveBeenCalled()
    })
  })

  it("renders help, legal, and about links with feedback access", async () => {
    const user = userEvent.setup()
    const feedbackHandler = vi.fn()
    window.addEventListener("open-feedback-widget", feedbackHandler)

    render(<SettingsPage />)

    expect(await screen.findByText("Help and legal")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /about/i })).toHaveAttribute("href", "/about")
    expect(screen.getByRole("link", { name: /help/i })).toHaveAttribute("href", "/help")
    expect(screen.getByRole("link", { name: /contact/i })).toHaveAttribute("href", "/contact")
    expect(screen.getByRole("link", { name: /terms/i })).toHaveAttribute("href", "/terms")
    expect(screen.getByRole("link", { name: /privacy/i })).toHaveAttribute("href", "/privacy")
    expect(screen.getByRole("link", { name: /accessibility/i })).toHaveAttribute("href", "/accessibility")

    await user.click(screen.getByRole("button", { name: /send feedback/i }))
    expect(feedbackHandler).toHaveBeenCalledTimes(1)
    window.removeEventListener("open-feedback-widget", feedbackHandler)
  })
})
