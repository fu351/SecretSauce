"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, ShoppingCart, Plus, Minus, ChevronLeft, ChevronRight, MapPin } from "lucide-react"
import { searchGroceryStores } from "@/lib/grocery-scrapers"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"

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

interface StoreResults {
  store: string
  items: GroceryItem[]
  total: number
}

interface ShoppingListItem {
  id: string
  name: string
  quantity: number
  unit: string
  checked: boolean
}

export default function ShoppingPage() {
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState("")
  const [zipCode, setZipCode] = useState("47906")
  const [loading, setLoading] = useState(false)
  const [storeResults, setStoreResults] = useState<StoreResults[]>([])
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([])
  const [newItem, setNewItem] = useState({ name: "", quantity: 1, unit: "piece" })
  const [currentStoreIndex, setCurrentStoreIndex] = useState(0)

  // Load shopping list from database
  useEffect(() => {
    if (user) {
      loadShoppingList()
    }
  }, [user])

  const loadShoppingList = async () => {
    try {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false })

      if (error) throw error

      if (data && data.length > 0) {
        setShoppingList(data[0].items || [])
      }
    } catch (error) {
      console.error("Error loading shopping list:", error)
    }
  }

  const saveShoppingList = async (items: ShoppingListItem[]) => {
    if (!user) return

    try {
      const { error } = await supabase.from("shopping_lists").upsert({
        user_id: user.id,
        items,
        updated_at: new Date().toISOString(),
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
      const results = await searchGroceryStores(searchTerm, zipCode)
      setStoreResults(results)
      setCurrentStoreIndex(0)
    } catch (error) {
      console.error("Error searching stores:", error)
    } finally {
      setLoading(false)
    }
  }

  const addToShoppingList = (item: GroceryItem) => {
    const existingItem = shoppingList.find((listItem) => listItem.name.toLowerCase() === item.title.toLowerCase())

    let updatedList: ShoppingListItem[]

    if (existingItem) {
      updatedList = shoppingList.map((listItem) =>
        listItem.id === existingItem.id ? { ...listItem, quantity: listItem.quantity + 1 } : listItem,
      )
    } else {
      const newListItem: ShoppingListItem = {
        id: `item-${Date.now()}-${Math.random()}`,
        name: item.title,
        quantity: 1,
        unit: item.unit || "piece",
        checked: false,
      }
      updatedList = [...shoppingList, newListItem]
    }

    setShoppingList(updatedList)
    saveShoppingList(updatedList)
  }

  const addCustomItem = () => {
    if (!newItem.name.trim()) return

    const customItem: ShoppingListItem = {
      id: `custom-${Date.now()}-${Math.random()}`,
      name: newItem.name,
      quantity: newItem.quantity,
      unit: newItem.unit,
      checked: false,
    }

    const updatedList = [...shoppingList, customItem]
    setShoppingList(updatedList)
    saveShoppingList(updatedList)
    setNewItem({ name: "", quantity: 1, unit: "piece" })
  }

  const updateItemQuantity = (id: string, change: number) => {
    const updatedList = shoppingList
      .map((item) => {
        if (item.id === id) {
          const newQuantity = Math.max(0, item.quantity + change)
          return newQuantity === 0 ? null : { ...item, quantity: newQuantity }
        }
        return item
      })
      .filter(Boolean) as ShoppingListItem[]

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

  const addToPantry = async () => {
    if (!user || shoppingList.length === 0) return

    try {
      const checkedItems = shoppingList.filter((item) => item.checked)

      if (checkedItems.length === 0) {
        alert("Please check off items you want to add to your pantry")
        return
      }

      // Get existing pantry items
      const { data: existingPantry, error: fetchError } = await supabase
        .from("pantry_items")
        .select("*")
        .eq("user_id", user.id)

      if (fetchError) throw fetchError

      const existingItems = existingPantry || []

      // Process each checked item
      for (const item of checkedItems) {
        const existingItem = existingItems.find(
          (pantryItem) => pantryItem.name.toLowerCase() === item.name.toLowerCase(),
        )

        if (existingItem) {
          // Update existing item quantity
          const { error } = await supabase
            .from("pantry_items")
            .update({
              quantity: existingItem.quantity + item.quantity,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingItem.id)

          if (error) throw error
        } else {
          // Add new item
          const { error } = await supabase.from("pantry_items").insert({
            user_id: user.id,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: "Grocery",
          })

          if (error) throw error
        }
      }

      // Remove checked items from shopping list
      const updatedList = shoppingList.filter((item) => !item.checked)
      setShoppingList(updatedList)
      saveShoppingList(updatedList)

      alert("Items added to pantry successfully!")
    } catch (error) {
      console.error("Error adding to pantry:", error)
      alert("Error adding items to pantry")
    }
  }

  const nextStore = () => {
    setCurrentStoreIndex((prev) => (prev + 1) % storeResults.length)
  }

  const prevStore = () => {
    setCurrentStoreIndex((prev) => (prev - 1 + storeResults.length) % storeResults.length)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Smart Shopping</h1>
            <p className="text-sm text-gray-600">Compare prices and manage your list</p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {shoppingList.length} items in list
          </Badge>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="search" className="h-full flex flex-col">
          <div className="flex-shrink-0 px-6 pt-4">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="search">Price Comparison</TabsTrigger>
              <TabsTrigger value="list">Shopping List</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="search" className="flex-1 px-6 pb-6 overflow-hidden">
            <div className="h-full flex flex-col space-y-4">
              {/* Search Bar */}
              <Card className="flex-shrink-0">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Input
                      placeholder="Search for products..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                      className="flex-1"
                    />
                    <Input
                      placeholder="ZIP"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className="w-20"
                    />
                    <Button onClick={handleSearch} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
                      <Search className="w-4 h-4 mr-2" />
                      {loading ? "Searching..." : "Search"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Results */}
              {storeResults.length > 0 && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Store Navigation */}
                  <div className="flex-shrink-0 flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Price Comparison</h2>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={prevStore} disabled={storeResults.length <= 1}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-gray-600 px-3">
                        {currentStoreIndex + 1} of {storeResults.length}
                      </span>
                      <Button variant="outline" size="sm" onClick={nextStore} disabled={storeResults.length <= 1}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Current Store Results */}
                  <Card className="flex-1 overflow-hidden">
                    <CardHeader className="flex-shrink-0 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <MapPin className="w-4 h-4" />
                          {storeResults[currentStoreIndex].store}
                        </CardTitle>
                        <Badge variant={currentStoreIndex === 0 ? "default" : "secondary"}>
                          {currentStoreIndex === 0
                            ? "Best Price"
                            : `+$${(storeResults[currentStoreIndex].total - storeResults[0].total).toFixed(2)}`}
                        </Badge>
                      </div>
                      <CardDescription>Total: ${storeResults[currentStoreIndex].total.toFixed(2)}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {storeResults[currentStoreIndex].items.map((item) => (
                          <Card key={item.id} className="relative">
                            <CardContent className="p-3">
                              <div className="flex gap-3">
                                <img
                                  src={item.image_url || "/placeholder.svg"}
                                  alt={item.title}
                                  className="w-12 h-12 object-cover rounded"
                                />
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-medium text-sm truncate">{item.title}</h3>
                                  <p className="text-xs text-gray-500 truncate">{item.brand}</p>
                                  <div className="flex items-center justify-between mt-2">
                                    <div>
                                      <span className="text-lg font-bold text-green-600">${item.price.toFixed(2)}</span>
                                      {item.pricePerUnit && (
                                        <p className="text-xs text-gray-500">{item.pricePerUnit}</p>
                                      )}
                                    </div>
                                    <Button size="sm" onClick={() => addToShoppingList(item)} className="shrink-0">
                                      <Plus className="w-3 h-3" />
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
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="list" className="flex-1 px-6 pb-6 overflow-hidden">
            <div className="h-full flex flex-col space-y-4">
              {/* Add Item */}
              <Card className="flex-shrink-0">
                <CardContent className="p-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Item name"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: Number.parseInt(e.target.value) || 1 })}
                      className="w-16"
                    />
                    <select
                      value={newItem.unit}
                      onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                      className="px-2 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="piece">pc</option>
                      <option value="lb">lb</option>
                      <option value="oz">oz</option>
                    </select>
                    <Button onClick={addCustomItem} className="bg-orange-500 hover:bg-orange-600">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Shopping List */}
              <Card className="flex-1 overflow-hidden">
                <CardHeader className="flex-shrink-0 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Shopping List</CardTitle>
                    {shoppingList.some((item) => item.checked) && (
                      <Button onClick={addToPantry} size="sm" className="bg-green-600 hover:bg-green-700">
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Add to Pantry
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  {shoppingList.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>Your shopping list is empty</p>
                      <p className="text-sm">Add items from price comparison or manually</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shoppingList.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 p-3 border rounded-lg ${
                            item.checked ? "bg-green-50 border-green-200" : "bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => toggleItemChecked(item.id)}
                            className="w-4 h-4"
                          />
                          <div className="flex-1">
                            <span className={item.checked ? "line-through text-gray-500" : ""}>{item.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="outline" onClick={() => updateItemQuantity(item.id, -1)}>
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-12 text-center text-sm">
                              {item.quantity} {item.unit}
                            </span>
                            <Button size="sm" variant="outline" onClick={() => updateItemQuantity(item.id, 1)}>
                              <Plus className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => removeItem(item.id)}>
                              ×
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
