import { NextResponse } from "next/server"
import { getUserFromApiRequest, createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  isReceiptPathOwnedByUser,
  MANUAL_SEND_RECEIPTS_BUCKET,
  storeManualSendReceipt,
} from "@/lib/manual-send/receipt-storage"
import {
  parseManualSendReceiptFormData,
  parseManualSendReceiptJsonBody,
} from "@/lib/manual-send/receipt-upload-body"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const contentType = request.headers.get("content-type") ?? ""
  const parsed = contentType.includes("application/json")
    ? await parseManualSendReceiptJsonBody(request)
    : await parseManualSendReceiptFormData(request)

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }

  const stored = await storeManualSendReceipt({
    userId: user.id,
    referenceCode: parsed.referenceCode,
    bytes: parsed.bytes,
    contentType: parsed.contentType,
    originalFilename: parsed.originalFilename,
  })

  if ("error" in stored) {
    return NextResponse.json({ error: stored.error }, { status: 400 })
  }

  return NextResponse.json({ path: stored.path, filename: stored.filename })
}

/** Signed URL for a receipt the user uploaded (path in `transaction-receipts`). */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const path = new URL(request.url).searchParams.get("path")?.trim()
  if (!path) {
    return NextResponse.json({ error: "path query required" }, { status: 400 })
  }

  if (!isReceiptPathOwnedByUser(path, user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin.storage
    .from(MANUAL_SEND_RECEIPTS_BUCKET)
    .createSignedUrl(path, 3600)

  if (error || !data?.signedUrl) {
    console.error("manual send receipt signed url:", error)
    return NextResponse.json({ error: error?.message || "Failed to sign URL" }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
