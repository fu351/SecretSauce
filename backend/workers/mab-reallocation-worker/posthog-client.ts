import type { VariantStats } from "./thompson-sampling"

export interface PostHogClientConfig {
  apiKey: string
  projectId: string
  host: string
}

interface ExperimentResult {
  variant: string
  count: number // exposures
  success_count: number // conversions
}

interface PostHogExperimentResultsResponse {
  result?: {
    insight?: {
      result?: ExperimentResult[]
    }
  }
  // PostHog experiment results structure varies; handle both shapes
  results?: Record<string, { count: number; success_count: number }>
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

  async getExperimentVariantStats(experimentId: string): Promise<VariantStats[]> {
    const data = await this.request<PostHogExperimentResultsResponse>(
      `/experiments/${experimentId}/results/`
    )

    // PostHog returns results keyed by variant name
    const raw = data.results ?? {}
    return Object.entries(raw).map(([key, stats]) => ({
      key,
      exposures: stats.count ?? 0,
      conversions: stats.success_count ?? 0,
    }))
  }

  async getFeatureFlagByExperimentId(experimentId: string): Promise<PostHogFeatureFlag> {
    // Fetch experiment to get feature_flag_id
    const experiment = await this.request<{ feature_flag: PostHogFeatureFlag }>(
      `/experiments/${experimentId}/`
    )
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
