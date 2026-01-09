"use client"

import clsx from "clsx"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Plus, ChefHat } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import { InstructionInputRow } from "./instruction-input-row"
import type { Instruction } from "@/lib/types/recipe"

interface RecipeInstructionsFormProps {
  instructions: Instruction[]
  onChange: (instructions: Instruction[]) => void
}

export function RecipeInstructionsForm({ instructions, onChange }: RecipeInstructionsFormProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const sectionCardClass = clsx(
    "shadow-lg border rounded-2xl",
    isDark ? "bg-card border-border" : "bg-white/90 backdrop-blur-sm border-0"
  )
  const addInstruction = () => {
    onChange([...instructions, { step: instructions.length + 1, description: "" }])
  }

  const removeInstruction = (index: number) => {
    const updated = instructions.filter((_, i) => i !== index)
    // Renumber steps
    onChange(updated.map((inst, i) => ({ ...inst, step: i + 1 })))
  }

  const updateInstruction = (index: number, value: string) => {
    const updated = [...instructions]
    updated[index] = { ...updated[index], description: value }
    onChange(updated)
  }

  return (
    <Card className={sectionCardClass}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ChefHat className="h-5 w-5" />
          Instructions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-2">
          {instructions.map((instruction, index) => (
            <InstructionInputRow
              key={index}
              instruction={instruction}
              index={index}
              canRemove={instructions.length > 1}
              onChange={updateInstruction}
              onRemove={removeInstruction}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addInstruction}
            className="w-full mt-3"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Step
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
