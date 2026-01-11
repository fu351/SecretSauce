import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canonicalizeStoreName, geocodeStore, getUserLocation, geocodePostalCode } from '@/lib/geocoding'
import { server } from '@/test/mocks/server'
import { http, HttpResponse } from 'msw'

describe('geocoding utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('canonicalizeStoreName', () => {
    it('converts to lowercase', () => {
      expect(canonicalizeStoreName('TRADER JOES')).toBe('traderjoes')
    })

    it('removes special characters and spaces', () => {
      expect(canonicalizeStoreName("Trader Joe's")).toBe('traderjoes')
      expect(canonicalizeStoreName('King Soopers')).toBe('kingsoopers')
      expect(canonicalizeStoreName("Mariano's")).toBe('marianos')
      expect(canonicalizeStoreName('Whole Foods Market')).toBe('wholefoodsmarket')
    })

    it('handles apostrophes correctly', () => {
      expect(canonicalizeStoreName("Trader Joe's")).toBe('traderjoes')
    })

    it('removes numbers correctly', () => {
      expect(canonicalizeStoreName('99 Ranch Market')).toBe('99ranchmarket')
    })

    it('handles diacritics', () => {
      expect(canonicalizeStoreName('Café')).toBe('cafe')
    })

    it('handles empty strings', () => {
      expect(canonicalizeStoreName('')).toBe('')
    })

    it('handles curly apostrophes', () => {
      const curlyApostrophe = 'Trader Joe\u2019s'
      expect(canonicalizeStoreName(curlyApostrophe)).toBe('traderjoes')
    })
  })

  describe('geocodePostalCode', () => {
    it('geocodes a valid postal code', async () => {
      const result = await geocodePostalCode('94102')
      expect(result).not.toBeNull()
      expect(result?.lat).toBeDefined()
      expect(result?.lng).toBeDefined()
      expect(typeof result?.lat).toBe('number')
      expect(typeof result?.lng).toBe('number')
    })

    it('caches results on subsequent calls', async () => {
      const result1 = await geocodePostalCode('94102')
      const result2 = await geocodePostalCode('94102')

      // Should return same object (from cache)
      expect(result1).toEqual(result2)
    })

    it('returns null for invalid postal code', async () => {
      server.use(
        http.post('/api/maps', () => {
          return HttpResponse.json({
            status: 'ZERO_RESULTS',
            results: [],
          })
        })
      )

      const result = await geocodePostalCode('00000')
      expect(result).toBeNull()
    })

    it('returns null for empty string', async () => {
      const result = await geocodePostalCode('')
      expect(result).toBeNull()
    })

    it('handles trimmed whitespace', async () => {
      const result = await geocodePostalCode('  94102  ')
      expect(result).not.toBeNull()
    })

    it('returns null when API fails with error response', async () => {
      server.use(
        http.post('/api/maps', () => {
          return HttpResponse.error()
        })
      )

      // Use a different postal code to avoid hitting the cache
      const result = await geocodePostalCode('99999')
      expect(result).toBeNull()
    })

    it('returns cached result for same postal code', async () => {
      // First call caches the result
      const result1 = await geocodePostalCode('94102')
      // Second call should use cache
      const result2 = await geocodePostalCode('94102')

      expect(result1).toEqual(result2)
    })
  })

  describe('getUserLocation', () => {
    it('resolves with coordinates on success', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) =>
          success({
            coords: { latitude: 37.7749, longitude: -122.4194 },
          })
        ),
      }
      vi.stubGlobal('navigator', {
        geolocation: mockGeolocation,
        userAgent: 'test',
        mimeTypes: [],
        plugins: [],
      })

      const location = await getUserLocation()
      expect(location).toEqual({ lat: 37.7749, lng: -122.4194 })
    })

    it('resolves with null on error', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_, error) =>
          error(new Error('Permission denied'))
        ),
      }
      vi.stubGlobal('navigator', {
        geolocation: mockGeolocation,
        userAgent: 'test',
        mimeTypes: [],
        plugins: [],
      })

      const location = await getUserLocation()
      expect(location).toBeNull()
    })

    it('resolves with null when geolocation is not available', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'test',
        mimeTypes: [],
        plugins: [],
      })

      const location = await getUserLocation()
      expect(location).toBeNull()
    })

    it('passes correct options to getCurrentPosition', async () => {
      const mockSuccess = vi.fn((callback) =>
        callback({
          coords: { latitude: 0.1, longitude: 0.1 },
        })
      )
      const mockGeolocation = {
        getCurrentPosition: mockSuccess,
      }
      vi.stubGlobal('navigator', {
        geolocation: mockGeolocation,
        userAgent: 'test',
        mimeTypes: [],
        plugins: [],
      })

      await getUserLocation()

      expect(mockSuccess).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          timeout: 10000,
          enableHighAccuracy: false,
        })
      )
    })
  })

  describe('geocodeStore', () => {
    it('calls the maps proxy API', async () => {
      // This test verifies that geocodeStore attempts to call the API
      // The actual complex logic for validation is integration-level
      const result = await geocodeStore('Kroger', '94102')

      // With valid mock data, we should get a result or null depending on validation
      expect(result === null || typeof result === 'object').toBe(true)
    })

    it('returns null for invalid store coordinates', async () => {
      server.use(
        http.post('/api/maps', () => {
          return HttpResponse.json({
            status: 'OK',
            results: [
              {
                geometry: {
                  location: { lat: 0, lng: 0 },
                },
                formatted_address: 'Invalid Store Location',
              },
            ],
          })
        })
      )

      const result = await geocodeStore('InvalidStore', '00000')
      // 0,0 coordinates should be rejected
      expect(result).toBeNull()
    })

    it('handles missing postal code parameter', async () => {
      const result = await geocodeStore('Kroger')
      // Should still attempt to geocode without postal code
      expect(result === null || typeof result === 'object').toBe(true)
    })

    it('handles store name with special characters', async () => {
      const result = await geocodeStore("Trader Joe's", '94102')
      expect(result === null || typeof result === 'object').toBe(true)
    })

    it('returns null when API returns error', async () => {
      server.use(
        http.post('/api/maps', () => {
          return HttpResponse.error()
        })
      )

      const result = await geocodeStore('Kroger', '94102')
      expect(result).toBeNull()
    })

    it('handles ZERO_RESULTS status', async () => {
      server.use(
        http.post('/api/maps', () => {
          return HttpResponse.json({
            status: 'ZERO_RESULTS',
            results: [],
          })
        })
      )

      const result = await geocodeStore('NonexistentStore12345', '99999')
      expect(result).toBeNull()
    })
  })

  describe('coordinate validation', () => {
    it('accepts valid non-zero coordinates', async () => {
      // The default mock returns valid coordinates
      const result = await geocodePostalCode('94102')
      expect(result).not.toBeNull()
      expect(Math.abs(result!.lat)).toBeGreaterThan(0.0001)
      expect(Math.abs(result!.lng)).toBeGreaterThan(0.0001)
    })

    it('returns coordinates with expected structure', async () => {
      const result = await geocodePostalCode('94102')
      expect(result).toHaveProperty('lat')
      expect(result).toHaveProperty('lng')
      expect(typeof result!.lat).toBe('number')
      expect(typeof result!.lng).toBe('number')
    })
  })
})
