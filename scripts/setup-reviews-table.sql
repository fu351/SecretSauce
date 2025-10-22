<<<<<<< HEAD
-- Create recipe_reviews table
CREATE TABLE IF NOT EXISTS recipe_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(recipe_id, user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_recipe_reviews_recipe_id ON recipe_reviews(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_reviews_user_id ON recipe_reviews(user_id);

-- Enable RLS
ALTER TABLE recipe_reviews ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view reviews" ON recipe_reviews FOR SELECT USING (true);
CREATE POLICY "Users can create their own reviews" ON recipe_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reviews" ON recipe_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reviews" ON recipe_reviews FOR DELETE USING (auth.uid() = user_id);
=======
-- Create recipe_reviews table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.recipe_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipe_id uuid,
  user_id uuid,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT recipe_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT recipe_reviews_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE,
  CONSTRAINT recipe_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_recipe_reviews_recipe_id ON public.recipe_reviews(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_reviews_user_id ON public.recipe_reviews(user_id);

-- Enable Row Level Security
ALTER TABLE public.recipe_reviews ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view all reviews" ON public.recipe_reviews
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own reviews" ON public.recipe_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews" ON public.recipe_reviews
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews" ON public.recipe_reviews
  FOR DELETE USING (auth.uid() = user_id);
>>>>>>> main
