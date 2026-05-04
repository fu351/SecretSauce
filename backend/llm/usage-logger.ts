import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { LlmUsageEvent } from "./router"

const SUPABASE_INSERT_TIMEOUT_MS = 1_500

let cachedClient: SupabaseClient | null | undefined

function resolveSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  )
}

function resolveSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ""
}

function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) {
    return cachedClient
  }

  const supabaseUrl = resolveSupabaseUrl()
  const serviceRoleKey = resolveSupabaseServiceRoleKey()
  if (!supabaseUrl || !serviceRoleKey) {
    cachedClient = null
    return cachedClient
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return cachedClient
}

function omitUndefined<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

export function mapLlmUsageEventToRow(event: LlmUsageEvent): Record<string, unknown> {
  return omitUndefined({
    event: event.event,
    task: event.task,
    provider: event.provider,
    model: event.model,
    status: event.status,
    duration_ms: event.durationMs,
    input_chars: event.inputChars,
    output_chars: event.outputChars,
    message_count: event.messageCount,
    prompt_tokens: event.promptTokens,
    completion_tokens: event.completionTokens,
    total_tokens: event.totalTokens,
    error_type: event.errorType,
    error_message: event.errorMessage,
    skip_reason: event.skipReason,
    request_id: event.metadata?.requestId,
    route: event.metadata?.route,
    user_id: event.metadata?.userId,
    metadata: event.metadata ?? {},
  })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`LLM usage insert timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export async function recordLlmUsageEvent(event: LlmUsageEvent): Promise<void> {
  console.info(JSON.stringify(event))

  const supabase = getSupabaseClient()
  if (!supabase) {
    return
  }

  try {
    const { error } = await withTimeout(
      supabase.from("llm_usage_events").insert(mapLlmUsageEventToRow(event)),
      SUPABASE_INSERT_TIMEOUT_MS
    )

    if (error) {
      console.warn("[LLMUsageLogger] Supabase insert failed:", error.message)
    }
  } catch (error) {
    console.warn(
      "[LLMUsageLogger] Supabase insert skipped:",
      error instanceof Error ? error.message : String(error)
    )
  }
}
