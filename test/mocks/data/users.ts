/**
 * Clerk User fixture for authentication tests
 * Represents a signed-in user from Clerk
 */
export const mockClerkUser = {
  id: 'user_clerk_123',
  emailAddresses: [
    {
      id: 'idn_1234567890',
      emailAddress: 'john.doe@example.com',
      verification: {
        status: 'verified' as const,
        strategy: 'email_code' as const,
      },
    },
  ],
  firstName: 'John',
  lastName: 'Doe',
  fullName: 'John Doe',
  hasImage: false,
  imageUrl: '',
  publicMetadata: {},
  unsafeMetadata: {},
  lastSignInAt: new Date('2024-01-15T10:00:00Z'),
  createdAt: new Date('2023-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-15T10:00:00Z'),
}

/**
 * Alternative Clerk user for multi-user testing scenarios
 */
export const mockClerkUserTwo = {
  id: 'user_clerk_456',
  emailAddresses: [
    {
      id: 'idn_0987654321',
      emailAddress: 'jane.smith@example.com',
      verification: {
        status: 'verified' as const,
        strategy: 'email_code' as const,
      },
    },
  ],
  firstName: 'Jane',
  lastName: 'Smith',
  fullName: 'Jane Smith',
  hasImage: false,
  imageUrl: '',
  publicMetadata: {},
  unsafeMetadata: {},
  lastSignInAt: new Date('2024-01-20T14:30:00Z'),
  createdAt: new Date('2023-06-01T00:00:00Z'),
  updatedAt: new Date('2024-01-20T14:30:00Z'),
}

/**
 * Supabase User Profile for the primary test user
 * Matches the database schema for user profiles
 */
export const mockUserProfile = {
  id: 'user_clerk_123',
  email: 'john.doe@example.com',
  full_name: 'John Doe',
  avatar_url: 'https://example.com/avatar.jpg',
  preferences: {
    theme: 'light',
    units: 'imperial',
    dietary_restrictions: ['vegetarian'],
  },
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
}

/**
 * Supabase User Profile for secondary test user
 */
export const mockUserProfileTwo = {
  id: 'user_clerk_456',
  email: 'jane.smith@example.com',
  full_name: 'Jane Smith',
  avatar_url: null,
  preferences: {
    theme: 'dark',
    units: 'metric',
    dietary_restrictions: ['vegan', 'gluten-free'],
  },
  created_at: '2023-06-01T00:00:00Z',
  updated_at: '2024-01-20T14:30:00Z',
}

/**
 * Session object returned by Clerk after authentication
 */
export const mockSession = {
  id: 'sess_test123',
  userId: 'user_clerk_123',
  sessionToken: 'token_abc123def456',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-01-15T10:00:00Z'),
  lastActivityAt: new Date('2024-01-15T10:05:00Z'),
}

/**
 * Alternative session for secondary user
 */
export const mockSessionTwo = {
  id: 'sess_test456',
  userId: 'user_clerk_456',
  sessionToken: 'token_xyz789uvw012',
  createdAt: new Date('2024-01-20T14:30:00Z'),
  updatedAt: new Date('2024-01-20T14:30:00Z'),
  lastActivityAt: new Date('2024-01-20T14:35:00Z'),
}

/**
 * Mock favorites list for a user
 * Stores recipe IDs as strings in a Set
 */
export const mockUserFavorites = new Set([
  'recipe-123', // Chocolate Chip Cookies
  'recipe-thai', // Thai Green Curry
  'recipe-keto', // Keto Steak
])

/**
 * Empty favorites set for users without any favorites
 */
export const mockEmptyFavorites = new Set<string>()

/**
 * Mock shopping list items for a user
 */
export const mockShoppingListItems = [
  {
    id: 'shopping-item-1',
    user_id: 'user_clerk_123',
    recipe_id: 'recipe-123',
    ingredient_name: 'all-purpose flour',
    quantity: 2.25,
    unit: 'cups',
    standardized_ingredient_id: 'flour-001',
    checked: false,
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'shopping-item-2',
    user_id: 'user_clerk_123',
    recipe_id: 'recipe-123',
    ingredient_name: 'butter',
    quantity: 1,
    unit: 'cup',
    standardized_ingredient_id: 'butter-001',
    checked: false,
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'shopping-item-3',
    user_id: 'user_clerk_123',
    recipe_id: 'recipe-123',
    ingredient_name: 'chocolate chips',
    quantity: 2,
    unit: 'cups',
    standardized_ingredient_id: 'chocolate-001',
    checked: true,
    created_at: '2024-01-15T10:00:00Z',
  },
]

/**
 * Mock user preferences for settings tests
 */
export const mockUserPreferences = {
  user_id: 'user_clerk_123',
  theme: 'dark' as const,
  units: 'metric' as const,
  dietary_restrictions: ['vegetarian', 'gluten-free'],
  notifications_enabled: true,
  email_recipes: true,
  private_recipes: false,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
}

/**
 * Mock user recipes created by a user
 */
export const mockUserCreatedRecipes = [
  'recipe-advanced', // Mushroom Wellington by user-chef
  'recipe-unicode', // Café au Lait & Crêpes
]

/**
 * Mock authentication context for useAuth hook testing
 */
export const mockAuthContext = {
  sessionId: 'sess_test123',
  userId: 'user_clerk_123',
  actor: null,
  orgId: null,
  orgRole: null,
  orgSlug: null,
  factorVerificationAge: [null],
  signOut: async () => {},
  getToken: async () => 'token_abc123def456',
  has: () => true,
}

/**
 * Mock user object without authentication (guest user)
 */
export const mockGuestUser = {
  id: null,
  emailAddresses: [],
  firstName: null,
  lastName: null,
  fullName: null,
  hasImage: false,
  imageUrl: '',
  publicMetadata: {},
  unsafeMetadata: {},
  lastSignInAt: null,
  createdAt: null,
  updatedAt: null,
}

/**
 * Mock subscriber/premium user with additional privileges
 */
export const mockPremiumUser = {
  id: 'user_premium_789',
  emailAddresses: [
    {
      id: 'idn_premium',
      emailAddress: 'premium.user@example.com',
      verification: {
        status: 'verified' as const,
        strategy: 'email_code' as const,
      },
    },
  ],
  firstName: 'Premium',
  lastName: 'User',
  fullName: 'Premium User',
  hasImage: true,
  imageUrl: 'https://example.com/premium-avatar.jpg',
  publicMetadata: {
    subscription: 'premium',
    tier: 'pro',
  },
  unsafeMetadata: {
    premium_expires_at: '2025-01-15T00:00:00Z',
  },
  lastSignInAt: new Date('2024-01-20T10:00:00Z'),
  createdAt: new Date('2022-06-01T00:00:00Z'),
  updatedAt: new Date('2024-01-20T10:00:00Z'),
}

/**
 * Mock user ratings for recipes
 * Useful for testing rating functionality
 */
export const mockUserRatings = [
  {
    id: 'rating-1',
    user_id: 'user_clerk_123',
    recipe_id: 'recipe-123',
    rating: 5,
    comment: 'Delicious cookies!',
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'rating-2',
    user_id: 'user_clerk_123',
    recipe_id: 'recipe-thai',
    rating: 4,
    comment: 'Good but a bit spicy',
    created_at: '2024-01-20T14:30:00Z',
  },
]
