"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import Image from "next/image"
import { ArrowRight, Search, Clock, Users } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { RecipeCard } from "@/components/recipe-card"

interface Recipe {
  id: string
  title: string
  description: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: string
  cuisine: string
  image_url: string
  dietary_tags: string[]
  rating_avg: number
  rating_count: number
  nutrition?: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  }
}

export default function LandingPage() {
  const { user, loading } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [isFirstVisit, setIsFirstVisit] = useState(true)
  const [popularRecipes, setPopularRecipes] = useState<Recipe[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(true)

  // const isDark = theme === "dark"

  useEffect(() => {
    setMounted(true)

    const hasVisited = document.cookie.includes("visited=true")
    setIsFirstVisit(!hasVisited)

    // Set cookie for future visits (expires in 1 year)
    if (!hasVisited) {
      const expiryDate = new Date()
      expiryDate.setFullYear(expiryDate.getFullYear() + 1)
      document.cookie = `visited=true; expires=${expiryDate.toUTCString()}; path=/`
    }
  }, [])

  // Now the landing page is accessible to everyone

  useEffect(() => {
    if (!isFirstVisit) {
      fetchPopularRecipes()
    }
  }, [isFirstVisit])

  const fetchPopularRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id, title, description, prep_time, cook_time, servings, difficulty, cuisine, image_url, dietary_tags, rating_avg, rating_count, nutrition",
        )
        .order("rating_avg", { ascending: false })
        .limit(6)

      if (!error && data) {
        setPopularRecipes(data)
      }
    } catch (error) {
      console.error("Error fetching recipes:", error)
    } finally {
      setLoadingRecipes(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#181813] flex items-center justify-center">
        <div className="animate-pulse">
          <Image src="/logo-dark.png" alt="Secret Sauce" width={120} height={120} />
        </div>
      </div>
    )
  }

  if (isFirstVisit && !user) {
    return (
      <main className="min-h-screen bg-[#181813] text-[#e8dcc4] flex items-center justify-center px-6 relative overflow-hidden">
        {/* Subtle noise texture */}
        <div className="absolute inset-0 opacity-[0.015]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
            }}
          />
        </div>

        {/* Main content */}
        <div
          className={`relative z-10 max-w-2xl mx-auto text-center transition-all duration-1000 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          {/* Logo */}
          <div className="mb-12 flex justify-center">
            <Image src="/logo-dark.png" alt="Secret Sauce" width={160} height={160} className="opacity-90" />
          </div>

          {/* Mysterious tagline */}
          <h1 className="text-4xl md:text-6xl font-serif mb-6 tracking-tight font-light leading-tight">
            The secret to better meals
          </h1>

          {/* Subtle hint */}
          <p className="text-base md:text-lg text-[#e8dcc4]/40 mb-12 font-light tracking-wide">
            Save your health, money, and time
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              className="bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] px-10 py-6 text-base font-normal transition-all duration-300 shadow-lg shadow-[#e8dcc4]/10"
              asChild
            >
              <Link href="/auth/signup">
                Discover the Secret
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-[#e8dcc4]/60 hover:text-[#e8dcc4] hover:bg-transparent px-10 py-6 text-base font-light border border-[#e8dcc4]/10 hover:border-[#e8dcc4]/30 transition-all duration-300"
              asChild
            >
              <Link href="/auth/signin">Sign In</Link>
            </Button>
          </div>
        </div>

        {/* Subtle footer */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <p className="text-[#e8dcc4]/20 text-xs font-light tracking-[0.2em]">SECRET SAUCE</p>
        </div>
      </main>
    )
  }

  // const bgClass = isDark ? "bg-[#181813]" : "bg-gradient-to-br from-orange-50 to-yellow-50"
  // const textClass = isDark ? "text-[#e8dcc4]" : "text-gray-900"
  // const mutedTextClass = isDark ? "text-[#e8dcc4]/70" : "text-gray-600"
  // const cardBgClass = isDark ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white/80"
  // const buttonClass = isDark
  //   ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]"
  //   : "bg-orange-500 hover:bg-orange-600 text-white"

  return (
    <div className="min-h-screen bg-[#181813]">
      {/* Header for non-authenticated users */}
      {!user && (
        <header className="border-b bg-[#181813] border-[#e8dcc4]/20">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center">
              <Image src="/logo-dark.png" alt="Secret Sauce" width={50} height={50} className="cursor-pointer" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild className="text-[#e8dcc4] hover:bg-[#e8dcc4]/10">
                <Link href="/auth/signin">Sign In</Link>
              </Button>
              <Button asChild className="bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]">
                <Link href="/auth/signup">Get Started</Link>
              </Button>
            </div>
          </div>
        </header>
      )}

      <div className="max-w-7xl mx-auto p-6">
        {/* Hero Section */}
        <div className="text-center mb-12 py-12">
          <h1 className="text-5xl md:text-6xl font-serif font-light text-[#e8dcc4] mb-4">Discover Amazing Recipes</h1>
          <p className="text-xl text-[#e8dcc4]/70 mb-8 max-w-2xl mx-auto">
            Browse our collection of delicious recipes, plan your meals, and save money on groceries
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" asChild className="bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]">
              <Link href="/recipes">
                <Search className="h-4 w-4 mr-2" />
                Browse All Recipes
              </Link>
            </Button>
            {user ? (
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 bg-transparent"
              >
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            ) : (
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 bg-transparent"
              >
                <Link href="/auth/signup">Sign Up Free</Link>
              </Button>
            )}
          </div>
        </div>

        {/* Popular Recipes */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-serif font-light text-[#e8dcc4]">Popular Recipes</h2>
            <Button variant="ghost" asChild className="text-[#e8dcc4] hover:bg-[#e8dcc4]/10">
              <Link href="/recipes">View All →</Link>
            </Button>
          </div>

          {loadingRecipes ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-lg bg-[#1f1e1a] border border-[#e8dcc4]/20 p-4 animate-pulse">
                  <div className="bg-gray-700 h-48 rounded-lg mb-4"></div>
                  <div className="bg-gray-700 h-6 rounded mb-2"></div>
                  <div className="bg-gray-700 h-4 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          ) : popularRecipes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {popularRecipes.map((recipe) => (
                <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                  <RecipeCard
                    id={recipe.id}
                    title={recipe.title}
                    image={recipe.image_url || "/placeholder.svg?height=300&width=400"}
                    rating={recipe.rating_avg || 0}
                    difficulty={recipe.difficulty as "beginner" | "intermediate" | "advanced"}
                    comments={recipe.rating_count || 0}
                    tags={recipe.dietary_tags || []}
                    nutrition={recipe.nutrition}
                    initialIsFavorited={false}
                    skipFavoriteCheck={!user}
                  />
                </Link>
              ))}
            </div>
          ) : (
            <Card className="bg-[#1f1e1a] border-[#e8dcc4]/20">
              <CardContent className="p-12 text-center">
                <p className="text-[#e8dcc4]/70">No recipes available yet. Check back soon!</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <Card className="bg-[#1f1e1a] border-[#e8dcc4]/20">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-[#e8dcc4]/20 flex items-center justify-center mx-auto mb-4">
                <Search className="h-6 w-6 text-[#e8dcc4]" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-[#e8dcc4]">Discover Recipes</h3>
              <p className="text-[#e8dcc4]/70">Browse thousands of recipes from around the world</p>
            </CardContent>
          </Card>

          <Card className="bg-[#1f1e1a] border-[#e8dcc4]/20">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-[#e8dcc4]/20 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-6 w-6 text-[#e8dcc4]" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-[#e8dcc4]">Plan Your Meals</h3>
              <p className="text-[#e8dcc4]/70">Organize your weekly meals with our meal planner</p>
            </CardContent>
          </Card>

          <Card className="bg-[#1f1e1a] border-[#e8dcc4]/20">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-[#e8dcc4]/20 flex items-center justify-center mx-auto mb-4">
                <Users className="h-6 w-6 text-[#e8dcc4]" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-[#e8dcc4]">Save Money</h3>
              <p className="text-[#e8dcc4]/70">Compare grocery prices and find the best deals</p>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        {!user && (
          <Card className="bg-[#1f1e1a] border-[#e8dcc4]/20 text-center">
            <CardContent className="p-12">
              <h2 className="text-3xl font-serif font-light text-[#e8dcc4] mb-4">Ready to start cooking?</h2>
              <p className="text-[#e8dcc4]/70 mb-6 max-w-2xl mx-auto">
                Join thousands of home cooks who are saving time and money with Secret Sauce
              </p>
              <Button size="lg" asChild className="bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]">
                <Link href="/auth/signup">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
