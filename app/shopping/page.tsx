"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ChefHat, SearchIcon, DollarSign, Plus, X, ShoppingCart, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { searchGroceryStores } from "@/lib/grocery-scrapers"
import { StoreMap } from "@/components/store-map"
import { geocodeMultipleStores, geocodePostalCode, getUserLocation } from "@/lib/geocoding"

interface GroceryItem {
  id: string
  title: string
  brand: string
  price: number
  pricePerUnit?: string
  unit?: string
  image_url: string
  provider: string
  location?: string
  category?: string
}

interface ShoppingListItem {
  id: string
  name: string
  quantity: number
  unit: string
  checked: boolean
  recipeId?: string
  recipeName?: string
}

interface Recipe {
  id: string
  title: string
  ingredients: any[]
}

type PantryItemInfo = {
  id: string
  quantity: number
  unit: string | null
}

const DEFAULT_GROCERY_DISTANCE_MILES = 10
const DEFAULT_SHOPPING_ZIP = "94709"

interface StoreComparison {
  store: string
  items: (GroceryItem & { shoppingItemId: string })[]
  total: number
  savings: number
  outOfRadius?: boolean
  distanceMiles?: number
  locationHint?: string
  missingItems?: boolean
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function ShoppingPage() {
  const [mounted, setMounted] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [zipCode, setZipCode] = useState(DEFAULT_SHOPPING_ZIP)
  const [groceryDistanceMiles, setGroceryDistanceMiles] = useState<number | undefined>(DEFAULT_GROCERY_DISTANCE_MILES)
  const [searchResults, setSearchResults] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([])
  const [newItem, setNewItem] = useState("")
  const [showRecipeDialog, setShowRecipeDialog] = useState(false)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [massSearchResults, setMassSearchResults] = useState<StoreComparison[]>([])
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [draggedRecipe, setDraggedRecipe] = useState<string | null>(null)
  const [missingItems, setMissingItems] = useState<ShoppingListItem[]>([])
  const [distanceFilterWarning, setDistanceFilterWarning] = useState<string | null>(null)
  const [itemSearchModalOpen, setItemSearchModalOpen] = useState(false)
  const [itemSearchModalTerm, setItemSearchModalTerm] = useState("")
  const [itemSearchModalResults, setItemSearchModalResults] = useState<GroceryItem[]>([])
  const [itemSearchModalLoading, setItemSearchModalLoading] = useState(false)
  const [itemSearchSource, setItemSearchSource] = useState<
    { type: "shopping-list" | "missing" | "search-results"; shoppingItemId?: string; store?: string } | null
  >(null);
  const [pantryInventory, setPantryInventory] = useState<Map<string, PantryItemInfo>>(new Map())

  const [carouselIndex, setCarouselIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  const { user } = useAuth()
  const { theme } = useTheme()
  const getDomTheme = () => {
    if (typeof document === "undefined") return "light"
    return document.documentElement.classList.contains("dark") ? "dark" : "light"
  }
  const isDark = (mounted ? theme : getDomTheme()) === "dark"
  const pageBgClass = isDark ? "bg-[#0f0f0d]" : "bg-gray-50"
  const { toast } = useToast()
  const loadPantryInventory = useCallback(async () => {
    if (!user) {
      setPantryInventory(new Map())
      return
    }

    try {
      const { data, error } = await supabase
        .from("pantry_items")
        .select("id, name, quantity, unit")
        .eq("user_id", user.id)

      if (error) throw error

      const map = new Map<string, PantryItemInfo>()
      data?.forEach((item) => {
        const key = (item.name || "").trim().toLowerCase()
        if (!key) return
        map.set(key, {
          id: item.id,
          quantity: Number(item.quantity) || 0,
          unit: item.unit || null,
        })
      })
      setPantryInventory(map)
    } catch (error) {
      console.error("Error loading pantry items:", error)
    }
  }, [user])

  const sortComparisons = useCallback(
    (comparisons: StoreComparison[]) => {
      return [...comparisons]
        .map((comparison) => ({
          ...comparison,
          missingItems: comparison.items.length < shoppingList.length,
        }))
        .sort((a, b) => {
          if (!!a.outOfRadius !== !!b.outOfRadius) {
            return Number(a.outOfRadius) - Number(b.outOfRadius)
          }
          if (!!a.missingItems !== !!b.missingItems) {
            return Number(a.missingItems) - Number(b.missingItems)
          }
          return a.total - b.total
        })
    },
    [shoppingList.length]
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (user) {
      loadUserPreferences()
      loadShoppingList()
      loadRecipes()
      loadPantryInventory()
    }
  }, [user, loadPantryInventory])

  useEffect(() => {
    if (!user) {
      setPantryInventory(new Map())
    }
  }, [user])

  // Auto-scroll to map when comparison results are ready
  useEffect(() => {
    if (massSearchResults.length > 0 && mapContainerRef.current) {
      // Add a small delay to ensure the map component has rendered
      const timer = setTimeout(() => {
        mapContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [massSearchResults])

  const loadUserPreferences = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("postal_code, grocery_distance_miles")
        .eq("id", user.id)
        .single()

      if (error) throw error

      if (data?.postal_code) {
        setZipCode(data.postal_code)
      } else {
        setZipCode(DEFAULT_SHOPPING_ZIP)
      }
      if (data?.grocery_distance_miles) {
        setGroceryDistanceMiles(data.grocery_distance_miles)
      }
    } catch (error) {
      console.error("Error loading user preferences:", error)
    }
  }

  const loadShoppingList = async () => {
    if (!user) return

    try {
      const { data } = await supabase
        .from("shopping_lists")
        .select("items")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)

      if (data && data.length > 0 && data[0]?.items) {
        setShoppingList(data[0].items)
      } else {
        setShoppingList([])
      }
    } catch (error) {
      console.error("Error loading shopping list:", error)
      setShoppingList([])
    }
  }

  const loadRecipes = async () => {
    if (!user) return

    try {
      // Load user's own recipes
      const { data: ownRecipes, error: ownError } = await supabase
        .from("recipes")
        .select("id, title, ingredients")
        .eq("author_id", user.id)

      if (ownError) throw ownError

      const { data: favoriteData, error: favoriteError } = await supabase
        .from("recipe_favorites")
        .select("recipe_id")
        .eq("user_id", user.id)

      if (favoriteError) throw favoriteError

      // Get the full recipe data for favorited recipes
      let favoritedRecipes: any[] = []
      if (favoriteData && favoriteData.length > 0) {
        const recipeIds = favoriteData.map((f) => f.recipe_id)
        const { data: recipesData, error: recipesError } = await supabase
          .from("recipes")
          .select("id, title, ingredients")
          .in("id", recipeIds)

        if (recipesError) throw recipesError
        favoritedRecipes = recipesData || []
      }

      // Combine and deduplicate
      const ownRecipesList = ownRecipes || []
      const allRecipes = [...ownRecipesList]

      favoritedRecipes.forEach((favRecipe) => {
        if (!allRecipes.find((recipe) => recipe.id === favRecipe.id)) {
          allRecipes.push(favRecipe)
        }
      })

      setRecipes(allRecipes)
    } catch (error) {
      console.error("Error loading recipes:", error)
      setRecipes([])
    }
  }

  const saveShoppingList = async (items: ShoppingListItem[]) => {
    if (!user) return

    try {
      const { error } = await supabase.from("shopping_lists").upsert({
        user_id: user.id,
        items,
      })

      if (error) throw error
    } catch (error) {
      console.error("Error saving shopping list:", error)
    }
  }

  const handleSearch = async () => {
    if (!searchTerm.trim()) return

    setLoading(true)
    try {
      const storeResults = await searchGroceryStores(searchTerm, zipCode)
      const flattenedResults = storeResults.flatMap((store) => store.items)
      setSearchResults(flattenedResults)
    } catch (error) {
      console.error("Search error:", error)
      toast({
        title: "Search failed",
        description: "Please try again later.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const upsertCustomShoppingItem = (incomingItem: ShoppingListItem) => {
    const normalizedName = incomingItem.name.trim().toLowerCase()
    const existingIndex = shoppingList.findIndex(
      (item) => !item.recipeId && item.name.trim().toLowerCase() === normalizedName,
    )

    let updatedList: ShoppingListItem[]
    if (existingIndex >= 0) {
      updatedList = shoppingList.map((item, index) =>
        index === existingIndex ? { ...item, quantity: item.quantity + incomingItem.quantity } : item,
      )
    } else {
      updatedList = [...shoppingList, incomingItem]
    }

    setShoppingList(updatedList)
    saveShoppingList(updatedList)
    return updatedList
  }

  const addToShoppingList = (item: GroceryItem) => {
    const newShoppingItem: ShoppingListItem = {
      id: Date.now().toString(),
      name: item.title,
      quantity: 1,
      unit: item.unit || "piece",
      checked: false,
    }

    upsertCustomShoppingItem(newShoppingItem)

    toast({
      title: "Added to shopping list",
      description: `${item.title} has been added to your shopping list.`,
    })
  }

  const fetchCheapestOptions = async (term: string, storeOverride?: string) => {
    if (!term.trim()) return
    setItemSearchModalLoading(true)
    try {
      const targetStore = storeOverride ?? itemSearchSource?.store
      const storeResults = await searchGroceryStores(term, zipCode, targetStore)
      const flattened = storeResults.flatMap((store) =>
        store.items.map((item) => ({
          ...item,
          provider: item.provider || store.store,
          location: item.location || store.store,
        })),
      )
      const cheapest = flattened.sort((a, b) => a.price - b.price).slice(0, 10)
      setItemSearchModalResults(cheapest)
    } catch (error) {
      console.error("Item reload error:", error)
      toast({
        title: "Reload failed",
        description: "Unable to refresh options for this item. Please try again.",
        variant: "destructive",
      })
    } finally {
      setItemSearchModalLoading(false)
    }
  }

  const openItemSearchOverlay = (
    term: string,
    source: { type: "shopping-list" | "missing" | "search-results"; shoppingItemId?: string; store?: string } | null = null,
  ) => {
    const normalizedTerm = term.trim()
    const storeOverride = source?.store
    setItemSearchModalTerm(normalizedTerm)
    setItemSearchSource(source)
    setItemSearchModalResults([])
    setItemSearchModalOpen(true)
    if (normalizedTerm) {
      fetchCheapestOptions(normalizedTerm, storeOverride)
    }
  }

  const handleModalSearch = () => {
    if (!itemSearchModalTerm.trim()) return
    fetchCheapestOptions(itemSearchModalTerm.trim(), itemSearchSource?.store)
  }

  const integrateManualSelection = useCallback(
    (storeName: string, shoppingItemId: string, option: GroceryItem) => {
      const shoppingMap = new Map(shoppingList.map((item) => [item.id, item]))

      setMassSearchResults((prev) => {
        const updated = prev.map((comparison) => {
          if (comparison.store !== storeName) {
            return comparison
          }

          const listItem = shoppingMap.get(shoppingItemId)
          const normalizedItem: GroceryItem & { shoppingItemId: string } = {
            ...option,
            id: option.id || `${storeName}-${shoppingItemId}-${Date.now()}`,
            shoppingItemId,
            provider: comparison.store,
            unit: option.unit || listItem?.unit || "unit",
          }

          const updatedItems = [...comparison.items]
          const existingIndex = updatedItems.findIndex((item) => item.shoppingItemId === shoppingItemId)
          if (existingIndex >= 0) {
            updatedItems[existingIndex] = normalizedItem
          } else {
            updatedItems.push(normalizedItem)
          }

          const newTotal = updatedItems.reduce((sum, item) => {
            const source = shoppingMap.get(item.shoppingItemId)
            return sum + item.price * (source?.quantity ?? 1)
          }, 0)

          return {
            ...comparison,
            items: updatedItems,
            total: newTotal,
          }
        })

        return sortComparisons(updated)
      })
    },
    [shoppingList, sortComparisons]
  )

  const handleModalSelection = async (option: GroceryItem) => {
    if (itemSearchSource && itemSearchSource.type !== "search-results" && itemSearchSource.shoppingItemId) {
      const preferredStore =
        itemSearchSource.store ||
        massSearchResults.find((comparison) => !comparison.outOfRadius)?.store ||
        massSearchResults[0]?.store

      if (preferredStore) {
        integrateManualSelection(preferredStore, itemSearchSource.shoppingItemId, option)
        setMissingItems((prev) => prev.filter((item) => item.id !== itemSearchSource.shoppingItemId))
        toast({
          title: "Item linked",
          description: `${option.title} added to ${preferredStore}.`,
        })
      } else {
        toast({
          title: "Unable to update item",
          description: "No available stores to attach this item.",
          variant: "destructive",
        })
      }
      setItemSearchModalOpen(false)
      setItemSearchSource(null)
      return
    }

    addToShoppingList(option)
    setItemSearchModalOpen(false)
    setItemSearchSource(null)
  }

  const addStoreItemsToPantry = async (comparison: StoreComparison) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to manage your pantry.",
        variant: "destructive",
      })
      return
    }

    try {
      const itemsToProcess = comparison.items
        .map((item) => {
          const listItem = shoppingList.find((entry) => entry.id === item.shoppingItemId)
          return {
            name: item.title,
            quantity: listItem?.quantity ?? 1,
            unit: listItem?.unit || item.unit || "unit",
          }
        })
        .filter((entry) => entry.name && entry.name.trim().length > 0)

      if (itemsToProcess.length === 0) {
        toast({
          title: "No items to add",
          description: "This store card has no items to add to your pantry.",
        })
        return
      }

      const inserts: Array<{ user_id: string; name: string; quantity: number; unit: string | undefined }> = []
      const updates: Array<{ id: string; quantity: number }> = []

      const lookup = new Map(pantryInventory)

      itemsToProcess.forEach((entry) => {
        const key = entry.name.trim().toLowerCase()
        const existing = lookup.get(key)
        if (existing) {
          updates.push({
            id: existing.id,
            quantity: Number(existing.quantity || 0) + Number(entry.quantity || 0),
          })
        } else {
          inserts.push({
            user_id: user.id,
            name: entry.name,
            quantity: entry.quantity,
            unit: entry.unit,
          })
        }
      })

      if (inserts.length > 0) {
        const { error } = await supabase.from("pantry_items").insert(inserts)
        if (error) throw error
      }

      for (const update of updates) {
        const { error } = await supabase
          .from("pantry_items")
          .update({ quantity: update.quantity })
          .eq("id", update.id)
        if (error) throw error
      }

      await loadPantryInventory()

      toast({
        title: "Pantry updated",
        description: `Added ${itemsToProcess.length} ${itemsToProcess.length === 1 ? "item" : "items"} from ${
          comparison.store
        }.`,
      })
    } catch (error) {
      console.error("Error updating pantry:", error)
      toast({
        title: "Pantry update failed",
        description: "We couldn't add those items to your pantry.",
        variant: "destructive",
      })
    }
  }

  const handleItemSearchModalChange = (open: boolean) => {
    setItemSearchModalOpen(open)
    if (!open) {
      setItemSearchSource(null)
      setItemSearchModalResults([])
      setItemSearchModalTerm("")
    }
  }

  const addCustomItem = () => {
    if (!newItem.trim()) return

    const trimmedName = newItem.trim()
    upsertCustomShoppingItem({
      id: Date.now().toString(),
      name: trimmedName,
      quantity: 1,
      unit: "piece",
      checked: false,
    })

    setNewItem("")

    toast({
      title: "Added to shopping list",
      description: `${trimmedName} has been added to your shopping list.`,
    })
  }

  const updateItemQuantity = (id: string, change: number) => {
    const updatedList = shoppingList.map((item) =>
      item.id === id ? { ...item, quantity: Math.max(1, item.quantity + change) } : item,
    )
    setShoppingList(updatedList)
    saveShoppingList(updatedList)
  }

  const toggleItemChecked = (id: string) => {
    const updatedList = shoppingList.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    setShoppingList(updatedList)
    saveShoppingList(updatedList)
  }

  const removeItem = (id: string) => {
    const updatedList = shoppingList.filter((item) => item.id !== id)
    setShoppingList(updatedList)
    saveShoppingList(updatedList)
  }

  const removeRecipeItems = (recipeId: string, recipeName: string) => {
    const updatedList = shoppingList.filter((item) => item.recipeId !== recipeId)
    setShoppingList(updatedList)
    saveShoppingList(updatedList)

    toast({
      title: "Recipe removed",
      description: `All ingredients from ${recipeName} have been removed from your shopping list.`,
    })
  }

  const addRecipeIngredients = async (recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId)
    if (!recipe) return

    const newItems: ShoppingListItem[] = recipe.ingredients.map((ingredient: any) => ({
      id: Date.now().toString() + Math.random(),
      name: ingredient.name,
      quantity: Number.parseFloat(ingredient.amount) || 1,
      unit: ingredient.unit || "piece",
      checked: false,
      recipeId: recipe.id,
      recipeName: recipe.title,
    }))

    const mergedList = [...shoppingList]
    newItems.forEach((newItem) => {
      const existingIndex = mergedList.findIndex((item) => item.name.toLowerCase() === newItem.name.toLowerCase())
      if (existingIndex >= 0) {
        mergedList[existingIndex].quantity += newItem.quantity
      } else {
        mergedList.push(newItem)
      }
    })

    setShoppingList(mergedList)
    saveShoppingList(mergedList)
    setShowRecipeDialog(false)

    toast({
      title: "Ingredients added",
      description: `Added ${recipe.title} ingredients to your shopping list.`,
    })
  }

