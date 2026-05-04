export function getPythonApiBaseUrl(): string | null {
  const rawUrl = process.env.PYTHON_SERVICE_URL || process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL
  if (!rawUrl) {
    return null
  }

  return rawUrl.replace(/\/+$/, "")
}
