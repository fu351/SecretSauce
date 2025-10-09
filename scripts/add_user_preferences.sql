-- Add user preference columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS cuisine_preferences TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS cooking_time_preference TEXT DEFAULT 'any',
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS grocery_distance_km INTEGER DEFAULT 10;

-- Add comment to explain the columns
COMMENT ON COLUMN profiles.cuisine_preferences IS 'Array of preferred cuisines (e.g., Italian, Mexican, Asian)';
COMMENT ON COLUMN profiles.cooking_time_preference IS 'Preferred cooking time: quick (under 30 min), medium (30-60 min), long (60+ min), or any';
COMMENT ON COLUMN profiles.postal_code IS 'User postal code for grocery store filtering';
COMMENT ON COLUMN profiles.grocery_distance_km IS 'Maximum distance in km for grocery store search';