  const performMassSearch = async () => {
    if (shoppingList.length === 0) {
      toast({
        title: "Empty shopping list",
        description: "Add items to your shopping list before performing a search.",
        variant: "destructive",
      })
      return
    }

    setComparisonLoading(true)
    setMissingItems([])
    try {
      const searchPromises = shoppingList.map(async (item) => {
        const storeResults = await searchGroceryStores(item.name, zipCode)
        return { item, storeResults }
      })

      const searchResults = await Promise.all(searchPromises)

      const storeMap = new Map<string, StoreComparison>()
      const missing: ShoppingListItem[] = []

      searchResults.forEach(({ item, storeResults }) => {
        const hasResults = storeResults.some((storeResult) => storeResult.items && storeResult.items.length > 0)
        if (!hasResults) {
          missing.push(item)
          return
        }

        storeResults.forEach((storeResult) => {
          if (!storeMap.has(storeResult.store)) {
            storeMap.set(storeResult.store, {
              store: storeResult.store,
              items: [],
              total: 0,
              savings: 0,
            })
          }

          const store = storeMap.get(storeResult.store)!
          const bestItem = storeResult.items.reduce((best, current) => (current.price < best.price ? current : best))

          if (bestItem) {
              store.items.push({
                ...bestItem,
                shoppingItemId: item.id,
              })
              store.total += bestItem.price * item.quantity
              if (!store.locationHint && bestItem.location) {
                store.locationHint = bestItem.location
              }
            }
        })
      })

      const comparisons = Array.from(storeMap.values())
      const minTotal = Math.min(...comparisons.map((c) => c.total))

      comparisons.forEach((comparison) => {
        comparison.savings = comparison.total - minTotal
      })

      comparisons.sort((a, b) => a.total - b.total)

      // Filter by distance if user has set a max distance preference
      let filteredComparisons = comparisons
      if (groceryDistanceMiles && groceryDistanceMiles > 0) {
        try {
          const maxDistanceMiles = groceryDistanceMiles
          let userLoc = await getUserLocation()
          if (!userLoc && zipCode) {
            userLoc = await geocodePostalCode(zipCode)
          }

          if (userLoc) {
            const storeNames = comparisons.map((comp) => comp.store)
            const storeHints = new Map(comparisons.map((comp) => [comp.store, comp.locationHint]))
            const geocodedStores = await geocodeMultipleStores(storeNames, zipCode, userLoc, groceryDistanceMiles, storeHints)

            const storeDistances = new Map<string, number>()
            comparisons.forEach((comparison) => {
              const geocoded = geocodedStores.get(comparison.store)
              if (geocoded) {
                const distance = calculateDistance(userLoc.lat, userLoc.lng, geocoded.lat, geocoded.lng)
                storeDistances.set(comparison.store, distance)
              }
            })

            const inRange: StoreComparison[] = []
            const outOfRange: StoreComparison[] = []
            const outOfRangeNames: string[] = []

            comparisons.forEach((comparison) => {
              const distance = storeDistances.get(comparison.store)
              const comparisonWithDistance = {
                ...comparison,
                distanceMiles: distance,
              }

              if (distance !== undefined && distance > maxDistanceMiles) {
                outOfRange.push({ ...comparisonWithDistance, outOfRadius: true })
                outOfRangeNames.push(comparison.store)
              } else {
                inRange.push(comparisonWithDistance)
              }
            })

            filteredComparisons = [...inRange, ...outOfRange]

            if (outOfRangeNames.length > 0) {
              setDistanceFilterWarning(
                `${outOfRangeNames.join(", ")} ${
                  outOfRangeNames.length === 1 ? "is" : "are"
                } outside your ${maxDistanceMiles.toFixed(0)} mile radius. We've moved ${
                  outOfRangeNames.length === 1 ? "it" : "them"
                } to the end of the list and hidden ${
                  outOfRangeNames.length === 1 ? "its" : "their"
                } map marker${outOfRangeNames.length === 1 ? "" : "s"}.`,
              )
            } else {
              setDistanceFilterWarning(null)
            }
          } else {
            setDistanceFilterWarning("We couldn't determine your location, so distance filtering was skipped.")
          }
        } catch (error) {
          console.error("Error filtering by distance:", error)
          // Continue with unfiltered results if filtering fails
          setDistanceFilterWarning("We couldn't filter by distance, so all stores are shown.")
        }
      } else {
        setDistanceFilterWarning(null)
      }

      setMassSearchResults(sortComparisons(filteredComparisons))
      setMissingItems(missing)
    } catch (error) {
      console.error("Error performing mass search:", error)
      toast({
        title: "Search error",
        description: "Failed to perform mass search. Please try again.",
        variant: "destructive",
      })
    } finally {
      setComparisonLoading(false)
    }
  }

