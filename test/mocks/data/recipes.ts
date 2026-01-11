import type { Recipe } from '@/lib/types/recipe/recipe'

/**
 * Complete mock recipe with all fields populated
 * Used as the base fixture for recipe-related tests
 */
export const mockRecipe: Recipe = {
  id: 'recipe-123',
  title: 'Chocolate Chip Cookies',
  description: 'Classic chocolate chip cookies with a crispy exterior and chewy center',
  image_url: 'https://example.com/cookies.jpg',
  prep_time: 15,
  cook_time: 12,
  servings: 24,
  difficulty: 'beginner',
  cuisine_id: 1,
  cuisine_name: 'American',
  author_id: 'user-456',
  rating_avg: 4.5,
  rating_count: 42,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  ingredients: [
    {
      name: 'all-purpose flour',
      quantity: 2.25,
      unit: 'cups',
      standardizedIngredientId: 'flour-001',
      standardizedName: 'all-purpose flour',
    },
    {
      name: 'butter',
      quantity: 1,
      unit: 'cup',
      standardizedIngredientId: 'butter-001',
      standardizedName: 'butter',
    },
    {
      name: 'chocolate chips',
      quantity: 2,
      unit: 'cups',
      standardizedIngredientId: 'chocolate-001',
      standardizedName: 'chocolate chips',
    },
    {
      name: 'eggs',
      quantity: 2,
      unit: 'whole',
      standardizedIngredientId: 'egg-001',
      standardizedName: 'eggs',
    },
    {
      name: 'vanilla extract',
      quantity: 1,
      unit: 'teaspoon',
      standardizedIngredientId: 'vanilla-001',
      standardizedName: 'vanilla extract',
    },
  ],
  instructions: [
    { step: 1, description: 'Preheat oven to 375°F (190°C)' },
    { step: 2, description: 'Cream butter and brown sugar together' },
    { step: 3, description: 'Beat in eggs and vanilla extract' },
    { step: 4, description: 'Mix in flour until just combined' },
    { step: 5, description: 'Fold in chocolate chips' },
    { step: 6, description: 'Drop spoonfuls onto baking sheet' },
    { step: 7, description: 'Bake for 10-12 minutes until golden brown' },
  ],
  tags: {
    dietary: ['vegetarian'],
    allergens: {
      contains_dairy: true,
      contains_gluten: true,
      contains_nuts: false,
      contains_shellfish: false,
      contains_egg: true,
      contains_soy: false,
    },
    meal_type: 'snack',
    protein: undefined,
    cuisine_guess: 'american',
  },
  nutrition: {
    calories: 210,
    protein: 3,
    carbs: 28,
    fat: 10,
  },
}

/**
 * Simple recipe with minimal fields - useful for testing field presence
 */
export const mockSimpleRecipe: Recipe = {
  id: 'recipe-simple',
  title: 'Basic Pasta',
  description: 'Simple pasta with olive oil and garlic',
  prep_time: 5,
  cook_time: 10,
  servings: 2,
  difficulty: 'beginner',
  author_id: 'user-789',
  rating_avg: 3.8,
  rating_count: 12,
  created_at: '2024-02-01T12:00:00Z',
  updated_at: '2024-02-01T12:00:00Z',
  ingredients: [
    { name: 'pasta', quantity: 1, unit: 'pound', standardizedName: 'pasta' },
    { name: 'olive oil', quantity: 2, unit: 'tablespoons', standardizedName: 'olive oil' },
    { name: 'garlic', quantity: 3, unit: 'cloves', standardizedName: 'garlic' },
  ],
  instructions: [
    { step: 1, description: 'Boil water and cook pasta' },
    { step: 2, description: 'Sauté garlic in olive oil' },
    { step: 3, description: 'Combine pasta with oil and garlic' },
  ],
  tags: {
    dietary: ['vegan'],
    meal_type: 'lunch',
  },
}

/**
 * Vegan recipe with advanced difficulty
 */
export const mockVeganAdvancedRecipe: Recipe = {
  id: 'recipe-advanced',
  title: 'Mushroom Wellington',
  description: 'Elegant vegan main dish with puff pastry',
  image_url: 'https://example.com/wellington.jpg',
  prep_time: 45,
  cook_time: 35,
  servings: 4,
  difficulty: 'advanced',
  cuisine_id: 2,
  cuisine_name: 'French',
  author_id: 'user-chef',
  rating_avg: 4.8,
  rating_count: 89,
  created_at: '2024-01-20T08:00:00Z',
  updated_at: '2024-01-20T08:00:00Z',
  ingredients: [
    { name: 'mixed mushrooms', quantity: 500, unit: 'g', standardizedName: 'mushrooms' },
    { name: 'puff pastry', quantity: 1, unit: 'sheet', standardizedName: 'puff pastry' },
    { name: 'shallots', quantity: 2, unit: 'whole', standardizedName: 'shallots' },
    { name: 'thyme', quantity: 1, unit: 'tablespoon', standardizedName: 'thyme' },
  ],
  instructions: [
    { step: 1, description: 'Finely chop mushrooms and cook down' },
    { step: 2, description: 'Cook shallots until caramelized' },
    { step: 3, description: 'Combine mushrooms, shallots, and thyme' },
    { step: 4, description: 'Wrap mixture in puff pastry' },
    { step: 5, description: 'Brush with plant milk and bake at 400°F for 35 minutes' },
  ],
  tags: {
    dietary: ['vegan', 'gluten-free'],
    allergens: {
      contains_dairy: false,
      contains_gluten: false,
      contains_nuts: false,
      contains_shellfish: false,
      contains_egg: false,
      contains_soy: false,
    },
    meal_type: 'dinner',
    protein: 'legume',
    cuisine_guess: 'french',
  },
  nutrition: {
    calories: 320,
    protein: 12,
    carbs: 35,
    fat: 14,
  },
}

