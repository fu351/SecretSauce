"use client"

import clsx from "clsx"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import type { IngredientFormInput } from "@/lib/types/forms"
import { UnitAutocomplete } from "./unit-autocomplete"

interface IngredientInputRowProps {
  ingredient: IngredientFormInput
  index: number
  canRemove: boolean
  showAmountAndUnit?: boolean
  onChange: (index: number, field: keyof IngredientFormInput, value: string) => void
  onRemove: (index: number) => void
}

export function IngredientInputRow({
  ingredient,
  index,
  canRemove,
  showAmountAndUnit = true,
  onChange,
  onRemove,
}: IngredientInputRowProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const pillClass = clsx(
    "flex items-center gap-2 px-3 py-2 rounded-lg shadow-sm border transition-colors",
    isDark ? "bg-secondary/70 border-border hover:bg-secondary/80" : "bg-white/80 backdrop-blur-sm border-white/50 hover:bg-white/90"
  )

  return (
    <div className={pillClass}>
      <Input
        placeholder={showAmountAndUnit ? "Ingredient" : "Ingredient line (e.g. 1 1/2 lb chicken breast)"}
        value={ingredient.name}
        onChange={(e) => onChange(index, "name", e.target.value)}
        className="flex-1 border-0 bg-transparent h-8 p-0 text-xs"
      />
      {showAmountAndUnit && (
        <>
          <Input
            placeholder="Amt"
            value={ingredient.amount}
            onChange={(e) => onChange(index, "amount", e.target.value)}
            className="w-16 border-0 bg-transparent h-8 p-0 text-xs"
          />
          <div className="w-20">
            <UnitAutocomplete
              value={ingredient.unit}
              onChange={(value) => onChange(index, "unit", value)}
            />
          </div>
        </>
      )}
      {canRemove && (
        <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(index)} className="h-6 w-6 flex-shrink-0 hover:bg-destructive/10">
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
