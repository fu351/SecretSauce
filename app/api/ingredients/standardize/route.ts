import { NextRequest, NextResponse } from "next/server"
import { standardizeIngredientsWithAI } from "@/lib/ingredient-standardizer"
import {
  batchGetOrCreateStandardizedIngredients,
  batchMapIngredientsToStandardized,
} from "@/lib/ingredient-cache"
import { createServerClient } from "@/lib/supabase"

interface RequestIngredient {
  id?: string | number
  name: string
  amount?: string
  unit?: string
  quantity?: string | number
}

interface NormalizedIngredientInput {
  id: string
  name: string
  amount?: string
  unit?: string
  originalIndex: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      context = "recipe",
      recipeId,
      pantryItemId,
      userId,
      ingredients,
    }: {
      context?: "recipe" | "pantry"
      recipeId?: string
      pantryItemId?: string
      userId?: string
      ingredients: RequestIngredient[]
    } = body

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ error: "No ingredients supplied" }, { status: 400 })
    }

    if (context === "recipe" && !recipeId) {
      return NextResponse.json({ error: "recipeId is required" }, { status: 400 })
    }

    if (context === "pantry" && (!pantryItemId || !userId)) {
      return NextResponse.json({ error: "pantryItemId and userId are required" }, { status: 400 })
    }

    const normalizedInputs: NormalizedIngredientInput[] = ingredients
      .map((ingredient, index) => {
        const trimmedName = ingredient.name?.trim()
        if (!trimmedName) return null

        return {
          id: String(ingredient.id ?? index),
          name: trimmedName,
          amount: ingredient.amount ?? String(ingredient.quantity ?? ""),
          unit: ingredient.unit ?? "",
          originalIndex: index,
        }
      })
      .filter((input): input is NormalizedIngredientInput => input !== null)

    if (normalizedInputs.length === 0) {
      return NextResponse.json({ error: "All ingredients were blank" }, { status: 400 })
    }

    const aiResults = await standardizeIngredientsWithAI(normalizedInputs, context)
    const client = createServerClient()

    // OPTIMIZED: Batch create all standardized ingredients in one query
    const standardizedItems = aiResults.map(result => ({
      canonicalName: result.canonicalName,
      category: result.category || null,
    }))

    const standardizedIdMap = await batchGetOrCreateStandardizedIngredients(standardizedItems)

    const updates: Array<{
      id: string
      originalName: string
      canonicalName: string
      category?: string | null
      standardizedIngredientId: string
      confidence: number
      originalIndex: number
    }> = []

    const mappingsToCreate: Array<{ originalName: string; standardizedIngredientId: string }> = []

    for (const result of aiResults) {
      const target = normalizedInputs.find((input) => input.id === result.id) || normalizedInputs[0]
      const normalizedCanonical = result.canonicalName.trim().toLowerCase()
      const standardizedId = standardizedIdMap.get(normalizedCanonical)
      if (!standardizedId) continue

      const payload = {
        id: result.id,
        originalName: result.originalName,
        canonicalName: result.canonicalName,
        category: result.category,
        standardizedIngredientId: standardizedId,
        confidence: result.confidence,
        originalIndex: target.originalIndex,
      }

      updates.push(payload)

      if (context === "recipe" && recipeId) {
        mappingsToCreate.push({
          originalName: result.originalName,
          standardizedIngredientId: standardizedId,
        })
      }
    }

    // OPTIMIZED: Batch create all mappings in one query
    if (context === "recipe" && recipeId && mappingsToCreate.length > 0) {
      await batchMapIngredientsToStandardized(recipeId, mappingsToCreate)
    }

    if (context === "recipe" && recipeId) {
      const updatedIngredients = ingredients.map((ingredient, index) => {
        const match = updates.find((update) => update.originalIndex === index)
        if (!match) return ingredient
        return {
          ...ingredient,
          standardizedIngredientId: match.standardizedIngredientId,
          standardizedName: match.canonicalName,
        }
      })

      await client.from("recipes").update({ ingredients: updatedIngredients }).eq("id", recipeId)
    } else if (context === "pantry" && pantryItemId && updates[0]) {
      const primary = updates[0]
      await client
        .from("pantry_items")
        .update({
          standardized_ingredient_id: primary.standardizedIngredientId,
          standardized_name: primary.canonicalName,
        })
        .eq("id", pantryItemId)
        .eq("user_id", userId)
    }

    return NextResponse.json({
      context,
      standardized: updates,
    })
  } catch (error) {
    console.error("[IngredientStandardizeAPI] Failed to standardize ingredients:", error)
    return NextResponse.json({ error: "Failed to standardize ingredients" }, { status: 500 })
  }
}
