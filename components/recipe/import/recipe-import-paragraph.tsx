"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks"
import type { ImportedRecipe, Instruction } from "@/lib/types"
import type { IngredientFormInput } from "@/lib/types/forms"
import type { RecipeIngredient } from "@/lib/types/recipe/ingredient"
import { RecipeIngredientsForm } from "@/components/recipe/forms/recipe-ingredients-form"
import { RecipeInstructionsForm } from "@/components/recipe/forms/recipe-instructions-form"

interface RecipeImportParagraphProps {
  onImportSuccess: (recipe: ImportedRecipe) => void
}

interface ParagraphParseResult {
  instructions: Instruction[]
  ingredients: RecipeIngredient[]
  prep_time?: number
  cook_time?: number
  total_time?: number
  warning?: string
}

// Minimum ms between API calls — cache hits are not subject to this limit
const COOLDOWN_MS = 5000

function toFormIngredient(ing: RecipeIngredient): IngredientFormInput {
  return {
    name: ing.name,
    amount: ing.quantity?.toString() ?? "",
    unit: ing.unit ?? "",
  }
}

export function RecipeImportParagraph({ onImportSuccess }: RecipeImportParagraphProps) {
  const [text, setText] = useState("")
  const [ingredients, setIngredients] = useState<IngredientFormInput[]>([])
  const [instructions, setInstructions] = useState<Instruction[]>([])
  const [times, setTimes] = useState<{ prep_time?: number; cook_time?: number; total_time?: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  const { toast } = useToast()

  const cacheRef = useRef<Map<string, ParagraphParseResult>>(new Map())
  const lastCallRef = useRef<number>(0)

  const hasResults = ingredients.length > 0 || instructions.length > 0
  const parseDisabled = loading || !text.trim() || cooldown

  const applyResult = (data: ParagraphParseResult) => {
    setIngredients(data.ingredients.map(toFormIngredient))
    setInstructions(data.instructions)
    setTimes({
      prep_time: data.prep_time,
      cook_time: data.cook_time,
      total_time: data.total_time,
    })
  }

  const handleParse = async () => {
    const trimmed = text.trim()
    if (!trimmed || loading || cooldown) return

    // Cache hit — resolve instantly, no API call, no cooldown applied
    const cached = cacheRef.current.get(trimmed)
    if (cached) {
      applyResult(cached)
      return
    }

    // Rate-limit guard (belt-and-suspenders in addition to disabled state)
    const now = Date.now()
    if (now - lastCallRef.current < COOLDOWN_MS) return
    lastCallRef.current = now

    setLoading(true)
    setCooldown(true)

    try {
      const res = await fetch("/api/recipe-import/paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      })
      if (!res.ok) throw new Error("Failed to parse recipe")
      const data: ParagraphParseResult = await res.json()

      cacheRef.current.set(trimmed, data)
      applyResult(data)

      if (data.warning) {
        toast({ title: "Low confidence result", description: data.warning })
      }
    } catch {
      toast({ title: "Parse failed", description: "Could not parse recipe text.", variant: "destructive" })
    } finally {
      setLoading(false)
      // Lift cooldown after the window expires from when the call was made
      const elapsed = Date.now() - lastCallRef.current
      const remaining = Math.max(0, COOLDOWN_MS - elapsed)
      setTimeout(() => setCooldown(false), remaining)
    }
  }

  const handleUse = () => {
    onImportSuccess({
      source_type: "manual",
      instructions,
      ingredients: ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.amount ? parseFloat(ing.amount) : undefined,
        unit: ing.unit || undefined,
      })),
      prep_time: times?.prep_time,
      cook_time: times?.cook_time,
      total_time: times?.total_time,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="recipe-paragraph">Paste recipe text</Label>
        <Textarea
          id="recipe-paragraph"
          placeholder={
            "Paste a full recipe — ingredient lists, paragraphs, or step-by-step instructions.\n\nExample:\n  2 cups all-purpose flour, 1 tsp baking powder, pinch of salt.\n  Mix dry ingredients. Add 1 cup milk and 2 eggs, stir until combined.\n  Pour into a greased pan and bake at 350°F for 30 minutes."
          }
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setIngredients([])
            setInstructions([])
            setTimes(null)
          }}
          rows={9}
          className="mt-1 font-mono text-sm"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Ingredients and step-by-step instructions are extracted automatically using AI.
        </p>
      </div>

      <Button onClick={handleParse} disabled={parseDisabled}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Parsing...
          </>
        ) : cooldown ? (
          "Please wait..."
        ) : (
          "Parse Recipe"
        )}
      </Button>

      {hasResults && (
        <div className="space-y-4">
          {times && (times.prep_time || times.cook_time || times.total_time) && (
            <div className="flex gap-4 text-sm text-muted-foreground">
              {times.prep_time && <span>Prep: {times.prep_time} min</span>}
              {times.cook_time && <span>Cook: {times.cook_time} min</span>}
              {times.total_time && <span>Total: {times.total_time} min</span>}
            </div>
          )}

          <RecipeInstructionsForm instructions={instructions} onChange={setInstructions} />
          <RecipeIngredientsForm ingredients={ingredients} showAmountAndUnit onChange={setIngredients} />

          <Button onClick={handleUse} className="w-full">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Use This Recipe
          </Button>
        </div>
      )}
    </div>
  )
}
