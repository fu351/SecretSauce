// @vitest-environment node
import { vi, describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

const patchCache = (id, exports) => {
  _require.cache[id] = { id, filename: id, loaded: true, exports }
}

// Logger is required at module load time.
patchCache(_require.resolve('../../utils/logger'), {
  createScraperLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
})

delete _require.cache[_require.resolve('../instacart-scrapegraph.js')]
const {
  buildInstacartUrl,
  normalizeProducts,
  searchInstacartStore,
  INSTACART_STORE_SLUGS,
} = _require('../instacart-scrapegraph.js')

describe('buildInstacartUrl', () => {
  it('builds a search URL for a known Instacart-backed store', () => {
    expect(buildInstacartUrl('Safeway', 'oat milk')).toBe(
      'https://www.instacart.com/store/safeway/search/oat%20milk'
    )
  })

  it('is case-insensitive on the store name', () => {
    expect(buildInstacartUrl('SAFEWAY', 'eggs')).toBe(
      'https://www.instacart.com/store/safeway/search/eggs'
    )
  })

  it('returns null for an unknown store', () => {
    expect(buildInstacartUrl('Nonexistent Mart', 'milk')).toBeNull()
  })

  it('exposes a slug map that includes core Instacart-backed chains', () => {
    expect(INSTACART_STORE_SLUGS).toHaveProperty('safeway')
    expect(INSTACART_STORE_SLUGS).toHaveProperty('albertsons')
  })
})

describe('normalizeProducts', () => {
  it('maps scrapegraph products to the store schema and strips $ from price', () => {
    const raw = {
      products: [
        { name: 'Signature Oat Milk', price: '$3.99', price_per_unit: '$0.08/oz', image_url: 'http://img/1.png' },
        { name: 'No price', price: 'n/a' },
        { name: '', price: '$2.00' },
      ],
    }
    const out = normalizeProducts(raw, 'Safeway')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      title: 'Signature Oat Milk',
      price: 3.99,
      provider: 'Safeway',
      image_url: 'http://img/1.png',
    })
    expect(out[0].pricePerUnit).toBe('$0.08/oz')
  })

  it('accepts a bare array of products and numeric prices', () => {
    const out = normalizeProducts([{ name: 'Milk', price: 2.5 }], 'Safeway')
    expect(out[0].price).toBe(2.5)
  })

  it('returns [] for null / empty / shapeless input', () => {
    expect(normalizeProducts(null, 'Safeway')).toEqual([])
    expect(normalizeProducts({}, 'Safeway')).toEqual([])
  })
})

describe('searchInstacartStore', () => {
  const success = { status: 'success', data: { products: [{ name: 'Oat Milk', price: '$3.99' }] } }

  it('calls the SDK with the api key, store URL and a keyword-bearing prompt', async () => {
    const fn = vi.fn().mockResolvedValue(success)
    const out = await searchInstacartStore('oat milk', '94105', {
      store: 'Safeway',
      apiKey: 'key-123',
      smartScraperFn: fn,
    })
    expect(fn).toHaveBeenCalledWith(
      'key-123',
      expect.objectContaining({
        website_url: 'https://www.instacart.com/store/safeway/search/oat%20milk',
        user_prompt: expect.stringContaining('oat milk'),
      })
    )
    expect(out[0]).toMatchObject({ title: 'Oat Milk', price: 3.99, provider: 'Safeway' })
  })

  it('returns [] (and does not call the SDK) when the API key is missing', async () => {
    const fn = vi.fn()
    const out = await searchInstacartStore('milk', '94105', { store: 'Safeway', apiKey: '', smartScraperFn: fn })
    expect(out).toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('returns [] for an unknown store without calling the SDK', async () => {
    const fn = vi.fn()
    const out = await searchInstacartStore('milk', '94105', { store: 'Nope', apiKey: 'k', smartScraperFn: fn })
    expect(out).toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('returns [] when the SDK reports an error status', async () => {
    const fn = vi.fn().mockResolvedValue({ status: 'error', error: 'boom' })
    const out = await searchInstacartStore('milk', '94105', { store: 'Safeway', apiKey: 'k', smartScraperFn: fn })
    expect(out).toEqual([])
  })

  it('is resilient: returns [] when the SDK throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network'))
    const out = await searchInstacartStore('milk', '94105', { store: 'Safeway', apiKey: 'k', smartScraperFn: fn })
    expect(out).toEqual([])
  })

  it('sorts by price ascending and caps to maxResults', async () => {
    const fn = vi.fn().mockResolvedValue({
      status: 'success',
      data: { products: [
        { name: 'B', price: '$5' },
        { name: 'A', price: '$2' },
        { name: 'C', price: '$9' },
      ] },
    })
    const out = await searchInstacartStore('x', '94105', {
      store: 'Safeway',
      apiKey: 'k',
      smartScraperFn: fn,
      maxResults: 2,
    })
    expect(out.map((p) => p.title)).toEqual(['A', 'B'])
  })
})
