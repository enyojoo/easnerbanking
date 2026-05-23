import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isEasnerClientTransactionIdFormat } from "@/lib/transaction-id"

export const MANUAL_SEND_RECEIPTS_BUCKET = "transaction-receipts" as const

/** Private bucket paths: `receipts/{userId}/{referenceCode}.{ext}` */
export const MANUAL_SEND_RECEIPT_MAX_BYTES = 10 * 1024 * 1024

export const MANUAL_SEND_RECEIPT_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
])

export function extensionForReceiptMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/gif") return "gif"
  if (mime === "application/pdf") return "pdf"
  return "bin"
}

export function manualSendReceiptStoragePath(userId: string, referenceCode: string, ext: string): string {
  const ref = referenceCode.trim().toUpperCase()
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin"
  return `receipts/${userId}/${ref}.${safeExt}`
}

export function validateManualSendReferenceCode(referenceCode: string): string | null {
  const ref = referenceCode.trim()
  if (!isEasnerClientTransactionIdFormat(ref)) {
    return "Invalid reference code."
  }
  return null
}

export function validateManualSendReceiptBytes(
  bytes: Buffer,
  contentType: string,
): { ok: true } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "Empty file." }
  if (bytes.length > MANUAL_SEND_RECEIPT_MAX_BYTES) {
    return {
      ok: false,
      error: `Receipt must be ${MANUAL_SEND_RECEIPT_MAX_BYTES / (1024 * 1024)}MB or smaller.`,
    }
  }
  if (!MANUAL_SEND_RECEIPT_ALLOWED_MIME.has(contentType)) {
    return { ok: false, error: "Use JPEG, PNG, WebP, GIF, or PDF." }
  }
  return { ok: true }
}

export async function storeManualSendReceipt(params: {
  userId: string
  referenceCode: string
  bytes: Buffer
  contentType: string
  originalFilename?: string | null
}): Promise<{ path: string; filename: string } | { error: string }> {
  const refErr = validateManualSendReferenceCode(params.referenceCode)
  if (refErr) return { error: refErr }

  const v = validateManualSendReceiptBytes(params.bytes, params.contentType)
  if (!v.ok) return { error: v.error }

  const ext = extensionForReceiptMime(params.contentType)
  const path = manualSendReceiptStoragePath(params.userId, params.referenceCode, ext)
  const filename =
    params.originalFilename?.trim() ||
    `${params.referenceCode.trim().toUpperCase()}.${ext}`

  const admin = createSupabaseAdmin()
  const { error: uploadError } = await admin.storage
    .from(MANUAL_SEND_RECEIPTS_BUCKET)
    .upload(path, params.bytes, {
      contentType: params.contentType,
      upsert: true,
    })

  if (uploadError) {
    console.error("manual send receipt upload:", uploadError)
    return { error: uploadError.message || "Upload failed." }
  }

  return { path, filename }
}

/** User may only access paths under their own prefix. */
export function isReceiptPathOwnedByUser(path: string, userId: string): boolean {
  const normalized = path.trim().replace(/^\/+/, "")
  return normalized.startsWith(`receipts/${userId}/`)
}
