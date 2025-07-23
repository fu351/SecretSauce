"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, Plus, Upload, Clock, Users } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"

export default function UploadRecipe() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [recipe, setRecipe] = useState({
    title: "",
    description: "",
    prep_time: "",
    cook_time: "",
    servings: "",
    difficulty: "Easy",
    cuisine: "",
    image_url: "",
  })

  const [ingredients, setIngredients] = useState<string[]>([""])
  const [instructions, setInstructions] = useState<string[]>([""])
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")

  const addIngredient = () => {
    setIngredients([...ingredients, ""])
  }

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const updateIngredient = (index: number, value: string) => {
    const updated = [...ingredients]
    updated[index] = value
    setIngredients(updated)
  }

  const addInstruction = () => {
    setInstructions([...instructions, ""])
  }

  const removeInstruction = (index: number) => {
    setInstructions(instructions.filter((_, i) => i !== index))
  }

  const updateInstruction = (index: number, value: string) => {
    const updated = [...instructions]
    updated[index] = value
    setInstructions(updated)
  }

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag("")
    }
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setLoading(true)
      const fileExt = file.name.split(".").pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `recipe-images/${fileName}`

      const { error: uploadError } = await supabase.storage.from("recipes").upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      const { data } = supabase.storage.from("recipes").getPublicUrl(filePath)

      setRecipe({ ...recipe, image_url: data.publicUrl })
    } catch (error) {
      console.error("Error uploading image:", error)
      setError("Failed to upload image")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      setError("You must be logged in to upload recipes")
      return
    }

    setLoading(true)
    setError("")

    try {
      // Filter out empty ingredients and instructions
      const filteredIngredients = ingredients.filter((ing) => ing.trim())
      const filteredInstructions = instructions.filter((inst) => inst.trim())

      if (filteredIngredients.length === 0) {
        throw new Error("Please add at least one ingredient")
      }

      if (filteredInstructions.length === 0) {
        throw new Error("Please add at least one instruction")
      }

      const { data, error } = await supabase
        .from("recipes")
        .insert([
          {
            ...recipe,
            ingredients: filteredIngredients,
            instructions: filteredInstructions,
            tags,
            user_id: user.id,
            prep_time: Number.parseInt(recipe.prep_time) || null,
            cook_time: Number.parseInt(recipe.cook_time) || null,
            servings: Number.parseInt(recipe.servings) || null,
          },
        ])
        .select()

      if (error) throw error

      router.push(`/recipes/${data[0].id}`)
    } catch (error: any) {
      console.error("Error uploading recipe:", error)
      setError(error.message || "Failed to upload recipe")
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>You need to be logged in to upload recipes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/auth/signin")} className="w-full">
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Upload New Recipe</h1>
          <p className="text-muted-foreground">Share your favorite recipe with the community</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-8">
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
                  value={recipe.title}
                  onChange={(e) => setRecipe({ ...recipe, title: e.target.value })}
                  placeholder="Enter recipe title"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={recipe.description}
                  onChange={(e) => setRecipe({ ...recipe, description: e.target.value })}
                  placeholder="Brief description of your recipe"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="prep_time">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Prep Time (min)
                  </Label>
                  <Input
                    id="prep_time"
                    type="number"
                    value={recipe.prep_time}
                    onChange={(e) => setRecipe({ ...recipe, prep_time: e.target.value })}
                    placeholder="30"
                  />
                </div>

                <div>
                  <Label htmlFor="cook_time">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Cook Time (min)
                  </Label>
                  <Input
                    id="cook_time"
                    type="number"
                    value={recipe.cook_time}
                    onChange={(e) => setRecipe({ ...recipe, cook_time: e.target.value })}
                    placeholder="45"
                  />
                </div>

                <div>
                  <Label htmlFor="servings">
                    <Users className="w-4 h-4 inline mr-1" />
                    Servings
                  </Label>
                  <Input
                    id="servings"
                    type="number"
                    value={recipe.servings}
                    onChange={(e) => setRecipe({ ...recipe, servings: e.target.value })}
                    placeholder="4"
                  />
                </div>

                <div>
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <select
                    id="difficulty"
                    value={recipe.difficulty}
                    onChange={(e) => setRecipe({ ...recipe, difficulty: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="cuisine">Cuisine Type</Label>
                <Input
                  id="cuisine"
                  value={recipe.cuisine}
                  onChange={(e) => setRecipe({ ...recipe, cuisine: e.target.value })}
                  placeholder="e.g., Italian, Mexican, Asian"
                />
              </div>

              <div>
                <Label htmlFor="image">Recipe Image</Label>
                <div className="mt-2">
                  <Input id="image" type="file" accept="image/*" onChange={handleImageUpload} className="mb-2" />
                  {recipe.image_url && (
                    <img
                      src={recipe.image_url || "/placeholder.svg"}
                      alt="Recipe preview"
                      className="w-32 h-32 object-cover rounded-lg"
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ingredients */}
          <Card>
            <CardHeader>
              <CardTitle>Ingredients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={ingredient}
                      onChange={(e) => updateIngredient(index, e.target.value)}
                      placeholder="e.g., 2 cups flour"
                      className="flex-1"
                    />
                    {ingredients.length > 1 && (
                      <Button type="button" variant="outline" size="icon" onClick={() => removeIngredient(index)}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addIngredient} className="w-full bg-transparent">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Ingredient
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {instructions.map((instruction, index) => (
                  <div key={index} className="flex gap-2">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <Textarea
                      value={instruction}
                      onChange={(e) => updateInstruction(index, e.target.value)}
                      placeholder="Describe this step..."
                      className="flex-1"
                      rows={2}
                    />
                    {instructions.length > 1 && (
                      <Button type="button" variant="outline" size="icon" onClick={() => removeInstruction(index)}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addInstruction} className="w-full bg-transparent">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
              <CardDescription>Add tags to help others find your recipe</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag"
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => removeTag(tag)} />
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-4">
            <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Upload className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Recipe
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
