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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useIsMobile } from "@/hooks"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useToast } from "@/hooks"
import Image from "next/image"
import { useState, useEffect } from "react"

export function Header() {
  const { user, signOut } = useAuth()
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const [isFirstTimeVisitor, setIsFirstTimeVisitor] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [signOutModalOpen, setSignOutModalOpen] = useState(false)

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

  const handleSignOut = async () => {
    setSignOutModalOpen(false)
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
            {/* Account action buttons */}
            <div className="flex items-center gap-1 md:gap-2">
              <Button
                variant="ghost"
                size="icon"
                asChild
                className={isDark ? "hover:bg-muted" : "hover:bg-gray-100"}
              >
                <Link href="/dashboard">
                  <User className="h-5 w-5" />
                  <span className="sr-only">Dashboard</span>
                </Link>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                asChild
                className={isDark ? "hover:bg-muted" : "hover:bg-gray-100"}
              >
                <Link href="/settings">
                  <Settings className="h-5 w-5" />
                  <span className="sr-only">Settings</span>
                </Link>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSignOutModalOpen(true)}
                className={isDark ? "hover:bg-muted" : "hover:bg-gray-100"}
              >
                <LogOut className="h-5 w-5" />
                <span className="sr-only">Sign Out</span>
              </Button>
            </div>

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
                </DropdownMenuContent>
              </DropdownMenu>
              <Dialog open={signOutModalOpen} onOpenChange={setSignOutModalOpen}>
                <DialogContent className={isDark ? "bg-card border-border text-card-foreground" : ""}>
                  <DialogHeader>
                    <DialogTitle>Sign out</DialogTitle>
                    <DialogDescription>Are you sure you want to end your session?</DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <DialogClose asChild>
                      <Button variant="ghost" size="default">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button variant="destructive" onClick={handleSignOut}>
                      Sign Out
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
