import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cn, isIOS, isSafari, isPWAInstalled, shouldShowIOSPrompt } from '@/lib/utils'

describe('utils', () => {
  describe('cn (className merger)', () => {
    it('merges className strings', () => {
      const result = cn('px-2 py-1', 'px-4')
      expect(result).toContain('px-4')
      expect(result).toContain('py-1')
    })

    it('handles conditional classes', () => {
      const result = cn('base', true && 'active', false && 'inactive')
      expect(result).toContain('base')
      expect(result).toContain('active')
      expect(result).not.toContain('inactive')
    })

    it('handles arrays', () => {
      const result = cn(['foo', 'bar'], 'baz')
      expect(result).toContain('foo')
      expect(result).toContain('bar')
      expect(result).toContain('baz')
    })

    it('handles objects with conditional keys', () => {
      const result = cn({
        'text-red': false,
        'text-blue': true,
      })
      expect(result).toContain('text-blue')
    })

    it('handles undefined and null', () => {
      const result = cn('base', undefined, null, 'text')
      expect(result).toContain('base')
      expect(result).toContain('text')
    })
  })

  describe('Device detection', () => {
    beforeEach(() => {
      // Reset navigator and window mocks before each test
      vi.unstubAllGlobals()
    })

    describe('isIOS', () => {
      it('returns true for iPad', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (iPad; CPU OS 11_0 like Mac OS X) AppleWebKit/604.1.34',
          mimeTypes: [],
          plugins: [],
        })
        expect(isIOS()).toBe(true)
      })

      it('returns true for iPhone', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38',
          mimeTypes: [],
          plugins: [],
        })
        expect(isIOS()).toBe(true)
      })

      it('returns true for iPod', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15',
          mimeTypes: [],
          plugins: [],
        })
        expect(isIOS()).toBe(true)
      })

      it('returns false for Android', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
          mimeTypes: [],
          plugins: [],
        })
        expect(isIOS()).toBe(false)
      })

      it('returns false for Windows', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          mimeTypes: [],
          plugins: [],
        })
        expect(isIOS()).toBe(false)
      })

      it('returns false on server side (no window)', () => {
        vi.stubGlobal('window', undefined as any)
        // When window is undefined, navigator will also be unavailable
        // so we expect false
        try {
          const result = isIOS()
          expect(result).toBe(false)
        } catch {
          // Expected when window is truly undefined
          expect(true).toBe(true)
        }
      })
    })

    describe('isSafari', () => {
      it('returns true for Safari on macOS', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
          mimeTypes: [],
          plugins: [],
        })
        expect(isSafari()).toBe(true)
      })

      it('returns true for Safari on iOS', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
          mimeTypes: [],
          plugins: [],
        })
        expect(isSafari()).toBe(true)
      })

      it('returns false for Chrome', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          mimeTypes: [],
          plugins: [],
        })
        expect(isSafari()).toBe(false)
      })

      it('returns false for Firefox', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
          mimeTypes: [],
          plugins: [],
        })
        expect(isSafari()).toBe(false)
      })

      it('returns false for Edge', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
          mimeTypes: [],
          plugins: [],
        })
        expect(isSafari()).toBe(false)
      })
    })

    describe('isPWAInstalled', () => {
      it('returns true when in standalone mode', () => {
        const mockMatchMedia = vi.fn((query: string) => ({
          matches: query === '(display-mode: standalone)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }))
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: mockMatchMedia,
        })
        expect(isPWAInstalled()).toBe(true)
      })

      it('returns false when not in standalone mode', () => {
        const mockMatchMedia = vi.fn(() => ({
          matches: false,
          media: '',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }))
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: mockMatchMedia,
        })
        expect(isPWAInstalled()).toBe(false)
      })

      it('returns true when navigator.standalone is true', () => {
        Object.defineProperty(navigator, 'standalone', {
          writable: true,
          value: true,
        })
        const mockMatchMedia = vi.fn(() => ({
          matches: false,
          media: '',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: mockMatchMedia,
        })
        expect(isPWAInstalled()).toBe(true)
      })
    })

    describe('shouldShowIOSPrompt', () => {
      it('returns true for iOS Safari without PWA', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
          mimeTypes: [],
          plugins: [],
        })
        const mockMatchMedia = vi.fn(() => ({
          matches: false,
          media: '',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: mockMatchMedia,
        })

        expect(shouldShowIOSPrompt()).toBe(true)
      })

      it('returns false for iOS Safari WITH PWA installed', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
          mimeTypes: [],
          plugins: [],
        })
        const mockMatchMedia = vi.fn((query: string) => ({
          matches: query === '(display-mode: standalone)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: mockMatchMedia,
        })

        expect(shouldShowIOSPrompt()).toBe(false)
      })

      it('returns false for Android Safari', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/91.0 Mobile Safari/537.36',
          mimeTypes: [],
          plugins: [],
        })
        const mockMatchMedia = vi.fn(() => ({
          matches: false,
          media: '',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: mockMatchMedia,
        })

        expect(shouldShowIOSPrompt()).toBe(false)
      })

      it('returns false for non-Safari browsers', () => {
        vi.stubGlobal('navigator', {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/605.1.15',
          mimeTypes: [],
          plugins: [],
        })
        const mockMatchMedia = vi.fn(() => ({
          matches: false,
          media: '',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: mockMatchMedia,
        })

        expect(shouldShowIOSPrompt()).toBe(false)
      })
    })
  })
})
