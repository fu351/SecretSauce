"use client"

import { useEffect } from "react"
import { useTheme } from "@/contexts/theme-context"

const ICONS = {
  light: "/favicon-light.png",
  dark: "/favicon-dark.png",
} as const

const LINK_TYPES: Array<{ rel: string; type?: string }> = [
  { rel: "icon", type: "image/png" },
  { rel: "shortcut icon", type: "image/png" },
  { rel: "apple-touch-icon" },
]

export function FaviconUpdater() {
  const { theme } = useTheme()

  useEffect(() => {
    if (typeof document === "undefined") return

    const current = theme === "dark" ? ICONS.dark : ICONS.light

    LINK_TYPES.forEach(({ rel, type }) => {
      const selector = `link[data-dynamic-favicon='${rel}'][rel='${rel}']`
      let link = document.querySelector<HTMLLinkElement>(selector)

      if (!link) {
        link = document.createElement("link")
        link.rel = rel
        link.setAttribute("data-dynamic-favicon", rel)
        if (type) {
          link.type = type
        }
        document.head.appendChild(link)
      }

      link.href = current
    })
  }, [theme])

  return null
}
