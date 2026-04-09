const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export function validateUsername(value: string): string | null {
  const normalized = normalizeUsername(value)

  if (normalized.length === 0) {
    return "Username is required."
  }

  if (!USERNAME_PATTERN.test(normalized)) {
    return "Username must be 3-30 characters and use only lowercase letters, numbers, or underscores."
  }

  return null
}
