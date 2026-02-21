"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks"
import type { ImportedRecipe } from "@/lib/types"
import type { Instruction } from "@/lib/types/recipe/instruction"
import type { RecipeIngredient } from "@/lib/types/recipe/ingredient"

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

export function RecipeImportParagraph({ onImportSuccess }: RecipeImportParagraphProps) {
  const [text, setText] = useState("")
  const [result, setResult] = useState<ParagraphParseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  const { toast } = useToast()

  // Persists across renders without causing re-renders
  const cacheRef = useRef<Map<string, ParagraphParseResult>>(new Map())
  const lastCallRef = useRef<number>(0)

  // The button is unavailable if: loading, no text, or in cooldown
  const parseDisabled = loading || !text.trim() || cooldown

  const handleParse = async () => {
    const trimmed = text.trim()
    if (!trimmed || loading || cooldown) return

    // Cache hit — resolve instantly, no API call, no cooldown applied
    const cached = cacheRef.current.get(trimmed)
    if (cached) {
      setResult(cached)
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
      setResult(data)

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
    if (!result) return
    onImportSuccess({
      source_type: "manual",
      instructions: result.instructions,
      ingredients: result.ingredients,
      prep_time: result.prep_time,
      cook_time: result.cook_time,
      total_time: result.total_time,
    })
  }

  const hasResults = result
    ? result.instructions.length > 0 || result.ingredients.length > 0
    : false

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
            setResult(null)
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

      {result && (
        <div className="space-y-4">

          {/* ── Instructions ─────────────────────────────────────────────── */}
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Steps
              <span className="ml-2 text-muted-foreground font-normal">({result.instructions.length})</span>
            </p>
            {result.instructions.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-10">#</th>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.instructions.map((instr) => (
                      <tr key={instr.step} className="border-t">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{instr.step}</td>
                        <td className="px-3 py-2">{instr.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No steps extracted.</p>
            )}
          </div>

          {/* ── Ingredients ──────────────────────────────────────────────── */}
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Ingredients
              <span className="ml-2 text-muted-foreground font-normal">({result.ingredients.length})</span>
            </p>
            {result.ingredients.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-16">Qty</th>
                      <th className="text-left px-3 py-2 font-medium w-28">Unit</th>
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.ingredients.map((ing, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 tabular-nums">
                          {ing.quantity ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {ing.unit ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">{ing.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No ingredients extracted.</p>
            )}
          </div>

          {/* ── Times ────────────────────────────────────────────────────── */}
          {(result.prep_time || result.cook_time || result.total_time) && (
            <div className="flex gap-4 text-sm text-muted-foreground">
              {result.prep_time && <span>Prep: {result.prep_time} min</span>}
              {result.cook_time && <span>Cook: {result.cook_time} min</span>}
              {result.total_time && <span>Total: {result.total_time} min</span>}
            </div>
          )}

          {hasResults && (
            <Button onClick={handleUse} className="w-full">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Use This Recipe
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
