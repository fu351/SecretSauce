"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Pencil, Plus } from "lucide-react"
import { RecipeCard } from "@/components/recipe-card"
import { getRecipeImageUrl } from "@/lib/image-helper"
import { useUserRecipes } from "@/hooks/use-recipe"

export default function YourRecipesPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()

  // Use React Query hook for data fetching with caching
  const { data: recipes = [], isLoading: loading } = useUserRecipes(user?.id || null)

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-serif font-light text-foreground mb-2">Your Recipes</h1>
            <p className="text-muted-foreground">Manage and edit your uploaded recipes</p>
          </div>
          <Button asChild>
            <Link href="/upload-recipe">
              <Plus className="h-4 w-4 mr-2" />
              Add Recipe
            </Link>
          </Button>
        </div>

        {recipes.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="p-12 text-center">
              <h3 className="text-lg font-medium text-foreground mb-2">No recipes yet</h3>
              <p className="text-muted-foreground mb-6">Start by uploading your first recipe!</p>
              <Button asChild>
                <Link href="/upload-recipe">
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Recipe
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipes.map((recipe) => (
              <div key={recipe.id} className="relative group">
                <Link href={`/recipes/${recipe.id}`}>
                  <RecipeCard
                    id={recipe.id}
                    title={recipe.title}
                    image={getRecipeImageUrl(recipe.image_url)}
                    rating={recipe.rating_avg || 0}
                    difficulty={recipe.difficulty as "beginner" | "intermediate" | "advanced"}
                    comments={recipe.rating_count || 0}
                    tags={recipe.dietary_tags || []}
                    nutrition={recipe.nutrition}
                    skipFavoriteCheck={true}
                    showFavorite={false}
                  />
                </Link>
                <div className="absolute top-4 left-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault()
                      router.push(`/edit-recipe/${recipe.id}`)
                    }}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
