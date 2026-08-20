const JPEG = "image/jpeg"
const PNG = "image/png"
const PDF = "application/pdf"
const HEIC = "image/heic"

const HEIC_BRANDS = new Set(["heic", "heif", "mif1", "msf1", "heix"])

export function sniffKybDocumentContentType(bytes: Buffer, declared: string): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return JPEG
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return PNG
  }
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "%PDF") return PDF
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("ascii").trim().toLowerCase()
    if (HEIC_BRANDS.has(brand)) return HEIC
  }
  const raw = String(declared ?? "").trim().toLowerCase()
  if (raw === "image/jpg" || raw === "image/pjpeg") return JPEG
  if (raw === "image/heif" || raw === "image/heic-sequence") return HEIC
  return String(declared ?? "").trim() || "application/octet-stream"
}

export async function normalizeKybDocumentBytes(input: {
  bytes: Buffer
  contentType: string
  fileName: string
}): Promise<{ bytes: Buffer; contentType: string; fileName: string } | { error: string }> {
  const sniffed = sniffKybDocumentContentType(input.bytes, input.contentType)
  if (sniffed === JPEG || sniffed === PNG || sniffed === PDF) {
    return { bytes: input.bytes, contentType: sniffed, fileName: input.fileName }
  }
  if (sniffed === HEIC || sniffed.includes("heic") || sniffed.includes("heif")) {
    try {
      const sharp = (await import("sharp")).default
      const jpeg = await sharp(input.bytes).rotate().jpeg({ quality: 90 }).toBuffer()
      const fileName = input.fileName.replace(/\.(heic|heif)$/i, ".jpg") || "id.jpg"
      return { bytes: jpeg, contentType: JPEG, fileName }
    } catch (error) {
      console.warn("[grid/kyb/documents] HEIC convert:", error)
      return {
        error: "Use a JPEG or PNG photo of the physical ID. iPhone screenshots and HEIC exports are often rejected.",
      }
    }
  }
  return { error: "Use PDF, JPEG, or PNG." }
}
