"use client"

import type React from "react"

import { useEffect, useState, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { uploadRecipeImage, getRecipeImageUrl } from "@/lib/image-helper"
import { Trash2 } from "lucide-react"
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

const DIETARY_TAGS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "keto", "paleo", "low-carb"]
const CUISINE_TYPES = [
  "italian",
  "mexican",
  "chinese",
  "indian",
  "american",
  "french",
  "japanese",
  "thai",
  "mediterranean",
]

interface Ingredient {
  name: string
  amount: string
  unit: string
}

interface Instruction {
  step: number
  description: string
}

export default function EditRecipePage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [imageMode, setImageMode] = useState<"url" | "file">("url")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>("")

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    image_url: "",
    prep_time: "",
    cook_time: "",
    servings: "",
    difficulty: "beginner",
    cuisine_type: "",
    dietary_tags: [] as string[],
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  })

  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: "", amount: "", unit: "" }])
  const [instructions, setInstructions] = useState<Instruction[]>([{ step: 1, description: "" }])

  useEffect(() => {
    if (user && params.id) {
      fetchRecipe()
    }
  }, [user, params.id])

  const fetchRecipe = async () => {
    if (!user || !params.id) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", params.id)
        .eq("author_id", user.id)
        .single()

      if (error) throw error

      if (!data) {
        toast({
          title: "Recipe not found",
          description: "This recipe doesn't exist or you don't have permission to edit it.",
          variant: "destructive",
        })
        router.push("/your-recipes")
        return
      }

      setFormData({
        title: data.title || "",
        description: data.description || "",
        image_url: data.image_url || "",
        prep_time: data.prep_time?.toString() || "",
        cook_time: data.cook_time?.toString() || "",
        servings: data.servings?.toString() || "",
        difficulty: data.difficulty || "beginner",
        cuisine_type: data.cuisine || "",
        dietary_tags: data.dietary_tags || [],
        calories: data.nutrition?.calories?.toString() || "",
        protein: data.nutrition?.protein?.toString() || "",
        carbs: data.nutrition?.carbs?.toString() || "",
        fat: data.nutrition?.fat?.toString() || "",
      })

      setIngredients(data.ingredients || [{ name: "", amount: "", unit: "" }])
      setInstructions(data.instructions || [{ step: 1, description: "" }])

      if (data.image_url) {
        setImagePreview(getRecipeImageUrl(data.image_url))
      }
    } catch (error: any) {
      console.error("Error fetching recipe:", error)
      toast({
        title: "Error",
        description: "Failed to load recipe. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))

    if (field === "image_url" && value) {
      setImagePreview(value)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file.",
          variant: "destructive",
        })
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB.",
          variant: "destructive",
        })
        return
      }

      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview("")
    setFormData((prev) => ({ ...prev, image_url: "" }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const addIngredient = () => {
    setIngredients([...ingredients, { name: "", amount: "", unit: "" }])
  }

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients]
    updated[index][field] = value
    setIngredients(updated)
  }

  const addInstruction = () => {
    setInstructions([...instructions, { step: instructions.length + 1, description: "" }])
  }

  const removeInstruction = (index: number) => {
    const updated = instructions.filter((_, i) => i !== index)
    updated.forEach((inst, i) => {
      inst.step = i + 1
    })
    setInstructions(updated)
  }

  const updateInstruction = (index: number, value: string) => {
    const updated = [...instructions]
    updated[index].description = value
    setInstructions(updated)
  }

  const toggleDietaryTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      dietary_tags: prev.dietary_tags.includes(tag)
        ? prev.dietary_tags.filter((t) => t !== tag)
        : [...prev.dietary_tags, tag],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user || !params.id) return

    if (!formData.title.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a recipe title.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)

    try {
      let imageValue = formData.image_url || null

      if (imageFile && imageMode === "file") {
        try {
          const storagePath = await uploadRecipeImage(imageFile, user.id)
          imageValue = storagePath
        } catch (error: any) {
          console.error("Error uploading image:", error)
          toast({
            title: "Image upload failed",
            description: error.message || "Failed to upload image. Keeping existing image.",
            variant: "destructive",
          })
        }
      }

      const recipeData = {
        title: formData.title,
        description: formData.description,
        image_url: imageValue,
        prep_time: Number.parseInt(formData.prep_time) || 0,
        cook_time: Number.parseInt(formData.cook_time) || 0,
        servings: Number.parseInt(formData.servings) || 1,
        difficulty: formData.difficulty,
        cuisine: formData.cuisine_type || null,
        dietary_tags: formData.dietary_tags,
        ingredients: ingredients.filter((ing) => ing.name.trim()),
        instructions: instructions.filter((inst) => inst.description.trim()),
        nutrition: {
          calories: Number.parseInt(formData.calories) || 0,
          protein: Number.parseInt(formData.protein) || 0,
          carbs: Number.parseInt(formData.carbs) || 0,
          fat: Number.parseInt(formData.fat) || 0,
        },
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from("recipes").update(recipeData).eq("id", params.id).eq("author_id", user.id)

      if (error) throw error

      toast({
        title: "Recipe updated!",
        description: "Your recipe has been successfully updated.",
      })

      router.push(`/recipes/${params.id}`)
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
    if (!user || !params.id) return

    setDeleting(true)

    try {
      const { error } = await supabase.from("recipes").delete().eq("id", params.id).eq("author_id", user.id)

      if (error) throw error

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Edit Recipe</h1>
            <p className="text-muted-foreground">Update your recipe details</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Recipe
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
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                  {deleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Same form structure as upload-recipe page */}
          {/* ... existing code from upload-recipe page ... */}

          <div className="flex gap-4 mt-6">
            <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
