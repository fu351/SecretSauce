import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockAuth, mockGetUser, mockClerkClient } = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  const mockAuth = vi.fn()
  const mockClerkClient = vi.fn(() => ({ users: { getUser: mockGetUser } }))
  return { mockAuth, mockGetUser, mockClerkClient }
})
vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}))

vi.mock('@/lib/auth/clerk-profile-id', () => ({
  profileIdFromClerkUserId: vi.fn(() => 'deterministic-uuid-123'),
}))

const { mockFrom, mockSingleForUpdate } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSingleForUpdate: vi.fn(),
}))
vi.mock('@/lib/database/supabase-server', () => ({
  createServiceSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

// Chain factories — built fresh per call so each test gets its own mocks
const createSelectChain = (result: any) => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue(result),
    }),
  }),
})

const createUpdateChain = () => ({
  update: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: mockSingleForUpdate,
      }),
    }),
  }),
})

const createUpsertChain = (result: any) => ({
  upsert: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(result),
    }),
  }),
})

// ---------------------------------------------------------------------------
// Shared clerk user fixture
// ---------------------------------------------------------------------------

const clerkUser = {
  primaryEmailAddressId: 'ea_1',
  emailAddresses: [{ id: 'ea_1', emailAddress: 'user@example.com', verification: { status: 'verified' } }],
  firstName: 'Jane',
  lastName: 'Doe',
  fullName: 'Jane Doe',
  imageUrl: 'https://example.com/avatar.png',
  unsafeMetadata: { username: 'janedoe' },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/ensure-profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSingleForUpdate.mockResolvedValue({ data: null, error: null })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await POST(new Request('http://localhost/api/auth/ensure-profile', { method: 'POST' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns 400 when Clerk user has no primary email', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    mockGetUser.mockResolvedValue({ ...clerkUser, emailAddresses: [], primaryEmailAddressId: null })
    mockFrom.mockReturnValueOnce(createSelectChain({ data: null, error: null }))

    const res = await POST(new Request('http://localhost/api/auth/ensure-profile', { method: 'POST' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Missing primary Clerk email' })
  })

  it('updates and returns an existing profile matched by clerk_user_id', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    mockGetUser.mockResolvedValue(clerkUser)

    const existingProfile = { id: 'existing-uuid', email: 'user@example.com', created_at: '2024-01-01' }
    mockFrom
      .mockReturnValueOnce(createSelectChain({ data: existingProfile, error: null })) // select by clerk_user_id
      .mockReturnValueOnce(createUpdateChain())                                        // update

    const res = await POST(new Request('http://localhost/api/auth/ensure-profile', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toMatchObject({ id: 'existing-uuid', email: 'user@example.com' })
  })

  it('falls back to email lookup when no profile matches clerk_user_id', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_new' })
    mockGetUser.mockResolvedValue(clerkUser)

    const profileByEmail = { id: 'email-uuid', email: 'user@example.com', created_at: '2024-01-01' }
    mockFrom
      .mockReturnValueOnce(createSelectChain({ data: null, error: null }))             // select by clerk_user_id → miss
      .mockReturnValueOnce(createSelectChain({ data: profileByEmail, error: null }))   // select by email → hit
      .mockReturnValueOnce(createUpdateChain())                                         // update

    const res = await POST(new Request('http://localhost/api/auth/ensure-profile', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile).toMatchObject({ id: 'email-uuid' })
  })

  it('creates a new profile with a deterministic id when none exists', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_brand_new' })
    mockGetUser.mockResolvedValue(clerkUser)

    const createdProfile = {
      id: 'deterministic-uuid-123',
      email: 'user@example.com',
      created_at: new Date().toISOString(),
    }
    mockFrom
      .mockReturnValueOnce(createSelectChain({ data: null, error: null }))   // clerk_user_id miss
      .mockReturnValueOnce(createSelectChain({ data: null, error: null }))   // email miss
      .mockReturnValueOnce(createUpsertChain({ data: createdProfile, error: null })) // create

    const res = await POST(new Request('http://localhost/api/auth/ensure-profile', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile.id).toBe('deterministic-uuid-123')
    expect(body.profile.email).toBe('user@example.com')
  })

  it('returns 500 when profile creation fails', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_brand_new' })
    mockGetUser.mockResolvedValue(clerkUser)

    mockFrom
      .mockReturnValueOnce(createSelectChain({ data: null, error: null }))
      .mockReturnValueOnce(createSelectChain({ data: null, error: null }))
      .mockReturnValueOnce(createUpsertChain({ data: null, error: { message: 'DB error' } }))

    const res = await POST(new Request('http://localhost/api/auth/ensure-profile', { method: 'POST' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'Failed to create profile' })
  })

  it('treats aborted requests as benign disconnects', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' })
    mockGetUser.mockRejectedValue(Object.assign(new Error('aborted'), { code: 'ECONNRESET' }))

    const res = await POST(new Request('http://localhost/api/auth/ensure-profile', { method: 'POST' }))
    expect(res.status).toBe(204)
  })
})
