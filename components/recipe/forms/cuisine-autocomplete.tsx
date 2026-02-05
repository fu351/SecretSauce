"use client"

import clsx from "clsx"
import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { CUISINE_TYPES } from "@/lib/types"

interface CuisineAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const toTitleCase = (input: string) => {
  return input
    .split(" ")
    .map((token) =>
      token
        .split(/[-_]/)
        .map(
          (chunk) =>
            chunk.charAt(0).toUpperCase() +
            chunk.slice(1).toLowerCase()
        )
        .join("-")
    )
    .join(" ")
}

export function CuisineAutocomplete({ value, onChange, placeholder }: CuisineAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const normalized = value.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!normalized) return CUISINE_TYPES
    return CUISINE_TYPES.filter((option) => option.toLowerCase().includes(normalized))
  }, [normalized])

  const handleOptionClick = (option: string) => {
    onChange(option)
    setIsOpen(false)
  }

  const handleInputChange = (raw: string) => {
    onChange(raw.toLowerCase())
    setIsOpen(true)
  }

  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false)
    }, 100)
  }

  return (
    <div className="relative">
      <Input
        value={value ? toTitleCase(value) : value}
        placeholder={placeholder || "Cuisine type"}
        onChange={(event) => handleInputChange(event.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        className="bg-background text-sm"
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-52 overflow-auto rounded-lg border bg-popover text-popover-foreground shadow-lg">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleOptionClick(option)}
              className={clsx(
                "w-full px-3 py-2 text-left text-xs capitalize transition-colors hover:bg-accent hover:text-accent-foreground",
                option === value ? "bg-accent text-accent-foreground" : ""
              )}
            >
              {toTitleCase(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
