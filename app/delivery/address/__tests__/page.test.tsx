import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { mockRouter, mockSearchParams } from "@/test/utils/navigation"

const mockUpdateProfile = vi.fn()
const mockFetchProfileById = vi.fn()
const mockToast = vi.fn()
const mockAddressAutocomplete = vi.fn()

vi.mock("@/components/auth/tier-gate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user_1", email: "avery@example.com", created_at: "2030-01-01T00:00:00.000Z" },
    updateProfile: mockUpdateProfile,
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

vi.mock("@/components/shared/address-autocomplete", () => ({
  AddressAutocomplete: (props: any) => {
    mockAddressAutocomplete(props)
    return (
      <button
        type="button"
        onClick={() =>
          props.onChange({
            formattedAddress: "1 Ferry Building, San Francisco, CA 94105",
            addressLine1: "1 Ferry Building",
            city: "San Francisco",
            state: "CA",
            postalCode: "94105",
            country: "United States",
            lat: 37.7955,
            lng: -122.3937,
          })
        }
      >
        Mock address autocomplete
      </button>
    )
  },
}))

describe("DeliveryAddressPage", () => {
  let DeliveryAddressPage: React.ComponentType
  let router: ReturnType<typeof mockRouter>

  beforeEach(async () => {
    vi.clearAllMocks()
    router = mockRouter()
    mockSearchParams("returnTo=%2Fshopping")
    mockUpdateProfile.mockResolvedValue(undefined)
    mockFetchProfileById.mockResolvedValue({
      id: "user_1",
      email: "avery@example.com",
      formatted_address: "1 Ferry Building, San Francisco, CA 94105",
      address_line1: "1 Ferry Building",
      address_line2: "Apt 4",
      city: "San Francisco",
      state: "CA",
      zip_code: "94105",
      country: "United States",
      latitude: 37.7955,
      longitude: -122.3937,
    })

    const mod = await import("../page")
    DeliveryAddressPage = mod.default
  })

  it("saves the address and returns to checkout flow", async () => {
    render(<DeliveryAddressPage />)

    await waitFor(() => {
      expect(mockAddressAutocomplete).toHaveBeenCalled()
    })

    expect(mockAddressAutocomplete).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.objectContaining({
          formattedAddress: "1 Ferry Building, San Francisco, CA 94105",
          addressLine1: "1 Ferry Building",
          addressLine2: "Apt 4",
          city: "San Francisco",
          state: "CA",
          postalCode: "94105",
          country: "United States",
          lat: 37.7955,
          lng: -122.3937,
        }),
      })
    )

    await userEvent.click(screen.getByRole("button", { name: /save address and continue/i }))

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          formatted_address: "1 Ferry Building, San Francisco, CA 94105",
          address_line1: "1 Ferry Building",
          address_line2: "Apt 4",
          city: "San Francisco",
          state: "CA",
          zip_code: "94105",
          country: "United States",
          latitude: 37.7955,
          longitude: -122.3937,
        })
      )
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Address saved",
        })
      )
      expect(router.push).toHaveBeenCalledWith("/shopping")
    })
  })
})
