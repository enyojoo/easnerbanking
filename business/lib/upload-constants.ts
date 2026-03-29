/** Server + client shared limits for profile / org logo uploads */
export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024

export const UPLOAD_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

export function extensionForMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/gif") return "gif"
  return "bin"
}
