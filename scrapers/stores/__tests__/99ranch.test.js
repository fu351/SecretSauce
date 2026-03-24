// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// ─── Mock setup (must happen before loading source file) ─────────────────────

const mockPost = vi.fn()
const mockAxios = Object.assign(vi.fn(), { post: mockPost })

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
  delete _require.cache[_require.resolve('../99ranch.js')]
  return _require('../99ranch.js').search99Ranch
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_STORE = {
  id: 'S001',
  name: '99 Ranch Berkeley',
  address: '1025 University Ave, Berkeley, CA 94710',
  street: '1025 University Ave',
  city: 'Berkeley',
  state: 'CA',
  zipCode: '94710',
  latitude: 37.87,
  longitude: -122.27,
}

function makeStoreResponse(stores = [MOCK_STORE]) {
  return { data: { data: { records: stores } } }
}

function makeProductResponse(list = []) {
  return { data: { data: { list } } }
}

function makeProduct({
  productName = 'Jasmine Rice',
  salePrice = 8.99,
  brandName = 'Nishiki',
  variantName = '5 lb',
  image = 'https://99ranch.com/rice.jpg',
  productId = 'R001',
  category = 'Dry Goods',
} = {}) {
  return { productName, salePrice, brandName, variantName, image, productId, category }
}

