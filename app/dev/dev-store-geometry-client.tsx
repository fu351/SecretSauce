"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { useToast } from "@/hooks"
import { supabase } from "@/lib/database/supabase"
import { Button } from "@/components/ui/button"
import LocationMap, { type LocationPoint } from "./components/location-map"

interface Props {
  locations: LocationPoint[]
  totalFetched: number
  previewLocations: LocationPoint[]
  missing: number
  refreshedAt: string
}

export default function DevStoreGeometryClient({
  locations,
  totalFetched,
  previewLocations,
  missing,
  refreshedAt,
}: Props) {
  const { toast } = useToast()
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [isSyncRunning, setIsSyncRunning] = useState(false)
  const [isRestoreRunning, setIsRestoreRunning] = useState(false)
  const [isTruncateRunning, setIsTruncateRunning] = useState(false)
  const [isSeedRunning, setIsSeedRunning] = useState(false)

  const callRpc = async (
    rpcName: string,
    label: string,
    setter: Dispatch<SetStateAction<boolean>>
  ) => {
    setActionMessage(null)
    setter(true)

    try {
      const { data, error } = await supabase.rpc(rpcName)
      if (error) throw error
      const message = (data as string) ?? `${label} succeeded`
      setActionMessage(message)
      toast({
        title: `${label} complete`,
        description: message,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setActionMessage(`Failed: ${errorMessage}`)
      toast({
        title: `${label} failed`,
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setter(false)
    }
  }

  const seedMockRecipes = async () => {
    setActionMessage(null)
    setIsSeedRunning(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) {
        console.warn("[seedMockRecipes] Unable to read auth user", authError)
      }

      const authorId = authData?.user?.id
      const requestBody = authorId ? { authorId } : {}

      const response = await fetch("/api/dev/seed-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to seed mock recipes")
      }

      const skippedCount = Array.isArray(payload.skipped) ? payload.skipped.length : 0
      const summary = `Seeded ${payload.succeeded.length} recipes, ${skippedCount} skipped duplicates, ${payload.failed.length} failures`
      const note = authorId ? "" : " (using fallback author id)"
      setActionMessage(summary + note)
      toast({
        title: "Seed mock recipes",
        description: summary,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setActionMessage(`Failed: ${errorMessage}`)
      toast({
        title: "Seed mock recipes failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsSeedRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="space-y-2 rounded-2xl border border-border bg-card/70 p-6 shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Dev helper</p>
          <h1 className="text-3xl font-semibold">Grocery Store Geometry</h1>
          <p className="text-sm text-muted-foreground">
            Visualize the raw PostGIS coordinates for stores so you can confirm bounding and clustering while
            you’re debugging spatial features.
          </p>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-foreground/80">
            <span className="rounded-full border border-border/60 px-3 py-1">Records fetched: {totalFetched}</span>
            <span className="rounded-full border border-border/60 px-3 py-1">Mapped points: {locations.length}</span>
            <span className="rounded-full border border-border/60 px-3 py-1">Missing coords: {missing}</span>
          </div>
        </header>

        <section className="space-y-3 rounded-2xl border border-border bg-card/70 p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="secondary"
              onClick={() =>
                callRpc("fn_sync_backup_tables", "Create backup snapshot", setIsSyncRunning)
              }
              disabled={isSyncRunning || isRestoreRunning || isTruncateRunning}
              className="min-w-[220px]"
            >
              {isSyncRunning ? "Creating snapshot…" : "Create backup snapshot"}
            </Button>
            <Button
              variant="default"
              onClick={() =>
                callRpc("fn_restore_from_backup", "Restore backup slot", setIsRestoreRunning)
              }
              disabled={isRestoreRunning || isSyncRunning || isTruncateRunning}
              className="min-w-[220px]"
            >
              {isRestoreRunning ? "Restoring backup…" : "Restore backup slot"}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                callRpc("fn_truncate_app_tables", "Truncate app tables", setIsTruncateRunning)
              }
              disabled={isTruncateRunning || isSyncRunning || isRestoreRunning || isSeedRunning}
              className="min-w-[220px]"
            >
              {isTruncateRunning ? "Truncating…" : "Truncate app tables"}
            </Button>
            <Button
              variant="outline"
              onClick={seedMockRecipes}
              disabled={isSeedRunning || isSyncRunning || isRestoreRunning || isTruncateRunning}
              className="min-w-[220px]"
            >
              {isSeedRunning ? "Seeding…" : "Seed mock recipes"}
            </Button>
            {actionMessage && (
              <p className="text-xs text-muted-foreground">{actionMessage}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Create a fresh snapshot (`fn_sync_backup_tables`), restore the current slot backup (`fn_restore_from_backup`),
            or clear the live tables (`fn_truncate_app_tables`). These actions keep the backup schema in sync with `public`.
          </p>
        </section>

        <LocationMap locations={locations} height="65vh" />

        <section className="space-y-3 rounded-2xl border border-border bg-card/70 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sample locations ({previewLocations.length})</h2>
            <span className="text-xs font-medium uppercase text-muted-foreground">preview only</span>
          </div>
          {previewLocations.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {previewLocations.map((location) => (
                <article key={location.id} className="rounded-2xl border border-border bg-background/80 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{location.label}</p>
                    {location.storeEnum && (
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {location.storeEnum}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {location.address ?? "No address"} · {location.zipCode ?? "No zip"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
              No store geometry could be parsed from the {totalFetched} records that were pulled.
            </div>
          )}
        </section>

        <footer className="text-xs text-muted-foreground">
          Refreshed at {refreshedAt} (server time)
        </footer>
      </div>
    </div>
  )
}
