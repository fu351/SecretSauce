import { createClient } from "@supabase/supabase-js"
import type { RecipeIngredient, Instruction, NutritionInfo, RecipeTags } from "./types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const createMonitoredClient = (url: string, key: string, options: any) => {
  const client = createClient(url, key, options)

  // Wrap the from method to add monitoring
  const originalFrom = client.from.bind(client)
  client.from = (table: string) => {
    const startTime = performance.now()
    console.log(`[v0] Supabase query started: ${table}`)

    const query = originalFrom(table)

    // Wrap the query builder methods to add timing
    const wrapQueryMethod = (methodName: string, originalMethod: Function) => {
      return function (this: any, ...args: any[]) {
        const result = originalMethod.apply(this, args)

        // If the result has a then method (is a promise), wrap it
        if (result && typeof result.then === "function") {
          const originalThen = result.then.bind(result)
          result.then = (onFulfilled?: any, onRejected?: any) =>
            originalThen(
              (value: any) => {
                const duration = performance.now() - startTime
                console.log(`[v0] Supabase ${methodName} completed: ${table} in ${duration.toFixed(2)}ms`)

                if (value?.error) {
                  console.error(`[v0] Supabase error on ${table}:`, value.error)
                }

                return onFulfilled ? onFulfilled(value) : value
              },
              (error: any) => {
                const duration = performance.now() - startTime
                console.error(`[v0] Supabase ${methodName} failed on ${table} after ${duration.toFixed(2)}ms:`, error)
                return onRejected ? onRejected(error) : Promise.reject(error)
              },
            )
        }

        return result
      }
    }

    // Wrap common query methods
    if (query.select) query.select = wrapQueryMethod("select", query.select.bind(query))
    if (query.insert) query.insert = wrapQueryMethod("insert", query.insert.bind(query))
    if (query.update) query.update = wrapQueryMethod("update", query.update.bind(query))
    if (query.delete) query.delete = wrapQueryMethod("delete", query.delete.bind(query))
    if (query.upsert) query.upsert = wrapQueryMethod("upsert", query.upsert.bind(query))

    return query
  }

  return client
}

const createMissingEnvProxy = (message: string) => {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(message)
      },
    },
  ) as ReturnType<typeof createClient>
}

const missingEnvMessage =
  "Supabase client is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createMonitoredClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: typeof window !== "undefined" ? window.localStorage : undefined,
          flowType: "pkce",
        },
        global: {
          fetch: fetch.bind(globalThis),
        },
      })
    : createMissingEnvProxy(missingEnvMessage)

