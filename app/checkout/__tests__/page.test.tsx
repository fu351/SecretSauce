import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSearchParams } from 'next/navigation'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// useSearchParams is globally mocked in test/setup.ts — override per test
const mockSearchParams = new URLSearchParams()
vi.mocked(useSearchParams).mockReturnValue(mockSearchParams as any)

// Mock window.location.href (jsdom doesn't allow direct assignment by default)
const locationMock = { href: '' }
Object.defineProperty(window, 'location', { writable: true, value: locationMock })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParams(opts: {
  total?: string
  items?: string
  cartItems?: Array<{ item_id: string; product_id: string; num_pkgs: number; frontend_price: number }>
}) {
  const p = new URLSearchParams()
  if (opts.total !== undefined) p.set('total', opts.total)
  if (opts.items !== undefined) p.set('items', opts.items)
  if (opts.cartItems !== undefined) p.set('cartItems', encodeURIComponent(JSON.stringify(opts.cartItems)))
  return p
}

const sampleCartItems = [
  { item_id: 'item_1', product_id: 'prod_1', num_pkgs: 2, frontend_price: 1.99 },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckoutPage', () => {
  let CheckoutPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    locationMock.href = ''

    // Default: no search params
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any)

    const mod = await import('../page')
    CheckoutPage = mod.default
  })

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe('rendering', () => {
    it('renders the page heading', () => {
      render(<CheckoutPage />)
      expect(screen.getByRole('heading', { name: /upgrade to premium/i })).toBeInTheDocument()
    })

    it('renders the proceed to payment button', () => {
      render(<CheckoutPage />)
      expect(screen.getByRole('button', { name: /proceed to payment/i })).toBeInTheDocument()
    })

    it('renders the back to pricing link', () => {
      render(<CheckoutPage />)
      expect(screen.getByRole('link', { name: /back to pricing/i })).toBeInTheDocument()
    })

    it('does not show cart summary when no search params are present', () => {
      render(<CheckoutPage />)
      expect(screen.queryByText(/shopping cart summary/i)).not.toBeInTheDocument()
    })

    it('does not show cart summary when total is zero', async () => {
      vi.mocked(useSearchParams).mockReturnValue(buildParams({ total: '0.00', items: '3' }) as any)
      render(<CheckoutPage />)
      await waitFor(() => {
        expect(screen.queryByText(/shopping cart summary/i)).not.toBeInTheDocument()
      })
    })

    it('shows cart summary with total and item count when total > 0', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        buildParams({ total: '24.99', items: '5' }) as any
      )
      render(<CheckoutPage />)
      await waitFor(() => {
        expect(screen.getByText(/shopping cart summary/i)).toBeInTheDocument()
        expect(screen.getByText(/\$24\.99/)).toBeInTheDocument()
        expect(screen.getByText(/items:\s*5/i)).toBeInTheDocument()
      })
    })

    it('shows total without item count when items param is absent', async () => {
      vi.mocked(useSearchParams).mockReturnValue(buildParams({ total: '10.00' }) as any)
      render(<CheckoutPage />)
      await waitFor(() => {
        expect(screen.getByText(/\$10\.00/)).toBeInTheDocument()
        expect(screen.queryByText(/items:/i)).not.toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Checkout flow
  // -------------------------------------------------------------------------

  describe('checkout flow', () => {
    it('POSTs to /api/checkout with totalAmount and itemCount on click', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ url: 'https://stripe.example.com/pay' }),
      })
      vi.stubGlobal('fetch', fetchMock)

      vi.mocked(useSearchParams).mockReturnValue(
        buildParams({ total: '19.99', items: '3' }) as any
      )
      render(<CheckoutPage />)
      await userEvent.click(screen.getByRole('button', { name: /proceed to payment/i }))

      await waitFor(() => expect(fetchMock).toHaveBeenCalled())

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/checkout')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body)
      expect(body.totalAmount).toBe(19.99)
      expect(body.itemCount).toBe(3)
    })

    it('includes cartItems in the POST body when present in URL', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ url: 'https://stripe.example.com/pay' }),
      })
      vi.stubGlobal('fetch', fetchMock)

      vi.mocked(useSearchParams).mockReturnValue(
        buildParams({ total: '5.00', items: '1', cartItems: sampleCartItems }) as any
      )
      render(<CheckoutPage />)
      await userEvent.click(screen.getByRole('button', { name: /proceed to payment/i }))

      await waitFor(() => expect(fetchMock).toHaveBeenCalled())

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.cartItems).toEqual(sampleCartItems)
    })

    it('redirects to the Stripe URL returned by the API', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ url: 'https://stripe.example.com/pay/abc' }),
      }))

      vi.mocked(useSearchParams).mockReturnValue(buildParams({ total: '9.99', items: '1' }) as any)
      render(<CheckoutPage />)
      await userEvent.click(screen.getByRole('button', { name: /proceed to payment/i }))

      await waitFor(() => {
        expect(locationMock.href).toBe('https://stripe.example.com/pay/abc')
      })
    })

    it('does not redirect when the API response has no url field', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ session_id: 'cs_abc' }),
      }))

      vi.mocked(useSearchParams).mockReturnValue(buildParams({ total: '9.99', items: '1' }) as any)
      render(<CheckoutPage />)
      await userEvent.click(screen.getByRole('button', { name: /proceed to payment/i }))

      await waitFor(() => {
        expect(locationMock.href).toBe('')
      })
    })

    it('does not redirect when the API response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: 'Internal Server Error' }),
      }))

      vi.mocked(useSearchParams).mockReturnValue(buildParams({ total: '9.99', items: '1' }) as any)
      render(<CheckoutPage />)
      await userEvent.click(screen.getByRole('button', { name: /proceed to payment/i }))

      await waitFor(() => {
        expect(locationMock.href).toBe('')
      })
    })

    it('does not throw when fetch rejects (network error)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))

      vi.mocked(useSearchParams).mockReturnValue(buildParams({ total: '9.99', items: '1' }) as any)
      render(<CheckoutPage />)

      // Should not throw
      await expect(
        userEvent.click(screen.getByRole('button', { name: /proceed to payment/i }))
      ).resolves.not.toThrow()
    })

    it('handles an empty API response body gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '',
      }))

      vi.mocked(useSearchParams).mockReturnValue(buildParams({ total: '9.99', items: '1' }) as any)
      render(<CheckoutPage />)
      await expect(
        userEvent.click(screen.getByRole('button', { name: /proceed to payment/i }))
      ).resolves.not.toThrow()
      expect(locationMock.href).toBe('')
    })
  })

  // -------------------------------------------------------------------------
  // Loading / disabled state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('disables the button and shows "Redirecting..." while the request is in flight', async () => {
      // Never resolves so we can assert mid-flight
      vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

      vi.mocked(useSearchParams).mockReturnValue(buildParams({ total: '9.99', items: '1' }) as any)
      render(<CheckoutPage />)
      await userEvent.click(screen.getByRole('button', { name: /proceed to payment/i }))

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /redirecting/i })
        expect(btn).toBeInTheDocument()
        expect(btn).toBeDisabled()
      })
    })
  })

  // -------------------------------------------------------------------------
  // cartItems URL parsing
  // -------------------------------------------------------------------------

  describe('cartItems parsing', () => {
    it('silently ignores malformed cartItems JSON in the URL', async () => {
      const params = new URLSearchParams()
      params.set('total', '5.00')
      params.set('items', '1')
      params.set('cartItems', encodeURIComponent('NOT_VALID_JSON'))
      vi.mocked(useSearchParams).mockReturnValue(params as any)

      // Render without throwing
      expect(() => render(<CheckoutPage />)).not.toThrow()
    })

    it('sends cartItems: undefined in the POST body when cartItems param is absent', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ url: 'https://stripe.example.com/pay' }),
      })
      vi.stubGlobal('fetch', fetchMock)

      vi.mocked(useSearchParams).mockReturnValue(buildParams({ total: '5.00', items: '1' }) as any)
      render(<CheckoutPage />)
      await userEvent.click(screen.getByRole('button', { name: /proceed to payment/i }))

      await waitFor(() => expect(fetchMock).toHaveBeenCalled())

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.cartItems).toBeUndefined()
    })
  })
})
