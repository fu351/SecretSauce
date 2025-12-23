"use client"

import { Button } from "@/components/ui/button"
import { Minus, Plus } from "lucide-react"

interface QuantityControlProps {
  quantity: number
  editingId: string | null
  itemId: string
  editingValue: string
  onQuantityChange: (value: string) => void
  onQuantityKeyDown: (e: React.KeyboardEvent) => void
  onDecrement: () => void
  onIncrement: () => void
  theme: "light" | "dark"
  textClass: string
  disableDecrement?: boolean
}

export function QuantityControl({
  quantity,
  editingId,
  itemId,
  editingValue,
  onQuantityChange,
  onQuantityKeyDown,
  onDecrement,
  onIncrement,
  theme,
  textClass,
  disableDecrement = false,
}: QuantityControlProps) {
  const isEditing = editingId === itemId
  const displayQuantity = Number.isInteger(quantity)
    ? quantity
    : parseFloat(quantity.toFixed(2))

  return (
    <div
      className={`flex items-center rounded-md ${
        theme === "dark" ? "bg-white/5" : "bg-gray-100"
      }`}
    >
      <Button
        size="icon"
        variant="ghost"
        type="button"
        onClick={onDecrement}
        disabled={disableDecrement}
        className={`h-7 w-7 ${textClass}`}
      >
        <Minus className="h-3 w-3" />
      </Button>

      {isEditing ? (
        <input
          type="number"
          value={editingValue}
          onChange={(e) => onQuantityChange(e.target.value)}
          onKeyDown={onQuantityKeyDown}
          autoFocus
          step="0.1"
          min="1"
          className={`w-8 text-center text-xs font-medium px-1 py-0 border rounded [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
            theme === "dark"
              ? "bg-[#181813] border-[#e8dcc4]/40 text-[#e8dcc4]"
              : "bg-white border-gray-300 text-gray-900"
          }`}
        />
      ) : (
        <span
          onClick={() => {}} // Parent component handles click via startEditingQuantity
          className={`w-8 text-center text-xs font-medium cursor-pointer hover:opacity-70 transition-opacity ${textClass}`}
        >
          {displayQuantity}
        </span>
      )}

      <Button
        size="icon"
        variant="ghost"
        type="button"
        onClick={onIncrement}
        className={`h-7 w-7 ${textClass}`}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  )
}
