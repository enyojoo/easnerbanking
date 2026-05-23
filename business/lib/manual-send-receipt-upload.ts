"use client"

import { fetchWithSession } from "@/lib/fetch-with-session"
import { MANUAL_SEND_RECEIPT_MAX_BYTES } from "@/lib/manual-send/receipt-storage"

export type UploadManualSendReceiptResult =
  | { path: string; filename: string }
  | { error: string }

export async function uploadManualSendReceiptFile(
  referenceCode: string,
  file: File,
): Promise<UploadManualSendReceiptResult> {
  if (file.size > MANUAL_SEND_RECEIPT_MAX_BYTES) {
    return { error: `Receipt must be ${MANUAL_SEND_RECEIPT_MAX_BYTES / (1024 * 1024)}MB or smaller.` }
  }

  const form = new FormData()
  form.append("referenceCode", referenceCode)
  form.append("file", file)

  const res = await fetchWithSession("/api/manual-send/receipts", {
    method: "POST",
    body: form,
  })

  const json = (await res.json()) as { path?: string; filename?: string; error?: string }
  if (!res.ok) return { error: json.error ?? "Upload failed." }
  if (!json.path) return { error: "Upload failed." }
  return { path: json.path, filename: json.filename ?? file.name }
}
