-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.meal_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  meals jsonb,
  shopping_list jsonb,
  total_budget numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT meal_plans_pkey PRIMARY KEY (id),
  CONSTRAINT meal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.pantry_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  quantity numeric,
  unit text,
  expiry_date date,
  category text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pantry_items_pkey PRIMARY KEY (id),
  CONSTRAINT pantry_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  cooking_level text CHECK (cooking_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])),
  budget_range text CHECK (budget_range = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  dietary_preferences ARRAY,
  primary_goal text CHECK (primary_goal = ANY (ARRAY['cooking'::text, 'budgeting'::text, 'both'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.recipe_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recipe_favorites_pkey PRIMARY KEY (id),
  CONSTRAINT recipe_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT recipe_favorites_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id)
);
CREATE TABLE public.recipe_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recipe_ratings_pkey PRIMARY KEY (id),
  CONSTRAINT recipe_ratings_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id),
  CONSTRAINT recipe_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.recipes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text,
  prep_time integer,
  cook_time integer,
  servings integer,
  difficulty text NOT NULL CHECK (difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])),
  cuisine_type text,
  dietary_tags ARRAY,
  ingredients jsonb,
  instructions jsonb,
  nutrition jsonb,
  author_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  rating_avg numeric DEFAULT 0,
  rating_count integer DEFAULT 0,
  CONSTRAINT recipes_pkey PRIMARY KEY (id),
  CONSTRAINT recipes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.shopping_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My Shopping List'::text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_estimated_cost numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT shopping_lists_pkey PRIMARY KEY (id),
  CONSTRAINT shopping_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);