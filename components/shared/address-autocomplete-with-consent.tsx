"use client"

import { useEffect, useState } from "react"
import Script from "next/script"
import { MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { CookieSettingsButton } from "@/components/privacy/cookie-settings-button"
import { useCookieConsent } from "@/contexts/cookie-consent-context"
import {
  AddressAutocomplete,
  type AddressAutocompleteProps,
} from "@/components/shared/address-autocomplete"

type AddressAutocompleteWithConsentProps = AddressAutocompleteProps

export function AddressAutocompleteWithConsent(props: AddressAutocompleteWithConsentProps) {
  const { thirdPartyAllowed } = useCookieConsent()
  const [mapsReady, setMapsReady] = useState(false)
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    if (!thirdPartyAllowed) {
      setMapsReady(false)
      return
    }

    if (typeof window !== "undefined" && window.google?.maps?.places?.Autocomplete) {
      setMapsReady(true)
    }
  }, [thirdPartyAllowed])

  if (!thirdPartyAllowed || !mapsKey) {
    return (
      <div className="space-y-2">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={props.placeholder ?? "Enter your address"}
            disabled={props.disabled}
            value={props.value?.formattedAddress || props.value?.addressLine1 || ""}
            onChange={(event) =>
              props.onChange({
                ...props.value,
                formattedAddress: event.target.value,
              })
            }
            className="pl-10"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Address autocomplete uses third-party map services and is disabled until you allow third-party cookies.
        </p>
        <CookieSettingsButton className="text-xs" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places`}
        strategy="afterInteractive"
        onLoad={() => setMapsReady(true)}
      />
      <AddressAutocomplete {...props} mapsReady={mapsReady} />
    </div>
  )
}
