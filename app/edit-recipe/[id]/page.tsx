"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import clsx from "clsx"
import { useAuth } from "@/contexts/auth-context"
import { useToast, useRecipe } from "@/hooks"
import { useIsAdmin } from "@/hooks/use-admin"
import { useTheme } from "@/contexts/theme-context"
import { uploadRecipeImage } from "@/lib/image-helper"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RecipeManualEntryForm } from "@/components/recipe/forms/recipe-manual-entry-form"
import { RecipeImportParagraph } from "@/components/recipe/import/recipe-import-paragraph"
import { ClipboardList, PenLine } from "lucide-react"
import type { RecipeSubmissionData, ImportedRecipe } from "@/lib/types"
import { parseInstructionsFromDB } from "@/lib/types"

export default function EditRecipePage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { theme } = useTheme()
  const { isAdmin, loading: adminLoading } = useIsAdmin()
  const pageBackgroundClass = theme === "dark" ? "bg-background" : "bg-gradient-to-br from-orange-50 to-yellow-50"

  const recipeId = Array.isArray(params.id) ? params.id[0] : params.id

  // Use React Query hook for data fetching
  const { data: recipe, isLoading } = useRecipe(recipeId || null)

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editTab, setEditTab] = useState<"form" | "paragraph">("form")
  const [formKey, setFormKey] = useState(0)
  const [extraIngredients, setExtraIngredients] = useState<ImportedRecipe["ingredients"]>([])

  // Permission check
  const isOwner = Boolean(recipe && user && recipe.author_id === user.id)
  const canEditRecipe = isOwner || isAdmin

  if (recipe && !isOwner && !adminLoading && !isAdmin) {
    toast({
      title: "Permission denied",
      description: "You can only edit your own recipes.",
      variant: "destructive",
    })
    router.push("/recipes?mine=true")
    return null
  }

  if (recipe && !canEditRecipe && adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
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

      const instructionSteps = data.instructions
        .map((step) => step.description?.trim())
        .filter(Boolean)

      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: data.title,
          cuisine: data.cuisine || recipe?.cuisine_name || null,
          mealType: recipe?.meal_type ?? null,
          protein: recipe?.protein ?? null,
          difficulty: data.difficulty,
          servings: data.servings,
          prepTime: data.prep_time,
          cookTime: data.cook_time,
          tags: data.tags || [],
          nutrition: data.nutrition,
          description: data.description,
          imageUrl: imageValue,
          instructions: instructionSteps,
          ingredients: data.ingredients,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update recipe record")
      }
      const updatedRecipe = payload.recipe
      if (!updatedRecipe?.id) {
        throw new Error("Failed to update recipe record")
      }

      // Invalidate cache
      await queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] })
      await queryClient.invalidateQueries({ queryKey: ["recipes"] })

      toast({
        title: "Recipe updated!",
        description: "Recipe has been successfully updated.",
      })

      router.push(`/recipes/${updatedRecipe.id}`)
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
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "DELETE",
        credentials: "include",
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to delete recipe")
      }

      // Invalidate cache
      await queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] })
      await queryClient.invalidateQueries({ queryKey: ["recipes"] })

      toast({
        title: "Recipe deleted",
        description: "Recipe has been successfully deleted.",
      })

      router.push("/recipes?mine=true")
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

  const handleIngredientsFromParagraph = (imported: ImportedRecipe) => {
    setExtraIngredients(imported.ingredients)
    setFormKey((k) => k + 1)
    setEditTab("form")
  }

  // Convert Recipe to ImportedRecipe format, merging any pasted ingredients
  const recipeData: ImportedRecipe | undefined = recipe
    ? {
      title: recipe.title || undefined,
      description: recipe.description || undefined,
      image_url: recipe.image_url || undefined,
      prep_time: recipe.prep_time,
      cook_time: recipe.cook_time,
      servings: recipe.servings,
      difficulty: recipe.difficulty,
      cuisine: recipe.cuisine_name || undefined,
      tags: recipe.tags,
      ingredients: extraIngredients.length
        ? [...(recipe.ingredients as any[]), ...extraIngredients]
        : recipe.ingredients,
      instructions: parseInstructionsFromDB(recipe.instructions_list),
      nutrition: recipe.nutrition,
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
    <div className={clsx("min-h-screen transition-colors", pageBackgroundClass)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Edit Recipe</h1>
          <p className="text-muted-foreground">
            {isOwner ? "Update your recipe details" : "Update recipe details"}
          </p>
        </div>

        <Tabs value={editTab} onValueChange={(v) => setEditTab(v as "form" | "paragraph")} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="form" className="flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Edit Recipe
            </TabsTrigger>
            <TabsTrigger value="paragraph" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Paste Ingredients
            </TabsTrigger>
          </TabsList>

          <TabsContent value="form">
            <RecipeManualEntryForm
              key={formKey}
              mode="edit"
              recipeId={recipeId}
              initialData={recipeData}
              onSubmit={handleSubmit}
              onDelete={handleDelete}
              loading={saving}
              deleting={deleting}
            />
          </TabsContent>

          <TabsContent value="paragraph">
            <RecipeImportParagraph onImportSuccess={handleIngredientsFromParagraph} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
