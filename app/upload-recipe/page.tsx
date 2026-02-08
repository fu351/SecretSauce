"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import clsx from "clsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import { useTheme } from "@/contexts/theme-context"
import { useStandardizeRecipeIngredients } from "@/hooks"
import { recipeDB } from "@/lib/database/recipe-db"
import { uploadRecipeImage } from "@/lib/image-helper"
import { PenLine, Download } from "lucide-react"
import { RecipeManualEntryForm } from "@/components/recipe/forms/recipe-manual-entry-form"
import { RecipeImportTabs } from "@/components/recipe/import/recipe-import-tabs"
import type { ImportedRecipe, RecipeSubmissionData } from "@/lib/types"

export default function UploadRecipePage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const { mutateAsync: standardizeRecipeIngredients } = useStandardizeRecipeIngredients()

  const searchParams = useSearchParams()
  const [mainTab, setMainTab] = useState<"manual" | "import">("manual")
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<RecipeSubmissionData | null>(null)

  const shareImport = searchParams.get("import")
  const shareUrl = searchParams.get("url") ?? ""

  useEffect(() => {
    if (shareImport === "instagram" && shareUrl.trim()) {
      setMainTab("import")
    }
  }, [shareImport, shareUrl])

  const pageBackgroundClass = isDark ? "bg-background" : "bg-gradient-to-br from-orange-50 to-yellow-50"

  const populateFormFromRecipe = (recipe: ImportedRecipe) => {
    const data: RecipeSubmissionData = {
      title: recipe.title || "",
      description: recipe.description || "",
      image_url: recipe.image_url || null,
      imageFile: null,
      prep_time: recipe.prep_time || 15,
      cook_time: recipe.cook_time || 30,
      servings: recipe.servings || 1,
      difficulty: recipe.difficulty || "beginner",
      cuisine: recipe.cuisine || null,
      tags: recipe.tags || [],
      ingredients: (recipe.ingredients as any) || [],
      instructions: (recipe as any).instructions || [],
      nutrition: recipe.nutrition || {},
    }

    setFormData(data)
    setMainTab("manual")
  }

  const handleSubmit = async (submissionData: RecipeSubmissionData) => {
    if (!user) {
      toast({ title: "Authentication required", description: "Please sign in.", variant: "destructive" })
      return
    }

    setLoading(true)

    try {
      let imageValue = submissionData.image_url || null

      // 1. Handle Image Upload
      if (submissionData.imageFile instanceof File) {
        try {
          imageValue = await uploadRecipeImage(submissionData.imageFile, user.id)
        } catch (error: any) {
          toast({ title: "Image upload failed", description: "Continuing without image.", variant: "destructive" })
        }
      }

      const instructionSteps = submissionData.instructions
        .map((step) => step.description?.trim())
        .filter(Boolean)

      const newRecipe = await recipeDB.upsertRecipeWithIngredients({
        title: submissionData.title,
        authorId: user.id,
        cuisine: submissionData.cuisine,
        difficulty: submissionData.difficulty,
        servings: submissionData.servings,
        prepTime: submissionData.prep_time,
        cookTime: submissionData.cook_time,
        tags: submissionData.tags || [],
        nutrition: submissionData.nutrition,
        description: submissionData.description,
        imageUrl: imageValue,
        instructions: instructionSteps,
        ingredients: submissionData.ingredients,
      })

      if (!newRecipe) throw new Error("Failed to create recipe record")

      // 4. Trigger background standardization
      if (submissionData.ingredients?.length) {
        try {
          await standardizeRecipeIngredients({
            recipeId: newRecipe.id,
            ingredients: submissionData.ingredients,
          })
        } catch (error) {
          console.error("[UploadPage] Ingredient standardization failed:", error)
          toast({
            title: "Partial upload",
            description: "Recipe saved but ingredient mapping failed. Please retry the standardization step in recipe settings.",
            variant: "destructive",
          })
        }
      }

      toast({ title: "Recipe uploaded!", description: "Your recipe is now live." })
      router.push(`/recipes/${newRecipe.id}`)
      
    } catch (error: any) {
      console.error("[UploadPage] Submit error:", error)
      toast({
        title: "Upload failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={clsx("min-h-screen transition-colors", pageBackgroundClass)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Add Recipe</h1>
          <p className="text-muted-foreground">Create a new recipe manually or import from a URL</p>
        </div>

        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "manual" | "import")} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Manual Entry
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Import Recipe
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-12">
            <RecipeImportTabs
              onImportSuccess={populateFormFromRecipe}
              initialImportTab={shareImport === "instagram" ? "instagram" : undefined}
              initialInstagramUrl={shareImport === "instagram" && shareUrl.trim() ? shareUrl.trim() : undefined}
            />
          </TabsContent>

          <TabsContent value="manual" className="space-y-12">
            <RecipeManualEntryForm
              onSubmit={handleSubmit}
              loading={loading}
              initialData={formData as any}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
