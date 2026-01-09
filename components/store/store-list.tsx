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
  Users,
  Grid
} from "lucide-react"

import type { ShoppingListItem, ShoppingListSectionProps } from "@/lib/types/store"
import { QuantityControl } from "@/components/shared/quantity-control"
import { useMergedItems, distributeQuantityChange } from "@/hooks/useMergedItems"
import { useRecipeTitles } from "@/hooks/useRecipeTitles"
import { FOOD_CATEGORIES, DEFAULT_CATEGORY, normalizeCategory, getCategoryIcon } from "@/lib/constants/categories"

/**
 * Convert string to title case
 * "chicken breast" -> "Chicken Breast"
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Calculate the width needed for quantity controls based on items
 * Accounts for quantity display and optional unit, ensures even button distribution
 */
function calculateQuantityControlWidth(items: ShoppingListItem[]): string {
  if (items.length === 0) return "auto"

  let maxContentWidth = 0
  items.forEach(item => {
    // Estimate: quantity text (varies) + unit text (varies)
    const quantityStr = item.quantity.toString()
    const unitStr = item.unit ? ` ${item.unit}` : ""
    const totalLength = quantityStr.length + unitStr.length
    // Each character is roughly 8px for xs font, with extra padding for safety
    const contentWidth = totalLength * 8
    maxContentWidth = Math.max(maxContentWidth, contentWidth)
  })

  // Total: left button (28px) + content + padding (16px for extra space) + right button (28px)
  const totalWidth = 28 + Math.max(maxContentWidth, 24) + 16 + 28
  return `${totalWidth}px`
}

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
  type ViewMode = 'recipe' | 'category' | 'ungrouped'
  const [viewMode, setViewMode] = useState<ViewMode>('recipe')
  const [showUnits, setShowUnits] = useState(true)
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

  // -- Recipe Titles --
  const recipeIds = useMemo(() =>
    shoppingList
      .filter(item => item.recipe_id)
      .map(item => item.recipe_id!)
  , [shoppingList])
  const { titles: recipeTitles } = useRecipeTitles(recipeIds)

  // -- Clear shopping list handler --
  const handleClearList = async () => {
    const recipesToRemove = new Set<string>()

    // Separate recipes and miscellaneous items
    shoppingList.forEach(item => {
      if (item.recipe_id) {
        recipesToRemove.add(item.recipe_id)
      } else {
        onRemoveItem(item.id)
      }
    })

    // Remove recipes
    recipesToRemove.forEach(recipeId => onRemoveRecipe?.(recipeId))
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
      if (item.recipe_id) {
        if (!groups[item.recipe_id]) {
          groups[item.recipe_id] = {
            name: recipeTitles[item.recipe_id] || item.name || "Untitled Recipe",
            items: []
          }
        }
        groups[item.recipe_id].items.push(item)
      } else {
        misc.push(item)
      }
    })

    return { recipeGroups: groups, miscItems: misc }
  }, [uniqueList, recipeTitles]);

  // =========================================================
  // 2B. CATEGORY GROUPING LOGIC
  // =========================================================
  const categoryGroups = useMemo(() => {
    const groups: Record<string, ShoppingListItem[]> = {}

    uniqueList.forEach((item) => {
      const category = normalizeCategory(item.category)
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(item)
    })

    return groups
  }, [uniqueList])

  // =========================================================
  // 3. MERGE LOGIC FOR UNGROUPED VIEW
  // =========================================================
  const mergedUngroupedList = useMergedItems(uniqueList, viewMode !== 'ungrouped')

  // =========================================================
  // 4. QUANTITY CONTROL WIDTH NORMALIZATION
  // =========================================================
  const quantityControlWidth = useMemo(() => {
    if (!showUnits) return "auto"
    return calculateQuantityControlWidth(uniqueList)
  }, [uniqueList, showUnits])

  // -- Handlers --
  const handleMergedQuantityUpdate = (mergedItem: ShoppingListItem & { itemsWithSameName?: ShoppingListItem[] }, newTotalQuantity: number) => {
    distributeQuantityChange(mergedItem, newTotalQuantity, onUpdateQuantity)
  }

  const startEditing = (item: ShoppingListItem) => {
    setEditingId(item.id)
    setEditValue(item.name)
  }

  const resetEdit = () => {
    setEditingId(null)
    setEditValue("")
  }

  const saveEdit = () => {
    if (editingId && editValue.trim()) {
      onUpdateItemName(editingId, editValue.trim())
    }
    resetEdit()
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit()
    if (e.key === "Escape") resetEdit()
  }

  const resetEditingQuantity = () => {
    setEditingQuantityId(null)
    setEditingQuantityValue("")
  }

  const saveEditingQuantity = (itemId: string) => {
    const newQuantity = parseFloat(editingQuantityValue)
    if (!isNaN(newQuantity) && newQuantity >= 1) {
      const item = uniqueList.find(i => i.id === itemId)
      if (item) {
        handleMergedQuantityUpdate(item, newQuantity)
      }
    }
    resetEditingQuantity()
  }

  const handleQuantityKeyDown = (e: React.KeyboardEvent, itemId: string) => {
    if (e.key === "Enter") saveEditingQuantity(itemId)
    if (e.key === "Escape") resetEditingQuantity()
  }

  const startEditingServings = (recipeId: string, currentServings: number) => {
    setEditingServingsId(recipeId)
    setEditingServingsValue(currentServings.toString())
  }

  const resetEditingServings = () => {
    setEditingServingsId(null)
    setEditingServingsValue("")
  }

  const saveEditingServings = (recipeId: string) => {
    const newServings = parseInt(editingServingsValue, 10)
    if (!isNaN(newServings) && newServings >= 1) {
      onUpdateRecipeServings?.(recipeId, newServings)
    }
    resetEditingServings()
  }

  const handleServingsKeyDown = (e: React.KeyboardEvent, recipeId: string) => {
    if (e.key === "Enter") saveEditingServings(recipeId)
    if (e.key === "Escape") resetEditingServings()
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

  // -- Render Helper: Individual Row --
  const renderItemRow = (item: ShoppingListItem) => {
    const isEditing = editingId === item.id

    return (
      <div
        key={item.id}
        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors mb-2 last:mb-0 ${
          theme === "dark"
            ? "bg-[#181813] border-[#e8dcc4]/20"
            : "bg-white border-gray-200"
        }`}
      >

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
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={resetEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="group flex items-center gap-2 overflow-hidden">
              <div className="min-w-0 flex-1">
                <p
                  className={`font-medium break-words transition-all cursor-pointer ${textClass}`}
                  onClick={() => startEditing(item)}
                >
                  {toTitleCase(item.name)}
                </p>
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
          <QuantityControl
            quantity={item.quantity}
            editingId={editingQuantityId}
            itemId={item.id}
            editingValue={editingQuantityValue}
            onQuantityChange={setEditingQuantityValue}
            onQuantityKeyDown={(e) => handleQuantityKeyDown(e, item.id)}
            onDecrement={() => handleMergedQuantityUpdate(item, Math.max(1, item.quantity - 1))}
            onIncrement={() => handleMergedQuantityUpdate(item, item.quantity + 1)}
            theme={theme as "light" | "dark"}
            textClass={textClass}
            disableDecrement={item.quantity <= 1}
            unit={showUnits ? item.unit : undefined}
            minWidth={quantityControlWidth}
          />

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
  const renderSection = (sectionKey: string, title: string, items: ShoppingListItem[], icon: React.ReactNode, isMisc = false, hideServings = false) => {
    const isOpen = isExpanded(sectionKey)
    const totalCount = items.length

    // Get servings from first item (all items in a recipe share the same servings)
    const currentServings = items[0]?.servings || 1
    const isRecipe = items[0]?.source_type === 'recipe' && !hideServings

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

            <div className={`text-xs ${mutedTextClass}`}>
              <span>{totalCount} item{totalCount !== 1 ? 's' : ''}</span>
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
        <div className="flex flex-col gap-3">
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
                      onClick={() => setViewMode('recipe')}
                      className={`h-7 w-7 rounded-sm transition-all ${
                        viewMode === 'recipe'
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
                      onClick={() => setViewMode('category')}
                      className={`h-7 w-7 rounded-sm transition-all ${
                        viewMode === 'category'
                          ? theme === "dark" ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white shadow-sm text-black"
                          : mutedTextClass
                      }`}
                      title="Group by Category"
                    >
                      <Grid className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setViewMode('ungrouped')}
                      className={`h-7 w-7 rounded-sm transition-all ${
                        viewMode === 'ungrouped'
                          ? theme === "dark" ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white shadow-sm text-black"
                          : mutedTextClass
                      }`}
                      title="Ungrouped List"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowUnits(!showUnits)}
                    className={`h-7 w-7 rounded-sm transition-all ${
                      showUnits
                        ? theme === "dark" ? "bg-[#e8dcc4]/20 text-[#e8dcc4]" : "bg-white shadow-sm text-black"
                        : theme === "dark" ? "text-[#e8dcc4]/50" : "text-gray-400"
                    }`}
                    title={showUnits ? "Hide units" : "Show units"}
                  >
                    <span className="text-xs font-semibold">U</span>
                  </Button>

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
          <div className={`flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-lg ${
            theme === "dark" ? "border-[#e8dcc4]/10" : "border-gray-200"
          }`}>
            <ShoppingBasket className={`h-16 w-16 mb-6 ${mutedTextClass}`} opacity={0.5} />
            <p className={`text-xl font-semibold ${textClass}`}>Your list is empty</p>
            <p className={`text-base ${mutedTextClass}`}>Add items or recipes to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {viewMode === 'recipe' ? (
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
            ) : viewMode === 'category' ? (
              <>
                {FOOD_CATEGORIES.map(category => {
                  const items = categoryGroups[category]
                  if (!items || items.length === 0) return null

                  return renderSection(
                    category,
                    category,
                    items,
                    <span className="text-lg">{getCategoryIcon(category)}</span>,
                    false,
                    true
                  )
                })}

                {categoryGroups[DEFAULT_CATEGORY]?.length > 0 &&
                  renderSection(
                    DEFAULT_CATEGORY,
                    DEFAULT_CATEGORY,
                    categoryGroups[DEFAULT_CATEGORY],
                    <span className="text-lg">{getCategoryIcon(DEFAULT_CATEGORY)}</span>,
                    true,
                    true
                  )
                }
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