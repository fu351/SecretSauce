"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "../ui/use-toast"
import { shoppingListDB } from "@/lib/database/store-list-db"
import { recipeIngredientsDB } from "@/lib/database/recipe-ingredients-db"
import { useShoppingListItems } from "./use-shopping-list-items"
import { useShoppingListRecipes } from "./use-shopping-list-recipes"
import type { ShoppingListItem } from "@/lib/types/store"

/**
 * Main shopping list hook
 * Composes DB operations and specialized sub-hooks for complete shopping list management
 * Maintains the same API as before for backwards compatibility
 *
 * @returns {UseShoppingListReturn} Complete shopping list state and operations
 *
 * @example
 * ```tsx
 * function ShoppingPage() {
 *   const { items, loading, addItem, removeItem } = useShoppingList()
 *   return <ShoppingList items={items} onAdd={addItem} onRemove={removeItem} />
 * }
 * ```
 */
export function useShoppingList() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const hasChangesRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingUpdatesRef = useRef<Array<{ id: string; changes: Partial<ShoppingListItem> }>>([])
  const pendingDeletesRef = useRef<string[]>([])
  const SAVE_DEBOUNCE_MS = 10000

  // Load shopping list from database
  const loadShoppingList = useCallback(async () => {
    if (!user) {
      setItems([])
      setHasChanges(false)
      hasChangesRef.current = false
      pendingUpdatesRef.current = []
      pendingDeletesRef.current = []
      return
    }

    setLoading(true)
    try {
      const loadedItems = await shoppingListDB.fetchUserItems(user.id)
      setItems(loadedItems)
      setHasChanges(false)
      hasChangesRef.current = false
      pendingUpdatesRef.current = []
      pendingDeletesRef.current = []
    } catch (error) {
      console.error("Error loading list:", error)
      toast({ title: "Error", description: "Could not load list.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [user, toast])

  // Immediate flush (used by comparison button or manual triggers)
  const saveChanges = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (!user || !hasChangesRef.current) return

    const pendingUpdates = pendingUpdatesRef.current
    const pendingDeletes = pendingDeletesRef.current

    if (pendingUpdates.length > 0) {
      try {
        await shoppingListDB.batchUpdateItems(pendingUpdates)
      } catch (error) {
        console.error("Auto-save failed:", error)
        toast({ title: "Save failed", description: "Could not sync changes.", variant: "destructive" })
        setHasChanges(true)
        hasChangesRef.current = true
        return
      } finally {
        pendingUpdatesRef.current = []
      }
    }

    if (pendingDeletes.length > 0) {
      try {
        await shoppingListDB.deleteBatch(pendingDeletes)
      } catch (error) {
        console.error("Auto-save delete failed:", error)
        toast({ title: "Save failed", description: "Could not delete items.", variant: "destructive" })
        setHasChanges(true)
        hasChangesRef.current = true
        return
      } finally {
        pendingDeletesRef.current = []
      }
    }

    setHasChanges(false)
    hasChangesRef.current = false
    toast({ title: "Saved", description: "Shopping list synced." })
  }, [user, toast])

  // Schedule an auto-save after inactivity
  const queueSave = useCallback(() => {
    if (!user) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    setHasChanges(true)
    hasChangesRef.current = true
    saveTimerRef.current = setTimeout(() => {
      void saveChanges()
    }, SAVE_DEBOUNCE_MS)
  }, [user, saveChanges])

  // Track pending updates for deferred persistence
  const registerPendingUpdate = useCallback((id: string, changes: Partial<ShoppingListItem>) => {
    pendingDeletesRef.current = pendingDeletesRef.current.filter(delId => delId !== id)
    pendingUpdatesRef.current = [
      ...pendingUpdatesRef.current.filter(entry => entry.id !== id),
      { id, changes: { ...pendingUpdatesRef.current.find(e => e.id === id)?.changes, ...changes } },
    ]
    queueSave()
  }, [queueSave])

  const registerPendingDelete = useCallback((id: string) => {
    pendingUpdatesRef.current = pendingUpdatesRef.current.filter(entry => entry.id !== id)
    if (!pendingDeletesRef.current.includes(id)) {
      pendingDeletesRef.current = [...pendingDeletesRef.current, id]
    }
    queueSave()
  }, [queueSave])

  // Compose sub-hooks for item and recipe operations (after queue/save exist)
  const itemOperations = useShoppingListItems(items, setItems, queueSave, registerPendingUpdate, registerPendingDelete, user?.id ?? null, loadShoppingList)
  const recipeOperations = useShoppingListRecipes(
    items,
    setItems,
    loadShoppingList,
    user?.id ?? null,
    recipeIngredientsDB,
    queueSave
  )

  // Initial load
  useEffect(() => {
    loadShoppingList()
  }, [loadShoppingList])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      void saveChanges()
    }
  }, [saveChanges])

  return {
    items,
    loading,
    hasChanges,
    ...itemOperations,
    ...recipeOperations,
    saveChanges,
    queueSave,
    loadShoppingList
  }
}
