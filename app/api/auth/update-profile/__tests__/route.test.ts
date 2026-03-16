import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from '../route'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }))

const { mockSingle, mockChain } = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockChain = {
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: mockSingle,
  }
  return { mockSingle, mockChain }
})
vi.mock('@/lib/database/supabase-server', () => ({
  createServiceSupabaseClient: vi.fn(() => mockChain),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRequest = (body: unknown) =>
  new Request('http://localhost/api/auth/update-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/auth/update-profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChain.from.mockReturnThis()
    mockChain.update.mockReturnThis()
    mockChain.eq.mockReturnThis()
    mockChain.select.mockReturnThis()
  })

  // --- Auth ---

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await PATCH(makeRequest({ full_name: 'Test' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
  })

  // --- Input validation ---

  it('returns 400 for a non-object body', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    const res = await PATCH(
      new Request('http://localhost/api/auth/update-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '"just a string"',
      })
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for an array body', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    const res = await PATCH(makeRequest([{ full_name: 'Test' }]))
    expect(res.status).toBe(400)
  })

  it('returns 400 when the body contains only non-allowlisted fields', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    const res = await PATCH(
      makeRequest({
        subscription_tier: 'pro',
        email: 'hack@example.com',
        clerk_user_id: 'override',
        email_verified: true,
      })
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'No valid fields to update' })
  })

  // --- Security: field allowlist ---

  it('strips billing and identity fields before writing', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    mockSingle.mockResolvedValue({ data: { id: 'p_1', full_name: 'Test' }, error: null })

    await PATCH(
      makeRequest({
        full_name: 'Test',
        subscription_tier: 'pro',           // must be stripped
        subscription_expires_at: '2099',    // must be stripped
        subscription_started_at: '2020',    // must be stripped
        subscription_status: 'active',      // must be stripped
        email_verified: true,               // must be stripped
        clerk_user_id: 'injected',          // must be stripped
        stripe_customer_id: 'cus_hack',    // must be stripped
        stripe_subscription_id: 'sub_hack',// must be stripped
        stripe_price_id: 'price_hack',     // must be stripped
        stripe_current_period_end: '2099', // must be stripped
        email: 'override@example.com',     // must be stripped
        id: 'other-user-id',               // must be stripped
        created_at: '1970-01-01',          // must be stripped
      })
    )

    const updatePayload = mockChain.update.mock.calls[0][0]
    const forbidden = [
      'subscription_tier', 'subscription_expires_at', 'subscription_started_at',
      'subscription_status', 'email_verified', 'clerk_user_id', 'stripe_customer_id',
      'stripe_subscription_id', 'stripe_price_id', 'stripe_current_period_end',
      'email', 'id', 'created_at',
    ]
    for (const field of forbidden) {
      expect(updatePayload, `"${field}" should be stripped`).not.toHaveProperty(field)
    }
    expect(updatePayload).toHaveProperty('full_name', 'Test')
  })

  it('passes allowlisted fields through to the DB update', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    mockSingle.mockResolvedValue({ data: { id: 'p_1' }, error: null })

    await PATCH(
      makeRequest({
        full_name: 'New Name',
        cooking_level: 'advanced',
        theme_preference: 'dark',
        zip_code: '94102',
        dietary_preferences: ['vegan'],
      })
    )

    const updatePayload = mockChain.update.mock.calls[0][0]
    expect(updatePayload).toMatchObject({
      full_name: 'New Name',
      cooking_level: 'advanced',
      theme_preference: 'dark',
      zip_code: '94102',
      dietary_preferences: ['vegan'],
    })
  })

  it('always updates against the authenticated clerk_user_id, not a client-supplied id', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_real' })
    mockSingle.mockResolvedValue({ data: { id: 'p_1' }, error: null })

    await PATCH(makeRequest({ full_name: 'Test', id: 'another-user' }))

    expect(mockChain.eq).toHaveBeenCalledWith('clerk_user_id', 'user_real')
  })

  it('always injects updated_at into the update payload', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    mockSingle.mockResolvedValue({ data: { id: 'p_1' }, error: null })

    const before = Date.now()
    await PATCH(makeRequest({ full_name: 'Test' }))
    const after = Date.now()

    const updatePayload = mockChain.update.mock.calls[0][0]
    expect(updatePayload).toHaveProperty('updated_at')
    const ts = new Date(updatePayload.updated_at).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  // --- Success ---

  it('returns 200 with the updated profile on success', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    const mockProfile = {
      id: 'p_1',
      full_name: 'Updated',
      cooking_level: 'intermediate',
      email: 'user@example.com',
    }
    mockSingle.mockResolvedValue({ data: mockProfile, error: null })

    const res = await PATCH(makeRequest({ full_name: 'Updated', cooking_level: 'intermediate' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ profile: mockProfile })
  })

  // --- DB errors ---

  it('returns 500 when the DB update fails', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'connection refused' } })

    const res = await PATCH(makeRequest({ full_name: 'Test' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'Failed to update profile' })
  })

  it('returns 500 when the DB returns no data', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    mockSingle.mockResolvedValue({ data: null, error: null })

    const res = await PATCH(makeRequest({ full_name: 'Test' }))
    expect(res.status).toBe(500)
  })
})
