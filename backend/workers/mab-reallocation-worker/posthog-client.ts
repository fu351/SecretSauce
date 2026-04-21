import type { VariantStats } from "./thompson-sampling"

export interface PostHogClientConfig {
  apiKey: string
  projectId: string
  host: string
}

interface HogQLResult {
  results: unknown[][]
  columns: string[]
}

interface PostHogFeatureFlag {
  id: number
  key: string
  filters: {
    multivariate?: {
      variants: Array<{
        key: string
        rollout_percentage: number
        [key: string]: unknown
      }>
    }
    [key: string]: unknown
  }
}

interface PostHogExperiment {
  id: number
  feature_flag_key: string
  feature_flag: PostHogFeatureFlag
}

export class PostHogClient {
  constructor(private cfg: PostHogClientConfig) {}

  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const url = `${this.cfg.host}/api/projects/${this.cfg.projectId}${path}`
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`PostHog API ${method} ${path} → ${res.status}: ${text}`)
    }

    return res.json() as Promise<T>
  }

  private async hogql(query: string): Promise<HogQLResult> {
    return this.request<HogQLResult>("/query/", "POST", {
      query: { kind: "HogQLQuery", query },
    })
  }

  async getExperimentVariantStats(experimentId: string): Promise<VariantStats[]> {
    const experiment = await this.request<PostHogExperiment>(`/experiments/${experimentId}/`)
    const flagKey = experiment.feature_flag_key

    // Exposures: distinct persons per variant from $feature_flag_called events
    const exposureResult = await this.hogql(`
      SELECT
        properties['$feature_flag_response'] AS variant,
        count(DISTINCT person_id) AS exposures
      FROM events
      WHERE timestamp >= now() - INTERVAL 30 DAY
        AND event = '$feature_flag_called'
        AND properties['$feature_flag'] = '${flagKey}'
        AND variant IS NOT NULL
      GROUP BY variant
    `)

    // Conversions: distinct persons per variant from experiment_conversion events
    const conversionResult = await this.hogql(`
      SELECT
        properties['$feature/${flagKey}'] AS variant,
        count(DISTINCT person_id) AS conversions
      FROM events
      WHERE timestamp >= now() - INTERVAL 30 DAY
        AND event = 'experiment_conversion'
        AND properties['flag_key'] = '${flagKey}'
        AND variant IS NOT NULL
      GROUP BY variant
    `)

    const exposureMap: Record<string, number> = {}
    for (const row of exposureResult.results) {
      exposureMap[row[0] as string] = row[1] as number
    }

    const conversionMap: Record<string, number> = {}
    for (const row of conversionResult.results) {
      conversionMap[row[0] as string] = row[1] as number
    }

    // Build stats for all known variants (from flag definition)
    const variants = experiment.feature_flag.filters.multivariate?.variants ?? []
    return variants.map((v) => ({
      key: v.key,
      exposures: exposureMap[v.key] ?? 0,
      conversions: conversionMap[v.key] ?? 0,
    }))
  }

  async getFeatureFlagByExperimentId(experimentId: string): Promise<PostHogFeatureFlag> {
    const experiment = await this.request<PostHogExperiment>(`/experiments/${experimentId}/`)
    return experiment.feature_flag
  }

  async updateFeatureFlagRollout(
    flagId: number,
    variantPercentages: Record<string, number>
  ): Promise<void> {
    const flag = await this.request<PostHogFeatureFlag>(`/feature_flags/${flagId}/`)

    const updatedVariants = (flag.filters.multivariate?.variants ?? []).map((v) => ({
      ...v,
      rollout_percentage: variantPercentages[v.key] ?? v.rollout_percentage,
    }))

    await this.request(`/feature_flags/${flagId}/`, "PATCH", {
      filters: {
        ...flag.filters,
        multivariate: {
          ...flag.filters.multivariate,
          variants: updatedVariants,
        },
      },
    })
  }
}
