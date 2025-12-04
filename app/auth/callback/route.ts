import { createClient } from '@supabase/supabase-js'
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
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase environment variables')
      }

      // Create a Supabase client for this request
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          flowType: 'pkce',
        },
      })

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

      // Check if user has completed onboarding by checking for primary_goal
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('primary_goal')
        .eq('id', data.user.id)
        .maybeSingle()

      let redirectPath = next

      // If profile doesn't exist or has no primary_goal, redirect to onboarding
      if (profileError || !profile || !profile.primary_goal) {
        console.log('[Auth Callback] No profile or primary_goal found, redirecting to onboarding')
        redirectPath = '/onboarding'
      } else {
        console.log('[Auth Callback] Profile exists with primary_goal, redirecting to:', next)
      }

      // Create response with redirect
      const redirectUrl = new URL(redirectPath, requestUrl.origin)
      const response = NextResponse.redirect(redirectUrl)

      // Set session cookies
      if (data.session) {
        response.cookies.set({
          name: 'sb-access-token',
          value: data.session.access_token,
          path: '/',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 7, // 7 days
        })

        response.cookies.set({
          name: 'sb-refresh-token',
          value: data.session.refresh_token,
          path: '/',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 7, // 7 days
        })
      }

      console.log('[Auth Callback] Redirecting to:', redirectUrl.toString())

      return response
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
