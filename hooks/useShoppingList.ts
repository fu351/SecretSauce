"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import type { ShoppingListItem } from "@/lib/types/store"

export function useShoppingList() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [lastSavedState, setLastSavedState] = useState<ShoppingListItem[]>([])

  // --- 1. Mappers ---
  const mapMiscellaneousItem = useCallback((dbItem: any): ShoppingListItem => {
    const resolvedName = dbItem.standardized_ingredients?.canonical_name || dbItem.name || "Unknown Item"

    return {
      id: dbItem.id,
      name: resolvedName,
      quantity: Number(dbItem.quantity),
      unit: dbItem.unit || "piece",
      checked: dbItem.checked || false,
      ingredientId: dbItem.ingredient_id,
      source: 'miscellaneous'
    }
  }, [])

  const mapRecipeItem = useCallback((dbItem: any): ShoppingListItem[] => {
    const recipe = dbItem.recipes
    if (!recipe || !recipe.ingredients) return []

    const ingredients = recipe.ingredients
    const ingredientMask = dbItem.ingredient_mask || []
    // ingredient_amounts represents the amount for ONE serving (normalized when recipe was added)
    const amountsPerServing = dbItem.ingredient_amounts || []
    const checkedMask = dbItem.checked_mask || []
    const currentServings = Number(dbItem.servings) || 1

    return ingredients
      .map((ing: any, index: number) => {
        if (ingredientMask[index] === false) return null

        const resolvedName = ing.standardized_ingredients?.canonical_name || ing.name || ing.title || "Unknown Ingredient"

        // Scale per-serving amount by current servings multiplier
        const perServing = amountsPerServing[index] !== undefined
          ? Number(amountsPerServing[index])
          : 0

        const totalQuantity = perServing * currentServings

        return {
          id: `${dbItem.id}-${index}`,
          name: resolvedName,
          quantity: totalQuantity,
          unit: ing.unit || "piece",
          checked: checkedMask[index] || false,
          recipeId: dbItem.recipe_id,
          recipeName: recipe.title,
          ingredientId: ing.ingredient_id || ing.id,
          source: 'recipe',
          ingredientMask: ingredientMask,
          checkedMask: checkedMask,
          servings: currentServings,
          amountsPerServing: amountsPerServing // Store reference for individual updates
        }
      })
      .filter((item): item is ShoppingListItem => item !== null)
  }, [])

  // --- 2. Load List ---
  const loadShoppingList = useCallback(async () => {
    if (!user) {
      setItems([])
      return
    }

    setLoading(true)
    try {
      const [miscResult, recipeResult] = await Promise.all([
        supabase
          .from("miscellaneous_shopping_items")
          .select(`*, standardized_ingredients (canonical_name)`)
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),

        supabase
          .from("recipe_shopping_items")
          .select(`*, recipes (id, title, servings, ingredients)`)
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
      ])

      if (miscResult.error) throw miscResult.error
      if (recipeResult.error) throw recipeResult.error

      const loadedItems = [
        ...(miscResult.data || []).map(mapMiscellaneousItem),
        ...(recipeResult.data || []).flatMap(mapRecipeItem)
      ]
      setItems(loadedItems)
      // Mark state as clean after loading
      setLastSavedState(loadedItems)
      setHasChanges(false)
    } catch (error) {
      console.error("Error loading list:", error)
      toast({ title: "Error", description: "Could not load list.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [user, toast, mapMiscellaneousItem, mapRecipeItem])

  // --- 3. Single Item Actions ---

  const addItem = useCallback(async (name: string, quantity = 1, unit = "piece", checked = false, ingredientId?: string) => {
      if (!user) return null
      const tempId = `temp-${crypto.randomUUID()}`
      const newItem: ShoppingListItem = { id: tempId, name, quantity, unit, checked, ingredientId, source: 'miscellaneous' }
      setItems(prev => [...prev, newItem])

      try {
        const { data, error } = await supabase
          .from("miscellaneous_shopping_items")
          .insert({ user_id: user.id, name, quantity, unit, checked, ingredient_id: ingredientId })
          .select(`*, standardized_ingredients (canonical_name)` )
          .single()

        if (error) throw error
        const realItem = mapMiscellaneousItem(data)
        setItems(prev => prev.map(item => item.id === tempId ? realItem : item))
        return realItem
      } catch (error) {
        setItems(prev => prev.filter(item => item.id !== tempId))
        toast({ title: "Error", description: "Failed to save item.", variant: "destructive" })
        return null
      }
    }, [user, toast, mapMiscellaneousItem])

  const removeItem = useCallback(async (id: string) => {
    const backup = items.find(i => i.id === id)
    if (!backup) return

    setItems(prev => prev.filter(item => item.id !== id))

    try {
      if (backup.source === 'miscellaneous') {
        await supabase.from("miscellaneous_shopping_items").delete().eq("id", id)
      } else {
        const idParts = id.split('-')
        const ingredientIndex = parseInt(idParts[idParts.length - 1])
        const cartId = idParts.slice(0, -1).join('-')

        const newMask = [...(backup.ingredientMask || [])]
        newMask[ingredientIndex] = false

        const { error } = await supabase
          .from("recipe_shopping_items")
          .update({ ingredient_mask: newMask })
          .eq("id", cartId)

        if (error) throw error
      }
    } catch (error) {
      setItems(prev => [...prev, backup])
      toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" })
    }
  }, [items, toast])

  const updateQuantity = useCallback((id: string, newTotalQuantity: number) => {
    const safeQuantity = Math.max(0, newTotalQuantity)
    // Optimistic update only - no database sync
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        // When user manually edits quantity, recalculate the per-serving amount
        // This allows future serving adjustments to scale from the new base
        if (item.source === 'recipe' && item.amountsPerServing && item.servings) {
          const idParts = item.id.split('-')
          const ingredientIndex = parseInt(idParts[idParts.length - 1])
          const newPerServing = safeQuantity / item.servings

          const updatedAmountsPerServing = [...item.amountsPerServing]
          updatedAmountsPerServing[ingredientIndex] = newPerServing

          return {
            ...item,
            quantity: safeQuantity,
            amountsPerServing: updatedAmountsPerServing
          }
        }
        return { ...item, quantity: safeQuantity }
      }
      return item
    }))
    setHasChanges(true) // Mark as changed
  }, [])

  const updateItemName = useCallback(async (id: string, newName: string) => {
    const currentItem = items.find(i => i.id === id)
    if (!currentItem || currentItem.name === newName) return

    setItems(prev => prev.map(item => item.id === id ? { ...item, name: newName } : item))

    try {
      if (currentItem.source === 'miscellaneous') {
        await supabase.from("miscellaneous_shopping_items").update({ name: newName }).eq("id", id)
      } else {
        toast({ title: "Cannot Update", description: "Recipe ingredient names are fixed.", variant: "destructive" })
        setItems(prev => prev.map(item => item.id === id ? { ...item, name: currentItem.name } : item))
      }
    } catch (error) {
      loadShoppingList()
    }
  }, [items, toast, loadShoppingList])

  const toggleChecked = useCallback((id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return

    const newValue = !item.checked
    // Optimistic update only - no database sync
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: newValue } : i))
    setHasChanges(true) // Mark as changed
  }, [items])

  // --- 4. Recipe Actions (Groups) ---

  const addRecipeToCart = useCallback(async (recipeId: string, servings?: number) => {
      if (!user) return

      try {
        const { data: recipe, error: recipeError } = await supabase
          .from("recipes")
          .select("servings, ingredients")
          .eq("id", recipeId)
          .single()

        if (recipeError) throw recipeError
        if (!recipe || !recipe.ingredients) {
          throw new Error("Recipe not found or has no ingredients")
        }

        const baseServings = recipe.servings || 1
        const finalServings = servings || baseServings

        // Normalize amounts to 1 serving for storage
        const amountsPerServing = (recipe.ingredients as any[]).map(ing => {
          const baseAmount = Number(ing.amount) || 0
          return baseAmount / baseServings
        })

        const { data, error } = await supabase
          .from("recipe_shopping_items")
          .upsert({
            user_id: user.id,
            recipe_id: recipeId,
            servings: finalServings,
            ingredient_amounts: amountsPerServing,
            ingredient_mask: new Array(amountsPerServing.length).fill(true),
            checked_mask: new Array(amountsPerServing.length).fill(false)
          }, { onConflict: 'user_id,recipe_id' })
          .select(`*, recipes (id, title, servings, ingredients)`)
          .single()

        if (error) throw error
        if (!data) throw new Error("Failed to create shopping item")

        const mappedItems = mapRecipeItem(data)
        if (mappedItems.length === 0) {
          throw new Error("Recipe has no valid ingredients to add")
        }

        // Remove any existing items for this recipe and add the new ones
        setItems(prev => {
          const filtered = prev.filter(item => item.recipeId !== recipeId)
          return [...filtered, ...mappedItems]
        })
        toast({ title: "Recipe Added", description: `Added ${data.recipes?.title} to list.` })
      } catch (error) {
        console.error("Error adding recipe to cart:", error)
        const errorMessage = error instanceof Error ? error.message : "Failed to add recipe"
        toast({ title: "Error", description: errorMessage, variant: "destructive" })
      }
  }, [user, toast, mapRecipeItem])

  const updateRecipeServings = useCallback((recipeId: string, newServings: number) => {
    const safeServings = Math.max(1, newServings)

    // Optimistically scale quantities in the UI - no database sync
    setItems(prev => prev.map(item => {
      if (item.recipeId === recipeId && item.source === 'recipe') {
        // Extract the ingredient index from the item ID (format: cartId-ingredientIndex)
        const idParts = item.id.split('-')
        const ingredientIndex = parseInt(idParts[idParts.length - 1])

        // Use the stored amountsPerServing to scale the quantity
        const perServing = item.amountsPerServing?.[ingredientIndex] || 0
        return {
          ...item,
          servings: safeServings,
          quantity: perServing * safeServings
        }
      }
      return item
    }))
    setHasChanges(true) // Mark as changed
  }, [])

  const removeRecipe = useCallback(async (recipeId: string) => {
    setItems(prev => prev.filter(item => item.recipeId !== recipeId))
    try {
      const { error } = await supabase
        .from("recipe_shopping_items")
        .delete()
        .eq("recipe_id", recipeId)
        .eq("user_id", user?.id)
      if (error) throw error
    } catch (error) {
      loadShoppingList()
    }
  }, [user, loadShoppingList])

  // --- 5. Batch Save ---
  const saveChanges = useCallback(async () => {
    if (!user || !hasChanges) return // Skip if no changes

    try {
      // Collect all changes by type
      const miscChanges: { id: string; quantity: number; checked: boolean; name: string }[] = []
      const recipeChanges: {
        cartId: string
        servings: number
        ingredientAmounts: number[]
        checkedMask: boolean[]
      }[] = []

      // Group items by their source
      const groupedByRecipe = new Map<string, ShoppingListItem[]>()
      const miscItems: ShoppingListItem[] = []

      items.forEach(item => {
        if (item.source === 'miscellaneous') {
          miscItems.push(item)
        } else if (item.recipeId) {
          if (!groupedByRecipe.has(item.recipeId)) {
            groupedByRecipe.set(item.recipeId, [])
          }
          groupedByRecipe.get(item.recipeId)!.push(item)
        }
      })

      // Build miscellaneous changes
      for (const item of miscItems) {
        miscChanges.push({
          id: item.id,
          quantity: item.quantity,
          checked: item.checked,
          name: item.name
        })
      }

      // Build recipe changes
      for (const [, recipeItems] of groupedByRecipe) {
        if (recipeItems.length === 0) continue

        const firstItem = recipeItems[0]
        const cartId = firstItem.id.split('-')[0] // Extract cart ID from first item

        // Reconstruct arrays from individual items
        const ingredientAmounts = new Array(recipeItems.length).fill(0)
        const checkedMask = new Array(recipeItems.length).fill(false)

        recipeItems.forEach(item => {
          const index = parseInt(item.id.split('-').pop() || '0')
          if (item.amountsPerServing && item.amountsPerServing[index] !== undefined) {
            ingredientAmounts[index] = item.amountsPerServing[index]
          }
          checkedMask[index] = item.checked
        })

        recipeChanges.push({
          cartId,
          servings: firstItem.servings || 1,
          ingredientAmounts,
          checkedMask
        })
      }

      // Batch update miscellaneous items
      for (const change of miscChanges) {
        await supabase
          .from("miscellaneous_shopping_items")
          .update({ quantity: change.quantity, checked: change.checked, name: change.name })
          .eq("id", change.id)
      }

      // Batch update recipe items
      for (const change of recipeChanges) {
        await supabase
          .from("recipe_shopping_items")
          .update({
            servings: change.servings,
            ingredient_amounts: change.ingredientAmounts,
            checked_mask: change.checkedMask
          })
          .eq("id", change.cartId)
      }

      toast({ title: "Changes saved", description: "Your shopping list has been updated." })
      // Mark changes as saved
      setLastSavedState(items)
      setHasChanges(false)
    } catch (error) {
      console.error("Error saving changes:", error)
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" })
    }
  }, [items, user, toast, hasChanges])

  useEffect(() => {
    loadShoppingList()
  }, [loadShoppingList])

  return {
    items,
    loading,
    hasChanges,
    addItem,
    updateQuantity,
    updateItemName,
    toggleChecked,
    removeItem,
    addRecipeToCart,
    updateRecipeServings,
    removeRecipe,
    saveChanges,
  }
}