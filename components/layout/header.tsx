"use client"

import { LogOut, Menu, Settings, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SignedIn,
  SignedOut,
  UserButton
} from "@clerk/nextjs"
import { useTheme } from "@/contexts/theme-context"
import { useIsMobile } from "@/hooks"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useToast } from "@/hooks"
import Image from "next/image"
import { useState, useEffect } from "react"

export function Header() {
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const [isFirstTimeVisitor, setIsFirstTimeVisitor] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Check if user is visiting landing page for the first time
  useEffect(() => {
    if (pathname === "/") {
      const hasVisited = document.cookie.includes("visited=true")
      setIsFirstTimeVisitor(!hasVisited)
    }
  }, [pathname])

  // Use theme directly from context - it handles defaults properly
  const isDark = theme === "dark"

  // Prevent flash during hydration
  if (!mounted) {
    return null
  }
  
  return (
    <header
      className={`flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b sticky top-0 z-40 ${
        isDark ? "bg-background/95 backdrop-blur border-border" : "bg-background/95 backdrop-blur border-border"
      }`}
    >
      <div className="flex items-center">
        <Link href="/">
          <Image
            src={isDark ? "/logo-dark.png" : "/logo-warm.png"}
            alt="Secret Sauce"
            width={isMobile ? 32 : 40}
            height={isMobile ? 32 : 40}
            className="cursor-pointer"
          />
        </Link>
      </div>

      <nav className="hidden md:flex items-center gap-6">
        <Link
          href="/recipes"
          className={`hover:opacity-80 transition-opacity ${
            pathname === "/recipes" ? "font-semibold" : isDark ? "text-muted-foreground" : "text-gray-700"
          }`}
        >
          Recipes
        </Link>
        <Link
          href="/meal-planner"
          className={`hover:opacity-80 transition-opacity ${
            pathname === "/meal-planner" ? "font-semibold" : isDark ? "text-muted-foreground" : "text-gray-700"
          }`}
        >
          Meal Planner
        </Link>
        <Link
          href="/shopping"
          className={`hover:opacity-80 transition-opacity ${
            pathname === "/shopping" ? "font-semibold" : isDark ? "text-muted-foreground" : "text-gray-700"
          }`}
        >
          Shopping
        </Link>
      </nav>

      <div className="flex items-center gap-2 md:gap-3 justify-end">
        <SignedIn>
            <Button
              variant="ghost"
              size={isMobile ? "sm" : "default"}
              asChild
              className={isDark ? "text-foreground hover:bg-muted" : "hover:bg-gray-100"}
            >
              <Link href="/checkout">Subscribe</Link>
            </Button>
            <UserButton afterSignOutUrl="/" />
        </SignedIn>
        <SignedOut>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size={isMobile ? "sm" : "default"}
              asChild
              className={isDark ? "text-foreground hover:bg-muted" : "hover:bg-gray-100"}
            >
              <Link href="/auth/signin">Sign In</Link>
            </Button>
            <Button
              size={isMobile ? "sm" : "default"}
              asChild
              className={
                isDark
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700"
              }
            >
              <Link href="/auth/signup">{isMobile ? "Sign Up" : "Get Started"}</Link>
            </Button>
          </div>
        </SignedOut>
        <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={isDark ? "hover:bg-muted" : "hover:bg-gray-100"}>
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={isDark ? "bg-card border-border text-card-foreground" : ""}
              >
                <DropdownMenuItem asChild>
                  <Link href="/recipes">Recipes</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/meal-planner">Meal Planner</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/shopping">Shopping</Link>
                </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
