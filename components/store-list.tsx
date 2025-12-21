"use client"

import React, { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Dialog, 
  DialogContent, 
  DialogTrigger, 
  DialogTitle, 
  DialogDescription, 
  DialogHeader 
} from "@/components/ui/dialog"
import {
  ShoppingCart,
  Plus,
  Minus,
  X,
  Check,
  Pencil,
  ChefHat,
  ChevronDown,
  ChevronRight,
  ShoppingBasket,
  Trash2,
  List,
  Layers,
  Search 
} from "lucide-react"

import type { ShoppingListItem, ShoppingListSectionProps } from "@/lib/types/store"
import { RecipeSearchModal } from "@/components/store-search"

// --- INTERFACES ---

interface ExtendedShoppingListSectionProps extends ShoppingListSectionProps {
  onRemoveRecipe?: (recipeId: string) => void;
  user?: any;
  zipCode?: string;
  onAddItem: (name: string) => void;
  onAddRecipe: (id: string, title: string, ingredients: any[]) => void;
}

export function ShoppingListSection({
  shoppingList,
  onRemoveItem,
  onUpdateQuantity,
  onUpdateItemName,
  onToggleItem,
  onRemoveRecipe,
  onAddItem,
  onAddRecipe,
  user,
  zipCode,
  headerAction,
  cardBgClass,
  textClass,
  mutedTextClass,
  buttonClass,
  buttonOutlineClass,
  theme,
}: ExtendedShoppingListSectionProps) {
  
  // -- View State --
  const [isGrouped, setIsGrouped] = useState(true)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // -- Editing State --
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  // -- Accordion State --
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  // =========================================================
  // 1. DEDUPLICATE LIST 
  // =========================================================
  const uniqueList = useMemo(() => {
    const seen = new Set<string>();
    return shoppingList.filter(item => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [shoppingList]);

  // =========================================================
  // 2. GROUPING LOGIC
  // =========================================================
  const { recipeGroups, miscItems } = useMemo(() => {
    const groups: Record<string, { name: string, items: ShoppingListItem[] }> = {}
    const misc: ShoppingListItem[] = []

    uniqueList.forEach((item) => {
      if (item.recipeId) {
        if (!groups[item.recipeId]) {
          groups[item.recipeId] = { 
            name: item.recipeName || "Untitled Recipe",
            items: [] 
          }
        }
        groups[item.recipeId].items.push(item)
      } else {
        misc.push(item)
      }
    })

    return { recipeGroups: groups, miscItems: misc }
  }, [uniqueList]);

  // -- Handlers --
  const startEditing = (item: ShoppingListItem) => {
    setEditingId(item.id)
    setEditValue(item.name)
  }

  const saveEdit = () => {
    if (editingId && editValue.trim()) {
      onUpdateItemName(editingId, editValue.trim())
    }
    setEditingId(null)
    setEditValue("")
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValue("")
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit()
    if (e.key === "Escape") cancelEdit()
  }

  const isExpanded = (id: string) => {
    return expandedSections[id] !== false
  }

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [id]: !isExpanded(id)
    }))
  }

  // -- Styles for Modal --
  const modalStyles = {
    textClass,
    mutedTextClass,
    buttonClass,
    buttonOutlineClass,
    theme,
    inputClass: theme === 'dark' ? 'bg-[#181813] border-[#e8dcc4]/20' : '' 
  }

  // -- Render Helper: Individual Row --
  const renderItemRow = (item: ShoppingListItem) => {
    const isEditing = editingId === item.id

    return (
      <div
        key={item.id}
        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors mb-2 last:mb-0 ${
          theme === "dark"
            ? item.checked
              ? "bg-[#181813]/50 border-[#e8dcc4]/10"
              : "bg-[#181813] border-[#e8dcc4]/20"
            : item.checked
            ? "bg-gray-50 border-gray-100"
            : "bg-white border-gray-200"
        }`}
      >
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

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleEditKeyDown}
                autoFocus
                className={`h-8 text-sm ${textClass} bg-transparent`}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500" onClick={saveEdit}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={cancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="group flex items-center gap-2 overflow-hidden">
              <div className="min-w-0 flex-1">
                <p
                  className={`font-medium truncate transition-all cursor-pointer ${
                    item.checked ? "line-through opacity-50" : ""
                  } ${textClass}`}
                  onClick={() => startEditing(item)}
                >
                  {item.name}
                </p>
                {!isGrouped && item.recipeName && (
                  <p className={`text-[10px] ${mutedTextClass} truncate`}>
                    from {item.recipeName}
                  </p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className={`h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ${mutedTextClass}`}
                onClick={() => startEditing(item)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className={`flex items-center rounded-md ${theme === 'dark' ? 'bg-white/5' : 'bg-gray-100'}`}>
            <Button
              size="icon"
              variant="ghost"
              type="button" 
              onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
              disabled={item.quantity <= 1}
              className={`h-7 w-7 ${textClass}`}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className={`w-6 text-center text-xs font-medium ${textClass}`}>
              {item.quantity}
            </span>
            <Button
              size="icon"
              variant="ghost"
              type="button"
              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
              className={`h-7 w-7 ${textClass}`}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          <div className={`h-4 w-px mx-1 ${theme === "dark" ? "bg-[#e8dcc4]/20" : "bg-gray-200"}`} />

          <Button
            size="icon"
            variant="ghost"
            type="button"
            onClick={() => onRemoveItem(item.id)}
            className={`h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // -- Render Helper: Section Container --
  const renderSection = (sectionKey: string, title: string, items: ShoppingListItem[], icon: React.ReactNode, isMisc = false) => {
    const isOpen = isExpanded(sectionKey)
    const completedCount = items.filter(i => i.checked).length
    const totalCount = items.length

    return (
      <div
        key={sectionKey}
        className={`rounded-lg border overflow-hidden mb-4 last:mb-0 ${
          theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-200"
        }`}
      >
        <div 
          onClick={() => toggleSection(sectionKey)}
          className={`w-full flex items-center justify-between p-2 pl-3 transition-colors cursor-pointer ${
            theme === "dark"
              ? "hover:bg-[#e8dcc4]/5 bg-[#181813]"
              : "hover:bg-gray-50 bg-gray-50"
          }`}
        >
          <div className="flex-1 flex items-center gap-3">
            {isOpen ? (
              <ChevronDown className={`h-4 w-4 ${mutedTextClass}`} />
            ) : (
              <ChevronRight className={`h-4 w-4 ${mutedTextClass}`} />
            )}
            <div className="flex items-center gap-2">
              {icon}
              <h3 className={`font-semibold text-sm ${textClass}`}>
                {title}
              </h3>
            </div>
          </div>
          
          <div className="flex items-center">
             <div className={`text-xs ${mutedTextClass} flex gap-2 items-center mr-3`}>
              <span className="hidden sm:inline">{totalCount} items</span>
              {completedCount > 0 && (
                <span className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full text-[10px]">
                  {completedCount}/{totalCount}
                </span>
              )}
            </div>

            {!isMisc && onRemoveRecipe && (
              <div 
                className={`border-l pl-2 ${theme === "dark" ? "border-[#e8dcc4]/20" : "border-gray-200"}`}
                onClick={(e) => e.stopPropagation()} 
              >
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => onRemoveRecipe(sectionKey)}
                  className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2"
                  title="Remove entire recipe"
                >
                  <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="p-3 bg-opacity-50 space-y-2">
            {items.map(renderItemRow)}
          </div>
        )}
      </div>
    )
  }

  return (
    <Card className={cardBgClass}
    data-tutorial="store-overview">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4"
      >
        <CardTitle className={`flex items-center gap-2 ${textClass}`}>
          <ShoppingCart className="h-5 w-5" />
          Shopping List
        </CardTitle>
        <div className="flex items-center gap-3">
          {headerAction && <div>{headerAction}</div>}

          <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className={`h-8 gap-2 ${buttonOutlineClass}`}
                data-tutorial= "store-add"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Add Items</span>
              </Button>
            </DialogTrigger>
            <DialogContent className={`max-w-2xl max-h-[80vh] overflow-y-auto ${theme === 'dark' ? 'bg-[#181813] border-[#e8dcc4]/20' : 'bg-white'}`}>
                <DialogHeader>
                    <DialogTitle className={textClass}>Search to Add</DialogTitle>
                    <DialogDescription>Find grocery items or add ingredients from your recipes.</DialogDescription>
                </DialogHeader>
                <RecipeSearchModal 
                  user={user} 
                  zipCode={zipCode || ""} 
                  onAddItem={(name) => {
                      onAddItem(name);
                  }} 
                  onAddRecipe={(id, title, ing) => {
                    onAddRecipe(id, title, ing);
                    setIsSearchOpen(false);
                  }}
                  styles={modalStyles}
                />
            </DialogContent>
          </Dialog>

          {uniqueList.length > 0 && (
            <div 
            data-tutorial= "store-sort"
            className={`flex items-center p-1 rounded-md border ${
              theme === "dark" ? "border-[#e8dcc4]/20 bg-[#181813]" : "border-gray-200 bg-gray-50"
            }`}>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsGrouped(true)}
                className={`h-7 w-7 rounded-sm transition-all ${
                  isGrouped
                    ? theme === "dark" ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white shadow-sm text-black"
                    : mutedTextClass
                }`}
                title="Group by Recipe"
              >
                <Layers className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsGrouped(false)}
                className={`h-7 w-7 rounded-sm transition-all ${
                  !isGrouped
                    ? theme === "dark" ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white shadow-sm text-black"
                    : mutedTextClass
                }`}
                title="Ungrouped List"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {uniqueList.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg ${
            theme === "dark" ? "border-[#e8dcc4]/10" : "border-gray-200"
          }`}>
            <ShoppingBasket className={`h-12 w-12 mb-4 ${mutedTextClass}`} opacity={0.5} />
            <p className={`text-lg font-medium ${textClass}`}>Your list is empty</p>
            <p className={`text-sm ${mutedTextClass}`}>Add items or generate a menu to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {isGrouped ? (
              <>
                {Object.entries(recipeGroups).map(([recipeId, group]) => 
                  renderSection(
                    recipeId,
                    group.name,
                    group.items,
                    <ChefHat className="h-4 w-4 text-orange-500" />
                  )
                )}
                
                {miscItems.length > 0 && renderSection(
                  "misc",
                  "Miscellaneous Items",
                  miscItems,
                  <ShoppingBasket className="h-4 w-4 text-blue-500" />,
                  true
                )}
              </>
            ) : (
              <div className="space-y-2">
                {uniqueList.map(renderItemRow)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}