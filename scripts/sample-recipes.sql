-- Insert sample profiles first (these would normally be created when users sign up)
INSERT INTO public.profiles (id, email, full_name, cooking_level, primary_goal) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'chef@example.com', 'Chef Maria Rodriguez', 'advanced', 'cooking'),
  ('550e8400-e29b-41d4-a716-446655440002', 'baker@example.com', 'Baker John Smith', 'intermediate', 'cooking'),
  ('550e8400-e29b-41d4-a716-446655440003', 'home@example.com', 'Sarah Johnson', 'beginner', 'both')
ON CONFLICT (id) DO NOTHING;

-- Insert sample recipes
INSERT INTO public.recipes (
  id,
  title,
  description,
  image_url,
  prep_time,
  cook_time,
  servings,
  difficulty,
  cuisine_type,
  dietary_tags,
  ingredients,
  instructions,
  nutrition,
  author_id,
  rating_avg,
  rating_count
) VALUES
(
  '550e8400-e29b-41d4-a716-446655440101',
  'Classic Spaghetti Carbonara',
  'A traditional Italian pasta dish with eggs, cheese, pancetta, and black pepper. Simple ingredients come together to create this creamy, indulgent meal.',
  '/placeholder.svg?height=400&width=600',
  15,
  20,
  4,
  'intermediate',
  'Italian',
  ARRAY['Quick', 'Comfort Food'],
  '[
    {"amount": "1", "unit": "lb", "name": "spaghetti pasta"},
    {"amount": "6", "unit": "oz", "name": "pancetta, diced"},
    {"amount": "4", "unit": "large", "name": "eggs"},
    {"amount": "1", "unit": "cup", "name": "Pecorino Romano cheese, grated"},
    {"amount": "1", "unit": "tsp", "name": "black pepper, freshly ground"},
    {"amount": "2", "unit": "cloves", "name": "garlic, minced"},
    {"amount": "1", "unit": "tbsp", "name": "olive oil"}
  ]'::jsonb,
  '[
    {"step": 1, "description": "Bring a large pot of salted water to boil. Cook spaghetti according to package directions until al dente."},
    {"step": 2, "description": "While pasta cooks, heat olive oil in a large skillet over medium heat. Add pancetta and cook until crispy, about 5-7 minutes."},
    {"step": 3, "description": "Add minced garlic to the pancetta and cook for 1 minute until fragrant."},
    {"step": 4, "description": "In a bowl, whisk together eggs, grated cheese, and black pepper."},
    {"step": 5, "description": "Reserve 1 cup of pasta cooking water, then drain the spaghetti."},
    {"step": 6, "description": "Add hot pasta to the skillet with pancetta. Remove from heat."},
    {"step": 7, "description": "Quickly pour the egg mixture over the pasta, tossing constantly to create a creamy sauce. Add pasta water as needed."},
    {"step": 8, "description": "Serve immediately with extra cheese and black pepper."}
  ]'::jsonb,
  '{"calories": 520, "protein": 28, "carbs": 45, "fat": 24}'::jsonb,
  '550e8400-e29b-41d4-a716-446655440001',
  4.8,
  24
),
(
  '550e8400-e29b-41d4-a716-446655440102',
  'Vegetarian Buddha Bowl',
  'A nourishing bowl packed with quinoa, roasted vegetables, avocado, and a tahini dressing. Perfect for a healthy, satisfying meal.',
  '/placeholder.svg?height=400&width=600',
  20,
  25,
  2,
  'beginner',
  'Mediterranean',
  ARRAY['Vegetarian', 'Healthy', 'Gluten-Free', 'High-Protein'],
  '[
    {"amount": "1", "unit": "cup", "name": "quinoa, uncooked"},
    {"amount": "1", "unit": "large", "name": "sweet potato, cubed"},
    {"amount": "1", "unit": "cup", "name": "broccoli florets"},
    {"amount": "1", "unit": "cup", "name": "chickpeas, cooked"},
    {"amount": "1", "unit": "large", "name": "avocado, sliced"},
    {"amount": "2", "unit": "cups", "name": "baby spinach"},
    {"amount": "2", "unit": "tbsp", "name": "tahini"},
    {"amount": "1", "unit": "tbsp", "name": "lemon juice"},
    {"amount": "1", "unit": "tbsp", "name": "olive oil"},
    {"amount": "1", "unit": "tsp", "name": "maple syrup"},
    {"amount": "1", "unit": "clove", "name": "garlic, minced"}
  ]'::jsonb,
  '[
    {"step": 1, "description": "Preheat oven to 400°F (200°C). Cook quinoa according to package directions."},
    {"step": 2, "description": "Toss sweet potato cubes with olive oil, salt, and pepper. Roast for 20 minutes."},
    {"step": 3, "description": "Add broccoli to the baking sheet and roast for another 10 minutes."},
    {"step": 4, "description": "Make dressing by whisking together tahini, lemon juice, maple syrup, minced garlic, and 2-3 tbsp water."},
    {"step": 5, "description": "Warm chickpeas in a small pan with a pinch of salt and pepper."},
    {"step": 6, "description": "Assemble bowls with quinoa as the base, then add roasted vegetables, chickpeas, spinach, and avocado."},
    {"step": 7, "description": "Drizzle with tahini dressing and serve immediately."}
  ]'::jsonb,
  '{"calories": 485, "protein": 18, "carbs": 62, "fat": 22}'::jsonb,
  '550e8400-e29b-41d4-a716-446655440003',
  4.6,
  18
),
(
  '550e8400-e29b-41d4-a716-446655440103',
  'Chocolate Chip Cookies',
  'The perfect chewy chocolate chip cookies with crispy edges and soft centers. A classic treat that never goes out of style.',
  '/placeholder.svg?height=400&width=600',
  15,
  12,
  24,
  'beginner',
  'American',
  ARRAY['Dessert', 'Kid-Friendly'],
  '[
    {"amount": "2.25", "unit": "cups", "name": "all-purpose flour"},
    {"amount": "1", "unit": "tsp", "name": "baking soda"},
    {"amount": "1", "unit": "tsp", "name": "salt"},
    {"amount": "1", "unit": "cup", "name": "butter, softened"},
    {"amount": "0.75", "unit": "cup", "name": "brown sugar, packed"},
    {"amount": "0.75", "unit": "cup", "name": "granulated sugar"},
    {"amount": "2", "unit": "large", "name": "eggs"},
    {"amount": "2", "unit": "tsp", "name": "vanilla extract"},
    {"amount": "2", "unit": "cups", "name": "chocolate chips"}
  ]'::jsonb,
  '[
    {"step": 1, "description": "Preheat oven to 375°F (190°C). Line baking sheets with parchment paper."},
    {"step": 2, "description": "In a bowl, whisk together flour, baking soda, and salt."},
    {"step": 3, "description": "In a large bowl, cream together softened butter and both sugars until light and fluffy."},
    {"step": 4, "description": "Beat in eggs one at a time, then add vanilla extract."},
    {"step": 5, "description": "Gradually mix in the flour mixture until just combined."},
    {"step": 6, "description": "Fold in chocolate chips."},
    {"step": 7, "description": "Drop rounded tablespoons of dough onto prepared baking sheets, spacing 2 inches apart."},
    {"step": 8, "description": "Bake for 9-11 minutes until edges are golden brown. Cool on baking sheet for 5 minutes before transferring."}
  ]'::jsonb,
  '{"calories": 185, "protein": 2, "carbs": 28, "fat": 8}'::jsonb,
  '550e8400-e29b-41d4-a716-446655440002',
  4.9,
  32
),
(
  '550e8400-e29b-41d4-a716-446655440104',
  'Thai Green Curry',
  'Aromatic and spicy Thai green curry with coconut milk, vegetables, and your choice of protein. Served over jasmine rice.',
  '/placeholder.svg?height=400&width=600',
  20,
  25,
  4,
  'intermediate',
  'Thai',
  ARRAY['Spicy', 'Dairy-Free', 'Gluten-Free'],
  '[
    {"amount": "2", "unit": "tbsp", "name": "green curry paste"},
    {"amount": "1", "unit": "can", "name": "coconut milk (14oz)"},
    {"amount": "1", "unit": "lb", "name": "chicken breast, sliced"},
    {"amount": "1", "unit": "large", "name": "eggplant, cubed"},
    {"amount": "1", "unit": "cup", "name": "green beans, trimmed"},
    {"amount": "1", "unit": "red", "name": "bell pepper, sliced"},
    {"amount": "2", "unit": "tbsp", "name": "fish sauce"},
    {"amount": "1", "unit": "tbsp", "name": "brown sugar"},
    {"amount": "1", "unit": "cup", "name": "Thai basil leaves"},
    {"amount": "2", "unit": "cups", "name": "jasmine rice, cooked"}
  ]'::jsonb,
  '[
    {"step": 1, "description": "Heat 2 tbsp of thick coconut milk in a large pan over medium heat."},
    {"step": 2, "description": "Add green curry paste and fry for 2-3 minutes until fragrant."},
    {"step": 3, "description": "Add chicken and cook until no longer pink, about 5 minutes."},
    {"step": 4, "description": "Pour in remaining coconut milk and bring to a gentle simmer."},
    {"step": 5, "description": "Add eggplant, green beans, and bell pepper. Simmer for 10-15 minutes."},
    {"step": 6, "description": "Season with fish sauce and brown sugar. Taste and adjust."},
    {"step": 7, "description": "Stir in Thai basil leaves just before serving."},
    {"step": 8, "description": "Serve over jasmine rice with extra basil leaves."}
  ]'::jsonb,
  '{"calories": 420, "protein": 32, "carbs": 35, "fat": 18}'::jsonb,
  '550e8400-e29b-41d4-a716-446655440001',
  4.7,
  15
),
(
  '550e8400-e29b-41d4-a716-446655440105',
  'Avocado Toast with Poached Egg',
  'Simple yet elegant avocado toast topped with a perfectly poached egg. A nutritious breakfast or light lunch option.',
  '/placeholder.svg?height=400&width=600',
  10,
  8,
  2,
  'beginner',
  'American',
  ARRAY['Healthy', 'Vegetarian', 'Quick', 'High-Protein'],
  '[
    {"amount": "2", "unit": "slices", "name": "whole grain bread"},
    {"amount": "1", "unit": "large", "name": "ripe avocado"},
    {"amount": "2", "unit": "large", "name": "eggs"},
    {"amount": "1", "unit": "tbsp", "name": "lemon juice"},
    {"amount": "1", "unit": "tsp", "name": "olive oil"},
    {"amount": "1", "unit": "pinch", "name": "red pepper flakes"},
    {"amount": "1", "unit": "pinch", "name": "salt and pepper"},
    {"amount": "1", "unit": "tbsp", "name": "white vinegar"}
  ]'::jsonb,
  '[
    {"step": 1, "description": "Toast bread slices until golden brown."},
    {"step": 2, "description": "Bring a pot of water to a gentle simmer and add white vinegar."},
    {"step": 3, "description": "Crack each egg into a small bowl, then gently slide into simmering water."},
    {"step": 4, "description": "Poach eggs for 3-4 minutes for runny yolks."},
    {"step": 5, "description": "Meanwhile, mash avocado with lemon juice, salt, and pepper."},
    {"step": 6, "description": "Spread avocado mixture on toasted bread."},
    {"step": 7, "description": "Top each toast with a poached egg."},
    {"step": 8, "description": "Drizzle with olive oil and sprinkle with red pepper flakes."}
  ]'::jsonb,
  '{"calories": 285, "protein": 14, "carbs": 22, "fat": 18}'::jsonb,
  '550e8400-e29b-41d4-a716-446655440003',
  4.5,
  21
),
(
  '550e8400-e29b-41d4-a716-446655440106',
  'Beef Stir Fry with Vegetables',
  'Quick and flavorful beef stir fry with crisp vegetables in a savory sauce. Perfect for busy weeknight dinners.',
  '/placeholder.svg?height=400&width=600',
  15,
  10,
  4,
  'intermediate',
  'Asian',
  ARRAY['Quick', 'High-Protein', 'Dairy-Free'],
  '[
    {"amount": "1", "unit": "lb", "name": "beef sirloin, sliced thin"},
    {"amount": "2", "unit": "tbsp", "name": "vegetable oil"},
    {"amount": "1", "unit": "large", "name": "onion, sliced"},
    {"amount": "2", "unit": "cups", "name": "broccoli florets"},
    {"amount": "1", "unit": "red", "name": "bell pepper, sliced"},
    {"amount": "2", "unit": "cloves", "name": "garlic, minced"},
    {"amount": "3", "unit": "tbsp", "name": "soy sauce"},
    {"amount": "1", "unit": "tbsp", "name": "oyster sauce"},
    {"amount": "1", "unit": "tsp", "name": "cornstarch"},
    {"amount": "2", "unit": "cups", "name": "cooked rice"}
  ]'::jsonb,
  '[
    {"step": 1, "description": "Mix soy sauce, oyster sauce, and cornstarch in a small bowl."},
    {"step": 2, "description": "Heat 1 tbsp oil in a large wok or skillet over high heat."},
    {"step": 3, "description": "Add beef and stir-fry for 2-3 minutes until browned. Remove and set aside."},
    {"step": 4, "description": "Add remaining oil to the pan. Add onion and stir-fry for 2 minutes."},
    {"step": 5, "description": "Add broccoli and bell pepper, stir-fry for 3-4 minutes until crisp-tender."},
    {"step": 6, "description": "Add garlic and stir-fry for 30 seconds until fragrant."},
    {"step": 7, "description": "Return beef to the pan and add sauce mixture. Stir-fry for 1-2 minutes."},
    {"step": 8, "description": "Serve immediately over cooked rice."}
  ]'::jsonb,
  '{"calories": 380, "protein": 28, "carbs": 32, "fat": 15}'::jsonb,
  '550e8400-e29b-41d4-a716-446655440001',
  4.4,
  12
);

-- Insert some sample ratings
INSERT INTO public.recipe_ratings (recipe_id, user_id, rating, review) VALUES
  ('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440002', 5, 'Perfect carbonara! Creamy and delicious.'),
  ('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440003', 4, 'Great recipe, though I added a bit more pepper.'),
  ('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440001', 5, 'Love this healthy bowl! So satisfying.'),
  ('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440001', 5, 'Best chocolate chip cookies ever!'),
  ('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440003', 5, 'Kids absolutely loved these cookies.')
ON CONFLICT (recipe_id, user_id) DO NOTHING;
