import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getScraperRuntimeConfig,
  isLiveActivation,
  resolveTimeoutMs,
  runWithScraperRuntimeConfig,
  withScraperTimeout,
} from '../runtime-config'

afterEach(() => {
  delete process.env.SCRAPER_LIVE_BYPASS_TIMEOUTS
})

describe('getScraperRuntimeConfig', () => {
  it('returns null outside of a runtime context', () => {
    expect(getScraperRuntimeConfig()).toBeNull()
  })

  it('returns the config set by runWithScraperRuntimeConfig', async () => {
    await runWithScraperRuntimeConfig({ liveActivation: true }, async () => {
      expect(getScraperRuntimeConfig()).toEqual({ liveActivation: true })
    })
  })

  it('returns null after the context exits', async () => {
    await runWithScraperRuntimeConfig({ liveActivation: true }, async () => {})
    expect(getScraperRuntimeConfig()).toBeNull()
  })
})

describe('isLiveActivation', () => {
  it('returns false outside a runtime context', () => {
    expect(isLiveActivation()).toBe(false)
  })

  it('returns true when liveActivation is true', async () => {
    await runWithScraperRuntimeConfig({ liveActivation: true }, async () => {
      expect(isLiveActivation()).toBe(true)
    })
  })

  it('returns false when liveActivation is absent', async () => {
    await runWithScraperRuntimeConfig({}, async () => {
      expect(isLiveActivation()).toBe(false)
    })
  })

  it('returns false when liveActivation is false', async () => {
    await runWithScraperRuntimeConfig({ liveActivation: false }, async () => {
      expect(isLiveActivation()).toBe(false)
    })
  })
})

describe('resolveTimeoutMs', () => {
  it('returns the original value outside a live context', () => {
    expect(resolveTimeoutMs(5000)).toBe(5000)
  })

  it('returns the original value for non-positive ms outside a live context', () => {
    expect(resolveTimeoutMs(0)).toBe(0)
    expect(resolveTimeoutMs(-100)).toBe(-100)
  })

  it('returns the original value when not a live activation', async () => {
    await runWithScraperRuntimeConfig({ liveActivation: false }, async () => {
      expect(resolveTimeoutMs(5000)).toBe(5000)
    })
  })

  it('applies multiplier in live activation context', async () => {
    await runWithScraperRuntimeConfig(
      { liveActivation: true, timeoutMultiplier: 2, timeoutFloorMs: 1 },
      async () => {
        expect(resolveTimeoutMs(5000)).toBe(10000)
      }
    )
  })

  it('enforces the floor when multiplied value is below it', async () => {
    await runWithScraperRuntimeConfig(
      { liveActivation: true, timeoutMultiplier: 1, timeoutFloorMs: 60000 },
      async () => {
        expect(resolveTimeoutMs(1000)).toBe(60000)
      }
    )
  })

  it('returns null when bypassTimeouts=true in live context', async () => {
    await runWithScraperRuntimeConfig(
      { liveActivation: true, bypassTimeouts: true },
      async () => {
        expect(resolveTimeoutMs(5000)).toBeNull()
      }
    )
  })

  it('returns null when SCRAPER_LIVE_BYPASS_TIMEOUTS env var is set', async () => {
    process.env.SCRAPER_LIVE_BYPASS_TIMEOUTS = 'true'
    // The constant is evaluated at module load time, so we must re-import after setting the env var
    vi.resetModules()
    const { resolveTimeoutMs: resolveMs, runWithScraperRuntimeConfig: runWith } = await import('../runtime-config')
    await runWith({ liveActivation: true }, async () => {
      expect(resolveMs(5000)).toBeNull()
    })
    vi.resetModules()
  })

  it('uses default multiplier (3) when none is set in config', async () => {
    await runWithScraperRuntimeConfig(
      { liveActivation: true, timeoutFloorMs: 1 },
      async () => {
        expect(resolveTimeoutMs(1000)).toBe(3000)
      }
    )
  })

  it('ignores invalid timeoutMultiplier and falls back to default', async () => {
    await runWithScraperRuntimeConfig(
      { liveActivation: true, timeoutMultiplier: -5, timeoutFloorMs: 1 },
      async () => {
        // -5 is not positive, so default (3) is used
        expect(resolveTimeoutMs(1000)).toBe(3000)
      }
    )
  })
})

describe('withScraperTimeout', () => {
  it('resolves normally when promise finishes before timeout', async () => {
    const promise = Promise.resolve('done')
    await expect(withScraperTimeout(promise, 5000)).resolves.toBe('done')
  })

  it('rejects with a timeout error when promise exceeds timeout', async () => {
    const neverResolves = new Promise(() => {})
    await expect(withScraperTimeout(neverResolves, 1)).rejects.toThrow('timed out')
  })

  it('returns the original promise when timeout is bypassed in live context', async () => {
    const promise = Promise.resolve('no timeout')
    await runWithScraperRuntimeConfig(
      { liveActivation: true, bypassTimeouts: true },
      async () => {
        await expect(withScraperTimeout(promise, 5000)).resolves.toBe('no timeout')
      }
    )
  })

  it('returns the promise unchanged for non-positive timeouts', async () => {
    const promise = Promise.resolve('ok')
    await expect(withScraperTimeout(promise, 0)).resolves.toBe('ok')
    await expect(withScraperTimeout(promise, -1)).resolves.toBe('ok')
  })

  it('applies live multiplier to timeout in live context', async () => {
    const neverResolves = new Promise(() => {})
    // 1ms * 3 multiplier = 3ms — still times out quickly
    await runWithScraperRuntimeConfig(
      { liveActivation: true, timeoutMultiplier: 3, timeoutFloorMs: 1 },
      async () => {
        await expect(withScraperTimeout(neverResolves, 1)).rejects.toThrow('timed out')
      }
    )
  })
})
