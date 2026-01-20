"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { useRecipe, useStandardizeRecipeIngredients } from "@/hooks"
import { recipeDB } from "@/lib/database/recipe-db"
import { uploadRecipeImage } from "@/lib/image-helper"
import { RecipeManualEntryForm } from "@/components/recipe/forms/recipe-manual-entry-form"
import type { RecipeSubmissionData, ImportedRecipe } from "@/lib/types"

export default function EditRecipePage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const recipeId = Array.isArray(params.id) ? params.id[0] : params.id

  // Use React Query hook for data fetching
  const { data: recipe, isLoading } = useRecipe(recipeId || null)


  // Use standardize ingredients mutation
  const standardizeMutation = useStandardizeRecipeIngredients()

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Permission check
  if (recipe && recipe.author_id !== user?.id) {
    toast({
      title: "Permission denied",
      description: "You can only edit your own recipes.",
      variant: "destructive",
    })
    router.push("/your-recipes")
    return null
  }

  const handleSubmit = async (data: RecipeSubmissionData) => {
    if (!user || !recipeId) return

    setSaving(true)
    try {
      // Handle image upload if needed
      let imageValue = data.image_url || null
      if (data.imageFile) {
        const storagePath = await uploadRecipeImage(data.imageFile, user.id)
        imageValue = storagePath
      }

      // Prepare update data
      const recipeData: any = {
        title: data.title,
        description: data.description,
        image_url: imageValue,
        prep_time: data.prep_time,
        cook_time: data.cook_time,
        servings: data.servings,
        difficulty: data.difficulty as "beginner" | "intermediate" | "advanced",
        cuisine: data.cuisine,
        tags: {
          dietary: data.dietary_tags || [],
          allergens: recipe?.tags.allergens,
          protein: recipe?.tags.protein,
          meal_type: recipe?.tags.meal_type,
          cuisine_guess: recipe?.tags.cuisine_guess
        },
        ingredients: data.ingredients,
        instructions: data.instructions,
        nutrition: data.nutrition,
        updated_at: new Date().toISOString(),
      }

      // Update using recipe-db
      await recipeDB.updateRecipe(recipeId, recipeData)

      // Invalidate cache
      await queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] })
      await queryClient.invalidateQueries({ queryKey: ["recipes"] })

      // Standardize ingredients asynchronously (don't wait for it)
      standardizeMutation.mutate({ recipeId, ingredients: data.ingredients })

      toast({
        title: "Recipe updated!",
        description: "Your recipe has been successfully updated.",
      })

      router.push(`/recipes/${recipeId}`)
    } catch (error: any) {
      console.error("Error updating recipe:", error)
      toast({
        title: "Update failed",
        description: error.message || "Failed to update recipe. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!user || !recipeId) return

    setDeleting(true)
    try {
      await recipeDB.deleteRecipe(recipeId)

      // Invalidate cache
      await queryClient.invalidateQueries({ queryKey: ["recipes"] })

      toast({
        title: "Recipe deleted",
        description: "Your recipe has been successfully deleted.",
      })

      router.push("/your-recipes")
    } catch (error: any) {
      console.error("Error deleting recipe:", error)
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete recipe. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  // Convert Recipe to ImportedRecipe format
  const recipeData: ImportedRecipe | undefined = recipe
    ? {
        ...recipe,
        source_type: "manual" as const,
      }
    : undefined

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!recipe) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Edit Recipe</h1>
          <p className="text-muted-foreground">Update your recipe details</p>
        </div>

        <RecipeManualEntryForm
          mode="edit"
          recipeId={recipeId}
          initialData={recipeData}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          loading={saving}
          deleting={deleting}
        />
      </div>
    </div>
  )
}
