import type { Database } from "@/lib/database/supabase"

export type CuisineType = Database["public"]["Enums"]["cuisine_type_enum"]
export type MealType = Database["public"]["Enums"]["meal_type_enum"]
export type ProteinType = Database["public"]["Enums"]["protein_type_enum"]
export type DifficultyLevel = Database["public"]["Enums"]["recipe_difficulty"]
export type RecipeTag = Database["public"]["Enums"]["tags_enum"]

export type MockIngredient = {
  name: string
  quantity?: number
  unit?: string
  standardizedIngredientId?: string | null
}

export type MockRecipe = {
  title: string
  cuisine: CuisineType
  mealType: MealType
  protein: ProteinType
  difficulty: DifficultyLevel
  servings: number
  prepTime: number
  cookTime: number
  tags: RecipeTag[]
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  description: string
  imageUrl?: string
  instructions: string[]
  ingredients: MockIngredient[]
}

export const RPC_NAME = "fn_upsert_recipe_with_ingredients"

const stripIngredient = (ingredient: MockIngredient) => {
  const displayName = ingredient.name.trim()
  if (!displayName) return null

  return {
    display_name: displayName,
    standardized_ingredient_id: ingredient.standardizedIngredientId ?? null,
    quantity: ingredient.quantity ?? null,
    units: ingredient.unit ?? null,
  }
}

export function buildMockRecipePayload(recipe: MockRecipe, authorId: string) {
  const ingredients = recipe.ingredients
    .map(stripIngredient)
    .filter((item): item is NonNullable<ReturnType<typeof stripIngredient>> => Boolean(item))

  return {
    p_title: recipe.title,
    p_author_id: authorId,
    p_cuisine: recipe.cuisine,
    p_meal_type: recipe.mealType,
    p_protein: recipe.protein,
    p_difficulty: recipe.difficulty,
    p_servings: recipe.servings,
    p_prep_time: recipe.prepTime,
    p_cook_time: recipe.cookTime,
    p_tags: recipe.tags,
    p_nutrition: recipe.nutrition,
    p_description: recipe.description,
    p_image_url: recipe.imageUrl ?? null,
    p_instructions: recipe.instructions,
    p_ingredients: ingredients,
  }
}

