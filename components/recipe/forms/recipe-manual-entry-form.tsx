"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Trash2 } from "lucide-react"
import { RecipeBasicInfoPanel } from "./recipe-basic-info-panel"
import { RecipeImageUpload } from "./recipe-image-upload"
import { RecipeIngredientsForm } from "./recipe-ingredients-form"
import { RecipeInstructionsForm } from "./recipe-instructions-form"
import { RecipeNutritionForm } from "./recipe-nutrition-form"
import type { IngredientFormInput, NutritionFormInput, RecipeSubmissionData } from "@/lib/types/recipe-form"
import type { Instruction, ImportedRecipe } from "@/lib/types/recipe"

interface RecipeManualEntryFormProps {
  onSubmit: (data: RecipeSubmissionData) => Promise<void>
  loading: boolean
  initialData?: ImportedRecipe
  mode?: "create" | "edit"
  recipeId?: string
  onDelete?: () => Promise<void>
  deleting?: boolean
}

export function RecipeManualEntryForm({
  onSubmit,
  loading,
  initialData,
  mode = "create",
  recipeId,
  onDelete,
  deleting = false,
}: RecipeManualEntryFormProps) {
  const router = useRouter()
  const { toast } = useToast()

  // Basic info state
  const [title, setTitle] = useState(initialData?.title || "")
  const [description, setDescription] = useState(initialData?.description || "")
  const [prep_time, setPrep_time] = useState((initialData?.prep_time || "").toString())
  const [cook_time, setCook_time] = useState((initialData?.cook_time || "").toString())
  const [servings, setServings] = useState((initialData?.servings || "").toString())
  const [difficulty, setDifficulty] = useState(initialData?.difficulty || "beginner")
  const [cuisine, setCuisine] = useState(initialData?.cuisine || "")
  const [dietary_tags, setDietary_tags] = useState<string[]>(initialData?.dietary_tags || [])

  // Image state
  const [imageMode, setImageMode] = useState<"url" | "file">(
    initialData?.image_url ? "url" : "file"
  )
  const [imageUrl, setImageUrl] = useState(initialData?.image_url || "")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState(initialData?.image_url || "")

  // Ingredients state
  const [ingredients, setIngredients] = useState<IngredientFormInput[]>(
    initialData?.ingredients?.length
      ? initialData.ingredients.map((ing) => ({
          name: ing.name,
          amount: ing.quantity?.toString() || "",
          unit: ing.unit || "",
          standardizedIngredientId: ing.standardizedIngredientId,
          standardizedName: ing.standardizedName,
        }))
      : [{ name: "", amount: "", unit: "" }]
  )

  // Instructions state
  const [instructions, setInstructions] = useState<Instruction[]>(
    initialData?.instructions?.length
      ? initialData.instructions
      : [{ step: 1, description: "" }]
  )

  // Nutrition state
  const [nutrition, setNutrition] = useState<NutritionFormInput>({
    calories: initialData?.nutrition?.calories?.toString() || "",
    protein: initialData?.nutrition?.protein?.toString() || "",
    carbs: initialData?.nutrition?.carbs?.toString() || "",
    fat: initialData?.nutrition?.fat?.toString() || "",
  })

  const handleNutritionChange = (field: string, value: string) => {
    setNutrition((prev) => ({ ...prev, [field]: value }))
  }

  const toggleDietaryTag = (tag: string) => {
    setDietary_tags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!title.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a recipe title.",
        variant: "destructive",
      })
      return
    }

    const validIngredients = ingredients.filter((ing) => ing.name.trim())
    if (validIngredients.length === 0) {
      toast({
        title: "Missing information",
        description: "Please add at least one ingredient.",
        variant: "destructive",
      })
      return
    }

    const validInstructions = instructions.filter((inst) => inst.description.trim())
    if (validInstructions.length === 0) {
      toast({
        title: "Missing information",
        description: "Please add at least one instruction step.",
        variant: "destructive",
      })
      return
    }

    // Convert string inputs to numbers for submission
    const parsePrepTime = prep_time.trim() ? Number.parseInt(prep_time) : null
    const parseCookTime = cook_time.trim() ? Number.parseInt(cook_time) : null
    const parseServings = servings.trim() ? Number.parseInt(servings) : 1

    console.log("Form state before submission:", {
      imageMode,
      imageUrl,
      imageFile: imageFile?.name || null,
      parsePrepTime,
      parseCookTime,
      parseServings,
    })

    const submissionData: RecipeSubmissionData = {
      title,
      description,
      image_url: imageUrl || null,
      imageFile: imageFile,
      prep_time: parsePrepTime !== null ? parsePrepTime : 0,
      cook_time: parseCookTime !== null ? parseCookTime : 0,
      servings: parseServings !== null ? parseServings : 1,
      difficulty,
      cuisine: cuisine || null,
      dietary_tags,
      ingredients: validIngredients.map((ing) => ({
        name: ing.name,
        quantity: ing.amount ? parseFloat(ing.amount) : undefined,
        unit: ing.unit || undefined,
        standardizedIngredientId: ing.standardizedIngredientId,
        standardizedName: ing.standardizedName,
      })),
      instructions: validInstructions.map((inst, i) => ({
        step: i + 1,
        description: inst.description,
      })),
      nutrition: {
        calories: nutrition.calories ? parseInt(nutrition.calories) : undefined,
        protein: nutrition.protein ? parseInt(nutrition.protein) : undefined,
        carbs: nutrition.carbs ? parseInt(nutrition.carbs) : undefined,
        fat: nutrition.fat ? parseInt(nutrition.fat) : undefined,
      },
    }

    await onSubmit(submissionData)
  }

  return (
    <form onSubmit={handleSubmit} className="h-full">
      <div className="space-y-8 h-full">
        {/* Hero Section: Image + Basic Info Panel */}
        <div className="flex flex-col lg:flex-row gap-8 items-stretch h-[600px]">
          {/* Left: Image Upload (3/5 width) */}
          <div className="lg:w-3/5 w-full">
            <RecipeImageUpload
              mode={imageMode}
              imageUrl={imageUrl}
              imageFile={imageFile}
              imagePreview={imagePreview}
              onModeChange={setImageMode}
              onUrlChange={setImageUrl}
              onFileChange={setImageFile}
              onPreviewChange={setImagePreview}
            />
          </div>

          {/* Right: Basic Info Panel (2/5 width) */}
          <div className="lg:w-2/5 w-full">
            <RecipeBasicInfoPanel
              title={title}
              description={description}
              prep_time={prep_time}
              cook_time={cook_time}
              servings={servings}
              difficulty={difficulty}
              cuisine={cuisine}
              dietary_tags={dietary_tags}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
              onPrepTimeChange={setPrep_time}
              onCookTimeChange={setCook_time}
              onServingsChange={setServings}
              onDifficultyChange={setDifficulty}
              onCuisineChange={setCuisine}
              onDietaryTagToggle={toggleDietaryTag}
            />
          </div>
        </div>

        {/* Ingredients Section */}
        <RecipeIngredientsForm ingredients={ingredients} onChange={setIngredients} />

        {/* Instructions Section */}
        <RecipeInstructionsForm instructions={instructions} onChange={setInstructions} />

        {/* Nutrition Section */}
        <RecipeNutritionForm nutrition={nutrition} onChange={handleNutritionChange} />

        {/* Submit Buttons */}
        <div className="flex gap-4">
          {mode === "edit" && onDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your recipe.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">
                    {deleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? (mode === "edit" ? "Saving..." : "Uploading...") : (mode === "edit" ? "Save Changes" : "Save Recipe")}
          </Button>
        </div>
      </div>
    </form>
  )
}