/**
 * Array of multiple recipes for testing list operations
 * Includes variety of difficulties, cuisines, and dietary preferences
 */
export const mockRecipeList: Recipe[] = [
  mockRecipe,
  mockSimpleRecipe,
  mockVeganAdvancedRecipe,
  {
    id: 'recipe-keto',
    title: 'Keto Steak with Butter',
    description: 'High-fat, low-carb steak dinner',
    prep_time: 10,
    cook_time: 20,
    servings: 1,
    difficulty: 'intermediate',
    cuisine_id: 3,
    cuisine_name: 'American',
    author_id: 'user-789',
    rating_avg: 4.2,
    rating_count: 34,
    created_at: '2024-01-10T14:30:00Z',
    updated_at: '2024-01-10T14:30:00Z',
    ingredients: [
      { name: 'ribeye steak', quantity: 12, unit: 'oz', standardizedName: 'beef steak' },
      { name: 'butter', quantity: 2, unit: 'tablespoons', standardizedName: 'butter' },
      { name: 'salt and pepper', quantity: 1, unit: 'pinch', standardizedName: 'seasoning' },
    ],
    instructions: [
      { step: 1, description: 'Heat cast iron skillet' },
      { step: 2, description: 'Season steak generously' },
      { step: 3, description: 'Sear steak 4-5 minutes per side' },
      { step: 4, description: 'Top with butter and rest' },
    ],
    tags: {
      dietary: ['keto'],
      meal_type: 'dinner',
      protein: 'beef',
    },
  },
  {
    id: 'recipe-thai',
    title: 'Thai Green Curry',
    description: 'Spicy and aromatic curry with coconut milk',
    image_url: 'https://example.com/curry.jpg',
    prep_time: 20,
    cook_time: 25,
    servings: 4,
    difficulty: 'intermediate',
    cuisine_id: 4,
    cuisine_name: 'Thai',
    author_id: 'user-456',
    rating_avg: 4.6,
    rating_count: 76,
    created_at: '2024-02-05T11:00:00Z',
    updated_at: '2024-02-05T11:00:00Z',
    ingredients: [
      { name: 'coconut milk', quantity: 1, unit: 'can', standardizedName: 'coconut milk' },
      { name: 'green curry paste', quantity: 3, unit: 'tablespoons', standardizedName: 'curry paste' },
      { name: 'chicken breast', quantity: 1, unit: 'pound', standardizedName: 'chicken' },
      { name: 'bell peppers', quantity: 2, unit: 'whole', standardizedName: 'peppers' },
      { name: 'basil', quantity: 1, unit: 'bunch', standardizedName: 'basil' },
    ],
    instructions: [
      { step: 1, description: 'Bring coconut milk to a simmer' },
      { step: 2, description: 'Stir in curry paste' },
      { step: 3, description: 'Add chicken pieces' },
      { step: 4, description: 'Simmer 15 minutes until cooked through' },
      { step: 5, description: 'Add peppers and basil, cook 5 more minutes' },
    ],
    tags: {
      dietary: [],
      allergens: {
        contains_dairy: true,
        contains_gluten: false,
        contains_nuts: false,
        contains_shellfish: false,
        contains_egg: false,
        contains_soy: true,
      },
      meal_type: 'dinner',
      protein: 'chicken',
      cuisine_guess: 'thai',
    },
    nutrition: {
      calories: 380,
      protein: 35,
      carbs: 12,
      fat: 22,
    },
  },
]

/**
 * Recipe with no ingredients (edge case)
 */
export const mockEmptyIngredientsRecipe: Recipe = {
  id: 'recipe-empty',
  title: 'Water',
  description: 'Just water',
  prep_time: 0,
  cook_time: 0,
  servings: 1,
  difficulty: 'beginner',
  author_id: 'user-test',
  rating_avg: 0,
  rating_count: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ingredients: [],
  instructions: [],
  tags: { dietary: [] },
}

/**
 * Recipe with special characters and unicode in title
 */
export const mockUnicodeRecipe: Recipe = {
  id: 'recipe-unicode',
  title: "Café au Lait & Crêpes",
  description: 'French café breakfast - Café au lait with crêpes',
  prep_time: 10,
  cook_time: 5,
  servings: 2,
  difficulty: 'beginner',
  cuisine_id: 5,
  cuisine_name: 'French',
  author_id: 'user-456',
  rating_avg: 4.3,
  rating_count: 28,
  created_at: '2024-01-25T07:00:00Z',
  updated_at: '2024-01-25T07:00:00Z',
  ingredients: [
    { name: 'whole milk', quantity: 2, unit: 'cups', standardizedName: 'milk' },
    { name: 'coffee', quantity: 1, unit: 'cup', standardizedName: 'coffee' },
  ],
  instructions: [
    { step: 1, description: 'Heat milk and coffee' },
    { step: 2, description: 'Pour milk into coffee cup' },
  ],
  tags: { dietary: ['vegetarian'], meal_type: 'breakfast' },
}
