// @vitest-environment node
import { vi, describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

const patchCache = (id, exports) => {
  _require.cache[id] = { id, filename: id, loaded: true, exports }
}

patchCache(_require.resolve('axios'), Object.assign(vi.fn(), { get: vi.fn(), post: vi.fn() }))
patchCache(_require.resolve('../../utils/logger'), {
  createScraperLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
})
patchCache(_require.resolve('../../utils/runtime-config'), {
  withScraperTimeout: (promise) => promise,
})

delete _require.cache[_require.resolve('../andronicos.js')]
const { searchAndronicos } = _require('../andronicos.js')

describe('searchAndronicos', () => {
  it('always returns [] (no public API)', async () => {
    const results = await searchAndronicos('milk', '94704')
    expect(results).toEqual([])
  })

  it('returns [] for any keyword/zip combination', async () => {
    const results = await searchAndronicos('bread', '10001')
    expect(results).toEqual([])
  })
})
