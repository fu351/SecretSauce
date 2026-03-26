// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// Disable retry delays and rate limiting — captured as constants at module load time
process.env.WALMART_MAX_RETRIES = '0'
process.env.WALMART_RETRY_DELAY_MS = '0'
process.env.WALMART_MIN_REQUEST_INTERVAL_MS = '0'
process.env.WALMART_REQUESTS_PER_SECOND = '1000'

// ─── Mock setup ───────────────────────────────────────────────────────────────

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockAxios = Object.assign(vi.fn(), { get: mockGet, post: mockPost })

const patchCache = (id, exports) => {
  _require.cache[id] = { id, filename: id, loaded: true, exports }
}

patchCache(_require.resolve('axios'), mockAxios)
patchCache(_require.resolve('../../utils/logger'), {
  createScraperLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
})
patchCache(_require.resolve('../../utils/runtime-config'), {
  withScraperTimeout: (promise) => promise,
})
patchCache(_require.resolve('../../utils/llm-fallback'), {
  getOpenAIApiKey: () => 'sk-test',
  hasConfiguredOpenAIKey: () => true,
  requestOpenAIJson: vi.fn(),
})

function loadModule() {
  delete _require.cache[_require.resolve('../walmart.js')]
  return _require('../walmart.js')
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeWalmartItem({
  usItemId = 'W001',
  title = 'Great Value Whole Milk',
  brand = 'Great Value',
  price = 2.98,
  thumbnailUrl = 'https://i5.walmartimages.com/milk.jpg',
  categoryName = 'Dairy',
} = {}) {
  return {
    usItemId,
    title,
    brand,
    priceInfo: { currentPrice: { price } },
    imageInfo: { thumbnailUrl },
    category: { name: categoryName },
  }
}

function makeReduxHtml(items = [makeWalmartItem()]) {
  const state = {
    search: {
      searchContent: {
        searchResult: {
          itemStacks: [{ items }],
        },
      },
    },
  }
  return `<script>window.__WML_REDUX_INITIAL_STATE__ = ${JSON.stringify(state)};</script>`
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('searchWalmartProducts', () => {
  let searchWalmartProducts

  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockAxios.mockReset()
    mockAxios.get = mockGet
    mockAxios.post = mockPost
    ;({ searchWalmartProducts } = loadModule())
  })

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns normalized products from Redux state in HTML', async () => {
    mockGet.mockResolvedValueOnce({ status: 200, data: makeReduxHtml() })
    const results = await searchWalmartProducts('milk', '94704')
    expect(results).toHaveLength(1)
    const item = results[0]
    expect(item.title).toBe('Great Value Whole Milk')
    expect(item.product_name).toBe('Great Value Whole Milk')
    expect(item.brand).toBe('Great Value')
    expect(item.price).toBe(2.98)
    expect(item.product_id).toBe('W001')
    expect(item.id).toBe('W001')
    expect(item.image_url).toBe('https://i5.walmartimages.com/milk.jpg')
    expect(item.provider).toBe('Walmart')
    expect(item.category).toBe('Dairy')
  })

  it('uses "Walmart (zipCode)" as location label', async () => {
    mockGet.mockResolvedValueOnce({ status: 200, data: makeReduxHtml() })
    const results = await searchWalmartProducts('milk', '94704')
    expect(results[0].location).toBe('Walmart (94704)')
  })

  it('preserves scraper result order', async () => {
    const items = [
      makeWalmartItem({ usItemId: 'W3', title: 'Expensive Milk', price: 6.99 }),
      makeWalmartItem({ usItemId: 'W1', title: 'Cheap Milk', price: 1.99 }),
      makeWalmartItem({ usItemId: 'W2', title: 'Mid Milk', price: 3.49 }),
    ]
    mockGet.mockResolvedValueOnce({ status: 200, data: makeReduxHtml(items) })
    const results = await searchWalmartProducts('milk', '94704')
    expect(results.map((r) => r.product_id)).toEqual(['W3', 'W1', 'W2'])
  })

  it('deduplicates products by usItemId', async () => {
    const items = [
      makeWalmartItem({ usItemId: 'DUP', title: 'Dup A', price: 2.99 }),
      makeWalmartItem({ usItemId: 'DUP', title: 'Dup B', price: 2.99 }),
      makeWalmartItem({ usItemId: 'UNQ', title: 'Unique', price: 4.99 }),
    ]
    mockGet.mockResolvedValueOnce({ status: 200, data: makeReduxHtml(items) })
    const results = await searchWalmartProducts('milk', '94704')
    const ids = results.map((r) => r.product_id)
    expect(ids.filter((id) => id === 'DUP')).toHaveLength(1)
    expect(ids).toContain('UNQ')
  })

  // ── Price variants ──────────────────────────────────────────────────────────

  it('reads price from priceInfo.currentPrice when it is a number', async () => {
    const item = { usItemId: 'W002', title: 'Milk', priceInfo: { currentPrice: 3.49 }, imageInfo: {} }
    mockGet.mockResolvedValueOnce({ status: 200, data: makeReduxHtml([item]) })
    const results = await searchWalmartProducts('milk', '94704')
    expect(results[0].price).toBe(3.49)
  })

  it('reads price from priceInfo.currentPrice.priceString when numeric fields are absent', async () => {
    const item = {
      usItemId: 'W003',
      title: 'Milk',
      priceInfo: { currentPrice: { priceString: '$4.29' } },
      imageInfo: {},
    }
    mockGet.mockResolvedValueOnce({ status: 200, data: makeReduxHtml([item]) })
    const results = await searchWalmartProducts('milk', '94704')
    expect(results[0].price).toBe(4.29)
  })

  // ── Filtering ───────────────────────────────────────────────────────────────

  it('filters out items with null or zero price', async () => {
    const items = [
      { usItemId: 'W010', title: 'Null Price Milk', priceInfo: { currentPrice: null }, imageInfo: {} },
      { usItemId: 'W011', title: 'Zero Price Milk', priceInfo: { currentPrice: 0 }, imageInfo: {} },
      makeWalmartItem({ usItemId: 'W012', price: 2.99 }),
    ]
    mockGet.mockResolvedValueOnce({ status: 200, data: makeReduxHtml(items) })
    const results = await searchWalmartProducts('milk', '94704')
    expect(results).toHaveLength(1)
    expect(results[0].product_id).toBe('W012')
  })

  it('filters out items with no title', async () => {
    const items = [
      { usItemId: 'W020', title: '', priceInfo: { currentPrice: 2.99 }, imageInfo: {} },
      makeWalmartItem({ usItemId: 'W021' }),
    ]
    mockGet.mockResolvedValueOnce({ status: 200, data: makeReduxHtml(items) })
    const results = await searchWalmartProducts('milk', '94704')
    expect(results).toHaveLength(1)
    expect(results[0].product_id).toBe('W021')
  })

  // ── HTML fetch failures ─────────────────────────────────────────────────────

  it('returns [] when axios.get throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'))
    const results = await searchWalmartProducts('milk', '94704')
    expect(results).toEqual([])
  })

  it('returns [] when HTML has no Redux state marker', async () => {
    mockGet.mockResolvedValueOnce({ status: 200, data: '<html><body>No state here</body></html>' })
    const results = await searchWalmartProducts('milk', '94704')
    expect(results).toEqual([])
  })

  it('returns [] when response status is not 200', async () => {
    mockGet.mockResolvedValueOnce({ status: 500, data: '' })
    const results = await searchWalmartProducts('milk', '94704')
    expect(results).toEqual([])
  })

  it('returns [] when itemStacks is empty', async () => {
    mockGet.mockResolvedValueOnce({ status: 200, data: makeReduxHtml([]) })
    const results = await searchWalmartProducts('milk', '94704')
    expect(results).toEqual([])
  })
})
