// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// Disable retry delays — captured as constants at module load time
process.env.JINA_MAX_RETRIES = '0'
process.env.JINA_RETRY_DELAY_MS = '0'

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
patchCache(_require.resolve('../../utils/jina/client'), {
  fetchJinaReader: mockFetchJinaReader,
})
patchCache(_require.resolve('../../utils/jina/llm-fallback'), {
  getOpenAIApiKey: mockGetOpenAIApiKey,
  hasConfiguredOpenAIKey: mockHasConfiguredOpenAIKey,
  requestOpenAIJson: mockRequestOpenAIJson,
})

function loadModule() {
  delete _require.cache[_require.resolve('../aldi.js')]
  return _require('../aldi.js').searchAldi
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeProduct({
  title = 'Organic Whole Milk',
  brand = 'ALDI',
  price = 3.99,
  image_url = 'https://aldi.com/img.jpg',
  id = 'aldi-001',
} = {}) {
  return { title, brand, price, image_url, id }
}

function setupHappyPath(products = [makeProduct()]) {
  mockFetchJinaReader.mockResolvedValueOnce({ data: 'page content here' })
  mockRequestOpenAIJson.mockResolvedValueOnce(products)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('searchAldi', () => {
  let searchAldi

  beforeEach(() => {
    mockFetchJinaReader.mockReset()
    mockRequestOpenAIJson.mockReset()
    mockHasConfiguredOpenAIKey.mockReset()
    mockHasConfiguredOpenAIKey.mockReturnValue(true)
    mockGetOpenAIApiKey.mockReturnValue('sk-test')
    searchAldi = loadModule()
  })

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns normalized products on happy path', async () => {
    setupHappyPath()
    const results = await searchAldi('milk', '94704')
    expect(results).toHaveLength(1)
    const item = results[0]
    expect(item.title).toBe('Organic Whole Milk')
    expect(item.brand).toBe('ALDI')
    expect(item.price).toBe(3.99)
    expect(item.image_url).toBe('https://aldi.com/img.jpg')
    expect(item.id).toBe('aldi-001')
    expect(item.provider).toBe('Aldi')
    expect(item.location).toBe('Aldi Grocery')
    expect(item.category).toBe('Grocery')
    expect(item.pricePerUnit).toBe('')
    expect(item.unit).toBe('')
    expect(item.rawUnit).toBe('')
  })

  it('assigns random aldi- prefixed id when product has no id', async () => {
    mockFetchJinaReader.mockResolvedValueOnce({ data: 'content' })
    mockRequestOpenAIJson.mockResolvedValueOnce([{ title: 'Milk', brand: 'ALDI', price: 3.99 }])
    const results = await searchAldi('milk', '94704')
    expect(results[0].id).toMatch(/^aldi-/)
  })

  it('preserves scraper result order', async () => {
    setupHappyPath([
      makeProduct({ title: 'Expensive', price: 8.99, id: 'e1' }),
      makeProduct({ title: 'Cheap', price: 2.99, id: 'c1' }),
      makeProduct({ title: 'Mid', price: 4.99, id: 'm1' }),
    ])
    const results = await searchAldi('milk', '94704')
    expect(results.map((r) => r.id)).toEqual(['e1', 'c1', 'm1'])
  })

  it('does not cap results in the scraper', async () => {
    const products = Array.from({ length: 8 }, (_, i) =>
      makeProduct({ title: `Milk ${i}`, price: i + 1, id: `p${i}` })
    )
    setupHappyPath(products)
    const results = await searchAldi('milk', '94704')
    expect(results).toHaveLength(8)
  })

  it('uses /placeholder.svg when product has no image_url', async () => {
    mockFetchJinaReader.mockResolvedValueOnce({ data: 'content' })
    mockRequestOpenAIJson.mockResolvedValueOnce([{ title: 'Milk', brand: 'ALDI', price: 3.99, id: 'p1' }])
    const results = await searchAldi('milk', '94704')
    expect(results[0].image_url).toBe('/placeholder.svg')
  })

  // ── Filtering ───────────────────────────────────────────────────────────────

  it('filters out products with no title', async () => {
    setupHappyPath([
      { title: '', brand: 'ALDI', price: 3.99, id: 'p1' },
      makeProduct({ id: 'p2' }),
    ])
    const results = await searchAldi('milk', '94704')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('p2')
  })

  it('filters out products with zero or negative price', async () => {
    setupHappyPath([
      makeProduct({ price: 0, id: 'p1' }),
      makeProduct({ price: -1, id: 'p2' }),
      makeProduct({ price: 4.99, id: 'p3' }),
    ])
    const results = await searchAldi('milk', '94704')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('p3')
  })

  // ── Jina failures ───────────────────────────────────────────────────────────

  it('returns [] when jina returns no data', async () => {
    mockFetchJinaReader.mockResolvedValueOnce({ data: null })
    const results = await searchAldi('milk', '94704')
    expect(results).toEqual([])
  })

  it('returns [] when jina fetch throws', async () => {
    mockFetchJinaReader.mockRejectedValue(new Error('Jina down'))
    const results = await searchAldi('milk', '94704')
    expect(results).toEqual([])
  })

  // ── LLM failures ────────────────────────────────────────────────────────────

  it('returns [] when LLM returns non-array', async () => {
    mockFetchJinaReader.mockResolvedValueOnce({ data: 'content' })
    mockRequestOpenAIJson.mockResolvedValueOnce({ error: 'bad response' })
    const results = await searchAldi('milk', '94704')
    expect(results).toEqual([])
  })

  it('returns [] when LLM returns empty array', async () => {
    setupHappyPath([])
    const results = await searchAldi('milk', '94704')
    expect(results).toEqual([])
  })

  it('returns [] when OpenAI key is not configured', async () => {
    mockFetchJinaReader.mockResolvedValueOnce({ data: 'content' })
    mockHasConfiguredOpenAIKey.mockReturnValue(false)
    const results = await searchAldi('milk', '94704')
    expect(results).toEqual([])
    expect(mockRequestOpenAIJson.mock.calls.length).toBe(0)
  })
})
