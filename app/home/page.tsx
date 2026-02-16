"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useIsMobile } from "@/hooks"
import { recipeDB } from "@/lib/database/recipe-db"
import Image from "next/image"
import { ArrowRight, Search, Clock, Users } from "lucide-react"
import { RecipeCard } from "@/components/recipe/cards/recipe-card"
import { Recipe } from "@/lib/types"

type HomePageRecipe = Recipe

export default function HomeReturningPage() {
  const { user, loading } = useAuth()
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const [popularRecipes, setPopularRecipes] = useState<HomePageRecipe[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(true)

  const fetchingRecipes = useRef(false)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!loading && isMounted.current && !fetchingRecipes.current) {
      fetchPopularRecipes()
    }
  }, [loading])

  const fetchPopularRecipes = async () => {
    if (fetchingRecipes.current || !isMounted.current) return

    fetchingRecipes.current = true
    setLoadingRecipes(true)

    try {
      const recipes = await recipeDB.fetchRecipes({
        sortBy: "rating_avg",
        limit: 6,
      })

      if (recipes && isMounted.current) {
        setPopularRecipes(recipes)
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse relative size-[120px]">
          <Image
            src="/logo-warm.png"
            alt="Secret Sauce"
            width={120}
            height={120}
            className="dark:hidden block object-contain"
          />
          <Image
            src="/logo-dark.png"
            alt="Secret Sauce"
            width={120}
            height={120}
            className="hidden dark:block object-contain"
          />
        </div>
      </div>
    )
  }

  const isDark = theme === "dark"

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
            <h2 className="text-3xl font-serif font-light text-foreground">
              Popular Recipes
            </h2>
            <Button
              variant="ghost"
              asChild
              className={isDark ? "text-foreground hover:bg-background/10" : "text-foreground hover:bg-accent"}
            >
              <Link href="/recipes">View All &rarr;</Link>
            </Button>
          </div>

          {loadingRecipes ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-4 animate-pulse ${
                    isDark ? "bg-[#1f1e1a] border border-background/20" : "bg-card border border-border"
                  }`}
                >
                  <div className="bg-gray-700 h-48 rounded-lg mb-4" />
                  <div className="bg-gray-700 h-6 rounded mb-2" />
                  <div className="bg-gray-700 h-4 rounded w-2/3" />
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
                    content={recipe.content}
                    rating_avg={recipe.rating_avg || 0}
                    difficulty={recipe.difficulty as "beginner" | "intermediate" | "advanced"}
                    comments={recipe.rating_count || 0}
                    tags={recipe.tags}
                    nutrition={recipe.nutrition}
                    initialIsFavorited={false}
                    skipFavoriteCheck={!user}
                  />
                </Link>
              ))}
            </div>
          ) : (
            <Card className={isDark ? "bg-[#1f1e1a] border-background/20" : "bg-card border-border"}>
              <CardContent className="p-12 text-center">
                <p className={isDark ? "text-foreground/70" : "text-muted-foreground"}>
                  No recipes available yet. Check back soon!
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-8 md:mb-12">
          <Card className={isDark ? "bg-[#1f1e1a] border-background/20" : "bg-card border-border"}>
            <CardContent className="p-6 text-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  isDark ? "bg-background/20" : "bg-accent"
                }`}
              >
                <Search className="h-6 w-6 text-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">
                Discover Recipes
              </h3>
              <p className={isDark ? "text-foreground/70" : "text-muted-foreground"}>
                Browse thousands of recipes from around the world
              </p>
            </CardContent>
          </Card>

          <Card className={isDark ? "bg-[#1f1e1a] border-background/20" : "bg-card border-border"}>
            <CardContent className="p-6 text-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  isDark ? "bg-background/20" : "bg-accent"
                }`}
              >
                <Clock className="h-6 w-6 text-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">
                Plan Your Meals
              </h3>
              <p className={isDark ? "text-foreground/70" : "text-muted-foreground"}>
                Organize your weekly meals with our meal planner
              </p>
            </CardContent>
          </Card>

          <Card className={isDark ? "bg-[#1f1e1a] border-background/20" : "bg-card border-border"}>
            <CardContent className="p-6 text-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  isDark ? "bg-background/20" : "bg-accent"
                }`}
              >
                <Users className="h-6 w-6 text-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">
                Save Money
              </h3>
              <p className={isDark ? "text-foreground/70" : "text-muted-foreground"}>
                Compare grocery prices and find the best deals
              </p>
            </CardContent>
          </Card>
        </div>

        {!user && (
          <Card className={`text-center ${isDark ? "bg-[#1f1e1a] border-background/20" : "bg-card border-border"}`}>
            <CardContent className="p-12">
              <h2 className="text-3xl font-serif font-light mb-4 text-foreground">
                Ready to start cooking?
              </h2>
              <p className="mb-6 max-w-2xl mx-auto text-muted-foreground">
                Join thousands of home cooks who are saving time and money with Secret Sauce
              </p>
              <Button
                size="lg"
                asChild
                className={
                  isDark
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
