import Link from "next/link"
import { requireAdmin } from "@/lib/auth/admin"
import { getApiAvailabilitySnapshot } from "@/lib/dev/api-availability"
import { ApiAvailabilityPanel } from "./api-availability-panel"

export const dynamic = "force-dynamic"

function devTogglesAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_API_TOGGLES === "true"
}

export default async function ApiAvailabilityPage() {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link href="/dev" className="mb-2 inline-block text-sm text-blue-600 hover:text-blue-700">
            Back to dev tools
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">API Availability</h1>
          <p className="mt-2 text-gray-600">
            Toggle selected server APIs on or off while testing unavailable-service states.
          </p>
        </div>

        <ApiAvailabilityPanel
          initialEnabled={devTogglesAllowed()}
          initialApis={getApiAvailabilitySnapshot()}
        />
      </div>
    </div>
  )
}
