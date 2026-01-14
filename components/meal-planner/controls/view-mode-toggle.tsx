"use client"

import { Button } from "@/components/ui/button"
import { Calendar, List } from "lucide-react"

interface ViewModeToggleProps {
  viewMode: "by-day" | "by-meal"
  onChange: (mode: "by-day" | "by-meal") => void
  sidebarOpen: boolean
}

export function ViewModeToggle({ viewMode, onChange, sidebarOpen }: ViewModeToggleProps) {
  return (
    <div className="flex items-center bg-card rounded-lg shadow-sm border border-border p-1">
      <Button
        variant={viewMode === "by-day" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("by-day")}
        className={`flex-1 sm:flex-none transition-all ${
          viewMode === "by-day" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent"
        }`}
        title="By Day"
      >
        <Calendar className={`h-4 w-4 ${!sidebarOpen ? "mr-2" : ""}`} />
        {!sidebarOpen && "By Day"}
      </Button>
      <Button
        variant={viewMode === "by-meal" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("by-meal")}
        className={`flex-1 sm:flex-none transition-all ${
          viewMode === "by-meal" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent"
        }`}
        title="By Meal"
      >
        <List className={`h-4 w-4 ${!sidebarOpen ? "mr-2" : ""}`} />
        {!sidebarOpen && "By Meal"}
      </Button>
    </div>
  )
}
