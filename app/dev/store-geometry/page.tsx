import { requireAdmin } from "@/lib/auth/admin"
import type { LocationPoint } from "../components/location-map"
import DevStoreGeometryClient from "../dev-store-geometry-client"
import { supabase, type Database } from "@/lib/database/supabase"

const STORE_FETCH_LIMIT = 400
const LIST_PREVIEW_LIMIT = 32

type GroceryStoreRow = Database["public"]["Tables"]["grocery_stores"]["Row"]

type StoreQueryResult = {
  totalFetched: number
  locations: LocationPoint[]
}

const POINT_REGEX = /POINT\s*\(([-\d.]+)\s+([-\d.]+)\)/i
const SRID_POINT_REGEX = /SRID=\d+;POINT\s*\(([-\d.]+)\s+([-\d.]+)\)/i

const WKB_POINT_REGEX = /^[0-9A-Fa-f]+$/

function parsePostgisWkbPoint(text: string): { lat: number; lng: number } | null {
  if (!WKB_POINT_REGEX.test(text)) return null

  const bytes = Buffer.from(text, "hex")
  if (bytes.length < 21) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0
  const littleEndian = view.getUint8(offset) === 1
  offset += 1

  const typeInt = view.getUint32(offset, littleEndian)
  offset += 4
  const geometryType = typeInt & 0xff
  const hasSrid = (typeInt & 0x20000000) !== 0

  if (geometryType !== 1) return null

  if (hasSrid) {
    offset += 4
  }

  if (offset + 16 > view.byteLength) return null

  const lng = view.getFloat64(offset, littleEndian)
  offset += 8
  const lat = view.getFloat64(offset, littleEndian)
  return { lat, lng }
}

function parseGeometry(geom: unknown): { lat: number; lng: number } | null {
  if (!geom) return null

  if (typeof geom === "string") {
    const trimmed = geom.trim()
    const wkbPoint = parsePostgisWkbPoint(trimmed)
    if (wkbPoint) return wkbPoint
    const match = SRID_POINT_REGEX.exec(trimmed) || POINT_REGEX.exec(trimmed)
    if (match) {
      const lng = Number(match[1])
      const lat = Number(match[2])
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { lat, lng }
      }
    }

    try {
      return parseGeometry(JSON.parse(trimmed))
    } catch {
      return null
    }
  }

  if (Array.isArray(geom) && geom.length >= 2) {
    const [lng, lat] = geom
    if (typeof lat === "number" && typeof lng === "number") {
      return { lat, lng }
    }
  }

  if (typeof geom === "object") {
    const maybe = geom as Record<string, unknown>

    if ("coordinates" in maybe && Array.isArray(maybe.coordinates)) {
      const [lng, lat] = maybe.coordinates
      if (typeof lat === "number" && typeof lng === "number") {
        return { lat, lng }
      }
    }

    if ("lat" in maybe && "lng" in maybe) {
      const lat = maybe.lat as number
      const lng = maybe.lng as number
      if (typeof lat === "number" && typeof lng === "number") {
        return { lat, lng }
      }
    }

    if ("x" in maybe && "y" in maybe) {
      const lat = maybe.y as number
      const lng = maybe.x as number
      if (typeof lat === "number" && typeof lng === "number") {
        return { lat, lng }
      }
    }

    if ("value" in maybe && typeof maybe.value === "string") {
      return parseGeometry(maybe.value)
    }
  }

  return null
}

function formatLabel(row: GroceryStoreRow) {
  const shortLabelParts = [row.name, row.zip_code].filter(Boolean)
  if (shortLabelParts.length) {
    return shortLabelParts.slice(0, 2).join(" · ")
  }
  return row.store_enum ?? "Grocery store"
}

async function loadStoreLocations(): Promise<StoreQueryResult> {
  const { data, error } = await supabase
    .from("grocery_stores")
    .select("id, name, address, zip_code, store_enum, geom")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(STORE_FETCH_LIMIT)

  if (error) {
    console.error("Dev store geometry fetch failed", error)
    return { totalFetched: 0, locations: [] }
  }

  const rows = data ?? []
  const locations = rows
    .map((row) => {
      const parsed = parseGeometry(row.geom)
      if (!parsed) return null
      const label = formatLabel(row)
      return {
        id: row.id,
        label,
        address: row.address,
        zipCode: row.zip_code,
        storeEnum: row.store_enum,
        lat: parsed.lat,
        lng: parsed.lng,
      }
    })
    .filter((item): item is LocationPoint => item !== null)

  return { totalFetched: rows.length, locations }
}

export const dynamic = "force-dynamic"

export default async function DevStoreGeometryPage() {
  // Require admin access
  await requireAdmin()

  const { locations, totalFetched } = await loadStoreLocations()
  const previewLocations = locations.slice(0, LIST_PREVIEW_LIMIT)
  const missing = totalFetched - locations.length
  const refreshedAt = new Date().toLocaleString()

  return (
    <DevStoreGeometryClient
      locations={locations}
      totalFetched={totalFetched}
      previewLocations={previewLocations}
      missing={missing}
      refreshedAt={refreshedAt}
    />
  )
}
