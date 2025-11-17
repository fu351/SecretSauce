import type React from "react"
import type { Metadata } from "next"
import { Inter, Playfair_Display } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/auth-context"
import { ThemeProvider } from "@/contexts/theme-context"
import { Header } from "@/components/header"
import { Toaster } from "@/components/ui/toaster"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { ErrorBoundary } from "@/components/error-boundary"
import { ThemeSync } from "@/components/theme-sync"
import { TutorialProvider } from "@/contexts/tutorial-context"
import { TutorialOverlay } from "@/components/tutorial-overlay"
import { TutorialBlocker } from "@/components/tutorial-blocker"
import { FeedbackWidget } from "@/components/feedback-widget"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" })

export const metadata: Metadata = {
  title: "Secret Sauce - Meal Planning Made Easy",
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
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} font-sans antialiased`}>
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <TutorialProvider>
                <ThemeSync />
                <TutorialBlocker />
                <TutorialOverlay />
                <FeedbackWidget position="bottom-left" />
                <Header />
                {children}
                <Toaster />
                <SpeedInsights />
              </TutorialProvider>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
