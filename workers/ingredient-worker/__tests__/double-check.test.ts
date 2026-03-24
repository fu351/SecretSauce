import { describe, it, expect } from 'vitest'
import type { QueueWorkerConfig } from '../../config'
import { resolveRemapDirection, meetsAsymmetricRemapPolicy } from '../canonical/double-check'

const baseConfig: Pick<QueueWorkerConfig, 'doubleCheckMinConfidence' | 'doubleCheckMinSimilarity'> = {
  doubleCheckMinConfidence: 0.85,
  doubleCheckMinSimilarity: 0.96,
}

describe('resolveRemapDirection', () => {
  it('returns generic_to_specific when source tokens are a subset of candidate and candidate is longer', () => {
    // "milk" tokens ⊆ "whole milk" tokens, and candidate has more tokens
    expect(resolveRemapDirection('milk', 'whole milk')).toBe('generic_to_specific')
  })

  it('returns specific_to_generic when candidate tokens are a subset of source and source is longer', () => {
    // "milk" ⊆ "whole milk", source is longer
    expect(resolveRemapDirection('whole milk', 'milk')).toBe('specific_to_generic')
  })

  it('returns lateral when tokens share no subset relationship', () => {
    expect(resolveRemapDirection('butter', 'cheese')).toBe('lateral')
  })

  it('returns lateral when same token count but different tokens', () => {
    // "organic milk" vs "whole milk": "organic" not in {"whole", "milk"}, "whole" not in {"organic", "milk"}
    expect(resolveRemapDirection('organic milk', 'whole milk')).toBe('lateral')
  })

  it('returns lateral for equal token sets (same canonical)', () => {
    expect(resolveRemapDirection('chicken breast', 'chicken breast')).toBe('lateral')
  })

  it('handles multi-token specificity chains', () => {
    // "egg" → "large brown egg": generic_to_specific
    expect(resolveRemapDirection('egg', 'large brown egg')).toBe('generic_to_specific')
    // "large brown egg" → "egg": specific_to_generic
    expect(resolveRemapDirection('large brown egg', 'egg')).toBe('specific_to_generic')
  })

  it('returns lateral when no token subset exists despite partial overlap', () => {
    // "red wine" vs "white wine vinegar": "red" not in {"white","wine","vinegar"}
    expect(resolveRemapDirection('red wine', 'white wine vinegar')).toBe('lateral')
  })
})

describe('meetsAsymmetricRemapPolicy', () => {
  const config = baseConfig as QueueWorkerConfig

  describe('generic_to_specific', () => {
    it('requires at least 0.95 confidence regardless of config', () => {
      // config.doubleCheckMinConfidence=0.85, but generic_to_specific floor is 0.95
      const result = meetsAsymmetricRemapPolicy('generic_to_specific', 0.94, 0.99, config)
      expect(result.allowed).toBe(false)
      expect(result.minConfidence).toBe(0.95)
    })

    it('requires at least 0.98 similarity (config 0.96 + buffer 0.02)', () => {
      const result = meetsAsymmetricRemapPolicy('generic_to_specific', 0.96, 0.97, config)
      expect(result.allowed).toBe(false)
      expect(result.minSimilarity).toBe(0.98)
    })

    it('allows when both thresholds are met', () => {
      const result = meetsAsymmetricRemapPolicy('generic_to_specific', 0.96, 0.98, config)
      expect(result.allowed).toBe(true)
    })
  })

  describe('specific_to_generic', () => {
    it('requires at least 0.90 confidence', () => {
      const result = meetsAsymmetricRemapPolicy('specific_to_generic', 0.89, 0.99, config)
      expect(result.allowed).toBe(false)
      expect(result.minConfidence).toBe(0.9)
    })

    it('requires at least 0.99 similarity (config 0.96 + buffer 0.03)', () => {
      const result = meetsAsymmetricRemapPolicy('specific_to_generic', 0.92, 0.98, config)
      expect(result.allowed).toBe(false)
      expect(result.minSimilarity).toBe(0.99)
    })

    it('allows when both thresholds are met', () => {
      const result = meetsAsymmetricRemapPolicy('specific_to_generic', 0.92, 0.99, config)
      expect(result.allowed).toBe(true)
    })
  })

  describe('lateral', () => {
    it('uses config doubleCheckMinConfidence directly', () => {
      const result = meetsAsymmetricRemapPolicy('lateral', 0.84, 0.97, config)
      expect(result.allowed).toBe(false)
      expect(result.minConfidence).toBe(0.85)
    })

    it('uses config doubleCheckMinSimilarity when above lateral floor (0.55)', () => {
      // config similarity 0.96 > lateral floor 0.55, so config wins
      const result = meetsAsymmetricRemapPolicy('lateral', 0.90, 0.95, config)
      expect(result.allowed).toBe(false)
      expect(result.minSimilarity).toBe(0.96)
    })

    it('falls back to lateral floor when config similarity is very low', () => {
      const lowConfig = { ...config, doubleCheckMinSimilarity: 0.3 } as QueueWorkerConfig
      const result = meetsAsymmetricRemapPolicy('lateral', 0.90, 0.60, lowConfig)
      expect(result.minSimilarity).toBe(0.55)
    })

    it('allows when both thresholds are met', () => {
      const result = meetsAsymmetricRemapPolicy('lateral', 0.90, 0.97, config)
      expect(result.allowed).toBe(true)
    })
  })

  it('returns threshold info even when disallowed', () => {
    const result = meetsAsymmetricRemapPolicy('generic_to_specific', 0.5, 0.5, config)
    expect(result).toHaveProperty('allowed', false)
    expect(result).toHaveProperty('minConfidence')
    expect(result).toHaveProperty('minSimilarity')
  })
})
