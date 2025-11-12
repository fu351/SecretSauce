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
import { useIsMobile } from "@/hooks/use-mobile"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"

export function Header() {
  const { user, profile, signOut } = useAuth()
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()

  const isDark = theme === "dark"

  // Landing page has its own header for non-authenticated users
  if ((pathname.startsWith("/auth") || pathname === "/onboarding") && !user) {
    return null
  }

  if (pathname === "/" && !user) {
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
    <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b bg-background border-border">
      <div className="flex items-center">
        <Link href="/">
          <Image
            src={theme === "dark" ? "/logo-dark.png" : "/logo-warm.png"}
            alt="Secret Sauce"
            width={isMobile ? 32 : 40}
            height={isMobile ? 32 : 40}
            className="cursor-pointer"
          />
        </Link>
      </div>

      <nav className="hidden md:flex items-center gap-4 lg:gap-6">
        <Link
          href="/recipes"
          className={`hover:opacity-80 ${
            pathname === "/recipes" ? "font-semibold" : isDark ? "text-[#e8dcc4]/70" : "text-gray-600"
          }`}
        >
          Recipes
        </Link>
        <Link
          href="/meal-planner"
          className={`hover:opacity-80 ${
            pathname === "/meal-planner" ? "font-semibold" : isDark ? "text-[#e8dcc4]/70" : "text-gray-600"
          }`}
        >
          Meal Planner
        </Link>
        <Link
          href="/shopping"
          className={`hover:opacity-80 ${
            pathname === "/shopping" ? "font-semibold" : isDark ? "text-[#e8dcc4]/70" : "text-gray-600"
          }`}
        >
          Shopping
        </Link>
      </nav>

      <div className="flex items-center gap-2 md:gap-3">
        {user ? (
          <>
            {/* Quick Action Icons - Desktop only */}
            {!isMobile && (
              <>
                <Button variant="ghost" size="icon" asChild className={isDark ? "hover:bg-[#e8dcc4]/10" : ""}>
                  <Link href="/favorites">
                    <Heart className="h-5 w-5" />
                  </Link>
                </Button>

                {!pathname.includes("/shopping") && (
                  <Button variant="ghost" size="icon" asChild className={isDark ? "hover:bg-[#e8dcc4]/10" : ""}>
                    <Link href="/shopping">
                      <ShoppingCart className="h-5 w-5" />
                    </Link>
                  </Button>
                )}
              </>
            )}

            {/* Highlighted Upload Button */}
            {showUploadButton && !isMobile && (
              <Link href="/upload-recipe">
                <button
                  className={`relative inline-flex items-center justify-center px-4 md:px-6 py-2 md:py-2.5 text-xs md:text-sm font-semibold transition-all duration-200 rounded-lg shadow-lg hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-95 ${
                    isDark
                      ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] focus:ring-[#e8dcc4]"
                      : "bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 focus:ring-orange-500"
                  }`}
                >
                  <Plus className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                  Add Recipe
                </button>
              </Link>
            )}

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={isDark ? "hover:bg-[#e8dcc4]/10" : ""}>
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
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
                <DropdownMenuSeparator className={isDark ? "bg-[#e8dcc4]/20" : ""} />
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
                <Button variant="ghost" size="icon" className={isDark ? "hover:bg-[#e8dcc4]/10" : ""}>
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={isDark ? "bg-[#1a1a1a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""}
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
                    <DropdownMenuSeparator className={isDark ? "bg-[#e8dcc4]/20" : ""} />
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
              className={isDark ? "text-[#e8dcc4] hover:bg-[#e8dcc4]/10" : ""}
            >
              <Link href="/auth/signin">Sign In</Link>
            </Button>
            <Button
              size={isMobile ? "sm" : "default"}
              asChild
              className={
                isDark
                  ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
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
