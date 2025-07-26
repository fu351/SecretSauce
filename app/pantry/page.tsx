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
  DialogFooter,
} from "@/components/ui/dialog"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Plus,
  Package,
  AlertTriangle,
  CalendarIcon,
  Search,
  X,
  ChefHat,
  Clock,
  Users,
  Trash2,
  CalendarIcon as CalendarIconSolid,
  Filter,
} from "lucide-react"
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
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false)
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
    if (pantryItems.length > 0) {
      findSuggestedRecipes()
    }
  }, [pantryItems, searchTerm, selectedCategory, showExpiringSoon])

  const fetchPantryItems = async () => {
    try {
      console.log("Fetching pantry items for user:", user?.id)
      const { data, error } = await supabase
        .from("pantry_items")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Supabase error:", error)
        if (!error.message.includes("does not exist")) throw error
      }
      
      console.log("Fetched pantry items:", data)
      setPantryItems(data || [])
    } catch (error) {
      console.error("Error fetching pantry items:", error)
      setPantryItems([])
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

    // Group by category
    const groupedByCategory: Record<string, PantryItem[]> = {}
    filtered.forEach((item) => {
      if (!groupedByCategory[item.category]) {
        groupedByCategory[item.category] = []
      }
      groupedByCategory[item.category].push(item)
    })

    // Flatten but keep category order
    const orderedFiltered: PantryItem[] = []
    categories.forEach((category) => {
      if (groupedByCategory[category]) {
        orderedFiltered.push(...groupedByCategory[category])
      }
    })

    setFilteredItems(orderedFiltered)
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

  const deleteAllPantryItems = async () => {
    try {
      const { error } = await supabase.from("pantry_items").delete().eq("user_id", user?.id)

      if (error) throw error

      setPantryItems([])
      setIsDeleteAllDialogOpen(false)
      toast({
        title: "Pantry cleared",
        description: "All items have been removed from your pantry.",
      })
    } catch (error) {
      console.error("Error deleting all pantry items:", error)
    }
  }

  const markAsExpired = async (id: string) => {
    try {
      // Set expiry date to yesterday
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const { error } = await supabase
        .from("pantry_items")
        .update({
          expiry_date: yesterday.toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (error) throw error

      // Update local state
      setPantryItems(
        pantryItems.map((item) =>
          item.id === id ? { ...item, expiry_date: yesterday.toISOString().split("T")[0] } : item,
        ),
      )

      toast({
        title: "Item marked as expired",
        description: "Item has been marked as expired.",
      })
    } catch (error) {
      console.error("Error marking item as expired:", error)
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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Produce":
        return "🥬"
      case "Dairy":
        return "🥛"
      case "Meat & Seafood":
        return "🥩"
      case "Pantry Staples":
        return "🥫"
      case "Frozen":
        return "❄️"
      case "Beverages":
        return "🥤"
      case "Snacks":
        return "🍪"
      case "Condiments":
        return "🧂"
      case "Baking":
        return "🍞"
      default:
        return "📦"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50 flex items-center justify-center">
        <div className="animate-pulse space-y-8 w-full max-w-6xl px-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Pantry</h1>
              <p className="text-gray-600 mt-1">Keep track of your ingredients and reduce food waste</p>
            </div>

            <div className="flex items-center gap-3">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-orange-500 hover:bg-orange-600 shadow-lg">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
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
                        className="mt-1"
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
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="unit">Unit</Label>
                        <Select value={newItem.unit} onValueChange={(value) => setNewItem({ ...newItem, unit: value })}>
                          <SelectTrigger className="mt-1">
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
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {getCategoryIcon(category)} {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Expiry Date (Optional)</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal mt-1">
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

              <Dialog open={isDeleteAllDialogOpen} onOpenChange={setIsDeleteAllDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Clear Entire Pantry</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to remove all items from your pantry? This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteAllDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={deleteAllPantryItems}>
                      Yes, Clear Everything
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Suggested Recipes */}
        {suggestedRecipes.length > 0 && (
          <div className="mb-8">
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ChefHat className="h-6 w-6 text-orange-500" />
                  Suggested Recipes Based on Your Pantry
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {suggestedRecipes.map((recipe) => (
                    <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                      <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 h-full bg-white/90 backdrop-blur-sm">
                        <CardContent className="p-6">
                          <div className="flex gap-4">
                            <img
                              src={recipe.image_url || "/placeholder.svg?height=80&width=80"}
                              alt={recipe.title}
                              className="w-20 h-20 object-cover rounded-lg shadow-md"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-gray-900 line-clamp-2">{recipe.title}</h4>
                                <Badge className="bg-green-100 text-green-800 font-medium">{recipe.match_percentage}% match</Badge>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{(recipe.prep_time || 0) + (recipe.cook_time || 0)}min</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  <span>{recipe.servings || 1}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="mb-8">
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search pantry items..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-12 text-base"
                    />
                  </div>
                </div>

                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full lg:w-48 h-12">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {getCategoryIcon(category)} {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant={showExpiringSoon ? "default" : "outline"}
                  onClick={() => setShowExpiringSoon(!showExpiringSoon)}
                  className={`h-12 ${showExpiringSoon ? "bg-orange-500 hover:bg-orange-600" : ""}`}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Expiring Soon
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pantry Items */}
        <div className="space-y-8">
          {filteredItems.length === 0 ? (
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardContent className="p-12 text-center">
                <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {pantryItems.length === 0 ? "Your pantry is empty" : "No items match your filters"}
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  {pantryItems.length === 0
                    ? "Start by adding some items to track your ingredients and reduce food waste"
                    : "Try adjusting your search or filters to find what you're looking for"}
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
            <div className="space-y-8">
              {/* Group by category */}
              {categories.map((category) => {
                const categoryItems = filteredItems.filter((item) => item.category === category)
                if (categoryItems.length === 0) return null

                return (
                  <div key={category}>
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-gray-800">
                      <span className="text-2xl">{getCategoryIcon(category)}</span>
                      {category}
                      <Badge variant="secondary" className="ml-2">
                        {categoryItems.length} {categoryItems.length === 1 ? "item" : "items"}
                      </Badge>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {categoryItems.map((item) => (
                        <Card key={item.id} className="hover:shadow-xl transition-all duration-300 hover:scale-105 bg-white/90 backdrop-blur-sm border-0">
                          <CardContent className="p-6">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <h3 className="font-bold text-gray-900 mb-2 text-lg">{item.name}</h3>
                                <div className="flex items-center gap-2">{getExpiryBadge(item.expiry_date)}</div>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-600">Quantity:</span>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                    className="h-8 w-8 p-0"
                                  >
                                    -
                                  </Button>
                                  <span className="font-bold text-lg min-w-[3rem] text-center">
                                    {item.quantity} {item.unit}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                    className="h-8 w-8 p-0"
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>

                              {item.expiry_date && (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-600">Expires:</span>
                                  <span
                                    className={`text-sm font-bold ${
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

                              <div className="flex gap-2 pt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => markAsExpired(item.id)}
                                  className="flex-1 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 h-9"
                                >
                                  <CalendarIconSolid className="h-3 w-3 mr-1" />
                                  Mark Expired
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deletePantryItem(item.id)}
                                  className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 h-9"
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Remove
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
