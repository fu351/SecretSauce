"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { supabase } from "@/lib/supabase"
import Image from "next/image"
import { ArrowRight, Search, Clock, Users } from "lucide-react"
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
  const { theme, setTheme } = useTheme()
  const isMobile = useIsMobile()
  const [mounted, setMounted] = useState(false)
  const [visitStatus, setVisitStatus] = useState<true | false | null>(null)
  const [visitChecked, setVisitChecked] = useState(false)
  const [popularRecipes, setPopularRecipes] = useState<Recipe[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(true)

  const fetchingRecipes = useRef(false)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    setMounted(true)

    const hasVisited = document.cookie.includes("visited=true")
    setVisitStatus(!hasVisited)
    setVisitChecked(true)

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
    if (!visitChecked) return
    if (visitStatus === true && !user) {
      setTheme("dark")
    }
  }, [visitChecked, visitStatus, user, setTheme])

  useEffect(() => {
    if (visitStatus === false && isMounted.current && !fetchingRecipes.current) {
      fetchPopularRecipes()
    }
  }, [visitStatus])

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

  if (loading) {
    const domDark =
      typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : null
    const useDark = domDark ?? theme === "dark"
    return (
      <div className={`min-h-screen flex items-center justify-center bg-background`}>
        <div className="animate-pulse">
          <Image src={useDark ? "/logo-dark.png" : "/logo-warm.png"} alt="Secret Sauce" width={120} height={120} />
        </div>
      </div>
    )
  }

  if (visitChecked && visitStatus === true && !user) {
    return (
      <main
        className={`min-h-screen flex items-center justify-center px-4 md:px-6 relative overflow-hidden bg-background text-foreground`}
      >
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
          <div className="mb-8 md:mb-12 flex justify-center mt-6 md:mt-0">
            <Image
              src={theme === "dark" ? "/logo-dark.png" : "/logo-warm.png"}
              alt="Secret Sauce"
              width={isMobile ? 100 : 120}
              height={isMobile ? 100 : 120}
              className="opacity-90"
              priority
            />
          </div>

          <h1 className="text-3xl md:text-4xl lg:text-6xl font-serif mb-4 md:mb-6 tracking-tight font-light leading-tight">
            The secret to better meals
          </h1>

          <p
            className={`text-sm md:text-base lg:text-lg mb-8 md:mb-12 font-light tracking-wide ${
              theme === "dark" ? "text-foreground/40" : "text-muted-foreground"
            }`}
          >
            Save your health, money, and time
          </p>

          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center items-center">
            <Button
              size={isMobile ? "default" : "lg"}
              className={`w-full sm:w-auto px-8 md:px-10 py-4 md:py-6 text-sm md:text-base font-normal transition-all duration-300 ${
                theme === "dark"
                  ? "bg-foreground text-background hover:bg-foreground/90 shadow-lg shadow-background/10"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
              asChild
            >
              <Link href="/auth/signup">
                Discover the Secret
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size={isMobile ? "default" : "lg"}
              variant="ghost"
              className={`w-full sm:w-auto px-8 md:px-10 py-4 md:py-6 text-sm md:text-base font-light transition-all duration-300 ${
                theme === "dark"
                  ? "text-foreground/60 hover:text-foreground hover:bg-transparent border border-background/20 hover:border-background/30"
                  : "text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30"
              }`}
              asChild
            >
              <Link href="/auth/signin">Sign In</Link>
            </Button>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <p
            className={`text-xs font-light tracking-[0.2em] ${
              theme === "dark" ? "text-foreground/20" : "text-muted-foreground/30"
            }`}
          >
            SECRET SAUCE
          </p>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="text-center mb-8 md:mb-12 py-8 md:py-12">
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-light mb-3 md:mb-4 px-4 text-foreground">
            Discover Amazing Recipes
          </h1>
          <p className="text-base md:text-xl mb-6 md:mb-8 max-w-2xl mx-auto px-4 text-muted-foreground">
            Browse our collection of delicious recipes, plan your meals, and save money on groceries
          </p>
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center px-4">
            <Button size={isMobile ? "default" : "lg"} asChild>
              <Link href="/recipes">
                <Search className="h-4 w-4 mr-2" />
                Browse All Recipes
              </Link>
            </Button>
            {user ? (
              <Button size={isMobile ? "default" : "lg"} variant="outline" asChild>
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            ) : (
              <Button size={isMobile ? "default" : "lg"} variant="outline" asChild>
                <Link href="/auth/signup">Sign Up Free</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="mb-8 md:mb-12">
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <h2
              className={`text-3xl font-serif font-light ${theme === "dark" ? "text-foreground" : "text-foreground"}`}
            >
              Popular Recipes
            </h2>
            <Button
              variant="ghost"
              asChild
              className={
                theme === "dark" ? "text-foreground hover:bg-background/10" : "text-foreground hover:bg-accent"
              }
            >
              <Link href="/recipes">View All →</Link>
            </Button>
          </div>

          {loadingRecipes ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-4 animate-pulse ${
                    theme === "dark" ? "bg-[#1f1e1a] border border-background/20" : "bg-card border border-border"
                  }`}
                >
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
            <Card className={theme === "dark" ? "bg-[#1f1e1a] border-background/20" : "bg-card border-border"}>
              <CardContent className="p-12 text-center">
                <p className={theme === "dark" ? "text-foreground/70" : "text-muted-foreground"}>
                  No recipes available yet. Check back soon!
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-8 md:mb-12">
          <Card className={theme === "dark" ? "bg-[#1f1e1a] border-background/20" : "bg-card border-border"}>
            <CardContent className="p-6 text-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  theme === "dark" ? "bg-background/20" : "bg-accent"
                }`}
              >
                <Search className={`h-6 w-6 ${theme === "dark" ? "text-foreground" : "text-foreground"}`} />
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${theme === "dark" ? "text-foreground" : "text-foreground"}`}>
                Discover Recipes
              </h3>
              <p className={theme === "dark" ? "text-foreground/70" : "text-muted-foreground"}>
                Browse thousands of recipes from around the world
              </p>
            </CardContent>
          </Card>

          <Card className={theme === "dark" ? "bg-[#1f1e1a] border-background/20" : "bg-card border-border"}>
            <CardContent className="p-6 text-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  theme === "dark" ? "bg-background/20" : "bg-accent"
                }`}
              >
                <Clock className={`h-6 w-6 ${theme === "dark" ? "text-foreground" : "text-foreground"}`} />
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${theme === "dark" ? "text-foreground" : "text-foreground"}`}>
                Plan Your Meals
              </h3>
              <p className={theme === "dark" ? "text-foreground/70" : "text-muted-foreground"}>
                Organize your weekly meals with our meal planner
              </p>
            </CardContent>
          </Card>

          <Card className={theme === "dark" ? "bg-[#1f1e1a] border-background/20" : "bg-card border-border"}>
            <CardContent className="p-6 text-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  theme === "dark" ? "bg-background/20" : "bg-accent"
                }`}
              >
                <Users className={`h-6 w-6 ${theme === "dark" ? "text-foreground" : "text-foreground"}`} />
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${theme === "dark" ? "text-foreground" : "text-foreground"}`}>
                Save Money
              </h3>
              <p className={theme === "dark" ? "text-foreground/70" : "text-muted-foreground"}>
                Compare grocery prices and find the best deals
              </p>
            </CardContent>
          </Card>
        </div>

        {!user && (
          <Card
            className={`text-center ${theme === "dark" ? "bg-[#1f1e1a] border-background/20" : "bg-card border-border"}`}
          >
            <CardContent className="p-12">
              <h2
                className={`text-3xl font-serif font-light mb-4 ${theme === "dark" ? "text-foreground" : "text-foreground"}`}
              >
                Ready to start cooking?
              </h2>
              <p className="mb-6 max-w-2xl mx-auto text-muted-foreground">
                Join thousands of home cooks who are saving time and money with Secret Sauce
              </p>
              <Button
                size="lg"
                asChild
                className={
                  theme === "dark"
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }
              >
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
