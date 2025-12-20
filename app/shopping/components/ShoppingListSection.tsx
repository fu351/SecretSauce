"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ShoppingCart, Plus, Minus, X, Check } from "lucide-react"
import type { ShoppingListItem } from "./store-types"

interface ShoppingListSectionProps {
  shoppingList: ShoppingListItem[]
  newItem: string
  setNewItem: (item: string) => void
  onAddItem: () => void
  onRemoveItem: (itemId: string) => void
  onUpdateQuantity: (itemId: string, quantity: number) => void
  onToggleItem: (itemId: string) => void // Added this to handle checking off items
  // Styling props
  cardBgClass: string
  textClass: string
  mutedTextClass: string
  buttonClass: string
  buttonOutlineClass: string
  theme: string
}

/**
 * Shopping list display and management section
 * Shows all items in the shopping list with quantity controls
 */
export function ShoppingListSection({
  shoppingList,
  newItem,
  setNewItem,
  onAddItem,
  onRemoveItem,
  onUpdateQuantity,
  onToggleItem,
  cardBgClass,
  textClass,
  mutedTextClass,
  buttonClass,
  buttonOutlineClass,
  theme,
}: ShoppingListSectionProps) {
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onAddItem()
    }
  }

  return (
    <Card className={cardBgClass}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${textClass}`}>
          <ShoppingCart className="h-5 w-5" />
          Shopping List
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add Item Input */}
        <div className="flex items-center gap-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add new item..."
            onKeyDown={handleKeyDown}
            className={theme === "dark" ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
          />
          <Button onClick={onAddItem} className={buttonClass} disabled={!newItem.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* List Items */}
        {shoppingList.length === 0 ? (
          <div className={`text-center py-6 border-2 border-dashed rounded-lg ${theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-200"}`}>
            <p className={mutedTextClass}>Your list is empty.</p>
            <p className={`text-xs mt-1 ${mutedTextClass}`}>Add items or a recipe to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {shoppingList.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  theme === "dark" 
                    ? item.checked 
                      ? "bg-[#181813]/50 border-[#e8dcc4]/10" 
                      : "bg-[#181813] border-[#e8dcc4]/20" 
                    : item.checked 
                      ? "bg-gray-50 border-gray-100" 
                      : "bg-white border-gray-200"
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => onToggleItem(item.id)}
                  className={`flex-shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                    item.checked
                      ? "bg-green-500 border-green-500 text-white"
                      : theme === "dark"
                        ? "border-[#e8dcc4]/40 hover:border-[#e8dcc4]"
                        : "border-gray-300 hover:border-gray-400"
                  }`}
                  aria-label={item.checked ? "Mark as unchecked" : "Mark as checked"}
                >
                  {item.checked && <Check className="h-3 w-3" />}
                </button>

                {/* Item Details */}
                <div className="flex-1 min-w-0">
                  <p 
                    className={`font-medium truncate transition-all ${
                      item.checked ? "line-through opacity-50" : ""
                    } ${textClass}`}
                  >
                    {item.name}
                  </p>
                  {item.recipeName && (
                    <p className={`text-xs ${mutedTextClass} truncate`}>
                      from {item.recipeName}
                    </p>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 sm:gap-2">
                  <div className="flex items-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                      disabled={item.quantity <= 1}
                      className={`h-7 w-7 ${buttonOutlineClass}`}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className={`w-8 text-center text-sm ${textClass}`}>
                      {item.quantity}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      className={`h-7 w-7 ${buttonOutlineClass}`}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className={`h-4 w-px mx-1 ${theme === "dark" ? "bg-[#e8dcc4]/20" : "bg-gray-200"}`} />

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onRemoveItem(item.id)}
                    className={`h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}