import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type DecodedJwt = {
  header: Record<string, unknown>
  payload: Record<string, unknown>
}

const decodeBase64UrlJson = (value: string): Record<string, unknown> => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4
  const padded = padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), "=")
  const json = Buffer.from(padded, "base64").toString("utf8")
  return JSON.parse(json) as Record<string, unknown>
}

const decodeJwt = (token: string): DecodedJwt | null => {
  try {
    const [headerSegment, payloadSegment] = token.split(".")
    if (!headerSegment || !payloadSegment) return null
    return {
      header: decodeBase64UrlJson(headerSegment),
      payload: decodeBase64UrlJson(payloadSegment),
    }
  } catch {
    return null
  }
}

type TokenCheckResult = {
  ok: boolean
  tokenPresent: boolean
  token: {
    header: Record<string, unknown> | null
    aud: unknown
    role: unknown
    sub: unknown
    iss: unknown
    exp: number | null
    expIso: string | null
    nowUnix: number
    nowIso: string
    secondsUntilExpiry: number | null
  } | null
  supabase: {
    sampleRows: number | null
    error: {
      code: string | null
      message: string | null
      details: string | null
      hint: string | null
    } | null
  }
  hint: string | null
}

const runSupabaseCheck = async (token: string | null): Promise<TokenCheckResult> => {
  const nowUnix = Math.floor(Date.now() / 1000)
  const nowIso = new Date(nowUnix * 1000).toISOString()

  if (!token) {
    return {
      ok: false,
      tokenPresent: false,
      token: null,
      supabase: { sampleRows: null, error: null },
      hint: "No token minted for this mode.",
    }
  }

  const decoded = decodeJwt(token)
  const payload = decoded?.payload ?? {}
  const exp = typeof payload.exp === "number" ? payload.exp : null
  const secondsUntilExpiry = exp ? exp - nowUnix : null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return {
      ok: false,
      tokenPresent: true,
      token: {
        header: decoded?.header ?? null,
        aud: payload.aud ?? null,
        role: payload.role ?? null,
        sub: payload.sub ?? null,
        iss: payload.iss ?? null,
        exp,
        expIso: exp ? new Date(exp * 1000).toISOString() : null,
        nowUnix,
        nowIso,
        secondsUntilExpiry,
      },
      supabase: {
        sampleRows: null,
        error: {
          code: null,
          message: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
          details: null,
          hint: null,
        },
      },
      hint: null,
    }
  }

  const supabase = createClient(url, anon, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    accessToken: async () => token,
    global: {
      fetch: fetch.bind(globalThis),
    },
  })

  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .is("deleted_at", null)
    .limit(1)

  return {
    ok: !error,
    tokenPresent: true,
    token: {
      header: decoded?.header ?? null,
      aud: payload.aud ?? null,
      role: payload.role ?? null,
      sub: payload.sub ?? null,
      iss: payload.iss ?? null,
      exp,
      expIso: exp ? new Date(exp * 1000).toISOString() : null,
      nowUnix,
      nowIso,
      secondsUntilExpiry,
    },
    supabase: {
      sampleRows: Array.isArray(data) ? data.length : null,
      error: error
        ? {
            code: error.code ?? null,
            message: error.message ?? null,
            details: error.details ?? null,
            hint: error.hint ?? null,
          }
        : null,
    },
    hint:
      error?.code === "PGRST301" && error.message?.includes("JWSInvalidSignature")
        ? "Signature mismatch"
        : error?.code === "PGRST301" && error.message?.includes("JWT expired")
          ? "Token expired"
          : secondsUntilExpiry !== null && secondsUntilExpiry <= 0
            ? "Token appears expired by timestamp"
            : null,
  }
}

export async function GET() {
  try {
    const authState = await auth()
    if (!authState.userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated with Clerk." },
        { status: 401 }
      )
    }

    const defaultToken = await authState.getToken()
    const templateToken = await authState.getToken({ template: "supabase" })
    const [defaultCheck, templateCheck] = await Promise.all([
      runSupabaseCheck(defaultToken),
      runSupabaseCheck(templateToken),
    ])

    const recommendation =
      defaultCheck.ok && !templateCheck.ok
        ? "Use native Clerk->Supabase integration (Issuer/JWKS) and switch app token retrieval to getToken() without template."
        : !defaultCheck.ok && templateCheck.ok
          ? "Template mode works. Keep getToken({ template: 'supabase' }) and fix only template-related setup."
          : defaultCheck.ok && templateCheck.ok
            ? "Both modes work. Prefer native integration for long-term setup."
            : "Neither mode works. Check project mismatch and signing configuration in Clerk/Supabase."

    return NextResponse.json({
      ok: defaultCheck.ok || templateCheck.ok,
      clerkUserId: authState.userId,
      checks: {
        defaultToken: defaultCheck,
        supabaseTemplateToken: templateCheck,
      },
      recommendation,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown verification error",
      },
      { status: 500 }
    )
  }
}
