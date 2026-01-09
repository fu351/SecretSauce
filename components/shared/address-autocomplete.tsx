"use client"

import { useEffect, useMemo, useRef } from "react"
import { Input } from "@/components/ui/input"

declare const google: any

type ParsedAddress = {
  formattedAddress: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  lat?: number | null
  lng?: number | null
}

interface AddressAutocompleteProps {
  value: ParsedAddress
  onChange: (address: ParsedAddress) => void
  placeholder?: string
  disabled?: boolean
}

const componentMap: Record<string, keyof ParsedAddress> = {
  street_number: "addressLine1",
  route: "addressLine1",
  locality: "city",
  administrative_area_level_1: "state",
  country: "country",
  postal_code: "postalCode",
}

function parsePlace(place: any): ParsedAddress {
  const parsed: ParsedAddress = {
    formattedAddress: place.formatted_address || "",
    lat: place.geometry?.location?.lat?.() ?? null,
    lng: place.geometry?.location?.lng?.() ?? null,
  }

  const addrParts: Record<keyof ParsedAddress, string[]> = {
    formattedAddress: [],
    addressLine1: [],
    addressLine2: [],
    city: [],
    state: [],
    postalCode: [],
    country: [],
    lat: [],
    lng: [],
  }

  place.address_components?.forEach((component) => {
    component.types.forEach((type) => {
      const key = componentMap[type]
      if (key && component.long_name) {
        addrParts[key]?.push(component.long_name)
      }
    })
  })

  if (addrParts.addressLine1.length) {
    parsed.addressLine1 = addrParts.addressLine1.join(" ")
  }
  if (addrParts.city.length) parsed.city = addrParts.city[0]
  if (addrParts.state.length) parsed.state = addrParts.state[0]
  if (addrParts.postalCode.length) parsed.postalCode = addrParts.postalCode[0]
  if (addrParts.country.length) parsed.country = addrParts.country[0]

  return parsed
}

export function AddressAutocomplete({ value, onChange, placeholder, disabled }: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const controlledValue = useMemo(
    () => value?.formattedAddress || value?.addressLine1 || "",
    [value?.addressLine1, value?.formattedAddress],
  )

  // Sync the input when upstream value changes
  useEffect(() => {
    if (inputRef.current && controlledValue !== inputRef.current.value) {
      inputRef.current.value = controlledValue
    }
  }, [controlledValue])

  useEffect(() => {
    if (typeof window === "undefined") return
    const inputEl = inputRef.current
    if (!inputEl) return
    if (!window.google?.maps?.places?.Autocomplete) return

    const autocomplete = new google.maps.places.Autocomplete(inputEl, {
      types: ["address"],
      fields: ["formatted_address", "address_components", "geometry"],
    })

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace()
      const parsed = parsePlace(place)
      if (parsed.formattedAddress && inputRef.current) {
        inputRef.current.value = parsed.formattedAddress
      }
      // Use callback ref pattern to avoid recreating listener on every value change
      onChange({
        ...parsed,
      })
    })

    return () => {
      if (listener) listener.remove()
    }
    // Only recreate autocomplete if onChange function identity changes (not on every value update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange])

  return (
    <Input
      ref={inputRef}
      placeholder={placeholder}
      disabled={disabled}
      value={controlledValue}
      onChange={(e) =>
        onChange({
          ...value,
          formattedAddress: e.target.value,
        })
      }
    />
  )
}
