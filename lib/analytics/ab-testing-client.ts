/**
 * A/B Testing Client
 *
 * Frontend-oriented helpers for:
 * - Assigning users/sessions to variants
 * - Loading active experiment assignments
 * - Tracking experiment-scoped events
 */

import { AnalyticsDB } from "@/lib/database/analytics-db"
import { supabase } from "@/lib/database/supabase"
import { SessionManager } from "./session-manager"
import type { ABEventType } from "./event-types"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface ActiveExperimentRow {
  experiment_id: string
  experiment_name: string
  variant_id: string
  variant_name: string
  variant_config: unknown
  is_control: boolean
}

interface DevExperimentRow {
  id: string
  name: string
  status: string
}

export interface ABExperimentAssignment {
  experimentId: string
  experimentName: string
  variantId: string
  variantName: string
  variantConfig: Record<string, unknown>
  isControl: boolean
}

export interface TrackExperimentEventOptions {
  experimentId: string
  variantId: string
  eventType: ABEventType
  eventName: string
  eventValue?: number
  properties?: Record<string, unknown>
  pageUrl?: string
  referrer?: string
}

interface SessionContext {
  userId?: string
  sessionId?: string
}

type RpcResult<T> = {
  data: T | null
  error: {
    message?: string
    details?: string
    hint?: string
    code?: string
  } | null
}

const normalizeConfig = (
  config: ActiveExperimentRow["variant_config"],
): Record<string, unknown> => {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {}
  }

  return config as Record<string, unknown>
}

const formatRpcError = (error: RpcResult<unknown>["error"]) => ({
  message: error?.message,
  details: error?.details,
  hint: error?.hint,
  code: error?.code,
})

export class ABTestingClient {
  private static async callRpcWithSchemaFallback<T>(
    functionName: "assign_user_to_variant" | "get_active_experiments",
    params: Record<string, unknown>,
  ): Promise<RpcResult<T>> {
    const firstAttempt = await supabase.rpc(functionName, params)

    if (!firstAttempt.error) {
      return {
        data: (firstAttempt.data as T) ?? null,
        error: null,
      }
    }

    const schemaClient =
      typeof (supabase as any).schema === "function"
        ? (supabase as any).schema("ab_testing")
        : null

    if (!schemaClient) {
      return {
        data: null,
        error: firstAttempt.error,
      }
    }

    const fallbackAttempt = await schemaClient.rpc(functionName, params)

    if (!fallbackAttempt.error) {
      return {
        data: (fallbackAttempt.data as T) ?? null,
        error: null,
      }
    }

    console.error(
      `[ABTesting] RPC failed for ${functionName} (both public and schema-qualified):`,
      {
        public: formatRpcError(firstAttempt.error),
        schemaQualified: formatRpcError(fallbackAttempt.error),
      },
    )

    return {
      data: null,
      error: fallbackAttempt.error ?? firstAttempt.error,
    }
  }

  static isLikelyExperimentId(identifier: string): boolean {
    return UUID_PATTERN.test(identifier)
  }

  static async assignVariant(experimentId: string): Promise<string | null> {
    try {
      const session = await this.getSessionContext()
      const { data, error } = await this.callRpcWithSchemaFallback<string>(
        "assign_user_to_variant",
        {
          p_experiment_id: experimentId,
          p_user_id: session.userId,
          p_session_id: session.userId ? null : session.sessionId,
        },
      )

      if (error) {
        console.error("[ABTesting] Failed to assign variant:", formatRpcError(error))
        return null
      }

      return data || null
    } catch (error) {
      console.error("[ABTesting] Error assigning variant:", error)
      return null
    }
  }

