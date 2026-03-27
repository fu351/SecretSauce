import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sleep, parseRetryAfterHeaderToMs, withExponentialBackoffRetry } from '../retry'

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    vi.useFakeTimers()
    const promise = sleep(100)
    vi.advanceTimersByTime(100)
    await expect(promise).resolves.toBeUndefined()
    vi.useRealTimers()
  })

  it('resolves with 0ms delay', async () => {
    vi.useFakeTimers()
    const promise = sleep(0)
    vi.advanceTimersByTime(0)
    await expect(promise).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})

describe('parseRetryAfterHeaderToMs', () => {
  it('returns 0 for null', () => {
    expect(parseRetryAfterHeaderToMs(null)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(parseRetryAfterHeaderToMs(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseRetryAfterHeaderToMs('')).toBe(0)
  })

  it('converts integer seconds string to milliseconds', () => {
    expect(parseRetryAfterHeaderToMs('5')).toBe(5000)
  })

  it('converts numeric seconds to milliseconds', () => {
    expect(parseRetryAfterHeaderToMs(3)).toBe(3000)
  })

  it('converts fractional seconds to milliseconds', () => {
    expect(parseRetryAfterHeaderToMs('0.5')).toBe(500)
  })

  it('converts a future HTTP date string to delay from now', () => {
    const futureDate = new Date(Date.now() + 5000).toUTCString()
    const result = parseRetryAfterHeaderToMs(futureDate)
    expect(result).toBeGreaterThan(4000)
    expect(result).toBeLessThanOrEqual(5000)
  })

  it('returns 0 for a past HTTP date', () => {
    const pastDate = new Date(Date.now() - 5000).toUTCString()
    expect(parseRetryAfterHeaderToMs(pastDate)).toBe(0)
  })

  it('returns 0 for non-parseable strings', () => {
    expect(parseRetryAfterHeaderToMs('not-a-date')).toBe(0)
    expect(parseRetryAfterHeaderToMs('abc')).toBe(0)
  })

  it('ignores non-positive numeric values', () => {
    expect(parseRetryAfterHeaderToMs(0)).toBe(0)
    expect(parseRetryAfterHeaderToMs(-1)).toBe(0)
  })
})

describe('withExponentialBackoffRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns result on the first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await withExponentialBackoffRetry(fn)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('passes currentTimeout and attempt index to fn', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await withExponentialBackoffRetry(fn, { initialTimeout: 10000 })
    expect(fn).toHaveBeenCalledWith(10000, 0)
  })

  it('caps currentTimeout at 3x initialTimeout', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok')

    const promise = withExponentialBackoffRetry(fn, {
      maxRetries: 2,
      baseDelay: 0,
      initialTimeout: 10000,
      timeoutMultiplier: 10, // would exceed 3x without the cap
    })
    await vi.runAllTimersAsync()
    await promise

    // third call (attempt 2) should use capped timeout = 30000
    expect(fn).toHaveBeenNthCalledWith(3, 30000, 2)
  })

  it('retries up to maxRetries times on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success')

    const promise = withExponentialBackoffRetry(fn, { maxRetries: 2, baseDelay: 100 })
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws last error after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    const promise = withExponentialBackoffRetry(fn, { maxRetries: 2, baseDelay: 100 })
    const assertion = expect(promise).rejects.toThrow('always fails')
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('calls onAttempt before each attempt', async () => {
    const onAttempt = vi.fn()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')

    const promise = withExponentialBackoffRetry(fn, { maxRetries: 1, baseDelay: 0, onAttempt })
    await vi.runAllTimersAsync()
    await promise

    expect(onAttempt).toHaveBeenCalledTimes(2)
    expect(onAttempt).toHaveBeenNthCalledWith(1, expect.objectContaining({ attempt: 0, maxRetries: 1 }))
    expect(onAttempt).toHaveBeenNthCalledWith(2, expect.objectContaining({ attempt: 1, maxRetries: 1 }))
  })

  it('respects getRetryDecision shouldRetry=false to stop early', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const getRetryDecision = vi.fn().mockReturnValue({ shouldRetry: false })

    const promise = withExponentialBackoffRetry(fn, {
      maxRetries: 3,
      baseDelay: 100,
      getRetryDecision,
    })
    const assertion = expect(promise).rejects.toThrow('fail')
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('uses custom delayMs from getRetryDecision', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')
    const getRetryDecision = vi.fn().mockReturnValue({ shouldRetry: true, delayMs: 500 })

    const promise = withExponentialBackoffRetry(fn, { maxRetries: 1, getRetryDecision })
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('sleeps for breakDelayMs when shouldRetry is false and breakDelayMs is set', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const getRetryDecision = vi.fn().mockReturnValue({ shouldRetry: false, breakDelayMs: 2000 })

    const promise = withExponentialBackoffRetry(fn, {
      maxRetries: 0,
      getRetryDecision,
    })
    const assertion = expect(promise).rejects.toThrow('fail')
    await vi.runAllTimersAsync()
    await assertion
  })

  it('does not retry when maxRetries=0 and fn fails', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const promise = withExponentialBackoffRetry(fn, { maxRetries: 0 })
    const assertion = expect(promise).rejects.toThrow('fail')
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
