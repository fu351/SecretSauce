-- Add sample favorite recipes for testing
-- This script adds some sample favorites for the test users

INSERT INTO public.recipe_favorites (recipe_id, user_id) VALUES
  -- Chef Maria's favorites
  ('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440001'), -- Carbonara
  ('550e8400-e29b-41d4-a716-446655440104', '550e8400-e29b-41d4-a716-446655440001'), -- Thai Curry
  ('550e8400-e29b-41d4-a716-446655440106', '550e8400-e29b-41d4-a716-446655440001'), -- Beef Stir Fry
  
  -- Baker John's favorites
  ('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440002'), -- Chocolate Chip Cookies
  ('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440002'), -- Carbonara
  
  -- Sarah's favorites
  ('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440003'), -- Buddha Bowl
  ('550e8400-e29b-41d4-a716-446655440105', '550e8400-e29b-41d4-a716-446655440003'), -- Avocado Toast
  ('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440003')  -- Chocolate Chip Cookies
ON CONFLICT (recipe_id, user_id) DO NOTHING;
