"use client"

import { useEffect } from "react"
import { primePretext } from "@/lib/pretext"

export function PretextBootstrap() {
  useEffect(() => {
    const idleCallback = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (idleCallback) {
      idleCallback(() => {
        void primePretext()
      })
      return
    }

    const timer = window.setTimeout(() => {
      void primePretext()
    }, 250)

    return () => window.clearTimeout(timer)
  }, [])

  return null
}
