"use client"

import { Heart, ShoppingCart, User, LogOut, Settings, Menu, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useIsMobile } from "@/hooks"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useToast } from "@/hooks"
import Image from "next/image"
import { useState, useEffect } from "react"

export function Header() {
  const { user, profile, signOut } = useAuth()
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

  // Hide header for: first-time landing page visitors, auth and onboarding routes when not logged in
  if (!user && (isFirstTimeVisitor || pathname.startsWith("/auth") || pathname === "/onboarding")) {
    return null
  }

  // Don't show upload button on upload page
  const showUploadButton = user && !pathname.includes("/upload-recipe")

  const handleSignOut = async () => {
    console.log("[v0] Sign out button clicked")
    try {
      console.log("[v0] Calling signOut...")
      await signOut()
      console.log("[v0] Sign out successful, redirecting...")

      toast({
        title: "Signed out successfully",
        description: "You have been signed out of your account.",
      })

      router.push("/")
      router.refresh()
    } catch (error) {
      console.error("[v0] Sign out error:", error)
      toast({
        title: "Error signing out",
        description: "Please try again or refresh the page.",
        variant: "destructive",
      })
    }
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

      <div className="flex items-center gap-2 md:gap-3 min-w-[200px] justify-end">
        {user ? (
          <>
            {/* Quick Action Icons - Desktop only */}
            {!isMobile && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  className={isDark ? "hover:bg-muted" : "hover:bg-gray-100"}
                >
                  <Link href="/favorites">
                    <Heart className="h-5 w-5 text-red-500" />
                  </Link>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  className={isDark ? "hover:bg-muted" : "hover:bg-gray-100"}
                >
                  <Link href="/shopping">
                    <ShoppingCart className="h-5 w-5 text-green-500" />
                  </Link>
                </Button>
              </>
            )}

            {/* Highlighted Upload Button */}
            {showUploadButton && !isMobile && (
              <Link href="/upload-recipe">
                <button
                  className={`relative inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold transition-all duration-200 rounded-lg shadow-md hover:shadow-lg hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-95 ${
                    isDark
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-ring"
                      : "bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 focus:ring-orange-500"
                  }`}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Recipe
                </button>
              </Link>
            )}

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={isDark ? "hover:bg-muted" : "hover:bg-gray-100"}>
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={isDark ? "bg-card border-border text-card-foreground" : ""}
              >
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <User className="h-4 w-4 mr-2" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="md:hidden">
                  <Link href="/favorites">
                    <Heart className="h-4 w-4 mr-2" />
                    Favorites
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className={isDark ? "bg-border" : ""} />
                <DropdownMenuItem asChild>
                  <button onClick={handleSignOut} className="w-full flex items-center cursor-pointer">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </button>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="md:hidden">
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
                {!pathname.includes("/upload-recipe") && (
                  <>
                    <DropdownMenuSeparator className={isDark ? "bg-border" : ""} />
                    <DropdownMenuItem asChild>
                      <Link href="/upload-recipe">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Recipe
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
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
        )}
      </div>
    </header>
  )
}
