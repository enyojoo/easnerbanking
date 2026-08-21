export const KYB_DOCUMENTS_BUCKET = "kyb-documents"

export const KYB_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

export const KYB_DOCUMENT_TOO_LARGE =
  "This file is over 10 MB. Use a smaller PDF, or photograph the physical ID as a JPEG or PNG."

export function extensionFromKybFileName(fileName: string): string {
  const match = String(fileName ?? "")
    .toLowerCase()
    .match(/\.([a-z0-9]{2,8})$/)
  if (!match) return "bin"
  if (match[1] === "jpeg") return "jpg"
  if (match[1] === "heif") return "heic"
  return match[1]
}

export function extensionFromKybContentType(contentType: string): string {
  if (contentType === "application/pdf") return "pdf"
  if (contentType === "image/png") return "png"
  if (contentType === "image/jpeg") return "jpg"
  if (contentType === "image/heic" || contentType === "image/heif") return "heic"
  return "bin"
}

export function isOwnedKybDocumentPath(
  businessId: string,
  applicationId: string,
  path: string,
): boolean {
  const prefix = `${businessId}/${applicationId}/`
  if (!path.startsWith(prefix) || path.includes("..") || path.includes("//")) return false
  const rest = path.slice(prefix.length)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,8}$/i.test(
    rest,
  )
}
