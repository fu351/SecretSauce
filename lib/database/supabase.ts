import { createClient } from "@supabase/supabase-js"

// Basic JSON type used for Postgres json/jsonb return values
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

// Set to true to enable per-query [v0] logging from the Supabase client wrapper
export let DB_DEBUG = false

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const createMonitoredClient = (url: string, key: string, options: any) => {
  const client = createClient(url, key, options)

  // Wrap the from method to add monitoring
  const originalFrom = client.from.bind(client)
  client.from = (table: string) => {
    const startTime = performance.now()
    if (DB_DEBUG) console.log(`[v0] Supabase query started: ${table}`)

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
                if (DB_DEBUG) console.log(`[v0] Supabase ${methodName} completed: ${table} in ${duration.toFixed(2)}ms`)

                if (DB_DEBUG && value?.error) {
                  console.error(`[v0] Supabase error on ${table}:`, value.error)
                }

                return onFulfilled ? onFulfilled(value) : value
              },
              (error: any) => {
                const duration = performance.now() - startTime
                if (DB_DEBUG) console.error(`[v0] Supabase ${methodName} failed on ${table} after ${duration.toFixed(2)}ms:`, error)
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

const browserClientOptions = {
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
}

export const createBrowserClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(missingEnvMessage)
  }

  return createMonitoredClient(supabaseUrl, supabaseAnonKey, browserClientOptions)
}

