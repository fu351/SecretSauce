import type { MABReallocationConfig } from "./config"
import { PostHogClient } from "./posthog-client"
import { computeNewPercentages } from "./thompson-sampling"

export interface MABExperimentResult {
  experimentId: string
  skipped: boolean
  skipReason?: string
  newPercentages?: Record<string, number>
  applied: boolean
}

export interface MABRunSummary {
  experiments: MABExperimentResult[]
  dryRun: boolean
}

export async function runMABReallocationWorker(
  config: MABReallocationConfig
): Promise<MABRunSummary> {
  const client = new PostHogClient({
    apiKey: config.posthogApiKey,
    projectId: config.posthogProjectId,
    host: config.posthogHost,
  })

  if (config.experimentIds.length === 0) {
    console.warn("[MAB] No experiment IDs configured (MAB_EXPERIMENT_IDS is empty). Exiting.")
    return { experiments: [], dryRun: config.dryRun }
  }

  console.log(
    `[MAB] Starting reallocation for ${config.experimentIds.length} experiment(s). dry_run=${config.dryRun}`
  )

  const results: MABExperimentResult[] = []

  for (const experimentId of config.experimentIds) {
    console.log(`[MAB] Processing experiment ${experimentId}`)

    let variantStats
    try {
      variantStats = await client.getExperimentVariantStats(experimentId)
    } catch (err) {
      console.error(`[MAB] Failed to fetch results for experiment ${experimentId}:`, err)
      results.push({ experimentId, skipped: true, skipReason: String(err), applied: false })
      continue
    }

    if (variantStats.length === 0) {
      console.log(`[MAB] Experiment ${experimentId}: no variants found, skipping.`)
      results.push({ experimentId, skipped: true, skipReason: "no variants", applied: false })
      continue
    }

    // Gate: require minimum exposures on every variant before rebalancing
    const underThreshold = variantStats.filter((v) => v.exposures < config.minExposures)
    if (underThreshold.length > 0) {
      const names = underThreshold.map((v) => `${v.key}(${v.exposures})`).join(", ")
      console.log(
        `[MAB] Experiment ${experimentId}: variants below min_exposures=${config.minExposures}: ${names}. Skipping.`
      )
      results.push({
        experimentId,
        skipped: true,
        skipReason: `below min_exposures: ${names}`,
        applied: false,
      })
      continue
    }

    const newPercentages = computeNewPercentages(variantStats, config.minFloorPct)

    console.log(`[MAB] Experiment ${experimentId}: new allocations:`)
    for (const [key, pct] of Object.entries(newPercentages)) {
      const stats = variantStats.find((v) => v.key === key)
      const cr = stats && stats.exposures > 0
        ? ((stats.conversions / stats.exposures) * 100).toFixed(1)
        : "n/a"
      console.log(`  ${key}: ${pct}%  (exposures=${stats?.exposures}, conv_rate=${cr}%)`)
    }

    if (config.dryRun) {
      results.push({ experimentId, skipped: false, newPercentages, applied: false })
      continue
    }

    try {
      const flag = await client.getFeatureFlagByExperimentId(experimentId)
      await client.updateFeatureFlagRollout(flag.id, newPercentages)
      console.log(`[MAB] Experiment ${experimentId}: flag ${flag.id} updated.`)
      results.push({ experimentId, skipped: false, newPercentages, applied: true })
    } catch (err) {
      console.error(`[MAB] Failed to update flag for experiment ${experimentId}:`, err)
      results.push({
        experimentId,
        skipped: false,
        newPercentages,
        applied: false,
        skipReason: String(err),
      })
    }
  }

  const applied = results.filter((r) => r.applied).length
  const skipped = results.filter((r) => r.skipped).length
  console.log(
    `[MAB] Done. applied=${applied} skipped=${skipped} total=${results.length}`
  )

  return { experiments: results, dryRun: config.dryRun }
}
