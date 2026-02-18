/**
 * Session Manager for Analytics
 *
 * Uses app auth state for analytics tracking.
 * - Authenticated users: Use user.id set by auth context
 * - Anonymous users: Use localStorage UUID as fallback
 */

const ANON_SESSION_KEY = "analytics_anon_session_v1"

interface SessionMetadata {
  sessionId: string
  userId?: string
  isAuthenticated: boolean
}

export class SessionManager {
  private static authenticatedUserId: string | null = null

  static setAuthenticatedUser(userId: string | null | undefined): void {
    this.authenticatedUserId = userId ?? null
  }

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
    if (this.authenticatedUserId) {
      return {
        sessionId: this.authenticatedUserId,
        userId: this.authenticatedUserId,
        isAuthenticated: true,
      }
    }

    return {
      sessionId: this.getOrCreateAnonSessionId(),
      userId: undefined,
      isAuthenticated: false,
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
    return Boolean(this.authenticatedUserId)
  }
}
