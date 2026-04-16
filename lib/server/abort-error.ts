export function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false

  const candidate = error as {
    name?: string
    message?: string
    code?: string
    cause?: { name?: string; message?: string; code?: string }
  }

  return (
    candidate.name === "AbortError" ||
    candidate.message === "aborted" ||
    candidate.code === "ECONNRESET" ||
    candidate.cause?.name === "AbortError" ||
    candidate.cause?.message === "aborted" ||
    candidate.cause?.code === "ECONNRESET"
  )
}
