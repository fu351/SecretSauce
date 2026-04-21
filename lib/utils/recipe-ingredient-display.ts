type IngredientLike = {
  name?: string | null
  display_name?: string | null
  amount?: string | number | null
  quantity?: string | number | null
  unit?: string | null
  units?: string | null
}

const INGREDIENT_LEADING_QUANTITY_RE =
  /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*-\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?))?\s*(.+)$/i

const INGREDIENT_LEADING_UNIT_RE =
  /^(fl\.?\s?oz|fluid\sounces?|tablespoons?|tbsp\.?|teaspoons?|tsp\.?|cups?|ounces?|oz\.?|pounds?|lbs?\.?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|litres?|l|cloves?|cans?|bunch(?:es)?|pinch(?:es)?|slices?|each|ea|ct|units?|sticks?|packages?|pkgs?|pkg)\b\.?\s*(.+)$/i

export function normalizeIngredientText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

export function stringifyQuantity(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const fixed = Number.isInteger(value) ? value.toString() : value.toFixed(3)
    return fixed.replace(/\.?0+$/, "")
  }
  return normalizeIngredientText(value)
}

export function parseIngredientLine(line: string): { quantity: string; unit: string; name: string } {
  const cleanLine = normalizeIngredientText(line)
  if (!cleanLine) return { quantity: "", unit: "", name: "" }

  const quantityMatch = cleanLine.match(INGREDIENT_LEADING_QUANTITY_RE)
  if (!quantityMatch) return { quantity: "", unit: "", name: cleanLine }

  const quantity = [quantityMatch[1], quantityMatch[2]].filter(Boolean).join("-")
  const rest = normalizeIngredientText(quantityMatch[3])
  const unitMatch = rest.match(INGREDIENT_LEADING_UNIT_RE)

  if (!unitMatch) return { quantity, unit: "", name: rest }

  return {
    quantity,
    unit: normalizeIngredientText(unitMatch[1]),
    name: normalizeIngredientText(unitMatch[2]),
  }
}

export function getIngredientDisplayParts(ingredient: IngredientLike): { prefix: string; name: string } {
  const displayLine = normalizeIngredientText(ingredient.display_name || ingredient.name)
  const parsed = parseIngredientLine(displayLine)

  const quantity = stringifyQuantity(ingredient.quantity ?? ingredient.amount) || parsed.quantity
  const rawUnit = normalizeIngredientText(ingredient.unit || ingredient.units) || parsed.unit
  const shouldOmitCountUnit = Boolean(quantity) && /^(each|ea)$/i.test(rawUnit)
  const unit = shouldOmitCountUnit ? "" : rawUnit

  const hasExplicitParts = Boolean(quantity || unit)
  const name = hasExplicitParts
    ? normalizeIngredientText(parsed.name || displayLine)
    : normalizeIngredientText(displayLine || parsed.name)

  return {
    prefix: [quantity, unit].filter(Boolean).join(" ").trim(),
    name: name || "Unnamed ingredient",
  }
}

export function getIngredientFormParts(ingredient: IngredientLike): { name: string; amount: string; unit: string } {
  const displayLine = normalizeIngredientText(ingredient.display_name || ingredient.name)
  const parsed = parseIngredientLine(displayLine)
  const amount = stringifyQuantity(ingredient.amount ?? ingredient.quantity) || parsed.quantity
  const rawUnit = normalizeIngredientText(ingredient.unit || ingredient.units) || parsed.unit
  const unit = amount && /^(each|ea)$/i.test(rawUnit) ? "" : rawUnit
  const hasExplicitParts = Boolean(amount || unit)
  const name = hasExplicitParts
    ? normalizeIngredientText(parsed.name || displayLine)
    : normalizeIngredientText(displayLine || parsed.name)

  return {
    name,
    amount,
    unit,
  }
}
