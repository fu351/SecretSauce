"use client"

import { useEffect, useMemo, useState } from "react"
import { ShieldCheck, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useCookieConsent } from "@/contexts/cookie-consent-context"

export function CookieConsentBanner() {
  const {
    preferences,
    preferencesDialogOpen,
    openPreferences,
    closePreferences,
    savePreferences,
    acceptAll,
    acceptNecessaryOnly,
  } = useCookieConsent()

  const [analytics, setAnalytics] = useState(false)
  const [thirdParty, setThirdParty] = useState(false)

  const bannerVisible = preferences === null

  useEffect(() => {
    if (!preferencesDialogOpen) return
    setAnalytics(preferences?.analytics ?? false)
    setThirdParty(preferences?.thirdParty ?? false)
  }, [preferences?.analytics, preferences?.thirdParty, preferencesDialogOpen])

  const summary = useMemo(() => {
    if (preferences === null) {
      return "Necessary cookies keep your sign-in and security working. Analytics and third-party map cookies stay off until you choose."
    }

    if (!preferences.analytics && !preferences.thirdParty) {
      return "You are currently using necessary-only cookies."
    }

    if (preferences.analytics && preferences.thirdParty) {
      return "Analytics and third-party cookies are enabled."
    }

    return "Your cookie preferences are saved."
  }, [preferences])

  return (
    <>
      {bannerVisible ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/98 px-4 py-4 shadow-[0_-12px_48px_rgba(0,0,0,0.12)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Cookie preferences
              </div>
              <p className="text-sm text-muted-foreground">{summary}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={acceptNecessaryOnly}>
                Necessary only
              </Button>
              <Button type="button" onClick={acceptAll}>
                Accept all
              </Button>
              <Button type="button" variant="ghost" className="gap-2" onClick={openPreferences}>
                <SlidersHorizontal className="h-4 w-4" />
                Customize
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={preferencesDialogOpen} onOpenChange={(open) => (open ? openPreferences() : closePreferences())}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Cookie settings</DialogTitle>
            <DialogDescription>
              Control analytics and third-party services. Necessary cookies stay enabled for sign-in and
              security.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">Analytics cookies</Label>
                <p className="text-sm text-muted-foreground">
                  Enables PostHog page tracking and related product analytics.
                </p>
              </div>
              <Switch checked={analytics} onCheckedChange={setAnalytics} />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">Third-party cookies</Label>
                <p className="text-sm text-muted-foreground">
                  Enables third-party map, routing, and address lookup features.
                </p>
              </div>
              <Switch checked={thirdParty} onCheckedChange={setThirdParty} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={acceptNecessaryOnly}>
              Necessary only
            </Button>
            <Button type="button" variant="outline" onClick={acceptAll}>
              Accept all
            </Button>
            <Button
              type="button"
              onClick={() => savePreferences({ analytics, thirdParty })}
            >
              Save preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
