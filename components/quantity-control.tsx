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
  unit?: string
  minWidth?: string
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
  unit,
  minWidth,
}: QuantityControlProps) {
  const isEditing = editingId === itemId
  const displayQuantity = Number.isInteger(quantity)
    ? quantity
    : parseFloat(quantity.toFixed(2))

  return (
    <div
      className={`flex items-center justify-between gap-1 px-2 py-1 rounded ${
        theme === "dark" ? "bg-white/5 border border-white/10" : "bg-gray-100 border border-gray-200"
      }`}
      style={minWidth ? { width: minWidth } : undefined}
    >
      <Button
        size="icon"
        variant="ghost"
        type="button"
        onClick={onDecrement}
        disabled={disableDecrement}
        className={`h-6 w-6 flex-shrink-0 ${textClass} hover:bg-white/10 disabled:opacity-40`}
      >
        <Minus className="h-3 w-3" />
      </Button>

      {isEditing ? (
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          <input
            type="number"
            value={editingValue}
            onChange={(e) => onQuantityChange(e.target.value)}
            onKeyDown={onQuantityKeyDown}
            autoFocus
            step="0.1"
            min="1"
            className={`flex-1 text-center text-xs font-semibold py-0 px-0.5 border rounded [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
              theme === "dark"
                ? "bg-[#181813] border-[#e8dcc4]/30 text-[#e8dcc4]"
                : "bg-white border-gray-300 text-gray-900"
            }`}
          />
          {unit && <span className={`text-xs font-medium flex-shrink-0 ${textClass}`}>{unit}</span>}
        </div>
      ) : (
        <span
          onClick={() => {}} // Parent component handles click via startEditingQuantity
          className={`flex-1 text-center text-xs font-semibold cursor-pointer hover:opacity-75 transition-opacity ${textClass}`}
        >
          {displayQuantity}{unit && ` ${unit}`}
        </span>
      )}

      <Button
        size="icon"
        variant="ghost"
        type="button"
        onClick={onIncrement}
        className={`h-6 w-6 flex-shrink-0 ${textClass} hover:bg-white/10`}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  )
}
