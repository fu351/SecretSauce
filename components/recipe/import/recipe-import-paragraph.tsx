"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks"
import type { ImportedRecipe } from "@/lib/types"
import type { ParsedIngredientRow } from "@/lib/ingredient-parser"

interface RecipeImportParagraphProps {
  onImportSuccess: (recipe: ImportedRecipe) => void
}

interface ParseResult {
  parsed: ParsedIngredientRow[]      // quantity or unit detected
  conjunction: ParsedIngredientRow[] // name-only but contains "and" — may be multiple ingredients
  nameOnly: ParsedIngredientRow[]    // name-only, no conjunction
}

function categorize(rows: ParsedIngredientRow[]): ParseResult {
  const parsed: ParsedIngredientRow[] = []
  const conjunction: ParsedIngredientRow[] = []
  const nameOnly: ParsedIngredientRow[] = []

  for (const row of rows) {
    if (!row.name) continue
    if (row.quantity !== null || row.unit !== null) {
      parsed.push(row)
    } else if (/\band\b/i.test(row.name)) {
      conjunction.push(row)
    } else {
      nameOnly.push(row)
    }
  }

  return { parsed, conjunction, nameOnly }
}

export function RecipeImportParagraph({ onImportSuccess }: RecipeImportParagraphProps) {
  const [text, setText] = useState("")
  const [result, setResult] = useState<ParseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleParse = async () => {
    if (!text.trim()) return
    setLoading(true)
    try {
      const res = await fetch("/api/ingredients/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error("Failed to parse ingredients")
      const data = await res.json()
      setResult(categorize(data.rows))
    } catch {
      toast({ title: "Parse failed", description: "Could not parse ingredients.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleUse = () => {
    if (!result) return
    const all = [...result.parsed, ...result.conjunction, ...result.nameOnly]
    const ingredients = all.map((r) => ({
      name: r.name,
      quantity: r.quantity ?? undefined,
      unit: r.unit ?? undefined,
    }))
    onImportSuccess({ source_type: "manual", ingredients })
  }

  const totalCount = result
    ? result.parsed.length + result.conjunction.length + result.nameOnly.length
    : 0

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="ingredient-paragraph">Recipe instructions or ingredient list</Label>
        <Textarea
          id="ingredient-paragraph"
          placeholder={
            "Paste a structured list or full recipe instructions — quantities and units are extracted automatically.\n\nExamples:\n  2 cups all-purpose flour\n  1 tsp baking powder\n\nOr instructions:\n  Heat a skillet over medium heat. Add 2 tablespoons butter and 1 tablespoon oil."
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
          Section headers, step numbers, and instruction-only sentences are filtered out automatically.
        </p>
      </div>

      <Button onClick={handleParse} disabled={loading || !text.trim()}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Extracting...
          </>
        ) : (
          "Extract Ingredients"
        )}
      </Button>

      {result && (
        <div className="space-y-4">

          {/* ── Parsed with quantity / unit ─────────────────────────────── */}
          {result.parsed.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Parsed with quantity / unit
                <span className="ml-2 text-muted-foreground font-normal">({result.parsed.length})</span>
              </p>
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
                    {result.parsed.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 tabular-nums">{row.quantity}</td>
                        <td className="px-3 py-2">{row.unit ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2">{row.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Conjunction queue — may be multiple ingredients ─────────── */}
          {result.conjunction.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                May contain multiple ingredients
                <span className="ml-2 font-normal text-muted-foreground">({result.conjunction.length})</span>
              </p>
              <p className="text-xs text-muted-foreground">
                These contain "and" with no quantity — they will be queued for review after saving.
              </p>
              <div className="rounded-md border border-amber-200 dark:border-amber-800 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {result.conjunction.map((row, i) => (
                      <tr key={i} className={i > 0 ? "border-t" : ""}>
                        <td className="px-3 py-2">{row.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Name only ───────────────────────────────────────────────── */}
          {result.nameOnly.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Name only — no quantity or unit detected
                <span className="ml-2 font-normal">({result.nameOnly.length})</span>
              </p>
              <div className="rounded-md border border-dashed overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {result.nameOnly.map((row, i) => (
                      <tr key={i} className={i > 0 ? "border-t" : ""}>
                        <td className="px-3 py-2 text-muted-foreground">{row.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {totalCount === 0 && (
            <p className="text-sm text-muted-foreground">
              No ingredients detected. Try formatting as one ingredient per line.
            </p>
          )}

          {totalCount > 0 && (
            <Button onClick={handleUse} className="w-full">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Use These Ingredients
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
