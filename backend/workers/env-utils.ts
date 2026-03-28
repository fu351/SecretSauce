export function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "")
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

export function readBoundedFloat(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? "")
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback
  return parsed
}

export function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function requireSupabaseEnv(): void {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    )
  }
}
