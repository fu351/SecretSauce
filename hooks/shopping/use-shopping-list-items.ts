"use client"

import { useCallback } from "react"
import { useToast } from "../ui/use-toast"
import { shoppingListDB } from "@/lib/database/store-list-db"
import type { ShoppingListItem } from "@/lib/types/store"

/**
 * Composable hook for shopping list item operations
 * Handles individual item CRUD: add, remove, update, toggle
 *
 * @param items - Current shopping list items
 * @param setItems - State setter for items
 * @param setHasChanges - State setter for tracking unsaved changes
 * @param userId - Current user ID for database operations
 *
 * @returns Object containing item operation functions
 */
export function useShoppingListItems(
  items: ShoppingListItem[],
  setItems: React.Dispatch<React.SetStateAction<ShoppingListItem[]>>,
  setHasChanges: (value: boolean) => void,
  userId: string | null
) {
  const { toast } = useToast()

  /**
   * Add a new manual item to the shopping list
   * If an item with the same name, unit, and recipe_id already exists, merge quantities instead
   */
  const addItem = useCallback(
    async (name: string, quantity = 1, unit = "piece", checked = false, ingredientId?: string) => {
      if (!userId) return null

      // Check if an item with the same name, unit, and recipe_id already exists
      const existingItem = items.find(
        item => item.source_type === 'manual' &&
                 item.name.toLowerCase() === name.toLowerCase() &&
                 item.unit === unit &&
                 !item.recipe_id
      )

      if (existingItem) {
        // Merge quantities instead of creating a duplicate
        const newQuantity = existingItem.quantity + quantity
        setItems(prev => prev.map(item =>
          item.id === existingItem.id ? { ...item, quantity: newQuantity } : item
        ))

        try {
          const updatedItem = await shoppingListDB.updateItem(existingItem.id, { quantity: newQuantity })
          setItems(prev => prev.map(item => item.id === existingItem.id ? updatedItem : item))
          return updatedItem
        } catch (error) {
          // Revert on error
          setItems(prev => prev.map(item =>
            item.id === existingItem.id ? { ...item, quantity: existingItem.quantity } : item
          ))
          toast({ title: "Error", description: "Failed to update item.", variant: "destructive" })
          return null
        }
      }

      // Create new item if no duplicate exists
      const tempId = `temp-${crypto.randomUUID()}`
      const newItem: ShoppingListItem = {
        id: tempId,
        user_id: userId,
        name,
        quantity,
        unit,
        checked,
        source_type: 'manual',
        ingredient_id: ingredientId
      }

      setItems(prev => [...prev, newItem])

      try {
        const realItem = await shoppingListDB.insertItem({
          user_id: userId,
          name,
          quantity,
          unit,
          checked,
          source_type: 'manual',
          ingredient_id: ingredientId
        })
        setItems(prev => prev.map(item => item.id === tempId ? realItem : item))
        return realItem
      } catch (error) {
        setItems(prev => prev.filter(item => item.id !== tempId))
        toast({ title: "Error", description: "Failed to save item.", variant: "destructive" })
        return null
      }
    },
    [userId, toast, items]
  )

  /**
   * Remove an item from the shopping list
   */
  const removeItem = useCallback(
    async (id: string) => {
      const backup = items.find(i => i.id === id)
      if (!backup) return

      setItems(prev => prev.filter(item => item.id !== id))

      try {
        await shoppingListDB.deleteItem(id)
      } catch (error) {
        setItems(prev => [...prev, backup])
        toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" })
      }
    },
    [items, toast]
  )

  /**
   * Update quantity for a single item
   */
  const updateQuantity = useCallback(
    (id: string, newTotalQuantity: number) => {
      const safeQuantity = Math.max(1, newTotalQuantity)

      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, quantity: safeQuantity } : item
      ))

      shoppingListDB.updateItem(id, { quantity: safeQuantity })
        .catch(() => {
          toast({ title: "Error", description: "Failed to update quantity.", variant: "destructive" })
        })

      setHasChanges(true)
    },
    [toast]
  )

  /**
   * Update item name (manual items only)
   */
  const updateItemName = useCallback(
    async (id: string, newName: string) => {
      const currentItem = items.find(i => i.id === id)
      if (!currentItem || currentItem.name === newName) return

      if (currentItem.source_type === 'recipe') {
        toast({ title: "Cannot Update", description: "Recipe ingredient names are fixed.", variant: "destructive" })
        return
      }

      setItems(prev => prev.map(item => item.id === id ? { ...item, name: newName } : item))

      try {
        await shoppingListDB.updateItem(id, { name: newName })
      } catch (error) {
        setItems(prev => prev.map(item => item.id === id ? { ...item, name: currentItem.name } : item))
        toast({ title: "Error", description: "Failed to update item name.", variant: "destructive" })
      }
    },
    [items, toast]
  )

  /**
   * Toggle checked state for an item
   */
  const toggleChecked = useCallback(
    (id: string) => {
      const item = items.find(i => i.id === id)
      if (!item) return

      const newValue = !item.checked
      setItems(prev => prev.map(i => i.id === id ? { ...i, checked: newValue } : i))

      shoppingListDB.updateItem(id, { checked: newValue })
        .catch(() => {
          toast({ title: "Error", description: "Failed to update item.", variant: "destructive" })
        })

      setHasChanges(true)
    },
    [items, toast]
  )

  return {
    addItem,
    removeItem,
    updateQuantity,
    updateItemName,
    toggleChecked
  }
}
