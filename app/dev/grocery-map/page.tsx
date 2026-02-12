import StorePointMap, { type StorePoint } from "./store-map"
import { createServerClient, type Database } from "@/lib/database/supabase"

export const dynamic = "force-dynamic"
export const revalidate = 0

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 }
const FETCH_LIMIT = 400
const POINT_REGEX = /POINT\(([-\d.]+)\s+([-\d.]+)\)/

function parseGeom(value: Database["public"]["Tables"]["grocery_stores"]["Row"]["geom"]): { lat: number; lng: number } | null {
  if (!value || typeof value !== "string") {
    return null
  }

  const match = value.match(POINT_REGEX)
  if (!match) {
    return null
  }

  const parsedLng = parseFloat(match[1])
  const parsedLat = parseFloat(match[2])

  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
    return null
  }

  return { lat: parsedLat, lng: parsedLng }
}

async function fetchStorePoints(): Promise<{ points: StorePoint[]; totalRows: number; error: string | null }> {
  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from<Database["public"]["Tables"]["grocery_stores"]["Row"]>("grocery_stores")
      .select("id, name, address, zip_code, store_enum, geom")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT)

    if (error) {
      return { points: [], totalRows: 0, error: error.message }
    }

    const rows = data ?? []
    const points = rows
      .map((row) => {
        const coords = parseGeom(row.geom)
        if (!coords) return null
        return {
          id: row.id,
          name: row.name,
          address: row.address,
          zipCode: row.zip_code,
          storeEnum: row.store_enum,
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((value): value is StorePoint => Boolean(value))

    return { points, totalRows: rows.length, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error while querying Supabase"
    return { points: [], totalRows: 0, error: message }
  }
}

export default async function DevGroceryMapPage() {
  const { points, totalRows, error } = await fetchStorePoints()
  const computedCenter =
    points.length > 0
      ? {
          lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
          lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
        }
      : DEFAULT_CENTER
  const zoomLevel = points.length > 0 ? 5 : 4
  const missingCoordinates = totalRows - points.length

  const samplePoints = points.slice(0, 10)
  const snapshotLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date())

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">Dev: grocery store map</p>
          <h1 className="text-4xl font-bold text-white">Verify store geometry points</h1>
          <p className="text-sm text-slate-400">
            Fetches up to {FETCH_LIMIT} active grocery stores and plots the ones that already have PostGIS geometry. Use this when testing ZIP
            centroid fallbacks or inspecting the imported coordinates.
          </p>
          <p className="text-xs text-orange-200">Snapshot: {snapshotLabel} (UTC)</p>
          {error && (
            <div className="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-100">
              <p className="font-semibold">Supabase error:</p>
              <p>{error}</p>
              <p className="mt-1 text-xs text-rose-200">
                Confirm NEXT_PUBLIC_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY are set locally.
              </p>
            </div>
          )}
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-widest text-orange-400">Retrieved rows</p>
            <p className="text-3xl font-semibold">{totalRows}</p>
            <p className="text-xs text-slate-400">Up to {FETCH_LIMIT} rows ordered by newest first</p>
          </article>
          <article className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-widest text-orange-400">Stores with geometry</p>
            <p className="text-3xl font-semibold">{points.length}</p>
            <p className="text-xs text-slate-400">Missing coordinates: {Math.max(missingCoordinates, 0)}</p>
          </article>
        </section>

        <section className="h-[520px] w-full overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-slate-900/60">
          <StorePointMap points={points} center={computedCenter} zoom={zoomLevel} />
        </section>

        {samplePoints.length > 0 && (
          <section className="grid gap-3 md:grid-cols-2">
            {samplePoints.map((point) => (
              <article key={point.id} className="rounded-2xl border border-white/5 bg-white/5 p-4 text-sm">
                <p className="text-base font-semibold text-white">{point.name}</p>
                <p className="text-xs text-slate-400">{point.storeEnum ?? "Unknown brand"}</p>
                <p className="text-xs text-slate-400">{point.address ?? "Address not set"}</p>
                <p className="text-xs text-slate-400">ZIP {point.zipCode ?? "n/a"}</p>
                <p className="text-xs text-slate-400">
                  Lat {point.lat.toFixed(5)}, Lng {point.lng.toFixed(5)}
                </p>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
