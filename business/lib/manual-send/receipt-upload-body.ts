import {
  MANUAL_SEND_RECEIPT_ALLOWED_MIME,
  validateManualSendReceiptBytes,
  validateManualSendReferenceCode,
} from "@/lib/manual-send/receipt-storage-shared"

export type ParsedReceiptUpload =
  | {
      ok: true
      bytes: Buffer
      contentType: string
      referenceCode: string
      originalFilename?: string | null
    }
  | { ok: false; error: string; status: number }

function parseReferenceCode(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  return raw.trim()
}

export async function parseManualSendReceiptJsonBody(request: Request): Promise<ParsedReceiptUpload> {
  let body: {
    fileBase64?: unknown
    mimeType?: unknown
    filename?: unknown
    referenceCode?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return { ok: false, error: "Invalid JSON.", status: 400 }
  }

  const referenceCode = parseReferenceCode(body.referenceCode)
  if (!referenceCode) {
    return { ok: false, error: "referenceCode is required.", status: 400 }
  }
  const refErr = validateManualSendReferenceCode(referenceCode)
  if (refErr) return { ok: false, error: refErr, status: 400 }

  const raw =
    typeof body.fileBase64 === "string" ? body.fileBase64.replace(/\s/g, "") : ""
  if (!raw) return { ok: false, error: "Missing file.", status: 400 }

  let bytes: Buffer
  try {
    bytes = Buffer.from(raw, "base64")
  } catch {
    return { ok: false, error: "Invalid file data.", status: 400 }
  }

  const contentType =
    typeof body.mimeType === "string" && body.mimeType.trim()
      ? body.mimeType.trim()
      : "application/octet-stream"

  if (!MANUAL_SEND_RECEIPT_ALLOWED_MIME.has(contentType)) {
    return { ok: false, error: "Use JPEG, PNG, WebP, GIF, or PDF.", status: 400 }
  }

  const v = validateManualSendReceiptBytes(bytes, contentType)
  if (!v.ok) return { ok: false, error: v.error, status: 400 }

  const originalFilename =
    typeof body.filename === "string" && body.filename.trim() ? body.filename.trim() : null

  return { ok: true, bytes, contentType, referenceCode, originalFilename }
}

export async function parseManualSendReceiptFormData(request: Request): Promise<ParsedReceiptUpload> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return { ok: false, error: "Invalid form data.", status: 400 }
  }

  const referenceCode = parseReferenceCode(form.get("referenceCode"))
  if (!referenceCode) {
    return { ok: false, error: "referenceCode is required.", status: 400 }
  }
  const refErr = validateManualSendReferenceCode(referenceCode)
  if (refErr) return { ok: false, error: refErr, status: 400 }

  const raw = form.get("file")
  if (!raw || typeof raw === "string") {
    return { ok: false, error: "Missing file.", status: 400 }
  }

  const blob = raw as Blob
  const bytes = Buffer.from(await blob.arrayBuffer())
  const contentType =
    typeof blob.type === "string" && blob.type.trim() ? blob.type.trim() : "application/octet-stream"

  const v = validateManualSendReceiptBytes(bytes, contentType)
  if (!v.ok) return { ok: false, error: v.error, status: 400 }

  const originalFilename =
    typeof (raw as File).name === "string" && (raw as File).name.trim()
      ? (raw as File).name.trim()
      : null

  return { ok: true, bytes, contentType, referenceCode, originalFilename }
}
