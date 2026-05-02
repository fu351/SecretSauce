"use client"

import type React from "react"
import { createContext, useContext, useMemo, useState } from "react"
import {
  type CookieConsentPreferences,
  writeCookieConsentToDocument,
} from "@/lib/privacy/cookie-consent"

type CookieConsentContextValue = {
  preferences: CookieConsentPreferences | null
  analyticsAllowed: boolean
  thirdPartyAllowed: boolean
  preferencesDialogOpen: boolean
  openPreferences: () => void
  closePreferences: () => void
  savePreferences: (input: { analytics: boolean; thirdParty: boolean }) => void
  acceptAll: () => void
  acceptNecessaryOnly: () => void
}

const CookieConsentContext = createContext<CookieConsentContextValue | undefined>(undefined)

export function CookieConsentProvider({
  children,
  initialConsent,
}: {
  children: React.ReactNode
  initialConsent: CookieConsentPreferences | null
}) {
  const [preferences, setPreferences] = useState<CookieConsentPreferences | null>(initialConsent)
  const [preferencesDialogOpen, setPreferencesDialogOpen] = useState(false)

  const savePreferences = (input: { analytics: boolean; thirdParty: boolean }) => {
    const next = writeCookieConsentToDocument(input)
    setPreferences(next)
    setPreferencesDialogOpen(false)
  }

  const value = useMemo<CookieConsentContextValue>(
    () => ({
      preferences,
      analyticsAllowed: preferences?.analytics ?? false,
      thirdPartyAllowed: preferences?.thirdParty ?? false,
      preferencesDialogOpen,
      openPreferences: () => setPreferencesDialogOpen(true),
      closePreferences: () => setPreferencesDialogOpen(false),
      savePreferences,
      acceptAll: () => {
        savePreferences({ analytics: true, thirdParty: true })
        setPreferencesDialogOpen(false)
      },
      acceptNecessaryOnly: () => {
        savePreferences({ analytics: false, thirdParty: false })
        setPreferencesDialogOpen(false)
      },
    }),
    [preferences, preferencesDialogOpen],
  )

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>
}

export function useCookieConsent(): CookieConsentContextValue {
  const context = useContext(CookieConsentContext)
  if (!context) {
    throw new Error("useCookieConsent must be used within a CookieConsentProvider")
  }
  return context
}
