/**
 * Session Manager for Analytics
 *
 * Wraps Supabase's existing auth session management for analytics tracking.
 * - Authenticated users: Use user.id from Supabase auth
 * - Anonymous users: Use localStorage UUID as fallback
 */

import { supabase } from "@/lib/database/supabase"

const ANON_SESSION_KEY = "analytics_anon_session_v1"

interface SessionMetadata {
  sessionId: string
  userId?: string
  isAuthenticated: boolean
}

export class SessionManager {
  /**
   * Get session ID for tracking
   * - Returns user.id for authenticated users
   * - Returns anonymous session ID for unauthenticated users
   */
  static async getSessionId(): Promise<string> {
    const metadata = await this.getSessionMetadata()
    return metadata.sessionId
  }

  /**
   * Get comprehensive session metadata for analytics
   */
  static async getSessionMetadata(): Promise<SessionMetadata> {
    try {
      // Get current Supabase session
      const { data: { session, user }, error } = await supabase.auth.getSession()

      if (error) {
        console.error("[Analytics] Error getting session:", error)
      }

      // Authenticated user: use user.id
      if (user) {
        return {
          sessionId: user.id,
          userId: user.id,
          isAuthenticated: true,
        }
      }

      // Anonymous user: get or create session ID from localStorage
      return {
        sessionId: this.getOrCreateAnonSessionId(),
        userId: undefined,
        isAuthenticated: false,
      }
    } catch (err) {
      console.error("[Analytics] Exception getting session metadata:", err)

      // Fallback to anonymous session
      return {
        sessionId: this.getOrCreateAnonSessionId(),
        userId: undefined,
        isAuthenticated: false,
      }
    }
  }

  /**
   * Get or create anonymous session ID from localStorage
   */
  private static getOrCreateAnonSessionId(): string {
    if (typeof window === "undefined") {
      // SSR fallback
      return "ssr-temp-session"
    }

    try {
      let sessionId = localStorage.getItem(ANON_SESSION_KEY)

      if (!sessionId) {
        // Generate new UUID v4
        sessionId = crypto.randomUUID()
        localStorage.setItem(ANON_SESSION_KEY, sessionId)
      }

      return sessionId
    } catch (err) {
      console.error("[Analytics] Error accessing localStorage:", err)
      // Fallback to temporary session ID
      return `temp-${Date.now()}`
    }
  }

  /**
   * Clear anonymous session data
   * Called when user logs in to transition from anonymous to authenticated tracking
   */
  static clearAnonymousSession(): void {
    if (typeof window === "undefined") return

    try {
      localStorage.removeItem(ANON_SESSION_KEY)
    } catch (err) {
      console.error("[Analytics] Error clearing anonymous session:", err)
    }
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      return !!user
    } catch {
      return false
    }
  }
}
