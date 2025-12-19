#!/usr/bin/env node

/**
 * Offline, locally testable weekly dinner planner.
 * No Supabase or network calls. Run with: `node scripts/mock-weekly-plan.mjs`
 *
 * It uses mock profile/pantry/recipes/stores/prices to produce a 7-day plan.
 */

const profile = {
  id: "offline-user",
  budgetRange: "low",
  dietaryPreferences: ["high-protein"],
  cuisinePreferences: ["mediterranean", "mexican"],
}

const pantry = [
  { name: "rice", quantity: 2, unit: "cup" },
  { name: "black beans", quantity: 1, unit: "can" },
  { name: "garlic", quantity: 3, unit: "clove" },
]

const recipes = [
  {
    id: "r1",
    title: "Chicken Rice Bowl",
    protein: "chicken",
    servings: 2,
    timeMinutes: 30,
    ingredients: [
      { name: "chicken breast", quantity: 1, unit: "lb" },
      { name: "rice", quantity: 1, unit: "cup" },
      { name: "garlic", quantity: 2, unit: "clove" },
    ],
  },
  {
    id: "r2",
    title: "Black Bean Tacos",
    protein: "legume",
    servings: 2,
    timeMinutes: 20,
    ingredients: [
      { name: "black beans", quantity: 1, unit: "can" },
      { name: "tortilla", quantity: 6, unit: "piece" },
      { name: "lettuce", quantity: 1, unit: "head" },
    ],
  },
  {
    id: "r3",
    title: "Salmon with Greens",
    protein: "fish",
    servings: 2,
    timeMinutes: 25,
    ingredients: [
      { name: "salmon fillet", quantity: 0.75, unit: "lb" },
      { name: "spinach", quantity: 1, unit: "bag" },
      { name: "lemon", quantity: 1, unit: "piece" },
    ],
  },
  {
    id: "r4",
    title: "Tofu Stir Fry",
    protein: "tofu",
    servings: 2,
    timeMinutes: 25,
    ingredients: [
      { name: "tofu", quantity: 1, unit: "block" },
      { name: "broccoli", quantity: 1, unit: "head" },
      { name: "rice", quantity: 1, unit: "cup" },
    ],
  },
  {
    id: "r5",
    title: "Turkey Chili",
    protein: "turkey",
    servings: 4,
    timeMinutes: 40,
    ingredients: [
      { name: "ground turkey", quantity: 1, unit: "lb" },
      { name: "black beans", quantity: 1, unit: "can" },
      { name: "tomato", quantity: 2, unit: "piece" },
    ],
  },
  {
    id: "r6",
    title: "Beef Pasta",
    protein: "beef",
    servings: 4,
    timeMinutes: 35,
    ingredients: [
      { name: "ground beef", quantity: 1, unit: "lb" },
      { name: "pasta", quantity: 12, unit: "oz" },
      { name: "tomato", quantity: 2, unit: "piece" },
    ],
  },
  {
    id: "r7",
    title: "Veggie Fried Rice",
    protein: "egg",
    servings: 3,
    timeMinutes: 20,
    ingredients: [
      { name: "rice", quantity: 1.5, unit: "cup" },
      { name: "egg", quantity: 3, unit: "piece" },
      { name: "carrot", quantity: 2, unit: "piece" },
    ],
  },
  {
    id: "r8",
    title: "Pork Lettuce Wraps",
    protein: "pork",
    servings: 3,
    timeMinutes: 25,
    ingredients: [
      { name: "ground pork", quantity: 1, unit: "lb" },
      { name: "lettuce", quantity: 1, unit: "head" },
      { name: "rice", quantity: 0.5, unit: "cup" },
    ],
  },
  {
    id: "r9",
    title: "Chickpea Curry",
    protein: "legume",
    servings: 3,
    timeMinutes: 30,
    ingredients: [
      { name: "chickpeas", quantity: 1, unit: "can" },
      { name: "spinach", quantity: 1, unit: "bag" },
      { name: "rice", quantity: 1, unit: "cup" },
    ],
  },
]

