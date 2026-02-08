import { NextRequest, NextResponse } from 'next/server'
import type { RecipeImportResponse } from '@/lib/types'

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL

/** Matches instagram.com post/reel/tv shortcode; allows www, m., or no subdomain */
const INSTAGRAM_URL_REGEX =
  /https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]{5,})(?:\/|\?|$)/i

const FETCH_TIMEOUT_MS = 90_000

function normalizeAndValidateUrl(input: unknown): { url: string } | { error: string } {
  if (input === null || input === undefined) {
    return { error: 'Instagram URL is required' }
  }
  const raw = typeof input === 'string' ? input : String(input)
  const trimmed = raw.trim()
  if (!trimmed) {
    return { error: 'Instagram URL is required' }
  }
  const firstLine = trimmed.split(/\s/)[0]
  const normalized = firstLine.replace(/#.*$/, '').replace(/\?.*$/, (q) => {
    const params = new URLSearchParams(q.slice(1))
    params.delete('utm_source')
    params.delete('utm_medium')
    params.delete('utm_campaign')
    const rest = params.toString()
    return rest ? `?${rest}` : ''
  })
  if (!/^https?:\/\//i.test(normalized)) {
    return { error: 'Please provide a full Instagram link (e.g. https://www.instagram.com/p/...)' }
  }
  const match = normalized.match(INSTAGRAM_URL_REGEX)
  if (!match) {
    return {
      error:
        'Please provide a valid Instagram post, reel, or video URL (e.g. https://www.instagram.com/p/ABC123/ or .../reel/ABC123/).',
    }
  }
  const shortcode = match[1]
  const url = `https://www.instagram.com/p/${shortcode}/`
  return { url }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body. Send JSON with a "url" field.' } as RecipeImportResponse,
        { status: 400 }
      )
    }

    const urlPayload = typeof body === 'object' && body !== null && 'url' in body ? (body as { url: unknown }).url : undefined
    const parsed = normalizeAndValidateUrl(urlPayload)
    if ('error' in parsed) {
      return NextResponse.json(
        { success: false, error: parsed.error } as RecipeImportResponse,
        { status: 400 }
      )
    }
    const { url } = parsed

    if (!PYTHON_SERVICE_URL) {
      return NextResponse.json(
        { success: false, error: 'Import service is not configured. Please try again later.' } as RecipeImportResponse,
        { status: 503 }
      )
    }

    const baseUrl = PYTHON_SERVICE_URL.replace(/\/$/, '')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(`${baseUrl}/recipe-import/instagram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      const msg =
        fetchError instanceof Error
          ? fetchError.name === 'AbortError'
            ? 'Import took too long. Try a different post or try again later.'
            : fetchError.message
          : 'Request failed.'
      const isNetwork =
        fetchError instanceof TypeError ||
        (fetchError instanceof Error && (fetchError.name === 'AbortError' || /fetch|network|ECONNREFUSED|ETIMEDOUT/i.test(fetchError.message)))
      return NextResponse.json(
        {
          success: false,
          error: isNetwork
            ? 'Could not reach the import service. Please check your connection and try again.'
            : msg,
        } as RecipeImportResponse,
        { status: 503 }
      )
    }
    clearTimeout(timeoutId)

    const contentType = response.headers.get('content-type') ?? ''
    const isJson = contentType.includes('application/json')
    const text = await response.text()
    let data: RecipeImportResponse

    try {
      data = isJson && text ? (JSON.parse(text) as RecipeImportResponse) : { success: false, error: text || 'No response from import service.' }
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: response.ok
            ? 'Invalid response from import service. Please try again.'
            : (text || 'Import service error. Please try again later.'),
        } as RecipeImportResponse,
        { status: response.ok ? 502 : response.status }
      )
    }

    if (!response.ok) {
      const message =
        data?.error ||
        (typeof (data as { detail?: string }).detail === 'string' ? (data as { detail: string }).detail : null) ||
        text ||
        'Import service unavailable. Please try again later.'
      return NextResponse.json(
        { success: false, error: message } as RecipeImportResponse,
        { status: response.status >= 500 ? 502 : response.status }
      )
    }

    if (!data.success && data.error) {
      return NextResponse.json(data as RecipeImportResponse, { status: 422 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Instagram import error:', error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to import recipe from Instagram. Please try again.',
      } as RecipeImportResponse,
      { status: 500 }
    )
  }
}