export const supabase =
  supabaseUrl && supabaseAnonKey ? createBrowserClient() : createMissingEnvProxy(missingEnvMessage)

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          cooking_level: string | null
          budget_range: string | null
          dietary_preferences: string[] | null
          primary_goal: string | null
          created_at: string | null
          updated_at: string | null
          cuisine_preferences: string[] | null
          cooking_time_preference: string | null
          zip_code: string | null
          grocery_distance_miles: number | null
          theme_preference: string | null
          tutorial_completed: boolean | null
          tutorial_completed_at: string | null
          tutorial_path: string | null
          formatted_address: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          state: string | null
          country: string | null
          latitude: number | null
          longitude: number | null
          email_verified: boolean | null
          subscription_tier: Database["public"]["Enums"]["subscription_tier"] | null
          subscription_started_at: string | null
          subscription_expires_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          cooking_level?: string | null
          budget_range?: string | null
          dietary_preferences?: string[] | null
          primary_goal?: string | null
          created_at?: string | null
          updated_at?: string | null
          cuisine_preferences?: string[] | null
          cooking_time_preference?: string | null
          zip_code?: string | null
          grocery_distance_miles?: number | null
          theme_preference?: string | null
          tutorial_completed?: boolean | null
          tutorial_completed_at?: string | null
          tutorial_path?: string | null
          formatted_address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          state?: string | null
          country?: string | null
          latitude?: number | null
          longitude?: number | null
          email_verified?: boolean | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"] | null
          subscription_started_at?: string | null
          subscription_expires_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          cooking_level?: string | null
          budget_range?: string | null
          dietary_preferences?: string[] | null
          primary_goal?: string | null
          created_at?: string | null
          updated_at?: string | null
          cuisine_preferences?: string[] | null
          cooking_time_preference?: string | null
          zip_code?: string | null
          grocery_distance_miles?: number | null
          theme_preference?: string | null
          tutorial_completed?: boolean | null
          tutorial_completed_at?: string | null
          tutorial_path?: string | null
          formatted_address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          state?: string | null
          country?: string | null
          latitude?: number | null
          longitude?: number | null
          email_verified?: boolean | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"] | null
          subscription_started_at?: string | null
          subscription_expires_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
      }
      recipes: {
        Row: {
          id: string
          title: string | null
          author_id: string | null
          cuisine: string | null
          meal_type: string | null
          protein: string | null
          difficulty: string | null
          servings: number | null
          prep_time: number | null
          cook_time: number | null
          tags: string[] | null
          nutrition: any | null // JSONB
          rating_avg: number | null
          rating_count: number | null
          created_at: string | null
          updated_at: string | null
          deleted_at: string | null
          description: string | null
          image_url: string | null
          instructions_list: string[] | null
        }
        Insert: {
          id?: string
          title?: string | null
          author_id?: string | null
          cuisine?: string | null
          meal_type?: string | null
          protein?: string | null
          difficulty?: string | null
          servings?: number | null
          prep_time?: number | null
          cook_time?: number | null
          tags?: string[] | null
          nutrition?: any | null
          rating_avg?: number | null
          rating_count?: number | null
          created_at?: string | null
          updated_at?: string | null
          deleted_at?: string | null
          description?: string | null
          image_url?: string | null
          instructions_list?: string[] | null
        }
        Update: {
          id?: string
          title?: string | null
          author_id?: string | null
          cuisine?: string | null
          meal_type?: string | null
          protein?: string | null
          difficulty?: string | null
          servings?: number | null
          prep_time?: number | null
          cook_time?: number | null
          tags?: string[] | null
          nutrition?: any | null
          rating_avg?: number | null
          rating_count?: number | null
          created_at?: string | null
          updated_at?: string | null
          deleted_at?: string | null
          description?: string | null
          image_url?: string | null
          instructions_list?: string[] | null
        }
      }
      recipe_ingredients: {
        Row: {
          id: string
          recipe_id: string
          standardized_ingredient_id: string | null
          display_name: string
          created_at: string | null
          quantity: number | null
          units: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          recipe_id: string
          standardized_ingredient_id?: string | null
          display_name: string
          created_at?: string | null
          quantity?: number | null
          units?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          recipe_id?: string
          standardized_ingredient_id?: string | null
          display_name?: string
          created_at?: string | null
          quantity?: number | null
          units?: string | null
          deleted_at?: string | null
        }
      }
      standardized_ingredients: {
        Row: {
          id: string
          canonical_name: string
          category: string | null
          created_at: string | null
          updated_at: string | null
          search_vector: unknown | null
        }
        Insert: {
          id?: string
          canonical_name: string
          category?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          canonical_name?: string
          category?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      ingredients_history: {
        Row: {
          id: string
          standardized_ingredient_id: string
          store: Database["public"]["Enums"]["grocery_store"]
          price: number
          quantity: number
          unit: string
          unit_price: number | null
          image_url: string | null
          product_name: string | null
          product_id: string | null
          location: string | null
          standardized_unit: Database["public"]["Enums"]["unit_label"] | null
          zip_code: string | null
          grocery_store_id: string | null
          created_at: string | null
          updated_at: string | null
          product_mapping_id: string | null
        }
        Insert: {
          id?: string
          standardized_ingredient_id: string
          store: Database["public"]["Enums"]["grocery_store"]
          price: number
          quantity: number
          unit: string
          unit_price?: number | null
          image_url?: string | null
          product_name?: string | null
          product_id?: string | null
          location?: string | null
          standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
          zip_code?: string | null
          grocery_store_id?: string | null
          created_at?: string | null
          updated_at?: string | null
          product_mapping_id?: string | null
        }
        Update: {
          id?: string
          standardized_ingredient_id?: string
          store?: Database["public"]["Enums"]["grocery_store"]
          price?: number
          quantity?: number
          unit?: string
          unit_price?: number | null
          image_url?: string | null
          product_name?: string | null
          product_id?: string | null
          location?: string | null
          standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
          zip_code?: string | null
          grocery_store_id?: string | null
          created_at?: string | null
          updated_at?: string | null
          product_mapping_id?: string | null
        }
      }
      product_mappings: {
        Row: {
          id: string
          external_product_id: string
          store_id: string | null
          zip_code: string | null
          raw_product_name: string | null
          standardized_ingredient_id: string | null
          is_ingredient: boolean
          ingredient_confidence: number | null
          standardized_unit: Database["public"]["Enums"]["unit_label"] | null
          standardized_quantity: number | null
          unit_confidence: number | null
          quantity_confidence: number | null
          manual_override: boolean | null
          last_seen_at: string | null
          modal_opened_count: number | null
          exchange_count: number | null
        }
        Insert: {
          id?: string
          external_product_id: string
          store_id?: string | null
          zip_code?: string | null
          raw_product_name?: string | null
          standardized_ingredient_id?: string | null
          is_ingredient?: boolean
          ingredient_confidence?: number | null
          standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
          standardized_quantity?: number | null
          unit_confidence?: number | null
          quantity_confidence?: number | null
          manual_override?: boolean | null
          last_seen_at?: string | null
          modal_opened_count?: number | null
          exchange_count?: number | null
        }
        Update: {
          id?: string
          external_product_id?: string
          store_id?: string | null
          zip_code?: string | null
          raw_product_name?: string | null
          standardized_ingredient_id?: string | null
          is_ingredient?: boolean
          ingredient_confidence?: number | null
          standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
          standardized_quantity?: number | null
          unit_confidence?: number | null
          quantity_confidence?: number | null
          manual_override?: boolean | null
          last_seen_at?: string | null
          modal_opened_count?: number | null
          exchange_count?: number | null
        }
      }
      ingredients_recent: {
        Row: {
          id: string
          standardized_ingredient_id: string
          grocery_store_id: string | null
          store: Database["public"]["Enums"]["grocery_store"]
          price: number
          quantity: number
          unit: string
          unit_price: number | null
          product_name: string | null
          image_url: string | null
          zip_code: string | null
          created_at: string | null
          product_mapping_id: string | null
        }
        Insert: {
          id: string
          standardized_ingredient_id: string
          grocery_store_id?: string | null
          store: Database["public"]["Enums"]["grocery_store"]
          price: number
          quantity: number
          unit: string
          unit_price?: number | null
          product_name?: string | null
          image_url?: string | null
          zip_code?: string | null
          created_at?: string | null
          product_mapping_id?: string | null
        }
        Update: {
          id?: string
          standardized_ingredient_id?: string
          grocery_store_id?: string | null
          store?: Database["public"]["Enums"]["grocery_store"]
          price?: number
          quantity?: number
          unit?: string
          unit_price?: number | null
          product_name?: string | null
          image_url?: string | null
          zip_code?: string | null
          created_at?: string | null
          product_mapping_id?: string | null
        }
      }
      /**
       * Supabase schema reference:
       * create table public.ingredient_match_queue (
       *   id uuid not null default gen_random_uuid (),
       *   product_mapping_id uuid not null,
       *   raw_product_name text not null,
       *   cleaned_name text not null,
       *   best_fuzzy_match text null,
       *   fuzzy_score numeric(4, 3) null,
       *   status text not null default 'pending'::text,
       *   resolved_ingredient_id uuid null,
       *   resolved_by text null,
       *   created_at timestamp with time zone null default now(),
       *   resolved_at timestamp with time zone null,
       *   constraint ingredient_match_queue_pkey primary key (id),
       *   constraint unique_pending_mapping unique (product_mapping_id),
       *   constraint ingredient_match_queue_product_mapping_id_fkey foreign KEY (product_mapping_id) references product_mappings (id) on delete CASCADE,
       *   constraint ingredient_match_queue_resolved_ingredient_id_fkey foreign KEY (resolved_ingredient_id) references standardized_ingredients (id),
       *   constraint ingredient_match_queue_status_check check (
       *     (
       *       status = any (
       *         array[
       *           'pending'::text,
       *           'processing'::text,
       *           'resolved'::text,
       *           'failed'::text
       *         ]
       *       )
       *     )
       *   )
       * ) TABLESPACE pg_default;
       *
       * create index IF not exists idx_match_queue_status on public.ingredient_match_queue using btree (status) TABLESPACE pg_default
       * where
       *   (status = 'pending'::text);
       */
      ingredient_match_queue: {
        Row: {
          id: string
          product_mapping_id: string | null
          raw_product_name: string
          cleaned_name: string
          best_fuzzy_match: string | null
          fuzzy_score: number | null
          status: "pending" | "processing" | "resolved" | "failed"
          source: "scraper" | "recipe"
          recipe_ingredient_id: string | null
          needs_ingredient_review: boolean
          needs_unit_review: boolean
          raw_unit: string | null
          resolved_ingredient_id: string | null
          resolved_unit: Database["public"]["Enums"]["unit_label"] | null
          resolved_quantity: number | null
          unit_confidence: number | null
          quantity_confidence: number | null
          resolved_by: string | null
          processing_started_at: string | null
          processing_lease_expires_at: string | null
          attempt_count: number
          last_error: string | null
          created_at: string | null
          resolved_at: string | null
        }
        Insert: {
          id?: string
          product_mapping_id?: string | null
          raw_product_name: string
          cleaned_name: string
          best_fuzzy_match?: string | null
          fuzzy_score?: number | null
          status?: "pending" | "processing" | "resolved" | "failed"
          source?: "scraper" | "recipe"
          recipe_ingredient_id?: string | null
          needs_ingredient_review?: boolean
          needs_unit_review?: boolean
          raw_unit?: string | null
          resolved_ingredient_id?: string | null
          resolved_unit?: Database["public"]["Enums"]["unit_label"] | null
          resolved_quantity?: number | null
          unit_confidence?: number | null
          quantity_confidence?: number | null
          resolved_by?: string | null
          processing_started_at?: string | null
          processing_lease_expires_at?: string | null
          attempt_count?: number
          last_error?: string | null
          created_at?: string | null
          resolved_at?: string | null
        }
        Update: {
          id?: string
          product_mapping_id?: string | null
          raw_product_name?: string
          cleaned_name?: string
          best_fuzzy_match?: string | null
          fuzzy_score?: number | null
          status?: "pending" | "processing" | "resolved" | "failed"
          source?: "scraper" | "recipe"
          recipe_ingredient_id?: string | null
          needs_ingredient_review?: boolean
          needs_unit_review?: boolean
          raw_unit?: string | null
          resolved_ingredient_id?: string | null
          resolved_unit?: Database["public"]["Enums"]["unit_label"] | null
          resolved_quantity?: number | null
          unit_confidence?: number | null
          quantity_confidence?: number | null
          resolved_by?: string | null
          processing_started_at?: string | null
          processing_lease_expires_at?: string | null
          attempt_count?: number
          last_error?: string | null
          created_at?: string | null
          resolved_at?: string | null
        }
      },
      ingredient_mappings: {
        Row: {
          id: string
          recipe_id: string
          original_name: string
          standardized_ingredient_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          recipe_id: string
          original_name: string
          standardized_ingredient_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          recipe_id?: string
          original_name?: string
          standardized_ingredient_id?: string
          created_at?: string | null
        }
      }
      meal_schedule: {
        Row: {
          id: string
          user_id: string
          recipe_id: string
          date: string
          meal_type: "breakfast" | "lunch" | "dinner"
          created_at: string | null
          updated_at: string | null
          week_index: number | null
        }
        Insert: {
          id?: string
          user_id: string
          recipe_id: string
          date: string
          meal_type: "breakfast" | "lunch" | "dinner"
          created_at?: string | null
          updated_at?: string | null
          week_index?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          recipe_id?: string
          date?: string
          meal_type?: "breakfast" | "lunch" | "dinner"
          created_at?: string | null
          updated_at?: string | null
          week_index?: number | null
        }
      }
      pantry_items: {
        Row: {
          id: string
          user_id: string
          name: string
          quantity: number | null
          unit: string | null
          standarized_unit: string | null
          unit_price: number | null
          expiry_date: string | null
          category: string | null
          created_at: string | null
          updated_at: string | null
          standardized_ingredient_id: string | null
          standardized_name: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          quantity?: number | null
          unit?: string | null
          expiry_date?: string | null
          category?: string | null
          created_at?: string | null
          updated_at?: string | null
          standardized_ingredient_id?: string | null
          standardized_name?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          quantity?: number | null
          unit?: string | null
          expiry_date?: string | null
          category?: string | null
          created_at?: string | null
          updated_at?: string | null
          standardized_ingredient_id?: string | null
          standardized_name?: string | null
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
          created_at: string | null
        }
        Insert: {
          id?: string
          recipe_id: string
          user_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          recipe_id?: string
          user_id?: string
          created_at?: string | null
        }
      }
      feedback: {
        Row: {
          id: string
          user_id: string | null
          message: string
          created_at: string
          read: boolean | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          message: string
          created_at?: string
          read?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string | null
          message?: string
          created_at?: string
          read?: boolean | null
        }
      }
      grocery_stores: {
        Row: {
          id: string
          store_enum: Database["public"]["Enums"]["grocery_store"]
          name: string
          address: string | null
          zip_code: string | null
          geom: unknown | null
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          store_enum: Database["public"]["Enums"]["grocery_store"]
          name: string
          address?: string | null
          zip_code?: string | null
          geom?: unknown | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          store_enum?: Database["public"]["Enums"]["grocery_store"]
          name?: string
          address?: string | null
          zip_code?: string | null
          geom?: unknown | null
          is_active?: boolean | null
          created_at?: string | null
        }
      }
      shopping_list_items: {
        Row: {
          id: string
          user_id: string
          source_type: "recipe" | "manual"
          recipe_id: string | null
          recipe_ingredient_id: string | null
          name: string
          quantity: number
          unit: string | null
          ingredient_id: string | null
          checked: boolean
          servings: number | null
          created_at: string
          updated_at: string
          category: string | null
        }
        Insert: {
          id?: string
          user_id: string
          source_type: "recipe" | "manual"
          recipe_id?: string | null
          recipe_ingredient_id?: string | null
          name: string
          quantity?: number
          unit?: string | null
          ingredient_id?: string | null
          checked?: boolean
          servings?: number | null
          created_at?: string
          updated_at?: string
          category?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          source_type?: "recipe" | "manual"
          recipe_id?: string | null
          recipe_ingredient_id?: string | null
          name?: string
          quantity?: number
          unit?: string | null
          ingredient_id?: string | null
          checked?: boolean
          servings?: number | null
          created_at?: string
          updated_at?: string
          category?: string | null
        }
      }
      shopping_item_price_cache: {
        Row: {
          shopping_list_item_id: string
          standardized_ingredient_id: string | null
          product_mapping_id: string | null
          price: number | null
          unit_price: number | null
          product_name: string | null
          store_name: string | null
          image_url: string | null
          cached_at: string | null
          zip_code: string
          store: Database["public"]["Enums"]["grocery_store"]
        }
        Insert: {
          shopping_list_item_id: string
          standardized_ingredient_id?: string | null
          product_mapping_id?: string | null
          price?: number | null
          unit_price?: number | null
          product_name?: string | null
          store_name?: string | null
          image_url?: string | null
          cached_at?: string | null
          zip_code: string
          store: Database["public"]["Enums"]["grocery_store"]
        }
        Update: {
          shopping_list_item_id?: string
          standardized_ingredient_id?: string | null
          product_mapping_id?: string | null
          price?: number | null
          unit_price?: number | null
          product_name?: string | null
          store_name?: string | null
          image_url?: string | null
          cached_at?: string | null
          zip_code?: string
          store?: Database["public"]["Enums"]["grocery_store"]
        }
      }
      store_list_history: {
        Row: {
          id: string
          user_id: string
          grocery_store_id: string
          standardized_ingredient_id: string
          price_at_selection: number
          quantity_needed: number
          total_item_price: number | null
          week_index: number
          is_delivery_confirmed: boolean | null
          order_id: string | null
          product_mapping_id: string | null
          expires_at: string
          created_at: string | null
          updated_at: string | null
          delivery_date: string | null
        }
        Insert: {
          id?: string
          user_id: string
          grocery_store_id: string
          standardized_ingredient_id: string
          price_at_selection: number
          quantity_needed: number
          week_index: number
          is_delivery_confirmed?: boolean | null
          order_id?: string | null
          product_mapping_id?: string | null
          expires_at: string
          created_at?: string | null
          updated_at?: string | null
          delivery_date?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          grocery_store_id?: string
          standardized_ingredient_id?: string
          price_at_selection?: number
          quantity_needed?: number
          week_index?: number
          is_delivery_confirmed?: boolean | null
          order_id?: string | null
          product_mapping_id?: string | null
          expires_at?: string
          created_at?: string | null
          updated_at?: string | null
          delivery_date?: string | null
        }
      }
      user_preferred_stores: {
        Row: {
          profile_id: string
          grocery_store_id: string
          store_enum: Database["public"]["Enums"]["grocery_store"]
          distance_miles: number | null
          updated_at: string | null
        }
        Insert: {
          profile_id: string
          grocery_store_id: string
          store_enum: Database["public"]["Enums"]["grocery_store"]
          distance_miles?: number | null
          updated_at?: string | null
        }
        Update: {
          profile_id?: string
          grocery_store_id?: string
          store_enum?: Database["public"]["Enums"]["grocery_store"]
          distance_miles?: number | null
          updated_at?: string | null
        }
      }
      store_locations_cache: {
        Row: {
          id: number
          store_canonical: string
          postal_code: string
          lat: number
          lng: number
          formatted_address: string | null
          matched_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          store_canonical: string
          postal_code?: string
          lat: number
          lng: number
          formatted_address?: string | null
          matched_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          store_canonical?: string
          postal_code?: string
          lat?: number
          lng?: number
          formatted_address?: string | null
          matched_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Functions: {
      calculate_recipe_cost: {
        Args: {
          p_recipe_id: string
          p_store_id: Database["public"]["Enums"]["grocery_store"] // Use Enum
          p_zip_code: string
          p_servings: number
        }
        Returns: {
          recipe_id: string
          totalCost: number
          costPerServing: number
          ingredients: Record<string, number>
        }
      }
      claim_ingredient_match_queue: {
        Args: {
          p_limit?: number
          p_resolver?: string | null
          p_lease_seconds?: number
          p_review_mode?: string
          p_source?: string | null
        }
        Returns: Database["public"]["Tables"]["ingredient_match_queue"]["Row"][]
      }
      fn_add_to_delivery_log: {
        Args: {
          p_shopping_list_item_id: string
          p_product_mapping_id: string
          p_delivery_date: string | null
        }
        Returns: string
      }
      requeue_expired_ingredient_match_queue: {
        Args: {
          p_limit?: number
          p_error?: string | null
        }
        Returns: number
      }
      fn_upsert_recipe_with_ingredients: {
        Args: {
          p_recipe_id?: string | null
          p_title: string
          p_author_id: string
          p_cuisine?: Database["public"]["Enums"]["cuisine_type_enum"] | null
          p_meal_type?: Database["public"]["Enums"]["meal_type_enum"] | null
          p_protein?: Database["public"]["Enums"]["protein_type_enum"] | null
          p_difficulty?: Database["public"]["Enums"]["recipe_difficulty"] | null
          p_servings?: number | null
          p_prep_time?: number | null
          p_cook_time?: number | null
          p_tags?: Database["public"]["Tables"]["recipes"]["Row"]["tags"] | null
          p_nutrition?: Database["public"]["Tables"]["recipes"]["Row"]["nutrition"] | null
          p_description?: string | null
          p_image_url?: string | null
          p_instructions?: string[] | null
          p_ingredients?: Json
        }
        Returns: Database["public"]["Tables"]["recipes"]["Row"]
      }
      get_best_store_for_plan: {
        Args: {
          p_user_id: string
          p_recipe_ids: string[]
        }
        Returns: {
          store_id: string
          store_name: string
          total_cost: number
          missing_ingredients_count: number
          protein_mix: Record<string, number>
        }[]
      }
      get_pricing: {
        Args: {
          p_user_id: string
        }
        Returns: {
          standardized_ingredient_id: string
          total_amount: number
          requested_unit: string | null
          item_ids: Array<string | number>
          offers: {
            store: string
            store_id?: string | null
            store_name?: string | null
            product_mapping_id?: string | null
            unit_price: number | null
            package_price: number | null
            total_price: number | null
            product_name?: string | null
            image_url?: string | null
            zip_code?: string | null
            distance?: number | null
            product_unit?: string | null
            product_quantity?: number | null
            converted_quantity?: number | null
            packages_to_buy?: number | null
            conversion_error?: boolean | null
            used_estimate?: boolean | null
          }[]
        }[]
      }
      get_pricing_gaps: {
        Args: {
          p_user_id: string
        }
        Returns: {
          store: string
          grocery_store_id: string | null
          zip_code: string | null
          ingredients: {
            id: string
            name: string
          }[]
        }[]
      }
      recommend_recipes_smart: {
        Args: {
          p_user_id: string
          p_meal_type: Database["public"]["Enums"]["meal_type_enum"] // Use Enum
          p_limit: number
        }
        Returns: Database["public"]["Tables"]["recipes"]["Row"][]
      }
      recommend_recipes_global: {
        Args: {
          p_user_id: string
          p_limit: number
        }
        Returns: Database["public"]["Tables"]["recipes"]["Row"][]
      }
      increment_mapping_counters: {
        Args: {
          target_id: string
          modal_inc?: number
          exchange_inc?: number
        }
        Returns: void
      }
      get_closest_stores: {
        Args: {
          user_id: string
        }
        Returns: {
          store_id: string
          store_name: string
          store_brand: Database["public"]["Enums"]["grocery_store"]
          distance_miles: number
          latitude: number
          longitude: number
          geojson: Json
        }[]
      }
      get_smart_trending_recommendations: {
        Args: {
          p_user_id: string
          p_limit: number
        }
        Returns: Database["public"]["Tables"]["recipes"]["Row"][]
      }
    }
    Enums: {
      shopping_list_source_type: "recipe" | "manual"
      recipe_difficulty: "beginner" | "intermediate" | "advanced"
      meal_type_enum: "breakfast" | "lunch" | "dinner" | "snack" | "dessert"
      protein_type_enum: "chicken" | "beef" | "pork" | "fish" | "shellfish" | "turkey" | "tofu" | "legume" | "egg" | "other"
      cuisine_type_enum: "italian" | "mexican" | "chinese" | "indian" | "american" | "french" | "japanese" | "thai" | "mediterranean" | "korean" | "greek" | "spanish" | "vietnamese" | "middle-eastern" | "other"
      tags_enum: "vegetarian" | "vegan" | "gluten-free" | "dairy-free" | "keto" | "paleo" | "low-carb" | "other" | "contains-dairy" | "contains-gluten" | "contains-nuts" | "contains-shellfish" | "contains-egg" | "contains-soy"
      cooking_level_enum: "beginner" | "intermediate" | "advanced"
      budget_range_enum: "low" | "medium" | "high"
      theme_enum: "light" | "dark"
      item_category_enum: "baking" | "beverages" | "condiments" | "dairy" | "meat_seafood" | "pantry_staples" | "produce" | "snacks" | "other" | "spices"
      grocery_store: "aldi" | "kroger" | "safeway" | "meijer" | "target" | "traderjoes" | "99ranch" | "walmart" | "andronicos" | "wholefoods"
      unit_category: "weight" | "volume" | "count" | "other"
      unit_label: "oz" | "lb" | "fl oz" | "ml" | "gal" | "ct" | "each" | "bunch" | "gram" | "unit"
      subscription_tier: "free" | "premium"
      admin_role: "admin" | "analyst"
      experiment_status: "draft" | "scheduled" | "active" | "paused" | "completed" | "archived"
      allocation_method: "random" | "weighted" | "deterministic"
      ab_event_type: "exposure" | "click" | "conversion" | "signup" | "subscribe" | "custom"
    }
  }
  ab_testing: {
    Tables: {
      admin_roles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["admin_role"]
          granted_by: string | null
          granted_at: string | null
          revoked_at: string | null
          notes: string | null
          metadata: Json | null
        }
        Insert: {
          id?: string
          user_id: string
          role?: Database["public"]["Enums"]["admin_role"]
          granted_by?: string | null
          granted_at?: string | null
          revoked_at?: string | null
          notes?: string | null
          metadata?: Json | null
        }
        Update: {
          id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["admin_role"]
          granted_by?: string | null
          granted_at?: string | null
          revoked_at?: string | null
          notes?: string | null
          metadata?: Json | null
        }
      }
      experiments: {
        Row: {
          id: string
          name: string
          description: string | null
          hypothesis: string | null
          status: Database["public"]["Enums"]["experiment_status"]
          start_date: string | null
          end_date: string | null
          allocation_method: Database["public"]["Enums"]["allocation_method"]
          target_sample_size: number | null
          traffic_percentage: number | null
          target_user_tiers: Database["public"]["Enums"]["subscription_tier"][] | null
          target_anonymous: boolean | null
          targeting_rules: Json | null
          created_by: string
          created_at: string | null
          updated_at: string | null
          archived_at: string | null
          primary_metric: string | null
          secondary_metrics: string[] | null
          minimum_detectable_effect: number | null
          results: Json | null
          winner_variant_id: string | null
          statistical_significance: number | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          hypothesis?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          start_date?: string | null
          end_date?: string | null
          allocation_method?: Database["public"]["Enums"]["allocation_method"]
          target_sample_size?: number | null
          traffic_percentage?: number | null
          target_user_tiers?: Database["public"]["Enums"]["subscription_tier"][] | null
          target_anonymous?: boolean | null
          targeting_rules?: Json | null
          created_by: string
          created_at?: string | null
          updated_at?: string | null
          archived_at?: string | null
          primary_metric?: string | null
          secondary_metrics?: string[] | null
          minimum_detectable_effect?: number | null
          results?: Json | null
          winner_variant_id?: string | null
          statistical_significance?: number | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          hypothesis?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          start_date?: string | null
          end_date?: string | null
          allocation_method?: Database["public"]["Enums"]["allocation_method"]
          target_sample_size?: number | null
          traffic_percentage?: number | null
          target_user_tiers?: Database["public"]["Enums"]["subscription_tier"][] | null
          target_anonymous?: boolean | null
          targeting_rules?: Json | null
          created_by?: string
          created_at?: string | null
          updated_at?: string | null
          archived_at?: string | null
          primary_metric?: string | null
          secondary_metrics?: string[] | null
          minimum_detectable_effect?: number | null
          results?: Json | null
          winner_variant_id?: string | null
          statistical_significance?: number | null
        }
      }
      variants: {
        Row: {
          id: string
          experiment_id: string
          name: string
          description: string | null
          is_control: boolean | null
          weight: number | null
          config: Json
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          experiment_id: string
          name: string
          description?: string | null
          is_control?: boolean | null
          weight?: number | null
          config?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          experiment_id?: string
          name?: string
          description?: string | null
          is_control?: boolean | null
          weight?: number | null
          config?: Json
          created_at?: string | null
          updated_at?: string | null
        }
      }
      user_assignments: {
        Row: {
          id: string
          experiment_id: string
          user_id: string | null
          variant_id: string
          session_id: string | null
          device_id: string | null
          user_tier: Database["public"]["Enums"]["subscription_tier"] | null
          was_anonymous: boolean | null
          assigned_at: string | null
          first_exposure_at: string | null
          user_agent: string | null
          ip_address: string | null
          metadata: Json | null
        }
        Insert: {
          id?: string
          experiment_id: string
          user_id?: string | null
          variant_id: string
          session_id?: string | null
          device_id?: string | null
          user_tier?: Database["public"]["Enums"]["subscription_tier"] | null
          was_anonymous?: boolean | null
          assigned_at?: string | null
          first_exposure_at?: string | null
          user_agent?: string | null
          ip_address?: string | null
          metadata?: Json | null
        }
        Update: {
          id?: string
          experiment_id?: string
          user_id?: string | null
          variant_id?: string
          session_id?: string | null
          device_id?: string | null
          user_tier?: Database["public"]["Enums"]["subscription_tier"] | null
          was_anonymous?: boolean | null
          assigned_at?: string | null
          first_exposure_at?: string | null
          user_agent?: string | null
          ip_address?: string | null
          metadata?: Json | null
        }
      }
      events: {
        Row: {
          id: string
          experiment_id: string
          variant_id: string
          assignment_id: string | null
          user_id: string | null
          session_id: string | null
          device_id: string | null
          event_type: Database["public"]["Enums"]["ab_event_type"]
          event_name: string
          event_value: number | null
          page_url: string | null
          referrer: string | null
          user_tier: Database["public"]["Enums"]["subscription_tier"] | null
          properties: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          experiment_id: string
          variant_id: string
          assignment_id?: string | null
          user_id?: string | null
          session_id?: string | null
          device_id?: string | null
          event_type: Database["public"]["Enums"]["ab_event_type"]
          event_name: string
          event_value?: number | null
          page_url?: string | null
          referrer?: string | null
          user_tier?: Database["public"]["Enums"]["subscription_tier"] | null
          properties?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          experiment_id?: string
          variant_id?: string
          assignment_id?: string | null
          user_id?: string | null
          session_id?: string | null
          device_id?: string | null
          event_type?: Database["public"]["Enums"]["ab_event_type"]
          event_name?: string
          event_value?: number | null
          page_url?: string | null
          referrer?: string | null
          user_tier?: Database["public"]["Enums"]["subscription_tier"] | null
          properties?: Json | null
          created_at?: string | null
        }
      }
    }
    Functions: {
      is_admin: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      can_view_analytics: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      get_user_tier: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["subscription_tier"]
      }
      assign_user_to_variant: {
        Args: {
          p_experiment_id: string
          p_user_id?: string
          p_session_id?: string
          p_device_id?: string
        }
        Returns: string
      }
      track_event: {
        Args: {
          p_experiment_id: string
          p_variant_id: string
          p_event_type: Database["public"]["Enums"]["ab_event_type"]
          p_event_name: string
          p_user_id?: string
          p_session_id?: string
          p_device_id?: string
          p_event_value?: number
          p_page_url?: string
          p_referrer?: string
          p_properties?: Json
        }
        Returns: string
      }
      get_active_experiments: {
        Args: {
          p_user_id?: string
          p_session_id?: string
          p_device_id?: string
        }
        Returns: {
          experiment_id: string
          experiment_name: string
          variant_id: string
          variant_name: string
          variant_config: Json
          is_control: boolean
        }[]
      }
      get_experiment_results: {
        Args: { p_experiment_id: string }
        Returns: {
          variant_id: string
          variant_name: string
          is_control: boolean
          user_tier: Database["public"]["Enums"]["subscription_tier"]
          total_assignments: number
          total_exposures: number
          total_clicks: number
          total_conversions: number
          total_signups: number
          total_subscriptions: number
          conversion_rate: number
          avg_event_value: number
        }[]
      }
    }
    Enums: {}
  }
}
