import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useRouter, useSearchParams } from 'next/navigation'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockToast = vi.fn()
const mockAttemptVerification = vi.fn()
const mockPrepareEmailVerification = vi.fn()
const mockSetActive = vi.fn()

const mockSignUp = {
  emailAddress: 'user@example.com',
  status: 'missing_requirements',
  attemptEmailAddressVerification: mockAttemptVerification,
  prepareEmailAddressVerification: mockPrepareEmailVerification,
}

vi.mock('@clerk/nextjs', () => ({
  useSignUp: vi.fn(() => ({
    isLoaded: true,
    signUp: mockSignUp,
    setActive: mockSetActive,
  })),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckEmailPage', () => {
  let CheckEmailPage: React.ComponentType

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as any)
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('email=user%40example.com') as any)

    const mod = await import('../page')
    CheckEmailPage = mod.default
  })

  // --- Rendering ---

  it('renders the verification code input and verify button', () => {
    render(<CheckEmailPage />)
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /verify code/i })).toBeInTheDocument()
  })

  it('displays the email from the query string', () => {
    render(<CheckEmailPage />)
    expect(screen.getByText(/user@example.com/)).toBeInTheDocument()
  })

  it('displays the email from Clerk signUp when no query param', () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any)
    render(<CheckEmailPage />)
    expect(screen.getByText(/user@example.com/)).toBeInTheDocument()
  })

  // --- Validation ---

  it('keeps the verify button disabled until 6 digits are entered', async () => {
    const user = userEvent.setup()
    render(<CheckEmailPage />)
    const button = screen.getByRole('button', { name: /verify code/i })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText(/verification code/i), '12345')
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText(/verification code/i), '6')
    expect(button).toBeEnabled()
  })

  it('only allows numeric input in the code field', async () => {
    const user = userEvent.setup()
    render(<CheckEmailPage />)
    await user.type(screen.getByLabelText(/verification code/i), 'abc123def456')
    expect(screen.getByLabelText(/verification code/i)).toHaveValue('123456')
  })

  // --- Verification success ---

  it('calls attemptEmailAddressVerification with the entered code', async () => {
    const user = userEvent.setup()
    mockAttemptVerification.mockResolvedValue({ status: 'complete', createdSessionId: 'sess_1' })
    mockSetActive.mockResolvedValue({})
    server.use(
      http.post('/api/auth/ensure-profile', () =>
        HttpResponse.json({ profile: { id: 'p_1', email: 'user@example.com', created_at: null } })
      )
    )
    render(<CheckEmailPage />)
    await user.type(screen.getByLabelText(/verification code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))
    await waitFor(() =>
      expect(mockAttemptVerification).toHaveBeenCalledWith({ code: '123456' })
    )
  })

  it('activates the session and redirects to /onboarding on success', async () => {
    const user = userEvent.setup()
    const { push } = vi.mocked(useRouter)()
    mockAttemptVerification.mockResolvedValue({ status: 'complete', createdSessionId: 'sess_1' })
    mockSetActive.mockResolvedValue({})
    server.use(
      http.post('/api/auth/ensure-profile', () =>
        HttpResponse.json({ profile: { id: 'p_1', email: 'user@example.com', created_at: null } })
      )
    )
    render(<CheckEmailPage />)
    await user.type(screen.getByLabelText(/verification code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))
    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_1' })
      expect(push).toHaveBeenCalledWith('/onboarding')
    })
  })

  it('calls /api/auth/ensure-profile after activating the session', async () => {
    const user = userEvent.setup()
    let ensureProfileCalled = false
    mockAttemptVerification.mockResolvedValue({ status: 'complete', createdSessionId: 'sess_1' })
    mockSetActive.mockResolvedValue({})
    server.use(
      http.post('/api/auth/ensure-profile', () => {
        ensureProfileCalled = true
        return HttpResponse.json({ profile: { id: 'p_1', email: 'user@example.com', created_at: null } })
      })
    )
    render(<CheckEmailPage />)
    await user.type(screen.getByLabelText(/verification code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))
    await waitFor(() => expect(ensureProfileCalled).toBe(true))
  })

  // --- Verification failure ---

  it('shows an error toast for an invalid/expired code', async () => {
    const user = userEvent.setup()
    mockAttemptVerification.mockRejectedValue({
      errors: [{ longMessage: 'Verification code is incorrect.' }],
    })
    render(<CheckEmailPage />)
    await user.type(screen.getByLabelText(/verification code/i), '000000')
    await user.click(screen.getByRole('button', { name: /verify code/i }))
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Verification failed',
          description: 'Verification code is incorrect.',
        })
      )
    )
  })

  it('redirects to /auth/signup when signup session is abandoned', async () => {
    const { replace } = vi.mocked(useRouter)()
    const abandonedSignUp = { ...mockSignUp, status: 'abandoned' }
    const { useSignUp } = await import('@clerk/nextjs')
    vi.mocked(useSignUp).mockReturnValue({
      isLoaded: true,
      signUp: abandonedSignUp as any,
      setActive: mockSetActive,
    })
    render(<CheckEmailPage />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/signup'))
  })

  // --- Resend code ---

  it('calls prepareEmailAddressVerification when resend is clicked', async () => {
    const user = userEvent.setup()
    mockPrepareEmailVerification.mockResolvedValue({})
    render(<CheckEmailPage />)
    await user.click(screen.getByRole('button', { name: /send a new code/i }))
    await waitFor(() =>
      expect(mockPrepareEmailVerification).toHaveBeenCalledWith({ strategy: 'email_code' })
    )
  })

  it('disables the resend button and shows countdown after sending', async () => {
    const user = userEvent.setup()
    mockPrepareEmailVerification.mockResolvedValue({})
    render(<CheckEmailPage />)
    await user.click(screen.getByRole('button', { name: /send a new code/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /resend in/i })).toBeDisabled()
    )
  })

  // --- Loading state ---

  it('disables the verify button while verification is in flight', async () => {
    const user = userEvent.setup()
    mockAttemptVerification.mockReturnValue(new Promise(() => {}))
    render(<CheckEmailPage />)
    await user.type(screen.getByLabelText(/verification code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /verifying/i })).toBeDisabled()
    )
  })
})
