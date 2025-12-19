"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ChefHat, SearchIcon, DollarSign, X, ShoppingCart, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, RefreshCw } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useTheme } from "@/contexts/theme-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { searchGroceryStores } from "@/lib/grocery-scrapers"
import { StoreMap } from "@/components/store-map"
import {
  geocodeMultipleStores,
  geocodePostalCode,
  getUserLocation,
  reverseGeocodeCoordinates,
  canonicalizeStoreName,
} from "@/lib/geocoding"

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
  standardizedIngredientId?: string
  standardizedName?: string
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
  standardized_ingredient_id?: string | null
  standardized_name?: string | null
}

const DEFAULT_GROCERY_DISTANCE_MILES = 10
const DEFAULT_SHOPPING_ZIP = ""
const STORE_BRAND_ALIASES: Array<{ brand: string; keywords: string[] }> = [
  { brand: "Walmart", keywords: ["walmart", "neighborhoodmarket", "samsclub"] },
  { brand: "Target", keywords: ["target"] },
  {
    brand: "Kroger",
    keywords: [
      "kroger",
      "ralphs",
      "fredmeyer",
      "smiths",
      "frys",
      "kingsoopers",
      "marianos",
      "picknsave",
      "food4less",
      "foodsco",
      "foodco",
      "citymarket",
      "dillons",
      "harristeeter",
      "bakers",
      "gerbes",
    ],
  },
  { brand: "Trader Joe's", keywords: ["traderjoe"] },
  { brand: "Aldi", keywords: ["aldi"] },
  { brand: "Whole Foods", keywords: ["wholefoods", "wholefood"] },
  { brand: "Costco", keywords: ["costco"] },
  { brand: "99 Ranch", keywords: ["99ranch", "ranchmarket"] },
  { brand: "Meijer", keywords: ["meijer"] },
  { brand: "Safeway", keywords: ["safeway"] },
]

const buildStoreKey = (storeName?: string) => canonicalizeStoreName(storeName || "")

const deriveStoreBrandLabel = (storeKey: string, fallback: string) => {
  if (!storeKey) return fallback
  const aliasMatch = STORE_BRAND_ALIASES.find((entry) => entry.keywords.some((keyword) => storeKey.includes(keyword)))
  return aliasMatch ? aliasMatch.brand : fallback
}

const MEASUREMENT_UNIT_KEYWORDS = [
  "tsp",
  "teaspoon",
  "tbsp",
  "tablespoon",
  "cup",
  "ounce",
  "oz",
  "floz",
  "fl oz",
  "pint",
  "quart",
  "gallon",
  "ml",
  "milliliter",
  "millilitre",
  "liter",
  "litre",
  "l",
  "kg",
  "kilogram",
  "gram",
  "g",
  "lb",
  "lbs",
  "pound",
  "pounds",
]

const COUNTABLE_UNIT_KEYWORDS = [
  "unit",
  "units",
  "piece",
  "pieces",
  "count",
  "item",
  "items",
  "pack",
  "package",
  "pkg",
  "bag",
  "box",
  "bottle",
  "can",
  "loaf",
  "dozen",
  "carton",
  "tray",
  "cluster",
  "bunch",
]

const normalizeUnit = (unit?: string) => unit?.toLowerCase().replace(/\./g, "").trim() ?? ""

const isMeasurementUnit = (unit: string) => {
  const compact = unit.replace(/\s+/g, "")
  return MEASUREMENT_UNIT_KEYWORDS.some((keyword) => compact.includes(keyword.replace(/\s+/g, "")))
}

// Avoid multiplying prices by recipe-sized measurements; fall back to full package counts
const getPurchaseQuantity = (shoppingItem?: ShoppingListItem) => {
  if (!shoppingItem) return 1

  const normalizedUnit = normalizeUnit(shoppingItem.unit)
  const rawQuantity = Number(shoppingItem.quantity) || 0
  const roundedQuantity = Math.max(1, Math.ceil(rawQuantity))

  if (normalizedUnit && isMeasurementUnit(normalizedUnit)) {
    return rawQuantity >= 1 ? roundedQuantity : 1
  }

  if (normalizedUnit && COUNTABLE_UNIT_KEYWORDS.some((keyword) => normalizedUnit.includes(keyword))) {
    return roundedQuantity
  }

  return roundedQuantity
}
const WARM_COMPARISON_MESSAGES = [
  {
    title: "Comparing stores…",
    description: "Counting coupons like finals week crammers.",
  },
  {
    title: "Sniffing out deals…",
    description: "Asking the produce section for its juiciest gossip.",
  },
  {
    title: "Coaching shopping carts…",
    description: "Running victory laps past every clearance bin.",
  },
  {
    title: "Consulting sale oracles…",
    description: "Reading tea leaves in the bulk spice aisle.",
  },
  {
    title: "Weighing price tags…",
    description: "Negotiating peace between kale and coupons.",
  },
  {
    title: "Gathering receipts…",
    description: "Dusting off old loyalty cards for secret codes.",
  },
] as const

const DARK_COMPARISON_MESSAGES = [
  {
    title: "Running shadow analysis…",
    description: "Triangulating whispers from midnight stock rooms.",
  },
  {
    title: "Tracing price signals…",
    description: "Decrypting receipts recovered from the void.",
  },
  {
    title: "Projecting outcomes…",
    description: "Cross-referencing stellar drift with sale cycles.",
  },
  {
    title: "Auditing supply lines…",
    description: "Questioning silent shelves about hidden fees.",
  },
  {
    title: "Balancing ledgers…",
    description: "Letting algorithms decide which store blinks first.",
  },
  {
    title: "Collating intel…",
    description: "Tuning antennae for faint coupon transmissions.",
  },
] as const

interface StoreComparison {
  store: string
  items: (GroceryItem & { shoppingItemId: string })[]
  total: number
  savings: number
  outOfRadius?: boolean
  distanceMiles?: number
  locationHint?: string
  missingItems?: boolean
  missingCount?: number
  providerAliases?: string[]
  canonicalKey?: string
}

