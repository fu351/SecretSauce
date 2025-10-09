"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { Plus, X } from "lucide-react"

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

export default function UploadRecipePage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
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

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
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

    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to upload recipes.",
        variant: "destructive",
      })
      return
    }

    // Validation
    if (!formData.title.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a recipe title.",
        variant: "destructive",
      })
      return
    }

    if (ingredients.some((ing) => !ing.name.trim())) {
      toast({
        title: "Missing information",
        description: "Please fill in all ingredient names.",
        variant: "destructive",
      })
      return
    }

    if (instructions.some((inst) => !inst.description.trim())) {
      toast({
        title: "Missing information",
        description: "Please fill in all instruction steps.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const recipeData = {
        title: formData.title,
        description: formData.description,
        image_url: formData.image_url || null,
        prep_time: Number.parseInt(formData.prep_time) || 0,
        cook_time: Number.parseInt(formData.cook_time) || 0,
        servings: Number.parseInt(formData.servings) || 1,
        difficulty: formData.difficulty,
        cuisine_type: formData.cuisine_type || null,
        dietary_tags: formData.dietary_tags,
        ingredients: ingredients.filter((ing) => ing.name.trim()),
        instructions: instructions.filter((inst) => inst.description.trim()),
        nutrition: {
          calories: Number.parseInt(formData.calories) || 0,
          protein: Number.parseInt(formData.protein) || 0,
          carbs: Number.parseInt(formData.carbs) || 0,
          fat: Number.parseInt(formData.fat) || 0,
        },
        author_id: user.id,
      }

      const { data, error } = await supabase.from("recipes").insert(recipeData).select().single()

      if (error) throw error

      toast({
        title: "Recipe uploaded!",
        description: "Your recipe has been successfully uploaded.",
      })

      router.push(`/recipes/${data.id}`)
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Recipe</h1>
          <p className="text-gray-600">Share your delicious recipe with the community</p>
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
                  <Label htmlFor="image_url">Image URL</Label>
                  <Input
                    id="image_url"
                    value={formData.image_url}
                    onChange={(e) => handleInputChange("image_url", e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
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
                  <Label htmlFor="cuisine_type">Cuisine Type</Label>
                  <Select
                    value={formData.cuisine_type}
                    onValueChange={(value) => handleInputChange("cuisine_type", value)}
                  >
                    <SelectTrigger>
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
                    <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center flex-shrink-0 mt-1">
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
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Uploading..." : "Upload Recipe"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
