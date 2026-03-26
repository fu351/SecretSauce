import { afterEach, describe, expect, it } from 'vitest'
import {
  getScraperRuntimeConfig,
  getUniversalScraperControlsFromEnv,
  mergeUniversalScraperControls,
  runWithUniversalScraperControls,
} from '../../universal-controls'

afterEach(() => {
  delete process.env.SCRAPER_WORKER_LIVE_ACTIVATION
  delete process.env.SCRAPER_WORKER_BYPASS_TIMEOUTS
  delete process.env.SCRAPER_WORKER_TIMEOUT_MULTIPLIER
  delete process.env.SCRAPER_WORKER_TIMEOUT_FLOOR_MS
  delete process.env.SCRAPER_LIVE_TIMEOUT_MULTIPLIER
  delete process.env.SCRAPER_LIVE_TIMEOUT_FLOOR_MS
})

describe('universal scraper controls', () => {
  it('reads worker-specific control env vars', () => {
    process.env.SCRAPER_WORKER_LIVE_ACTIVATION = 'true'
    process.env.SCRAPER_WORKER_BYPASS_TIMEOUTS = '1'
    process.env.SCRAPER_WORKER_TIMEOUT_MULTIPLIER = '4'
    process.env.SCRAPER_WORKER_TIMEOUT_FLOOR_MS = '90000'

    expect(getUniversalScraperControlsFromEnv()).toEqual({
      liveActivation: true,
      bypassTimeouts: true,
      timeoutMultiplier: 4,
      timeoutFloorMs: 90000,
    })
  })

  it('falls back to legacy timeout env vars for compatibility', () => {
    process.env.SCRAPER_LIVE_TIMEOUT_MULTIPLIER = '5'
    process.env.SCRAPER_LIVE_TIMEOUT_FLOOR_MS = '70000'

    expect(getUniversalScraperControlsFromEnv()).toMatchObject({
      timeoutMultiplier: 5,
      timeoutFloorMs: 70000,
    })
  })

  it('merges runtime overrides over env defaults', () => {
    process.env.SCRAPER_WORKER_LIVE_ACTIVATION = 'true'

    expect(mergeUniversalScraperControls({ timeoutMultiplier: 9 })).toEqual({
      liveActivation: true,
      bypassTimeouts: false,
      timeoutMultiplier: 9,
      timeoutFloorMs: 45000,
    })
  })

  it('runs function with merged controls in async context', async () => {
    await runWithUniversalScraperControls({ liveActivation: true, timeoutMultiplier: 8 }, async () => {
      expect(getScraperRuntimeConfig()).toMatchObject({
        liveActivation: true,
        timeoutMultiplier: 8,
      })
    })

    expect(getScraperRuntimeConfig()).toBeNull()
  })
})
