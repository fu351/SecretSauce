"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Plus, Package, AlertTriangle, CalendarIcon, Search, Filter, X, ChefHat, Clock, Users } from "lucide-react"
import { format } from "date-fns"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

interface PantryItem {
  id: string
  name: string
  quantity: number
  unit: string
  expiry_date: string | null
  category: string
  created_at: string
  updated_at: string
}

interface Recipe {
  id: string
  title: string
  image_url: string
  prep_time: number
  cook_time: number
  servings: number
  difficulty: string
  ingredients: any[]
  match_percentage: number
}

const categories = [
  "Produce",
  "Dairy",
  "Meat & Seafood",
  "Pantry Staples",
  "Frozen",
  "Beverages",
  "Snacks",
  "Condiments",
  "Baking",
  "Other",
]

const units = ["each", "lbs", "oz", "cups", "tbsp", "tsp", "gallons", "quarts", "pints", "cans", "boxes", "bags"]

export default function PantryPage() {
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([])
  const [filteredItems, setFilteredItems] = useState<PantryItem[]>([])
  const [suggestedRecipes, setSuggestedRecipes] = useState<Recipe[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [showExpiringSoon, setShowExpiringSoon] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expirationNotifications, setExpirationNotifications] = useState<{
    expiresToday: PantryItem[]
    expiredYesterday: PantryItem[]
  }>({ expiresToday: [], expiredYesterday: [] })

  // Form state
  const [newItem, setNewItem] = useState({
    name: "",
    quantity: 1,
    unit: "each",
    category: "Other",
    expiry_date: null as Date | null,
  })

  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    if (user) {
      fetchPantryItems()
    }
  }, [user])

  useEffect(() => {
    filterItems()
    checkExpirations()
    removeExpiredItems()
    if (pantryItems.length > 0) {
      findSuggestedRecipes()
    }
  }, [pantryItems, searchTerm, selectedCategory, showExpiringSoon])

  const fetchPantryItems = async () => {
    try {
      const { data, error } = await supabase
        .from("pantry_items")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false })

      if (error && !error.message.includes("does not exist")) throw error
      setPantryItems(data || [])
    } catch (error) {
      console.error("Error fetching pantry items:", error)
    } finally {
      setLoading(false)
    }
  }

  const findSuggestedRecipes = async () => {
    try {
      const { data: recipes, error } = await supabase.from("recipes").select("*").limit(50)

      if (error && !error.message.includes("does not exist")) throw error

      if (recipes) {
        // Calculate match percentage for each recipe
        const recipesWithMatch = recipes.map((recipe) => {
          const recipeIngredients = recipe.ingredients || []
          const pantryIngredientNames = pantryItems.map((item) => item.name.toLowerCase())

          let matchCount = 0
          recipeIngredients.forEach((ingredient: any) => {
            const ingredientName = ingredient.name.toLowerCase()
            if (
              pantryIngredientNames.some(
                (pantryItem) => pantryItem.includes(ingredientName) || ingredientName.includes(pantryItem),
              )
            ) {
              matchCount++
            }
          })

          const matchPercentage =
            recipeIngredients.length > 0 ? Math.round((matchCount / recipeIngredients.length) * 100) : 0

          return {
            ...recipe,
            match_percentage: matchPercentage,
          }
        })

        // Filter recipes with at least 30% match and sort by match percentage
        const suggestedRecipes = recipesWithMatch
          .filter((recipe) => recipe.match_percentage >= 30)
          .sort((a, b) => b.match_percentage - a.match_percentage)
          .slice(0, 6)

        setSuggestedRecipes(suggestedRecipes)
      }
    } catch (error) {
      console.error("Error finding suggested recipes:", error)
    }
  }

  const checkExpirations = () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const expiresToday = pantryItems.filter((item) => {
      if (!item.expiry_date) return false
      const expiryDate = new Date(item.expiry_date)
      return expiryDate.toDateString() === today.toDateString()
    })

    const expiredYesterday = pantryItems.filter((item) => {
      if (!item.expiry_date) return false
      const expiryDate = new Date(item.expiry_date)
      return expiryDate.toDateString() === yesterday.toDateString()
    })

    setExpirationNotifications({ expiresToday, expiredYesterday })
  }

  const removeExpiredItems = async () => {
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    const expiredItems = pantryItems.filter((item) => {
      if (!item.expiry_date) return false
      return new Date(item.expiry_date) < twoDaysAgo
    })

    if (expiredItems.length > 0) {
      try {
        const { error } = await supabase
          .from("pantry_items")
          .delete()
          .in(
            "id",
            expiredItems.map((item) => item.id),
          )

        if (error) throw error

        setPantryItems((prev) => prev.filter((item) => !expiredItems.some((expired) => expired.id === item.id)))

        toast({
          title: "Expired items removed",
          description: `${expiredItems.length} expired items have been automatically removed.`,
        })
      } catch (error) {
        console.error("Error removing expired items:", error)
      }
    }
  }

  const dismissNotification = (type: "today" | "yesterday", itemId: string) => {
    setExpirationNotifications((prev) => ({
      ...prev,
      [type === "today" ? "expiresToday" : "expiredYesterday"]: prev[
        type === "today" ? "expiresToday" : "expiredYesterday"
      ].filter((item) => item.id !== itemId),
    }))
  }

  const filterItems = () => {
    let filtered = pantryItems

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
    }

    // Category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter((item) => item.category === selectedCategory)
    }

    // Expiring soon filter
    if (showExpiringSoon) {
      const threeDaysFromNow = new Date()
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)

      filtered = filtered.filter((item) => {
        if (!item.expiry_date) return false
        return new Date(item.expiry_date) <= threeDaysFromNow
      })
    }

    setFilteredItems(filtered)
  }

  const addPantryItem = async () => {
    if (!user || !newItem.name.trim()) return

    try {
      const { data, error } = await supabase
        .from("pantry_items")
        .insert({
          user_id: user.id,
          name: newItem.name,
          quantity: newItem.quantity,
          unit: newItem.unit,
          category: newItem.category,
          expiry_date: newItem.expiry_date?.toISOString().split("T")[0] || null,
        })
        .select()
        .single()

      if (error) throw error

      setPantryItems([data, ...pantryItems])
      setNewItem({
        name: "",
        quantity: 1,
        unit: "each",
        category: "Other",
        expiry_date: null,
      })
      setIsAddDialogOpen(false)

      toast({
        title: "Item added",
        description: `${newItem.name} has been added to your pantry.`,
      })
    } catch (error) {
      console.error("Error adding pantry item:", error)
      toast({
        title: "Error",
        description: "Failed to add item to pantry.",
        variant: "destructive",
      })
    }
  }

  const updateQuantity = async (id: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      deletePantryItem(id)
      return
    }

    try {
      const { error } = await supabase
        .from("pantry_items")
        .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
        .eq("id", id)

      if (error) throw error

      setPantryItems(pantryItems.map((item) => (item.id === id ? { ...item, quantity: newQuantity } : item)))
    } catch (error) {
      console.error("Error updating quantity:", error)
    }
  }

  const deletePantryItem = async (id: string) => {
    try {
      const { error } = await supabase.from("pantry_items").delete().eq("id", id)

      if (error) throw error

      setPantryItems(pantryItems.filter((item) => item.id !== id))
      toast({
        title: "Item removed",
        description: "Item has been removed from your pantry.",
      })
    } catch (error) {
      console.error("Error deleting pantry item:", error)
    }
  }

  const isExpiringSoon = (expiryDate: string | null) => {
    if (!expiryDate) return false
    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
    return new Date(expiryDate) <= threeDaysFromNow
  }

  const isExpired = (expiryDate: string | null) => {
    if (!expiryDate) return false
    return new Date(expiryDate) < new Date()
  }

  const getExpiryBadge = (expiryDate: string | null) => {
    if (!expiryDate) return null

    if (isExpired(expiryDate)) {
      return <Badge variant="destructive">Expired</Badge>
    } else if (isExpiringSoon(expiryDate)) {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          Expires Soon
        </Badge>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Expiration Notifications */}
        <div className="space-y-4 mb-8">
          {expirationNotifications.expiresToday.length > 0 && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <div className="flex items-center justify-between">
                  <span>
                    <strong>Items expiring today:</strong>{" "}
                    {expirationNotifications.expiresToday.map((item) => item.name).join(", ")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpirationNotifications((prev) => ({ ...prev, expiresToday: [] }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {expirationNotifications.expiredYesterday.length > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <div className="flex items-center justify-between">
                  <span>
                    <strong>Items expired yesterday:</strong>{" "}
                    {expirationNotifications.expiredYesterday.map((item) => item.name).join(", ")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpirationNotifications((prev) => ({ ...prev, expiredYesterday: [] }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Pantry</h1>
            <p className="text-gray-600">Keep track of your ingredients and reduce food waste</p>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-orange-500 hover:bg-orange-600">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Pantry Item</DialogTitle>
                <DialogDescription>Add a new item to your pantry inventory</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="item-name">Item Name</Label>
                  <Input
                    id="item-name"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="e.g., Chicken Breast, Milk, Bread"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: Number.parseFloat(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="unit">Unit</Label>
                    <Select value={newItem.unit} onValueChange={(value) => setNewItem({ ...newItem, unit: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={newItem.category}
                    onValueChange={(value) => setNewItem({ ...newItem, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Expiry Date (Optional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newItem.expiry_date ? format(newItem.expiry_date, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={newItem.expiry_date}
                        onSelect={(date) => setNewItem({ ...newItem, expiry_date: date || null })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={addPantryItem} disabled={!newItem.name.trim()} className="flex-1">
                    Add Item
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Suggested Recipes */}
        {suggestedRecipes.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-orange-500" />
                Suggested Recipes Based on Your Pantry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suggestedRecipes.map((recipe) => (
                  <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                    <Card className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <img
                            src={recipe.image_url || "/placeholder.svg?height=80&width=80"}
                            alt={recipe.title}
                            className="w-20 h-20 object-cover rounded-lg"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-gray-900 line-clamp-2">{recipe.title}</h4>
                              <Badge className="bg-green-100 text-green-800">{recipe.match_percentage}% match</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{(recipe.prep_time || 0) + (recipe.cook_time || 0)}min</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>{recipe.servings || 1}</span>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {recipe.difficulty}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Items</p>
                  <p className="text-2xl font-bold text-gray-900">{pantryItems.length}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Expiring Soon</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {pantryItems.filter((item) => isExpiringSoon(item.expiry_date)).length}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Categories</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {new Set(pantryItems.map((item) => item.category)).size}
                  </p>
                </div>
                <Filter className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Recipe Matches</p>
                  <p className="text-2xl font-bold text-gray-900">{suggestedRecipes.length}</p>
                </div>
                <ChefHat className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search pantry items..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant={showExpiringSoon ? "default" : "outline"}
                onClick={() => setShowExpiringSoon(!showExpiringSoon)}
                className="w-full md:w-auto"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Expiring Soon
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pantry Items */}
        {filteredItems.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {pantryItems.length === 0 ? "Your pantry is empty" : "No items match your filters"}
              </h3>
              <p className="text-gray-600 mb-6">
                {pantryItems.length === 0
                  ? "Start by adding some items to track your ingredients"
                  : "Try adjusting your search or filters"}
              </p>
              {pantryItems.length === 0 && (
                <Button onClick={() => setIsAddDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Item
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{item.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {item.category}
                      </Badge>
                    </div>
                    {getExpiryBadge(item.expiry_date)}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Quantity:</span>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                          -
                        </Button>
                        <span className="font-medium">
                          {item.quantity} {item.unit}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                          +
                        </Button>
                      </div>
                    </div>

                    {item.expiry_date && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Expires:</span>
                        <span
                          className={`text-sm font-medium ${
                            isExpired(item.expiry_date)
                              ? "text-red-600"
                              : isExpiringSoon(item.expiry_date)
                                ? "text-yellow-600"
                                : "text-gray-900"
                          }`}
                        >
                          {format(new Date(item.expiry_date), "MMM dd, yyyy")}
                        </span>
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePantryItem(item.id)}
                      className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Remove Item
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
