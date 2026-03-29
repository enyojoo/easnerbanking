import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { extensionForMime, UPLOAD_ALLOWED_MIME, UPLOAD_MAX_BYTES } from "@/lib/upload-constants"

export type UploadImageResult = { url: string; path: string }

/**
 * Uploads an image to a public Storage bucket using the service role.
 * Path is scoped so only this API (enforcing auth) should write here.
 */
export async function uploadPublicImage(params: {
  bucket: "avatars" | "org-logos"
  path: string
  bytes: Buffer
  contentType: string
}): Promise<UploadImageResult | { error: string }> {
  const { bucket, path, bytes, contentType } = params

  if (bytes.length > UPLOAD_MAX_BYTES) {
    return { error: `Image must be ${UPLOAD_MAX_BYTES / (1024 * 1024)}MB or smaller.` }
  }
  if (!UPLOAD_ALLOWED_MIME.has(contentType)) {
    return { error: "Use JPEG, PNG, WebP, or GIF." }
  }

  const admin = createSupabaseAdmin()
  const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  })

  if (uploadError) {
    console.error("storage upload:", uploadError)
    return { error: uploadError.message || "Upload failed." }
  }

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path)
  if (!pub?.publicUrl) {
    return { error: "Could not resolve public URL for upload." }
  }

  return { url: pub.publicUrl, path }
}

export function validateImageFile(file: File): { ok: true } | { ok: false; error: string } {
  if (!UPLOAD_ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: "Use JPEG, PNG, WebP, or GIF." }
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return { ok: false, error: `Image must be ${UPLOAD_MAX_BYTES / (1024 * 1024)}MB or smaller.` }
  }
  return { ok: true }
}

export { extensionForMime }
