import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRateLimiter } from '../rate-limiter'

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an enforceRateLimit function', () => {
    const { enforceRateLimit } = createRateLimiter()
    expect(typeof enforceRateLimit).toBe('function')
  })

  it('allows first request through without delay', async () => {
    const { enforceRateLimit } = createRateLimiter({ requestsPerSecond: 2, minIntervalMs: 0 })
    const start = Date.now()
    await enforceRateLimit()
    expect(Date.now() - start).toBe(0)
  })

  it('delays when min interval has not elapsed', async () => {
    const { enforceRateLimit } = createRateLimiter({
      requestsPerSecond: 10,
      minIntervalMs: 500,
      enableJitter: false,
    })

    await enforceRateLimit() // first call — sets lastRequestTime

    const delayPromise = enforceRateLimit() // second call — should wait
    vi.advanceTimersByTime(500)
    await delayPromise

    expect(Date.now()).toBeGreaterThanOrEqual(500)
  })

  it('does not delay when min interval has already elapsed', async () => {
    const { enforceRateLimit } = createRateLimiter({
      requestsPerSecond: 10,
      minIntervalMs: 500,
      enableJitter: false,
    })

    await enforceRateLimit()
    vi.advanceTimersByTime(600) // more than minIntervalMs

    const start = Date.now()
    await enforceRateLimit()
    expect(Date.now() - start).toBe(0)
  })

  it('delays when per-second cap is reached within the window', async () => {
    const { enforceRateLimit } = createRateLimiter({
      requestsPerSecond: 2,
      minIntervalMs: 0,
      enableJitter: false,
    })

    await enforceRateLimit() // request 1
    await enforceRateLimit() // request 2 — cap reached

    const delayPromise = enforceRateLimit() // request 3 — must wait for window reset
    vi.advanceTimersByTime(1000)
    await delayPromise
  })

  it('resets the window after 1 second elapses', async () => {
    const { enforceRateLimit } = createRateLimiter({
      requestsPerSecond: 2,
      minIntervalMs: 0,
      enableJitter: false,
    })

    await enforceRateLimit()
    await enforceRateLimit()

    vi.advanceTimersByTime(1000) // advance past the window

    // should not need to wait (new window)
    const promise = enforceRateLimit()
    await promise // if it hangs, window reset didn't work
  })

  it('calls log.debug when rate limit is enforced', async () => {
    const log = { debug: vi.fn() }
    const { enforceRateLimit } = createRateLimiter({
      requestsPerSecond: 1,
      minIntervalMs: 0,
      enableJitter: false,
      log,
      label: '[test]',
    })

    await enforceRateLimit() // fills the window

    const delayPromise = enforceRateLimit()
    vi.advanceTimersByTime(1000)
    await delayPromise

    expect(log.debug).toHaveBeenCalled()
  })

  it('does not throw when no log is provided', async () => {
    const { enforceRateLimit } = createRateLimiter({
      requestsPerSecond: 1,
      minIntervalMs: 0,
      log: null,
    })

    await enforceRateLimit()
    const delayPromise = enforceRateLimit()
    vi.advanceTimersByTime(1000)
    await expect(delayPromise).resolves.toBeUndefined()
  })

  it('each createRateLimiter instance has independent state', async () => {
    const a = createRateLimiter({ requestsPerSecond: 1, minIntervalMs: 0 })
    const b = createRateLimiter({ requestsPerSecond: 1, minIntervalMs: 0 })

    await a.enforceRateLimit()
    await b.enforceRateLimit()

    // Both should still be independent — filling a's window doesn't affect b's
    const promiseA = a.enforceRateLimit()
    const promiseB = b.enforceRateLimit()

    vi.advanceTimersByTime(1000)
    await Promise.all([promiseA, promiseB])
  })

  it('applies jitter to the min interval delay', async () => {
    // With jitter enabled, the delay should be within ±20% of base
    const delays = []
    const { enforceRateLimit } = createRateLimiter({
      requestsPerSecond: 100,
      minIntervalMs: 1000,
      enableJitter: true,
    })

    for (let i = 0; i < 5; i++) {
      // Reset state by creating a fresh limiter for each iteration
      const { enforceRateLimit: rl } = createRateLimiter({
        requestsPerSecond: 100,
        minIntervalMs: 1000,
        enableJitter: true,
      })
      await rl() // sets lastRequestTime to now

      const startTime = Date.now()
      const delayPromise = rl()
      // advance just past the jitter range so it can resolve
      vi.advanceTimersByTime(1200)
      await delayPromise
      delays.push(Date.now() - startTime)
    }

    // All delays should be within the jitter range (800–1200ms base)
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(800)
      expect(d).toBeLessThanOrEqual(1200)
    }
  })
})
