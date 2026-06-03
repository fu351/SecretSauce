// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

const patchCache = (id, exports) => {
  _require.cache[id] = { id, filename: id, loaded: true, exports }
}

patchCache(_require.resolve('../../utils/logger'), {
  createScraperLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
})

// Safeway now delegates to the shared Instacart ScrapeGraphAI scraper; stub it
// so this test verifies the delegation contract, not the scraper internals.
const searchInstacartStore = vi.fn()
patchCache(_require.resolve('../instacart-scrapegraph.js'), { searchInstacartStore })

delete _require.cache[_require.resolve('../safeway.js')]
const { searchSafeway } = _require('../safeway.js')

describe('searchSafeway', () => {
  beforeEach(() => searchInstacartStore.mockReset())

  it('delegates to the Instacart ScrapeGraphAI scraper with store "Safeway"', async () => {
    searchInstacartStore.mockResolvedValue([{ title: 'Oat Milk', price: 3.99, provider: 'Safeway' }])

    const results = await searchSafeway('oat milk', '94704')

    expect(searchInstacartStore).toHaveBeenCalledWith(
      'oat milk',
      '94704',
      expect.objectContaining({ store: 'Safeway' })
    )
    expect(results).toEqual([{ title: 'Oat Milk', price: 3.99, provider: 'Safeway' }])
  })

  it('propagates an empty result (e.g. missing API key) as []', async () => {
    searchInstacartStore.mockResolvedValue([])
    const results = await searchSafeway('pasta', '98101')
    expect(results).toEqual([])
  })
})
