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

  // --- 1. Mapper ---
  const mapFromDb = useCallback((dbItem: any): ShoppingListItem => {
    const resolvedName = dbItem.standardized_ingredients?.canonical_name || dbItem.name || "Unknown Item"

    return {
      id: dbItem.id,
      name: resolvedName,
      quantity: Number(dbItem.quantity),
      unit: dbItem.unit || "piece",
      checked: dbItem.checked || false,
      recipeId: dbItem.recipe_id,
      recipeName: dbItem.recipes?.title || null, 
      ingredientId: dbItem.ingredient_id
    }
  }, [])

  // --- 2. Load List ---
  const loadShoppingList = useCallback(async () => {
    if (!user) {
      setItems([])
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select(`
          *,
          recipes (
            title
          ),
          standardized_ingredients (
            canonical_name
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }) 

      if (error) throw error
      
      setItems((data || []).map(mapFromDb))
    } catch (error) {
      console.error("Error loading list:", error)
      toast({
        title: "Error",
        description: "Could not load your shopping list.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [user, toast, mapFromDb])

  // --- 3. Single Item Actions ---

  const addItem = useCallback(async (
    name: string, 
    quantity = 1, 
    unit = "piece", 
    checked = false,      
    recipeId?: string,    
    recipeName?: string,
    ingredientId?: string 
  ) => {
      if (!user) return null

      // Optimistic ID (Use randomUUID)
      const tempId = `temp-${crypto.randomUUID()}`
      
      const newItem: ShoppingListItem = {
        id: tempId,
        name,
        quantity,
        unit,
        checked,
        recipeId,   
        recipeName,
        ingredientId
      }

      setItems(prev => [...prev, newItem])

      try {
        const { data, error } = await supabase
          .from("shopping_lists")
          .insert({
            user_id: user.id,
            // We still save 'name' to satisfy NOT NULL constraint for custom items
            // but the UI will prefer the ingredient_id lookup on read
            name, 
            quantity,
            unit,
            checked,
            recipe_id: recipeId,   
            ingredient_id: ingredientId
          })
          .select(`
            *,
            recipes (
              title
            ),
            standardized_ingredients (
              canonical_name
            )
          `) 
          .single()

        if (error) throw error

        const realItem = mapFromDb(data)
        
        setItems(prev => prev.map(item => item.id === tempId ? realItem : item))
        toast({ title: "Added", description: `${realItem.name} added to list.` })
        
        return realItem 

      } catch (error) {
        setItems(prev => prev.filter(item => item.id !== tempId))
        console.error("Add failed:", error)
        toast({ title: "Error", description: "Failed to save item.", variant: "destructive" })
        return null
      }
    }, [user, toast, mapFromDb])

  // ... (removeItem, updateQuantity, updateItemName, toggleChecked remain unchanged) ...
  const removeItem = useCallback(async (id: string) => {
    const backup = items.find(i => i.id === id)
    setItems(prev => prev.filter(item => item.id !== id))

    try {
      const { error } = await supabase
        .from("shopping_lists")
        .delete()
        .eq("id", id)
        .eq("user_id", user?.id)
      
      if (error) throw error
    } catch (error) {
      if (backup) setItems(prev => [...prev, backup])
      toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" })
    }
  }, [items, user, toast])

  const updateQuantity = useCallback(async (id: string, newQuantity: number) => {
    const safeQuantity = Math.max(1, newQuantity)
    const currentItem = items.find(i => i.id === id)
    if (!currentItem) return

    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: safeQuantity } : item
    ))

    try {
      const { error } = await supabase
        .from("shopping_lists")
        .update({ quantity: safeQuantity })
        .eq("id", id)

      if (error) throw error
    } catch (error) {
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, quantity: currentItem.quantity } : item
      ))
      console.error("Update quantity failed:", error)
    }
  }, [items])

  const updateItemName = useCallback(async (id: string, newName: string) => {
    const currentItem = items.find(i => i.id === id)
    if (!currentItem || currentItem.name === newName) return

    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, name: newName } : item
    ))

    try {
      // NOTE: If this is a standardized item, this update only changes the local 'name' column.
      // The 'mapFromDb' logic will still prioritize the standardized name.
      // If you want users to be able to rename standardized items, you would need to 
      // clear the ingredient_id or handle it in the DB view logic.
      const { error } = await supabase
        .from("shopping_lists")
        .update({ name: newName })
        .eq("id", id)

      if (error) throw error
      toast({ title: "Updated", description: "Item name updated." })
    } catch (error) {
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, name: currentItem.name } : item
      ))
      toast({ title: "Error", description: "Failed to update item.", variant: "destructive" })
    }
  }, [items, toast])

  const toggleChecked = useCallback(async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    
    const newValue = !item.checked
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: newValue } : i))

    try {
      const { error } = await supabase
        .from("shopping_lists")
        .update({ checked: newValue })
        .eq("id", id)
      
      if (error) throw error
    } catch (error) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !newValue } : i))
      console.error("Toggle failed", error)
    }
  }, [items])

  // --- 4. Recipe Actions (Groups) ---

  const addRecipeIngredients = useCallback(async (
    recipeId: string, 
    recipeTitle: string, 
    ingredients: any[]
  ) => {
      if (!user) return

      const rows = ingredients.map(ing => ({
        user_id: user.id,
        // We insert the name as a fallback for the DB constraint
        name: ing.name || ing.title || "Unknown Ingredient",
        quantity: Number(ing.amount) || 1,
        unit: ing.unit || "piece",
        recipe_id: recipeId,
        // We rely on this ID for the actual name lookup
        ingredient_id: ing.ingredient_id || ing.id || null
      }))

      // Optimistic Items
      const tempItems = rows.map((r, i) => ({
        id: `temp-recipe-${crypto.randomUUID()}-${i}`,
        name: r.name,
        quantity: r.quantity,
        unit: r.unit,
        checked: false,
        recipeId: r.recipe_id,     
        recipeName: recipeTitle,
        ingredientId: r.ingredient_id
      }))
      
      setItems(prev => [...prev, ...tempItems])

      try {
        const { data, error } = await supabase
          .from("shopping_lists")
          .insert(rows)
          .select(`
            *,
            recipes (
              title
            ),
            standardized_ingredients (
              canonical_name
            )
          `)
        
        if (error) throw error

        const newRealItems = (data || []).map(mapFromDb) 
        
        setItems(prev => {
          const withoutTemps = prev.filter(p => !tempItems.some(t => t.id === p.id))
          return [...withoutTemps, ...newRealItems]
        })

        toast({ title: "Recipe Added", description: `Added ingredients for ${recipeTitle}.` })
      } catch (error) {
        console.error(error)
        setItems(prev => prev.filter(p => !tempItems.some(t => t.id === p.id)))
        toast({ title: "Error", description: "Failed to add recipe.", variant: "destructive" })
      }
  }, [user, toast, mapFromDb])

  // ... (removeRecipe remains unchanged) ...
  const removeRecipe = useCallback(async (recipeId: string) => {
    const itemsBackup = items.filter(i => i.recipeId === recipeId)
    setItems(prev => prev.filter(item => item.recipeId !== recipeId))

    try {
      const { error } = await supabase
        .from("shopping_lists")
        .delete()
        .eq("recipe_id", recipeId)
        .eq("user_id", user?.id)

      if (error) throw error
      toast({ title: "Recipe Removed", description: "Ingredients cleared from list." })
    } catch (error) {
      console.error("Remove recipe failed:", error)
      setItems(prev => [...prev, ...itemsBackup])
      toast({ title: "Error", description: "Failed to remove recipe.", variant: "destructive" })
    }
  }, [items, user, toast])

  // --- 5. Init ---
  useEffect(() => {
    loadShoppingList()
  }, [loadShoppingList])

  return {
    items,
    loading,
    addItem,
    updateQuantity,
    updateItemName,
    toggleChecked,
    removeItem,
    addRecipeIngredients,
    removeRecipe,
  }
}