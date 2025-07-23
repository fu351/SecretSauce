-- Enable Row Level Security
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  cooking_level TEXT CHECK (cooking_level IN ('beginner', 'intermediate', 'advanced')),
  budget_range TEXT CHECK (budget_range IN ('low', 'medium', 'high')),  'intermediate', 'advanced')),
  budget_range TEXT CHECK (budget_range IN ('low', 'medium', 'high')),
  dietary_preferences TEXT[],
  primary_goal TEXT CHECK (primary_goal IN ('cooking', 'budgeting', 'both')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create recipes table
CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  prep_time INTEGER,
  cook_time INTEGER,
  servings INTEGER,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')) NOT NULL,
  cuisine_type TEXT,
  dietary_tags TEXT[],
  ingredients JSONB,
  instructions JSONB,
  nutrition JSONB,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  rating_avg DECIMAL(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0
);

-- Create meal_plans table
CREATE TABLE IF NOT EXISTS public.meal_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start DATE NOT NULL,
  meals JSONB,
  shopping_list JSONB,
  total_budget DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create recipe_ratings table
CREATE TABLE IF NOT EXISTS public.recipe_ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  review TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(recipe_id, user_id)
);

-- Create recipe_favorites table
CREATE TABLE IF NOT EXISTS public.recipe_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(recipe_id, user_id)
);

-- Create shopping_lists table
CREATE TABLE IF NOT EXISTS public.shopping_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Shopping List',
  items JSONB NOT NULL DEFAULT '[]',
  total_estimated_cost DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create pantry_items table
CREATE TABLE IF NOT EXISTS public.pantry_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  quantity DECIMAL(10,2),
  unit TEXT,
  expiry_date DATE,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create storage bucket for recipe images
INSERT INTO storage.buckets (id, name, public) VALUES ('recipe-images', 'recipe-images', true);

-- Set up Row Level Security policies

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Recipes policies
CREATE POLICY "Anyone can view published recipes" ON public.recipes
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own recipes" ON public.recipes
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own recipes" ON public.recipes
  FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own recipes" ON public.recipes
  FOR DELETE USING (auth.uid() = author_id);

-- Recipe ratings policies
CREATE POLICY "Anyone can view recipe ratings" ON public.recipe_ratings
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own ratings" ON public.recipe_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ratings" ON public.recipe_ratings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ratings" ON public.recipe_ratings
  FOR DELETE USING (auth.uid() = user_id);

-- Recipe favorites policies
CREATE POLICY "Users can view own favorites" ON public.recipe_favorites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites" ON public.recipe_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites" ON public.recipe_favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Meal plans policies
CREATE POLICY "Users can view own meal plans" ON public.meal_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal plans" ON public.meal_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meal plans" ON public.meal_plans
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meal plans" ON public.meal_plans
  FOR DELETE USING (auth.uid() = user_id);

-- Shopping lists policies
CREATE POLICY "Users can view own shopping lists" ON public.shopping_lists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shopping lists" ON public.shopping_lists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shopping lists" ON public.shopping_lists
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shopping lists" ON public.shopping_lists
  FOR DELETE USING (auth.uid() = user_id);

-- Pantry items policies
CREATE POLICY "Users can view own pantry items" ON public.pantry_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pantry items" ON public.pantry_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pantry items" ON public.pantry_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pantry items" ON public.pantry_items
  FOR DELETE USING (auth.uid() = user_id);

-- Storage policies
CREATE POLICY "Anyone can view recipe images" ON storage.objects
  FOR SELECT USING (bucket_id = 'recipe-images');

CREATE POLICY "Authenticated users can upload recipe images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'recipe-images' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update own recipe images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'recipe-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own recipe images" ON storage.objects
  FOR DELETE USING (bucket_id = 'recipe-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create functions for updating recipe ratings
CREATE OR REPLACE FUNCTION update_recipe_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.recipes
  SET 
    rating_avg = (
      SELECT AVG(rating)::DECIMAL(3,2)
      FROM public.recipe_ratings
      WHERE recipe_id = COALESCE(NEW.recipe_id, OLD.recipe_id)
    ),
    rating_count = (
      SELECT COUNT(*)
      FROM public.recipe_ratings
      WHERE recipe_id = COALESCE(NEW.recipe_id, OLD.recipe_id)
    )
  WHERE id = COALESCE(NEW.recipe_id, OLD.recipe_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for recipe rating updates
CREATE TRIGGER update_recipe_rating_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.recipe_ratings
  FOR EACH ROW EXECUTE FUNCTION update_recipe_rating();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
