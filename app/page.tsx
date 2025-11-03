"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import Image from "next/image"
import { ArrowRight, Search, Clock, Users, ChefHat, Heart, Calendar, ShoppingCart } from "lucide-react"
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

export default function HomePage() {
  const { user, loading } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [isFirstVisit, setIsFirstVisit] = useState(true)
  const [popularRecipes, setPopularRecipes] = useState<Recipe[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(true)
  const [userStats, setUserStats] = useState({
    totalRecipes: 0,
    favoriteRecipes: 0,
    mealPlansThisWeek: 0,
    pantryItems: 0,
  })

  const fetchingRecipes = useRef(false)
  const fetchingStats = useRef(false)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    setMounted(true)

    const hasVisited = document.cookie.includes("visited=true")
    setIsFirstVisit(!hasVisited)

    if (!hasVisited) {
      const expiryDate = new Date()
      expiryDate.setFullYear(expiryDate.getFullYear() + 1)
      document.cookie = `visited=true; expires=${expiryDate.toUTCString()}; path=/`
    }

    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!isFirstVisit && isMounted.current && !fetchingRecipes.current) {
      fetchPopularRecipes()
    }
  }, [isFirstVisit])

  useEffect(() => {
    if (user && isMounted.current && !fetchingStats.current) {
      fetchUserStats()
    }
  }, [user])

  const fetchPopularRecipes = async () => {
    if (fetchingRecipes.current || !isMounted.current) return

    fetchingRecipes.current = true
    setLoadingRecipes(true)

    try {
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id, title, description, prep_time, cook_time, servings, difficulty, cuisine, image_url, dietary_tags, rating_avg, rating_count, nutrition",
        )
        .order("rating_avg", { ascending: false })
        .limit(6)

      if (!error && data && isMounted.current) {
        setPopularRecipes(data)
      }
    } catch (error) {
      console.error("Error fetching recipes:", error)
    } finally {
      if (isMounted.current) {
        setLoadingRecipes(false)
      }
      fetchingRecipes.current = false
    }
  }

  const fetchUserStats = async () => {
    if (!user || fetchingStats.current || !isMounted.current) return

    fetchingStats.current = true

    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

      const [recipesResult, favoritesResult, mealPlansResult, pantryResult] = await Promise.all([
        supabase.from("recipes").select("id", { count: "exact", head: true }).eq("author_id", user.id),
        supabase.from("recipe_favorites").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase
          .from("meal_plans")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("week_start", weekAgo),
        supabase.from("pantry_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ])

      if (isMounted.current) {
        setUserStats({
          totalRecipes: recipesResult.count || 0,
          favoriteRecipes: favoritesResult.count || 0,
          mealPlansThisWeek: mealPlansResult.count || 0,
          pantryItems: pantryResult.count || 0,
        })
      }
    } catch (error) {
      console.error("Error fetching user stats:", error)
    } finally {
      fetchingStats.current = false
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
        <div className="absolute inset-0 opacity-[0.015]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
            }}
          />
        </div>

        <div
          className={`relative z-10 max-w-2xl mx-auto text-center transition-all duration-1000 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="mb-12 flex justify-center">
            <Image src="/logo-dark.png" alt="Secret Sauce" width={160} height={160} className="opacity-90" />
          </div>

          <h1 className="text-4xl md:text-6xl font-serif mb-6 tracking-tight font-light leading-tight">
            The secret to better meals
          </h1>

          <p className="text-base md:text-lg text-[#e8dcc4]/40 mb-12 font-light tracking-wide">
            Save your health, money, and time
          </p>

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

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <p className="text-[#e8dcc4]/20 text-xs font-light tracking-[0.2em]">SECRET SAUCE</p>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-[#181813]">
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
        {user && (
          <section className="mb-12">
            <div className="mb-8">
              <h2 className="text-3xl font-serif font-light text-[#e8dcc4] mb-2">
                Welcome back, {user.email?.split("@")[0]}!
              </h2>
              <p className="text-[#e8dcc4]/70">Here's what's cooking in your kitchen</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Link href="/recipes" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-[#1f1e1a] border-[#e8dcc4]/20">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <ChefHat className="h-8 w-8 text-[#e8dcc4]" />
                      <span className="text-xs text-[#e8dcc4]/50">Your Recipes</span>
                    </div>
                    <p className="text-3xl font-bold text-[#e8dcc4]">{userStats.totalRecipes}</p>
                    <p className="text-sm text-[#e8dcc4]/70 mt-1">Recipes created</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/favorites" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-[#1f1e1a] border-[#e8dcc4]/20">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <Heart className="h-8 w-8 text-red-400" />
                      <span className="text-xs text-[#e8dcc4]/50">Favorites</span>
                    </div>
                    <p className="text-3xl font-bold text-[#e8dcc4]">{userStats.favoriteRecipes}</p>
                    <p className="text-sm text-[#e8dcc4]/70 mt-1">Saved recipes</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/meal-planner" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-[#1f1e1a] border-[#e8dcc4]/20">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <Calendar className="h-8 w-8 text-blue-400" />
                      <span className="text-xs text-[#e8dcc4]/50">Meal Plans</span>
                    </div>
                    <p className="text-3xl font-bold text-[#e8dcc4]">{userStats.mealPlansThisWeek}</p>
                    <p className="text-sm text-[#e8dcc4]/70 mt-1">Meals this week</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/pantry" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-[#1f1e1a] border-[#e8dcc4]/20">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <ShoppingCart className="h-8 w-8 text-green-400" />
                      <span className="text-xs text-[#e8dcc4]/50">Pantry Items</span>
                    </div>
                    <p className="text-3xl font-bold text-[#e8dcc4]">{userStats.pantryItems}</p>
                    <p className="text-sm text-[#e8dcc4]/70 mt-1">Items in stock</p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </section>
        )}

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
