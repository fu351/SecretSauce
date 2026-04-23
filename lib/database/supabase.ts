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
  if (!DB_DEBUG) {
    return client
  }

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

type BrowserAccessTokenProvider = () => Promise<string | null>

let browserAccessTokenProvider: BrowserAccessTokenProvider | null = null
let browserAccessTokenCache: { token: string | null; expiresAt: number } | null = null

export const setBrowserAccessTokenProvider = (
  provider: BrowserAccessTokenProvider | null
) => {
  browserAccessTokenProvider = provider
  browserAccessTokenCache = null
}

const getCookieValue = (name: string): string | null => {
  if (typeof document === "undefined") return null
  const prefix = `${name}=`
  const cookies = document.cookie.split(";")
  for (const raw of cookies) {
    const cookie = raw.trim()
    if (cookie.startsWith(prefix)) {
      const value = cookie.slice(prefix.length)
      try {
        return decodeURIComponent(value)
      } catch {
        return value
      }
    }
  }
  return null
}

const readJwtExp = (token: string): number | null => {
  try {
    const payloadSegment = token.split(".")[1]
    if (!payloadSegment) return null

    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/")
    const padding = normalized.length % 4
    const padded = padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), "=")
    const payloadJson = atob(padded)
    const payload = JSON.parse(payloadJson) as { exp?: unknown }

    return typeof payload.exp === "number" ? payload.exp : null
  } catch {
    return null
  }
}

const isJwtExpired = (token: string): boolean => {
  const exp = readJwtExp(token)
  if (!exp) return false
  return exp * 1000 <= Date.now()
}

const getLegacySupabaseAccessTokenFromCookies = (): string | null => {
  const candidates = [
    getCookieValue("sb-access-token"),
    getCookieValue("supabase-access-token"),
    getCookieValue("supabase-auth-token"),
  ]

  for (const token of candidates) {
    if (!token) continue
    if (isJwtExpired(token)) continue
    return token
  }

  return null
}

const resolveBrowserAccessToken = async (): Promise<string | null> => {
  if (browserAccessTokenCache && browserAccessTokenCache.expiresAt > Date.now()) {
    return browserAccessTokenCache.token
  }

  if (browserAccessTokenProvider) {
    try {
      const clerkToken = await browserAccessTokenProvider()
      browserAccessTokenCache = {
        token: clerkToken ?? null,
        expiresAt: Date.now() + 25_000,
      }
      return clerkToken ?? null
    } catch (error) {
      console.warn("[supabase] Browser access token provider failed:", error)
      return null
    }
  }

  const token = getLegacySupabaseAccessTokenFromCookies()
  browserAccessTokenCache = {
    token,
    expiresAt: Date.now() + 15_000,
  }
  return token
}

