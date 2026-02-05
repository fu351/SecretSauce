"use client"

import { useMemo, useState } from "react"
import clsx from "clsx"
import { Input } from "@/components/ui/input"
import { UNIT_CANONICAL_OPTIONS } from "@/lib/constants/unit-canonical"

interface UnitAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function UnitAutocomplete({
  value,
  onChange,
  placeholder = "Unit",
  className,
}: UnitAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const normalized = value.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!normalized) return UNIT_CANONICAL_OPTIONS
    return UNIT_CANONICAL_OPTIONS.filter((option) =>
      option.value.toLowerCase().includes(normalized)
    )
  }, [normalized])

  const handleInputChange = (next: string) => {
    onChange(next)
    setIsOpen(true)
  }

  const handleOptionClick = (option: string) => {
    onChange(option)
    setIsOpen(false)
  }

  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false)
    }, 150)
  }

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => handleInputChange(event.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        className={clsx("border-0 bg-transparent h-8 p-0 text-xs", className)}
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute inset-x-0 z-20 mt-1 max-h-48 overflow-auto rounded-xl border bg-popover text-popover-foreground shadow-md">
          {filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleOptionClick(option.value)}
              className={clsx(
                "block w-full px-3 py-2 text-left text-xs capitalize transition-colors hover:bg-accent hover:text-accent-foreground",
                option.value === value ? "bg-accent text-accent-foreground" : ""
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
