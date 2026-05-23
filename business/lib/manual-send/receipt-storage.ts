import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  extensionForReceiptMime,
  MANUAL_SEND_RECEIPTS_BUCKET,
  manualSendReceiptStoragePath,
  validateManualSendReceiptBytes,
  validateManualSendReferenceCode,
} from "@/lib/manual-send/receipt-storage-shared"

export {
  extensionForReceiptMime,
  isReceiptPathOwnedByUser,
  MANUAL_SEND_RECEIPT_ALLOWED_MIME,
  MANUAL_SEND_RECEIPT_MAX_BYTES,
  MANUAL_SEND_RECEIPTS_BUCKET,
  manualSendReceiptStoragePath,
  validateManualSendReceiptBytes,
  validateManualSendReferenceCode,
} from "@/lib/manual-send/receipt-storage-shared"

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
