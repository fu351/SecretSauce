import { NextResponse } from "next/server"

export type ApiAvailabilityKey =
  | "grocery-search"
  | "maps"
  | "recipe-import-image"
  | "recipe-import-instagram"
  | "recipe-import-paragraph"
  | "recipe-import-url"

export type ApiAvailabilityTarget = {
  key: ApiAvailabilityKey
  label: string
  path: string
  description: string
}

export type ApiAvailabilityStatus = ApiAvailabilityTarget & {
  enabled: boolean
}

export const API_AVAILABILITY_TARGETS: ApiAvailabilityTarget[] = [
  {
    key: "grocery-search",
    label: "Grocery search",
    path: "/api/grocery-search",
    description: "Frontend grocery scraping and cached grocery search responses.",
  },
  {
    key: "maps",
    label: "Maps proxy",
    path: "/api/maps",
    description: "Server-side Google Maps, Places, and Routes proxy calls.",
  },
  {
    key: "recipe-import-image",
    label: "Image recipe import",
    path: "/api/recipe-import/image",
    description: "OCR text recipe parsing through the Python import pipeline.",
  },
  {
    key: "recipe-import-instagram",
    label: "Instagram recipe import",
    path: "/api/recipe-import/instagram",
    description: "Instagram URL imports through the Python import pipeline.",
  },
  {
    key: "recipe-import-paragraph",
    label: "Paragraph recipe import",
    path: "/api/recipe-import/paragraph",
    description: "LLM-backed parsing for pasted recipe text.",
  },
  {
    key: "recipe-import-url",
    label: "URL recipe import",
    path: "/api/recipe-import/url",
    description: "External recipe URL fetch and parsing through the Python import pipeline.",
  },
]

type ApiAvailabilityStore = Partial<Record<ApiAvailabilityKey, boolean>>

declare global {
  // eslint-disable-next-line no-var
  var __secretSauceApiAvailability: ApiAvailabilityStore | undefined
}

const targetByKey = new Map(API_AVAILABILITY_TARGETS.map((target) => [target.key, target]))

function togglesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_API_TOGGLES === "true"
}

function store(): ApiAvailabilityStore {
  if (!globalThis.__secretSauceApiAvailability) {
    globalThis.__secretSauceApiAvailability = {}
  }
  return globalThis.__secretSauceApiAvailability
}

export function isApiAvailabilityKey(value: unknown): value is ApiAvailabilityKey {
  return typeof value === "string" && targetByKey.has(value as ApiAvailabilityKey)
}

export function getApiAvailabilitySnapshot(): ApiAvailabilityStatus[] {
  const current = store()
  return API_AVAILABILITY_TARGETS.map((target) => ({
    ...target,
    enabled: togglesEnabled() ? current[target.key] !== false : true,
  }))
}

export function setApiAvailability(key: ApiAvailabilityKey, enabled: boolean): ApiAvailabilityStatus {
  const current = store()
  current[key] = enabled
  const target = targetByKey.get(key)
  if (!target) {
    throw new Error(`Unknown API availability key: ${key}`)
  }
  return { ...target, enabled }
}

export function resetApiAvailability(): ApiAvailabilityStatus[] {
  globalThis.__secretSauceApiAvailability = {}
  return getApiAvailabilitySnapshot()
}

export function isApiAvailable(key: ApiAvailabilityKey): boolean {
  if (!togglesEnabled()) return true
  return store()[key] !== false
}

export function apiUnavailableResponse(key: ApiAvailabilityKey) {
  const target = targetByKey.get(key)
  return NextResponse.json(
    {
      error: `${target?.label ?? "API"} is temporarily disabled by dev tools.`,
      code: "API_DISABLED",
      api: key,
    },
    {
      status: 503,
      headers: { "Retry-After": "60" },
    }
  )
}

export function guardApiAvailability(key: ApiAvailabilityKey) {
  return isApiAvailable(key) ? null : apiUnavailableResponse(key)
}
