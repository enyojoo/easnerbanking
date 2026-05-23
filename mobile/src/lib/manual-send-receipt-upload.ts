/**
 * Upload manual-send receipt via business API → Supabase `transaction-receipts`.
 */
import { getApiBaseUrl } from './apiClient'
import { fileToBase64 } from './fileUtils'
import { getSessionReliable } from './authSession'

/** Aligned with `business/lib/manual-send/receipt-storage.ts` */
export const MANUAL_SEND_RECEIPT_MAX_BYTES = 10 * 1024 * 1024

export type UploadManualSendReceiptResult =
  | { path: string; filename: string }
  | { error: string }

export async function uploadManualSendReceipt(input: {
  referenceCode: string
  uri: string
  mimeType?: string | null
  name?: string | null
}): Promise<UploadManualSendReceiptResult> {
  try {
    const session = await getSessionReliable()
    if (!session?.access_token) {
      return { error: 'Sign in to upload.' }
    }

    const mime =
      input.mimeType?.trim() ||
      (input.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')

    const fileBase64 = await fileToBase64(input.uri)
    const estimatedBytes = Math.ceil((fileBase64.length * 3) / 4)
    if (estimatedBytes > MANUAL_SEND_RECEIPT_MAX_BYTES) {
      return { error: 'Receipt must be 10MB or smaller.' }
    }

    const apiBase = getApiBaseUrl()
    const res = await fetch(`${apiBase}/api/manual-send/receipts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        referenceCode: input.referenceCode,
        fileBase64,
        mimeType: mime,
        filename: input.name ?? undefined,
      }),
    })

    const text = await res.text()
    let json: { path?: string; filename?: string; error?: string } = {}
    try {
      if (text) json = JSON.parse(text) as typeof json
    } catch {
      return { error: text || 'Upload failed.' }
    }

    if (!res.ok) {
      return { error: json.error || `Upload failed (${res.status}).` }
    }
    if (!json.path) {
      return { error: 'Upload failed.' }
    }

    return { path: json.path, filename: json.filename ?? input.name ?? 'receipt' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg || 'Upload failed.' }
  }
}
