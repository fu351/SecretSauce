"use client"

import { LandingPage } from "@/components/landing/landing-page"
import { useAuth } from "@/contexts/auth-context"
import { useEffect, useState } from "react"
import Image from "next/image"

export default function HomePage() {
  const { loading } = useAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Always show the long-scroll landing (SVG, vine, sections). Logged-in users
  // can use the header "Home" link to go to /home.
  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#010101]">
        <div className="animate-pulse relative size-[120px]">
          <Image
            src="/logo-dark.png"
            alt="Secret Sauce"
            width={120}
            height={120}
            className="object-contain opacity-90"
          />
        </div>
      </div>
    )
  }

  return <LandingPage />
}
