import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL")
}
if (!supabaseAnonKey) {
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY")
}

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

export const supabase = createMonitoredClient(supabaseUrl, supabaseAnonKey, {
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

// Server-side client for admin operations
export const createServerClient = () => {
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseServiceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable")
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
          cuisine: string | null
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
          cuisine?: string | null
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
          cuisine?: string | null
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
