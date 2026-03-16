import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}))

vi.mock('@/hooks', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockToast = vi.fn()
const mockCreate = vi.fn()
const mockPrepareEmailVerification = vi.fn()
const mockSetActive = vi.fn()

vi.mock('@clerk/nextjs', () => ({
  useSignUp: vi.fn(() => ({
    isLoaded: true,
    signUp: {
      create: mockCreate,
      prepareEmailAddressVerification: mockPrepareEmailVerification,
    },
    setActive: mockSetActive,
  })),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  { email = 'new@example.com', password = 'password123', confirm = 'password123' } = {}
) {
  await user.type(screen.getByLabelText(/^email$/i), email)
  await user.type(screen.getByLabelText(/^password$/i), password)
  await user.type(screen.getByLabelText(/confirm password/i), confirm)
  await user.click(screen.getByRole('button', { name: /request access/i }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SignUpPage', () => {
  let SignUpPage: React.ComponentType

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
    // Dynamically import to pick up fresh mocks
    const mod = await import('../page')
    SignUpPage = mod.default
  })

  // --- Rendering ---

  it('renders email, password, confirm-password inputs and submit button', () => {
    render(<SignUpPage />)
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /request access/i })).toBeInTheDocument()
  })

  it('has a link to the sign-in page', () => {
    render(<SignUpPage />)
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
  })

  // --- Client-side validation ---

  it("shows an error toast when passwords don't match", async () => {
    const user = userEvent.setup()
    render(<SignUpPage />)
    await fillAndSubmit(user, { password: 'password123', confirm: 'different456' })
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Passwords don't match.", variant: 'destructive' })
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('shows an error toast when password is under 6 characters', async () => {
    const user = userEvent.setup()
    const { container } = render(<SignUpPage />)
    // Type values directly then use fireEvent.submit to bypass HTML minLength validation
    // so the JS-level check runs and we can assert on the toast
    await user.type(screen.getByLabelText(/^email$/i), 'test@example.com')
    await user.type(screen.getByLabelText(/^password$/i), '123')
    await user.type(screen.getByLabelText(/confirm password/i), '123')
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Password must be at least 6 characters long.',
          variant: 'destructive',
        })
      )
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  // --- Clerk integration ---

  it('sends email + password to signUp.create on valid submission', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue({ status: 'missing_requirements', createdSessionId: null })
    mockPrepareEmailVerification.mockResolvedValue({})
    render(<SignUpPage />)
    await fillAndSubmit(user, { email: 'new@example.com', password: 'securepass', confirm: 'securepass' })
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        emailAddress: 'new@example.com',
        password: 'securepass',
      })
    )
  })

  it('redirects to /auth/check-email when email verification is required', async () => {
    const user = userEvent.setup()
    const { push } = vi.mocked(useRouter)()
    mockCreate.mockResolvedValue({ status: 'missing_requirements', createdSessionId: null })
    mockPrepareEmailVerification.mockResolvedValue({})
    render(<SignUpPage />)
    await fillAndSubmit(user, { email: 'new@example.com' })
    await waitFor(() => {
      expect(mockPrepareEmailVerification).toHaveBeenCalledWith({ strategy: 'email_code' })
      expect(push).toHaveBeenCalledWith('/auth/check-email?email=new%40example.com')
    })
  })

  it('activates session and redirects to /onboarding when signup completes immediately', async () => {
    const user = userEvent.setup()
    const { push } = vi.mocked(useRouter)()
    mockCreate.mockResolvedValue({ status: 'complete', createdSessionId: 'sess_abc' })
    mockSetActive.mockResolvedValue({})
    server.use(
      http.post('/api/auth/ensure-profile', () =>
        HttpResponse.json({ profile: { id: 'p_1', email: 'new@example.com', created_at: null } })
      )
    )
    render(<SignUpPage />)
    await fillAndSubmit(user)
    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_abc' })
      expect(push).toHaveBeenCalledWith('/onboarding')
    })
  })

  it('shows "Account Already Exists" toast for form_identifier_exists Clerk error', async () => {
    const user = userEvent.setup()
    mockCreate.mockRejectedValue({
      errors: [{ code: 'form_identifier_exists', longMessage: 'Email already exists' }],
    })
    render(<SignUpPage />)
    await fillAndSubmit(user, { email: 'existing@example.com' })
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Account Already Exists', variant: 'destructive' })
      )
    )
  })

  it('shows a generic error toast for unknown Clerk errors', async () => {
    const user = userEvent.setup()
    mockCreate.mockRejectedValue({
      errors: [{ longMessage: 'Something went wrong on our end.' }],
    })
    render(<SignUpPage />)
    await fillAndSubmit(user)
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Signup Failed',
          description: 'Something went wrong on our end.',
          variant: 'destructive',
        })
      )
    )
  })

  // --- Loading state ---

  it('disables the submit button while the request is in flight', async () => {
    const user = userEvent.setup()
    // Never resolves so we can check mid-flight state
    mockCreate.mockReturnValue(new Promise(() => {}))
    render(<SignUpPage />)
    await fillAndSubmit(user)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled()
    )
  })
})
