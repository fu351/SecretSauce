/**
 * POST /api/receipt/scan
 *
 * Image-bytes → server-side OCR → parsed receipt → optional persist.
 *
 * This is the recommended path for receipt capture. The Python service runs
 * EasyOCR/PaddleOCR/ensemble with the recommender + escalation chain (see
 * docs/ocr-pipeline-architecture.md).
 *
 * Flow:
 *   1. Verify Clerk auth (this is the trust boundary; Python API trusts proxy).
 *   2. Forward multipart upload to Python `/receipt/scan`.
 *   3. If `persist=true` (default), forward the parsed result to the existing
 *      /api/receipt/process route for pantry_items + ingredient_match_queue
 *      ingestion. Reuses the existing persistence pipeline — no schema changes.
 *
 * Form-data inputs:
 *   file        (required) The receipt image (≤20MB).
 *   strategy    "auto" (default) | "easyocr" | "paddle" | "ensemble"
 *   store_hint  Optional store name for the recommender.
 *   persist     "true" (default) | "false". When false, returns the parsed
 *               result without writing to the DB — useful for preview UIs
 *               that show the user what was detected before they confirm.
 *
 * Response:
 *   { success: boolean,
 *     scan: <ReceiptScanResponse from python-api>,
 *     persisted?: <ProcessReceiptResponse from /api/receipt/process>,
 *     error?: string }
 */

import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createHash } from "crypto"
import { profileIdFromClerkUserId } from "@/lib/auth/clerk-profile-id"
import { createServiceSupabaseClient } from "@/lib/database/supabase-server"

export const runtime = "nodejs"
// Receipt OCR can take multiple seconds on the Python side. Match the
// Python-side hard cap and bump Vercel's edge function timeout.
export const maxDuration = 30

const PYTHON_SERVICE_URL =
  process.env.PYTHON_SERVICE_URL || process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL

const TRAINING_BUCKET = "receipt-training-images"

/** Decide whether the candidate parse can be auto-accepted into the training
 *  set or needs human verification. Mirrors _confidence_from_parse on the
 *  Python side but uses the diagnostic chain to bias toward review when any
 *  LLM tier had to fire (= the easy path didn't work). */
function decideDisposition(scan: any): "auto_accepted" | "needs_review" | "rejected" {
  const conf: number = typeof scan?.parse_confidence === "number" ? scan.parse_confidence : 0
  const result = scan?.result ?? {}
  const itemsCount: number = Array.isArray(result?.items) ? result.items.length : 0
  const hasTotal = result?.total != null
  const hasStore = !!result?.store && result.store !== "Unknown"
  const subtotal: number | null = result?.subtotal ?? null
  const total: number | null = result?.total ?? null
  const taxes: Array<{ amount?: number }> = Array.isArray(result?.taxes) ? result.taxes : []
  const taxSum = taxes.reduce((s, t) => s + (t?.amount ?? 0), 0)
  const checksumResidual =
    subtotal != null && total != null ? Math.abs(subtotal + taxSum - total) : null

  // Hard reject if the parse is clearly junk — don't poison the training set.
  // Saving these would create false-positive training examples that teach the
  // classifier wrong patterns.
  if (!hasStore && !hasTotal && itemsCount === 0) return "rejected"
  if (checksumResidual != null && checksumResidual > 5.0) return "rejected"

  // Auto-accept criteria — strict on purpose. Better to send a few easy
  // cases through human review than to admit garbage as gold-standard data.
  // Auto-accept ONLY when:
  //   - confidence is high
  //   - no LLM tier had to fire (the OCR + parser path got it on its own)
  //   - checksum balances within a cent
  //   - we have a non-trivial number of items
  const llmFired = !!scan?.llm_tokens_used || !!scan?.llm_vision_used
  if (
    conf >= 0.85 &&
    !llmFired &&
    hasStore &&
    hasTotal &&
    itemsCount >= 2 &&
    (checksumResidual == null || checksumResidual <= 0.05)
  ) {
    return "auto_accepted"
  }

  return "needs_review"
}

/** Persist the receipt image to the training-images bucket and insert a row
 *  in receipt_training_examples with the candidate parse + disposition.
 *  Failures are logged but never bubble — capturing training data is best-
 *  effort and must not affect the user's primary scan request. */
async function captureTrainingExample(opts: {
  userId: string
  imageBytes: Buffer
  fileName: string
  contentType: string
  scan: any
}): Promise<{ trainingId: string | null; disposition: string }> {
  const disposition = decideDisposition(opts.scan)

  // Skip writes for the explicit reject case — no point uploading the image.
  if (disposition === "rejected") {
    return { trainingId: null, disposition }
  }

  const sb = createServiceSupabaseClient()
  const sha = createHash("sha256").update(opts.imageBytes).digest("hex")

  // Dedupe: if we've already captured this exact image (same sha256), reuse
  // the existing row rather than creating a duplicate. The user can rescan
  // the same paper receipt without polluting the training set.
  const { data: existing } = await sb
    .from("receipt_training_examples")
    .select("id, disposition")
    .eq("image_sha256", sha)
    .is("deleted_at", null)
    .maybeSingle()
  if (existing?.id) {
    return { trainingId: existing.id, disposition: existing.disposition ?? disposition }
  }

  const ext = opts.fileName.includes(".") ? opts.fileName.split(".").pop()!.toLowerCase() : "jpg"
  const safeExt = ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext) ? ext : "jpg"
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  const path = `${opts.userId.replace(/-/g, "")}/${yyyy}/${mm}/${sha.slice(0, 16)}.${safeExt}`

  const upload = await sb.storage
    .from(TRAINING_BUCKET)
    .upload(path, opts.imageBytes, {
      contentType: opts.contentType,
      upsert: false,
      cacheControl: "31536000",
    })
  if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) {
    console.error("[receipt/scan] training upload failed:", upload.error.message)
    return { trainingId: null, disposition }
  }

  const { data: inserted, error: insertErr } = await sb
    .from("receipt_training_examples")
    .insert({
      user_id: opts.userId,
      image_storage_path: path,
      image_sha256: sha,
      candidate_parse: opts.scan.result,
      strategy_used: opts.scan.strategy_used ?? null,
      strategies_tried: opts.scan.strategies_tried ?? [],
      parse_confidence: opts.scan.parse_confidence ?? null,
      disposition,
      verified_by: disposition === "auto_accepted" ? "auto" : null,
      verified_at: disposition === "auto_accepted" ? new Date().toISOString() : null,
    })
    .select("id")
    .single()
  if (insertErr) {
    console.error("[receipt/scan] training insert failed:", insertErr.message)
    return { trainingId: null, disposition }
  }
  return { trainingId: inserted?.id ?? null, disposition }
}