type StoreAggregationEntry = StoreComparison & {
  canonicalKey: string
  aliasSet: Set<string>
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
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [zipCode, setZipCode] = useState(DEFAULT_SHOPPING_ZIP)
  const [zipPromptOpen, setZipPromptOpen] = useState(false)
  const [zipDraft, setZipDraft] = useState("")
  const [profileLocation, setProfileLocation] = useState<{ lat: number; lng: number; formattedAddress?: string } | null>(
    null,
  )
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
  const [comparisonMessageIndex, setComparisonMessageIndex] = useState(0)

  const [carouselIndex, setCarouselIndex] = useState(0)
  const [shoppingListExpanded, setShoppingListExpanded] = useState(false)
  const [storeSortMode, setStoreSortMode] = useState<"best-price" | "nearest" | "best-value">("best-price")
  const carouselRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  const { user, loading: authLoading } = useAuth()
  const { theme } = useTheme()
  const getDomTheme = () => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light"
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    }
    return "dark" // default to site's base theme during SSR
  }
  const isDark = (mounted ? theme : getDomTheme()) === "dark"
  const comparisonMessages = isDark ? DARK_COMPARISON_MESSAGES : WARM_COMPARISON_MESSAGES
  const comparisonStatus = comparisonMessages[comparisonMessageIndex % comparisonMessages.length] ?? comparisonMessages[0]
  const { toast } = useToast()
  const loadPantryInventory = useCallback(async () => {
    if (!user) {
      setPantryInventory(new Map())
      return
    }

    try {
      const { data, error } = await supabase
        .from("pantry_items")
        .select("id, name, quantity, unit, standardized_ingredient_id, standardized_name")
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
          standardized_ingredient_id: item.standardized_ingredient_id,
          standardized_name: item.standardized_name,
        })

        // Also index by standardized_ingredient_id if available
        if (item.standardized_ingredient_id) {
          map.set(`std_${item.standardized_ingredient_id}`, {
            id: item.id,
            quantity: Number(item.quantity) || 0,
            unit: item.unit || null,
            standardized_ingredient_id: item.standardized_ingredient_id,
            standardized_name: item.standardized_name,
          })
        }
      })
      setPantryInventory(map)
      console.log("[Pantry] Loaded pantry inventory", { count: map.size })
    } catch (error) {
      console.error("Error loading pantry items:", error)
    }
  }, [user])

  const sortComparisons = useCallback(
    (comparisons: StoreComparison[], list: ShoppingListItem[] = shoppingList) => {
      if (!comparisons || comparisons.length === 0) return []

      const shoppingIds = list.map((item) => item.id)
      const enriched = comparisons.map((comparison) => {
        const missingCount = shoppingIds.filter(
          (shoppingId) => !comparison.items.some((item) => item.shoppingItemId === shoppingId),
        ).length
        return {
          ...comparison,
          missingCount,
          missingItems: missingCount > 0,
        }
      })

      const minTotal = enriched.reduce((min, comparison) => Math.min(min, comparison.total), enriched[0]?.total ?? 0)
      const withSavings = enriched.map((comparison) => ({
        ...comparison,
        savings: comparison.total - minTotal,
      }))

      return withSavings.sort((a, b) => {
        if (!!a.outOfRadius !== !!b.outOfRadius) {
          return Number(a.outOfRadius) - Number(b.outOfRadius)
        }
        if ((a.missingCount || 0) !== (b.missingCount || 0)) {
          return (a.missingCount || 0) - (b.missingCount || 0)
        }
        if (a.total !== b.total) {
          return a.total - b.total
        }
        return a.store.localeCompare(b.store)
      })
    },
    [shoppingList],
  )

  const refreshComparisonTotals = useCallback(
    (updatedList: ShoppingListItem[]) => {
      setMassSearchResults((prev) => {
        if (prev.length === 0) return prev

        const shoppingMap = new Map(updatedList.map((item) => [item.id, item]))
        const recalculated = prev.map((comparison) => {
          const total = comparison.items.reduce((sum, item) => {
            const source = shoppingMap.get(item.shoppingItemId)
            return sum + item.price * getPurchaseQuantity(source)
          }, 0)
          const missingCount = updatedList.filter(
            (listItem) => !comparison.items.some((item) => item.shoppingItemId === listItem.id),
          ).length

          return {
            ...comparison,
            total,
            missingCount,
            missingItems: missingCount > 0,
          }
        })

        return sortComparisons(recalculated, updatedList)
      })
    },
    [sortComparisons],
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  // Expand shopping list if navigated with expandList=true query param
  useEffect(() => {
    if (!mounted) return
    const expandList = searchParams.get("expandList")
    if (expandList === "true") {
      setShoppingListExpanded(true)
      // Scroll to the shopping list section
      setTimeout(() => {
        document.querySelector("[data-shopping-list]")?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 100)
    }
  }, [searchParams, mounted])

  useEffect(() => {
    if (!comparisonLoading) {
      setComparisonMessageIndex(0)
      return
    }
    const totalMessages = comparisonMessages.length || 1
    const rotateInterval = window.setInterval(() => {
      setComparisonMessageIndex((prev) => (prev + 1) % totalMessages)
    }, 2400)
    return () => clearInterval(rotateInterval)
  }, [comparisonLoading, comparisonMessages])

  useEffect(() => {
    // Wait for auth to finish loading before deciding on zip prompt
    if (authLoading) return

    if (user) {
      loadUserPreferences()
      loadShoppingList()
      loadRecipes()
      loadPantryInventory()
    } else {
      // For non-authenticated users, load ZIP from localStorage
      const savedZip = localStorage.getItem("shopping_zip_code")
      if (savedZip) {
        setZipCode(savedZip)
        setZipDraft(savedZip)
      } else {
        setZipPromptOpen(true)
      }
    }
  }, [user, authLoading, loadPantryInventory])

  useEffect(() => {
    if (!user) {
      setPantryInventory(new Map())
    }
  }, [user])

  // Load comparison results from browser storage on mount (10min expiry)
  useEffect(() => {
    if (typeof window === "undefined") return

    const stored = localStorage.getItem("shopping_comparison_results")
    if (!stored) return

    try {
      const { data, timestamp } = JSON.parse(stored)
      const now = Date.now()
      const tenMinutes = 10 * 60 * 1000

      if (now - timestamp < tenMinutes) {
        console.log("[Shopping] Restoring comparison results from browser storage", {
          ageMinutes: ((now - timestamp) / 60000).toFixed(1),
          storeCount: data.length,
        })
        setMassSearchResults(data)
      } else {
        console.log("[Shopping] Cached comparison results expired, clearing")
        localStorage.removeItem("shopping_comparison_results")
      }
    } catch (error) {
      console.error("[Shopping] Failed to load cached comparison results:", error)
      localStorage.removeItem("shopping_comparison_results")
    }
  }, [])

  // Save comparison results to browser storage (10min expiry)
  useEffect(() => {
    if (typeof window === "undefined") return
    if (massSearchResults.length === 0) return

    try {
      const payload = {
        data: massSearchResults,
        timestamp: Date.now(),
      }
      localStorage.setItem("shopping_comparison_results", JSON.stringify(payload))
      console.log("[Shopping] Saved comparison results to browser storage", {
        storeCount: massSearchResults.length,
      })
    } catch (error) {
      console.error("[Shopping] Failed to save comparison results:", error)
    }
  }, [massSearchResults])

  // Sort store comparisons based on selected mode
  const sortedComparisons = useMemo(() => {
    const sorted = [...massSearchResults]

    // Helper: Always prioritize stores with fewer missing items, then out of radius
    const prioritySort = (a: StoreComparison, b: StoreComparison) => {
      const aMissing = a.missingCount || 0
      const bMissing = b.missingCount || 0

      // Stores with missing items always go to the bottom
      if (aMissing !== bMissing) {
        return aMissing - bMissing
      }

      // Out of radius stores go below in-radius stores
      if (!!a.outOfRadius !== !!b.outOfRadius) {
        return Number(a.outOfRadius) - Number(b.outOfRadius)
      }

      return 0 // Equal priority, let secondary sort decide
    }

    switch (storeSortMode) {
      case "nearest":
        return sorted.sort((a, b) => {
          const priority = prioritySort(a, b)
          if (priority !== 0) return priority

          const distA = a.distanceMiles ?? Infinity
          const distB = b.distanceMiles ?? Infinity
          return distA - distB
        })
      case "best-value":
        return sorted.sort((a, b) => {
          const priority = prioritySort(a, b)
          if (priority !== 0) return priority

          const distA = a.distanceMiles ?? 10
          const distB = b.distanceMiles ?? 10
          const valueA = a.total / Math.max(distA, 0.5)
          const valueB = b.total / Math.max(distB, 0.5)
          return valueA - valueB
        })
      case "best-price":
      default:
        return sorted.sort((a, b) => {
          const priority = prioritySort(a, b)
          if (priority !== 0) return priority

          return a.total - b.total
        })
    }
  }, [massSearchResults, storeSortMode])

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
        .select("postal_code, grocery_distance_miles, formatted_address, latitude, longitude")
        .eq("id", user.id)
        .single()

      if (error) throw error

      const resolvedZip = data?.postal_code || DEFAULT_SHOPPING_ZIP
      setZipCode(resolvedZip)
      setZipDraft(resolvedZip)
      if (!resolvedZip) {
        setZipPromptOpen(true)
      }
      if (data?.latitude && data?.longitude) {
        setProfileLocation({
          lat: data.latitude,
          lng: data.longitude,
          formattedAddress: data.formatted_address || undefined,
        })
      } else {
        setProfileLocation(null)
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
    refreshComparisonTotals(updatedList)
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

  const fetchCheapestOptions = async (term: string, storeOverride?: string, forceRefresh?: boolean) => {
    if (!term.trim()) return
    setItemSearchModalLoading(true)
    try {
      const targetStore = storeOverride ?? itemSearchSource?.store
      const storeResults = await searchGroceryStores(term, zipCode, targetStore, undefined, forceRefresh)
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
    forceRefresh?: boolean,
  ) => {
    const normalizedTerm = term.trim()
    const storeOverride = source?.store
    setItemSearchModalTerm(normalizedTerm)
    setItemSearchSource(source)
    setItemSearchModalResults([])
    setItemSearchModalOpen(true)
    if (normalizedTerm) {
      fetchCheapestOptions(normalizedTerm, storeOverride, forceRefresh)
    }
  }

  const handleModalSearch = () => {
    if (!itemSearchModalTerm.trim()) return
    fetchCheapestOptions(itemSearchModalTerm.trim(), itemSearchSource?.store)
  }

  const integrateManualSelection = useCallback(
    (storeName: string, shoppingItemId: string, option: GroceryItem) => {
      const shoppingMap = new Map(shoppingList.map((item) => [item.id, item]))

      console.log("[Shopping] Integrating manual selection", {
        storeName,
        shoppingItemId,
        optionTitle: option.title,
      })
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
            return sum + item.price * getPurchaseQuantity(source)
          }, 0)

          return {
            ...comparison,
            items: updatedItems,
            total: newTotal,
            locationHint: comparison.locationHint || normalizedItem.location || option.location,
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
        console.log("[Shopping] Manual selection applied", {
          preferredStore,
          shoppingItemId: itemSearchSource.shoppingItemId,
          optionTitle: option.title,
        })
        integrateManualSelection(preferredStore, itemSearchSource.shoppingItemId, option)
        setMissingItems((prev) => prev.filter((item) => item.id !== itemSearchSource.shoppingItemId))

        // Cache the user's manual selection for future searches
        // This saves their preferred product choice to ingredient_cache
        try {
          const searchTerm = itemSearchModalTerm.trim()
          if (searchTerm) {
            console.log("[Shopping] Caching manual selection", { searchTerm, store: preferredStore, product: option.title })

            // Get or create standardized_ingredient_id for this search term
            const response = await fetch("/api/grocery-search/cache-selection", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                searchTerm,
                store: preferredStore,
                product: {
                  id: option.id,
                  title: option.title,
                  price: option.price,
                  unit: option.unit,
                  pricePerUnit: option.pricePerUnit,
                  image_url: option.image_url,
                  location: option.location,
                },
              }),
            })

            if (response.ok) {
              console.log("[Shopping] Successfully cached manual selection")
            } else {
              console.warn("[Shopping] Failed to cache selection:", await response.text())
            }
          }
        } catch (error) {
          console.error("[Shopping] Error caching manual selection:", error)
          // Don't show error to user - this is a background optimization
        }

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

  // Helper function to map store categories to pantry categories
  const mapStoreCategoryToPantry = (storeCategory?: string): string => {
    if (!storeCategory) return "Other"

    const normalized = storeCategory.toLowerCase()

    // Map common store categories to pantry categories
    if (normalized.includes("produce") || normalized.includes("fruit") || normalized.includes("vegetable")) {
      return "Produce"
    }
    if (normalized.includes("dairy") || normalized.includes("milk") || normalized.includes("cheese") || normalized.includes("yogurt")) {
      return "Dairy"
    }
    if (normalized.includes("meat") || normalized.includes("seafood") || normalized.includes("poultry") || normalized.includes("fish")) {
      return "Meat & Seafood"
    }
    if (normalized.includes("frozen")) {
      return "Frozen"
    }
    if (normalized.includes("beverage") || normalized.includes("drink") || normalized.includes("juice") || normalized.includes("soda")) {
      return "Beverages"
    }
    if (normalized.includes("snack") || normalized.includes("chip") || normalized.includes("cookie")) {
      return "Snacks"
    }
    if (normalized.includes("condiment") || normalized.includes("sauce") || normalized.includes("dressing")) {
      return "Condiments"
    }
    if (normalized.includes("baking") || normalized.includes("flour") || normalized.includes("sugar")) {
      return "Baking"
    }
    if (normalized.includes("pantry") || normalized.includes("canned") || normalized.includes("dry goods") || normalized.includes("grain") || normalized.includes("pasta") || normalized.includes("rice")) {
      return "Pantry Staples"
    }

    return "Other"
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
            category: mapStoreCategoryToPantry(item.category),
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

      const inserts: Array<{
        user_id: string
        name: string
        quantity: number
        unit: string | undefined
        category: string
      }> = []
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
            category: entry.category,
          })
        }
      })

      console.log("[Pantry] Processing Add to Pantry", {
        store: comparison.store,
        items: itemsToProcess.length,
        inserts: inserts.length,
        updates: updates.length,
      })

      // Insert new items and get their IDs
      let insertedItems: Array<{ id: string; name: string; quantity: number; unit: string }> = []
      if (inserts.length > 0) {
        const { data, error } = await supabase.from("pantry_items").insert(inserts).select()
        if (error) throw error
        insertedItems = data || []
      }

      for (const update of updates) {
        const { error } = await supabase
          .from("pantry_items")
          .update({ quantity: update.quantity })
          .eq("id", update.id)
        if (error) throw error
      }

      // Standardize newly inserted items
      if (insertedItems.length > 0) {
        for (const item of insertedItems) {
          try {
            const response = await fetch("/api/ingredients/standardize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                context: "pantry",
                pantryItemId: item.id,
                userId: user.id,
                ingredients: [
                  {
                    id: "pantry-0",
                    name: item.name,
                    amount: String(item.quantity),
                    unit: item.unit,
                  },
                ],
              }),
            })

            if (response.ok) {
              console.log(`[Pantry] Standardized item: ${item.name}`)
            }
          } catch (error) {
            console.warn(`[Pantry] Failed to standardize ${item.name}:`, error)
            // Continue processing other items even if one fails
          }
        }
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
    refreshComparisonTotals(updatedList)
  }

  const normalizeZip = (value: string) => {
    const match = value.match(/\b\d{5}(?:-\d{4})?\b/)
    if (match) return match[0].slice(0, 5)
    const trimmed = value.trim()
    return /^\d{5}$/.test(trimmed) ? trimmed : ""
  }

  const saveZipToProfile = async (value: string) => {
    const sanitized = normalizeZip(value)
    if (!sanitized) {
      toast({
        title: "Enter a valid ZIP",
        description: "Please provide a 5-digit ZIP code.",
        variant: "destructive",
      })
      return
    }

    // For non-authenticated users, save to localStorage
    if (!user) {
      try {
        localStorage.setItem("shopping_zip_code", sanitized)
        setZipCode(sanitized)
        setZipDraft(sanitized)
        setZipPromptOpen(false)
        toast({ title: "ZIP saved", description: "We'll use this to find nearby stores." })
      } catch (error) {
        console.error("Error saving ZIP to localStorage:", error)
        toast({
          title: "Unable to save ZIP",
          description: "Please try again.",
          variant: "destructive",
        })
      }
      return
    }

    // For authenticated users, save to database
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ postal_code: sanitized })
        .eq("id", user.id)
      if (error) throw error
      setZipCode(sanitized)
      setZipDraft(sanitized)
      setZipPromptOpen(false)
      toast({ title: "ZIP saved", description: "We'll use this to find nearby stores." })
    } catch (error) {
      console.error("Error saving ZIP:", error)
      toast({
        title: "Unable to save ZIP",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  // Helper function to check if a shopping item is in the pantry
  const getPantryMatch = (item: ShoppingListItem): PantryItemInfo | null => {
    // First try matching by standardized ingredient ID (most accurate)
    if (item.standardizedIngredientId) {
      const match = pantryInventory.get(`std_${item.standardizedIngredientId}`)
      if (match) return match
    }

    // Fallback to name matching
    const nameMatch = pantryInventory.get(item.name.trim().toLowerCase())
    return nameMatch || null
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
    refreshComparisonTotals(updatedList)
  }

  const removeRecipeItems = (recipeId: string, recipeName: string) => {
    const updatedList = shoppingList.filter((item) => item.recipeId !== recipeId)
    setShoppingList(updatedList)
    saveShoppingList(updatedList)
    refreshComparisonTotals(updatedList)

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
      standardizedIngredientId: ingredient.standardizedIngredientId || ingredient.standardized_ingredient_id,
      standardizedName: ingredient.standardizedName || ingredient.standardized_name,
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
    refreshComparisonTotals(mergedList)

    toast({
      title: "Ingredients added",
      description: `Added ${recipe.title} ingredients to your shopping list.`,
    })
  }

  const performMassSearch = async () => {
    if (!zipCode) {
      setZipPromptOpen(true)
      toast({
        title: "ZIP code required",
        description: "Add your ZIP to find nearby store prices.",
        variant: "destructive",
      })
      return
    }

    if (shoppingList.length === 0) {
      toast({
        title: "Empty shopping list",
        description: "Add items to your shopping list before performing a search.",
        variant: "destructive",
      })
      return
    }

    console.log("[Shopping] Starting mass search", {
      itemCount: shoppingList.length,
      items: shoppingList.map((item) => item.name),
    })
    setComparisonLoading(true)
    setMissingItems([])
    try {
      const searchPromises = shoppingList.map(async (item) => {
        const storeResults = await searchGroceryStores(item.name, zipCode, undefined, item.recipeId)
        return { item, storeResults }
      })

      const searchResults = await Promise.all(searchPromises)

      // Detailed logging for each item's store results
      searchResults.forEach(({ item, storeResults }) => {
        const storesWithItems = storeResults.filter(sr => sr.items && sr.items.length > 0)
        const storesWithoutItems = storeResults.filter(sr => !sr.items || sr.items.length === 0)
        console.log(`[Shopping] Item "${item.name}" results:`, {
          totalStoresReturned: storeResults.length,
          storesWithProducts: storesWithItems.map(sr => sr.store),
          storesEmpty: storesWithoutItems.map(sr => sr.store),
          productCounts: storeResults.map(sr => ({ store: sr.store, count: sr.items?.length || 0 }))
        })
      })

      console.log("[Shopping] Completed individual store lookups", {
        details: searchResults.map(({ item, storeResults }) => ({
          shoppingItem: item.name,
          stores: storeResults.length,
          storeNames: storeResults.map(sr => sr.store),
          itemCounts: storeResults.map(sr => sr.items?.length || 0),
        })),
      })

      const storeMap = new Map<string, StoreAggregationEntry>()
      const missing: ShoppingListItem[] = []

      searchResults.forEach(({ item, storeResults }) => {
        const hasResults = storeResults.some((storeResult) => storeResult.items && storeResult.items.length > 0)
        if (!hasResults) {
          missing.push(item)
          return
        }

        storeResults.forEach((storeResult) => {
          if (!storeResult.items || storeResult.items.length === 0) {
            return
          }
          const bestItem = storeResult.items.reduce((best, current) => (current.price < best.price ? current : best))
          if (!bestItem) {
            return
          }

          const rawStoreLabel =
            storeResult.store?.trim() ||
            bestItem.provider?.trim() ||
            bestItem.location?.trim() ||
            "Unknown Store"
          const normalizedKey = buildStoreKey(rawStoreLabel)
          const fallbackKey = rawStoreLabel.toLowerCase()
          const storeKey = normalizedKey || fallbackKey || `store-${storeMap.size + 1}`

          if (!storeMap.has(storeKey)) {
            const aliasSet = new Set<string>()
            if (rawStoreLabel) {
              aliasSet.add(rawStoreLabel)
            }
            storeMap.set(storeKey, {
              store: deriveStoreBrandLabel(storeKey, rawStoreLabel || "Unknown Store"),
              items: [],
              total: 0,
              savings: 0,
              canonicalKey: storeKey,
              aliasSet,
              providerAliases: aliasSet.size ? Array.from(aliasSet) : undefined,
            })
          }

          const store = storeMap.get(storeKey)!
          if (rawStoreLabel && !store.aliasSet.has(rawStoreLabel)) {
            store.aliasSet.add(rawStoreLabel)
            store.providerAliases = Array.from(store.aliasSet)
          }
          const primaryAlias = store.providerAliases?.[0] || rawStoreLabel
          store.store = deriveStoreBrandLabel(store.canonicalKey, primaryAlias || store.store)

          store.items.push({
            ...bestItem,
            shoppingItemId: item.id,
          })
          const purchaseQuantity = getPurchaseQuantity(item)
          store.total += bestItem.price * purchaseQuantity
          if (!store.locationHint) {
            store.locationHint = bestItem.location || primaryAlias
          }
        })
      })

      const comparisons = Array.from(storeMap.values()).map(({ aliasSet, ...rest }) => ({
        ...rest,
        providerAliases: rest.providerAliases ?? Array.from(aliasSet),
      }))

      console.log("[Shopping] Built comparisons from storeMap", {
        storeMapSize: storeMap.size,
        comparisonsCount: comparisons.length,
        missingCount: missing.length,
        stores: comparisons.map(c => ({ store: c.store, items: c.items.length, total: c.total })),
      })

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
          let userLoc = profileLocation
          let locationSource: "profile" | "postal" | "none" = userLoc ? "profile" : "none"

          // Fall back to postal code geocoding if no profile location
          // Note: We don't use browser geolocation here to avoid policy violations
          // (browser geolocation requires explicit user gesture)
          if (!userLoc && zipCode) {
            const postalCoords = await geocodePostalCode(zipCode)
            if (postalCoords) {
              userLoc = postalCoords
              locationSource = "postal"
            }
          }

          if (userLoc) {
            let startAddress =
              locationSource === "profile"
                ? profileLocation?.formattedAddress
                : await reverseGeocodeCoordinates(userLoc.lat, userLoc.lng)
            if (!startAddress && locationSource === "postal" && zipCode) {
              startAddress = `Postal code ${zipCode}`
            }

            console.log("[Geocoding] Using user location for distance filtering", {
              source: locationSource,
              coordinates: userLoc,
              postalCode: zipCode,
              radiusMiles: groceryDistanceMiles,
              address: startAddress,
            })
            const storeQueryEntries = comparisons.map((comparison, index) => {
              const aliasCandidates = Array.from(
                new Set(
                  [
                    ...(comparison.providerAliases ?? []),
                    comparison.store,
                  ]
                    .map((alias) => alias?.trim())
                    .filter((alias): alias is string => !!alias)
                )
              )
              const primaryAlias = aliasCandidates[0] || comparison.store || `Store ${index + 1}`
              const aliasHints = aliasCandidates.slice(1)
              const hintPieces = [comparison.locationHint, aliasHints.length ? aliasHints.join(", ") : null].filter(Boolean)
              return {
                queryName: primaryAlias || comparison.store || `Store ${index + 1}`,
                hint: hintPieces.length > 0 ? hintPieces.join(" • ") : undefined,
                aliases: aliasCandidates.length ? aliasCandidates : undefined,
              }
            })

            const storeNames = storeQueryEntries.map(
              (entry, idx) => entry.queryName || comparisons[idx]?.store || "Unknown Store",
            )
            const storeMetadata = new Map(
              storeQueryEntries.map((entry) => [entry.queryName, { hint: entry.hint, aliases: entry.aliases }]),
            )
            const geocodedStores = await geocodeMultipleStores(
              storeNames,
              zipCode,
              userLoc,
              groceryDistanceMiles,
              storeMetadata,
            )

            const storeDistances = new Map<string, number>()
            comparisons.forEach((comparison, idx) => {
              const lookupKey =
                comparison.canonicalKey || buildStoreKey(storeQueryEntries[idx]?.queryName || comparison.store)
              if (!lookupKey) return
              const geocoded = geocodedStores.get(lookupKey)
              if (geocoded) {
                const distance = calculateDistance(userLoc.lat, userLoc.lng, geocoded.lat, geocoded.lng)
                storeDistances.set(lookupKey, distance)
              }
            })

            const inRange: StoreComparison[] = []
            const outOfRange: StoreComparison[] = []
            const outOfRangeNames: string[] = []

            comparisons.forEach((comparison, index) => {
              const lookupKey =
                comparison.canonicalKey || buildStoreKey(storeQueryEntries[index]?.queryName || comparison.store)
              const distance = lookupKey ? storeDistances.get(lookupKey) : undefined
              const geocoded = lookupKey ? geocodedStores.get(lookupKey) : undefined
              const comparisonWithDistance = {
                ...comparison,
                distanceMiles: distance,
              }

              if (distance === undefined) {
                console.warn("[Geocoding] Skipping map marker due to missing coordinates", {
                  store: comparison.store,
                  hint: comparison.locationHint,
                  formattedAddress: geocoded?.formattedAddress,
                  coordinates: geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : null,
                })
                outOfRange.push({ ...comparisonWithDistance, outOfRadius: true })
                outOfRangeNames.push(`${comparison.store} (location unavailable)`)
              } else if (distance > maxDistanceMiles) {
                console.warn("[Geocoding] Store filtered for exceeding radius", {
                  store: comparison.store,
                  distanceMiles: distance,
                  formattedAddress: geocoded?.formattedAddress,
                  coordinates: geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : null,
                  radiusMiles: maxDistanceMiles,
                })
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
                } outside your ${maxDistanceMiles.toFixed(0)} mile radius or missing a precise location. We've moved ${
                  outOfRangeNames.length === 1 ? "it" : "them"
                } to the end of the list and hidden ${
                  outOfRangeNames.length === 1 ? "its" : "their"
                } map marker${outOfRangeNames.length === 1 ? "" : "s"}.`,
              )
            } else {
              setDistanceFilterWarning(null)
            }
          } else {
            console.warn("[Geocoding] User location unavailable; skipping distance filtering", { postalCode: zipCode })
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

      const sorted = sortComparisons(filteredComparisons)
      console.log("[Shopping] Mass search finalized", {
        stores: sorted.map((comparison) => ({
          store: comparison.store,
          total: comparison.total,
          missingItems: comparison.missingItems,
          outOfRadius: comparison.outOfRadius,
        })),
        missingCount: missing.length,
      })
      setMassSearchResults(sorted)
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

const getStoreLogoPath = (store: string) => {
  const key = store.trim().toLowerCase()
  if (key.includes("target")) return "/Target.jpg"
  if (key.includes("kroger")) return "/kroger.jpg"
  if (key.includes("meijer")) return "/meijers.png"
  if (key.includes("99")) return "/99ranch.png"
  if (key.includes("walmart")) return "/walmart.png"
  if (key.includes("trader")) return "/trader-joes.png"
  if (key.includes("aldi")) return "/aldi.png"
  if (key.includes("safeway")) return "/safeway.jpeg"
  return "/placeholder-logo.png"
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

  const handleStoreCardClick = (index: number, event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest("button")) {
      return
    }
    scrollToStore(index)
  }

  const renderStoreCard = (comparison: StoreComparison, index: number) => {
    const aliasNames =
      comparison.providerAliases?.filter(
        (alias) => alias && alias.toLowerCase() !== comparison.store.toLowerCase(),
      ) ?? []
    const aliasPreview =
      aliasNames.length > 0 ? aliasNames.slice(0, 2).join(", ") + (aliasNames.length > 2 ? "…" : "") : null

    return (
      <div
        key={`${comparison.canonicalKey || comparison.store}-${index}`}
        className="flex-shrink-0 w-full snap-center cursor-pointer"
        onClick={(event) => handleStoreCardClick(index, event)}
      >
        <Card
          className={`h-full flex flex-col ${cardBgClass} ${
            index === 0 ? "border-2 border-green-500" : comparison.outOfRadius ? "border-yellow-500/60" : ""
          }`}
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{getStoreIcon(comparison.store)}</span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-2xl ${textClass}`}>{comparison.store}</span>
                    {index === 0 && <Badge className="bg-green-500 text-white">Best Price</Badge>}
                    {comparison.outOfRadius && (
                      <Badge variant="destructive" className="bg-yellow-500 text-black">
                        Outside Radius
                      </Badge>
                    )}
                    {comparison.missingItems && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-200">
                        Missing Items{typeof comparison.missingCount === "number" ? ` (${comparison.missingCount})` : ""}
                      </Badge>
                    )}
                  </div>
                  {aliasPreview && <p className={`text-xs ${mutedTextClass}`}>Local signage: {aliasPreview}</p>}
                  {typeof comparison.distanceMiles === "number" ? (
                    <p className={`text-sm ${mutedTextClass}`}>{comparison.distanceMiles.toFixed(1)} miles away</p>
                  ) : null}
                  <div className="text-right mt-1">
                    <div className={`text-3xl font-bold ${textClass}`}>${comparison.total.toFixed(2)}</div>
                    {comparison.savings > 0 && (
                      <div className="text-sm text-red-600">+${comparison.savings.toFixed(2)} more</div>
                    )}
                  </div>
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            {comparison.outOfRadius && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">
                Outside your {groceryDistanceMiles ?? DEFAULT_GROCERY_DISTANCE_MILES} mile radius. Hidden from the map but
                included here for reference.
              </p>
            )}
            <div className="space-y-3 flex-1 max-h-[500px] overflow-y-auto pr-1">
              {comparison.items.map((item) => {
                const shoppingItem = shoppingList.find((si) => si.id === item.shoppingItemId)
                const purchaseQuantity = getPurchaseQuantity(shoppingItem)
                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-4 rounded-lg ${
                      theme === "dark" ? "bg-[#181813]" : "bg-gray-50"
                    }`}
                  >
                    <img src={item.image_url || "/placeholder.svg"} alt={item.title} className="w-16 h-16 object-cover rounded" />
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium text-sm truncate ${textClass}`}>{item.title}</h3>
                      <p className={`text-xs ${mutedTextClass}`}>{item.brand}</p>
                      {shoppingItem && (
                        <p className={`text-xs ${mutedTextClass} mt-1`}>
                          Qty: {shoppingItem.quantity}
                          {shoppingItem.unit ? ` ${shoppingItem.unit}` : ""}
                          {purchaseQuantity > 1 ? ` • Buying ${purchaseQuantity}` : ""}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <div className="text-sm">
                          <span className={`font-semibold ${textClass}`}>${item.price.toFixed(2)}</span>
                          {item.pricePerUnit && <span className={`${mutedTextClass} ml-1`}>({item.pricePerUnit})</span>}
                          {shoppingItem && purchaseQuantity > 1 && (
                            <span className={`${mutedTextClass} ml-2`}>
                              Total: ${(item.price * purchaseQuantity).toFixed(2)}
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
                              }, true) // forceRefresh = true to bypass cache
                            }
                            className={`h-6 px-2 ${buttonOutlineClass}`}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Reload
                          </Button>
                          {shoppingItem && (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateItemQuantity(shoppingItem.id, -1)}
                                disabled={shoppingItem.quantity <= 1}
                                className={`h-7 px-2 ${buttonOutlineClass}`}
                              >
                                -
                              </Button>
                              <span className={`min-w-[34px] text-center text-sm ${textClass}`}>{shoppingItem.quantity}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateItemQuantity(shoppingItem.id, 1)}
                                className={`h-7 px-2 ${buttonOutlineClass}`}
                              >
                                +
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {comparison.missingItems && (
                <div className="mt-4 border-t border-dashed border-border pt-4">
                  <p className={`text-sm font-semibold ${textClass} mb-2`}>Missing Items</p>
                  <div className="space-y-2">
                    {shoppingList
                      .filter((listItem) => !comparison.items.some((item) => item.shoppingItemId === listItem.id))
                      .map((listItem) => (
                        <div key={listItem.id} className={`text-sm ${mutedTextClass} flex items-center justify-between gap-4`}>
                          <div>
                            <div>{listItem.name}</div>
                            <div className="text-xs">Qty: {listItem.quantity}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              openItemSearchOverlay(listItem.name, {
                                type: "missing",
                                shoppingItemId: listItem.id,
                                store: comparison.store,
                              }, true) // forceRefresh = true to bypass cache
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
            </div>
          </CardContent>
          <CardFooter className="border-t border-dashed border-border/40 flex justify-end">
            <Button size="sm" className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white" onClick={() => addStoreItemsToPantry(comparison)} disabled={!user || comparison.items.length === 0}>
              Add to Pantry
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  const bgClass = isDark ? "bg-[#181813]" : "bg-gray-50"
  const textClass = theme === "dark" ? "text-[#e8dcc4]" : "text-gray-900"
  const cardBgClass = theme === "dark" ? "bg-[#1f1e1a] border-[#e8dcc4]/20" : "bg-white"
  const mutedTextClass = theme === "dark" ? "text-[#e8dcc4]/70" : "text-gray-600"
  const buttonClass =
    theme === "dark" ? "bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0]" : "bg-orange-500 hover:bg-orange-600 text-white"
  const buttonOutlineClass =
    theme === "dark"
      ? "border-[#e8dcc4]/40 text-[#e8dcc4] hover:bg-[#e8dcc4]/10 hover:text-[#e8dcc4]"
      : "border-gray-300 hover:bg-[#e8dcc4]/10"
  const spinnerAccentClass =
    theme === "dark"
      ? "border-[#e8dcc4]/80 shadow-[0_0_28px_rgba(232,220,196,0.35)]"
      : "border-orange-400/80 shadow-[0_0_28px_rgba(249,115,22,0.35)]"
  const overlayTitle = comparisonLoading ? comparisonStatus.title : "Searching for groceries…"
  const overlayMessage = comparisonLoading
    ? comparisonStatus.description
    : "Hang tight while we check every store in range."

  if (!mounted) {
    return <div className={`min-h-screen ${bgClass}`} />
  }

  return (
    <div className={`min-h-screen ${bgClass}`}>
      <Dialog open={zipPromptOpen} onOpenChange={setZipPromptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enter your ZIP code</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">We need your ZIP to show prices from nearby stores.</p>
            <Input
              value={zipDraft}
              onChange={(e) => setZipDraft(e.target.value)}
              placeholder="e.g., 94709"
              inputMode="numeric"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setZipPromptOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => saveZipToProfile(zipDraft)}>Save ZIP</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
              <span
                className={`h-12 w-12 animate-spin rounded-full border-4 border-t-transparent ${spinnerAccentClass}`}
              ></span>
            </div>
            <h2 className="text-2xl font-semibold mb-2">{overlayTitle}</h2>
            <p className={theme === "dark" ? "text-[#e8dcc4]/70" : "text-gray-600"}>{overlayMessage}</p>
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
          <Card className={cardBgClass} data-shopping-list>
              <CardHeader
                className="cursor-pointer hover:border-primary border-2 border-transparent transition-colors rounded-t-lg"
                onClick={() => setShoppingListExpanded(!shoppingListExpanded)}
              >
                <CardTitle className={`flex items-center justify-between ${textClass}`}>
                  <div className="flex items-center gap-2 flex-1">
                    <ShoppingCart className="h-5 w-5" />
                    Shopping List
                    <Badge variant="secondary" className="ml-2">
                      {shoppingList.length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    {shoppingList.length > 0 && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          performMassSearch()
                        }}
                        size="sm"
                        className={buttonClass}
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Compare Stores
                      </Button>
                    )}
                    {shoppingListExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              {shoppingListExpanded && <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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
                </div>

                <div className="flex flex-col gap-2 sm:flex-row" data-tutorial="shopping-add-item">
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
                  <Button
                    onClick={addCustomItem}
                    disabled={!newItem.trim()}
                    className={`${buttonClass} w-full sm:w-auto`}
                  >
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
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              removeRecipeItems(key, group.recipeName)
                            }}
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
                              {(() => {
                                const pantryMatch = getPantryMatch(item)
                                const displayName = item.standardizedName || item.name
                                return (
                                  <>
                                    <h3
                                      className={`font-medium ${item.checked ? `line-through ${mutedTextClass}` : textClass}`}
                                    >
                                      <span>{displayName}</span>
                                    </h3>
                                    <p className={`text-sm ${mutedTextClass}`}>
                                      {item.quantity} {item.unit}
                                    </p>
                                    {pantryMatch && (
                                      <div className={`mt-1 text-xs flex items-center gap-1 ${
                                        theme === "dark" ? "text-emerald-400" : "text-emerald-600"
                                      }`}>
                                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                                        <span>
                                          You may have this — {pantryMatch.standardized_name || "in pantry"}
                                          {pantryMatch.quantity ? ` (${pantryMatch.quantity} ${pantryMatch.unit || ""}`.trim() + ")" : ""}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                )
                              })()}
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
              </CardContent>}
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
                          {carouselIndex + 1} / {sortedComparisons.length}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={nextStore}
                          disabled={carouselIndex === sortedComparisons.length - 1}
                          className={buttonOutlineClass}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Sorting Options */}
                    <div className="flex gap-2 mb-4">
                      <Button
                        variant={storeSortMode === "best-price" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStoreSortMode("best-price")}
                        className={storeSortMode === "best-price" ? "bg-green-600 hover:bg-green-700 text-white" : buttonOutlineClass}
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Best Price
                      </Button>
                      <Button
                        variant={storeSortMode === "nearest" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStoreSortMode("nearest")}
                        className={storeSortMode === "nearest" ? "bg-green-600 hover:bg-green-700 text-white" : buttonOutlineClass}
                      >
                        Nearest
                      </Button>
                      <Button
                        variant={storeSortMode === "best-value" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStoreSortMode("best-value")}
                        className={storeSortMode === "best-value" ? "bg-green-600 hover:bg-green-700 text-white" : buttonOutlineClass}
                      >
                        Best Value
                      </Button>
                    </div>

                    {/* Quick Store Nav */}
                    <div className="flex flex-wrap gap-3 mb-4">
                      {sortedComparisons.map((store, index) => {
                        const isActive = index === carouselIndex
                        const logoPath = getStoreLogoPath(store.store)
                        return (
                          <button
                            key={`${store.store}-${index}`}
                            onClick={() => scrollToStore(index)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                              isActive
                                ? "border-green-600 bg-green-600/10"
                                : theme === "dark"
                                  ? "border-border/60 hover:border-green-600/60"
                                  : "border-border hover:border-green-600/60"
                            }`}
                            title={`Jump to ${store.store}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden border border-border/50">
                              <img
                                src={logoPath}
                                alt={`${store.store} logo`}
                                className="w-7 h-7 object-contain"
                              />
                            </div>
                            <div className="text-left">
                              <p className={`text-sm font-semibold ${textClass}`}>{store.store}</p>
                              <p className="text-xs text-muted-foreground">${store.total.toFixed(2)}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Carousel Container */}
                    <div
                      ref={carouselRef}
                      className="flex gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4"
                      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                    >
                      {sortedComparisons.map(renderStoreCard)}
                    </div>

                    {/* Carousel Dots Indicator */}
                    <div className="flex justify-center gap-2 mt-4">
                      {sortedComparisons.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => scrollToStore(index)}
                          className={`w-2 h-2 rounded-full transition-all ${
                            index === carouselIndex
                              ? "bg-green-600 w-8"
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
                      comparisons={sortedComparisons}
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
                                  openItemSearchOverlay(item.name, { type: "missing", shoppingItemId: item.id }, true) // forceRefresh
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
