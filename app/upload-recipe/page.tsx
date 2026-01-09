"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import clsx from "clsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { useTheme } from "@/contexts/theme-context"
import { supabase } from "@/lib/supabase"
import { uploadRecipeImage } from "@/lib/image-helper"
import { PenLine, Download } from "lucide-react"
import { RecipeManualEntryForm } from "@/components/recipe/forms/recipe-manual-entry-form"
import { RecipeImportTabs } from "@/components/recipe/import/recipe-import-tabs"
import type { ImportedRecipe } from "@/lib/types/recipe-imports"
import type { RecipeSubmissionData } from "@/lib/types/recipe-form"

export default function UploadRecipePage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const [mainTab, setMainTab] = useState<"manual" | "import">("manual")
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<RecipeSubmissionData | null>(null)

  const pageBackgroundClass = isDark ? "bg-background" : "bg-gradient-to-br from-orange-50 to-yellow-50"

  const populateFormFromRecipe = (recipe: ImportedRecipe) => {
    const data: RecipeSubmissionData = {
      title: recipe.title || "",
      description: recipe.description || "",
      image_url: recipe.image_url || null,
      imageFile: null,
      prep_time: recipe.prep_time || 0,
      cook_time: recipe.cook_time || 0,
      servings: recipe.servings || 1,
      difficulty: recipe.difficulty || "beginner",
      cuisine: recipe.cuisine || null,
      dietary_tags: recipe.dietary_tags || [],
      ingredients: (recipe.ingredients as any) || [],
      instructions: (recipe as any).instructions || [],
      nutrition: recipe.nutrition || {},
    }

    setFormData(data)
    setMainTab("manual")
  }

  const standardizeRecipeIngredients = async (recipeId: string, ingredients: any[]) => {
    try {
      const response = await fetch("/api/ingredients/standardize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "recipe",
          recipeId,
          ingredients: ingredients.map((ingredient, index) => ({
            ...ingredient,
            id: index,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to standardize ingredients")
      }

      const payload = await response.json()
      if (payload?.standardized?.length) {
        toast({
          title: "Ingredients standardized",
          description: "Recipe ingredients were mapped to canonical grocery items.",
        })
      }
    } catch (error) {
      console.error("Ingredient standardization failed:", error)
    }
  }

  const handleSubmit = async (submissionData: RecipeSubmissionData) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to upload recipes.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      console.log("Form submission data:", submissionData)
      console.log("Image file:", submissionData.imageFile, "Image URL:", submissionData.image_url)

      let imageValue = null

      // Handle file upload first (priority over URL)
      if (submissionData.imageFile && submissionData.imageFile instanceof File) {
        console.log("Uploading image file:", submissionData.imageFile.name, submissionData.imageFile.size)
        try {
          const storagePath = await uploadRecipeImage(submissionData.imageFile, user.id)
          console.log("Image uploaded successfully, path:", storagePath)
          imageValue = storagePath
        } catch (error: any) {
          console.error("Error uploading image:", error)
          toast({
            title: "Image upload failed",
            description: error.message || "Failed to upload image. Continuing without image.",
            variant: "destructive",
          })
          imageValue = null
        }
      } else if (submissionData.image_url) {
        // Fall back to URL if no file was selected
        console.log("Using image URL:", submissionData.image_url)
        imageValue = submissionData.image_url
      }

      // Look up cuisine ID if cuisine name is provided
      let cuisineId: number | null = null
      if (submissionData.cuisine) {
        const { data: cuisineData, error: cuisineError } = await supabase
          .from("cuisines")
          .select("id")
          .eq("name", submissionData.cuisine)
          .single()

        if (cuisineError) {
          console.warn("Failed to find cuisine:", submissionData.cuisine, cuisineError)
        } else if (cuisineData) {
          cuisineId = cuisineData.id
        }
      }

      const recipeData = {
        title: submissionData.title,
        description: submissionData.description || null,
        image_url: imageValue,
        prep_time: submissionData.prep_time || null,
        cook_time: submissionData.cook_time || null,
        servings: submissionData.servings || null,
        difficulty: submissionData.difficulty,
        cuisine_id: cuisineId,
        tags: submissionData.dietary_tags && submissionData.dietary_tags.length > 0 ? submissionData.dietary_tags : null,
        ingredients: submissionData.ingredients,
        instructions: submissionData.instructions,
        nutrition: submissionData.nutrition && Object.values(submissionData.nutrition).some(v => v !== undefined) ? submissionData.nutrition : null,
        author_id: user.id,
      }

      console.log("Recipe data to insert:", recipeData)

      const { data, error } = await supabase.from("recipes").insert(recipeData).select()

      if (error) {
        console.error("Supabase error:", error)
        throw error
      }

      if (!data || data.length === 0) {
        throw new Error("No data returned from insert")
      }

      console.log("Recipe inserted successfully:", data[0])

      await standardizeRecipeIngredients(data[0].id, recipeData.ingredients)

      toast({
        title: "Recipe uploaded!",
        description: "Your recipe has been successfully uploaded.",
      })

      router.push(`/recipes/${data[0].id}`)
    } catch (error: any) {
      console.error("Error uploading recipe:", error)
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload recipe. Please try again.",
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
            <RecipeImportTabs onImportSuccess={populateFormFromRecipe} />
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
