import { NextRequest, NextResponse } from "next/server"
import { verifyWebhook } from "@clerk/nextjs/webhooks"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"

function getPrimaryEmailRecord(user: any): any | null {
  const primaryId = user?.primaryEmailAddressId ?? user?.primary_email_address_id
  const emailAddresses = user?.emailAddresses ?? user?.email_addresses ?? []
  return emailAddresses.find((item: any) => item?.id === primaryId) ?? null
}

function getPrimaryEmail(user: any): string | null {
  const record = getPrimaryEmailRecord(user)
  const email = record?.emailAddress ?? record?.email_address
  return typeof email === "string" ? email : null
}

function getEmailVerified(user: any): boolean | null {
  const record = getPrimaryEmailRecord(user)
  const status = record?.verification?.status
  if (typeof status !== "string") return null
  return status === "verified"
}

function getFullName(user: any): string | null {
  const direct = user?.fullName ?? user?.full_name
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim()
  }

  const firstName = user?.firstName ?? user?.first_name ?? ""
  const lastName = user?.lastName ?? user?.last_name ?? ""
  const joined = `${firstName} ${lastName}`.trim()
  return joined.length > 0 ? joined : null
}

export async function POST(req: NextRequest) {
  let event: any
  try {
    event = await verifyWebhook(req)
  } catch (error) {
    console.error("[clerk-webhook] Verification failed:", error)
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 })
  }

  const supabase = createServiceSupabaseClient()

  try {
    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const user = event.data
        const clerkUserId = user?.id as string | undefined
        const email = getPrimaryEmail(user)

        if (!clerkUserId || !email) {
          return NextResponse.json({ received: true, skipped: true })
        }

        const fullName = getFullName(user)
        const avatarUrl = user?.imageUrl ?? user?.image_url ?? null
        const emailVerified = getEmailVerified(user)
        const baseUpdate = {
          clerk_user_id: clerkUserId,
          email,
          full_name: fullName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        } as Record<string, string | boolean | null>

        if (emailVerified !== null) {
          baseUpdate.email_verified = emailVerified
        }

        const { data: byClerkId } = await supabase
          .from("profiles")
          .select("id")
          .eq("clerk_user_id", clerkUserId)
          .maybeSingle()

        if (byClerkId?.id) {
          await supabase.from("profiles").update(baseUpdate).eq("id", byClerkId.id)
          return NextResponse.json({ received: true })
        }

        const { data: byEmail } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle()

        if (!byEmail?.id) {
          // Keep this non-failing because profiles.id has an auth.users FK and cannot be created from Clerk-only IDs.
          console.warn("[clerk-webhook] No matching profile found for Clerk user", {
            clerkUserId,
            email,
          })
          return NextResponse.json({ received: true, skipped: true })
        }

        await supabase.from("profiles").update(baseUpdate).eq("id", byEmail.id)
        return NextResponse.json({ received: true })
      }

      case "user.deleted": {
        const clerkUserId = event?.data?.id as string | undefined
        if (clerkUserId) {
          await supabase
            .from("profiles")
            .update({ clerk_user_id: null, updated_at: new Date().toISOString() })
            .eq("clerk_user_id", clerkUserId)
        }
        return NextResponse.json({ received: true })
      }

      default:
        return NextResponse.json({ received: true })
    }
  } catch (error) {
    console.error("[clerk-webhook] Processing failed:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
