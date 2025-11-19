"use client"

import type React from "react"

import { useEffect, useState, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { uploadRecipeImage, getRecipeImageUrl } from "@/lib/image-helper"
import { Trash2, Plus, X, Upload, LinkIcon } from "lucide-react"
import Image from "next/image"
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
  standardizedIngredientId?: string
  standardizedName?: string
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
    cuisine: "",
    dietary_tags: [] as string[],
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  })

  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: "", amount: "", unit: "" }])
  const [instructions, setInstructions] = useState<Instruction[]>([{ step: 1, description: "" }])

  const standardizeRecipeIngredients = async (recipeId: string, recipeIngredients: Ingredient[]) => {
    try {
      const response = await fetch("/api/ingredients/standardize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "recipe",
          recipeId,
          ingredients: recipeIngredients.map((ingredient, index) => ({
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
      toast({
        title: "Standardization skipped",
        description: "We couldn't standardize the ingredients automatically.",
      })
    }
  }

  useEffect(() => {
    if (user && params.id) {
      fetchRecipe()
    }
  }, [user, params.id])

  const fetchRecipe = async () => {
    const recipeId = Array.isArray(params.id) ? params.id[0] : params.id
    if (!user || !recipeId) return

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
        cuisine: data.cuisine || "",
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
        cuisine: formData.cuisine || null,
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

      const { error } = await supabase.from("recipes").update(recipeData).eq("id", recipeId).eq("author_id", user.id)

      if (error) throw error

      await standardizeRecipeIngredients(recipeId, recipeData.ingredients)

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
          <div className="space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Recipe Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleInputChange("title", e.target.value)}
                    placeholder="e.g., Classic Spaghetti Carbonara"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange("description", e.target.value)}
                    placeholder="Describe your recipe..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Recipe Image</Label>
                  <div className="flex gap-2 mt-2 mb-3">
                    <Button
                      type="button"
                      variant={imageMode === "url" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setImageMode("url")
                        clearImage()
                      }}
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Image URL
                    </Button>
                    <Button
                      type="button"
                      variant={imageMode === "file" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setImageMode("file")
                        setFormData((prev) => ({ ...prev, image_url: "" }))
                      }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload File
                    </Button>
                  </div>

                  {imageMode === "url" ? (
                    <Input
                      id="image_url"
                      value={formData.image_url}
                      onChange={(e) => handleInputChange("image_url", e.target.value)}
                      placeholder="https://example.com/image.jpg"
                    />
                  ) : (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full bg-transparent"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {imageFile ? imageFile.name : "Choose an image file"}
                      </Button>
                      {imageFile && (
                        <p className="text-sm text-gray-500 mt-2">{(imageFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      )}
                    </div>
                  )}

                  {imagePreview && (
                    <div className="mt-3 relative">
                      <div className="relative w-full h-48 rounded-lg overflow-hidden bg-gray-100">
                        <Image
                          src={imagePreview || "/placeholder.svg"}
                          alt="Recipe preview"
                          fill
                          className="object-cover"
                        />
                      </div>
                      <Button type="button" variant="destructive" size="sm" className="mt-2" onClick={clearImage}>
                        <X className="h-4 w-4 mr-2" />
                        Remove Image
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="prep_time">Prep Time (min)</Label>
                    <Input
                      id="prep_time"
                      type="number"
                      value={formData.prep_time}
                      onChange={(e) => handleInputChange("prep_time", e.target.value)}
                      placeholder="15"
                    />
                  </div>

                  <div>
                    <Label htmlFor="cook_time">Cook Time (min)</Label>
                    <Input
                      id="cook_time"
                      type="number"
                      value={formData.cook_time}
                      onChange={(e) => handleInputChange("cook_time", e.target.value)}
                      placeholder="30"
                    />
                  </div>

                  <div>
                    <Label htmlFor="servings">Servings</Label>
                    <Input
                      id="servings"
                      type="number"
                      value={formData.servings}
                      onChange={(e) => handleInputChange("servings", e.target.value)}
                      placeholder="4"
                    />
                  </div>

                  <div>
                    <Label htmlFor="difficulty">Difficulty</Label>
                    <Select
                      value={formData.difficulty}
                      onValueChange={(value) => handleInputChange("difficulty", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="cuisine">Cuisine Type</Label>
                  <Select value={formData.cuisine} onValueChange={(value) => handleInputChange("cuisine", value)}>
                    <SelectTrigger id="cuisine">
                      <SelectValue placeholder="Select cuisine type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CUISINE_TYPES.map((cuisine) => (
                        <SelectItem key={cuisine} value={cuisine}>
                          {cuisine.charAt(0).toUpperCase() + cuisine.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Dietary Tags</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {DIETARY_TAGS.map((tag) => (
                      <Badge
                        key={tag}
                        variant={formData.dietary_tags.includes(tag) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleDietaryTag(tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ingredients */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Ingredients</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Ingredient
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="Ingredient name"
                      value={ingredient.name}
                      onChange={(e) => updateIngredient(index, "name", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Amount"
                      value={ingredient.amount}
                      onChange={(e) => updateIngredient(index, "amount", e.target.value)}
                      className="w-24"
                    />
                    <Input
                      placeholder="Unit"
                      value={ingredient.unit}
                      onChange={(e) => updateIngredient(index, "unit", e.target.value)}
                      className="w-24"
                    />
                    {ingredients.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeIngredient(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Instructions</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addInstruction}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Step
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {instructions.map((instruction, index) => (
                  <div key={index} className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 mt-1">
                      {instruction.step}
                    </div>
                    <Textarea
                      placeholder="Describe this step..."
                      value={instruction.description}
                      onChange={(e) => updateInstruction(index, e.target.value)}
                      rows={2}
                      className="flex-1"
                    />
                    {instructions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeInstruction(index)}
                        className="mt-1"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Nutrition (Optional) */}
            <Card>
              <CardHeader>
                <CardTitle>Nutrition Information (Optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="calories">Calories</Label>
                    <Input
                      id="calories"
                      type="number"
                      value={formData.calories}
                      onChange={(e) => handleInputChange("calories", e.target.value)}
                      placeholder="250"
                    />
                  </div>

                  <div>
                    <Label htmlFor="protein">Protein (g)</Label>
                    <Input
                      id="protein"
                      type="number"
                      value={formData.protein}
                      onChange={(e) => handleInputChange("protein", e.target.value)}
                      placeholder="15"
                    />
                  </div>

                  <div>
                    <Label htmlFor="carbs">Carbs (g)</Label>
                    <Input
                      id="carbs"
                      type="number"
                      value={formData.carbs}
                      onChange={(e) => handleInputChange("carbs", e.target.value)}
                      placeholder="30"
                    />
                  </div>

                  <div>
                    <Label htmlFor="fat">Fat (g)</Label>
                    <Input
                      id="fat"
                      type="number"
                      value={formData.fat}
                      onChange={(e) => handleInputChange("fat", e.target.value)}
                      placeholder="10"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <div className="flex gap-4">
              <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
