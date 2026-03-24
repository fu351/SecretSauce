// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// ─── Mock setup (must happen before loading source file) ─────────────────────

const mockPost = vi.fn()
const mockGet = vi.fn()
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

function loadModule() {
  delete _require.cache[_require.resolve('../kroger.js')]
  return _require('../kroger.js').Krogers
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_TOKEN = 'test-access-token'

const MOCK_LOCATION = {
  locationId: 'LOC001',
  name: 'Kroger Lafayette',
  address: {
    addressLine1: '3500 State Rd 38 E',
    city: 'Lafayette',
    state: 'IN',
    zipCode: '47905',
  },
}

function makeProduct({
  productId = 'P001',
  description = 'Organic Whole Milk',
  brand = 'Kroger Brand',
  categories = ['Dairy'],
  regular = 4.99,
  promo = null,
  size = '1 gal',
  itemId = 'I001',
  imageUrl = 'https://img.kroger.com/thumb.jpg',
  stockLevel = 'HIGH',
} = {}) {
  return {
    productId,
    description,
    brand,
    categories,
    images: [
      {
        perspective: 'front',
        sizes: [
          { size: 'thumbnail', url: imageUrl },
          { size: 'medium', url: 'https://img.kroger.com/medium.jpg' },
        ],
      },
    ],
    items: [
      {
        itemId,
        size,
        price: { regular, promo },
        inventory: { stockLevel },
      },
    ],
  }
}

function setupHappyPath(products = [makeProduct()]) {
  mockPost.mockResolvedValueOnce({ data: { access_token: MOCK_TOKEN } })
  mockGet
    .mockResolvedValueOnce({ data: { data: [MOCK_LOCATION] } })
    .mockResolvedValueOnce({ data: { data: products } })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Krogers', () => {
  let Krogers

  beforeEach(() => {
    process.env.KROGER_CLIENT_ID = 'test-client-id'
    process.env.KROGER_CLIENT_SECRET = 'test-client-secret'
    mockPost.mockReset()
    mockGet.mockReset()
    mockAxios.mockReset()
    Krogers = loadModule()
  })

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns normalized products on happy path', async () => {
    setupHappyPath()
    const results = await Krogers('47905', 'milk')
    expect(results).toHaveLength(1)
    const item = results[0]
    expect(item.product_name).toBe('Organic Whole Milk')
    expect(item.title).toBe('Organic Whole Milk')
    expect(item.brand).toBe('Kroger Brand')
    expect(item.price).toBe(4.99)
    expect(item.unit).toBe('1 gal')
    expect(item.rawUnit).toBe('1 gal')
    expect(item.provider).toBe('Kroger')
    expect(item.product_id).toBe('I001')
    expect(item.id).toBe('I001')
    expect(item.image_url).toBe('https://img.kroger.com/thumb.jpg')
  })

  it('attaches store location label from resolved address', async () => {
    setupHappyPath()
    const results = await Krogers('47905', 'milk')
    expect(results[0].location).toBe('3500 State Rd 38 E, Lafayette, IN, 47905')
  })

  it('uses the first nearby Kroger store and passes its locationId into product search', async () => {
    mockPost.mockResolvedValueOnce({ data: { access_token: MOCK_TOKEN } })
    mockGet
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              locationId: 'FIRST',
              name: 'First Kroger',
              address: { addressLine1: '1 First St', city: 'Lafayette', state: 'IN', zipCode: '47905' },
            },
            {
              locationId: 'SECOND',
              name: 'Second Kroger',
              address: { addressLine1: '2 Second St', city: 'Lafayette', state: 'IN', zipCode: '47905' },
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { data: [makeProduct()] } })

    const results = await Krogers('47905', 'milk')

    expect(results[0].location).toBe('1 First St, Lafayette, IN, 47905')
    expect(mockGet.mock.calls[1][1].params['filter.locationId']).toBe('FIRST')
  })

  it('requests only one nearby Kroger store for the provided zip code', async () => {
    setupHappyPath()

    await Krogers('47905', 'milk')

    const locationsCall = mockGet.mock.calls[0]
    expect(locationsCall[1].params['filter.zipCode.near']).toBe('47905')
    expect(locationsCall[1].params['filter.limit']).toBe(1)
  })

  it('falls back to city/state label when no addressLine1', async () => {
    mockPost.mockResolvedValueOnce({ data: { access_token: MOCK_TOKEN } })
    mockGet
      .mockResolvedValueOnce({
        data: {
          data: [
            { locationId: 'LOC002', name: 'Kroger Store', address: { city: 'Indianapolis', state: 'IN' } },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { data: [makeProduct()] } })
    const results = await Krogers('46201', 'milk')
    expect(results[0].location).toBe('Indianapolis, IN')
  })

  it('calculates pricePerUnit correctly', async () => {
    setupHappyPath([makeProduct({ regular: 4.99, size: '0.5 gal' })])
    const results = await Krogers('47905', 'milk')
    // price / numericSize = 4.99 / 0.5 = 9.98
    expect(results[0].pricePerUnit).toBe('9.98')
  })

  it('sets pricePerUnit to null when size is non-numeric', async () => {
    setupHappyPath([makeProduct({ regular: 2.99, size: 'each' })])
    const results = await Krogers('47905', 'eggs')
    expect(results[0].pricePerUnit).toBeNull()
  })

  it('uses promo price over regular price', async () => {
    setupHappyPath([makeProduct({ regular: 4.99, promo: 3.49 })])
    const results = await Krogers('47905', 'milk')
    expect(results[0].price).toBe(3.49)
  })

  it('preserves upstream product order', async () => {
    setupHappyPath([
      makeProduct({ productId: 'P3', itemId: 'I3', description: 'Expensive Milk', regular: 6.99 }),
      makeProduct({ productId: 'P1', itemId: 'I1', description: 'Cheap Milk', regular: 2.99 }),
      makeProduct({ productId: 'P2', itemId: 'I2', description: 'Mid Milk', regular: 4.49 }),
    ])
    const results = await Krogers('47905', 'milk')
    expect(results.map((r) => r.id)).toEqual(['I3', 'I1', 'I2'])
  })

  it('filters out products with no price', async () => {
    setupHappyPath([
      makeProduct({ description: 'No Price Milk', regular: null, promo: null }),
      makeProduct({ productId: 'P2', itemId: 'I2', description: 'Priced Milk', regular: 3.99 }),
    ])
    const results = await Krogers('47905', 'milk')
    expect(results).toHaveLength(1)
    expect(results[0].product_name).toBe('Priced Milk')
  })

  it('filters out items that are TEMPORARILY_OUT_OF_STOCK, falls back to next', async () => {
    const product = makeProduct({ regular: 3.99 })
    product.items[0].inventory.stockLevel = 'TEMPORARILY_OUT_OF_STOCK'
    product.items.push({
      itemId: 'I002',
      size: '2 gal',
      price: { regular: 7.99, promo: null },
      inventory: { stockLevel: 'HIGH' },
    })
    setupHappyPath([product])
    const results = await Krogers('47905', 'milk')
    expect(results[0].price).toBe(7.99)
  })

  it('uses front image thumbnail URL', async () => {
    const product = makeProduct()
    product.images = [
      {
        perspective: 'back',
        sizes: [{ size: 'thumbnail', url: 'https://img.kroger.com/back.jpg' }],
      },
      {
        perspective: 'front',
        sizes: [
          { size: 'medium', url: 'https://img.kroger.com/front-medium.jpg' },
          { size: 'thumbnail', url: 'https://img.kroger.com/front-thumb.jpg' },
        ],
      },
    ]
    setupHappyPath([product])
    const results = await Krogers('47905', 'milk')
    expect(results[0].image_url).toBe('https://img.kroger.com/front-thumb.jpg')
  })

  // ── Auth failures ───────────────────────────────────────────────────────────

  it('returns [] when auth token request fails', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'))
    const results = await Krogers('47905', 'milk')
    expect(results).toEqual([])
  })

  it('reuses a cached auth token across subsequent searches in the same module instance', async () => {
    mockPost.mockResolvedValueOnce({ data: { access_token: MOCK_TOKEN, expires_in: 1800 } })
    mockGet
      .mockResolvedValueOnce({ data: { data: [MOCK_LOCATION] } })
      .mockResolvedValueOnce({ data: { data: [makeProduct({ itemId: 'I1', description: 'Milk' })] } })
      .mockResolvedValueOnce({ data: { data: [MOCK_LOCATION] } })
      .mockResolvedValueOnce({ data: { data: [makeProduct({ itemId: 'I2', description: 'Bread' })] } })

    const milkResults = await Krogers('47905', 'milk')
    const breadResults = await Krogers('47905', 'bread')

    expect(milkResults[0].id).toBe('I1')
    expect(breadResults[0].id).toBe('I2')
    expect(mockPost).toHaveBeenCalledTimes(1)
  })

  it('throws a fatal Kroger auth-blocked error when the token endpoint returns Access Denied HTML', async () => {
    const authError = new Error('Request failed with status code 403')
    authError.response = {
      status: 403,
      data: '<html><title>Access Denied</title><body>Access Denied Reference #18.abc</body></html>',
    }
    mockPost.mockRejectedValueOnce(authError)

    await expect(Krogers('47905', 'milk')).rejects.toMatchObject({
      code: 'KROGER_AUTH_BLOCKED',
    })
  })

  it('returns [] when auth response has no access_token', async () => {
    mockPost.mockResolvedValueOnce({ data: {} })
    const results = await Krogers('47905', 'milk')
    expect(results).toEqual([])
  })

  // ── Missing search term ─────────────────────────────────────────────────────

  it('returns [] when searchTerm is empty', async () => {
    mockPost.mockResolvedValueOnce({ data: { access_token: MOCK_TOKEN } })
    const results = await Krogers('47905', '')
    expect(results).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('returns [] when searchTerm is whitespace', async () => {
    mockPost.mockResolvedValueOnce({ data: { access_token: MOCK_TOKEN } })
    const results = await Krogers('47905', '   ')
    expect(results).toEqual([])
  })

  // ── Location failures ───────────────────────────────────────────────────────

  it('returns [] when location lookup fails', async () => {
    mockPost.mockResolvedValueOnce({ data: { access_token: MOCK_TOKEN } })
    mockGet.mockRejectedValueOnce(new Error('Location error'))
    const results = await Krogers('47905', 'milk')
    expect(results).toEqual([])
  })

  it('returns [] when location response has empty data array', async () => {
    mockPost.mockResolvedValueOnce({ data: { access_token: MOCK_TOKEN } })
    mockGet.mockResolvedValueOnce({ data: { data: [] } })
    const results = await Krogers('47905', 'milk')
    expect(results).toEqual([])
  })

  it('returns [] when location has no locationId', async () => {
    mockPost.mockResolvedValueOnce({ data: { access_token: MOCK_TOKEN } })
    mockGet.mockResolvedValueOnce({
      data: { data: [{ name: 'No ID Store', address: {} }] },
    })
    const results = await Krogers('47905', 'milk')
    expect(results).toEqual([])
  })

  // ── Product failures ────────────────────────────────────────────────────────

  it('returns [] when products request fails', async () => {
    mockPost.mockResolvedValueOnce({ data: { access_token: MOCK_TOKEN } })
    mockGet
      .mockResolvedValueOnce({ data: { data: [MOCK_LOCATION] } })
      .mockRejectedValueOnce(new Error('Products error'))
    const results = await Krogers('47905', 'milk')
    expect(results).toEqual([])
  })

  it('returns [] when products response is empty', async () => {
    setupHappyPath([])
    const results = await Krogers('47905', 'milk')
    expect(results).toEqual([])
  })

  it('returns [] when all products lack a valid price', async () => {
    setupHappyPath([
      makeProduct({ regular: null, promo: null }),
      makeProduct({ productId: 'P2', itemId: 'I2', regular: 0 }),
    ])
    const results = await Krogers('47905', 'milk')
    expect(results).toEqual([])
  })

  // ── Default args ────────────────────────────────────────────────────────────

  it('uses default zip 47906 when not provided', async () => {
    setupHappyPath()
    await Krogers(undefined, 'milk')
    const locationsCall = mockGet.mock.calls[0]
    expect(locationsCall[1].params['filter.zipCode.near']).toBe(47906)
  })
})
