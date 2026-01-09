"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { RecipeImageUpload } from "./recipe-image-upload"
import { CUISINE_TYPES, DIETARY_TAGS, DIFFICULTY_LEVELS } from "@/lib/types/recipe"

interface RecipeBasicInfoFormProps {
  title: string
  description: string
  prep_time: string
  cook_time: string
  servings: string
  difficulty: string
  cuisine: string
  dietary_tags: string[]
  imageMode: "url" | "file"
  imageUrl: string
  imageFile: File | null
  imagePreview: string
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onPrepTimeChange: (value: string) => void
  onCookTimeChange: (value: string) => void
  onServingsChange: (value: string) => void
  onDifficultyChange: (value: string) => void
  onCuisineChange: (value: string) => void
  onImageModeChange: (mode: "url" | "file") => void
  onImageUrlChange: (url: string) => void
  onImageFileChange: (file: File | null) => void
  onImagePreviewChange: (preview: string) => void
  onDietaryTagToggle: (tag: string) => void
}

export function RecipeBasicInfoForm({
  title,
  description,
  prep_time,
  cook_time,
  servings,
  difficulty,
  cuisine,
  dietary_tags,
  imageMode,
  imageUrl,
  imageFile,
  imagePreview,
  onTitleChange,
  onDescriptionChange,
  onPrepTimeChange,
  onCookTimeChange,
  onServingsChange,
  onDifficultyChange,
  onCuisineChange,
  onImageModeChange,
  onImageUrlChange,
  onImageFileChange,
  onImagePreviewChange,
  onDietaryTagToggle,
}: RecipeBasicInfoFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="title">Recipe Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g., Classic Spaghetti Carbonara"
            required
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Describe your recipe..."
            rows={3}
          />
        </div>

        <RecipeImageUpload
          mode={imageMode}
          imageUrl={imageUrl}
          imageFile={imageFile}
          imagePreview={imagePreview}
          onModeChange={onImageModeChange}
          onUrlChange={onImageUrlChange}
          onFileChange={onImageFileChange}
          onPreviewChange={onImagePreviewChange}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="prep_time">Prep Time (min)</Label>
            <Input
              id="prep_time"
              type="number"
              value={prep_time}
              onChange={(e) => onPrepTimeChange(e.target.value)}
              placeholder="15"
            />
          </div>

          <div>
            <Label htmlFor="cook_time">Cook Time (min)</Label>
            <Input
              id="cook_time"
              type="number"
              value={cook_time}
              onChange={(e) => onCookTimeChange(e.target.value)}
              placeholder="30"
            />
          </div>

          <div>
            <Label htmlFor="servings">Servings</Label>
            <Input
              id="servings"
              type="number"
              value={servings}
              onChange={(e) => onServingsChange(e.target.value)}
              placeholder="4"
            />
          </div>

          <div>
            <Label htmlFor="difficulty">Difficulty</Label>
            <Select value={difficulty} onValueChange={onDifficultyChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTY_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="cuisine">Cuisine Type</Label>
          <Select value={cuisine} onValueChange={onCuisineChange}>
            <SelectTrigger id="cuisine">
              <SelectValue placeholder="Select cuisine type" />
            </SelectTrigger>
            <SelectContent>
              {CUISINE_TYPES.map((cuisineType) => (
                <SelectItem key={cuisineType} value={cuisineType}>
                  {cuisineType.charAt(0).toUpperCase() + cuisineType.slice(1)}
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
                variant={dietary_tags.includes(tag) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => onDietaryTagToggle(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
