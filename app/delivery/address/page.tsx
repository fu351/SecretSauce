"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, MapPin, ShieldCheck, Truck } from "lucide-react"

import { AuthGate } from "@/components/auth/tier-gate"
import { AddressAutocomplete } from "@/components/shared/address-autocomplete"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { profileDB } from "@/lib/database/profile-db"

type AddressState = {
  formattedAddress: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  lat: number | null
  lng: number | null
}

const EMPTY_ADDRESS: AddressState = {
  formattedAddress: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  lat: null,
  lng: null,
}

function sanitizeReturnTo(value: string | null): string {
  if (!value) return "/store"
  if (!value.startsWith("/") || value.startsWith("//")) return "/store"
  return value
}

function hasDeliveryAddress(address: AddressState): boolean {
  return Boolean(address.formattedAddress.trim()) || (
    Boolean(address.addressLine1.trim()) &&
    Boolean(address.city.trim()) &&
    Boolean(address.state.trim()) &&
    Boolean(address.postalCode.trim())
  )
}

function buildReadableAddress(address: AddressState): string {
  if (address.formattedAddress.trim()) return address.formattedAddress.trim()

  const pieces = [address.addressLine1, address.addressLine2, address.city, address.state, address.postalCode]
    .map((piece) => piece.trim())
    .filter(Boolean)

  return pieces.join(", ")
}

function DeliveryAddressPageContent() {
  const { user, updateProfile } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"))

  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [address, setAddress] = useState<AddressState>(EMPTY_ADDRESS)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return

      try {
        const profile = await profileDB.fetchProfileById(user.id)
        if (!profile) return

        setAddress({
          formattedAddress: profile.formatted_address || "",
          addressLine1: profile.address_line1 || "",
          addressLine2: profile.address_line2 || "",
          city: profile.city || "",
          state: profile.state || "",
          postalCode: profile.zip_code || "",
          country: profile.country || "",
          lat: profile.latitude ?? null,
          lng: profile.longitude ?? null,
        })
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [user])

  const canContinue = useMemo(() => hasDeliveryAddress(address), [address])

  const handleSubmit = async () => {
    if (!user) return
    if (!canContinue) {
      toast({
        title: "Add a delivery address",
        description: "Please enter a full address to continue.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      await updateProfile({
        formatted_address: buildReadableAddress(address),
        address_line1: address.addressLine1 || null,
        address_line2: address.addressLine2 || null,
        city: address.city || null,
        state: address.state || null,
        zip_code: address.postalCode || null,
        country: address.country || null,
        latitude: address.lat,
        longitude: address.lng,
      })

      toast({
        title: "Address saved",
        description: "Your delivery address is ready for checkout.",
      })
      router.push(returnTo)
    } catch (error) {
      toast({
        title: "Could not save address",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-orange-50" />
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-orange-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push(returnTo)}
            className="mb-4 -ml-3 text-gray-700 hover:bg-white/70"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="max-w-3xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-orange-700">
              Delivery address
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-gray-950 md:text-5xl">
              Where should we send your groceries?
            </h1>
            <p className="mt-4 max-w-2xl text-base text-gray-700 md:text-lg">
              Save a delivery address here and we’ll use it for the next delivery checkout.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="border-0 bg-white/90 shadow-xl shadow-orange-100/50 backdrop-blur">
            <CardHeader className="border-b border-orange-100/80 bg-gradient-to-r from-orange-50 to-amber-50">
              <CardTitle className="flex items-center gap-2 text-gray-950">
                <MapPin className="h-5 w-5 text-orange-600" />
                Add or update address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <Label className="text-gray-900">Home Address</Label>
                <AddressAutocomplete
                  value={address}
                  onChange={(next) =>
                    setAddress((prev) => ({
                      ...prev,
                      ...next,
                      formattedAddress: next.formattedAddress ?? prev.formattedAddress,
                      addressLine1: next.addressLine1 ?? prev.addressLine1,
                      addressLine2: next.addressLine2 ?? prev.addressLine2,
                      city: next.city ?? prev.city,
                      state: next.state ?? prev.state,
                      postalCode: next.postalCode ?? prev.postalCode,
                      country: next.country ?? prev.country,
                      lat: next.lat ?? prev.lat,
                      lng: next.lng ?? prev.lng,
                    }))
                  }
                  placeholder="Search your street address"
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-gray-900">Apartment, suite, etc.</Label>
                  <Input
                    value={address.addressLine2}
                    onChange={(e) =>
                      setAddress((prev) => ({ ...prev, addressLine2: e.target.value }))
                    }
                    placeholder="Optional"
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Postal Code</Label>
                  <Input
                    value={address.postalCode}
                    onChange={(e) =>
                      setAddress((prev) => ({ ...prev, postalCode: e.target.value }))
                    }
                    placeholder="94105"
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">City</Label>
                  <Input
                    value={address.city}
                    onChange={(e) => setAddress((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder="San Francisco"
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">State</Label>
                  <Input
                    value={address.state}
                    onChange={(e) => setAddress((prev) => ({ ...prev, state: e.target.value }))}
                    placeholder="CA"
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Country</Label>
                  <Input
                    value={address.country}
                    onChange={(e) => setAddress((prev) => ({ ...prev, country: e.target.value }))}
                    placeholder="United States"
                    className="mt-1 bg-white"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm text-gray-700">
                Tip: we only need one saved address. You can update it any time before checkout.
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-0 bg-gray-950 text-white shadow-xl shadow-gray-200/70">
              <CardContent className="space-y-5 p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-white/10 p-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/80">Secure checkout step</p>
                    <p className="text-xs text-white/50">
                      Saved to your profile, not Clerk or Stripe
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">Saved address preview</p>
                  <p className="mt-2 text-sm leading-6 text-white">
                    {canContinue ? buildReadableAddress(address) : "No delivery address saved yet"}
                  </p>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4">
                  <Truck className="h-5 w-5 text-orange-300" />
                  <div>
                    <p className="text-sm font-medium text-white">Used for delivery checkout</p>
                    <p className="text-xs text-white/60">
                      We’ll use this address to estimate and validate delivery.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={saving || loading}
                  className="w-full bg-orange-500 text-white hover:bg-orange-600"
                >
                  {saving ? "Saving..." : "Save address and continue"}
                </Button>

                <p className="text-xs text-white/60">
                  After saving, you’ll return to the page you came from.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DeliveryAddressPage() {
  return (
    <AuthGate>
      <DeliveryAddressPageContent />
    </AuthGate>
  )
}
