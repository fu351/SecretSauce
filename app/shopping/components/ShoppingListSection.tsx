"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ShoppingCart, Plus, X } from "lucide-react"
import type { ShoppingListItem } from "../hooks/useShoppingList"

interface ShoppingListSectionProps {
  shoppingList: ShoppingListItem[]
  newItem: string
  setNewItem: (item: string) => void
  onAddItem: () => void
  onRemoveItem: (itemId: string) => void
  onUpdateQuantity: (itemId: string, quantity: number) => void
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
  cardBgClass,
  textClass,
  mutedTextClass,
  buttonClass,
  buttonOutlineClass,
  theme,
}: ShoppingListSectionProps) {
  return (
    <Card className={cardBgClass}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${textClass}`}>
          <ShoppingCart className="h-5 w-5" />
          Shopping List
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add new item..."
            onKeyPress={(e) => e.key === "Enter" && onAddItem()}
            className={theme === "dark" ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]" : ""}
          />
          <Button onClick={onAddItem} className={buttonClass}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {shoppingList.length === 0 ? (
          <p className={mutedTextClass}>No items in your shopping list yet.</p>
        ) : (
          <div className="space-y-2">
            {shoppingList.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  theme === "dark" ? "bg-[#181813]" : "bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  aria-label={`Check off ${item.name}`}
                />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${textClass}`}>{item.name}</p>
                  {item.recipeName && (
                    <p className={`text-xs ${mutedTextClass}`}>from {item.recipeName}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => onUpdateQuantity(item.id, parseInt(e.target.value))}
                    className={`w-12 h-8 px-2 rounded text-sm ${
                      theme === "dark" ? "bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4]" : ""
                    }`}
                  />
                  <span className={`text-sm ${mutedTextClass}`}>{item.unit || "qty"}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveItem(item.id)}
                  className={buttonOutlineClass}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
