"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { ShoppingListItem } from "../components/store-types"

export function useShoppingList() {
  const { user } = useAuth()
  const { toast } = useToast()
  
  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [loading, setLoading] = useState(false)

  // --- Helpers ---
  const mapFromDb = (dbItem: any): ShoppingListItem => ({
    id: dbItem.id,
    name: dbItem.name,
    quantity: dbItem.quantity,
    unit: dbItem.unit || "piece",
    checked: dbItem.checked || false,
    recipeId: dbItem.recipe_id,
    recipeName: dbItem.recipe_name,
  })

  // --- CRUD Operations ---

  const loadShoppingList = useCallback(async () => {
    if (!user) {
      setItems([])
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("*")
        .eq("user_id", user.id)
        // Ensure you have a consistent sort order, otherwise items jump around
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
  }, [user, toast])

// inside hooks/useShoppingList.ts

  // Change the return type signature of addItem
  const addItem = useCallback(async (name: string, quantity = 1, unit = "piece") => {
      if (!user) return null // Return null if no user

      const tempId = `temp-${Date.now()}`
      const newItem: ShoppingListItem = {
        id: tempId,
        name,
        quantity,
        unit,
        checked: false
      }

      setItems(prev => [...prev, newItem])

      try {
        const { data, error } = await supabase
          .from("shopping_lists")
          .insert({
            user_id: user.id,
            name,
            quantity,
            unit,
            checked: false
          })
          .select()
          .single()

        if (error) throw error

        setItems(prev => prev.map(item => item.id === tempId ? mapFromDb(data) : item))
        toast({ title: "Added", description: `${name} added to list.` })
        
        // RETURN THE DATA (or the temp item if data isn't ready yet, but usually data is ready)
        return mapFromDb(data) 

      } catch (error) {
        setItems(prev => prev.filter(item => item.id !== tempId))
        console.error("Add failed:", error)
        toast({ title: "Error", description: "Failed to save item.", variant: "destructive" })
        return null
      }
    }, [user, toast])

  const updateQuantity = useCallback(async (id: string, delta: number) => {
    // Check current state before modifying
    const currentItem = items.find(i => i.id === id)
    if (!currentItem) return
    
    const newQuantity = Math.max(1, currentItem.quantity + delta)

    // Optimistic
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: newQuantity } : item
    ))

    try {
      const { error } = await supabase
        .from("shopping_lists")
        .update({ quantity: newQuantity })
        .eq("id", id)

      if (error) throw error
    } catch (error) {
      // Revert logic (simplified)
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, quantity: currentItem.quantity } : item
      ))
      console.error("Update quantity failed:", error)
    }
  }, [items])

  const toggleChecked = useCallback(async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    
    const newValue = !item.checked

    // Optimistic
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: newValue } : i))

    try {
      const { error } = await supabase
        .from("shopping_lists")
        .update({ checked: newValue })
        .eq("id", id)
      
      if (error) throw error
    } catch (error) {
      // Revert
      setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !newValue } : i))
      console.error("Toggle failed", error)
    }
  }, [items])

  const removeItem = useCallback(async (id: string) => {
    const backup = items.find(i => i.id === id)
    setItems(prev => prev.filter(item => item.id !== id))

    try {
      const { error } = await supabase
        .from("shopping_lists")
        .delete()
        .eq("id", id)
      
      if (error) throw error
    } catch (error) {
      if (backup) setItems(prev => [...prev, backup])
      toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" })
    }
  }, [items, toast])

  const addRecipeIngredients = useCallback(async (recipeId: string, ingredients: any[]) => {
    if (!user) return

    const rows = ingredients.map(ing => ({
      user_id: user.id,
      name: ing.name,
      quantity: Number(ing.amount) || 1,
      unit: ing.unit || "piece",
      recipe_id: recipeId,
    }))

    // Optimistic setup
    const tempItems = rows.map((r, i) => ({
      id: `temp-recipe-${Date.now()}-${i}`,
      name: r.name,
      quantity: r.quantity,
      unit: r.unit,
      checked: false,
      recipeId: r.recipe_id
    }))
    
    setItems(prev => [...prev, ...tempItems])

    try {
      const { data, error } = await supabase
        .from("shopping_lists")
        .insert(rows)
        .select()
      
      if (error) throw error

      const newRealItems = (data || []).map(mapFromDb)
      
      // Smart merge: Remove temps, add reals
      setItems(prev => {
        // Filter out the specific temps we just added
        const withoutTemps = prev.filter(p => !tempItems.some(t => t.id === p.id))
        return [...withoutTemps, ...newRealItems]
      })

      toast({ title: "Recipe Added", description: "Ingredients added to your list." })
    } catch (error) {
      setItems(prev => prev.filter(p => !tempItems.some(t => t.id === p.id)))
      toast({ title: "Error", description: "Failed to add recipe.", variant: "destructive" })
    }
  }, [user, toast])

  useEffect(() => {
    loadShoppingList()
  }, [loadShoppingList])

  return {
    items,
    loading,
    addItem,
    updateQuantity,
    toggleChecked,
    removeItem,
    addRecipeIngredients,
    // Removed saveList as it contradicts row-based architecture
  }
}