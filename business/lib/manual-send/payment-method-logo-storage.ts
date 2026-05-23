import { randomUUID } from "crypto"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export const PAYMENT_METHOD_LOGOS_BUCKET = "payment-method-logos" as const

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
])

const MAX_BYTES = 2 * 1024 * 1024

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/svg+xml") return "svg"
  return "bin"
}

export function validatePaymentMethodLogoFile(file: File): { ok: true } | { ok: false; error: string } {
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: "Use SVG, PNG, JPEG, or WebP." }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Logo must be 2MB or smaller." }
  }
  return { ok: true }
}

export async function storePaymentMethodDisplayLogo(
  bytes: Buffer,
  contentType: string,
): Promise<{ url: string; path: string } | { error: string }> {
  if (bytes.length > MAX_BYTES) {
    return { error: "Logo must be 2MB or smaller." }
  }
  if (!ALLOWED_MIME.has(contentType)) {
    return { error: "Use SVG, PNG, JPEG, or WebP." }
  }

  const ext = extensionForMime(contentType)
  const path = `logos/${randomUUID()}.${ext}`
  const admin = createSupabaseAdmin()
  const { error: uploadError } = await admin.storage.from(PAYMENT_METHOD_LOGOS_BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  })

  if (uploadError) {
    console.error("[payment-method-logos] upload:", uploadError.message)
    return { error: uploadError.message || "Upload failed." }
  }

  const { data: pub } = admin.storage.from(PAYMENT_METHOD_LOGOS_BUCKET).getPublicUrl(path)
  if (!pub?.publicUrl) {
    return { error: "Could not resolve public URL for upload." }
  }

  return { url: pub.publicUrl, path }
}

/** Extract object path from a public Storage URL for this bucket. */
export function paymentMethodLogoPathFromPublicUrl(publicUrl: string): string | null {
  const raw = publicUrl.trim()
  if (!raw) return null
  try {
    const pathname = raw.startsWith("http") ? new URL(raw).pathname : raw.replace(/^\//, "")
    const marker = `/storage/v1/object/public/${PAYMENT_METHOD_LOGOS_BUCKET}/`
    const idx = pathname.indexOf(marker)
    if (idx !== -1) {
      return decodeURIComponent(pathname.slice(idx + marker.length))
    }
    if (pathname.startsWith("logos/")) {
      return decodeURIComponent(pathname)
    }
    return null
  } catch {
    return null
  }
}

export async function deletePaymentMethodDisplayLogoByUrl(
  publicUrl: string | null | undefined,
): Promise<{ ok: true } | { error: string }> {
  const path = publicUrl ? paymentMethodLogoPathFromPublicUrl(publicUrl) : null
  if (!path) {
    return { ok: true }
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin.storage.from(PAYMENT_METHOD_LOGOS_BUCKET).remove([path])
  if (error) {
    console.error("[payment-method-logos] delete:", error.message)
    return { error: error.message || "Failed to delete logo from storage." }
  }
  return { ok: true }
}
