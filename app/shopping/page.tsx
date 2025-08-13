"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { ChefHat, Search as SearchIcon, DollarSign, Plus, X, Check, ShoppingCart, Heart } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { searchGroceryStores } from "@/lib/grocery-scrapers"

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
}

interface Recipe {
  id: string
  title: string
  ingredients: any[]
}

interface StoreComparison {
  store: string
  items: (GroceryItem & { shoppingItemId: string })[]
  total: number
  savings: number
}

export default function ShoppingPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [zipCode, setZipCode] = useState("47906")
  const [searchResults, setSearchResults] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([])
  const [newItem, setNewItem] = useState("")
  const [activeTab, setActiveTab] = useState("search")
  const [showRecipeDialog, setShowRecipeDialog] = useState(false)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [selectedRecipe, setSelectedRecipe] = useState<string>("")
  const [massSearchResults, setMassSearchResults] = useState<StoreComparison[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [draggedRecipe, setDraggedRecipe] = useState<string | null>(null)

  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    if (user) {
      loadShoppingList()
      loadRecipes() // Load recipes when user is available
    }
  }, [user])

  const loadShoppingList = async () => {
    if (!user) return

    try {
      const { data } = await supabase
        .from("shopping_lists")
        .select("items")
        .eq("user_id", user.id)
        .single()

      if (data?.items) {
        setShoppingList(data.items)
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

      // Load user's favorited recipes
      const { data: favoriteRecipes, error: favoriteError } = await supabase
        .from("recipe_favorites")
        .select(`
          recipe:recipes (
            id, title, ingredients
          )
        `)
        .eq("user_id", user.id)

      if (favoriteError) throw favoriteError

      // Combine own recipes and favorited recipes
      const ownRecipesList = ownRecipes || []
      const favoritedRecipesList = favoriteRecipes?.map(item => item.recipe).filter(Boolean) || []
      
      // Remove duplicates (in case user favorited their own recipe)
      const allRecipes = [...ownRecipesList]
      favoritedRecipesList.forEach((favRecipe: any) => {
        if (!allRecipes.find(recipe => recipe.id === favRecipe.id)) {
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
      const { error } = await supabase
        .from("shopping_lists")
        .upsert({
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
      // Flatten the store results into a single array of grocery items
      const flattenedResults = storeResults.flatMap(store => store.items)
      setSearchResults(flattenedResults)
      setActiveTab("search")
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

  const addToShoppingList = (item: GroceryItem) => {
    const newShoppingItem: ShoppingListItem = {
      id: Date.now().toString(),
      name: item.title,
      quantity: 1,
      unit: item.unit || "piece",
      checked: false,
    }

    const updatedList = [...shoppingList, newShoppingItem]
    setShoppingList(updatedList)
    saveShoppingList(updatedList)

    toast({
      title: "Added to shopping list",
      description: `${item.title} has been added to your shopping list.`,
    })
  }

  const addCustomItem = () => {
    if (!newItem.trim()) return

    const newShoppingItem: ShoppingListItem = {
      id: Date.now().toString(),
      name: newItem.trim(),
      quantity: 1,
      unit: "piece",
      checked: false,
    }

    const updatedList = [...shoppingList, newShoppingItem]
    setShoppingList(updatedList)
    saveShoppingList(updatedList)
    setNewItem("")

    toast({
      title: "Added to shopping list",
      description: `${newItem.trim()} has been added to your shopping list.`,
    })
  }

  const updateItemQuantity = (id: string, change: number) => {
    const updatedList = shoppingList.map((item) =>
      item.id === id ? { ...item, quantity: Math.max(1, item.quantity + change) } : item
    )
    setShoppingList(updatedList)
    saveShoppingList(updatedList)
  }

  const toggleItemChecked = (id: string) => {
    const updatedList = shoppingList.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    )
    setShoppingList(updatedList)
    saveShoppingList(updatedList)
  }

  const removeItem = (id: string) => {
    const updatedList = shoppingList.filter((item) => item.id !== id)
    setShoppingList(updatedList)
    saveShoppingList(updatedList)
  }

  const addRecipeIngredients = async (recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId)
    if (!recipe) return

    const newItems: ShoppingListItem[] = recipe.ingredients.map((ingredient: any) => ({
      id: Date.now().toString() + Math.random(),
      name: ingredient.name,
      quantity: parseFloat(ingredient.amount) || 1,
      unit: ingredient.unit || "piece",
      checked: false,
    }))

    // Merge with existing items, combining quantities for duplicates
    const mergedList = [...shoppingList]
    newItems.forEach((newItem) => {
      const existingIndex = mergedList.findIndex(
        (item) => item.name.toLowerCase() === newItem.name.toLowerCase(),
      )
      if (existingIndex >= 0) {
        mergedList[existingIndex].quantity += newItem.quantity
      } else {
        mergedList.push(newItem)
      }
    })

    setShoppingList(mergedList)
    saveShoppingList(mergedList)
    setShowRecipeDialog(false)
    setSelectedRecipe("")

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
    try {
      const searchPromises = shoppingList.map(async (item) => {
        const storeResults = await searchGroceryStores(item.name, zipCode)
        return { item, storeResults }
      })

      const searchResults = await Promise.all(searchPromises)

      // Process results to find best prices per store
      const storeMap = new Map<string, StoreComparison>()

      searchResults.forEach(({ item, storeResults }) => {
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
          const bestItem = storeResult.items.reduce((best, current) =>
            current.price < best.price ? current : best,
          )

          if (bestItem) {
            store.items.push({
              ...bestItem,
              shoppingItemId: item.id,
            })
            store.total += bestItem.price * item.quantity
          }
        })
      })

      const comparisons = Array.from(storeMap.values())
      const minTotal = Math.min(...comparisons.map((c) => c.total))

      // Calculate savings
      comparisons.forEach((comparison) => {
        comparison.savings = comparison.total - minTotal
      })

      // Sort by total price
      comparisons.sort((a, b) => a.total - b.total)

      setMassSearchResults(comparisons)
      setShowComparison(true)
      setActiveTab("comparison")
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
    const grouped = results.reduce((acc, item) => {
      if (!acc[item.provider]) {
        acc[item.provider] = []
      }
      acc[item.provider].push(item)
      return acc
    }, {} as Record<string, GroceryItem[]>)

    return Object.entries(grouped).map(([store, items]) => ({
      store,
      items: items.sort((a, b) => a.price - b.price),
      total: items.reduce((sum, item) => sum + item.price, 0),
    }))
  }

  // Drag and drop handlers
  const handleDragStart = (recipeId: string) => setDraggedRecipe(recipeId)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedRecipe) {
      addRecipeIngredients(draggedRecipe)
      setDraggedRecipe(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Shopping & Price Search</h1>
          <p className="text-gray-600">Find the best prices and manage your shopping list</p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="search">Price Search</TabsTrigger>
            <TabsTrigger value="list">Shopping List</TabsTrigger>
            <TabsTrigger value="comparison">Store Comparison</TabsTrigger>
          </TabsList>

          {/* Price Search Tab */}
          <TabsContent value="search" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SearchIcon className="h-5 w-5" />
                  Search for Groceries
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="search-term">Search Term</Label>
                    <Input
                      id="search-term"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="e.g., apples, milk, bread"
                      onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="zip-code">Zip Code</Label>
                    <Input
                      id="zip-code"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="47906"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleSearch} disabled={loading} className="w-full">
                      {loading ? "Searching..." : "Search"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-6">
                {groupResultsByStore(searchResults).map((storeGroup) => (
                  <Card key={storeGroup.store}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <span className="text-2xl">{getStoreIcon(storeGroup.store)}</span>
                        {storeGroup.store}
                        <Badge variant="secondary" className="ml-auto">
                          ${storeGroup.total.toFixed(2)} total
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {storeGroup.items.map((item) => (
                          <Card key={item.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <img
                                  src={item.image_url}
                                  alt={item.title}
                                  className="w-16 h-16 object-cover rounded-lg"
                                />
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-medium text-sm truncate">{item.title}</h3>
                                  <p className="text-xs text-gray-500">{item.brand}</p>
                                  <div className="flex items-center justify-between mt-2">
                                    <div className="text-sm">
                                      <span className="font-semibold">${item.price.toFixed(2)}</span>
                                      {item.pricePerUnit && (
                                        <span className="text-gray-500 ml-1">({item.pricePerUnit})</span>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => addToShoppingList(item)}
                                      className="h-8 px-3"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Shopping List Tab */}
          <TabsContent value="list" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Shopping List
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add Recipe Ingredients */}
                <div className="flex items-center gap-4">
                  <Dialog open={showRecipeDialog} onOpenChange={setShowRecipeDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
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
                              <Card className="hover:shadow-lg transition-shadow">
                                <CardContent className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                                      <ChefHat className="h-6 w-6 text-orange-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h3 className="font-medium text-sm truncate">{recipe.title}</h3>
                                      <p className="text-xs text-gray-500">
                                        {recipe.ingredients.length} ingredients
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-3 text-xs text-gray-500">
                                    <p>Click to add or drag to shopping list</p>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button onClick={performMassSearch} disabled={shoppingList.length === 0}>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>

                {/* Add Custom Item */}
                <div className="flex gap-2">
                  <Input
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="Add custom item..."
                    onKeyPress={(e) => e.key === "Enter" && addCustomItem()}
                  />
                  <Button onClick={addCustomItem} disabled={!newItem.trim()}>
                    Add
                  </Button>
                </div>

                {/* Shopping List Items */}
                <div className="space-y-2">
                  {shoppingList.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        item.checked ? "bg-gray-50" : "bg-white"
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
                      <div className="flex-1">
                        <h3 className={`font-medium ${item.checked ? "line-through text-gray-500" : ""}`}>
                          {item.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {item.quantity} {item.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateItemQuantity(item.id, -1)}
                          disabled={item.quantity <= 1}
                        >
                          -
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateItemQuantity(item.id, 1)}
                        >
                          +
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeItem(item.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Store Comparison Tab */}
          <TabsContent value="comparison" className="space-y-6">
            {comparisonLoading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
                  <p>Searching all stores...</p>
                </CardContent>
              </Card>
            ) : massSearchResults.length > 0 ? (
              <div className="space-y-6">
                {/* Store Comparison Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {massSearchResults.map((comparison, index) => (
                    <Card key={comparison.store} className="h-fit">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{getStoreIcon(comparison.store)}</span>
                            {comparison.store}
                            {index === 0 && (
                              <Badge className="bg-green-100 text-green-800">Best Price</Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold">${comparison.total.toFixed(2)}</div>
                            {comparison.savings > 0 && (
                              <div className="text-sm text-red-600">
                                +${comparison.savings.toFixed(2)} more
                              </div>
                            )}
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {comparison.items.map((item) => (
                            <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                              <img
                                src={item.image_url}
                                alt={item.title}
                                className="w-12 h-12 object-cover rounded"
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-sm truncate">{item.title}</h3>
                                <p className="text-xs text-gray-500">{item.brand}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <div className="text-sm">
                                    <span className="font-semibold">${item.price.toFixed(2)}</span>
                                    {item.pricePerUnit && (
                                      <span className="text-gray-500 ml-1">({item.pricePerUnit})</span>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => addToShoppingList(item)}
                                    className="h-6 px-2"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Summary Card */}
                <Card className="bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-orange-600" />
                      Shopping Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">
                          ${massSearchResults[0]?.total.toFixed(2) || "0.00"}
                        </p>
                        <p className="text-sm text-gray-600">Best Total Price</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-red-600">
                          ${massSearchResults[massSearchResults.length - 1]?.total.toFixed(2) || "0.00"}
                        </p>
                        <p className="text-sm text-gray-600">Highest Total Price</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">
                          ${(massSearchResults[massSearchResults.length - 1]?.total || 0) - (massSearchResults[0]?.total || 0) > 0 
                            ? ((massSearchResults[massSearchResults.length - 1]?.total || 0) - (massSearchResults[0]?.total || 0)).toFixed(2)
                            : "0.00"}
                        </p>
                        <p className="text-sm text-gray-600">Potential Savings</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No comparison data</h3>
                  <p className="text-gray-600 mb-6">
                    Add items to your shopping list and perform a search to see store comparisons.
                  </p>
                  <Button onClick={() => setActiveTab("list")}>
                    Go to Shopping List
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
