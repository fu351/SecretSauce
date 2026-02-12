import type React from "react"
import type { Metadata } from "next"
import { Inter, Playfair_Display } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import { AuthProvider } from "@/contexts/auth-context"
import { AnalyticsProvider } from "@/contexts/analytics-context"
import { ThemeProvider } from "@/contexts/theme-context"
import { QueryProvider } from "@/contexts/query-provider"
import { Header } from "@/components/layout/header"
import { Toaster } from "@/components/ui/toaster"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { ErrorBoundary } from "@/components/shared/error-boundary"
import { ThemeSync } from "@/components/providers/theme-sync"
import { TutorialProvider } from "@/contexts/tutorial-context"
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay"
// Removed TutorialBlocker import
import { FeedbackWidget } from "@/components/tutorial/feedback-widget"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" })

export const metadata: Metadata = {
  title: "Secret Sauce - Save $$$ on Groceries",
  description: "Discover recipes, plan meals, and save on groceries",
  generator: "v0.dev",
  icons: {
    icon: "/Favicon.png",
    shortcut: "/Favicon.png",
    apple: "/Favicon.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  console.log("--- LAYOUT STARTING ---")
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} font-sans antialiased`}>
        {/* Google Maps API - in body so layout chunk load isn't blocked */}
        {googleMapsKey && (
          <Script
            src={`https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&libraries=places`}
            strategy="lazyOnload"
          />
        )}
        <ErrorBoundary>
          <ThemeProvider>
            <QueryProvider>
              <AuthProvider>
                <AnalyticsProvider>
                  <TutorialProvider>
                    <ThemeSync />
                    <TutorialOverlay />
                    <FeedbackWidget position="bottom-left" />
                    <Header />
                    {children}
                    <Toaster />
                    <SpeedInsights />
                  </TutorialProvider>
                </AnalyticsProvider>
              </AuthProvider>
            </QueryProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}