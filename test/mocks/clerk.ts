import { vi } from 'vitest'

export const mockClerkUser = {
  id: 'user_test123',
  emailAddresses: [{ emailAddress: 'test@example.com' }],
  firstName: 'Test',
  lastName: 'User',
  fullName: 'Test User',
}

export const mockUseUser = vi.fn(() => ({
  isLoaded: true,
  isSignedIn: true,
  user: mockClerkUser,
}))

export const mockUseAuth = vi.fn(() => ({
  isLoaded: true,
  isSignedIn: true,
  userId: 'user_test123',
  sessionId: 'sess_test123',
  signOut: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useUser: mockUseUser,
  useAuth: mockUseAuth,
  SignIn: vi.fn(() => null),
  SignUp: vi.fn(() => null),
  UserButton: vi.fn(() => null),
}))