  const getStoreIcon = (store: string) => {
    switch (store.toLowerCase()) {
      case "target":
        return "🎯"
      case "kroger":
        return "🛒"
      case "meijer":
        return "🏪"
      case "99 ranch":
        return "🥬"
      default:
        return "🏪"
    }
  }

  const groupResultsByStore = (results: GroceryItem[]) => {
    const grouped = results.reduce(
      (acc, item) => {
        if (!acc[item.provider]) {
          acc[item.provider] = []
        }
        acc[item.provider].push(item)
        return acc
      },
      {} as Record<string, GroceryItem[]>,
    )

    return Object.entries(grouped).map(([store, items]) => ({
      store,
      items: items.sort((a, b) => a.price - b.price),
      total: items.reduce((sum, item) => sum + item.price, 0),
    }))
  }

  const handleDragStart = (recipeId: string) => setDraggedRecipe(recipeId)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedRecipe) {
      addRecipeIngredients(draggedRecipe)
      setDraggedRecipe(null)
    }
  }

  // Group shopping list items by recipe
  const groupedShoppingList = shoppingList.reduce(
    (acc, item) => {
      const key = item.recipeId || "custom"
      if (!acc[key]) {
        acc[key] = {
          recipeName: item.recipeName || "Custom Items",
          items: [],
        }
      }
      acc[key].items.push(item)
      return acc
    },
    {} as Record<string, { recipeName: string; items: ShoppingListItem[] }>,
  )

  const groupedShoppingListEntries = Object.entries(groupedShoppingList).sort((a, b) => {
    if (a[0] === "custom" && b[0] !== "custom") return -1
    if (b[0] === "custom" && a[0] !== "custom") return 1
    return a[1].recipeName.localeCompare(b[1].recipeName)
  })

  const scrollToStore = (index: number) => {
    if (carouselRef.current) {
      const cardWidth = carouselRef.current.scrollWidth / massSearchResults.length
      carouselRef.current.scrollTo({
        left: cardWidth * index,
        behavior: "smooth",
      })
      setCarouselIndex(index)
    }
  }

  const nextStore = () => {
    if (carouselIndex < massSearchResults.length - 1) {
      scrollToStore(carouselIndex + 1)
    }
  }

  const prevStore = () => {
    if (carouselIndex > 0) {
      scrollToStore(carouselIndex - 1)
    }
  }

  const bgClass = theme === "dark" ? "bg-[#181813]" : "bg-gray-50"
  const textClass = theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
  const cardBgClass = theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white"
  const mutedTextClass = theme === "dark" ? "text-[#e8dcc4]/70" : "text-gray-600"
  const buttonClass =
    theme === "dark" ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]" : "bg-orange-500 hover:bg-orange-600 text-white"
  const buttonOutlineClass =
    theme === "dark"
      ? "border-[#e8dcc4]/40 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 hover:text-[#e8dcc4]"
      : "border-gray-300 hover:bg-[#e8dcc4]/10"

  if (!mounted) {
    return <div className={`min-h-screen ${bgClass}`} />
  }

  return (
    <div className={`min-h-screen ${bgClass}`}>
      {(loading || comparisonLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className={`mx-4 max-w-md rounded-2xl p-8 text-center shadow-2xl ${
              theme === "dark" ? "bg-[#1f1e1a] border border-[#e8dcc4]/30 text-[#e8dcc4]" : "bg-white text-gray-900"
            }`}
            role="status"
            aria-live="assertive"
            aria-label={comparisonLoading ? "Store comparison in progress" : "Grocery search in progress"}
          >
            <div className="mb-4 flex justify-center">
              <span className="h-12 w-12 animate-spin rounded-full border-4 border-[#e8dcc4] border-t-transparent"></span>
            </div>
            <h2 className="text-2xl font-semibold mb-2">
              {comparisonLoading ? "Comparing stores…" : "Searching for groceries…"}
            </h2>
            <p className={theme === "dark" ? "text-[#e8dcc4]/70" : "text-gray-600"}>
              {comparisonLoading
                ? "Finding the best prices across all your nearby stores."
                : "Hang tight while we compare prices across nearby stores."}
            </p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className={`text-3xl font-serif font-light ${textClass} mb-2`}>Shopping & Price Search</h1>
          <p className={mutedTextClass}>Find the best prices and manage your shopping list</p>
        </div>

        <div className="space-y-6">
          {/* Shopping List Section */}
          <Card className={cardBgClass}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${textClass}`}>
                  <ShoppingCart className="h-5 w-5" />
                  Shopping List
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Dialog open={showRecipeDialog} onOpenChange={setShowRecipeDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className={buttonOutlineClass}>
                        <ChefHat className="h-4 w-4 mr-2" />
                        Add Recipe Ingredients
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl">
                      <DialogHeader>
                        <DialogTitle>Add Recipe Ingredients</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {recipes.map((recipe) => (
                            <div
                              key={recipe.id}
                              className="group relative cursor-pointer"
                              draggable
                              onDragStart={() => handleDragStart(recipe.id)}
                              onClick={() => addRecipeIngredients(recipe.id)}
                            >
                              <Card
                                className={`hover:shadow-lg transition-shadow ${theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : ""}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`w-12 h-12 rounded-lg flex items-center justify-center ${theme === "dark" ? "bg-[#e8dcc4]/20" : "bg-orange-100"}`}
                                    >
                                      <ChefHat
                                        className={`h-6 w-6 ${theme === "dark" ? "text-[#e8dcc4]" : "text-orange-600"}`}
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h3 className={`font-medium text-sm truncate ${textClass}`}>{recipe.title}</h3>
                                      <p className={`text-xs ${mutedTextClass}`}>
                                        {recipe.ingredients.length} ingredients
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-3 text-xs">
                                    <p className={mutedTextClass}>Click to add or drag to shopping list</p>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    onClick={performMassSearch}
                    disabled={shoppingList.length === 0}
                    variant="outline"
                    className={buttonOutlineClass}
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    Compare Stores
                  </Button>
                </div>

                <div className="flex gap-2" data-tutorial="shopping-add-item">
                  <Input
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="Add custom item..."
                    onKeyPress={(e) => e.key === "Enter" && addCustomItem()}
                    className={
                      theme === "dark"
                        ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4] placeholder:text-[#e8dcc4]/40"
                        : ""
                    }
                  />
                  <Button onClick={addCustomItem} disabled={!newItem.trim()} className={buttonClass}>
                    Add
                  </Button>
                </div>

                <div className="space-y-6">
                  {groupedShoppingListEntries.map(([key, group]) => (
                    <div key={key}>
                      <h3 className={`font-semibold text-lg mb-3 flex items-center gap-2 ${textClass}`}>
                        {key !== "custom" && <ChefHat className="h-5 w-5 text-orange-500" />}
                        {group.recipeName}
                        {key !== "custom" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeRecipeItems(key, group.recipeName)}
                            className="ml-auto text-red-500 hover:text-red-600 hover:bg-red-50"
                            title="Remove all ingredients from this recipe"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Remove Recipe
                          </Button>
                        )}
                      </h3>
                      <div className="space-y-2">
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                              theme === "dark"
                                ? item.checked
                                  ? "bg-[#181813] border-[#e8dcc4]/20"
                                  : "bg-[#1f1e1a] border-[#e8dcc4]/20"
                                : item.checked
                                  ? "bg-gray-50 border-gray-200"
                                  : "bg-white border-gray-200"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={() => toggleItemChecked(item.id)}
                              className="h-4 w-4"
                              title="Mark as purchased"
                              aria-label="Mark as purchased"
                            />
                            <div className="flex-1 min-w-0">
                              <h3
                                className={`font-medium ${item.checked ? `line-through ${mutedTextClass}` : textClass}`}
                              >
                                <span>{item.name}</span>
                                {pantryInventory.has(item.name.trim().toLowerCase()) && (
                                  <Badge className="ml-2 text-[10px]" variant="secondary">
                                    In Pantry
                                  </Badge>
                                )}
                              </h3>
                              <p className={`text-sm ${mutedTextClass}`}>
                                {item.quantity} {item.unit}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateItemQuantity(item.id, -1)}
                                disabled={item.quantity <= 1}
                                className={buttonOutlineClass}
                              >
                                -
                              </Button>
                              <span className={`w-8 text-center ${textClass}`}>{item.quantity}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateItemQuantity(item.id, 1)}
                                className={buttonOutlineClass}
                              >
                                +
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeItem(item.id)}
                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

          {/* Store Comparison Section */}
          {comparisonLoading ? (
              <Card className={cardBgClass}>
                <CardContent className="p-8 text-center">
                  <div
                    className={`animate-spin rounded-full h-8 w-8 border-b-2 ${theme === "dark" ? "border-[#e8dcc4]" : "border-orange-500"} mx-auto mb-4`}
                  ></div>
                  <p className={textClass}>Searching all stores...</p>
                </CardContent>
              </Card>
            ) : massSearchResults.length > 0 ? (
              <div className="space-y-6">
                {distanceFilterWarning && (
                  <div
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      theme === "dark"
                        ? "border-yellow-600/60 bg-yellow-900/30 text-yellow-200"
                        : "border-yellow-400 bg-yellow-50 text-yellow-800"
                    }`}
                  >
                    {distanceFilterWarning}
                  </div>
                )}
                {/* Carousel and Map Side by Side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Carousel Section */}
                  <div className="relative min-w-0">
                    {/* Carousel Navigation */}
                    <div className="flex items-center justify-between mb-4">
                      <h2 className={`text-2xl font-bold ${textClass}`}>Store Comparison</h2>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={prevStore}
                          disabled={carouselIndex === 0}
                          className={buttonOutlineClass}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className={`text-sm ${mutedTextClass}`}>
                          {carouselIndex + 1} / {massSearchResults.length}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={nextStore}
                          disabled={carouselIndex === massSearchResults.length - 1}
                          className={buttonOutlineClass}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Carousel Container */}
                    <div
                      ref={carouselRef}
                      className="flex gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4"
                      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                    >
                      {massSearchResults.map((comparison, index) => (
                        <div key={comparison.store} className="flex-shrink-0 w-full snap-center">
                          <Card
                            className={`h-full ${cardBgClass} ${
                              index === 0 ? "border-2 border-green-500" : comparison.outOfRadius ? "border-yellow-500/60" : ""
                            }`}
                          >
                            <CardHeader>
                              <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-4xl">{getStoreIcon(comparison.store)}</span>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-2xl ${textClass}`}>{comparison.store}</span>
                                      {index === 0 && <Badge className="bg-green-500 text-white">Best Price</Badge>}
                                      {comparison.outOfRadius && (
                                        <Badge variant="destructive" className="bg-yellow-500 text-black">
                                          Outside Radius
                                        </Badge>
                                      )}
                                    </div>
                                    {comparison.distanceMiles && (
                                      <p className={`text-sm ${mutedTextClass}`}>
                                        {comparison.distanceMiles.toFixed(1)} miles away
                                      </p>
                                    )}
                                    <div className="text-right mt-1">
                                      <div className={`text-3xl font-bold ${textClass}`}>
                                        ${comparison.total.toFixed(2)}
                                      </div>
                                      {comparison.savings > 0 && (
                                        <div className="text-sm text-red-600">+${comparison.savings.toFixed(2)} more</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {comparison.outOfRadius && (
                                <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">
                                      Outside your {groceryDistanceMiles ?? DEFAULT_GROCERY_DISTANCE_MILES} mile radius. Hidden from the map but included
                                  here for reference.
                                </p>
                              )}
                              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                                {comparison.items.map((item) => {
                                  const shoppingItem = shoppingList.find((si) => si.id === item.shoppingItemId)
                                  return (
                                    <div
                                      key={item.id}
                                      className={`flex items-start gap-3 p-4 rounded-lg ${theme === "dark" ? "bg-[#181813]" : "bg-gray-50"}`}
                                    >
                                      <img
                                        src={item.image_url || "/placeholder.svg"}
                                        alt={item.title}
                                        className="w-16 h-16 object-cover rounded"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <h3 className={`font-medium text-sm truncate ${textClass}`}>{item.title}</h3>
                                        <p className={`text-xs ${mutedTextClass}`}>{item.brand}</p>
                                        {shoppingItem && (
                                          <p className={`text-xs ${mutedTextClass} mt-1`}>Qty: {shoppingItem.quantity}</p>
                                        )}
                                        <div className="flex items-center justify-between mt-2 gap-2">
                                          <div className="text-sm">
                                            <span className={`font-semibold ${textClass}`}>${item.price.toFixed(2)}</span>
                                            {item.pricePerUnit && (
                                              <span className={`${mutedTextClass} ml-1`}>({item.pricePerUnit})</span>
                                            )}
                                            {shoppingItem && shoppingItem.quantity > 1 && (
                                              <span className={`${mutedTextClass} ml-2`}>
                                                Total: ${(item.price * shoppingItem.quantity).toFixed(2)}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() =>
                                                openItemSearchOverlay(shoppingItem?.name || item.title, {
                                                  type: "shopping-list",
                                                  shoppingItemId: item.shoppingItemId,
                                                  store: comparison.store,
                                                })
                                              }
                                              className={`h-6 px-2 ${buttonOutlineClass}`}
                                            >
                                              <RefreshCw className="h-3 w-3 mr-1" />
                                              Reload
                                            </Button>
                                            <Button
                                              size="sm"
                                              onClick={() => addToShoppingList(item)}
                                              className={`h-6 px-2 ${buttonClass}`}
                                            >
                                              <Plus className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                                {shoppingList.length > comparison.items.length && (
                                  <div className="mt-4 border-t border-dashed border-border pt-4">
                                    <p className={`text-sm font-semibold ${textClass} mb-2`}>Missing Items</p>
                                    <div className="space-y-2">
                                      {shoppingList
                                        .filter(
                                          (listItem) =>
                                            !comparison.items.some((item) => item.shoppingItemId === listItem.id),
                                        )
                                        .map((listItem) => (
                                          <div
                                            key={listItem.id}
                                            className={`text-sm ${mutedTextClass} flex items-center justify-between gap-4`}
                                          >
                                            <div>
                                              <div>{listItem.name}</div>
                                              <div className="text-xs">Qty: {listItem.quantity}</div>
                                            </div>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() =>
                                                openItemSearchOverlay(listItem.name, {
                                                  type: "shopping-list",
                                                  shoppingItemId: listItem.id,
                                                  store: comparison.store,
                                                })
                                              }
                                              className={`h-7 px-2 text-xs ${buttonOutlineClass}`}
                                            >
                                              <RefreshCw className="h-3 w-3 mr-1" />
                                              Reload
                                            </Button>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                )}
                                <div className="mt-4 flex justify-end">
                                  <Button
                                    size="sm"
                                    className={`h-8 px-3 ${buttonClass}`}
                                    onClick={() => addStoreItemsToPantry(comparison)}
                                    disabled={!user || comparison.items.length === 0}
                                  >
                                    Add to Pantry
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>

                    {/* Carousel Dots Indicator */}
                    <div className="flex justify-center gap-2 mt-4">
                      {massSearchResults.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => scrollToStore(index)}
                          className={`w-2 h-2 rounded-full transition-all ${
                            index === carouselIndex
                              ? theme === "dark"
                                ? "bg-[#e8dcc4] w-8"
                                : "bg-orange-500 w-8"
                              : theme === "dark"
                                ? "bg-[#e8dcc4]/30"
                                : "bg-gray-300"
                          }`}
                          aria-label={`Go to store ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Store Map Section */}
                  <div ref={mapContainerRef} className="space-y-4 min-w-0">
                    <div>
                      <h2 className={`text-2xl font-bold ${textClass} mb-2`}>Store Locations</h2>
                      <p className={mutedTextClass}>Click markers to sync with the carousel</p>
                    </div>
                    <StoreMap
                      comparisons={massSearchResults}
                      userPostalCode={zipCode}
                      selectedStoreIndex={carouselIndex}
                      onStoreSelected={(index) => scrollToStore(index)}
                      maxDistanceMiles={groceryDistanceMiles}
                    />
                  </div>
                </div>

                <Card
                  className={
                    theme === "dark" ? cardBgClass : "bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200"
                  }
                >
                  <CardHeader>
                    <CardTitle className={`flex items-center gap-2 ${textClass}`}>
                      <DollarSign className={`h-5 w-5 ${theme === "dark" ? "text-[#e8dcc4]" : "text-orange-600"}`} />
                      Shopping Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className={`text-2xl font-bold ${theme === "dark" ? "text-green-400" : "text-green-600"}`}>
                          ${massSearchResults[0]?.total.toFixed(2) || "0.00"}
                        </p>
                        <p className={`text-sm ${mutedTextClass}`}>Best Total Price</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-2xl font-bold ${theme === "dark" ? "text-red-400" : "text-red-600"}`}>
                          ${massSearchResults[massSearchResults.length - 1]?.total.toFixed(2) || "0.00"}
                        </p>
                        <p className={`text-sm ${mutedTextClass}`}>Highest Total Price</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-2xl font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"}`}>
                          $
                          {(massSearchResults[massSearchResults.length - 1]?.total || 0) -
                            (massSearchResults[0]?.total || 0) >
                          0
                            ? (
                                (massSearchResults[massSearchResults.length - 1]?.total || 0) -
                                (massSearchResults[0]?.total || 0)
                              ).toFixed(2)
                            : "0.00"}
                        </p>
                        <p className={`text-sm ${mutedTextClass}`}>Potential Savings</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {missingItems.length > 0 && (
                  <Card className={cardBgClass}>
                    <CardHeader>
                      <CardTitle className={`flex items-center justify-between ${textClass}`}>
                        Items We Couldn't Find
                        <span className={`text-sm font-normal ${mutedTextClass}`}>
                          {missingItems.length} {missingItems.length === 1 ? "item" : "items"}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {missingItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between rounded-lg border border-dashed border-border p-3"
                          >
                            <div>
                              <p className={`font-medium ${textClass}`}>{item.name}</p>
                              <p className={`text-xs ${mutedTextClass}`}>Qty: {item.quantity}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  openItemSearchOverlay(item.name, { type: "missing", shoppingItemId: item.id })
                                }
                                className={`h-9 px-3 ${buttonOutlineClass}`}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reload options
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card className={cardBgClass}>
                <CardContent className="p-8 text-center">
                  <DollarSign className={`h-12 w-12 ${mutedTextClass} mx-auto mb-4`} />
                  <h3 className={`text-lg font-medium ${textClass} mb-2`}>No comparison data</h3>
                  <p className={`${mutedTextClass} mb-4`}>
                    Add items to your shopping list and perform a search to see store comparisons.
                  </p>
                  <Button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className={buttonClass}>
                    Go to Shopping List
                  </Button>
                </CardContent>
              </Card>
            )}
        </div>
      </div>
      <Dialog open={itemSearchModalOpen} onOpenChange={handleItemSearchModalChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Reload options for{" "}
              <span className="font-semibold">
                {itemSearchModalTerm || "this item"}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={itemSearchModalTerm}
                onChange={(e) => setItemSearchModalTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleModalSearch()}
                placeholder="Refine the search term"
                className={theme === "dark" ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
              />
              <Button onClick={handleModalSearch} disabled={!itemSearchModalTerm.trim() || itemSearchModalLoading}>
                {itemSearchModalLoading ? "Searching..." : "Search"}
              </Button>
            </div>
            <p className={`text-xs ${mutedTextClass}`}>
              We will show the 10 cheapest matches{" "}
              {itemSearchSource?.store ? `from ${itemSearchSource.store}.` : "across all stores."}
            </p>
            {itemSearchModalLoading ? (
              <div className="flex items-center justify-center py-10">
                <span
                  className={`animate-spin rounded-full h-10 w-10 border-b-2 ${
                    theme === "dark" ? "border-[#e8dcc4]" : "border-orange-500"
                  }`}
                ></span>
              </div>
            ) : itemSearchModalResults.length > 0 ? (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {itemSearchModalResults.map((item) => (
                  <div
                    key={`${item.provider}-${item.id}`}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      theme === "dark" ? "border-[#e8dcc4]/20 bg-[#1f1e1a]" : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <img
                      src={item.image_url || "/placeholder.svg"}
                      alt={item.title}
                      className="w-16 h-16 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${textClass}`}>{item.title}</p>
                      <p className={`text-xs ${mutedTextClass}`}>
                        {item.brand} • {item.provider}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <div>
                          <span className={`font-bold ${textClass}`}>${item.price.toFixed(2)}</span>
                          {item.pricePerUnit && <span className={`ml-2 ${mutedTextClass}`}>{item.pricePerUnit}</span>}
                        </div>
                        <Button size="sm" className={`h-8 px-3 ${buttonClass}`} onClick={() => handleModalSelection(item)}>
                          Select
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`text-center py-10 ${mutedTextClass}`}>No options found for this search.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
