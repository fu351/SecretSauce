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
import Link from "next/link"
import { usePathname } from "next/navigation"

export function Header() {
  const { user, profile, signOut } = useAuth()
  const pathname = usePathname()

  // Don't show upload button on upload page
  const showUploadButton = user && !pathname.includes("/recipes/upload")

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
      <div className="flex items-center">
        <Link href="/">
          <h1 className="text-2xl font-bold text-gray-900 italic cursor-pointer">Secret Sauce</h1>
        </Link>
      </div>

      <nav className="hidden md:flex items-center gap-6">
        <Link
          href="/recipes"
          className={`text-gray-600 hover:text-gray-900 ${pathname === "/recipes" ? "font-semibold text-gray-900" : ""}`}
        >
          Recipes
        </Link>
        <Link
          href="/meal-planner"
          className={`text-gray-600 hover:text-gray-900 ${pathname === "/meal-planner" ? "font-semibold text-gray-900" : ""}`}
        >
          Meal Planner
        </Link>
        <Link
          href="/shopping"
          className={`text-gray-600 hover:text-gray-900 ${pathname === "/shopping" ? "font-semibold text-gray-900" : ""}`}
        >
          Shopping
        </Link>
        <Link
          href="/pantry"
          className={`text-gray-600 hover:text-gray-900 ${pathname === "/pantry" ? "font-semibold text-gray-900" : ""}`}
        >
          Pantry
        </Link>
      </nav>

      <div className="flex items-center gap-3">
        {user ? (
          <>
            {/* Quick Action Icons */}
            <Button variant="ghost" size="icon" asChild className="hidden md:flex">
              <Link href="/favorites">
                <Heart className="h-5 w-5" />
              </Link>
            </Button>

            {/* Only show shopping cart if not on shopping page */}
            {!pathname.includes("/shopping") && (
              <Button variant="ghost" size="icon" asChild className="hidden md:flex">
                <Link href="/shopping">
                  <ShoppingCart className="h-5 w-5" />
                </Link>
              </Button>
            )}

            {/* Highlighted Upload Button - only show when not on upload page */}
            {showUploadButton && (
              <Link href="/recipes/upload">
                <button className="relative inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg shadow-lg hover:from-orange-600 hover:to-orange-700 hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 active:scale-95">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Recipe
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-orange-400 to-orange-500 opacity-0 hover:opacity-20 transition-opacity duration-200"></div>
                </button>
              </Link>
            )}

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/recipes">Recipes</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/meal-planner">Meal Planner</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/shopping">Shopping</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/pantry">Pantry</Link>
                </DropdownMenuItem>
                {showUploadButton && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/recipes/upload">
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
            <Button variant="ghost" asChild>
              <Link href="/auth/signin">Sign In</Link>
            </Button>
            <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white">
              <Link href="/auth/signup">Get Started</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
