import { NextRequest, NextResponse } from "next/server"
import { standardizeIngredientsDeterministically } from "@/backend/workers/standardizer-worker"
import { standardizedIngredientsDB } from "@/lib/database/standardized-ingredients-db"
import { getAuthenticatedProfile } from "@/lib/foundation/server"

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
    const profile = await getAuthenticatedProfile()
    if (!profile.ok) {
      return NextResponse.json({ error: profile.error }, { status: profile.status })
    }

    const body = await request.json()
    const {
      context,
      pantryItemId,
      ingredients,
    }: {
      context?: string
      pantryItemId?: string
      ingredients: RequestIngredient[]
    } = body

    // Recipe ingredient saves go through fn_upsert_recipe_with_ingredients exclusively.
    // Non-pantry calls are rejected to prevent a parallel write path and potential
    // orphan queue rows if this route is extended in the future.
    if (context !== "pantry") {
      return NextResponse.json(
        {
          error:
            "This endpoint accepts context=pantry only. Recipe ingredient saves go through fn_upsert_recipe_with_ingredients.",
          code: "RECIPE_CONTEXT_REJECTED",
        },
        { status: 400 }
      )
    }

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ error: "No ingredients supplied" }, { status: 400 })
    }

    if (!pantryItemId) {
      return NextResponse.json({ error: "pantryItemId is required" }, { status: 400 })
    }

    const normalizedInputs = ingredients.reduce<NormalizedIngredientInput[]>((acc, ingredient, index) => {
      const trimmedName = ingredient.name?.trim()
      if (!trimmedName) return acc

      const rawAmount = ingredient.amount ?? ingredient.quantity
      const normalizedAmount =
        rawAmount === undefined || rawAmount === null ? undefined : String(rawAmount).trim()
      const normalizedUnit = ingredient.unit?.trim()

      acc.push({
        id: String(ingredient.id ?? index),
        name: trimmedName,
        amount: normalizedAmount && normalizedAmount.length > 0 ? normalizedAmount : undefined,
        unit: normalizedUnit && normalizedUnit.length > 0 ? normalizedUnit : undefined,
        originalIndex: index,
      })

      return acc
    }, [])

    if (normalizedInputs.length === 0) {
      return NextResponse.json({ error: "All ingredients were blank" }, { status: 400 })
    }

    const standardizedResults = standardizeIngredientsDeterministically(normalizedInputs, context)

    // Batch create all standardized ingredients in one query
    const standardizedItems = standardizedResults.map(result => ({
      canonicalName: result.canonicalName.trim().toLowerCase(),
      category: result.category || null,
      isFoodItem: result.isFoodItem,
    }))

    const standardizedIdMap = await standardizedIngredientsDB.batchGetOrCreate(standardizedItems)

    const updates: Array<{
      id: string
      originalName: string
      canonicalName: string
      category?: string | null
      standardizedIngredientId: string
      confidence: number
      originalIndex: number
    }> = []

    for (const result of standardizedResults) {
      const target = normalizedInputs.find((input) => input.id === result.id) || normalizedInputs[0]
      const normalizedCanonical = result.canonicalName.trim().toLowerCase()
      const standardizedId = standardizedIdMap.get(normalizedCanonical)
      if (!standardizedId) continue

      updates.push({
        id: result.id,
        originalName: result.originalName,
        canonicalName: result.canonicalName,
        category: result.category,
        standardizedIngredientId: standardizedId,
        confidence: result.confidence,
        originalIndex: target.originalIndex,
      })
    }

    if (pantryItemId && updates[0]) {
      const primary = updates[0]
      const { data: updatedPantryItem, error: updateError } = await profile.supabase
        .from("pantry_items")
        .update({
          standardized_ingredient_id: primary.standardizedIngredientId,
          standardized_name: primary.canonicalName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pantryItemId)
        .eq("user_id", profile.profileId)
        .select("id")
        .maybeSingle()

      if (updateError) {
        console.error("[IngredientStandardizeAPI] Failed to update pantry item:", updateError)
        return NextResponse.json({ error: "Failed to update pantry item" }, { status: 500 })
      }

      if (!updatedPantryItem) {
        return NextResponse.json({ error: "Pantry item not found" }, { status: 404 })
      }
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
