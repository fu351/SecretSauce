"use client"

import clsx from "clsx"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import type { Instruction } from "@/lib/types"

interface InstructionInputRowProps {
  instruction: Instruction
  index: number
  canRemove: boolean
  onChange: (index: number, value: string) => void
  onRemove: (index: number) => void
}

export function InstructionInputRow({
  instruction,
  index,
  canRemove,
  onChange,
  onRemove,
}: InstructionInputRowProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const cardClass = clsx(
    "flex gap-4 p-4 rounded-lg shadow-sm border",
    isDark ? "bg-secondary/70 border-border" : "bg-white/80 backdrop-blur-sm border-white/50"
  )

  return (
    <div className={cardClass}>
      <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center flex-shrink-0 font-semibold">
        {instruction.step}
      </div>
      <Textarea
        placeholder="Describe this step..."
        value={instruction.description}
        onChange={(e) => onChange(index, e.target.value)}
        rows={2}
        className="flex-1 border-0 bg-transparent resize-none"
      />
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(index)}
          className="h-8 w-8 flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
