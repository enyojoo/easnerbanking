"use client"

import { KYB_DOCUMENT_MAX_BYTES, KYB_DOCUMENT_TOO_LARGE } from "@/lib/grid/kyb-document-limits"

function isProbablyImage(file: File): boolean {
  const type = (file.type || "").toLowerCase()
  const name = file.name.toLowerCase()
  return (
    type.startsWith("image/") ||
    /\.(jpe?g|png|heic|heif|webp)$/.test(name)
  )
}

async function canvasToJpeg(bitmap: ImageBitmap, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas")
  const maxEdge = 2400
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not prepare this image.")
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((next) => resolve(next), "image/jpeg", quality)
  })
  if (!blob) throw new Error("Could not prepare this image.")
  return blob
}

/** Shrink photos so Grid and storage stay under 10 MB. PDFs are left as-is. */
export async function prepareKybDocumentFile(file: File): Promise<File> {
  if (!isProbablyImage(file)) {
    if (file.size > KYB_DOCUMENT_MAX_BYTES) throw new Error(KYB_DOCUMENT_TOO_LARGE)
    return file
  }
  try {
    const bitmap = await createImageBitmap(file)
    try {
      let quality = 0.88
      let blob = await canvasToJpeg(bitmap, quality)
      while (blob.size > KYB_DOCUMENT_MAX_BYTES && quality > 0.5) {
        quality -= 0.12
        blob = await canvasToJpeg(bitmap, quality)
      }
      if (blob.size > KYB_DOCUMENT_MAX_BYTES) throw new Error(KYB_DOCUMENT_TOO_LARGE)
      const name = file.name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, ".jpg") || "id.jpg"
      return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() })
    } finally {
      bitmap.close()
    }
  } catch (error) {
    if (error instanceof Error && error.message === KYB_DOCUMENT_TOO_LARGE) throw error
    if (file.size > KYB_DOCUMENT_MAX_BYTES) throw new Error(KYB_DOCUMENT_TOO_LARGE)
    return file
  }
}
