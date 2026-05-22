import { UPLOAD_ALLOWED_MIME, UPLOAD_MAX_BYTES } from "@/lib/upload-constants"

export type ParsedAvatarUpload =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; error: string; status: number }

function validateAvatarBytes(buf: Buffer, contentType: string): ParsedAvatarUpload {
  if (buf.length === 0) {
    return { ok: false, error: "Empty image.", status: 400 }
  }
  if (buf.length > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: `Image must be ${UPLOAD_MAX_BYTES / (1024 * 1024)}MB or smaller.`,
      status: 400,
    }
  }
  if (!UPLOAD_ALLOWED_MIME.has(contentType)) {
    return { ok: false, error: "Use JPEG, PNG, WebP, or GIF.", status: 400 }
  }
  return { ok: true, bytes: buf, contentType }
}

/** JSON body from mobile (`imageBase64` + optional `mimeType`). */
export async function parseProfileAvatarJsonBody(request: Request): Promise<ParsedAvatarUpload> {
  let body: { imageBase64?: unknown; mimeType?: unknown }
  try {
    body = (await request.json()) as { imageBase64?: unknown; mimeType?: unknown }
  } catch {
    return { ok: false, error: "Invalid JSON.", status: 400 }
  }

  const raw =
    typeof body.imageBase64 === "string" ? body.imageBase64.replace(/\s/g, "") : ""
  if (!raw) {
    return { ok: false, error: "Missing image.", status: 400 }
  }

  let buf: Buffer
  try {
    buf = Buffer.from(raw, "base64")
  } catch {
    return { ok: false, error: "Invalid image data.", status: 400 }
  }

  const requested =
    typeof body.mimeType === "string" && body.mimeType.trim() ? body.mimeType.trim() : "image/jpeg"
  return validateAvatarBytes(buf, requested)
}

/** Multipart `file` field from web `FormData`. */
export async function parseProfileAvatarFormFile(
  raw: FormDataEntryValue | null
): Promise<ParsedAvatarUpload> {
  if (!raw || typeof raw === "string") {
    return { ok: false, error: "Missing file.", status: 400 }
  }

  const blob = raw as Blob
  const buf = Buffer.from(await blob.arrayBuffer())
  const contentType =
    typeof blob.type === "string" && blob.type.trim() ? blob.type.trim() : "image/jpeg"
  return validateAvatarBytes(buf, contentType)
}
