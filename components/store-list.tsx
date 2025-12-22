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
  Users
} from "lucide-react"

import type { ShoppingListItem, ShoppingListSectionProps } from "@/lib/types/store"
import { RecipeSearchModal } from "@/components/store-search"

// --- INTERFACES ---

interface ExtendedShoppingListSectionProps extends ShoppingListSectionProps {
  onRemoveRecipe?: (recipeId: string) => void;
  onUpdateRecipeServings?: (recipeId: string, servings: number) => void;
  user?: any;
  zipCode?: string;
  onAddItem: (name: string) => void;
  onAddRecipe: (id: string, title: string, servings?: number) => void;
  onUpdateItemName: (id: string, newName: string) => void;
  newItemInput?: string;
  onNewItemInputChange?: (value: string) => void;
  onAddCustomItem?: () => void;
  inputClass?: string;
}

export function ShoppingListSection({
  shoppingList,
  onRemoveItem,
  onUpdateQuantity,
  onUpdateItemName,
  onToggleItem,
  onRemoveRecipe,
  onUpdateRecipeServings,
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
  newItemInput,
  onNewItemInputChange,
  onAddCustomItem,
  inputClass,
}: ExtendedShoppingListSectionProps) {
  
  // -- View State --
  const [isGrouped, setIsGrouped] = useState(true)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  // -- Editing State --
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null)
  const [editingQuantityValue, setEditingQuantityValue] = useState("")
  const [editingServingsId, setEditingServingsId] = useState<string | null>(null)
  const [editingServingsValue, setEditingServingsValue] = useState("")

  // -- Accordion State --
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  // -- Calculate total price --
  const totalPrice = useMemo(() => {
    return shoppingList.reduce((sum, item) => {
      if (item.price) {
        return sum + (item.price * item.quantity)
      }
      return sum
    }, 0)
  }, [shoppingList])

  // -- Get unique store names --
  const storeNames = useMemo(() => {
    const stores = new Set<string>()
    shoppingList.forEach(item => {
      if (item.storeName) stores.add(item.storeName)
    })
    return Array.from(stores)
  }, [shoppingList])

  const storeDisplay = storeNames.length === 0 ? null : storeNames.length === 1 ? storeNames[0] : "mixed stores"

  // -- Clear shopping list handler --
  const handleClearList = async () => {
    // Remove all items from the list
    const itemsToRemove = [...shoppingList]
    const recipesToRemove = new Set<string>()

    // Collect unique recipes first to avoid removing twice
    itemsToRemove.forEach(item => {
      if (item.recipeId) {
        recipesToRemove.add(item.recipeId)
      } else {
        onRemoveItem(item.id)
      }
    })

    // Remove recipes
    for (const recipeId of recipesToRemove) {
      if (onRemoveRecipe) {
        onRemoveRecipe(recipeId)
      }
    }

    setClearConfirmOpen(false)
  }

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

  // =========================================================
  // 3. MERGE LOGIC FOR UNGROUPED VIEW
  // =========================================================
  const mergedUngroupedList = useMemo(() => {
    if (isGrouped) return []

    const mergeMap = new Map<string, ShoppingListItem & { itemsWithSameName: ShoppingListItem[] }>()

    uniqueList.forEach((item) => {
      // Merge all items with the same name, regardless of source
      // This groups together recipe items and miscellaneous items if they have the same name
      const key = item.name.toLowerCase()

      if (mergeMap.has(key)) {
        const existing = mergeMap.get(key)!
        // Merge quantities
        existing.quantity += item.quantity
        // Merge checked state (only checked if all instances are checked)
        existing.checked = existing.checked && item.checked
        // Track all items with the same name for price and quantity handling
        existing.itemsWithSameName.push(item)
      } else {
        // Store a copy to avoid mutating original
        mergeMap.set(key, { ...item, itemsWithSameName: [item] })
      }
    })

    return Array.from(mergeMap.values()).map(item => {
      const { itemsWithSameName, ...rest } = item
      // If items have different prices, use the average or most recent
      const pricesAvailable = itemsWithSameName.filter(i => i.price !== undefined).map(i => i.price as number)
      if (pricesAvailable.length > 0) {
        return {
          ...rest,
          price: pricesAvailable[pricesAvailable.length - 1], // Use the last (most recently saved) price
          itemsWithSameName // Keep this for quantity adjustments
        }
      }
      return { ...rest, itemsWithSameName }
    })
  }, [uniqueList, isGrouped])

  // -- Handlers --
  const handleToggleMergedItem = (mergedItem: ShoppingListItem & { itemsWithSameName?: ShoppingListItem[] }) => {
    // In ungrouped view, toggle all items with the same name
    if (!isGrouped && mergedItem.itemsWithSameName && mergedItem.itemsWithSameName.length > 1) {
      mergedItem.itemsWithSameName.forEach(item => {
        onToggleItem(item.id)
      })
    } else {
      // In grouped view or for single items, just toggle the one item
      onToggleItem(mergedItem.id)
    }
  }

  const handleMergedQuantityUpdate = (mergedItem: ShoppingListItem & { itemsWithSameName?: ShoppingListItem[] }, newTotalQuantity: number) => {
    // In ungrouped view with merged items, prioritize adjusting miscellaneous items first
    if (!isGrouped && mergedItem.itemsWithSameName && mergedItem.itemsWithSameName.length > 1) {
      const allItems = mergedItem.itemsWithSameName
      const miscItems = allItems.filter(item => item.source === 'miscellaneous')
      const recipeItems = allItems.filter(item => item.source !== 'miscellaneous')
      
      const oldTotal = allItems.reduce((sum, item) => sum + item.quantity, 0)
      const quantityChange = newTotalQuantity - oldTotal
      
      if (quantityChange > 0) {
        // INCREASING: Add to miscellaneous items first
        if (miscItems.length > 0) {
          // Distribute increase across miscellaneous items
          const increasePerItem = quantityChange / miscItems.length
          miscItems.forEach(item => {
            const newQuantity = Math.round((item.quantity + increasePerItem) * 10) / 10
            onUpdateQuantity(item.id, newQuantity)
          })
        } else {
          // No misc items, distribute across recipe items
          const increasePerItem = quantityChange / recipeItems.length
          recipeItems.forEach(item => {
            const newQuantity = Math.round((item.quantity + increasePerItem) * 10) / 10
            onUpdateQuantity(item.id, newQuantity)
          })
        }
      } else if (quantityChange < 0) {
        // DECREASING: Remove from miscellaneous items first
        let remainingDecrease = Math.abs(quantityChange)
        
        // First, decrease from miscellaneous items
        for (const item of miscItems) {
          if (remainingDecrease <= 0) break
          
          const canDecrease = item.quantity - 1 // Keep at least 1
          const actualDecrease = Math.min(canDecrease, remainingDecrease)
          
          if (actualDecrease > 0) {
            const newQuantity = Math.max(1, Math.round((item.quantity - actualDecrease) * 10) / 10)
            onUpdateQuantity(item.id, newQuantity)
            remainingDecrease -= actualDecrease
          }
        }
        
        // If still need to decrease, decrease from recipe items
        if (remainingDecrease > 0) {
          for (const item of recipeItems) {
            if (remainingDecrease <= 0) break
            
            const canDecrease = item.quantity - 1
            const actualDecrease = Math.min(canDecrease, remainingDecrease)
            
            if (actualDecrease > 0) {
              const newQuantity = Math.max(1, Math.round((item.quantity - actualDecrease) * 10) / 10)
              onUpdateQuantity(item.id, newQuantity)
              remainingDecrease -= actualDecrease
            }
          }
        }
      }
    } else {
      // In grouped view or for single items, just update the one item
      onUpdateQuantity(mergedItem.id, newTotalQuantity)
    }
  }

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

  const startEditingQuantity = (item: ShoppingListItem) => {
    setEditingQuantityId(item.id)
    setEditingQuantityValue(item.quantity.toString())
  }

  const saveEditingQuantity = (itemId: string) => {
    const newQuantity = parseFloat(editingQuantityValue)
    if (!isNaN(newQuantity) && newQuantity >= 1) {
      const item = uniqueList.find(i => i.id === itemId)
      if (item) {
        handleMergedQuantityUpdate(item, newQuantity)
      }
    }
    setEditingQuantityId(null)
    setEditingQuantityValue("")
  }

  const cancelEditingQuantity = () => {
    setEditingQuantityId(null)
    setEditingQuantityValue("")
  }

  const handleQuantityKeyDown = (e: React.KeyboardEvent, itemId: string) => {
    if (e.key === "Enter") saveEditingQuantity(itemId)
    if (e.key === "Escape") cancelEditingQuantity()
  }

  const startEditingServings = (recipeId: string, currentServings: number) => {
    setEditingServingsId(recipeId)
    setEditingServingsValue(currentServings.toString())
  }

  const saveEditingServings = (recipeId: string) => {
    const newServings = parseInt(editingServingsValue, 10)
    if (!isNaN(newServings) && newServings >= 1) {
      onUpdateRecipeServings?.(recipeId, newServings)
    }
    setEditingServingsId(null)
    setEditingServingsValue("")
  }

  const cancelEditingServings = () => {
    setEditingServingsId(null)
    setEditingServingsValue("")
  }

  const handleServingsKeyDown = (e: React.KeyboardEvent, recipeId: string) => {
    if (e.key === "Enter") saveEditingServings(recipeId)
    if (e.key === "Escape") cancelEditingServings()
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

    // NEW: Round display quantity to 2 decimal places to handle scaled fractions
    const displayQuantity = Number.isInteger(item.quantity)
      ? item.quantity
      : parseFloat(item.quantity.toFixed(2));

    // Calculate total price if price exists
    const totalPrice = item.price ? (item.price * item.quantity) : null;

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
          onClick={() => handleToggleMergedItem(item)}
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
                <div className="flex gap-2 items-center mt-0.5 flex-wrap">
                  {item.price ? (
                    <p className={`text-[10px] font-medium ${mutedTextClass}`}>
                      ${item.price.toFixed(2)} ea {totalPrice && `• $${totalPrice.toFixed(2)} total`}
                    </p>
                  ) : (
                    <p className={`text-[10px] font-medium text-amber-600 dark:text-amber-400`}>
                      Not found in saved store
                    </p>
                  )}
                </div>
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
              onClick={() => handleMergedQuantityUpdate(item, Math.max(1, item.quantity - 1))}
              disabled={item.quantity <= 1}
              className={`h-7 w-7 ${textClass}`}
            >
              <Minus className="h-3 w-3" />
            </Button>
            {editingQuantityId === item.id ? (
              <input
                type="number"
                value={editingQuantityValue}
                onChange={(e) => setEditingQuantityValue(e.target.value)}
                onKeyDown={(e) => handleQuantityKeyDown(e, item.id)}
                onBlur={() => saveEditingQuantity(item.id)}
                autoFocus
                step="0.1"
                min="1"
                className={`w-8 text-center text-xs font-medium px-1 py-0 border rounded [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  theme === 'dark'
                    ? 'bg-[#181813] border-[#e8dcc4]/40 text-[#e8dcc4]'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            ) : (
              <span
                onClick={() => startEditingQuantity(item)}
                className={`w-8 text-center text-xs font-medium cursor-pointer hover:opacity-70 transition-opacity ${textClass}`}
              >
                {displayQuantity}
              </span>
            )}
            <Button
              size="icon"
              variant="ghost"
              type="button"
              onClick={() => handleMergedQuantityUpdate(item, item.quantity + 1)}
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

    // Get servings from first item (all items in a recipe share the same servings)
    const currentServings = items[0]?.servings || 1
    const isRecipe = items[0]?.source === 'recipe'

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

          <div className="flex items-center gap-2">
            {/* Servings control for recipe items */}
            {isRecipe && onUpdateRecipeServings && (
              <div
                className={`flex items-center gap-1 rounded-md px-2 py-1 ${theme === 'dark' ? 'bg-white/5' : 'bg-gray-100'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Users className={`h-3 w-3 ${mutedTextClass}`} />
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() => onUpdateRecipeServings(sectionKey, Math.max(1, currentServings - 1))}
                  disabled={currentServings <= 1}
                  className={`h-5 w-5 ${textClass}`}
                >
                  <Minus className="h-2.5 w-2.5" />
                </Button>
                {editingServingsId === sectionKey ? (
                  <input
                    type="number"
                    value={editingServingsValue}
                    onChange={(e) => setEditingServingsValue(e.target.value)}
                    onKeyDown={(e) => handleServingsKeyDown(e, sectionKey)}
                    onBlur={() => saveEditingServings(sectionKey)}
                    autoFocus
                    min="1"
                    className={`w-6 text-center text-xs font-medium px-0.5 py-0 border rounded [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      theme === 'dark'
                        ? 'bg-[#181813] border-[#e8dcc4]/40 text-[#e8dcc4]'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                ) : (
                  <span
                    onClick={() => startEditingServings(sectionKey, currentServings)}
                    className={`w-6 text-center text-xs font-medium cursor-pointer hover:opacity-70 transition-opacity ${textClass}`}
                  >
                    {currentServings}
                  </span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() => onUpdateRecipeServings(sectionKey, currentServings + 1)}
                  className={`h-5 w-5 ${textClass}`}
                >
                  <Plus className="h-2.5 w-2.5" />
                </Button>
              </div>
            )}

            <div className={`text-xs ${mutedTextClass} flex gap-2 items-center`}>
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
    <Card className={cardBgClass} data-tutorial="store-overview">
      <CardHeader className="flex flex-col space-y-0 pb-4">
        <div className="flex items-center justify-between w-full">
          <CardTitle className={`flex items-center gap-2 ${textClass}`}>
            <ShoppingCart className="h-5 w-5" />
            Shopping List
          </CardTitle>
          {totalPrice > 0 && storeDisplay && (
            <div className={`text-sm font-medium flex flex-col items-end gap-1 ${mutedTextClass}`}>
              <div className="text-lg font-bold text-green-600">
                ${totalPrice.toFixed(2)}
              </div>
              <div className="text-xs">
                from {storeDisplay}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 mt-3">
          {/* Top row: Add Recipe button and optional custom input field */}
          <div className="flex items-center justify-between gap-3">
            {/* Custom Item Input (if provided) */}
            {newItemInput !== undefined && onNewItemInputChange && onAddCustomItem && inputClass && (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={newItemInput}
                  onChange={(e) => onNewItemInputChange(e.target.value)}
                  placeholder="Add custom item..."
                  onKeyDown={(e) => e.key === 'Enter' && onAddCustomItem()}
                  className={`h-8 ${inputClass}`}
                />
                <Button
                  onClick={onAddCustomItem}
                  className={`h-8 w-8 flex-shrink-0 p-0 ${buttonClass}`}
                  disabled={!newItemInput.trim()}
                  title="Add custom item"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2">
              {headerAction && <div>{headerAction}</div>}

              <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 gap-2 ${buttonOutlineClass}`}
                    data-tutorial= "store-add"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add Recipe</span>
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
                    onAddRecipe={(id, title) => {
                      onAddRecipe(id, title);
                      setIsSearchOpen(false);
                    }}
                    styles={modalStyles}
                  />
                </DialogContent>
              </Dialog>

              {uniqueList.length > 0 && (
                <>
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

                  <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2`}
                        title="Clear entire shopping list"
                      >
                        <Trash2 className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Clear All</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className={`${theme === 'dark' ? 'bg-[#181813] border-[#e8dcc4]/20' : 'bg-white'}`}>
                      <DialogHeader>
                        <DialogTitle className={textClass}>Clear Shopping List?</DialogTitle>
                        <DialogDescription>
                          This will remove all {uniqueList.length} item{uniqueList.length !== 1 ? 's' : ''} from your shopping list. This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex gap-3 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => setClearConfirmOpen(false)}
                          className={buttonOutlineClass}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleClearList}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          Clear List
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </div>
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
                {mergedUngroupedList.map(renderItemRow)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}