// Server-side client for admin operations
export const createServerClient = () => {
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY

  if (!supabaseServiceKey) {
    throw new Error("Missing Supabase service credentials. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY.")
  }

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.")
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[Supabase] SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to a non-privileged key; cache writes may fail if RLS is enabled."
    )
  }

  return createMonitoredClient(supabaseUrl, supabaseServiceKey, {
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
          cuisine_preferences: string[]
          cooking_time_preference: string
          postal_code: string | null
          grocery_distance_miles: number
          theme_preference: "light" | "dark"
          tutorial_completed: boolean
          tutorial_completed_at: string | null
          tutorial_path: "cooking" | "budgeting" | "health" | null
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
          cuisine_preferences?: string[]
          cooking_time_preference?: string
          postal_code?: string | null
          grocery_distance_miles?: number
          theme_preference?: "light" | "dark"
          tutorial_completed?: boolean
          tutorial_completed_at?: string | null
          tutorial_path?: "cooking" | "budgeting" | "health" | null
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
          cuisine_preferences?: string[]
          cooking_time_preference?: string
          postal_code?: string | null
          grocery_distance_miles?: number
          theme_preference?: "light" | "dark"
          tutorial_completed?: boolean
          tutorial_completed_at?: string | null
          tutorial_path?: "cooking" | "budgeting" | "health" | null
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
          cuisine: string | null
          dietary_tags: string[] | null
          ingredients: RecipeIngredient[] | null
          instructions: Instruction[] | null
          nutrition: NutritionInfo | null
          author_id: string
          created_at: string
          updated_at: string
          rating_avg: number | null
          rating_count: number | null
          dietary_flags: RecipeTags | null
          protein_tag: string | null
          cuisine_guess: string | null
          meal_type_guess: string | null
        }
        Insert: {
          title: string
          description?: string | null
          image_url?: string | null
          prep_time?: number | null
          cook_time?: number | null
          servings?: number | null
          difficulty: "beginner" | "intermediate" | "advanced"
          cuisine?: string | null
          dietary_tags?: string[] | null
          ingredients?: RecipeIngredient[] | null
          instructions?: Instruction[] | null
          nutrition?: NutritionInfo | null
          author_id: string
          dietary_flags?: RecipeTags | null
          protein_tag?: string | null
          cuisine_guess?: string | null
          meal_type_guess?: string | null
        }
        Update: {
          title?: string
          description?: string | null
          image_url?: string | null
          prep_time?: number | null
          cook_time?: number | null
          servings?: number | null
          difficulty?: "beginner" | "intermediate" | "advanced"
          cuisine?: string | null
          dietary_tags?: string[] | null
          ingredients?: RecipeIngredient[] | null
          instructions?: Instruction[] | null
          nutrition?: NutritionInfo | null
          dietary_flags?: RecipeTags | null
          protein_tag?: string | null
          cuisine_guess?: string | null
          meal_type_guess?: string | null
          updated_at?: string
        }
      }
      standardized_ingredients: {
        Row: {
          id: string
          canonical_name: string
          category: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          canonical_name: string
          category?: string | null
        }
        Update: {
          canonical_name?: string
          category?: string | null
          updated_at?: string
        }
      }
      ingredient_cache: {
        Row: {
          id: string
          standardized_ingredient_id: string
          store: string
          product_name: string | null
          price: number
          quantity: number
          unit: string
          unit_price: number | null
          image_url: string | null
          product_id: string | null
          location: string | null
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          standardized_ingredient_id: string
          store: string
          product_name?: string | null
          price: number
          quantity: number
          unit: string
          unit_price?: number | null
          image_url?: string | null
          product_id?: string | null
          location?: string | null
          expires_at: string
        }
        Update: {
          store?: string
          product_name?: string | null
          price?: number
          quantity?: number
          unit?: string
          unit_price?: number | null
          image_url?: string | null
          product_id?: string | null
          location?: string | null
          expires_at?: string
          updated_at?: string
        }
      }
      ingredient_mappings: {
        Row: {
          id: string
          recipe_id: string
          original_name: string
          standardized_ingredient_id: string
          created_at: string
        }
        Insert: {
          recipe_id: string
          original_name: string
          standardized_ingredient_id: string
        }
        Update: {
          recipe_id?: string
          original_name?: string
          standardized_ingredient_id?: string
        }
      }
      meal_plans: {
        Row: {
          id: string
          user_id: string
          week_start: string
          meals: any | null
          shopping_list: any | null
          total_budget: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          week_start: string
          meals?: any | null
          shopping_list?: any | null
          total_budget?: number | null
        }
        Update: {
          meals?: any | null
          shopping_list?: any | null
          total_budget?: number | null
          updated_at?: string
        }
      }
      meal_schedule: {
        Row: {
          id: string
          user_id: string
          recipe_id: string
          date: string
          meal_type: "breakfast" | "lunch" | "dinner"
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          recipe_id: string
          date: string
          meal_type: "breakfast" | "lunch" | "dinner"
        }
        Update: {
          recipe_id?: string
          meal_type?: "breakfast" | "lunch" | "dinner"
          updated_at?: string
        }
      }
      shopping_lists: {
        Row: {
          id: string
          user_id: string
          name: string
          items: any
          total_estimated_cost: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          name?: string
          items?: any
          total_estimated_cost?: number | null
        }
        Update: {
          name?: string
          items?: any
          total_estimated_cost?: number | null
          updated_at?: string
        }
      }
      pantry_items: {
        Row: {
          id: string
          user_id: string
          name: string
          quantity: number | null
          unit: string | null
          expiry_date: string | null
          category: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          name: string
          quantity?: number | null
          unit?: string | null
          expiry_date?: string | null
          category?: string | null
        }
        Update: {
          name?: string
          quantity?: number | null
          unit?: string | null
          expiry_date?: string | null
          category?: string | null
          updated_at?: string
        }
      }
      recipe_reviews: {
        Row: {
          id: string
          recipe_id: string
          user_id: string
          rating: number
          comment: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          recipe_id: string
          user_id: string
          rating: number
          comment?: string | null
        }
        Update: {
          recipe_id?: string
          user_id?: string
          rating?: number
          comment?: string | null
          updated_at?: string
        }
      }
      recipe_favorites: {
        Row: {
          id: string
          recipe_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          recipe_id: string
          user_id: string
        }
        Update: {
          recipe_id?: string
          user_id?: string
        }
      }
    }
  }
}
