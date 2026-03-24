// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// ─── Mock setup (must happen before loading source file) ─────────────────────

// mockAxios is callable (for axios(config)) AND has .get / .post methods
const mockGet = vi.fn()
const mockAxios = Object.assign(vi.fn(), { get: mockGet })

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

function loadModule() {
  delete _require.cache[_require.resolve('../meijer.js')]
  return _require('../meijer.js').Meijers
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_STORE = {
  name: '319',
  displayName: 'Lansing',
  address: {
    line1: '5100 W Saginaw Hwy',
    region: { isocode: 'US-MI' },
    postalCode: '48917',
  },
}

function makeLocationResponse(stores = [MOCK_STORE]) {
  return { pointsOfService: stores }
}

function makeProduct({
  value = 'Whole Milk',
  matchedTerms = ['milk'],
  id = 'M001',
  description = 'whole milk 1 gallon',
  price = 3.99,
  productUnit = 'Each',
  imageUrl = 'https://img.meijer.com/milk.jpg',
} = {}) {
  return {
    value,
    matched_terms: matchedTerms,
    data: { id, description, price, productUnit, image_url: imageUrl },
  }
}

function makeProductsResponse(results = [makeProduct()]) {
  return { data: { response: { results } } }
}

// Location call uses axios(config) → mockAxios
// Products call uses axios.get(url, config) → mockGet

function setupHappyPath(products) {
  mockAxios.mockResolvedValueOnce({ data: makeLocationResponse() })
  mockGet.mockResolvedValueOnce(makeProductsResponse(products))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Meijers', () => {
  let Meijers

  beforeEach(() => {
    mockAxios.mockReset()
    mockGet.mockReset()
    // Restore .get after reset (reset doesn't delete properties)
    mockAxios.get = mockGet
    Meijers = loadModule()
  })

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns normalized products on happy path', async () => {
    setupHappyPath()
    const results = await Meijers('47906', 'milk')
    expect(results).toHaveLength(1)
    const item = results[0]
    expect(item.id).toBe('M001')
    expect(item.name).toBe('Whole Milk')
    expect(item.description).toBe('whole milk 1 gallon')
    expect(item.price).toBe(3.99)
    expect(item.unit).toBe('Each')
    expect(item.rawUnit).toBe('Each')
    expect(item.provider).toBe('Meijer')
    expect(item.image_url).toBe('https://img.meijer.com/milk.jpg')
    expect(item.brand).toBe('N/A')
    expect(item.pricePerUnit).toBe('N/A')
  })

  it('includes location label from resolved store', async () => {
    setupHappyPath()
    const results = await Meijers('47906', 'milk')
    expect(results[0].location).toContain('Lansing')
  })

  it('sorts results by price ascending', async () => {
    setupHappyPath([
      makeProduct({ id: 'P3', description: 'expensive milk', value: 'Expensive Milk', price: 6.99 }),
      makeProduct({ id: 'P1', description: 'cheap milk', value: 'Cheap Milk', price: 1.99 }),
      makeProduct({ id: 'P2', description: 'mid milk', value: 'Mid Milk', price: 4.49 }),
    ])
    const results = await Meijers('47906', 'milk')
    expect(results.map((r) => r.price)).toEqual([1.99, 4.49, 6.99])
  })

  it('limits results to 10 items', async () => {
    const products = Array.from({ length: 15 }, (_, i) =>
      makeProduct({ id: `P${i}`, description: `milk ${i}`, value: `Milk ${i}`, price: i + 1 })
    )
    setupHappyPath(products)
    const results = await Meijers('47906', 'milk')
    expect(results).toHaveLength(10)
  })

  // ── Filtering ───────────────────────────────────────────────────────────────

  it('filters out products with no matched_terms', async () => {
    setupHappyPath([
      makeProduct({ matchedTerms: [] }),
      makeProduct({ id: 'M002', description: 'whole milk gallon', matchedTerms: ['milk'] }),
    ])
    const results = await Meijers('47906', 'milk')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('M002')
  })

  it("filters out products whose description doesn't contain the search term", async () => {
    setupHappyPath([
      makeProduct({ description: 'orange juice', matchedTerms: ['orange'] }),
      makeProduct({ id: 'M002', description: 'whole milk gallon', matchedTerms: ['milk'] }),
    ])
    const results = await Meijers('47906', 'milk')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('M002')
  })

  it('filters out products with null price', async () => {
    setupHappyPath([
      makeProduct({ price: null }),
      makeProduct({ id: 'M002', description: 'whole milk', price: 3.49 }),
    ])
    const results = await Meijers('47906', 'milk')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('M002')
  })

  it('returns [] when all products are filtered out', async () => {
    setupHappyPath([makeProduct({ matchedTerms: [] })])
    const results = await Meijers('47906', 'milk')
    expect(results).toEqual([])
  })

  it('returns [] when products response is empty', async () => {
    setupHappyPath([])
    const results = await Meijers('47906', 'milk')
    expect(results).toEqual([])
  })

  // ── Location fallback ───────────────────────────────────────────────────────

  it('uses default store ID when location lookup throws', async () => {
    mockAxios.mockRejectedValueOnce(new Error('Location unavailable'))
    mockGet.mockResolvedValueOnce(makeProductsResponse())
    const results = await Meijers('47906', 'milk')
    expect(results).toHaveLength(1)
    const productsCall = mockGet.mock.calls[0]
    expect(productsCall[1].params['filters[availableInStores]']).toBe(319)
  })

  it('falls back to "Meijer (zip)" location label when store not found', async () => {
    mockAxios.mockRejectedValueOnce(new Error('Location unavailable'))
    mockGet.mockResolvedValueOnce(makeProductsResponse())
    const results = await Meijers('47906', 'milk')
    expect(results[0].location).toBe('Meijer (47906)')
  })

  it('falls back to "Meijer (zip)" when location response has no stores', async () => {
    mockAxios.mockResolvedValueOnce({ data: {} })
    mockGet.mockResolvedValueOnce(makeProductsResponse())
    const results = await Meijers('47906', 'milk')
    expect(results[0].location).toBe('Meijer (47906)')
  })

  // ── Product fetch error ─────────────────────────────────────────────────────

  it('throws when products request fails', async () => {
    mockAxios.mockResolvedValueOnce({ data: makeLocationResponse() })
    mockGet.mockRejectedValueOnce(new Error('Constructor API down'))
    await expect(Meijers('47906', 'milk')).rejects.toThrow('Failed to fetch products from Meijer')
  })

  // ── Location response formats ───────────────────────────────────────────────

  it('parses stores from pointsOfService array', async () => {
    const store = {
      name: '42',
      displayName: 'Grand Rapids',
      address: { line1: '1234 Main St', region: { isocode: 'US-MI' }, postalCode: '49503' },
    }
    mockAxios.mockResolvedValueOnce({ data: { pointsOfService: [store] } })
    mockGet.mockResolvedValueOnce(makeProductsResponse())
    const results = await Meijers('49503', 'milk')
    expect(results[0].location).toContain('Grand Rapids')
    const productsCall = mockGet.mock.calls[0]
    expect(productsCall[1].params['filters[availableInStores]']).toBe('42')
  })

  it('parses stores from top-level array response', async () => {
    const store = {
      name: '55',
      displayName: 'Kalamazoo',
      address: { line1: '5 Commerce Blvd', region: { isocode: 'US-MI' }, postalCode: '49009' },
    }
    mockAxios.mockResolvedValueOnce({ data: [store] })
    mockGet.mockResolvedValueOnce(makeProductsResponse())
    const results = await Meijers('49009', 'milk')
    const productsCall = mockGet.mock.calls[0]
    expect(productsCall[1].params['filters[availableInStores]']).toBe('55')
  })

  // ── Default args ────────────────────────────────────────────────────────────

  it('uses default zip 47906 when none provided', async () => {
    mockAxios.mockRejectedValueOnce(new Error('skip location'))
    mockGet.mockResolvedValueOnce(makeProductsResponse())
    const results = await Meijers(undefined, 'milk')
    expect(Array.isArray(results)).toBe(true)
  })
})