export const MOCK_RECIPES: MockRecipe[] = [
  {
    title: "Smoky Chipotle Chicken Tacos",
    cuisine: "mexican",
    mealType: "dinner",
    protein: "chicken",
    difficulty: "intermediate",
    servings: 4,
    prepTime: 15,
    cookTime: 20,
    tags: ["contains-dairy"],
    nutrition: {
      calories: 540,
      protein: 38,
      carbs: 44,
      fat: 22,
    },
    description:
      "Charred chipotle chicken tucked into grilled corn tortillas with lime, cilantro, and pickled onions.",
    imageUrl: "https://images.unsplash.com/photo-1528701800489-20fcfd7f5de5?auto=format&fit=crop&w=800&q=80",
    instructions: [
      "Whisk chipotle peppers, lime juice, olive oil, garlic, and oregano in a bowl, then marinate the chicken for at least 15 minutes.",
      "Sear the chicken on medium-high heat until cooked through, about 4-5 minutes per side, then let it rest before slicing.",
      "Warm tortillas over an open flame or skillet, then assemble tacos with sliced chicken, cilantro, pickled onions, and cotija.",
      "Finish with a squeeze of lime and a drizzle of crema.",
    ],
    ingredients: [
      { name: "boneless skinless chicken thighs", quantity: 1.25, unit: "lb" },
      { name: "chipotle peppers in adobo", quantity: 2, unit: "tbsp" },
      { name: "fresh lime juice", quantity: 2, unit: "tbsp" },
      { name: "extra virgin olive oil", quantity: 2, unit: "tbsp" },
      { name: "garlic cloves", quantity: 3, unit: "clove" },
      { name: "corn tortillas", quantity: 8, unit: "count" },
      { name: "fresh cilantro", quantity: 0.5, unit: "cup" },
      { name: "red onion", quantity: 0.25, unit: "cup" },
      { name: "cotija cheese", quantity: 0.25, unit: "cup" },
    ],
  },
  {
    title: "Mediterranean Chickpea Bowl",
    cuisine: "mediterranean",
    mealType: "lunch",
    protein: "legume",
    difficulty: "beginner",
    servings: 3,
    prepTime: 20,
    cookTime: 10,
    tags: ["vegetarian", "gluten-free"],
    nutrition: {
      calories: 420,
      protein: 18,
      carbs: 52,
      fat: 16,
    },
    description: "A bright bowl packed with chickpeas, quinoa, charred veg, and a lemon-tahini dressing.",
    imageUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Cook quinoa according to package directions and fluff with a fork.",
      "Toss cherry tomatoes, zucchini, and bell pepper with olive oil, salt, and pepper; roast until tender and slightly charred.",
      "Whisk tahini, lemon juice, garlic, smoked paprika, and warm water to make a drizzling dressing.",
      "Layer quinoa, roasted vegetables, chickpeas, and spinach in bowls, then finish with dressing and a sprinkle of za'atar.",
    ],
    ingredients: [
      { name: "cooked quinoa", quantity: 1, unit: "cup" },
      { name: "canned chickpeas", quantity: 1.5, unit: "cup" },
      { name: "cherry tomatoes", quantity: 1, unit: "cup" },
      { name: "zucchini", quantity: 1, unit: "each" },
      { name: "red bell pepper", quantity: 1, unit: "each" },
      { name: "baby spinach", quantity: 2, unit: "cup" },
      { name: "extra virgin olive oil", quantity: 3, unit: "tbsp" },
      { name: "lemon juice", quantity: 3, unit: "tbsp" },
      { name: "tahini", quantity: 2, unit: "tbsp" },
      { name: "smoked paprika", quantity: 1, unit: "tsp" },
    ],
  },
  {
    title: "Ginger Miso Salmon",
    cuisine: "japanese",
    mealType: "dinner",
    protein: "fish",
    difficulty: "intermediate",
    servings: 2,
    prepTime: 10,
    cookTime: 15,
    tags: ["contains-soy", "contains-gluten"],
    nutrition: {
      calories: 610,
      protein: 45,
      carbs: 18,
      fat: 32,
    },
    description: "Soy-miso glazed salmon roasted with ginger and sesame for a quick weeknight dinner.",
    imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Whisk miso paste, soy sauce, honey, rice vinegar, ginger, and sesame oil into a glossy glaze.",
      "Brush the glaze over salmon fillets and let marinate for 10 minutes.",
      "Bake the salmon at 425°F (220°C) for 10-12 minutes until just cooked through, then broil for 1-2 minutes to caramelize.",
      "Garnish with sliced scallions and toasted sesame seeds before serving.",
    ],
    ingredients: [
      { name: "salmon fillets", quantity: 1.25, unit: "lb" },
      { name: "white miso paste", quantity: 2, unit: "tbsp" },
      { name: "low sodium soy sauce", quantity: 3, unit: "tbsp" },
      { name: "honey", quantity: 1.5, unit: "tbsp" },
      { name: "rice vinegar", quantity: 1, unit: "tbsp" },
      { name: "fresh ginger", quantity: 1, unit: "tbsp" },
      { name: "sesame oil", quantity: 1, unit: "tsp" },
      { name: "scallions", quantity: 2, unit: "stalk" },
    ],
  },
  {
    title: "Lemon Tarragon Roasted Cod",
    cuisine: "french",
    mealType: "dinner",
    protein: "fish",
    difficulty: "beginner",
    servings: 4,
    prepTime: 15,
    cookTime: 18,
    tags: ["gluten-free"],
    nutrition: {
      calories: 380,
      protein: 38,
      carbs: 12,
      fat: 18,
    },
    description: "Bright lemon and tarragon-roasted cod served with blistered veggies for an easy weeknight dinner.",
    imageUrl: "https://images.unsplash.com/photo-1512058564366-c9e3c5b8051b?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Preheat oven to 425°F (220°C) and line a sheet pan with parchment.",
      "Place cod fillets on the pan, drizzle with olive oil, lemon zest, minced garlic, chopped tarragon, salt, and pepper.",
      "Roast for 12-14 minutes until the fish flakes easily, adding thinly sliced lemons and asparagus to the pan halfway through.",
      "Serve with extra lemon wedges and a scattering of fresh tarragon leaves.",
    ],
    ingredients: [
      { name: "cod fillets", quantity: 1.5, unit: "lb" },
      { name: "extra virgin olive oil", quantity: 2, unit: "tbsp" },
      { name: "fresh lemon zest", quantity: 1, unit: "tbsp" },
      { name: "fresh lemon juice", quantity: 2, unit: "tbsp" },
      { name: "garlic cloves", quantity: 3, unit: "clove" },
      { name: "fresh tarragon", quantity: 0.25, unit: "cup" },
      { name: "asparagus spears", quantity: 1, unit: "bunch" },
      { name: "lemon", quantity: 1, unit: "each" },
    ],
  },
  {
    title: "Thai Basil Beef Noodles",
    cuisine: "thai",
    mealType: "dinner",
    protein: "beef",
    difficulty: "intermediate",
    servings: 4,
    prepTime: 20,
    cookTime: 15,
    tags: ["contains-soy"],
    nutrition: {
      calories: 610,
      protein: 36,
      carbs: 62,
      fat: 24,
    },
    description: "Sizzling beef tossed with rice noodles, basil, and fiery chili garlicky sauce for a takeout-style dinner.",
    imageUrl: "https://images.unsplash.com/photo-1543353071-873f17a7a088?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Soak rice noodles in hot water until pliable, then drain and set aside.",
      "Stir-fry thinly sliced beef with fish sauce, tamari, brown sugar, garlic, and Thai chilies until browned.",
      "Add shallots, bell pepper, and the noodles, tossing with oyster sauce and a splash of rice vinegar until coated.",
      "Finish with a generous handful of Thai basil leaves and serve with lime wedges.",
    ],
    ingredients: [
      { name: "rice noodles", quantity: 8, unit: "oz" },
      { name: "flank steak", quantity: 1, unit: "lb" },
      { name: "garlic cloves", quantity: 4, unit: "clove" },
      { name: "Thai bird chilies", quantity: 2, unit: "each" },
      { name: "fish sauce", quantity: 1.5, unit: "tbsp" },
      { name: "low sodium tamari", quantity: 1.5, unit: "tbsp" },
      { name: "oyster sauce", quantity: 2, unit: "tbsp" },
      { name: "Thai basil leaves", quantity: 1, unit: "cup" },
      { name: "bell pepper", quantity: 1, unit: "each" },
      { name: "lime", quantity: 1, unit: "each" },
    ],
  },
  {
    title: "Middle Eastern Chickpea & Eggplant Stew",
    cuisine: "middle-eastern",
    mealType: "lunch",
    protein: "legume",
    difficulty: "intermediate",
    servings: 4,
    prepTime: 25,
    cookTime: 35,
    tags: ["vegetarian", "gluten-free"],
    nutrition: {
      calories: 460,
      protein: 18,
      carbs: 60,
      fat: 18,
    },
    description: "A warming stew of roasted eggplant, chickpeas, and fragrant Middle Eastern spices.",
    imageUrl: "https://images.unsplash.com/photo-1512058564366-c9e3c5b8051b?auto=format&fit=crop&w=800&q=80",
    instructions: [
      "Roast diced eggplant tossed with olive oil until the cubes are golden and tender.",
      "Sauté onion, garlic, and shaved carrots with cumin, coriander, smoked paprika, and a pinch of cinnamon.",
      "Add chickpeas, roasted eggplant, tomatoes, and vegetable broth, then simmer for 20 minutes to develop flavor.",
      "Finish with fresh parsley, lemon juice, and serve over fluffy couscous or rice.",
    ],
    ingredients: [
      { name: "eggplant", quantity: 2, unit: "each" },
      { name: "canned chickpeas", quantity: 2, unit: "cup" },
      { name: "onion", quantity: 1, unit: "each" },
      { name: "garlic cloves", quantity: 4, unit: "clove" },
      { name: "tomatoes", quantity: 2, unit: "cup" },
      { name: "vegetable broth", quantity: 1.5, unit: "cup" },
      { name: "ground cumin", quantity: 1, unit: "tsp" },
      { name: "smoked paprika", quantity: 1, unit: "tsp" },
      { name: "fresh parsley", quantity: 0.25, unit: "cup" },
      { name: "lemon", quantity: 1, unit: "each" },
    ],
  },
  {
    title: "Grilled Corn, Avocado & Black Bean Salad",
    cuisine: "american",
    mealType: "lunch",
    protein: "legume",
    difficulty: "beginner",
    servings: 4,
    prepTime: 15,
    cookTime: 10,
    tags: ["vegetarian", "gluten-free"],
    nutrition: {
      calories: 340,
      protein: 12,
      carbs: 32,
      fat: 18,
    },
    description: "Charred corn, creamy avocado, and black beans tossed with lime and chile for a vibrant salad.",
    imageUrl: "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Grill corn until lightly charred, then slice kernels into a bowl.",
      "Toss corn with black beans, diced avocado, cherry tomatoes, red onion, and chopped cilantro.",
      "Whisk lime juice, olive oil, honey, and chili flakes, then pour over the salad and gently combine.",
      "Serve chilled or at room temperature with extra cilantro and lime wedges.",
    ],
    ingredients: [
      { name: "fresh corn", quantity: 4, unit: "ear" },
      { name: "canned black beans", quantity: 1.5, unit: "cup" },
      { name: "ripe avocados", quantity: 2, unit: "each" },
      { name: "cherry tomatoes", quantity: 1, unit: "cup" },
      { name: "red onion", quantity: 0.5, unit: "cup" },
      { name: "cilantro", quantity: 0.25, unit: "cup" },
      { name: "lime juice", quantity: 3, unit: "tbsp" },
      { name: "extra virgin olive oil", quantity: 2, unit: "tbsp" },
      { name: "honey", quantity: 1, unit: "tsp" },
    ],
  },
  {
    title: "Coconut Turmeric Lentil Dal",
    cuisine: "indian",
    mealType: "dinner",
    protein: "legume",
    difficulty: "intermediate",
    servings: 4,
    prepTime: 20,
    cookTime: 25,
    tags: ["vegan", "gluten-free"],
    nutrition: {
      calories: 500,
      protein: 22,
      carbs: 58,
      fat: 20,
    },
    description: "Creamy coconut turmeric dal simmered with ginger, garlic, and mustard seeds for a comforting bowl.",
    imageUrl: "https://images.unsplash.com/photo-1500917293891-ef795e70e1f6?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Rinse red lentils until water runs clear, then simmer with water, turmeric, cinnamon stick, and bay leaf until tender.",
      "Temper mustard seeds, cumin, curry leaves, and dried chilies in ghee, then add onions, garlic, and ginger until golden.",
      "Stir the toasted aromatics into the lentils along with coconut milk, lime juice, and chopped tomatoes; simmer to thicken.",
      "Finish with chopped cilantro, serve with basmati rice, and garnish with toasted coconut or pepitas.",
    ],
    ingredients: [
      { name: "red lentils", quantity: 1.5, unit: "cup" },
      { name: "coconut milk", quantity: 1, unit: "cup" },
      { name: "vegetable broth", quantity: 2, unit: "cup" },
      { name: "onion", quantity: 1, unit: "each" },
      { name: "garlic cloves", quantity: 4, unit: "clove" },
      { name: "fresh ginger", quantity: 1, unit: "tbsp" },
      { name: "mustard seeds", quantity: 1, unit: "tsp" },
      { name: "curry leaves", quantity: 8, unit: "leaf" },
      { name: "cumin seeds", quantity: 1, unit: "tsp" },
      { name: "lime", quantity: 1, unit: "each" },
    ],
  },
  {
    title: "Spicy Korean Pork Bibimbap",
    cuisine: "korean",
    mealType: "dinner",
    protein: "pork",
    difficulty: "intermediate",
    servings: 4,
    prepTime: 20,
    cookTime: 15,
    tags: ["contains-soy"],
    nutrition: {
      calories: 640,
      protein: 33,
      carbs: 68,
      fat: 28,
    },
    description:
      "Caramelized gochujang pork nestled atop warm rice with blistered veggies, a fried egg, and sesame crunch.",
    imageUrl: "https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Sauté ground pork with garlic, ginger, gochujang, soy sauce, sesame oil, and brown sugar until browned and sticky.",
      "Roast broccoli florets and carrots tossed in oil and a pinch of salt until charred at the edges.",
      "Warm rice, then divide among bowls with pork, veggies, and a fried egg per bowl.",
      "Top with cucumber ribbons, kimchi, sesame seeds, and a drizzle of extra sesame oil before serving.",
    ],
    ingredients: [
      { name: "ground pork", quantity: 1.25, unit: "lb" },
      { name: "gochujang", quantity: 2, unit: "tbsp" },
      { name: "soy sauce", quantity: 2, unit: "tbsp" },
      { name: "sesame oil", quantity: 1.5, unit: "tbsp" },
      { name: "brown sugar", quantity: 2, unit: "tbsp" },
      { name: "garlic cloves", quantity: 3, unit: "clove" },
      { name: "fresh ginger", quantity: 1, unit: "tbsp" },
      { name: "broccoli florets", quantity: 2, unit: "cup" },
      { name: "carrots", quantity: 2, unit: "each" },
      { name: "cooked jasmine rice", quantity: 4, unit: "cup" },
      { name: "large eggs", quantity: 4, unit: "each" },
    ],
  },
  {
    title: "Heirloom Tomato & Burrata Toast",
    cuisine: "italian",
    mealType: "lunch",
    protein: "other",
    difficulty: "beginner",
    servings: 2,
    prepTime: 10,
    cookTime: 8,
    tags: ["vegetarian"],
    nutrition: {
      calories: 410,
      protein: 12,
      carbs: 28,
      fat: 26,
    },
    description: "Crunchy sourdough piled with creamy burrata, cornichon tomatoes, and basil oil for a sunny snack.",
    imageUrl: "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Toast sourdough slices until golden and brush with garlic-infused olive oil.",
      "Halve heirloom tomatoes, drizzle with fine sea salt, and let them macerate while burrata softens.",
      "Top each slice with torn burrata, tomatoes, a scattering of basil leaves, and a pinch of Aleppo pepper.",
      "Finish with a drizzle of extra virgin olive oil and flaky salt right before serving.",
    ],
    ingredients: [
      { name: "sourdough bread", quantity: 4, unit: "slice" },
      { name: "burrata cheese", quantity: 1, unit: "ball" },
      { name: "heirloom tomatoes", quantity: 2, unit: "cup" },
      { name: "fresh basil", quantity: 0.25, unit: "cup" },
      { name: "extra virgin olive oil", quantity: 2, unit: "tbsp" },
      { name: "garlic clove", quantity: 1, unit: "clove" },
      { name: "Aleppo pepper", quantity: 0.5, unit: "tsp" },
    ],
  },
  {
    title: "Moroccan Harissa Carrot & Chickpea Salad",
    cuisine: "middle-eastern",
    mealType: "lunch",
    protein: "legume",
    difficulty: "intermediate",
    servings: 4,
    prepTime: 20,
    cookTime: 15,
    tags: ["vegan", "gluten-free", "dairy-free"],
    nutrition: {
      calories: 340,
      protein: 14,
      carbs: 38,
      fat: 15,
    },
    description: "Roasted carrots and chickpeas tossed with harissa, preserved lemon, and fresh mint for layered heat.",
    imageUrl: "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Roast carrot ribbons and chickpeas coated in harissa paste, olive oil, and maple syrup until caramelized.",
      "Toast cumin and coriander seeds in a dry skillet, then grind with sea salt and preserved lemon rind.",
      "Toss warm veggies with picked mint, chopped parsley, and a squeeze of lemon juice.",
      "Serve over a bed of arugula with toasted almonds and a drizzle of extra olive oil.",
    ],
    ingredients: [
      { name: "carrots", quantity: 4, unit: "each" },
      { name: "canned chickpeas", quantity: 1.5, unit: "cup" },
      { name: "harissa paste", quantity: 2, unit: "tbsp" },
      { name: "maple syrup", quantity: 1, unit: "tbsp" },
      { name: "preserved lemon", quantity: 1, unit: "each" },
      { name: "fresh mint", quantity: 0.25, unit: "cup" },
      { name: "parsley", quantity: 0.25, unit: "cup" },
      { name: "toasted almonds", quantity: 0.25, unit: "cup" },
      { name: "arugula", quantity: 4, unit: "cup" },
    ],
  },
  {
    title: "Thai Coconut Pumpkin Soup",
    cuisine: "thai",
    mealType: "dinner",
    protein: "other",
    difficulty: "intermediate",
    servings: 4,
    prepTime: 15,
    cookTime: 30,
    tags: ["vegetarian", "gluten-free"],
    nutrition: {
      calories: 320,
      protein: 8,
      carbs: 28,
      fat: 20,
    },
    description: "Silky pumpkin puree enriched with coconut milk, lemongrass, and lime for a fragrant bowl.",
    imageUrl: "https://images.unsplash.com/photo-1543353071-873f17a7a088?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Sweat onions, garlic, and ginger in coconut oil until translucent, then add pumpkin puree and red curry paste.",
      "Pour in vegetable broth and simmer with lemongrass and kaffir lime leaves to let the flavors bloom.",
      "Stir in coconut milk, fish sauce, and lime juice, then blend until smooth if desired.",
      "Serve garnished with cilantro, crushed peanuts, and a drizzle of chili oil.",
    ],
    ingredients: [
      { name: "butternut squash puree", quantity: 2, unit: "cup" },
      { name: "coconut milk", quantity: 1, unit: "cup" },
      { name: "vegetable broth", quantity: 3, unit: "cup" },
      { name: "red curry paste", quantity: 1, unit: "tbsp" },
      { name: "lemongrass stalks", quantity: 2, unit: "each" },
      { name: "kaffir lime leaves", quantity: 4, unit: "leaf" },
      { name: "lime juice", quantity: 2, unit: "tbsp" },
      { name: "cilantro", quantity: 0.25, unit: "cup" },
      { name: "crushed peanuts", quantity: 0.25, unit: "cup" },
      { name: "chili oil", quantity: 1, unit: "tbsp" },
    ],
  },
  {
    title: "Greek Lemon Herb Chicken with Farro",
    cuisine: "greek",
    mealType: "dinner",
    protein: "chicken",
    difficulty: "intermediate",
    servings: 4,
    prepTime: 20,
    cookTime: 35,
    tags: ["gluten-free"],
    nutrition: {
      calories: 580,
      protein: 40,
      carbs: 48,
      fat: 24,
    },
    description: "Marinated chicken thighs roasted with lemon, oregano, and tomatoes, served over herbed farro.",
    imageUrl: "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=900&q=80",
    instructions: [
      "Marinate chicken thighs in olive oil, lemon juice, garlic, oregano, and smoked paprika for 30 minutes.",
      "Roast with halved cherry tomatoes and red onion until the chicken reaches 165°F and the veggies caramelize.",
      "Cook farro until tender, then toss with chopped dill, parsley, and lemon zest.",
      "Plate chicken over farro and spoon pan juices with roasted tomatoes on top.",
    ],
    ingredients: [
      { name: "bone-in chicken thighs", quantity: 2, unit: "lb" },
      { name: "olive oil", quantity: 3, unit: "tbsp" },
      { name: "lemon juice", quantity: 3, unit: "tbsp" },
      { name: "garlic cloves", quantity: 4, unit: "clove" },
      { name: "dried oregano", quantity: 2, unit: "tsp" },
      { name: "smoked paprika", quantity: 1, unit: "tsp" },
      { name: "cherry tomatoes", quantity: 1.5, unit: "cup" },
      { name: "red onion", quantity: 1, unit: "each" },
      { name: "farro", quantity: 1, unit: "cup" },
      { name: "fresh dill", quantity: 0.25, unit: "cup" },
      { name: "fresh parsley", quantity: 0.25, unit: "cup" },
    ],
  },
]