function setupHappyPath(products = [makeProduct()]) {
  mockPost
    .mockResolvedValueOnce(makeStoreResponse())
    .mockResolvedValueOnce(makeProductResponse(products))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('search99Ranch', () => {
  let search99Ranch

  beforeEach(() => {
    mockPost.mockReset()
    mockAxios.mockReset()
    mockAxios.post = mockPost
    search99Ranch = loadModule()
  })

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns normalized products on happy path', async () => {
    setupHappyPath()
    const results = await search99Ranch('rice', '94709')
    expect(results).toHaveLength(1)
    const item = results[0]
    expect(item.product_name).toBe('Jasmine Rice')
    expect(item.title).toBe('Jasmine Rice')
    expect(item.brand).toBe('Nishiki')
    expect(item.price).toBe(8.99)
    expect(item.unit).toBe('5 lb')
    expect(item.rawUnit).toBe('5 lb')
    expect(item.image_url).toBe('https://99ranch.com/rice.jpg')
    expect(item.product_id).toBe('R001')
    expect(item.id).toBe('R001')
    expect(item.provider).toBe('99 Ranch')
    expect(item.category).toBe('Dry Goods')
  })

  it('uses fullAddress as location label', async () => {
    setupHappyPath()
    const results = await search99Ranch('rice', '94709')
    expect(results[0].location).toBe('1025 University Ave, Berkeley, CA 94710')
  })

  it('preserves upstream product order', async () => {
    setupHappyPath([
      makeProduct({ productName: 'Expensive Rice', salePrice: 12.99, productId: 'R3' }),
      makeProduct({ productName: 'Cheap Rice', salePrice: 4.99, productId: 'R1' }),
      makeProduct({ productName: 'Mid Rice', salePrice: 7.99, productId: 'R2' }),
    ])
    const results = await search99Ranch('rice', '94709')
    expect(results.map((r) => r.product_id)).toEqual(['R3', 'R1', 'R2'])
  })

  it('uses productNameEN when productName is missing', async () => {
    mockPost
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce(makeProductResponse([{ productNameEN: 'Sticky Rice', salePrice: 5.99, productId: 'R002' }]))
    const results = await search99Ranch('rice', '94709')
    expect(results[0].product_name).toBe('Sticky Rice')
    expect(results[0].title).toBe('Sticky Rice')
  })

  it('uses saleUom as pricePerUnit', async () => {
    mockPost
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce(makeProductResponse([{ ...makeProduct(), saleUom: '/lb' }]))
    const results = await search99Ranch('rice', '94709')
    expect(results[0].pricePerUnit).toBe('/lb')
  })

  it('uses productImage.path as fallback image_url', async () => {
    mockPost
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce(makeProductResponse([
        { productName: 'Rice', salePrice: 5.99, productId: 'R003', productImage: { path: 'https://cdn.99ranch.com/image.jpg' } },
      ]))
    const results = await search99Ranch('rice', '94709')
    expect(results[0].image_url).toBe('https://cdn.99ranch.com/image.jpg')
  })

  it('defaults category to "Grocery" when missing', async () => {
    mockPost
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce(makeProductResponse([{ productName: 'Rice', salePrice: 5.99, productId: 'R004' }]))
    const results = await search99Ranch('rice', '94709')
    expect(results[0].category).toBe('Grocery')
  })

  // ── Filtering ───────────────────────────────────────────────────────────────

  it('filters out products with null/zero/negative price', async () => {
    setupHappyPath([
      makeProduct({ productName: 'Free Rice', salePrice: 0 }),
      makeProduct({ productName: 'Negative Rice', salePrice: -1 }),
      makeProduct({ productName: '', salePrice: 5.99, productId: 'R005' }),
      makeProduct({ productName: 'Valid Rice', salePrice: 5.99, productId: 'R006' }),
    ])
    const results = await search99Ranch('rice', '94709')
    expect(results).toHaveLength(1)
    expect(results[0].product_id).toBe('R006')
  })

  it('filters out products with non-finite price strings', async () => {
    mockPost
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce(makeProductResponse([
        { productName: 'Bad Price', salePrice: 'N/A', productId: 'R007' },
        { productName: 'Good Price', salePrice: 3.99, productId: 'R008' },
      ]))
    const results = await search99Ranch('rice', '94709')
    expect(results).toHaveLength(1)
    expect(results[0].product_id).toBe('R008')
  })

  it('returns [] when products list is empty', async () => {
    setupHappyPath([])
    const results = await search99Ranch('rice', '94709')
    expect(results).toEqual([])
  })

  // ── Store lookup fallback ───────────────────────────────────────────────────

  it('falls back to DEFAULT_99_RANCH_ZIP when no store found near user zip', async () => {
    mockPost
      .mockResolvedValueOnce(makeStoreResponse([]))  // no stores near 12345
      .mockResolvedValueOnce(makeStoreResponse())     // fallback zip finds store
      .mockResolvedValueOnce(makeProductResponse([makeProduct()]))
    const results = await search99Ranch('rice', '12345')
    expect(results).toHaveLength(1)
  })

  it('returns [] when both user zip and fallback zip have no store', async () => {
    mockPost
      .mockResolvedValueOnce(makeStoreResponse([]))
      .mockResolvedValueOnce(makeStoreResponse([]))
    const results = await search99Ranch('rice', '12345')
    expect(results).toEqual([])
  })

  it('returns [] when store lookup throws', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'))
    const results = await search99Ranch('rice', '94709')
    expect(results).toEqual([])
  })

  // ── Product search failure ──────────────────────────────────────────────────

  it('returns [] when product search throws', async () => {
    mockPost
      .mockResolvedValueOnce(makeStoreResponse())
      .mockRejectedValueOnce(new Error('Product search error'))
    const results = await search99Ranch('rice', '94709')
    expect(results).toEqual([])
  })

  // ── Location label formats ──────────────────────────────────────────────────

  it('falls back to city/state label when no fullAddress', async () => {
    const storeNoAddress = { id: 'S002', city: 'San Jose', state: 'CA' }
    mockPost
      .mockResolvedValueOnce(makeStoreResponse([storeNoAddress]))
      .mockResolvedValueOnce(makeProductResponse([makeProduct()]))
    const results = await search99Ranch('rice', '95101')
    expect(results[0].location).toBe('San Jose, CA')
  })

  it('falls back to "99 Ranch (zip)" label when no address info', async () => {
    const storeNoAddr = { id: 'S003', name: 'Remote Store' }
    mockPost
      .mockResolvedValueOnce(makeStoreResponse([storeNoAddr]))
      .mockResolvedValueOnce(makeProductResponse([makeProduct()]))
    const results = await search99Ranch('rice', '99999')
    expect(results[0].location).toBe('99 Ranch (99999)')
  })

  // ── ID normalization ────────────────────────────────────────────────────────

  it('coerces numeric productId to string', async () => {
    mockPost
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce(makeProductResponse([{ productName: 'Rice', salePrice: 5.99, productId: 12345 }]))
    const results = await search99Ranch('rice', '94709')
    expect(results[0].product_id).toBe('12345')
    expect(results[0].id).toBe('12345')
  })

  it('handles null productId', async () => {
    mockPost
      .mockResolvedValueOnce(makeStoreResponse())
      .mockResolvedValueOnce(makeProductResponse([{ productName: 'Rice', salePrice: 5.99 }]))
    const results = await search99Ranch('rice', '94709')
    expect(results[0].product_id).toBeNull()
    expect(results[0].id).toBeNull()
  })

  // ── Zip trimming ────────────────────────────────────────────────────────────

  it('trims whitespace from zip code', async () => {
    setupHappyPath()
    const results = await search99Ranch('rice', '  94709  ')
    expect(results).toHaveLength(1)
    const storeCall = mockPost.mock.calls[0]
    expect(storeCall[1].zipCode).toBe('94709')
  })
})
