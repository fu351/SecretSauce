"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { HeroSection } from "@/components/hero-section"
import { RecipeSection } from "@/components/recipe-section"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"

// Add fallback recipes data before the component
const fallbackRecipes = [
  {
    id: "1",
    title: "Vegetarian Buddha Bowl",
    image: "/placeholder.svg?height=300&width=400",
    rating: 4.8,
    difficulty: "Beginner" as const,
    comments: 24,
    tags: ["Vegetarian", "Healthy"],
  },
  {
    id: "2",
    title: "Classic Spaghetti Carbonara",
    image: "/placeholder.svg?height=300&width=400",
    rating: 4.7,
    difficulty: "Intermediate" as const,
    comments: 18,
    tags: ["Italian", "Quick"],
  },
  {
    id: "3",
    title: "Chocolate Chip Cookies",
    image: "/placeholder.svg?height=300&width=400",
    rating: 4.9,
    difficulty: "Beginner" as const,
    comments: 32,
    tags: ["Dessert", "Kid-Friendly"],
  },
]

export default function HomePage() {
  const [popularRecipes, setPopularRecipes] = useState([])
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) {
      fetchPopularRecipes()
    }
  }, [user])

  const fetchPopularRecipes = async () => {
    try {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .order("rating_avg", { ascending: false })
        .limit(3)

      if (error) {
        console.warn("Database not set up yet, using fallback data:", error.message)
        // Use fallback data when database isn't ready
        setPopularRecipes(fallbackRecipes)
        return
      }

      const formattedRecipes = data.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        image: recipe.image_url,
        rating: recipe.rating_avg || 0,
        difficulty: recipe.difficulty,
        comments: recipe.rating_count || 0,
        tags: recipe.dietary_tags || [],
      }))

      setPopularRecipes(formattedRecipes)
    } catch (error) {
      console.warn("Error fetching popular recipes, using fallback data:", error)
      // Use fallback data when there's any error
      setPopularRecipes(fallbackRecipes)
    }
  }

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  if (user) {
    return null // Will redirect to dashboard
  }

  return (
    <main>
      <HeroSection />
      <RecipeSection title="Popular Recipes" recipes={popularRecipes} />

      {/* CTA Section */}
      <section className="bg-orange-500 py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to start your culinary journey?</h2>
          <p className="text-xl text-orange-100 mb-8">Join thousands of home cooks saving money and eating better</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/auth/signup">Get Started Free</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white text-white hover:bg-white hover:text-orange-500 bg-transparent"
              asChild
            >
              <Link href="/recipes">Browse Recipes</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