  static async getActiveExperiments(): Promise<ABExperimentAssignment[]> {
    try {
      const session = await this.getSessionContext()
      const { data, error } = await this.callRpcWithSchemaFallback<
        ActiveExperimentRow[]
      >("get_active_experiments", {
        p_user_id: session.userId,
        p_session_id: session.userId ? null : session.sessionId,
      })

      if (error) {
        console.error(
          "[ABTesting] Failed to load active experiments:",
          formatRpcError(error),
        )
        return []
      }

      if (!data) {
        return []
      }

      return data.map((row) => ({
        experimentId: row.experiment_id,
        experimentName: row.experiment_name,
        variantId: row.variant_id,
        variantName: row.variant_name,
        variantConfig: normalizeConfig(row.variant_config),
        isControl: row.is_control,
      }))
    } catch (error) {
      console.error("[ABTesting] Error loading active experiments:", error)
      return []
    }
  }

  static async getExperimentById(
    experimentId: string,
  ): Promise<ABExperimentAssignment | null> {
    const active = await this.getActiveExperiments()
    const existingAssignment =
      active.find((experiment) => experiment.experimentId === experimentId) || null

    if (existingAssignment) {
      return existingAssignment
    }

    const variantId = await this.assignVariant(experimentId)
    if (!variantId) {
      return null
    }

    const refreshed = await this.getActiveExperiments()
    return (
      refreshed.find((experiment) => experiment.experimentId === experimentId) ||
      null
    )
  }

  static async getExperimentByName(
    experimentName: string,
  ): Promise<ABExperimentAssignment | null> {
    const normalizedName = experimentName.trim().toLowerCase()
    if (!normalizedName) {
      return null
    }

    const active = await this.getActiveExperiments()
    const activeAssignment =
      active.find(
        (experiment) =>
          experiment.experimentName.trim().toLowerCase() === normalizedName,
      ) || null

    if (activeAssignment) {
      return activeAssignment
    }

    const { data, error } = await supabase.rpc("dev_get_experiments")

    if (error) {
      if (error) {
        console.error(
          `[ABTesting] Failed to resolve experiment id by name "${experimentName}":`,
          formatRpcError(error),
        )
      }
      return null
    }

    const resolvedId =
      (data as DevExperimentRow[] | null)
        ?.find(
          (experiment) =>
            experiment.status === "active" &&
            experiment.name.trim().toLowerCase() === normalizedName,
        )
        ?.id || null

    if (!resolvedId) {
      return null
    }

    return this.getExperimentById(resolvedId)
  }

  static async resolveExperiment(
    experimentIdentifier: string,
  ): Promise<ABExperimentAssignment | null> {
    if (!experimentIdentifier) {
      return null
    }

    if (this.isLikelyExperimentId(experimentIdentifier)) {
      return this.getExperimentById(experimentIdentifier)
    }

    return this.getExperimentByName(experimentIdentifier)
  }

  static async trackExperimentEvent(
    options: TrackExperimentEventOptions,
  ): Promise<void> {
    const session = await this.getSessionContext()
    const result = await AnalyticsDB.trackEvent({
      experimentId: options.experimentId,
      variantId: options.variantId,
      eventType: options.eventType,
      eventName: options.eventName,
      userId: session.userId,
      sessionId: session.sessionId,
      eventValue: options.eventValue,
      pageUrl: options.pageUrl ?? this.getPageUrl(),
      referrer: options.referrer ?? this.getReferrer(),
      properties: options.properties,
    })

    if (!result.success) {
      throw new Error(result.error || "Failed to track experiment event")
    }
  }

  private static async getSessionContext(): Promise<SessionContext> {
    const metadata = await SessionManager.getSessionMetadata()
    return {
      userId: metadata.userId,
      sessionId: metadata.sessionId,
    }
  }

  private static getPageUrl(): string | undefined {
    if (typeof window === "undefined") {
      return undefined
    }

    return `${window.location.pathname}${window.location.search}`
  }

  private static getReferrer(): string | undefined {
    if (typeof document === "undefined") {
      return undefined
    }

    return document.referrer || undefined
  }
}
