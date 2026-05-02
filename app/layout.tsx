import type React from "react"
import type { Metadata, Viewport } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { cookies } from "next/headers"
import { Inter, Playfair_Display } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/auth-context"
import { PostHogProvider } from "@/contexts/posthog-provider"
import { ThemeProvider } from "@/contexts/theme-context"
import { QueryProvider } from "@/contexts/query-provider"
import { Header } from "@/components/layout/header"
import { AppFooter } from "@/components/layout/app-footer"
import { Toaster } from "@/components/ui/toaster"
import { ErrorBoundary } from "@/components/shared/error-boundary"
import { ThemeSync } from "@/components/providers/theme-sync"
import { OnboardingRedirect } from "@/components/providers/onboarding-redirect"
import { PretextBootstrap } from "@/components/providers/pretext-bootstrap"
import { TutorialProvider } from "@/contexts/tutorial-context"
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay"
// Removed TutorialBlocker import
import { FeedbackWidget } from "@/components/tutorial/feedback-widget"
import { CookieConsentBanner } from "@/components/privacy/cookie-consent-banner"
import { CookieConsentProvider } from "@/contexts/cookie-consent-context"
import { SpeedInsightsGate } from "@/components/privacy/speed-insights-gate"
import { parseCookieConsentCookieValue, COOKIE_CONSENT_COOKIE } from "@/lib/privacy/cookie-consent"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" })

export const metadata: Metadata = {
  title: "Secret Sauce - Save $$$ on Groceries",
  description: "Discover recipes, plan meals, and save on groceries",
  generator: "v0.dev",
  manifest: "/manifest.webmanifest",
  applicationName: "Secret Sauce",
  appleWebApp: {
    capable: true,
    title: "Secret Sauce",
    // Prefer non-translucent iOS status bar so content doesn't sit under the Dynamic Island.
    statusBarStyle: "black",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [
      { url: "/icon", sizes: "192x192", type: "image/png" },
      { url: "/icon", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/Favicon.png",
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF4E5" },
    { media: "(prefers-color-scheme: dark)", color: "#181813" },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const consentCookie = cookies().get(COOKIE_CONSENT_COOKIE)?.value ?? null
  const initialConsent = parseCookieConsentCookieValue(consentCookie)

  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.variable} ${playfair.variable} font-sans antialiased`}>
          <ErrorBoundary>
            <ThemeProvider>
              <QueryProvider>
                <AuthProvider>
                  <CookieConsentProvider initialConsent={initialConsent}>
                    <PostHogProvider>
                      <TutorialProvider>
                        <ThemeSync />
                        <OnboardingRedirect />
                        <PretextBootstrap />
                        <TutorialOverlay />
                        <FeedbackWidget position="bottom-left" />
                        <Header />
                        {children}
                        <AppFooter />
                        <Toaster />
                        <SpeedInsightsGate />
                        <CookieConsentBanner />
                      </TutorialProvider>
                    </PostHogProvider>
                  </CookieConsentProvider>
                </AuthProvider>
              </QueryProvider>
            </ThemeProvider>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  )
}