export async function POST(request: NextRequest) {
  // --- Auth: Clerk is the only trust boundary; python-api trusts the proxy.
  const authState = await auth()
  const clerkUserId = authState?.userId
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!PYTHON_SERVICE_URL) {
    return NextResponse.json(
      { success: false, error: "Python service URL not configured" },
      { status: 500 },
    )
  }

  // --- Validate that this is multipart/form-data with an image.
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { success: false, error: "Expected multipart/form-data" },
      { status: 400 },
    )
  }

  const file = form.get("file")
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { success: false, error: "Missing 'file' field in form data" },
      { status: 400 },
    )
  }

  // Pull the optional knobs through to python-api.
  const strategy = (form.get("strategy") ?? "auto") as string
  const storeHint = form.get("store_hint")
  const persistFlag = (form.get("persist") ?? "true") as string
  const shouldPersist = persistFlag === "true" || persistFlag === "1"
  // Default ON — every scan contributes to the training flywheel unless the
  // caller explicitly opts out via capture_for_training=false.
  const captureFlag = (form.get("capture_for_training") ?? "true") as string
  const shouldCapture = captureFlag === "true" || captureFlag === "1"

  // Read the image bytes once. We need them both for forwarding to python-api
  // AND (optionally) for the training-set upload. ArrayBuffer → Buffer is cheap.
  const fileArrayBuffer = await (file as Blob).arrayBuffer()
  const fileBuffer = Buffer.from(fileArrayBuffer)
  const fileName = (file as File).name || "receipt.jpg"
  const contentType = (file as Blob).type || "image/jpeg"

  // --- Forward to python-api as multipart.
  // Wrap the buffer in a Blob so we can forward it without re-reading the
  // request body (which is already consumed).
  const upstreamForm = new FormData()
  upstreamForm.append("file", new Blob([fileBuffer], { type: contentType }), fileName)
  upstreamForm.append("strategy", strategy)
  if (storeHint) upstreamForm.append("store_hint", storeHint as string)

  let scanResp: Response
  try {
    scanResp = await fetch(
      `${PYTHON_SERVICE_URL.replace(/\/$/, "")}/receipt/scan`,
      { method: "POST", body: upstreamForm },
    )
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: `Could not reach OCR service: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 502 },
    )
  }

  if (!scanResp.ok) {
    const txt = await scanResp.text().catch(() => "")
    return NextResponse.json(
      { success: false, error: `OCR service ${scanResp.status}: ${txt}` },
      { status: 502 },
    )
  }

  const scan = await scanResp.json()
  if (!scan?.success || !scan?.result) {
    return NextResponse.json(
      { success: false, scan, error: scan?.error ?? "OCR returned no result" },
      { status: 200 },
    )
  }

  // --- Capture for training set (best-effort, never blocks the user).
  let trainingId: string | null = null
  let trainingDisposition: string | null = null
  if (shouldCapture) {
    try {
      const userId = profileIdFromClerkUserId(clerkUserId)
      const cap = await captureTrainingExample({
        userId,
        imageBytes: fileBuffer,
        fileName,
        contentType,
        scan,
      })
      trainingId = cap.trainingId
      trainingDisposition = cap.disposition
      // Echo back into the scan payload so downstream UIs can show
      // "we captured this for training" without an extra round trip.
      scan.training_id = trainingId
      scan.training_disposition = trainingDisposition
    } catch (e) {
      console.error(
        "[receipt/scan] training capture threw:",
        e instanceof Error ? e.message : String(e),
      )
    }
  }

  // --- Persistence path: forward to existing /api/receipt/process.
  if (!shouldPersist) {
    return NextResponse.json({ success: true, scan, training_id: trainingId, training_disposition: trainingDisposition })
  }

  // Reconstruct the URL pointing at our own /api/receipt/process. We forward
  // cookies so Clerk auth re-validates inside the downstream route.
  const processUrl = new URL("/api/receipt/process", request.url).toString()
  let processResp: Response
  try {
    processResp = await fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        parsedReceipt: {
          store: scan.result.store,
          date: scan.result.date,
          items: scan.result.items,
          subtotal: scan.result.subtotal,
          total: scan.result.total,
        },
      }),
    })
  } catch (e) {
    return NextResponse.json({
      success: true,
      scan,
      persisted: null,
      error: `Scan succeeded but persistence call failed: ${
        e instanceof Error ? e.message : String(e)
      }`,
    })
  }

  const persisted = await processResp.json().catch(() => null)
  return NextResponse.json({
    success: processResp.ok && persisted?.success !== false,
    scan,
    persisted,
    training_id: trainingId,
    training_disposition: trainingDisposition,
  })
}