const browserClientOptions = {
  accessToken: resolveBrowserAccessToken,
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
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      admin_roles: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          metadata: Json | null
          notes: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["admin_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_bigram_pmi_cache: {
        Row: {
          doc_freq_a: number
          doc_freq_b: number
          document_count: number
          is_collocation: boolean
          joint_freq: number
          ppmi_score: number
          refreshed_at: string
          token_a: string
          token_b: string
        }
        Insert: {
          doc_freq_a: number
          doc_freq_b: number
          document_count: number
          is_collocation?: boolean
          joint_freq: number
          ppmi_score: number
          refreshed_at?: string
          token_a: string
          token_b: string
        }
        Update: {
          doc_freq_a?: number
          doc_freq_b?: number
          document_count?: number
          is_collocation?: boolean
          joint_freq?: number
          ppmi_score?: number
          refreshed_at?: string
          token_a?: string
          token_b?: string
        }
        Relationships: []
      }
      canonical_candidate_embeddings: {
        Row: {
          canonical_name: string
          embedded_at: string
          embedding: string
          embedding_model: string
          input_text: string
          updated_at: string
        }
        Insert: {
          canonical_name: string
          embedded_at?: string
          embedding: string
          embedding_model: string
          input_text: string
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          embedded_at?: string
          embedding?: string
          embedding_model?: string
          input_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      canonical_consolidation_log: {
        Row: {
          direction: string
          dry_run: boolean
          executed_at: string
          id: number
          loser_canonical: string
          rows_updated: Json
          similarity: number | null
          survivor_canonical: string
          worker_name: string | null
        }
        Insert: {
          direction: string
          dry_run?: boolean
          executed_at?: string
          id?: number
          loser_canonical: string
          rows_updated?: Json
          similarity?: number | null
          survivor_canonical: string
          worker_name?: string | null
        }
        Update: {
          direction?: string
          dry_run?: boolean
          executed_at?: string
          id?: number
          loser_canonical?: string
          rows_updated?: Json
          similarity?: number | null
          survivor_canonical?: string
          worker_name?: string | null
        }
        Relationships: []
      }
      canonical_creation_probation_events: {
        Row: {
          canonical_name: string
          first_seen_at: string
          last_seen_at: string
          seen_count: number
          source: string | null
          source_signature: string
        }
        Insert: {
          canonical_name: string
          first_seen_at?: string
          last_seen_at?: string
          seen_count?: number
          source?: string | null
          source_signature: string
        }
        Update: {
          canonical_name?: string
          first_seen_at?: string
          last_seen_at?: string
          seen_count?: number
          source?: string | null
          source_signature?: string
        }
        Relationships: []
      }
      canonical_double_check_daily_stats: {
        Row: {
          decision: string
          direction: string
          event_count: number
          event_date: string
          first_seen_at: string
          last_seen_at: string
          max_confidence: number | null
          max_similarity: number | null
          min_confidence: number | null
          min_similarity: number | null
          reason: string
          source_canonical: string
          source_category: string | null
          target_canonical: string
          target_category: string | null
          total_confidence: number
          total_similarity: number
          updated_at: string
        }
        Insert: {
          decision: string
          direction?: string
          event_count?: number
          event_date: string
          first_seen_at?: string
          last_seen_at?: string
          max_confidence?: number | null
          max_similarity?: number | null
          min_confidence?: number | null
          min_similarity?: number | null
          reason?: string
          source_canonical: string
          source_category?: string | null
          target_canonical: string
          target_category?: string | null
          total_confidence?: number
          total_similarity?: number
          updated_at?: string
        }
        Update: {
          decision?: string
          direction?: string
          event_count?: number
          event_date?: string
          first_seen_at?: string
          last_seen_at?: string
          max_confidence?: number | null
          max_similarity?: number | null
          min_confidence?: number | null
          min_similarity?: number | null
          reason?: string
          source_canonical?: string
          source_category?: string | null
          target_canonical?: string
          target_category?: string | null
          total_confidence?: number
          total_similarity?: number
          updated_at?: string
        }
        Relationships: []
      }
      canonical_medoid_memberships: {
        Row: {
          avg_similarity: number
          canonical_name: string
          cluster_index: number
          cluster_key: string
          cluster_size: number
          created_at: string
          id: string
          is_medoid: boolean
          medoid_canonical: string
          previous_medoid_canonical: string | null
          product_count: number
          run_id: string
          score: number
          selection_mode: string
          selection_reason: string | null
          snapshot_month: string
          token_purity: number
        }
        Insert: {
          avg_similarity: number
          canonical_name: string
          cluster_index: number
          cluster_key: string
          cluster_size: number
          created_at?: string
          id?: string
          is_medoid?: boolean
          medoid_canonical: string
          previous_medoid_canonical?: string | null
          product_count?: number
          run_id: string
          score: number
          selection_mode: string
          selection_reason?: string | null
          snapshot_month: string
          token_purity: number
        }
        Update: {
          avg_similarity?: number
          canonical_name?: string
          cluster_index?: number
          cluster_key?: string
          cluster_size?: number
          created_at?: string
          id?: string
          is_medoid?: boolean
          medoid_canonical?: string
          previous_medoid_canonical?: string | null
          product_count?: number
          run_id?: string
          score?: number
          selection_mode?: string
          selection_reason?: string | null
          snapshot_month?: string
          token_purity?: number
        }
        Relationships: [
          {
            foreignKeyName: "canonical_medoid_memberships_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "canonical_medoid_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_medoid_runs: {
        Row: {
          assignment_count: number
          candidate_pair_count: number
          cluster_count: number
          created_at: string
          dry_run: boolean
          id: string
          min_event_count: number | null
          mode: string
          similarity_threshold: number | null
          snapshot_month: string
          stability_delta: number | null
          worker_name: string
        }
        Insert: {
          assignment_count?: number
          candidate_pair_count?: number
          cluster_count?: number
          created_at?: string
          dry_run?: boolean
          id?: string
          min_event_count?: number | null
          mode: string
          similarity_threshold?: number | null
          snapshot_month: string
          stability_delta?: number | null
          worker_name: string
        }
        Update: {
          assignment_count?: number
          candidate_pair_count?: number
          cluster_count?: number
          created_at?: string
          dry_run?: boolean
          id?: string
          min_event_count?: number | null
          mode?: string
          similarity_threshold?: number | null
          snapshot_month?: string
          stability_delta?: number | null
          worker_name?: string
        }
        Relationships: []
      }
      canonical_substitution_proposals: {
        Row: {
          cluster_members: string[]
          cluster_size: number
          common_tokens: string[]
          created_at: string
          from_canonical: string
          id: string
          max_similarity: number | null
          notes: string | null
          reviewed_at: string | null
          source_product_count: number
          status: string
          target_product_count: number
          to_canonical: string
        }
        Insert: {
          cluster_members?: string[]
          cluster_size: number
          common_tokens?: string[]
          created_at?: string
          from_canonical: string
          id?: string
          max_similarity?: number | null
          notes?: string | null
          reviewed_at?: string | null
          source_product_count?: number
          status?: string
          target_product_count?: number
          to_canonical: string
        }
        Update: {
          cluster_members?: string[]
          cluster_size?: number
          common_tokens?: string[]
          created_at?: string
          from_canonical?: string
          id?: string
          max_similarity?: number | null
          notes?: string | null
          reviewed_at?: string | null
          source_product_count?: number
          status?: string
          target_product_count?: number
          to_canonical?: string
        }
        Relationships: []
      }
      canonical_token_idf_cache: {
        Row: {
          doc_freq: number
          document_count: number
          refreshed_at: string
          token: string
        }
        Insert: {
          doc_freq: number
          document_count: number
          refreshed_at?: string
          token: string
        }
        Update: {
          doc_freq?: number
          document_count?: number
          refreshed_at?: string
          token?: string
        }
        Relationships: []
      }
      category_default_unit_weights: {
        Row: {
          category: Database["public"]["Enums"]["item_category_enum"]
          created_at: string | null
          default_unit_weight_oz: number
          description: string | null
          updated_at: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["item_category_enum"]
          created_at?: string | null
          default_unit_weight_oz: number
          description?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["item_category_enum"]
          created_at?: string | null
          default_unit_weight_oz?: number
          description?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      challenge_entries: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          post_id: string | null
          profile_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          post_id?: string | null
          profile_id: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          post_id?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_entries_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_entries_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_votes: {
        Row: {
          challenge_id: string
          created_at: string
          entry_profile_id: string
          id: string
          voter_profile_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          entry_profile_id: string
          id?: string
          voter_profile_id: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          entry_profile_id?: string
          id?: string
          voter_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_votes_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_votes_voter_profile_id_fkey"
            columns: ["voter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_votes_entry_profile_id_fkey"
            columns: ["entry_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_winners: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          profile_id: string
          rank: number
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          profile_id: string
          rank?: number
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_winners_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_winners_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          challenge_type: string
          created_at: string
          description: string | null
          ends_at: string
          id: string
          points: number
          starts_at: string
          title: string
          winner_count: number
        }
        Insert: {
          challenge_type?: string
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          points?: number
          starts_at: string
          title: string
          winner_count?: number
        }
        Update: {
          challenge_type?: string
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          points?: number
          starts_at?: string
          title?: string
          winner_count?: number
        }
        Relationships: []
      }
      community_challenge_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          points: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          points?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          points?: number
          title?: string
        }
        Relationships: []
      }
      delivery_orders: {
        Row: {
          basket_fee_amount: number
          basket_fee_rate: number
          created_at: string
          flat_fee: number
          grand_total: number
          id: string
          subscription_tier_at_checkout: string
          subtotal: number
          total_delivery_fee: number
          updated_at: string
          user_id: string
        }
        Insert: {
          basket_fee_amount?: number
          basket_fee_rate?: number
          created_at?: string
          flat_fee?: number
          grand_total?: number
          id: string
          subscription_tier_at_checkout?: string
          subtotal?: number
          total_delivery_fee?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          basket_fee_amount?: number
          basket_fee_rate?: number
          created_at?: string
          flat_fee?: number
          grand_total?: number
          id?: string
          subscription_tier_at_checkout?: string
          subtotal?: number
          total_delivery_fee?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_queue: {
        Row: {
          attempt_count: number
          created_at: string | null
          id: string
          input_text: string
          last_error: string | null
          model: string
          processing_lease_expires_at: string | null
          processing_started_at: string | null
          source_id: string
          source_type: string
          status: string
          updated_at: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string | null
          id?: string
          input_text: string
          last_error?: string | null
          model?: string
          processing_lease_expires_at?: string | null
          processing_started_at?: string | null
          source_id: string
          source_type: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string | null
          id?: string
          input_text?: string
          last_error?: string | null
          model?: string
          processing_lease_expires_at?: string | null
          processing_started_at?: string | null
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      failed_scrapes_log: {
        Row: {
          created_at: string | null
          error_code: string | null
          error_detail: string | null
          id: string
          raw_payload: Json | null
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          error_detail?: string | null
          id?: string
          raw_payload?: Json | null
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          error_detail?: string | null
          id?: string
          raw_payload?: Json | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string | null
          id: string
          message: string
          read: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          read?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_requests: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
          status: Database["public"]["Enums"]["follow_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
          status?: Database["public"]["Enums"]["follow_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
          status?: Database["public"]["Enums"]["follow_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_requests_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_requests_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_email_digests: {
        Row: {
          created_at: string
          digest_end_at: string
          digest_start_at: string
          id: string
          notification_count: number
          recipient_id: string
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          digest_end_at: string
          digest_start_at: string
          id?: string
          notification_count?: number
          recipient_id: string
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          digest_end_at?: string
          digest_start_at?: string
          id?: string
          notification_count?: number
          recipient_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_email_digests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json
          read_at: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_stores: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          failure_count: number
          geom: unknown
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          state: string | null
          store_enum: Database["public"]["Enums"]["grocery_store"]
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          failure_count?: number
          geom?: unknown
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          state?: string | null
          store_enum: Database["public"]["Enums"]["grocery_store"]
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          failure_count?: number
          geom?: unknown
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          state?: string | null
          store_enum?: Database["public"]["Enums"]["grocery_store"]
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_store_zip"
            columns: ["zip_code"]
            isOneToOne: false
            referencedRelation: "scraped_zipcodes"
            referencedColumns: ["zip_code"]
          },
        ]
      }
      ingredient_confidence_outcomes: {
        Row: {
          calibrated_confidence: number | null
          canonical_name: string | null
          category: string | null
          context: string | null
          id: number
          is_new_canonical: boolean
          metadata: Json
          outcome: string
          raw_confidence: number
          reason: string
          recorded_at: string
          resolver: string | null
          source: string | null
          token_count: number | null
        }
        Insert: {
          calibrated_confidence?: number | null
          canonical_name?: string | null
          category?: string | null
          context?: string | null
          id?: number
          is_new_canonical?: boolean
          metadata?: Json
          outcome: string
          raw_confidence: number
          reason?: string
          recorded_at?: string
          resolver?: string | null
          source?: string | null
          token_count?: number | null
        }
        Update: {
          calibrated_confidence?: number | null
          canonical_name?: string | null
          category?: string | null
          context?: string | null
          id?: number
          is_new_canonical?: boolean
          metadata?: Json
          outcome?: string
          raw_confidence?: number
          reason?: string
          recorded_at?: string
          resolver?: string | null
          source?: string | null
          token_count?: number | null
        }
        Relationships: []
      }
      ingredient_embeddings: {
        Row: {
          created_at: string | null
          embedding: string | null
          id: string
          input_text: string
          model: string
          standardized_ingredient_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          input_text: string
          model?: string
          standardized_ingredient_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          input_text?: string
          model?: string
          standardized_ingredient_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_embeddings_standardized_ingredient_id_fkey"
            columns: ["standardized_ingredient_id"]
            isOneToOne: true
            referencedRelation: "standardized_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_match_queue: {
        Row: {
          attempt_count: number
          best_fuzzy_match: string | null
          cleaned_name: string
          created_at: string | null
          fuzzy_score: number | null
          id: string
          is_food_item: boolean | null
          last_error: string | null
          needs_ingredient_review: boolean
          needs_unit_review: boolean
          processing_lease_expires_at: string | null
          processing_started_at: string | null
          product_mapping_id: string | null
          quantity_confidence: number | null
          raw_product_name: string
          raw_unit: string | null
          recipe_ingredient_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_ingredient_id: string | null
          resolved_quantity: number | null
          resolved_unit: Database["public"]["Enums"]["unit_label"] | null
          source: string
          status: string
          unit_confidence: number | null
        }
        Insert: {
          attempt_count?: number
          best_fuzzy_match?: string | null
          cleaned_name: string
          created_at?: string | null
          fuzzy_score?: number | null
          id?: string
          is_food_item?: boolean | null
          last_error?: string | null
          needs_ingredient_review?: boolean
          needs_unit_review?: boolean
          processing_lease_expires_at?: string | null
          processing_started_at?: string | null
          product_mapping_id?: string | null
          quantity_confidence?: number | null
          raw_product_name: string
          raw_unit?: string | null
          recipe_ingredient_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_ingredient_id?: string | null
          resolved_quantity?: number | null
          resolved_unit?: Database["public"]["Enums"]["unit_label"] | null
          source?: string
          status?: string
          unit_confidence?: number | null
        }
        Update: {
          attempt_count?: number
          best_fuzzy_match?: string | null
          cleaned_name?: string
          created_at?: string | null
          fuzzy_score?: number | null
          id?: string
          is_food_item?: boolean | null
          last_error?: string | null
          needs_ingredient_review?: boolean
          needs_unit_review?: boolean
          processing_lease_expires_at?: string | null
          processing_started_at?: string | null
          product_mapping_id?: string | null
          quantity_confidence?: number | null
          raw_product_name?: string
          raw_unit?: string | null
          recipe_ingredient_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_ingredient_id?: string | null
          resolved_quantity?: number | null
          resolved_unit?: Database["public"]["Enums"]["unit_label"] | null
          source?: string
          status?: string
          unit_confidence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_match_queue_product_mapping_id_fkey"
            columns: ["product_mapping_id"]
            isOneToOne: false
            referencedRelation: "product_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_match_queue_recipe_ingredient_id_fkey"
            columns: ["recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_match_queue_resolved_ingredient_id_fkey"
            columns: ["resolved_ingredient_id"]
            isOneToOne: false
            referencedRelation: "standardized_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients_history: {
        Row: {
          created_at: string | null
          grocery_store_id: string | null
          id: string
          price: number | null
          product_mapping_id: string
        }
        Insert: {
          created_at?: string | null
          grocery_store_id?: string | null
          id?: string
          price?: number | null
          product_mapping_id: string
        }
        Update: {
          created_at?: string | null
          grocery_store_id?: string | null
          id?: string
          price?: number | null
          product_mapping_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "history_grocery_store_fkey"
            columns: ["grocery_store_id"]
            isOneToOne: false
            referencedRelation: "grocery_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_history_product_mapping_id_fkey"
            columns: ["product_mapping_id"]
            isOneToOne: false
            referencedRelation: "product_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients_recent: {
        Row: {
          created_at: string | null
          grocery_store_id: string | null
          id: string
          price: number
          product_mapping_id: string
          unit_price: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          grocery_store_id?: string | null
          id: string
          price: number
          product_mapping_id: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          grocery_store_id?: string | null
          id?: string
          price?: number
          product_mapping_id?: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_recent_product_mapping_id_fkey"
            columns: ["product_mapping_id"]
            isOneToOne: true
            referencedRelation: "product_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_recent_store_fkey"
            columns: ["grocery_store_id"]
            isOneToOne: false
            referencedRelation: "grocery_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_shopping_history: {
        Row: {
          category: Database["public"]["Enums"]["item_category_enum"] | null
          frequency_count: number | null
          id: string
          item_name: string
          last_added_at: string | null
          standardized_ingredient_id: string | null
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["item_category_enum"] | null
          frequency_count?: number | null
          id?: string
          item_name: string
          last_added_at?: string | null
          standardized_ingredient_id?: string | null
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["item_category_enum"] | null
          frequency_count?: number | null
          id?: string
          item_name?: string
          last_added_at?: string | null
          standardized_ingredient_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_shopping_history_ingredient_fkey"
            columns: ["standardized_ingredient_id"]
            isOneToOne: false
            referencedRelation: "standardized_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_shopping_history_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_schedule: {
        Row: {
          created_at: string | null
          date: string
          id: string
          meal_type: Database["public"]["Enums"]["meal_type_enum"]
          recipe_id: string
          updated_at: string | null
          user_id: string
          week_index: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          meal_type: Database["public"]["Enums"]["meal_type_enum"]
          recipe_id: string
          updated_at?: string | null
          user_id: string
          week_index?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          meal_type?: Database["public"]["Enums"]["meal_type_enum"]
          recipe_id?: string
          updated_at?: string | null
          user_id?: string
          week_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_schedule_recipe_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_schedule_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_planner_weekly_reminders: {
        Row: {
          created_at: string
          id: string
          planned_day_count: number
          planned_meal_count: number
          recipient_id: string
          reminder_week_end: string
          reminder_week_start: string
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          planned_day_count?: number
          planned_meal_count?: number
          recipient_id: string
          reminder_week_end: string
          reminder_week_start: string
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          planned_day_count?: number
          planned_meal_count?: number
          recipient_id?: string
          reminder_week_end?: string
          reminder_week_start?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_planner_weekly_reminders_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pantry_items: {
        Row: {
          category: string | null
          created_at: string | null
          expiry_date: string | null
          id: string
          name: string
          quantity: number | null
          standardized_ingredient_id: string | null
          standardized_name: string | null
          standardized_unit: Database["public"]["Enums"]["unit_label"] | null
          unit: string | null
          unit_price: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          name: string
          quantity?: number | null
          standardized_ingredient_id?: string | null
          standardized_name?: string | null
          standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          name?: string
          quantity?: number | null
          standardized_ingredient_id?: string | null
          standardized_name?: string | null
          standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pantry_items_standardized_ingredient_id_fkey"
            columns: ["standardized_ingredient_id"]
            isOneToOne: false
            referencedRelation: "standardized_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pantry_items_standardized_unit_fkey"
            columns: ["standardized_unit"]
            isOneToOne: false
            referencedRelation: "unit_canonical"
            referencedColumns: ["standard_unit"]
          },
          {
            foreignKeyName: "pantry_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reposts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reposts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          caption: string | null
          created_at: string
          id: string
          image_url: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          caption?: string | null
          created_at?: string
          id?: string
          image_url: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          id: string
          price_per_unit: number | null
          recorded_at: string | null
          standardized_ingredient_id: string | null
          store: string | null
        }
        Insert: {
          id?: string
          price_per_unit?: number | null
          recorded_at?: string | null
          standardized_ingredient_id?: string | null
          store?: string | null
        }
        Update: {
          id?: string
          price_per_unit?: number | null
          recorded_at?: string | null
          standardized_ingredient_id?: string | null
          store?: string | null
        }
        Relationships: []
      }
      product_embeddings: {
        Row: {
          embedding: string
          id: string
          input_text: string
          model: string
          product_mapping_id: string
          updated_at: string
        }
        Insert: {
          embedding: string
          id?: string
          input_text: string
          model: string
          product_mapping_id: string
          updated_at?: string
        }
        Update: {
          embedding?: string
          id?: string
          input_text?: string
          model?: string
          product_mapping_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_embeddings_product_mapping_id_fkey"
            columns: ["product_mapping_id"]
            isOneToOne: false
            referencedRelation: "product_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      product_mapping_relink_cache: {
        Row: {
          applied_at: string | null
          cached_at: string
          cleaned_name: string | null
          confidence: number | null
          match_strategy: string | null
          matched_ingredient_id: string | null
          needs_queue: boolean
          product_mapping_id: string
          proposed_canonical: string | null
          raw_product_name: string
          word_ratio: number | null
        }
        Insert: {
          applied_at?: string | null
          cached_at?: string
          cleaned_name?: string | null
          confidence?: number | null
          match_strategy?: string | null
          matched_ingredient_id?: string | null
          needs_queue?: boolean
          product_mapping_id: string
          proposed_canonical?: string | null
          raw_product_name: string
          word_ratio?: number | null
        }
        Update: {
          applied_at?: string | null
          cached_at?: string
          cleaned_name?: string | null
          confidence?: number | null
          match_strategy?: string | null
          matched_ingredient_id?: string | null
          needs_queue?: boolean
          product_mapping_id?: string
          proposed_canonical?: string | null
          raw_product_name?: string
          word_ratio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_mapping_relink_cache_matched_ingredient_id_fkey"
            columns: ["matched_ingredient_id"]
            isOneToOne: false
            referencedRelation: "standardized_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_mapping_relink_cache_product_mapping_id_fkey"
            columns: ["product_mapping_id"]
            isOneToOne: true
            referencedRelation: "product_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      product_mappings: {
        Row: {
          exchange_count: number | null
          external_product_id: string
          id: string
          image_url: string | null
          ingredient_confidence: number | null
          is_ingredient: boolean
          last_seen_at: string | null
          manual_override: boolean | null
          modal_opened_count: number | null
          quantity_confidence: number | null
          raw_product_name: string | null
          standardized_ingredient_id: string | null
          standardized_quantity: number | null
          standardized_unit: Database["public"]["Enums"]["unit_label"] | null
          store_brand: Database["public"]["Enums"]["grocery_store"]
          unit_confidence: number | null
        }
        Insert: {
          exchange_count?: number | null
          external_product_id: string
          id?: string
          image_url?: string | null
          ingredient_confidence?: number | null
          is_ingredient?: boolean
          last_seen_at?: string | null
          manual_override?: boolean | null
          modal_opened_count?: number | null
          quantity_confidence?: number | null
          raw_product_name?: string | null
          standardized_ingredient_id?: string | null
          standardized_quantity?: number | null
          standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
          store_brand: Database["public"]["Enums"]["grocery_store"]
          unit_confidence?: number | null
        }
        Update: {
          exchange_count?: number | null
          external_product_id?: string
          id?: string
          image_url?: string | null
          ingredient_confidence?: number | null
          is_ingredient?: boolean
          last_seen_at?: string | null
          manual_override?: boolean | null
          modal_opened_count?: number | null
          quantity_confidence?: number | null
          raw_product_name?: string | null
          standardized_ingredient_id?: string | null
          standardized_quantity?: number | null
          standardized_unit?: Database["public"]["Enums"]["unit_label"] | null
          store_brand?: Database["public"]["Enums"]["grocery_store"]
          unit_confidence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_product_mappings_unit"
            columns: ["standardized_unit"]
            isOneToOne: false
            referencedRelation: "unit_canonical"
            referencedColumns: ["standard_unit"]
          },
          {
            foreignKeyName: "product_mappings_standardized_ingredient_id_fkey"
            columns: ["standardized_ingredient_id"]
            isOneToOne: false
            referencedRelation: "standardized_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          avatar_url: string | null
          budget_range: string | null
          city: string | null
          clerk_user_id: string | null
          cooking_level: string | null
          cooking_time_preference: string | null
          country: string | null
          created_at: string | null
          cuisine_preferences: string[] | null
          dietary_preferences: string[] | null
          email: string
          email_verified: boolean | null
          follower_count: number
          following_count: number
          formatted_address: string | null
          full_name: string | null
          full_name_hidden: boolean
          geom: unknown
          grocery_distance_miles: number | null
          id: string
          is_private: boolean
          latitude: number | null
          meal_planner_weekly_reminder_enabled: boolean
          notification_email_digest_enabled: boolean
          notification_push_enabled: boolean
          longitude: number | null
          pinned_recipe_ids: string[]
          primary_goal: string | null
          showcased_badge_ids: string[]
          state: string | null
          stripe_current_period_end: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_expires_at: string | null
          subscription_started_at: string | null
          subscription_status: string | null
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          theme_preference: string | null
          tutorial_completed: boolean | null
          tutorial_completed_at: string | null
          updated_at: string | null
          username: string | null
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          budget_range?: string | null
          city?: string | null
          clerk_user_id?: string | null
          cooking_level?: string | null
          cooking_time_preference?: string | null
          country?: string | null
          created_at?: string | null
          cuisine_preferences?: string[] | null
          dietary_preferences?: string[] | null
          email: string
          email_verified?: boolean | null
          follower_count?: number
          following_count?: number
          formatted_address?: string | null
          full_name?: string | null
          full_name_hidden?: boolean
          geom?: unknown
          grocery_distance_miles?: number | null
          id: string
          is_private?: boolean
          latitude?: number | null
          meal_planner_weekly_reminder_enabled?: boolean
          notification_email_digest_enabled?: boolean
          notification_push_enabled?: boolean
          longitude?: number | null
          pinned_recipe_ids?: string[]
          primary_goal?: string | null
          showcased_badge_ids?: string[]
          state?: string | null
          stripe_current_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_expires_at?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          theme_preference?: string | null
          tutorial_completed?: boolean | null
          tutorial_completed_at?: string | null
          updated_at?: string | null
          username?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          budget_range?: string | null
          city?: string | null
          clerk_user_id?: string | null
          cooking_level?: string | null
          cooking_time_preference?: string | null
          country?: string | null
          created_at?: string | null
          cuisine_preferences?: string[] | null
          dietary_preferences?: string[] | null
          email?: string
          email_verified?: boolean | null
          follower_count?: number
          following_count?: number
          formatted_address?: string | null
          full_name?: string | null
          full_name_hidden?: boolean
          geom?: unknown
          grocery_distance_miles?: number | null
          id?: string
          is_private?: boolean
          latitude?: number | null
          meal_planner_weekly_reminder_enabled?: boolean
          notification_email_digest_enabled?: boolean
          notification_push_enabled?: boolean
          longitude?: number | null
          pinned_recipe_ids?: string[]
          primary_goal?: string | null
          showcased_badge_ids?: string[]
          state?: string | null
          stripe_current_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_expires_at?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          theme_preference?: string | null
          tutorial_completed?: boolean | null
          tutorial_completed_at?: string | null
          updated_at?: string | null
          username?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_profile_zip"
            columns: ["zip_code"]
            isOneToOne: false
            referencedRelation: "scraped_zipcodes"
            referencedColumns: ["zip_code"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string | null
          delivery_date: string | null
          expires_at: string
          grocery_store_id: string
          id: string
          is_delivery_confirmed: boolean | null
          order_id: string | null
          price_at_selection: number | null
          product_mapping_id: string | null
          quantity_needed: number
          standardized_ingredient_id: string
          updated_at: string | null
          user_id: string
          week_index: number
        }
        Insert: {
          created_at?: string | null
          delivery_date?: string | null
          expires_at: string
          grocery_store_id: string
          id?: string
          is_delivery_confirmed?: boolean | null
          order_id?: string | null
          price_at_selection?: number | null
          product_mapping_id?: string | null
          quantity_needed: number
          standardized_ingredient_id: string
          updated_at?: string | null
          user_id: string
          week_index: number
        }
        Update: {
          created_at?: string | null
          delivery_date?: string | null
          expires_at?: string
          grocery_store_id?: string
          id?: string
          is_delivery_confirmed?: boolean | null
          order_id?: string | null
          price_at_selection?: number | null
          product_mapping_id?: string | null
          quantity_needed?: number
          standardized_ingredient_id?: string
          updated_at?: string | null
          user_id?: string
          week_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_list_cache_grocery_store_id_fkey"
            columns: ["grocery_store_id"]
            isOneToOne: false
            referencedRelation: "grocery_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_list_cache_standardized_ingredient_id_fkey"
            columns: ["standardized_ingredient_id"]
            isOneToOne: false
            referencedRelation: "standardized_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_list_history_product_mapping_id_fkey"
            columns: ["product_mapping_id"]
            isOneToOne: false
            referencedRelation: "product_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_list_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_analytics_logs: {
        Row: {
          created_at: string | null
          event_type: string | null
          id: string
          recipe_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type?: string | null
          id?: string
          recipe_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string | null
          id?: string
          recipe_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_analytics_logs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_embeddings: {
        Row: {
          created_at: string | null
          embedding: string | null
          id: string
          input_text: string
          model: string
          recipe_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          input_text: string
          model?: string
          recipe_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          input_text?: string
          model?: string
          recipe_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_embeddings_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_favorites: {
        Row: {
          created_at: string | null
          id: string
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_favorites_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_collections: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_collections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_collection_items: {
        Row: {
          collection_id: string
          created_at: string | null
          id: string
          recipe_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string | null
          id?: string
          recipe_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string | null
          id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "recipe_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_collection_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          display_name: string
          id: string
          quantity: number | null
          recipe_id: string
          standardized_ingredient_id: string | null
          units: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          display_name: string
          id?: string
          quantity?: number | null
          recipe_id: string
          standardized_ingredient_id?: string | null
          units?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          display_name?: string
          id?: string
          quantity?: number | null
          recipe_id?: string
          standardized_ingredient_id?: string | null
          units?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_standardized_id_fkey"
            columns: ["standardized_ingredient_id"]
            isOneToOne: false
            referencedRelation: "standardized_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_likes: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          recipe_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          recipe_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_likes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_reposts: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          recipe_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          recipe_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_reposts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_reposts_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          recipe_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          recipe_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          recipe_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_reviews_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          author_id: string | null
          cook_time: number | null
          created_at: string | null
          cuisine: Database["public"]["Enums"]["cuisine_type_enum"] | null
          deleted_at: string | null
          description: string | null
          difficulty: Database["public"]["Enums"]["recipe_difficulty"] | null
          id: string
          image_url: string | null
          instructions_list: string[] | null
          meal_type: Database["public"]["Enums"]["meal_type_enum"] | null
          nutrition: Json | null
          prep_time: number | null
          protein: Database["public"]["Enums"]["protein_type_enum"] | null
          rating_avg: number | null
          rating_count: number | null
          servings: number | null
          tags: Database["public"]["Enums"]["tags_enum"][] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          cook_time?: number | null
          created_at?: string | null
          cuisine?: Database["public"]["Enums"]["cuisine_type_enum"] | null
          deleted_at?: string | null
          description?: string | null
          difficulty?: Database["public"]["Enums"]["recipe_difficulty"] | null
          id?: string
          image_url?: string | null
          instructions_list?: string[] | null
          meal_type?: Database["public"]["Enums"]["meal_type_enum"] | null
          nutrition?: Json | null
          prep_time?: number | null
          protein?: Database["public"]["Enums"]["protein_type_enum"] | null
          rating_avg?: number | null
          rating_count?: number | null
          servings?: number | null
          tags?: Database["public"]["Enums"]["tags_enum"][] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          cook_time?: number | null
          created_at?: string | null
          cuisine?: Database["public"]["Enums"]["cuisine_type_enum"] | null
          deleted_at?: string | null
          description?: string | null
          difficulty?: Database["public"]["Enums"]["recipe_difficulty"] | null
          id?: string
          image_url?: string | null
          instructions_list?: string[] | null
          meal_type?: Database["public"]["Enums"]["meal_type_enum"] | null
          nutrition?: Json | null
          prep_time?: number | null
          protein?: Database["public"]["Enums"]["protein_type_enum"] | null
          rating_avg?: number | null
          rating_count?: number | null
          servings?: number | null
          tags?: Database["public"]["Enums"]["tags_enum"][] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      scraped_zipcodes: {
        Row: {
          city: string | null
          created_at: string | null
          geom: unknown
          last_scraped_at: string | null
          latitude: number | null
          longitude: number | null
          state: string | null
          store_count: number | null
          updated_at: string | null
          zip_code: string
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          geom?: unknown
          last_scraped_at?: string | null
          latitude?: number | null
          longitude?: number | null
          state?: string | null
          store_count?: number | null
          updated_at?: string | null
          zip_code: string
        }
        Update: {
          city?: string | null
          created_at?: string | null
          geom?: unknown
          last_scraped_at?: string | null
          latitude?: number | null
          longitude?: number | null
          state?: string | null
          store_count?: number | null
          updated_at?: string | null
          zip_code?: string
        }
        Relationships: []
      }
      scraping_events: {
        Row: {
          attempts: number | null
          batch_id: string | null
          created_at: string | null
          id: string
          status: string | null
          updated_at: string | null
          zip_code: string
        }
        Insert: {
          attempts?: number | null
          batch_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          updated_at?: string | null
          zip_code: string
        }
        Update: {
          attempts?: number | null
          batch_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          updated_at?: string | null
          zip_code?: string
        }
        Relationships: []
      }
      shopping_calculation_logs: {
        Row: {
          created_at: string | null
          id: string
          input_configs: Json | null
          output_results: Json | null
          store_id: string | null
          total_cost: number | null
          user_id: string
          zip_code: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          input_configs?: Json | null
          output_results?: Json | null
          store_id?: string | null
          total_cost?: number | null
          user_id: string
          zip_code?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          input_configs?: Json | null
          output_results?: Json | null
          store_id?: string | null
          total_cost?: number | null
          user_id?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_calculation_logs_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          category: Database["public"]["Enums"]["item_category_enum"] | null
          checked: boolean
          created_at: string
          id: string
          ingredient_id: string | null
          name: string
          quantity: number
          recipe_id: string | null
          recipe_ingredient_id: string | null
          servings: number | null
          source_type: Database["public"]["Enums"]["shopping_list_source_type"]
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["item_category_enum"] | null
          checked?: boolean
          created_at?: string
          id?: string
          ingredient_id?: string | null
          name: string
          quantity?: number
          recipe_id?: string | null
          recipe_ingredient_id?: string | null
          servings?: number | null
          source_type: Database["public"]["Enums"]["shopping_list_source_type"]
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["item_category_enum"] | null
          checked?: boolean
          created_at?: string
          id?: string
          ingredient_id?: string | null
          name?: string
          quantity?: number
          recipe_id?: string | null
          recipe_ingredient_id?: string | null
          servings?: number | null
          source_type?: Database["public"]["Enums"]["shopping_list_source_type"]
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "standardized_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_recipe_ingredient_id_fkey"
            columns: ["recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      standardized_ingredients: {
        Row: {
          canonical_name: string
          category: Database["public"]["Enums"]["item_category_enum"] | null
          created_at: string | null
          default_unit: Database["public"]["Enums"]["unit_label"] | null
          estimated_unit_weight_confidence: number | null
          estimated_unit_weight_oz: number | null
          estimated_unit_weight_sample_size: number | null
          estimated_unit_weight_updated_at: string | null
          id: string
          is_food_item: boolean
          search_vector: unknown
          updated_at: string | null
        }
        Insert: {
          canonical_name: string
          category?: Database["public"]["Enums"]["item_category_enum"] | null
          created_at?: string | null
          default_unit?: Database["public"]["Enums"]["unit_label"] | null
          estimated_unit_weight_confidence?: number | null
          estimated_unit_weight_oz?: number | null
          estimated_unit_weight_sample_size?: number | null
          estimated_unit_weight_updated_at?: string | null
          id?: string
          is_food_item?: boolean
          search_vector?: unknown
          updated_at?: string | null
        }
        Update: {
          canonical_name?: string
          category?: Database["public"]["Enums"]["item_category_enum"] | null
          created_at?: string | null
          default_unit?: Database["public"]["Enums"]["unit_label"] | null
          estimated_unit_weight_confidence?: number | null
          estimated_unit_weight_oz?: number | null
          estimated_unit_weight_sample_size?: number | null
          estimated_unit_weight_updated_at?: string | null
          id?: string
          is_food_item?: boolean
          search_vector?: unknown
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_standardized_ingredients_unit"
            columns: ["default_unit"]
            isOneToOne: false
            referencedRelation: "unit_canonical"
            referencedColumns: ["standard_unit"]
          },
        ]
      }
      target_404_log: {
        Row: {
          error_message: string | null
          grocery_store_id: string | null
          http_status: number | null
          id: string
          ingredient_name: string
          request_url: string | null
          scraped_at: string
          store_enum: string
          store_id_source: string | null
          target_store_id: string | null
          zip_code: string
        }
        Insert: {
          error_message?: string | null
          grocery_store_id?: string | null
          http_status?: number | null
          id?: string
          ingredient_name: string
          request_url?: string | null
          scraped_at?: string
          store_enum: string
          store_id_source?: string | null
          target_store_id?: string | null
          zip_code: string
        }
        Update: {
          error_message?: string | null
          grocery_store_id?: string | null
          http_status?: number | null
          id?: string
          ingredient_name?: string
          request_url?: string | null
          scraped_at?: string
          store_enum?: string
          store_id_source?: string | null
          target_store_id?: string | null
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "target_404_log_grocery_store_id_fkey"
            columns: ["grocery_store_id"]
            isOneToOne: false
            referencedRelation: "grocery_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      target_zipcodes: {
        Row: {
          created_at: string | null
          priority: number | null
          reason: string | null
          updated_at: string | null
          user_count: number | null
          zip_code: string
        }
        Insert: {
          created_at?: string | null
          priority?: number | null
          reason?: string | null
          updated_at?: string | null
          user_count?: number | null
          zip_code: string
        }
        Update: {
          created_at?: string | null
          priority?: number | null
          reason?: string | null
          updated_at?: string | null
          user_count?: number | null
          zip_code?: string
        }
        Relationships: []
      }
      unit_canonical: {
        Row: {
          category: Database["public"]["Enums"]["unit_category"]
          standard_unit: Database["public"]["Enums"]["unit_label"]
        }
        Insert: {
          category: Database["public"]["Enums"]["unit_category"]
          standard_unit: Database["public"]["Enums"]["unit_label"]
        }
        Update: {
          category?: Database["public"]["Enums"]["unit_category"]
          standard_unit?: Database["public"]["Enums"]["unit_label"]
        }
        Relationships: []
      }
      unit_conversion_failures: {
        Row: {
          context: string | null
          created_at: string | null
          from_qty: number
          from_unit: string
          id: string
          to_unit: string
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          from_qty: number
          from_unit: string
          id?: string
          to_unit: string
        }
        Update: {
          context?: string | null
          created_at?: string | null
          from_qty?: number
          from_unit?: string
          id?: string
          to_unit?: string
        }
        Relationships: []
      }
      unit_conversions: {
        Row: {
          from_unit: Database["public"]["Enums"]["unit_label"]
          multiplier: number
          to_unit: Database["public"]["Enums"]["unit_label"]
        }
        Insert: {
          from_unit: Database["public"]["Enums"]["unit_label"]
          multiplier: number
          to_unit: Database["public"]["Enums"]["unit_label"]
        }
        Update: {
          from_unit?: Database["public"]["Enums"]["unit_label"]
          multiplier?: number
          to_unit?: Database["public"]["Enums"]["unit_label"]
        }
        Relationships: [
          {
            foreignKeyName: "from_unit_fkey"
            columns: ["from_unit"]
            isOneToOne: false
            referencedRelation: "unit_canonical"
            referencedColumns: ["standard_unit"]
          },
          {
            foreignKeyName: "to_unit_fkey"
            columns: ["to_unit"]
            isOneToOne: false
            referencedRelation: "unit_canonical"
            referencedColumns: ["standard_unit"]
          },
        ]
      }
      unit_standardization_map: {
        Row: {
          confidence_score: number | null
          raw_input_string: string
          standard_unit: Database["public"]["Enums"]["unit_label"] | null
          updated_at: string | null
        }
        Insert: {
          confidence_score?: number | null
          raw_input_string: string
          standard_unit?: Database["public"]["Enums"]["unit_label"] | null
          updated_at?: string | null
        }
        Update: {
          confidence_score?: number | null
          raw_input_string?: string
          standard_unit?: Database["public"]["Enums"]["unit_label"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unit_standardization_map_standard_unit_fkey"
            columns: ["standard_unit"]
            isOneToOne: false
            referencedRelation: "unit_canonical"
            referencedColumns: ["standard_unit"]
          },
        ]
      }
      unrecognized_inputs_log: {
        Row: {
          attempted_at: string | null
          id: string
          occurrence_count: number | null
          raw_ingredient_text: string | null
          raw_unit_text: string | null
          source_table: string
        }
        Insert: {
          attempted_at?: string | null
          id?: string
          occurrence_count?: number | null
          raw_ingredient_text?: string | null
          raw_unit_text?: string | null
          source_table: string
        }
        Update: {
          attempted_at?: string | null
          id?: string
          occurrence_count?: number | null
          raw_ingredient_text?: string | null
          raw_unit_text?: string | null
          source_table?: string
        }
        Relationships: []
      }
      user_analytics_snapshots: {
        Row: {
          calculated_budget_tier:
            | Database["public"]["Enums"]["budget_range_enum"]
            | null
          id: string
          snapshot_date: string | null
          top_cuisine: Database["public"]["Enums"]["cuisine_type_enum"] | null
          top_protein: Database["public"]["Enums"]["protein_type_enum"] | null
          user_id: string | null
          variety_score: number | null
          waste_score: number | null
        }
        Insert: {
          calculated_budget_tier?:
            | Database["public"]["Enums"]["budget_range_enum"]
            | null
          id?: string
          snapshot_date?: string | null
          top_cuisine?: Database["public"]["Enums"]["cuisine_type_enum"] | null
          top_protein?: Database["public"]["Enums"]["protein_type_enum"] | null
          user_id?: string | null
          variety_score?: number | null
          waste_score?: number | null
        }
        Update: {
          calculated_budget_tier?:
            | Database["public"]["Enums"]["budget_range_enum"]
            | null
          id?: string
          snapshot_date?: string | null
          top_cuisine?: Database["public"]["Enums"]["cuisine_type_enum"] | null
          top_protein?: Database["public"]["Enums"]["protein_type_enum"] | null
          user_id?: string | null
          variety_score?: number | null
          waste_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_analytics_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          profile_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_nutrition_history: {
        Row: {
          calories: number | null
          carbs: number | null
          date: string | null
          fats: number | null
          id: string
          protein: number | null
          user_id: string | null
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          date?: string | null
          fats?: number | null
          id?: string
          protein?: number | null
          user_id?: string | null
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          date?: string | null
          fats?: number | null
          id?: string
          protein?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_nutrition_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferred_stores: {
        Row: {
          distance_miles: number | null
          grocery_store_id: string
          profile_id: string
          store_enum: Database["public"]["Enums"]["grocery_store"]
          updated_at: string | null
        }
        Insert: {
          distance_miles?: number | null
          grocery_store_id: string
          profile_id: string
          store_enum: Database["public"]["Enums"]["grocery_store"]
          updated_at?: string | null
        }
        Update: {
          distance_miles?: number | null
          grocery_store_id?: string
          profile_id?: string
          store_enum?: Database["public"]["Enums"]["grocery_store"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_store"
            columns: ["grocery_store_id"]
            isOneToOne: false
            referencedRelation: "grocery_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_analytics: {
        Row: {
          id: string
          ingredient_name: string | null
          quantity: number | null
          recorded_at: string | null
          standardized_ingredient_id: string | null
          user_id: string | null
          was_consumed: boolean | null
        }
        Insert: {
          id?: string
          ingredient_name?: string | null
          quantity?: number | null
          recorded_at?: string | null
          standardized_ingredient_id?: string | null
          user_id?: string | null
          was_consumed?: boolean | null
        }
        Update: {
          id?: string
          ingredient_name?: string | null
          quantity?: number | null
          recorded_at?: string | null
          standardized_ingredient_id?: string | null
          user_id?: string | null
          was_consumed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "waste_analytics_standardized_fkey"
            columns: ["standardized_ingredient_id"]
            isOneToOne: false
            referencedRelation: "standardized_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      user_meal_type_statistics: {
        Row: {
          avg_cook_time: number | null
          avg_prep_time: number | null
          avg_servings: number | null
          cuisine: string | null
          cuisine_pct: number | null
          difficulty: string | null
          difficulty_pct: number | null
          meal_type: Database["public"]["Enums"]["meal_type_enum"] | null
          protein: string | null
          protein_pct: number | null
          tag: string | null
          tag_pct: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_canonical_double_check_drift_daily: {
        Row: {
          avg_ai_confidence: number | null
          avg_similarity: number | null
          decision: string | null
          direction: string | null
          event_count: number | null
          event_date: string | null
          first_seen_at: string | null
          last_seen_at: string | null
          max_confidence: number | null
          max_similarity: number | null
          min_confidence: number | null
          min_similarity: number | null
          reason: string | null
          source_canonical: string | null
          source_category: string | null
          target_canonical: string | null
          target_category: string | null
          updated_at: string | null
        }
        Insert: {
          avg_ai_confidence?: never
          avg_similarity?: never
          decision?: string | null
          direction?: string | null
          event_count?: number | null
          event_date?: string | null
          first_seen_at?: string | null
          last_seen_at?: string | null
          max_confidence?: number | null
          max_similarity?: number | null
          min_confidence?: number | null
          min_similarity?: number | null
          reason?: string | null
          source_canonical?: string | null
          source_category?: string | null
          target_canonical?: string | null
          target_category?: string | null
          updated_at?: string | null
        }
        Update: {
          avg_ai_confidence?: never
          avg_similarity?: never
          decision?: string | null
          direction?: string | null
          event_count?: number | null
          event_date?: string | null
          first_seen_at?: string | null
          last_seen_at?: string | null
          max_confidence?: number | null
          max_similarity?: number | null
          min_confidence?: number | null
          min_similarity?: number | null
          reason?: string | null
          source_canonical?: string | null
          source_category?: string | null
          target_canonical?: string | null
          target_category?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_unit_conversion_coverage: {
        Row: {
          conversion_status: string | null
          product_unit: string | null
          shopping_unit: string | null
          test_conversion: number | null
        }
        Relationships: []
      }
      vw_product_ingredient_summary: {
        Row: {
          canonical_name: string | null
          ingredient_confidence: number | null
          is_ingredient: boolean | null
          latest_price: number | null
          price_last_updated: string | null
          product_name: string | null
          standardized_quantity: number | null
          standardized_unit: Database["public"]["Enums"]["unit_label"] | null
          store_brand: Database["public"]["Enums"]["grocery_store"] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_product_mappings_unit"
            columns: ["standardized_unit"]
            isOneToOne: false
            referencedRelation: "unit_canonical"
            referencedColumns: ["standard_unit"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      add_neighbor_zipcodes: { Args: { radius?: number }; Returns: number }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      bytea_to_text: { Args: { data: string }; Returns: string }
      calculate_recipe_cost: {
        Args: {
          p_recipe_id: string
          p_servings: number
          p_store_id: Database["public"]["Enums"]["grocery_store"]
          p_user_id?: string
          p_zip_code: string
        }
        Returns: Json
      }
      calculate_unit_weight_estimates: {
        Args: never
        Returns: {
          canonical_name: string
          confidence: number
          estimated_weight_oz: number
          id: string
          sample_size: number
        }[]
      }
      calculate_weekly_basket: {
        Args: {
          p_recipe_configs: Json
          p_store_id: Database["public"]["Enums"]["grocery_store"]
          p_user_id: string
          p_zip_code: string
        }
        Returns: Json
      }
      can_view_analytics: { Args: { p_user_id: string }; Returns: boolean }
      can_view_profile_posts: {
        Args: { author_profile_id: string }
        Returns: boolean
      }
      check_pricing_health: {
        Args: never
        Returns: {
          check_name: string
          details: Json
          status: string
        }[]
      }
      claim_embedding_queue: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_source_type?: string
        }
        Returns: {
          attempt_count: number
          created_at: string | null
          id: string
          input_text: string
          last_error: string | null
          model: string
          processing_lease_expires_at: string | null
          processing_started_at: string | null
          source_id: string
          source_type: string
          status: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "embedding_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_ingredient_match_queue: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_resolver?: string
          p_review_mode?: string
          p_source?: string
        }
        Returns: {
          attempt_count: number
          best_fuzzy_match: string | null
          cleaned_name: string
          created_at: string | null
          fuzzy_score: number | null
          id: string
          is_food_item: boolean | null
          last_error: string | null
          needs_ingredient_review: boolean
          needs_unit_review: boolean
          processing_lease_expires_at: string | null
          processing_started_at: string | null
          product_mapping_id: string | null
          quantity_confidence: number | null
          raw_product_name: string
          raw_unit: string | null
          recipe_ingredient_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_ingredient_id: string | null
          resolved_quantity: number | null
          resolved_unit: Database["public"]["Enums"]["unit_label"] | null
          source: string
          status: string
          unit_confidence: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "ingredient_match_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_old_store_locations: { Args: never; Returns: undefined }
      cleanup_unverified_users: { Args: never; Returns: number }
      clerk_profile_id: { Args: never; Returns: string }
      clerk_user_id: { Args: never; Returns: string }
      complete_order: {
        Args: { input_data: Json; target_delivery_date: string }
        Returns: undefined
      }
      convert_units:
        | {
            Args: {
              from_qty: number
              from_unit: string
              ingredient_id?: string
              to_unit: string
            }
            Returns: number
          }
        | {
            Args: {
              p_from_unit: Database["public"]["Enums"]["unit_label"]
              p_quantity: number
              p_to_unit: Database["public"]["Enums"]["unit_label"]
            }
            Returns: number
          }
      current_profile_id: { Args: never; Returns: string }
      dev_create_experiment: {
        Args: {
          p_created_by?: string
          p_description?: string
          p_hypothesis?: string
          p_name: string
          p_target_anonymous?: boolean
          p_target_user_tiers?: Database["public"]["Enums"]["subscription_tier"][]
          p_traffic_percentage?: number
        }
        Returns: string
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      execute_sql: { Args: { sql: string }; Returns: Json }
      find_nearby_stores: {
        Args: {
          p_lat: number
          p_lng: number
          p_radius_meters?: number
          p_store_enum?: Database["public"]["Enums"]["grocery_store"]
        }
        Returns: {
          address: string
          created_at: string
          distance_meters: number
          distance_miles: number
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          store_enum: Database["public"]["Enums"]["grocery_store"]
          zip_code: string
        }[]
      }
      find_stores_near_user: {
        Args: {
          p_radius_meters?: number
          p_store_enum?: Database["public"]["Enums"]["grocery_store"]
          p_user_id: string
        }
        Returns: {
          address: string
          distance_meters: number
          distance_miles: number
          id: string
          lat: number
          lng: number
          name: string
          store_enum: Database["public"]["Enums"]["grocery_store"]
          zip_code: string
        }[]
      }
      fn_add_to_delivery_log:
        | {
            Args: {
              p_delivery_date?: string
              p_product_mapping_id: string
              p_shopping_list_item_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_delivery_date?: string
              p_frontend_price: number
              p_num_packages: number
              p_product_mapping_id: string
              p_shopping_list_item_id: string
            }
            Returns: boolean
          }
      fn_apply_relink_cache: {
        Args: { p_limit?: number }
        Returns: {
          changed: boolean
          match_strategy: string
          new_ingredient_id: string
          old_ingredient_id: string
          pm_confidence: number
          pm_id: string
          pm_product_name: string
          queued: boolean
        }[]
      }
      fn_backup_ingredient_ecosystem: {
        Args: { p_suffix?: string }
        Returns: Json
      }
      fn_build_unit_regex: { Args: never; Returns: string }
      fn_bulk_add_to_delivery_log: {
        Args: { p_default_delivery_date?: string; p_entries: Json }
        Returns: {
          error_message: string
          price_matched: boolean
          shopping_list_item_id: string
          success: boolean
        }[]
      }
      fn_bulk_insert_ingredient_history: {
        Args: { p_items: Json }
        Returns: {
          error_msg: string
          inserted_id: string
          product_name: string
          status: string
        }[]
      }
      fn_bulk_preview_standardization: {
        Args: { p_items: Json }
        Returns: {
          confidence_score: number
          extracted_quantity: number
          extracted_unit: Database["public"]["Enums"]["unit_label"]
          input_product_name: string
          matched_ingredient_id: string
          matched_ingredient_name: string
        }[]
      }
      fn_calculate_unit_price: {
        Args: {
          p_price: number
          p_quantity: number
          p_standard_unit: Database["public"]["Enums"]["unit_label"]
        }
        Returns: number
      }
      fn_challenge_leaderboard: {
        Args: {
          p_challenge_id: string
          p_limit?: number
          p_scope?: string
          p_viewer_id?: string
        }
        Returns: {
          avatar_url: string
          full_name: string
          is_viewer: boolean
          like_count: number
          post_id: string
          profile_id: string
          total_points: number
          username: string
        }[]
      }
      fn_challenge_viewer_rank: {
        Args: { p_challenge_id: string; p_scope?: string; p_viewer_id: string }
        Returns: number
      }
      fn_clean_product_name: { Args: { p_raw: string }; Returns: string }
      fn_consolidate_canonical: {
        Args: {
          p_dry_run?: boolean
          p_loser_canonical: string
          p_survivor_canonical: string
        }
        Returns: Json
      }
      fn_create_relink_ingredients: {
        Args: never
        Returns: {
          canonical_name: string
          ingredient_id: string
          was_created: boolean
        }[]
      }
      fn_enqueue_for_review: {
        Args: {
          p_cleaned_name?: string
          p_match_conf?: number
          p_match_id?: string
          p_needs_ingredient_review?: boolean
          p_needs_unit_review?: boolean
          p_product_mapping_id?: string
          p_raw_product_name?: string
          p_raw_unit?: string
          p_recipe_ingredient_id?: string
          p_source?: string
        }
        Returns: undefined
      }
      fn_find_similar_ingredients_for_pantry: {
        Args: {
          p_min_similarity?: number
          p_missing_ids: string[]
          p_model?: string
          p_pantry_ids: string[]
        }
        Returns: {
          missing_ingredient_id: string
          missing_name: string
          similarity: number
          substitute_ingredient_id: string
          substitute_name: string
        }[]
      }
      fn_find_vector_double_check_candidates: {
        Args: { p_limit?: number; p_model?: string; p_threshold?: number }
        Returns: {
          similarity: number
          source_canonical: string
          source_category: string
          target_canonical: string
          target_category: string
        }[]
      }
      fn_get_canonical_token_idf: {
        Args: never
        Returns: {
          doc_freq: number
          document_count: number
          token: string
        }[]
      }
      fn_get_ingredient_confidence_calibration: {
        Args: {
          p_bin_size?: number
          p_days_back?: number
          p_min_samples?: number
        }
        Returns: {
          acceptance_rate: number
          accepted_count: number
          bin_start: number
          sample_count: number
        }[]
      }
      fn_get_recipe_parser_unit_keywords: {
        Args: never
        Returns: {
          keyword: string
        }[]
      }
      fn_get_sensitivity_pair_stats:
        | {
            Args: { p_days_back?: number; p_min_event_count?: number }
            Returns: {
              source_canonical: string
              target_canonical: string
              total_events: number
            }[]
          }
        | {
            Args: { p_min_event_count?: number }
            Returns: {
              source_canonical: string
              target_canonical: string
              total_events: number
            }[]
          }
      fn_ingredient_ecosystem: {
        Args: { p_action: string; p_restore_suffix?: string }
        Returns: Json
      }
      fn_log_canonical_double_check_daily: {
        Args: {
          p_ai_confidence?: number
          p_decision: string
          p_direction?: string
          p_event_at?: string
          p_reason?: string
          p_similarity?: number
          p_source_canonical: string
          p_source_category?: string
          p_target_canonical: string
          p_target_category?: string
        }
        Returns: undefined
      }
      fn_log_ingredient_confidence_outcome: {
        Args: {
          p_calibrated_confidence?: number
          p_canonical_name?: string
          p_category?: string
          p_context?: string
          p_is_new_canonical?: boolean
          p_metadata?: Json
          p_outcome?: string
          p_raw_confidence: number
          p_reason?: string
          p_recorded_at?: string
          p_resolver?: string
          p_source?: string
          p_token_count?: number
        }
        Returns: undefined
      }
      fn_match_ingredient: {
        Args: { p_product_name: string }
        Returns: Record<string, unknown>
      }
      fn_match_ingredient_vector: {
        Args: {
          p_embedding: string
          p_high_confidence_threshold?: number
          p_limit?: number
          p_mid_confidence_threshold?: number
          p_model?: string
        }
        Returns: {
          confidence: number
          embedding_model: string
          match_strategy: string
          matched_category: string
          matched_id: string
          matched_name: string
        }[]
      }
      fn_matching_confidence_distribution: {
        Args: {
          p_category?: Database["public"]["Enums"]["item_category_enum"]
          p_store?: Database["public"]["Enums"]["grocery_store"]
        }
        Returns: {
          band_floor: number
          conf_band: string
          ingredient_count: number
          ingredient_pct: number
          unit_count: number
          unit_pct: number
        }[]
      }
      fn_matching_health_summary: {
        Args: never
        Returns: {
          detail: string
          metric: string
          section: string
          value: number
        }[]
      }
      fn_matching_ingredient_coverage: {
        Args: never
        Returns: {
          avg_confidence: number
          canonical_name: string
          category: Database["public"]["Enums"]["item_category_enum"]
          default_unit: string
          min_confidence: number
          missing_stores: string
          stores_with_price: number
          total_mappings: number
          unit_price_available: boolean
        }[]
      }
      fn_matching_queue_age_analysis: {
        Args: never
        Returns: {
          age_bucket: string
          avg_fuzzy_score: number
          count: number
          oldest_created_at: string
          review_type: string
          source: string
        }[]
      }
      fn_matching_store_breakdown: {
        Args: never
        Returns: {
          avg_ingredient_conf: number
          failed_queue: number
          food_mappings: number
          has_recent_price: number
          low_conf_count: number
          low_conf_pct: number
          pending_queue: number
          price_coverage_pct: number
          store: Database["public"]["Enums"]["grocery_store"]
          total_mappings: number
          unit_fallback_count: number
        }[]
      }
      fn_matching_weak_mappings: {
        Args: {
          p_limit?: number
          p_max_conf?: number
          p_min_conf?: number
          p_store?: Database["public"]["Enums"]["grocery_store"]
        }
        Returns: {
          ingredient_confidence: number
          is_ingredient: boolean
          last_seen_at: string
          matched_canonical: string
          matched_category: Database["public"]["Enums"]["item_category_enum"]
          product_mapping_id: string
          queue_needs_ingredient_rev: boolean
          queue_needs_unit_rev: boolean
          queue_status: string
          raw_product_name: string
          standardized_unit: string
          store: Database["public"]["Enums"]["grocery_store"]
          unit_confidence: number
        }[]
      }
      fn_parse_unit_from_text: {
        Args: {
          p_product_name?: string
          p_raw_unit?: string
          p_raw_unit_param?: string
        }
        Returns: Record<string, unknown>
      }
      fn_populate_relink_cache: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_older_than?: string
          p_queue_all?: boolean
          p_reset_all?: boolean
        }
        Returns: {
          confidence: number
          match_strategy: string
          matched_id: string
          needs_queue: boolean
          pm_id: string
          pm_product_name: string
          proposed_canonical: string
          word_ratio: number
        }[]
      }
      fn_preview_ingredient_match: {
        Args: { p_items: Json }
        Returns: {
          confidence: number
          input_name: string
          match_method: string
          matched_canonical_name: string
          matched_category: Database["public"]["Enums"]["item_category_enum"]
          matched_id: string
        }[]
      }
      fn_recipe_candidates_for_pantry: {
        Args: { p_min_match_ratio?: number; p_user_id: string }
        Returns: {
          match_ratio: number
          matched_count: number
          recipe_id: string
          total_count: number
        }[]
      }
      fn_refresh_canonical_bigram_pmi_cache: { Args: never; Returns: undefined }
      fn_refresh_canonical_token_idf_cache: { Args: never; Returns: undefined }
      fn_relink_product_mappings:
        | {
            Args: {
              p_older_than?: string
              p_queue_all?: boolean
              p_reset_all?: boolean
            }
            Returns: {
              changed: boolean
              new_ingredient_id: string
              old_ingredient_id: string
              pm_confidence: number
              pm_id: string
              pm_match_strategy: string
              pm_product_name: string
            }[]
          }
        | {
            Args: {
              p_limit?: number
              p_offset?: number
              p_older_than?: string
              p_queue_all?: boolean
              p_reset_all?: boolean
            }
            Returns: {
              changed: boolean
              new_ingredient_id: string
              old_ingredient_id: string
              pm_confidence: number
              pm_id: string
              pm_match_strategy: string
              pm_product_name: string
            }[]
          }
      fn_relink_recipe_ingredients: {
        Args: { p_queue_all?: boolean; p_recipe_id?: string }
        Returns: {
          changed: boolean
          new_ingredient_id: string
          old_ingredient_id: string
          ri_display_name: string
          ri_id: string
          ri_match_strategy: string
        }[]
      }
      fn_reset_ingredient_ecosystem: { Args: never; Returns: Json }
      fn_resolve_ingredient: {
        Args: { p_name: string }
        Returns: Record<string, unknown>
      }
      fn_restore_from_backup: { Args: never; Returns: string }
      fn_restore_ingredient_ecosystem: {
        Args: { p_suffix: string }
        Returns: Json
      }
      fn_standardize_unit_lookup: {
        Args: { p_cleaned_name?: string; p_search_term: string }
        Returns: Record<string, unknown>
      }
      fn_strip_units_from_name: { Args: { p_name: string }; Returns: string }
      fn_sync_backup_tables: { Args: never; Returns: string }
      fn_track_canonical_creation_probation: {
        Args: {
          p_canonical_name: string
          p_event_at?: string
          p_source?: string
          p_source_signature: string
        }
        Returns: {
          distinct_sources: number
          first_seen_at: string
          last_seen_at: string
          total_events: number
        }[]
      }
      fn_truncate_app_tables: { Args: never; Returns: string }
      fn_upsert_recipe_with_ingredients: {
        Args: {
          p_author_id: string
          p_cook_time: number
          p_cuisine: string
          p_description: string
          p_difficulty: string
          p_image_url: string
          p_ingredients: Json
          p_instructions: string[]
          p_meal_type: string
          p_nutrition: Json
          p_prep_time: number
          p_protein: string
          p_recipe_id: string
          p_servings: number
          p_tags: string[]
          p_title: string
        }
        Returns: {
          author_id: string | null
          cook_time: number | null
          created_at: string | null
          cuisine: Database["public"]["Enums"]["cuisine_type_enum"] | null
          deleted_at: string | null
          description: string | null
          difficulty: Database["public"]["Enums"]["recipe_difficulty"] | null
          id: string
          image_url: string | null
          instructions_list: string[] | null
          meal_type: Database["public"]["Enums"]["meal_type_enum"] | null
          nutrition: Json | null
          prep_time: number | null
          protein: Database["public"]["Enums"]["protein_type_enum"] | null
          rating_avg: number | null
          rating_count: number | null
          servings: number | null
          tags: Database["public"]["Enums"]["tags_enum"][] | null
          title: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "recipes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_word_commonness_similarity: {
        Args: { p_candidate: string; p_query: string }
        Returns: number
      }
      fn_word_weighted_similarity: {
        Args: { p_candidate: string; p_cap_oov?: boolean; p_query: string }
        Returns: number
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_best_store_for_plan: {
        Args: { p_recipe_ids: string[]; p_user_id: string; p_zip_code?: string }
        Returns: {
          missing_ingredients_count: number
          protein_mix: Json
          store_id: string
          store_name: string
          total_cost: number
        }[]
      }
      get_closest_stores: {
        Args: { user_id: string }
        Returns: {
          distance_miles: number
          geojson: Json
          latitude: number
          longitude: number
          store_brand: string
          store_id: string
          store_name: string
        }[]
      }
      get_ingredient_price_details: {
        Args: {
          p_quantity: number
          p_standardized_ingredient_id: string
          p_user_id: string
        }
        Returns: Json
      }
      get_ingredient_pricing_v2: { Args: { p_user_id: string }; Returns: Json }
      get_pricing: {
        Args: { p_user_id: string }
        Returns: {
          result: Json
        }[]
      }
      get_pricing_gaps: { Args: { p_user_id: string }; Returns: Json }
      get_recipe_demand: {
        Args: { p_desired_servings: number; p_recipe_id: string }
        Returns: {
          amount_needed: number
          ingredient_name: string
          protein_tag: string
          standardized_ingredient_id: string
        }[]
      }
      get_replacement:
        | {
            Args: {
              p_raw_ingredient_name: string
              p_store_brand: Database["public"]["Enums"]["grocery_store"]
            }
            Returns: {
              replacement_results: Json
            }[]
          }
        | {
            Args: {
              p_raw_ingredient_name: string
              p_store_brand: Database["public"]["Enums"]["grocery_store"]
              p_user_id: string
            }
            Returns: {
              replacement_results: Json
            }[]
          }
      get_smart_trending_recommendations: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          cook_time: number
          created_at: string
          cuisine: string
          deleted_at: string
          description: string
          difficulty: string
          id: string
          image_url: string
          ingredients: Json
          instructions_list: string[]
          prep_time: number
          protein: string
          servings: number
          tags: Database["public"]["Enums"]["tags_enum"][]
          title: string
          trending_score: number
        }[]
      }
      get_user_preferred_stores: {
        Args: { p_user_id: string }
        Returns: {
          address: string
          distance_miles: number
          latitude: number
          longitude: number
          store_brand: Database["public"]["Enums"]["grocery_store"]
          store_id: string
          store_name: string
          zip_code: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      increment_geocoding_failures: {
        Args: { store_ids: string[] }
        Returns: string[]
      }
      increment_mapping_counters: {
        Args: { exchange_inc?: number; modal_inc?: number; target_id: string }
        Returns: undefined
      }
      ingest_all_grocery_brands: {
        Args: { target_city: string; target_state: string }
        Returns: {
          spider: string
          status: string
        }[]
      }
      ingest_brand_data_by_city: {
        Args: {
          spider_name: string
          store_val: Database["public"]["Enums"]["grocery_store"]
          target_city: string
          target_state: string
        }
        Returns: string
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      log_conversion_failure: {
        Args: {
          p_context?: string
          p_from_qty: number
          p_from_unit: string
          p_to_unit: string
        }
        Returns: undefined
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      recommend_global_recipes: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          cook_time: number
          created_at: string
          cuisine: string
          deleted_at: string
          description: string
          difficulty: string
          id: string
          image_url: string
          ingredients: Json
          instructions_list: string[]
          prep_time: number
          protein: string
          servings: number
          tags: Database["public"]["Enums"]["tags_enum"][]
          title: string
        }[]
      }
      recommend_recipes_global: {
        Args: { p_limit: number; p_user_id: string }
        Returns: {
          cook_time: number
          created_at: string
          cuisine: string
          deleted_at: string
          description: string
          difficulty: string
          id: string
          image_url: string
          ingredients: Json
          instructions: Json
          prep_time: number
          protein: string
          servings: number
          tags: string[]
          title: string
        }[]
      }
      recommend_recipes_smart: {
        Args: {
          p_limit?: number
          p_meal_type: Database["public"]["Enums"]["meal_type_enum"]
          p_user_id: string
        }
        Returns: {
          cook_time: number
          created_at: string
          cuisine: string
          deleted_at: string
          description: string
          difficulty: string
          id: string
          image_url: string
          ingredients: Json
          instructions_list: string[]
          prep_time: number
          protein: string
          servings: number
          tags: Database["public"]["Enums"]["tags_enum"][]
          title: string
        }[]
      }
      requeue_expired_embedding_queue: {
        Args: { p_error?: string; p_limit?: number }
        Returns: number
      }
      requeue_expired_ingredient_match_queue: {
        Args: { p_error?: string; p_limit?: number }
        Returns: number
      }
      reset_queue: {
        Args: { p_review_mode?: string; p_source?: string }
        Returns: {
          reset_count: number
          review_filter: string
          source_filter: string
        }[]
      }
      scheduled_update_unit_estimates: { Args: never; Returns: undefined }
      search_standardized_ingredients: {
        Args: {
          max_results?: number
          search_query: string
          similarity_threshold?: number
        }
        Returns: {
          canonical_name: string
          category: string
          id: string
          match_type: string
          similarity_score: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      sync_client_selection_to_cache: {
        Args: {
          p_changes: Json
          p_delivery_date: string
          p_store_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      unlockrows: { Args: { "": string }; Returns: number }
      update_target_zipcodes: { Args: never; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
    }
    Enums: {
      ab_event_type:
        | "exposure"
        | "click"
        | "conversion"
        | "signup"
        | "subscribe"
        | "custom"
      admin_role: "admin" | "analyst"
      allocation_method: "random" | "weighted" | "deterministic"
      budget_range_enum: "low" | "medium" | "high"
      cooking_level_enum: "beginner" | "intermediate" | "advanced"
      cuisine_type_enum:
        | "italian"
        | "mexican"
        | "chinese"
        | "indian"
        | "american"
        | "french"
        | "japanese"
        | "thai"
        | "mediterranean"
        | "korean"
        | "greek"
        | "spanish"
        | "vietnamese"
        | "middle-eastern"
        | "other"
      experiment_status:
        | "draft"
        | "scheduled"
        | "active"
        | "paused"
        | "completed"
        | "archived"
      follow_request_status: "pending" | "accepted" | "rejected"
      notification_type:
        | "follow_request"
        | "new_follower"
        | "post_like"
        | "post_repost"
      grocery_store:
        | "aldi"
        | "kroger"
        | "safeway"
        | "meijer"
        | "target"
        | "traderjoes"
        | "99ranch"
        | "walmart"
        | "andronicos"
        | "wholefoods"
      item_category_enum:
        | "baking"
        | "beverages"
        | "condiments"
        | "dairy"
        | "meat_seafood"
        | "pantry_staples"
        | "produce"
        | "snacks"
        | "other"
        | "spices"
      meal_type_enum: "breakfast" | "lunch" | "dinner" | "snack" | "dessert"
      protein_type_enum:
        | "chicken"
        | "beef"
        | "pork"
        | "fish"
        | "shellfish"
        | "turkey"
        | "tofu"
        | "legume"
        | "egg"
        | "other"
      recipe_difficulty: "beginner" | "intermediate" | "advanced"
      shopping_list_source_type: "recipe" | "manual"
      subscription_tier: "free" | "premium"
      tags_enum:
        | "vegetarian"
        | "vegan"
        | "gluten-free"
        | "dairy-free"
        | "keto"
        | "paleo"
        | "low-carb"
        | "other"
        | "contains-dairy"
        | "contains-gluten"
        | "contains-nuts"
        | "contains-shellfish"
        | "contains-egg"
        | "contains-soy"
      theme_enum: "light" | "dark"
      unit_category: "weight" | "volume" | "count" | "other"
      unit_label:
        | "oz"
        | "lb"
        | "fl oz"
        | "ml"
        | "gal"
        | "ct"
        | "each"
        | "bunch"
        | "gram"
        | "unit"
        | "g"
        | "tsp"
        | "tbsp"
        | "cup"
        | "kg"
        | "mg"
        | "l"
        | "pt"
        | "qt"
        | "pk"
        | "dz"
        | "clove"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ab_event_type: [
        "exposure",
        "click",
        "conversion",
        "signup",
        "subscribe",
        "custom",
      ],
      admin_role: ["admin", "analyst"],
      allocation_method: ["random", "weighted", "deterministic"],
      budget_range_enum: ["low", "medium", "high"],
      cooking_level_enum: ["beginner", "intermediate", "advanced"],
      cuisine_type_enum: [
        "italian",
        "mexican",
        "chinese",
        "indian",
        "american",
        "french",
        "japanese",
        "thai",
        "mediterranean",
        "korean",
        "greek",
        "spanish",
        "vietnamese",
        "middle-eastern",
        "other",
      ],
      experiment_status: [
        "draft",
        "scheduled",
        "active",
        "paused",
        "completed",
        "archived",
      ],
      follow_request_status: ["pending", "accepted", "rejected"],
      notification_type: [
        "follow_request",
        "new_follower",
        "post_like",
        "post_repost",
      ],
      grocery_store: [
        "aldi",
        "kroger",
        "safeway",
        "meijer",
        "target",
        "traderjoes",
        "99ranch",
        "walmart",
        "andronicos",
        "wholefoods",
      ],
      item_category_enum: [
        "baking",
        "beverages",
        "condiments",
        "dairy",
        "meat_seafood",
        "pantry_staples",
        "produce",
        "snacks",
        "other",
        "spices",
      ],
      meal_type_enum: ["breakfast", "lunch", "dinner", "snack", "dessert"],
      protein_type_enum: [
        "chicken",
        "beef",
        "pork",
        "fish",
        "shellfish",
        "turkey",
        "tofu",
        "legume",
        "egg",
        "other",
      ],
      recipe_difficulty: ["beginner", "intermediate", "advanced"],
      shopping_list_source_type: ["recipe", "manual"],
      subscription_tier: ["free", "premium"],
      tags_enum: [
        "vegetarian",
        "vegan",
        "gluten-free",
        "dairy-free",
        "keto",
        "paleo",
        "low-carb",
        "other",
        "contains-dairy",
        "contains-gluten",
        "contains-nuts",
        "contains-shellfish",
        "contains-egg",
        "contains-soy",
      ],
      theme_enum: ["light", "dark"],
      unit_category: ["weight", "volume", "count", "other"],
      unit_label: [
        "oz",
        "lb",
        "fl oz",
        "ml",
        "gal",
        "ct",
        "each",
        "bunch",
        "gram",
        "unit",
        "g",
        "tsp",
        "tbsp",
        "cup",
        "kg",
        "mg",
        "l",
        "pt",
        "qt",
        "pk",
        "dz",
        "clove",
      ],
    },
  },
} as const
