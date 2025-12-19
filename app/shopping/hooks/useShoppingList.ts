"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"

export interface ShoppingListItem {
  id: string
  name: string
  quantity: number
  unit?: string
  recipeId?: string
  recipeName?: string
}

export interface GroceryItem {
  id: string
  title: string
  brand?: string
  price: number
  image_url?: string
  unit?: string
  pricePerUnit?: string
  shoppingItemId?: string
}

/**
 * Hook for managing shopping list state and operations
 * Handles loading, saving, and updating items in the shopping list
 */
export function useShoppingList() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([])
  const [loading, setLoading] = useState(false)

  // Load shopping list from Supabase
  const loadShoppingList = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })

      if (error) throw error
      setShoppingList(data || [])
    } catch (error) {
      console.error("Error loading shopping list:", error)
      toast({
        title: "Failed to load shopping list",
        description: "Please try refreshing the page",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [user, toast])

  // Save shopping list to Supabase
  const saveShoppingList = useCallback(
    async (items: ShoppingListItem[]) => {
      if (!user) return
      try {
        // Delete existing items and insert new ones
        await supabase.from("shopping_lists").delete().eq("user_id", user.id)

        if (items.length > 0) {
          const itemsToInsert = items.map((item) => ({
            user_id: user.id,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit || null,
            recipe_id: item.recipeId || null,
            recipe_name: item.recipeName || null,
          }))

          await supabase.from("shopping_lists").insert(itemsToInsert)
        }

        setShoppingList(items)
      } catch (error) {
        console.error("Error saving shopping list:", error)
        toast({
          title: "Failed to save shopping list",
          variant: "destructive",
        })
      }
    },
    [user, toast]
  )

  // Add item to shopping list
  const addToShoppingList = useCallback(
    (item: GroceryItem) => {
      const newItem: ShoppingListItem = {
        id: `${Date.now()}-${Math.random()}`,
        name: item.title,
        quantity: 1,
        unit: item.unit,
      }

      const updatedList = [...shoppingList, newItem]
      setShoppingList(updatedList)
      saveShoppingList(updatedList)

      toast({
        title: "Item added",
        description: `${item.title} added to your shopping list.`,
      })
    },
    [shoppingList, saveShoppingList, toast]
  )

  // Remove item from shopping list
  const removeFromShoppingList = useCallback(
    (itemId: string) => {
      const updatedList = shoppingList.filter((item) => item.id !== itemId)
      setShoppingList(updatedList)
      saveShoppingList(updatedList)
    },
    [shoppingList, saveShoppingList]
  )

  // Update item quantity
  const updateItemQuantity = useCallback(
    (itemId: string, quantity: number) => {
      const updatedList = shoppingList.map((item) =>
        item.id === itemId ? { ...item, quantity } : item
      )
      setShoppingList(updatedList)
      saveShoppingList(updatedList)
    },
    [shoppingList, saveShoppingList]
  )

  // Load on mount
  useEffect(() => {
    loadShoppingList()
  }, [loadShoppingList])

  return {
    shoppingList,
    setShoppingList,
    loading,
    addToShoppingList,
    removeFromShoppingList,
    updateItemQuantity,
    saveShoppingList,
    loadShoppingList,
  }
}
