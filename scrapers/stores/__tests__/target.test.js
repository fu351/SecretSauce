// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// ─── Mock setup ───────────────────────────────────────────────────────────────

const mockGet = vi.fn()
const mockAxios = Object.assign(vi.fn(), { get: mockGet })
const mockLogHttpErrorToDatabase = vi.fn()

const patchCache = (id, exports) => {
  _require.cache[id] = { id, filename: id, loaded: true, exports }
}

patchCache(_require.resolve('axios'), mockAxios)
patchCache(_require.resolve('../../utils/logger'), {
  createScraperLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    isDebugEnabled: false,
  }),
})
patchCache(_require.resolve('../../utils/runtime-config'), {
  withScraperTimeout: (promise) => promise,
})
patchCache(_require.resolve('../../utils/db-error-logger'), {
  logHttpErrorToDatabase: mockLogHttpErrorToDatabase,
})
patchCache(_require.resolve('he'), {
  decode: (str) => str, // passthrough – no HTML entities in test data
})

// Reload function — called in beforeEach to get a fresh module (clears module-level caches)
function loadTargetModule() {
  delete _require.cache[_require.resolve('../target.js')]
  return _require('../target.js').getTargetProducts
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_STORE = {
  store_id: 'T001',
  location_name: 'Target Berkeley',
  mailing_address: { address_line1: '2352 Shattuck Ave', city: 'Berkeley', region: 'CA', postal_code: '94704' },
}

function makeStoreResponse(stores = [MOCK_STORE]) {
  return { data: { data: { nearby_stores: { stores } } } }
}

function makeProduct({
  tcin = 'TCIN001',
  title = 'Whole Milk 1 Gallon',
  brand = 'Good & Gather',
  price = 4.99,
  pricePerUnit = '$0.04/fl oz',
  unitSuffix = '/fl oz',
  imageUrl = 'https://target.scene7.com/milk.jpg',
  category = 'Dairy',
} = {}) {
  return {
    tcin,
    price: { current_retail: price, formatted_unit_price: pricePerUnit, formatted_unit_price_suffix: unitSuffix },
    item: {
      product_description: { title },
      primary_brand: { name: brand },
      enrichment: { images: { primary_image_url: imageUrl } },
      product_classification: { item_type: { name: category } },
    },
  }
}

function makeProductsResponse(products = [makeProduct()]) {
  return { status: 200, data: { data: { search: { products } } } }
}

function setupHappyPath(products) {
  mockGet
    .mockResolvedValueOnce(makeStoreResponse())
    .mockResolvedValueOnce(makeProductsResponse(products))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getTargetProducts', () => {
  let getTargetProducts

  beforeEach(() => {
    mockGet.mockReset()
    mockAxios.mockReset()
    mockAxios.get = mockGet
    mockLogHttpErrorToDatabase.mockReset()
    getTargetProducts = loadTargetModule()
  })

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns normalized products on happy path', async () => {
    setupHappyPath()
    const results = await getTargetProducts('milk', null, '94704')
    expect(results).toHaveLength(1)
    const item = results[0]
    expect(item.product_name).toBe('Whole Milk 1 Gallon')
    expect(item.title).toBe('Whole Milk 1 Gallon')
    expect(item.brand).toBe('Good & Gather')
    expect(item.price).toBe(4.99)
    expect(item.pricePerUnit).toBe('$0.04/fl oz')
    expect(item.unit).toBe('/fl oz')
    expect(item.rawUnit).toBe('/fl oz')
    expect(item.provider).toBe('Target')
    expect(item.product_id).toBe('TCIN001')
    expect(item.id).toBe('TCIN001')
    expect(item.image_url).toBe('https://target.scene7.com/milk.jpg')
    expect(item.category).toBe('Dairy')
    expect(item.target_store_id).toBe('T001')
  })

  it('attaches store location from resolved address', async () => {
    setupHappyPath()
    const results = await getTargetProducts('milk', null, '94704')
    expect(results[0].location).toBe('2352 Shattuck Ave, Berkeley, CA, 94704')
  })

  it('skips store lookup when storeMetadata with target_store_id is provided', async () => {
    const metadata = { target_store_id: 'T999', fullAddress: '1 Main St, Oakland, CA, 94601' }
    mockGet.mockResolvedValueOnce(makeProductsResponse())
    const results = await getTargetProducts('milk', metadata, '94601')
    expect(results).toHaveLength(1)
    // Only one GET call (no store lookup)
    expect(mockGet.mock.calls.length).toBe(1)
    expect(results[0].target_store_id).toBe('T999')
  })

  it('reuses cached nearest-store lookup for subsequent searches in the same zip', async () => {
    mockGet
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce(makeProductsResponse([makeProduct({ tcin: 'P1', title: 'Milk' })]))
      .mockResolvedValueOnce(makeProductsResponse([makeProduct({ tcin: 'P2', title: 'Bread' })]))

    const milkResults = await getTargetProducts('milk', null, '94704')
    const breadResults = await getTargetProducts('bread', null, '94704')

    expect(milkResults[0].target_store_id).toBe('T001')
    expect(breadResults[0].target_store_id).toBe('T001')
    expect(mockGet).toHaveBeenCalledTimes(3)
  })

  it('uses the first nearby store returned by Target store lookup', async () => {
    mockGet
      .mockResolvedValueOnce(makeStoreResponse([
        {
          store_id: 'T100',
          location_name: 'Target First',
          mailing_address: { address_line1: '1 First St', city: 'Berkeley', region: 'CA', postal_code: '94704' },
        },
        {
          store_id: 'T200',
          location_name: 'Target Second',
          mailing_address: { address_line1: '2 Second St', city: 'Oakland', region: 'CA', postal_code: '94601' },
        },
      ]))
      .mockResolvedValueOnce(makeProductsResponse())

    const results = await getTargetProducts('milk', null, '94704')

    expect(results[0].target_store_id).toBe('T100')
    expect(results[0].location).toBe('1 First St, Berkeley, CA, 94704')
  })

  it('preserves API product order', async () => {
    setupHappyPath([
      makeProduct({ tcin: 'P3', title: 'Expensive Milk', price: 7.99 }),
      makeProduct({ tcin: 'P1', title: 'Cheap Milk', price: 2.49 }),
      makeProduct({ tcin: 'P2', title: 'Mid Milk', price: 4.99 }),
    ])
    const results = await getTargetProducts('milk', null, '94704')
    expect(results.map((r) => r.product_id)).toEqual(['P3', 'P1', 'P2'])
  })

  it('filters out products with null price', async () => {
    setupHappyPath([
      makeProduct({ tcin: 'P1', title: 'No Price Milk', price: null }),
      makeProduct({ tcin: 'P2', title: 'Priced Milk', price: 3.99 }),
    ])
    const results = await getTargetProducts('milk', null, '94704')
    expect(results).toHaveLength(1)
    expect(results[0].product_id).toBe('P2')
  })

  it('deduplicates products by tcin', async () => {
    setupHappyPath([
      makeProduct({ tcin: 'DUP', title: 'Duplicate A', price: 2.99 }),
      makeProduct({ tcin: 'DUP', title: 'Duplicate B', price: 2.99 }),
      makeProduct({ tcin: 'UNQ', title: 'Unique', price: 3.99 }),
    ])
    const results = await getTargetProducts('milk', null, '94704')
    expect(results).toHaveLength(2)
    const ids = results.map((r) => r.product_id)
    expect(ids).toContain('DUP')
    expect(ids).toContain('UNQ')
  })

  // ── Store lookup failures ───────────────────────────────────────────────────

  it('returns [] when store lookup returns no stores', async () => {
    mockGet.mockResolvedValueOnce(makeStoreResponse([]))
    const results = await getTargetProducts('milk', null, '99999')
    expect(results).toEqual([])
  })

  it('returns [] when store lookup throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'))
    const results = await getTargetProducts('milk', null, '94704')
    expect(results).toEqual([])
  })

  // ── Product search failures ─────────────────────────────────────────────────

  it('returns [] when products response is empty', async () => {
    mockGet
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce(makeProductsResponse([]))
    const results = await getTargetProducts('milk', null, '94704')
    expect(results).toEqual([])
  })

  it('returns [] when products payload is missing from response', async () => {
    mockGet
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce({ status: 200, data: { data: { search: {} } } })
    const results = await getTargetProducts('milk', null, '94704')
    expect(results).toEqual([])
  })

  it('returns [] when products request returns non-200 (non-404) status', async () => {
    mockGet
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce({ status: 500, data: {} })
    const results = await getTargetProducts('milk', null, '94704')
    expect(results).toEqual([])
  })

  it('throws TARGET_HTTP_404 error when products endpoint returns 404', async () => {
    mockGet
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce({ status: 404, data: {}, config: {} })
    await expect(getTargetProducts('milk', null, '94704')).rejects.toMatchObject({
      code: 'TARGET_HTTP_404',
      status: 404,
      debugContext: expect.objectContaining({
        keyword: 'milk',
        zipCode: '94704',
        storeId: 'T001',
        storeIdSource: 'getNearestStore',
        responseStatus: 404,
      }),
    })
    expect(mockLogHttpErrorToDatabase).toHaveBeenCalledTimes(1)
    expect(mockLogHttpErrorToDatabase).toHaveBeenCalledWith(expect.objectContaining({
      storeEnum: 'target',
      zipCode: '94704',
      storeId: 'T001',
      storeIdSource: 'getNearestStore',
      ingredientName: 'milk',
      groceryStoreId: null,
      errorMessage: 'Target API returned 404 for "milk" at store T001 (94704)',
      requestUrl: expect.stringContaining('https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?'),
    }))
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('logs grocery_store_id and metadata-based store source for Target 404s', async () => {
    const metadata = {
      target_store_id: 'T999',
      grocery_store_id: 'gs-123',
      zip_code: '94601',
    }
    mockGet.mockResolvedValueOnce({ status: 404, data: {}, config: {} })

    await expect(getTargetProducts('eggs', metadata, '94601')).rejects.toMatchObject({
      code: 'TARGET_HTTP_404',
      debugContext: expect.objectContaining({
        keyword: 'eggs',
        zipCode: '94601',
        storeId: 'T999',
        storeIdSource: 'db_metadata',
        groceryStoreId: 'gs-123',
      }),
    })
    expect(mockLogHttpErrorToDatabase).toHaveBeenCalledWith(expect.objectContaining({
      storeEnum: 'target',
      zipCode: '94601',
      storeId: 'T999',
      storeIdSource: 'db_metadata',
      groceryStoreId: 'gs-123',
      ingredientName: 'eggs',
      requestUrl: expect.stringContaining('pricing_store_id=T999'),
    }))
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('returns [] when products request throws', async () => {
    mockGet
      .mockResolvedValueOnce(makeStoreResponse())
      .mockRejectedValueOnce(new Error('API error'))
    const results = await getTargetProducts('milk', null, '94704')
    expect(results).toEqual([])
  })

  // ── Location label formats ──────────────────────────────────────────────────

  it('falls back to "Target (zip)" when no store found', async () => {
    // No store found → [] returned early, so location not used
    // Instead test with storeMetadata that has no fullAddress
    mockGet.mockResolvedValueOnce(makeProductsResponse())
    const results = await getTargetProducts('milk', { target_store_id: 'T1' }, '94704')
    expect(results[0].location).toBe('Target (94704)')
  })

  it('falls back to city/state+zip when fullAddress missing but address present', async () => {
    const storeWithoutFullAddress = {
      store_id: 'T002',
      location_name: 'Target Oakland',
      mailing_address: { city: 'Oakland', region: 'CA' },
    }
    mockGet
      .mockResolvedValueOnce(makeStoreResponse([storeWithoutFullAddress]))
      .mockResolvedValueOnce(makeProductsResponse())
    const results = await getTargetProducts('milk', null, '94601')
    expect(results[0].location).toBe('Oakland, CA, 94601')
  })
})
