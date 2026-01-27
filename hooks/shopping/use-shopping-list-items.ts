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
 * @param queueSave - Debounced saver to persist changes after inactivity
 * @param userId - Current user ID for database operations
 *
 * @returns Object containing item operation functions
 */
export function useShoppingListItems(
  items: ShoppingListItem[],
  setItems: React.Dispatch<React.SetStateAction<ShoppingListItem[]>>,
  queueSave: () => void,
  registerPendingUpdate: (id: string, changes: Partial<ShoppingListItem>) => void,
  registerPendingDelete: (id: string) => void,
  userId: string | null,
  loadShoppingList: () => Promise<void>
) {
  const { toast } = useToast()

  /**
   * Add a new manual item to the shopping list
   * Database triggers handle merging - just insert and reload
   */
  const addItem = useCallback(
    async (name: string, quantity = 1, unit = "piece", checked = false, ingredientId?: string) => {
      if (!userId) return null

      try {
        await shoppingListDB.insertItem({
          user_id: userId,
          name,
          quantity,
          unit,
          checked,
          source_type: 'manual',
          ingredient_id: ingredientId
        })

        // Database handles merging - reload to get the final state
        await loadShoppingList()

        queueSave()
        return true
      } catch (error) {
        toast({ title: "Error", description: "Failed to add item.", variant: "destructive" })
        return null
      }
    },
    [userId, toast, loadShoppingList, queueSave]
  )

  /**
   * Remove an item from the shopping list
   */
  const removeItem = useCallback(
    (id: string) => {
      const backup = items.find(i => i.id === id)
      if (!backup) return

      setItems(prev => prev.filter(item => item.id !== id))
      registerPendingDelete(id)
    },
    [items, registerPendingDelete]
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

      registerPendingUpdate(id, { quantity: safeQuantity })
    },
    [registerPendingUpdate]
  )

  /**
   * Update item name (manual items only)
   */
  const updateItemName = useCallback(
    (id: string, newName: string) => {
      const currentItem = items.find(i => i.id === id)
      if (!currentItem || currentItem.name === newName) return

      if (currentItem.source_type === 'recipe') {
        toast({ title: "Cannot Update", description: "Recipe ingredient names are fixed.", variant: "destructive" })
        return
      }

      setItems(prev => prev.map(item => item.id === id ? { ...item, name: newName } : item))

      registerPendingUpdate(id, { name: newName })
    },
    [items, registerPendingUpdate, toast]
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

      registerPendingUpdate(id, { checked: newValue })
    },
    [items, registerPendingUpdate]
  )

  return {
    addItem,
    removeItem,
    updateQuantity,
    updateItemName,
    toggleChecked
  }
}
