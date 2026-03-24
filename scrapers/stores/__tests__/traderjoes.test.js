// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// Disable retry delays — captured as constants at module load time
process.env.TRADERJOES_JINA_MAX_RETRIES = '0'
process.env.TRADERJOES_JINA_RETRY_DELAY_MS = '0'

// ─── Mock setup ───────────────────────────────────────────────────────────────

const mockFetchJinaReader = vi.fn()
const mockRequestOpenAIJson = vi.fn()
const mockHasConfiguredOpenAIKey = vi.fn(() => true)
const mockGetOpenAIApiKey = vi.fn(() => 'sk-test')

const patchCache = (id, exports) => {
  _require.cache[id] = { id, filename: id, loaded: true, exports }
}

patchCache(_require.resolve('../../utils/logger'), {
  createScraperLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
})
patchCache(_require.resolve('../../utils/runtime-config'), {
  withScraperTimeout: (promise) => promise,
})
patchCache(_require.resolve('../../utils/jina-client'), {
  fetchJinaReader: mockFetchJinaReader,
})
patchCache(_require.resolve('../../utils/llm-fallback'), {
  getOpenAIApiKey: mockGetOpenAIApiKey,
  hasConfiguredOpenAIKey: mockHasConfiguredOpenAIKey,
  requestOpenAIJson: mockRequestOpenAIJson,
})

