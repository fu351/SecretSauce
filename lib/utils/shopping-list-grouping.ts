import type { ShoppingListIngredient } from "@/lib/types/store"

export type ShoppingListDisplayItem = ShoppingListIngredient & {
  sourceItemIds: string[]
  sourceItems: ShoppingListIngredient[]
  mergedCount: number
  groupKey: string
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.trim().toLowerCase()
}

function normalizeId(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

export function getShoppingListGroupKey(item: Pick<
  ShoppingListIngredient,
  "ingredient_id" | "standardizedIngredientId" | "name" | "standardizedName" | "unit"
>): string {
  const ingredientId = normalizeId(item.ingredient_id ?? item.standardizedIngredientId)
  if (ingredientId) {
    return `ingredient:${ingredientId}`
  }

  const name = normalizeText(item.standardizedName || item.name)
  const unit = normalizeText(item.unit)
  return `fallback:${name}|${unit}`
}

export function mergeShoppingListItems(items: ShoppingListIngredient[]): ShoppingListDisplayItem[] {
  const groups = new Map<string, {
    representative: ShoppingListIngredient
    sourceItems: ShoppingListIngredient[]
    sourceItemIds: string[]
    totalQuantity: number
  }>()
  const orderedKeys: string[] = []

  items.forEach((item) => {
    const groupKey = getShoppingListGroupKey(item)
    const existing = groups.get(groupKey)

    if (!existing) {
      groups.set(groupKey, {
        representative: item,
        sourceItems: [item],
        sourceItemIds: [item.id],
        totalQuantity: Math.max(0, Number(item.quantity) || 0),
      })
      orderedKeys.push(groupKey)
      return
    }

    existing.sourceItems.push(item)
    existing.sourceItemIds.push(item.id)
    existing.totalQuantity += Math.max(0, Number(item.quantity) || 0)
  })

  return orderedKeys.map((groupKey) => {
    const group = groups.get(groupKey)!
    const representative = group.representative
    const mergedQuantity = group.totalQuantity > 0
      ? group.totalQuantity
      : Math.max(1, Number(representative.quantity) || 1)

    return {
      ...representative,
      id: group.sourceItemIds.length === 1 ? representative.id : `group:${groupKey}`,
      name: representative.standardizedName?.trim() || representative.name,
      standardizedName: representative.standardizedName?.trim() || undefined,
      quantity: mergedQuantity,
      sourceItemIds: group.sourceItemIds,
      sourceItems: group.sourceItems,
      mergedCount: group.sourceItems.length,
      groupKey,
    }
  })
}
