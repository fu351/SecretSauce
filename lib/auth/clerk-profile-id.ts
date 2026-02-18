import "server-only"

import { createHash } from "node:crypto"

// Fixed namespace for deterministic Clerk -> profiles.id mapping.
// Do not change after users are created, or IDs will no longer match.
const CLERK_PROFILE_UUID_NAMESPACE = "3b241101-e2bb-4255-8caf-4136c566a962"

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const parseUuidBytes = (uuid: string): Buffer => {
  if (!UUID_REGEX.test(uuid)) {
    throw new Error("Invalid UUID namespace format.")
  }

  return Buffer.from(uuid.replace(/-/g, ""), "hex")
}

const formatUuidBytes = (bytes: Uint8Array): string => {
  const hex = Buffer.from(bytes).toString("hex")
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-")
}

export function profileIdFromClerkUserId(clerkUserId: string): string {
  const normalized = String(clerkUserId || "").trim()
  if (!normalized) {
    throw new Error("clerkUserId is required to derive profile UUID.")
  }

  const namespaceBytes = parseUuidBytes(CLERK_PROFILE_UUID_NAMESPACE)
  const hash = createHash("sha1")
    .update(namespaceBytes)
    .update(Buffer.from(normalized, "utf8"))
    .digest()

  // RFC 4122 version 5 + variant bits.
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80

  return formatUuidBytes(hash.subarray(0, 16))
}

