import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { mockRouter } from "@/test/utils/navigation"

const mockToast = vi.fn()
const mockSetTheme = vi.fn()
const mockUpdateProfile = vi.fn()

let mockAuthState: {
  user: { id: string; email: string } | null
  profile: Record<string, unknown> | null
  loading: boolean
  updateProfile: typeof mockUpdateProfile
} = {
  user: {
    id: "user_1",
    email: "cook@example.com",
  },
  profile: null,
  loading: false,
  updateProfile: mockUpdateProfile,
}

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt={String(props.alt ?? "")} />,
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => mockAuthState),
}))

vi.mock("@/contexts/theme-context", () => ({
  useTheme: vi.fn(() => ({
    setTheme: mockSetTheme,
  })),
}))

vi.mock("@/hooks", () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock("@/components/shared/address-autocomplete", () => ({
  AddressAutocomplete: ({
    onChange,
  }: {
    onChange: (value: {
      formattedAddress: string
      addressLine1: string
      addressLine2: string
      city: string
      state: string
      postalCode: string
      country: string
      lat: number
      lng: number
    }) => void
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          formattedAddress: "1 Ferry Building, San Francisco, CA 94105",
          addressLine1: "1 Ferry Building",
          addressLine2: "",
          city: "San Francisco",
          state: "CA",
          postalCode: "94105",
          country: "USA",
          lat: 37.7955,
          lng: -122.3937,
        })
      }
    >
      Use San Francisco address
    </button>
  ),
}))

async function completeRequiredOnboardingFlow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^next$/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /your current level/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /apprentice/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /your investment/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /balanced/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /dietary considerations/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /^next$/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /cuisine preferences/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /^next$/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /preferred cooking time/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /quick meals/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /location preferences/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /use san francisco address/i }))
  await user.click(screen.getByRole("button", { name: /^next$/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /choose your theme/i })).toBeInTheDocument()
  })
}

describe("OnboardingPage", () => {
  let OnboardingPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    mockAuthState = {
      user: {
        id: "user_1",
        email: "cook@example.com",
      },
      profile: null,
      loading: false,
      updateProfile: mockUpdateProfile,
    }
    mockUpdateProfile.mockResolvedValue(undefined)
    mockRouter()

    const mod = await import("../page")
    OnboardingPage = mod.default
  })

  it("walks through the onboarding flow, saves preferences, and routes to welcome", async () => {
    const router = mockRouter()
    const user = userEvent.setup()

    render(<OnboardingPage />)

    await completeRequiredOnboardingFlow(user)
    await user.click(screen.getByRole("button", { name: /warm mode/i }))
    await user.click(screen.getByRole("button", { name: /finish/i }))

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          primary_goal: "cooking",
          cooking_level: "beginner",
          budget_range: "medium",
          cooking_time_preference: "quick",
          zip_code: "94105",
          city: "San Francisco",
          state: "CA",
          country: "USA",
          theme_preference: "light",
        })
      )
      expect(router.push).toHaveBeenCalledWith("/welcome")
    })
  })

  it("redirects anonymous users to sign-in immediately", async () => {
    mockAuthState = {
      user: null,
      profile: null,
      loading: false,
      updateProfile: mockUpdateProfile,
    }
    const router = mockRouter()
    const mod = await import("../page")
    const Page = mod.default

    render(<Page />)

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/auth/signin")
    })
    expect(screen.queryByRole("heading", { name: /tell us about your kitchen/i })).not.toBeInTheDocument()
  })

  it("hydrates the form from profile once (cooking level, goal order, postal)", async () => {
    mockAuthState = {
      user: { id: "user_1", email: "cook@example.com" },
      profile: {
        primary_goal: "budgeting",
        cooking_level: "intermediate",
        budget_range: "low",
        dietary_preferences: ["vegetarian"],
        cuisine_preferences: ["italian"],
        cooking_time_preference: "medium",
        zip_code: "94105",
        city: "San Francisco",
        state: "CA",
        country: "USA",
        grocery_distance_miles: 15,
        theme_preference: "dark",
      },
      loading: false,
      updateProfile: mockUpdateProfile,
    }
    const mod = await import("../page")
    const Page = mod.default
    const user = userEvent.setup()

    render(<Page />)

    await user.click(screen.getByRole("button", { name: /^next$/i }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /your current level/i })).toBeInTheDocument()
    })

    const practitioner = screen.getByRole("button", { name: /practitioner/i })
    expect(practitioner.className).toMatch(/border-\[#e8dcc4\]|border-orange-600/)

    await user.click(screen.getByRole("button", { name: /^next$/i }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /your investment/i })).toBeInTheDocument()
    })
    const essential = screen.getByRole("button", { name: /essential/i })
    expect(essential.className).toMatch(/border-\[#e8dcc4\]|border-orange-600/)

    await user.click(screen.getByRole("button", { name: /^next$/i }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /dietary considerations/i })).toBeInTheDocument()
    })
    const veg = screen.getByRole("button", { name: /vegetarian/i })
    expect(veg.className).toMatch(/border-\[#e8dcc4\]|border-orange-600/)

    await user.click(screen.getByRole("button", { name: /^next$/i }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /cuisine preferences/i })).toBeInTheDocument()
    })
    const italian = screen.getByRole("button", { name: /italian/i })
    expect(italian.className).toMatch(/border-\[#e8dcc4\]|border-orange-600/)

    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole("button", { name: /^next$/i }))
    }
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /location preferences/i })).toBeInTheDocument()
    })
    expect(screen.getByPlaceholderText("ZIP/Postal")).toHaveValue("94105")
    expect(screen.getByPlaceholderText("City")).toHaveValue("San Francisco")
  })
})
