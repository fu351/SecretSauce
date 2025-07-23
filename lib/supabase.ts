import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL")
}
if (!supabaseAnonKey) {
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side client for admin operations
export const createServerClient = () => {
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseServiceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable")
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          cooking_level: "beginner" | "intermediate" | "advanced" | null
          budget_range: "low" | "medium" | "high" | null
          dietary_preferences: string[] | null
          primary_goal: "cooking" | "budgeting" | "both" | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          cooking_level?: "beginner" | "intermediate" | "advanced" | null
          budget_range?: "low" | "medium" | "high" | null
          dietary_preferences?: string[] | null
          primary_goal?: "cooking" | "budgeting" | "both" | null
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          cooking_level?: "beginner" | "intermediate" | "advanced" | null
          budget_range?: "low" | "medium" | "high" | null
          dietary_preferences?: string[] | null
          primary_goal?: "cooking" | "budgeting" | "both" | null
          updated_at?: string
        }
      }
      recipes: {
        Row: {
          id: string
          title: string
          description: string | null
          image_url: string | null
          prep_time: number | null
          cook_time: number | null
          servings: number | null
          difficulty: "beginner" | "intermediate" | "advanced"
          cuisine_type: string | null
          dietary_tags: string[] | null
          ingredients: any[] | null
          instructions: any[] | null
          nutrition: any | null
          author_id: string
          created_at: string
          updated_at: string
          rating_avg: number | null
          rating_count: number | null
        }
        Insert: {
          title: string
          description?: string | null
          image_url?: string | null
          prep_time?: number | null
          cook_time?: number | null
          servings?: number | null
          difficulty: "beginner" | "intermediate" | "advanced"
          cuisine_type?: string | null
          dietary_tags?: string[] | null
          ingredients?: any[] | null
          instructions?: any[] | null
          nutrition?: any | null
          author_id: string
        }
        Update: {
          title?: string
          description?: string | null
          image_url?: string | null
          prep_time?: number | null
          cook_time?: number | null
          servings?: number | null
          difficulty?: "beginner" | "intermediate" | "advanced"
          cuisine_type?: string | null
          dietary_tags?: string[] | null
          ingredients?: any[] | null
          instructions?: any[] | null
          nutrition?: any | null
          updated_at?: string
        }
      }
      meal_plans: {
        Row: {
          id: string
          user_id: string
          week_start: string
          meals: any | null
          shopping_list: any[] | null
          total_budget: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          week_start: string
          meals?: any | null
          shopping_list?: any[] | null
          total_budget?: number | null
        }
        Update: {
          meals?: any | null
          shopping_list?: any[] | null
          total_budget?: number | null
          updated_at?: string
        }
      }
    }
  }
}
