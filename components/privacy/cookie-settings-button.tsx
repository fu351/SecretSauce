"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { useCookieConsent } from "@/contexts/cookie-consent-context"
import { cn } from "@/lib/utils"

type CookieSettingsButtonProps = {
  className?: string
  children?: React.ReactNode
}

export function CookieSettingsButton({
  className,
  children = "Cookie settings",
}: CookieSettingsButtonProps) {
  const { openPreferences } = useCookieConsent()

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "h-auto justify-start px-0 py-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground",
        className,
      )}
      onClick={openPreferences}
    >
      {children}
    </Button>
  )
}