const prices = {
  walmart: {
    "chicken breast": { price: 4.5, quantity: 1, unit: "lb" },
    "rice": { price: 1.2, quantity: 1, unit: "cup" },
    "garlic": { price: 0.5, quantity: 3, unit: "clove" },
    "black beans": { price: 1.1, quantity: 1, unit: "can" },
    "tortilla": { price: 2.0, quantity: 10, unit: "piece" },
    "lettuce": { price: 1.5, quantity: 1, unit: "head" },
    "salmon fillet": { price: 8.0, quantity: 1, unit: "lb" },
    "spinach": { price: 2.5, quantity: 1, unit: "bag" },
    "lemon": { price: 0.6, quantity: 1, unit: "piece" },
    "tofu": { price: 2.0, quantity: 1, unit: "block" },
    "broccoli": { price: 2.0, quantity: 1, unit: "head" },
    "ground turkey": { price: 4.0, quantity: 1, unit: "lb" },
    "tomato": { price: 0.9, quantity: 1, unit: "piece" },
    "ground beef": { price: 5.0, quantity: 1, unit: "lb" },
    "pasta": { price: 1.8, quantity: 12, unit: "oz" },
    "egg": { price: 2.2, quantity: 12, unit: "piece" },
    "carrot": { price: 0.7, quantity: 1, unit: "piece" },
    "ground pork": { price: 4.3, quantity: 1, unit: "lb" },
    "chickpeas": { price: 1.2, quantity: 1, unit: "can" },
  },
}

const storeId = "walmart"

function aggregateNeeds(planRecipes) {
  const needs = new Map()
  for (const recipe of planRecipes) {
    for (const ing of recipe.ingredients) {
      const key = ing.name.toLowerCase()
      const current = needs.get(key) || { name: ing.name, quantity: 0, unit: ing.unit }
      current.quantity += ing.quantity
      needs.set(key, current)
    }
  }
  return needs
}

function applyPantry(needs) {
  for (const item of pantry) {
    const key = item.name.toLowerCase()
    if (!needs.has(key)) continue
    const entry = needs.get(key)
    entry.quantity = Math.max(0, entry.quantity - (item.quantity || 0))
    needs.set(key, entry)
  }
  return needs
}

function priceBasket(needs) {
  const catalog = prices[storeId] || {}
  let total = 0
  const perIngredientCost = {}
  for (const entry of needs.values()) {
    if (entry.quantity <= 0) continue
    const priceRow = catalog[entry.name.toLowerCase()]
    if (!priceRow) continue
    const packagesNeeded = Math.max(1, Math.ceil(entry.quantity / priceRow.quantity))
    const cost = packagesNeeded * priceRow.price
    total += cost
    perIngredientCost[entry.name] = Number(cost.toFixed(2))
  }
  return { total: Number(total.toFixed(2)), perIngredientCost }
}

function proteinCounts(planRecipes) {
  const counts = {}
  for (const r of planRecipes) {
    counts[r.protein] = (counts[r.protein] || 0) + 1
  }
  return counts
}

function pickPlan() {
  // Cheap-first, but ensure 3+ proteins if available
  const costPerRecipe = recipes.map((r) => {
    const needs = aggregateNeeds([r])
    applyPantry(needs)
    const priced = priceBasket(needs)
    return { recipe: r, costPerServing: priced.total / (r.servings || 1) }
  })

  // Sort by cost per serving
  costPerRecipe.sort((a, b) => a.costPerServing - b.costPerServing)

  const selected = []
  const proteinSeen = new Set()

  for (const entry of costPerRecipe) {
    if (selected.length >= 7) break
    if (proteinSeen.size < 3) {
      if (!proteinSeen.has(entry.recipe.protein)) {
        proteinSeen.add(entry.recipe.protein)
        selected.push(entry.recipe)
      }
    } else {
      selected.push(entry.recipe)
    }
  }

  // If still short, fill from remaining cheapest
  for (const entry of costPerRecipe) {
    if (selected.length >= 7) break
    if (!selected.find((r) => r.id === entry.recipe.id)) selected.push(entry.recipe)
  }

  return selected.slice(0, 7)
}

function planToOutput(planRecipes) {
  const needs = aggregateNeeds(planRecipes)
  applyPantry(needs)
  const priced = priceBasket(needs)
  const proteins = proteinCounts(planRecipes)
  return {
    storeId,
    totalCost: priced.total,
    dinners: planRecipes.map((r, idx) => ({ dayIndex: idx, recipeId: r.id, title: r.title })),
    explanation: `Offline mock plan using ${storeId}. Estimated basket $${priced.total}. Protein mix: ${Object.entries(
      proteins
    )
      .map(([p, c]) => `${p}(${c})`)
      .join(", ") || "mixed"}. Pantry applied where possible.`,
  }
}

function main() {
  const planRecipes = pickPlan()
  const output = planToOutput(planRecipes)
  console.log(JSON.stringify(output, null, 2))
}

main()
