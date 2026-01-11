"use client"

import clsx from "clsx"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Clock, Users, BarChart3 } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import { CUISINE_TYPES, DIFFICULTY_LEVELS, DietaryTag } from "@/lib/types"
import { DietaryTagSelector } from "@/components/recipe/tags/dietary-tag-selector"

interface RecipeBasicInfoPanelProps {
  title: string
  description: string
  prep_time: string
  cook_time: string
  servings: string
  difficulty: string
  cuisine: string
  dietary_tags: string[]
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onPrepTimeChange: (value: string) => void
  onCookTimeChange: (value: string) => void
  onServingsChange: (value: string) => void
  onDifficultyChange: (value: string) => void
  onCuisineChange: (value: string) => void
  onDietaryTagToggle: (tags: DietaryTag[]) => void
}

export function RecipeBasicInfoPanel({
  title,
  description,
  prep_time,
  cook_time,
  servings,
  difficulty,
  cuisine,
  dietary_tags,
  onTitleChange,
  onDescriptionChange,
  onPrepTimeChange,
  onCookTimeChange,
  onServingsChange,
  onDifficultyChange,
  onCuisineChange,
  onDietaryTagToggle,
}: RecipeBasicInfoPanelProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const infoPanelClass = clsx(
    "shadow-lg rounded-2xl border",
    isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0"
  )

  const statCardClass = clsx(
    "flex items-center gap-3 p-4 rounded-lg shadow-sm border transition-colors",
    isDark ? "bg-secondary/70 border-border text-foreground" : "bg-white/80 backdrop-blur-sm border-white/50"
  )

  const statIconClass = isDark ? "text-primary" : "text-gray-400"
  const statLabelClass = isDark ? "text-muted-foreground" : "text-gray-500"

  return (
    <Card className={clsx(infoPanelClass, "h-full flex flex-col")}>
      <CardContent className="p-6 space-y-4 flex-1 overflow-hidden">
        {/* Title */}
        <div>
          <Label htmlFor="panel-title">Recipe Title *</Label>
          <Input
            id="panel-title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g., Classic Spaghetti Carbonara"
            className="mt-2"
            required
          />
        </div>

        {/* Description */}
        <div>
          <Label htmlFor="panel-description">Description</Label>
          <Textarea
            id="panel-description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Describe your recipe..."
            rows={2}
            className="mt-1"
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Prep Time */}
          <div className={statCardClass}>
            <Clock className={clsx("h-5 w-5", statIconClass)} />
            <div className="flex-1 min-w-0">
              <p className={clsx("text-xs", statLabelClass)}>Prep</p>
              <Input
                type="number"
                value={prep_time}
                onChange={(e) => onPrepTimeChange(e.target.value)}
                placeholder="15"
                className="h-6 text-xs border-0 bg-transparent p-0"
              />
            </div>
            <span className="text-xs text-muted-foreground">min</span>
          </div>

          {/* Cook Time */}
          <div className={statCardClass}>
            <Clock className={clsx("h-5 w-5", statIconClass)} />
            <div className="flex-1 min-w-0">
              <p className={clsx("text-xs", statLabelClass)}>Cook</p>
              <Input
                type="number"
                value={cook_time}
                onChange={(e) => onCookTimeChange(e.target.value)}
                placeholder="30"
                className="h-6 text-xs border-0 bg-transparent p-0"
              />
            </div>
            <span className="text-xs text-muted-foreground">min</span>
          </div>

          {/* Servings */}
          <div className={statCardClass}>
            <Users className={clsx("h-5 w-5", statIconClass)} />
            <div className="flex-1 min-w-0">
              <p className={clsx("text-xs", statLabelClass)}>Servings</p>
              <Input
                type="number"
                value={servings}
                onChange={(e) => onServingsChange(e.target.value)}
                placeholder="4"
                className="h-6 text-xs border-0 bg-transparent p-0"
              />
            </div>
          </div>

          {/* Difficulty */}
          <div className={statCardClass}>
            <BarChart3 className={clsx("h-5 w-5", statIconClass)} />
            <div className="flex-1 min-w-0">
              <p className={clsx("text-xs", statLabelClass)}>Difficulty</p>
              <Select value={difficulty} onValueChange={onDifficultyChange}>
                <SelectTrigger className="h-6 border-0 bg-transparent p-0 text-xs">
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
        </div>

        {/* Cuisine Type */}
        <div>
          <Label htmlFor="panel-cuisine" className="text-sm">Cuisine Type</Label>
          <Select value={cuisine} onValueChange={onCuisineChange}>
            <SelectTrigger id="panel-cuisine" className="mt-1">
              <SelectValue placeholder="Select cuisine" />
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

        {/* Dietary Tags - Using new DietaryTagSelector component */}
        <DietaryTagSelector
          selectedTags={dietary_tags as DietaryTag[]}
          onChange={onDietaryTagToggle}
          mode="edit"
        />
      </CardContent>
    </Card>
  )
}
