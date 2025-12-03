import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Auth Callback Route
 *
 * Handles Supabase authentication callbacks for:
 * - Email confirmation
 * - Magic link sign in
 * - OAuth redirects
 *
 * This route exchanges the auth code for a session and redirects to the appropriate page.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/welcome'

  console.log('[Auth Callback] Processing callback', {
    hasCode: !!code,
    next,
    origin: requestUrl.origin,
  })

  if (code) {
    try {
      const cookieStore = cookies()
      const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

      // Exchange the code for a session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        console.error('[Auth Callback] Error exchanging code:', error)

        // Redirect to sign in page with error
        return NextResponse.redirect(
          new URL(
            `/auth/signin?error=${encodeURIComponent('Unable to verify email. Please try again.')}`,
            requestUrl.origin
          )
        )
      }

      console.log('[Auth Callback] Session created successfully', {
        userId: data.user?.id,
        email: data.user?.email,
      })

      // Successful authentication - redirect to the target page
      const redirectUrl = new URL(next, requestUrl.origin)

      console.log('[Auth Callback] Redirecting to:', redirectUrl.toString())

      return NextResponse.redirect(redirectUrl)
    } catch (error) {
      console.error('[Auth Callback] Exception:', error)

      return NextResponse.redirect(
        new URL(
          `/auth/signin?error=${encodeURIComponent('Authentication failed. Please try again.')}`,
          requestUrl.origin
        )
      )
    }
  }

  // No code provided - redirect to sign in
  console.warn('[Auth Callback] No code provided, redirecting to sign in')

  return NextResponse.redirect(
    new URL('/auth/signin?error=Missing authentication code', requestUrl.origin)
  )
}
