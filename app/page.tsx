"use client"

import { LandingPage } from "@/components/landing/landing-page"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Image from "next/image"

export default function HomePage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace("/home")
      } else {
        setChecked(true)
      }
    }
  }, [user, loading, router])

  if (loading || !checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse relative size-[120px]">
          <Image
            src="/logo-warm.png"
            alt="Secret Sauce"
            width={120}
            height={120}
            className="dark:hidden block object-contain"
          />
          <Image
            src="/logo-dark.png"
            alt="Secret Sauce"
            width={120}
            height={120}
            className="hidden dark:block object-contain"
          />
        </div>
      </div>
    )
  }

  return <LandingPage />
}
