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

vi.mock("@/hooks/ui/use-toast", () => ({
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
    expect(screen.getByRole("heading", { name: /how much recipe guidance/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /beginner/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /weekly grocery budget/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /about \$200\/week/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /any dietary filters/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /^next$/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /what cuisines should we favor/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /^next$/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /how much cooking time should we assume/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /under 30 minutes/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /where should we search for groceries/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole("button", { name: /use san francisco address/i }))
  await user.click(screen.getByRole("button", { name: /^next$/i }))

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /choose your app theme/i })).toBeInTheDocument()
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

    expect(document.body).toHaveClass("onboarding-route")

    await completeRequiredOnboardingFlow(user)
    await user.click(screen.getByRole("button", { name: /light mode/i }))
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
    expect(screen.queryByRole("heading", { name: /set up your preferences/i })).not.toBeInTheDocument()
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
      expect(screen.getByRole("heading", { name: /how much recipe guidance/i })).toBeInTheDocument()
    })

    const intermediate = screen.getByRole("button", { name: /intermediate/i })
    expect(intermediate.className).toMatch(/border-\[#e8dcc4\]|border-orange-600/)

    await user.click(screen.getByRole("button", { name: /^next$/i }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /weekly grocery budget/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole("heading", { name: /your investment/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /essential/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /premium/i })).not.toBeInTheDocument()
    const lowBudget = screen.getByRole("button", { name: /about \$120\/week/i })
    expect(lowBudget.className).toMatch(/border-\[#e8dcc4\]|border-orange-600/)

    await user.click(screen.getByRole("button", { name: /^next$/i }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /any dietary filters/i })).toBeInTheDocument()
    })
    const veg = screen.getByRole("button", { name: /vegetarian/i })
    expect(veg.className).toMatch(/border-\[#e8dcc4\]|border-orange-600/)

    await user.click(screen.getByRole("button", { name: /^next$/i }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /what cuisines should we favor/i })).toBeInTheDocument()
    })
    const italian = screen.getByRole("button", { name: /italian/i })
    expect(italian.className).toMatch(/border-\[#e8dcc4\]|border-orange-600/)

    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole("button", { name: /^next$/i }))
    }
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /where should we search for groceries/i })).toBeInTheDocument()
    })
    expect(screen.getByPlaceholderText("ZIP/Postal")).toHaveValue("94105")
    expect(screen.getByPlaceholderText("City")).toHaveValue("San Francisco")
  })
})
