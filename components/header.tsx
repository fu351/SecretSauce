"use client"

import { Heart, ShoppingCart, Plus, User, LogOut, Settings } from "lucide-react"
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

export function Header() {
  const { user, profile, signOut } = useAuth()

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
      <div className="flex items-center">
        <Link href="/">
          <h1 className="text-2xl font-bold text-gray-900 italic cursor-pointer">Secret Sauce</h1>
        </Link>
      </div>

      <nav className="hidden md:flex items-center gap-6">
        <Link href="/recipes" className="text-gray-600 hover:text-gray-900">
          Recipes
        </Link>
        <Link href="/meal-planner" className="text-gray-600 hover:text-gray-900">
          Meal Planner
        </Link>
        <Link href="/shopping" className="text-gray-600 hover:text-gray-900">
          Shopping
        </Link>
        <Link href="/pantry" className="text-gray-600 hover:text-gray-900">
          Pantry
        </Link>
      </nav>

      <div className="flex items-center gap-4">
        {user ? (
          <>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/favorites">
                <Heart className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/shopping">
                <ShoppingCart className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2">
              <Link href="/recipes/upload">
                <Plus className="h-4 w-4 mr-2" />
                Upload Recipe
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="h-4 w-4 mr-2" />
                    Profile
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
