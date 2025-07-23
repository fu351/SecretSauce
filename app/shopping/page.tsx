"use client"

import { useState, useEffect } from "react"
import { Button, Input } from "@/components/ui/button"
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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Smart Shopping</h1>
        <p className="text-muted-foreground">Compare prices across stores and manage your shopping list</p>
      </div>

      <Tabs defaultValue="search" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="search">Price Comparison</TabsTrigger>
          <TabsTrigger value="list">Shopping List ({shoppingList.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-6">
          {/* Search Section */}
          <Card>
            <CardHeader>
              <CardTitle>Search Products</CardTitle>
              <CardDescription>Find the best prices across multiple stores</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search for products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div className="w-32">
                  <Input placeholder="ZIP Code" value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
                </div>
                <Button onClick={handleSearch} disabled={loading}>
                  <Search className="w-4 h-4 mr-2" />
                  {loading ? "Searching..." : "Search"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Store Results Carousel */}
          {storeResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Price Comparison</h2>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={prevStore} disabled={storeResults.length <= 1}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {currentStoreIndex + 1} of {storeResults.length}
                  </span>
                  <Button variant="outline" size="icon" onClick={nextStore} disabled={storeResults.length <= 1}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {storeResults.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <MapPin className="w-5 h-5" />
                          {storeResults[currentStoreIndex].store}
                        </CardTitle>
                        <CardDescription>Total: ${storeResults[currentStoreIndex].total.toFixed(2)}</CardDescription>
                      </div>
                      <Badge variant={currentStoreIndex === 0 ? "default" : "secondary"}>
                        {currentStoreIndex === 0
                          ? "Best Price"
                          : `+$${(storeResults[currentStoreIndex].total - storeResults[0].total).toFixed(2)}`}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {storeResults[currentStoreIndex].items.map((item) => (
                        <Card key={item.id} className="relative">
                          <CardContent className="p-4">
                            <div className="flex gap-3">
                              <img
                                src={item.image_url || "/placeholder.svg"}
                                alt={item.title}
                                className="w-16 h-16 object-cover rounded-lg"
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-sm truncate">{item.title}</h3>
                                <p className="text-xs text-muted-foreground truncate">{item.brand}</p>
                                <div className="flex items-center justify-between mt-2">
                                  <div>
                                    <span className="text-lg font-bold text-green-600">${item.price.toFixed(2)}</span>
                                    {item.pricePerUnit && (
                                      <p className="text-xs text-muted-foreground">{item.pricePerUnit}</p>
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
              )}

              {/* Store Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {storeResults.map((store, index) => (
                  <Card
                    key={store.store}
                    className={`cursor-pointer transition-colors ${
                      index === currentStoreIndex ? "ring-2 ring-blue-500" : ""
                    }`}
                    onClick={() => setCurrentStoreIndex(index)}
                  >
                    <CardContent className="p-4 text-center">
                      <h3 className="font-medium text-sm">{store.store}</h3>
                      <p className="text-lg font-bold text-green-600">${store.total.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{store.items.length} items</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="space-y-6">
          {/* Add Custom Item */}
          <Card>
            <CardHeader>
              <CardTitle>Add Item</CardTitle>
            </CardHeader>
            <CardContent>
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
                  className="w-20"
                />
                <select
                  value={newItem.unit}
                  onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="piece">piece</option>
                  <option value="lb">lb</option>
                  <option value="oz">oz</option>
                  <option value="cup">cup</option>
                  <option value="tsp">tsp</option>
                  <option value="tbsp">tbsp</option>
                </select>
                <Button onClick={addCustomItem}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Shopping List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Shopping List</CardTitle>
                {shoppingList.some((item) => item.checked) && (
                  <Button onClick={addToPantry} variant="outline">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Pantry
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {shoppingList.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Your shopping list is empty. Add items from the price comparison or manually.
                </p>
              ) : (
                <div className="space-y-2">
                  {shoppingList.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 border rounded-lg ${
                        item.checked ? "bg-green-50 border-green-200" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleItemChecked(item.id)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <span className={item.checked ? "line-through text-muted-foreground" : ""}>{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => updateItemQuantity(item.id, -1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-12 text-center">
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
