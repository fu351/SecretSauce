export const COOKIE_CONSENT_COOKIE = "ss_cookie_consent"
export const COOKIE_CONSENT_VERSION = 1 as const

export type CookieConsentPreferences = {
  version: typeof COOKIE_CONSENT_VERSION
  analytics: boolean
  thirdParty: boolean
  updatedAt: string
}

type CookieConsentInput = {
  analytics: boolean
  thirdParty: boolean
}

function isBrowser(): boolean {
  return typeof document !== "undefined"
}

function readCookieValue(cookieSource: string, name: string): string | null {
  const prefix = `${name}=`
  for (const part of cookieSource.split(";")) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(prefix)) continue
    return trimmed.slice(prefix.length)
  }
  return null
}

function decodeCookieValue(raw: string): string | null {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function parseCookieConsentCookieValue(raw: string | null | undefined): CookieConsentPreferences | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(decodeCookieValue(raw) ?? raw) as Partial<CookieConsentPreferences>
    if (parsed?.version !== COOKIE_CONSENT_VERSION) return null
    if (typeof parsed.analytics !== "boolean") return null
    if (typeof parsed.thirdParty !== "boolean") return null

    return {
      version: COOKIE_CONSENT_VERSION,
      analytics: parsed.analytics,
      thirdParty: parsed.thirdParty,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function parseCookieConsentFromCookieHeader(
  cookieHeader: string | null | undefined,
): CookieConsentPreferences | null {
  if (!cookieHeader) return null
  return parseCookieConsentCookieValue(readCookieValue(cookieHeader, COOKIE_CONSENT_COOKIE))
}

export function readCookieConsentFromDocument(): CookieConsentPreferences | null {
  if (!isBrowser()) return null
  return parseCookieConsentCookieValue(readCookieValue(document.cookie, COOKIE_CONSENT_COOKIE))
}

export function serializeCookieConsent(preferences: CookieConsentPreferences): string {
  return encodeURIComponent(JSON.stringify(preferences))
}

export function writeCookieConsentToDocument(input: CookieConsentInput): CookieConsentPreferences {
  const preferences: CookieConsentPreferences = {
    version: COOKIE_CONSENT_VERSION,
    analytics: input.analytics,
    thirdParty: input.thirdParty,
    updatedAt: new Date().toISOString(),
  }

  if (!isBrowser()) return preferences

  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = [
    `${COOKIE_CONSENT_COOKIE}=${serializeCookieConsent(preferences)}`,
    "Path=/",
    "Max-Age=31536000",
    "SameSite=Lax",
    secure ? secure.slice(2) : "",
  ]
    .filter(Boolean)
    .join("; ")

  return preferences
}

export function clearCookieConsentFromDocument(): void {
  if (!isBrowser()) return

  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = [
    `${COOKIE_CONSENT_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
    secure ? secure.slice(2) : "",
  ]
    .filter(Boolean)
    .join("; ")
}