// Reload per test — clears module-level result cache + rate-limit state
function loadModule() {
  delete _require.cache[_require.resolve('../traderjoes.js')]
  const m = _require('../traderjoes.js')
  return { searchTraderJoes: m.searchTraderJoes, searchTraderJoesBatch: m.searchTraderJoesBatch }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

// Build a markdown block in the exact format that parseProductsWithRegex expects:
//   ### [Name](product_url)
//   ![alt](image_url)[Category](category_url)$price/unit
function makeMarkdownBlock({
  name = 'Organic Whole Milk',
  productUrl = 'https://www.traderjoes.com/home/products/pdp/organic-whole-milk-75423',
  imageUrl = 'https://cdn.traderjoes.com/milk.jpg',
  categoryUrl = 'https://www.traderjoes.com/home/products/category/dairy',
  price = '4.99',
  unit = 'Half Gallon',
} = {}) {
  return (
    `### [${name}](${productUrl})\n` +
    `![img](${imageUrl})[Dairy](${categoryUrl})$${price}/${unit}`
  )
}

// A normalized product returned by the LLM (used for full-page LLM fallback tests)
function makeLLMProduct({
  product_name = 'Organic Whole Milk',
  price = 4.99,
  unit = 'Half Gallon',
  image_url = 'https://cdn.traderjoes.com/milk.jpg',
  id = '75423',
} = {}) {
  return { product_name, price, unit, image_url, id }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('searchTraderJoes', () => {
  let searchTraderJoes, searchTraderJoesBatch

  beforeEach(() => {
    delete process.env.TRADERJOES_CACHE_MAX_ENTRIES
    mockFetchJinaReader.mockReset()
    mockRequestOpenAIJson.mockReset()
    mockHasConfiguredOpenAIKey.mockReset()
    mockHasConfiguredOpenAIKey.mockReturnValue(true)
    mockGetOpenAIApiKey.mockReturnValue('sk-test')
    ;({ searchTraderJoes, searchTraderJoesBatch } = loadModule())
  })

  // ── Regex parsing (happy path) ──────────────────────────────────────────────

  it('returns normalized products parsed from markdown via regex', async () => {
    const markdown = makeMarkdownBlock()
    mockFetchJinaReader.mockResolvedValueOnce({ data: markdown })
    const results = await searchTraderJoes('milk', '94704')
    expect(results).toHaveLength(1)
    const item = results[0]
    expect(item.product_name).toBe('Organic Whole Milk Half Gallon')
    expect(item.title).toBe('Organic Whole Milk Half Gallon')
    expect(item.price).toBe(4.99)
    expect(item.unit).toBe('Half Gallon')
    expect(item.rawUnit).toBe('Half Gallon')
    expect(item.size).toBe('Half Gallon')
    expect(item.pricePerUnit).toBe('$4.99/Half Gallon')
    expect(item.price_per_unit).toBe('$4.99/Half Gallon')
    expect(item.product_id).toBe('75423')
    expect(item.id).toBe('75423')
    expect(item.image_url).toBe('https://cdn.traderjoes.com/milk.jpg')
    expect(item.provider).toBe("Trader Joe's")
    expect(item.location).toBe("Trader Joe's Store")
  })

  it('sorts results by price ascending', async () => {
    const markdown = [
      makeMarkdownBlock({ name: 'Expensive Milk', productUrl: 'https://www.traderjoes.com/home/products/pdp/exp-10001', price: '7.99', unit: '1 gal' }),
      makeMarkdownBlock({ name: 'Cheap Milk', productUrl: 'https://www.traderjoes.com/home/products/pdp/chp-10002', price: '2.99', unit: '1 qt' }),
      makeMarkdownBlock({ name: 'Mid Milk', productUrl: 'https://www.traderjoes.com/home/products/pdp/mid-10003', price: '4.99', unit: '1 pt' }),
    ].join('\n')
    mockFetchJinaReader.mockResolvedValueOnce({ data: markdown })
    const results = await searchTraderJoes('milk', '94704')
    expect(results.map((r) => r.price)).toEqual([2.99, 4.99, 7.99])
  })

  it('deduplicates products by id', async () => {
    const markdown = [
      makeMarkdownBlock({ name: 'Milk A', productUrl: 'https://www.traderjoes.com/home/products/pdp/dup-99999', price: '3.99', unit: '1 qt' }),
      makeMarkdownBlock({ name: 'Milk B', productUrl: 'https://www.traderjoes.com/home/products/pdp/dup-99999', price: '3.99', unit: '1 qt' }),
      makeMarkdownBlock({ name: 'Unique Milk', productUrl: 'https://www.traderjoes.com/home/products/pdp/uniq-11111', price: '4.99', unit: '1 gal' }),
    ].join('\n')
    mockFetchJinaReader.mockResolvedValueOnce({ data: markdown })
    const results = await searchTraderJoes('milk', '94704')
    expect(results).toHaveLength(2)
  })

  // ── Empty keyword ───────────────────────────────────────────────────────────

  it('returns [] for empty keyword', async () => {
    const results = await searchTraderJoes('', '94704')
    expect(results).toEqual([])
    expect(mockFetchJinaReader.mock.calls.length).toBe(0)
  })

  // ── Full-page LLM fallback ──────────────────────────────────────────────────

  it('falls back to full-page LLM when regex finds no products', async () => {
    mockFetchJinaReader.mockResolvedValueOnce({ data: 'no parseable product blocks here' })
    mockRequestOpenAIJson.mockResolvedValueOnce([makeLLMProduct()])
    const results = await searchTraderJoes('milk', '94704')
    expect(results).toHaveLength(1)
    expect(results[0].price).toBe(4.99)
    expect(results[0].provider).toBe("Trader Joe's")
  })

  it('returns [] when regex fails and LLM returns empty array', async () => {
    mockFetchJinaReader.mockResolvedValueOnce({ data: 'no products' })
    mockRequestOpenAIJson.mockResolvedValueOnce([])
    const results = await searchTraderJoes('milk', '94704')
    expect(results).toEqual([])
  })

  // ── Jina failures ───────────────────────────────────────────────────────────

  it('returns [] when jina returns null data', async () => {
    mockFetchJinaReader.mockResolvedValueOnce({ data: null })
    const results = await searchTraderJoes('milk', '94704')
    expect(results).toEqual([])
  })

  it('returns [] when jina throws a non-rate-limit error', async () => {
    mockFetchJinaReader.mockRejectedValue(new Error('Network timeout'))
    const results = await searchTraderJoes('milk', '94704')
    expect(results).toEqual([])
  })

  it('throws TJ_JINA_429 when jina returns 429', async () => {
    const rateLimitError = Object.assign(new Error('Rate limited'), { response: { status: 429, headers: {} } })
    mockFetchJinaReader.mockRejectedValue(rateLimitError)
    await expect(searchTraderJoes('milk', '94704')).rejects.toMatchObject({ code: 'TJ_JINA_429' })
  })

  // ─── searchTraderJoesBatch ──────────────────────────────────────────────────

  it('processes multiple keywords and returns array of results', async () => {
    // Two keywords: each gets a jina call + possibly LLM
    mockFetchJinaReader
      .mockResolvedValueOnce({ data: makeMarkdownBlock({ name: 'Milk', productUrl: 'https://www.traderjoes.com/home/products/pdp/milk-10001', price: '4.99', unit: '1 gal' }) })
      .mockResolvedValueOnce({ data: makeMarkdownBlock({ name: 'Bread', productUrl: 'https://www.traderjoes.com/home/products/pdp/bread-20001', price: '3.49', unit: '1 loaf' }) })
    const results = await searchTraderJoesBatch(['milk', 'bread'], '94704')
    expect(Array.isArray(results)).toBe(true)
    expect(results).toHaveLength(2)
    expect(Array.isArray(results[0])).toBe(true)
    expect(Array.isArray(results[1])).toBe(true)
  })

  it('returns [] for each keyword when jina fails in batch', async () => {
    mockFetchJinaReader.mockRejectedValue(new Error('Jina down'))
    const results = await searchTraderJoesBatch(['milk', 'bread'], '94704')
    expect(results).toEqual([[], []])
  })

  it('returns empty array for empty keywords list', async () => {
    const results = await searchTraderJoesBatch([], '94704')
    expect(results).toEqual([])
  })

  it('re-throws rate-limit error in batch to stop all workers', async () => {
    const rateLimitError = Object.assign(new Error('Rate limited'), { response: { status: 429, headers: {} } })
    mockFetchJinaReader.mockRejectedValue(rateLimitError)
    await expect(searchTraderJoesBatch(['milk', 'bread'], '94704')).rejects.toMatchObject({
      code: expect.stringMatching(/^TJ_JINA_/),
    })
  })

  it('evicts oldest cache entries after batch when cache exceeds size cap', async () => {
    process.env.TRADERJOES_CACHE_MAX_ENTRIES = '2'
    ;({ searchTraderJoes, searchTraderJoesBatch } = loadModule())

    mockFetchJinaReader
      .mockResolvedValueOnce({ data: makeMarkdownBlock({ name: 'Milk', productUrl: 'https://www.traderjoes.com/home/products/pdp/milk-10001', price: '4.99', unit: '1 gal' }) })
      .mockResolvedValueOnce({ data: makeMarkdownBlock({ name: 'Bread', productUrl: 'https://www.traderjoes.com/home/products/pdp/bread-20001', price: '3.49', unit: '1 loaf' }) })
      .mockResolvedValueOnce({ data: makeMarkdownBlock({ name: 'Eggs', productUrl: 'https://www.traderjoes.com/home/products/pdp/eggs-30001', price: '2.99', unit: '12 ct' }) })
      .mockResolvedValueOnce({ data: makeMarkdownBlock({ name: 'Milk Again', productUrl: 'https://www.traderjoes.com/home/products/pdp/milk-10001', price: '4.99', unit: '1 gal' }) })

    await searchTraderJoesBatch(['milk', 'bread'], '94704')
    await searchTraderJoesBatch(['eggs'], '94704')
    await searchTraderJoes('milk', '94704')

    expect(mockFetchJinaReader).toHaveBeenCalledTimes(4)
  })
})
