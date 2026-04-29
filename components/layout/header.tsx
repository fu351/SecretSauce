"use client"

import { BookOpen, Calendar, Home, LogOut, Menu, MessageCircle, Plus, Refrigerator, Settings, ShoppingCart, Trophy, User, Wrench } from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useToast } from "@/hooks/ui/use-toast"
import Image from "next/image"
import { useState, useEffect, useRef } from "react"

export function Header() {
  const { user, profile, signOut } = useAuth()
  const { theme } = useTheme()
  const { isAdmin } = useIsAdmin()
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const [mounted, setMounted] = useState(false)
  const [signOutModalOpen, setSignOutModalOpen] = useState(false)
  const [mobileLogoMenuOpen, setMobileLogoMenuOpen] = useState(false)
  const [hideMobileNavForOverlay, setHideMobileNavForOverlay] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const mobileFabRef = useRef<HTMLDivElement>(null)

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Block wheel events so hovering over the header never scrolls the window.
  // Depends on `mounted` because the header returns null before mount,
  // so headerRef.current is only populated after the first real render.
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const block = (e: WheelEvent) => e.preventDefault()
    el.addEventListener("wheel", block, { passive: false })
    return () => el.removeEventListener("wheel", block)
  }, [mounted])

  useEffect(() => {
    if (!mobileLogoMenuOpen) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (mobileFabRef.current?.contains(target)) return
      setMobileLogoMenuOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("touchstart", handlePointerDown, { passive: true })

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("touchstart", handlePointerDown)
    }
  }, [mobileLogoMenuOpen])

  useEffect(() => {
    const hasBlockingOverlay = () => {
      if (typeof document === "undefined") return false
      return Boolean(
        document.querySelector(
          "[data-radix-dialog-content][data-state='open'], [role='dialog'][data-state='open']"
        )
      )
    }

    const syncOverlayState = () => setHideMobileNavForOverlay(hasBlockingOverlay())
    syncOverlayState()

    const observer = new MutationObserver(syncOverlayState)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "role"],
    })

    return () => observer.disconnect()
  }, [])

  // Use theme directly from context - it handles defaults properly
  const isDark = theme === "dark"

  // Prevent flash during hydration
  if (!mounted) {
    return null
  }

  // Hide app navigation on landing, auth pages, and the focused onboarding flow.
  if (pathname === "/" || pathname === "/onboarding" || (!user && pathname.startsWith("/auth"))) {
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
  const profileHref = user ? `/user/${encodeURIComponent(profile?.username ?? user.id)}` : "/auth/signin"

  return (
    <>
      <header
        ref={headerRef}
        className={`hidden lg:flex items-center justify-between px-6 py-4 border-b sticky top-0 z-40 ${
          isDark ? "bg-background/95 backdrop-blur border-border" : "bg-background/95 backdrop-blur border-border"
        }`}
      >
        {/* Left: logo+title on desktop */}
        <div className="flex min-w-0 flex-none items-center justify-start gap-4 xl:gap-6">
        {/* Desktop: logo + title */}
        <Link href="/home" className="block flex-shrink-0" data-tutorial-nav="/home">
          <Image
            src={isDark ? "/logo-dark.png" : "/logo-warm.png"}
            alt="Secret Sauce"
            width={60}
            height={60}
            className="cursor-pointer"
          />
        </Link>
        {pageInfo && (
          <div className="flex w-[260px] min-w-0 shrink flex-col xl:w-[380px]">
            <span className={`text-lg font-serif font-light ${pathname === "/" ? "" : isDark ? "text-foreground" : "text-gray-900"}`}>
              {pageInfo.title}
            </span>
            <span className="hidden lg:block text-sm text-muted-foreground mt-0.5 leading-tight">
              {pageInfo.subtext}
            </span>
          </div>
        )}
        </div>

        <nav className="hidden items-center gap-4 xl:flex xl:gap-6">
        <Link
          href="/recipes"
          data-tutorial-nav="/recipes"
          className={`hover:opacity-80 transition-opacity ${
            pathname === "/recipes" ? "font-semibold" : isDark ? "text-muted-foreground" : "text-gray-700"
          }`}
        >
          Recipes
        </Link>
        <Link
          href="/meal-planner"
          data-tutorial-nav="/meal-planner"
          className={`hover:opacity-80 transition-opacity ${
            pathname === "/meal-planner" ? "font-semibold" : isDark ? "text-muted-foreground" : "text-gray-700"
          }`}
        >
          Meal Planner
        </Link>
        <Link
          href="/store"
          data-tutorial-nav="/store"
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

        <div className="flex min-w-0 flex-none items-center justify-end gap-2 xl:gap-3">
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
                <Link href="/dashboard" data-tutorial-nav="/dashboard">
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
                <Link href="/settings" data-tutorial-nav="/settings">
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

      {/* Mobile/tablet bottom navbar */}
      <nav
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-[60] border-t px-2 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] overflow-visible ${
          hideMobileNavForOverlay ? "hidden" : "block"
        } ${isDark ? "bg-background/95 backdrop-blur border-border" : "bg-background/95 backdrop-blur border-border"}`}
      >
        <div className="relative mx-auto grid max-w-md grid-cols-[1fr_1fr_auto_1fr_1fr] items-center">
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              className={navIconClass("/home")}
              asChild
            >
              <Link href="/home" aria-label="Home" data-tutorial-nav="/home">
                <Home className="h-5 w-5" />
              </Link>
            </Button>
          </div>
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              className={navIconClass("/meal-planner")}
              asChild
            >
              <Link href="/meal-planner" aria-label="Meal Planner" data-tutorial-nav="/meal-planner">
                <Calendar className="h-5 w-5" />
              </Link>
            </Button>
          </div>
          <div ref={mobileFabRef} className="relative h-24 w-24 -mt-11 z-[100]">
            {mobileLogoMenuOpen && (
              <div className="absolute inset-0">
                {user ? (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-170deg) translateX(74px) rotate(170deg)" }}
                      asChild
                    >
                      <Link href="/challenges/join" aria-label="Leaderboard" onClick={closeMobileLogoMenu}>
                        <Trophy className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-130deg) translateX(74px) rotate(130deg)" }}
                      asChild
                    >
                      <Link href="/pantry" aria-label="Pantry" onClick={closeMobileLogoMenu}>
                        <Refrigerator className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-90deg) translateX(74px) rotate(90deg)" }}
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
                      style={{ transform: "translate(-50%, -50%) rotate(-50deg) translateX(74px) rotate(50deg)" }}
                      asChild
                    >
                      <Link href="/recipes" aria-label="Recipes" onClick={closeMobileLogoMenu}>
                        <BookOpen className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full bg-blue-500 text-white shadow-md hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
                      style={{ transform: "translate(-50%, -50%) rotate(-10deg) translateX(74px) rotate(10deg)" }}
                      aria-label="Send Feedback"
                      title="Send us feedback"
                      onClick={() => {
                        closeMobileLogoMenu()
                        window.dispatchEvent(new CustomEvent("open-feedback-widget"))
                      }}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-120deg) translateX(76px) rotate(120deg)" }}
                      asChild
                    >
                      <Link href="/challenges/join" aria-label="Leaderboard" onClick={closeMobileLogoMenu}>
                        <Trophy className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto absolute left-1/2 top-1/2 z-[110] h-10 w-10 rounded-full shadow-md"
                      style={{ transform: "translate(-50%, -50%) rotate(-60deg) translateX(76px) rotate(60deg)" }}
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
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              className={navIconClass("/store")}
              asChild
            >
              <Link href="/store" aria-label="Shopping" data-tutorial-nav="/store">
                <ShoppingCart className="h-5 w-5" />
              </Link>
            </Button>
          </div>
          <div className="flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Open menu"
                  className={`rounded-full border transition-all ${
                    isDark
                      ? "border-[#e8dcc4]/20 bg-[#181813]/90 text-[#e8dcc4] hover:bg-[#25241f]"
                      : "border-gray-200 bg-white/90 text-gray-800 shadow-sm hover:bg-white"
                  }`}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                sideOffset={12}
                collisionPadding={{ left: 12, right: 12, bottom: 12 }}
                className={`w-fit min-w-0 rounded-xl border p-1 shadow-xl backdrop-blur ${
                  isDark ? "border-[#e8dcc4]/20 bg-[#181813]/95 text-[#e8dcc4]" : "border-gray-200 bg-white/95 text-gray-900"
                }`}
              >
                {user ? (
                  <>
                    <DropdownMenuItem asChild className="rounded-lg px-2.5 py-2">
                      <Link href={profileHref}>Profile</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="rounded-lg px-2.5 py-2">
                      <Link href="/dashboard">Dashboard</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="rounded-lg px-2.5 py-2">
                      <Link href="/settings">Settings</Link>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem asChild className="rounded-lg px-2.5 py-2">
                      <Link href="/auth/signin">Sign In</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="rounded-lg px-2.5 py-2">
                      <Link href="/auth/signup">Sign Up</Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>
    </>
  )
}
