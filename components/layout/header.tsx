"use client"

import { BookOpen, Calendar, Home, LogOut, Plus, Settings, ShoppingCart, Trophy, User, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { useIsAdmin } from "@/hooks/use-admin"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useToast } from "@/hooks"
import Image from "next/image"
import { useState, useEffect } from "react"

export function Header() {
  const { user, signOut } = useAuth()
  const { theme } = useTheme()
  const { isAdmin } = useIsAdmin()
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const [mounted, setMounted] = useState(false)
  const [signOutModalOpen, setSignOutModalOpen] = useState(false)
  const [mobileLogoMenuOpen, setMobileLogoMenuOpen] = useState(false)

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Use theme directly from context - it handles defaults properly
  const isDark = theme === "dark"

  // Prevent flash during hydration
  if (!mounted) {
    return null
  }

  // Hide header on landing page (for everyone), and on auth/onboarding for non-logged-in users
  if (pathname === "/" || (!user && (pathname.startsWith("/auth") || pathname === "/onboarding"))) {
    return null
  }

  // Page-specific title and subtext for navbar (lg+ shows both, below lg shows title only)
  const pageTitles: Record<string, { title: string; subtext: string }> = {
    "/home": { title: "Home", subtext: "Welcome back to Secret Sauce" },
    "/recipes": { title: "Recipes", subtext: "Discover and share amazing recipes" },
    "/meal-planner": { title: "Meal Planner", subtext: "Plan your weekly meals and track nutrition" },
    "/store": { title: "Shopping", subtext: "Manage your grocery list" },
    "/dashboard": { title: "Dashboard", subtext: "Your cooking overview" },
    "/settings": { title: "Settings", subtext: "Manage your account preferences" },
    "/pantry": { title: "My Pantry", subtext: "Keep track of your ingredients and reduce food waste" },
    "/upload-recipe": { title: "Add Recipe", subtext: "Create a new recipe manually or import from a URL" },
  }

  const pageInfo = pathname === "/" ? null : pageTitles[pathname] ?? 
    (pathname.startsWith("/recipes/") ? pageTitles["/recipes"] :
     pathname.startsWith("/edit-recipe/") ? { title: "Edit Recipe", subtext: "Update your recipe details" } :
     pathname.startsWith("/upload-recipe") ? pageTitles["/upload-recipe"] : null)

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

      router.push("/home")
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

  const navIconClass = (path: string) =>
    `p-2 rounded-md transition-opacity hover:opacity-80 ${
      pathname === path ? "opacity-100" : isDark ? "text-muted-foreground" : "text-gray-700"
    }`

  const closeMobileLogoMenu = () => setMobileLogoMenuOpen(false)

  return (
    <>
      <header
        className={`hidden md:flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b md:sticky md:top-0 z-40 ${
          isDark ? "bg-background/95 backdrop-blur border-border" : "bg-background/95 backdrop-blur border-border"
        }`}
      >
        {/* Left: logo+title on desktop */}
        <div className="flex min-w-0 flex-1 items-center justify-start gap-2 md:flex-initial md:flex-none md:gap-4 lg:gap-6">
        {/* Desktop: logo + title */}
        <Link href="/home" className="hidden md:block flex-shrink-0">
          <Image
            src={isDark ? "/logo-dark.png" : "/logo-warm.png"}
            alt="Secret Sauce"
            width={60}
            height={60}
            className="cursor-pointer"
          />
        </Link>
        {pageInfo && (
          <div className="hidden md:flex flex-col w-[380px] min-w-[380px] shrink-0">
            <span className={`text-lg font-serif font-light ${pathname === "/" ? "" : isDark ? "text-foreground" : "text-gray-900"}`}>
              {pageInfo.title}
            </span>
            <span className="hidden lg:block text-sm text-muted-foreground mt-0.5 leading-tight">
              {pageInfo.subtext}
            </span>
          </div>
        )}
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
          href="/store"
          className={`hover:opacity-80 transition-opacity ${
            pathname === "/store" ? "font-semibold" : isDark ? "text-muted-foreground" : "text-gray-700"
          }`}
        >
          Shopping
        </Link>
        <Button
          size="sm"
          asChild
          className={
            isDark
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700"
          }
        >
          <Link href="/upload-recipe" className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Add Recipe
          </Link>
        </Button>
        </nav>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:flex-initial md:gap-3 md:min-w-[200px]">
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

              {/* Admin Dev Tools Link */}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  className={`${isDark ? "hover:bg-muted" : "hover:bg-gray-100"} ${
                    pathname.startsWith("/dev")
                      ? "bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400"
                      : ""
                  }`}
                  title="Admin Dev Tools"
                >
                  <Link href="/dev">
                    <Wrench className="h-5 w-5" />
                    <span className="sr-only">Dev Tools</span>
                  </Link>
                </Button>
              )}

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
                size="default"
                asChild
                className={isDark ? "text-foreground hover:bg-muted" : "hover:bg-gray-100"}
              >
                <Link href="/auth/signin">Sign In</Link>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile bottom navbar */}
      <nav
        className={`md:hidden fixed bottom-0 left-0 right-0 z-[60] border-t px-2 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] overflow-visible ${
          isDark ? "bg-background/95 backdrop-blur border-border" : "bg-background/95 backdrop-blur border-border"
        }`}
      >
        <div className="relative mx-auto flex max-w-md items-center justify-between px-1">
          <Button
            variant="ghost"
            size="icon"
            className={`${navIconClass("/home")} ${mobileLogoMenuOpen ? "pointer-events-none" : ""}`}
            asChild
          >
            <Link href="/home" aria-label="Home">
              <Home className="h-5 w-5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`${navIconClass("/recipes")} ${mobileLogoMenuOpen ? "pointer-events-none" : ""}`}
            asChild
          >
            <Link href="/recipes" aria-label="Recipes">
              <BookOpen className="h-5 w-5" />
            </Link>
          </Button>
          <div className="absolute left-1/2 -translate-x-1/2 -top-11 h-24 w-24 z-[100]">
            {mobileLogoMenuOpen && (
              <div className="absolute inset-0">
                {user ? (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-150deg) translateX(74px) rotate(150deg)" }}
                      asChild
                    >
                      <Link href="/settings" aria-label="Settings" onClick={closeMobileLogoMenu}>
                        <Settings className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-110deg) translateX(74px) rotate(110deg)" }}
                      asChild
                    >
                      <Link href="/challenges/join" aria-label="Challenges" onClick={closeMobileLogoMenu}>
                        <Trophy className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-70deg) translateX(74px) rotate(70deg)" }}
                      asChild
                    >
                      <Link href="/upload-recipe" aria-label="Add Recipe" onClick={closeMobileLogoMenu}>
                        <Plus className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-30deg) translateX(74px) rotate(30deg)" }}
                      asChild
                    >
                      <Link
                        href="/pantry"
                        aria-label="Pantry"
                        onClick={() => closeMobileLogoMenu()}
                      >
                        <Wrench className="h-4 w-4" />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-140deg) translateX(76px) rotate(140deg)" }}
                      asChild
                    >
                      <Link href="/auth/signin" onClick={closeMobileLogoMenu}>Sign In</Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-90deg) translateX(76px) rotate(90deg)" }}
                      asChild
                    >
                      <Link href="/challenges/join" aria-label="Challenges" onClick={closeMobileLogoMenu}>
                        <Trophy className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-40deg) translateX(76px) rotate(40deg)" }}
                      asChild
                    >
                      <Link href="/settings" aria-label="Settings" onClick={closeMobileLogoMenu}>
                        <Settings className="h-4 w-4" />
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              aria-label="Toggle quick menu"
              onClick={() => setMobileLogoMenuOpen((prev) => !prev)}
              className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-full border shadow-lg transition-transform ${
                mobileLogoMenuOpen ? "scale-105" : "scale-100"
              } ${isDark ? "bg-card border-border" : "bg-white border-gray-200"}`}
            >
              <Image
                src={isDark ? "/logo-dark.png" : "/logo-warm.png"}
                alt="Secret Sauce"
                width={64}
                height={64}
                className="object-contain"
              />
            </button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={`${navIconClass("/meal-planner")} ${mobileLogoMenuOpen ? "pointer-events-none" : ""}`}
            asChild
          >
            <Link href="/meal-planner" aria-label="Meal Planner">
              <Calendar className="h-5 w-5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`${navIconClass("/store")} ${mobileLogoMenuOpen ? "pointer-events-none" : ""}`}
            asChild
          >
            <Link href="/store" aria-label="Shopping">
              <ShoppingCart className="h-5 w-5" />
            </Link>
          </Button>
          {user ? (
            <Button
              variant="ghost"
              size="icon"
              className={`${navIconClass("/dashboard")} ${mobileLogoMenuOpen ? "pointer-events-none" : ""}`}
              asChild
            >
              <Link href="/dashboard" aria-label="Dashboard">
                <User className="h-5 w-5" />
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className={`${isDark ? "text-foreground hover:bg-muted" : "hover:bg-gray-100"} ${
                mobileLogoMenuOpen ? "pointer-events-none" : ""
              }`}
            >
              <Link href="/auth/signin">Sign In</Link>
            </Button>
          )}
        </div>
      </nav>
    </>
  )
}
