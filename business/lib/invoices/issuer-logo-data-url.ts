/** Convert a public image URL into a data URL for `@react-pdf/renderer` Image. */
export async function fetchIssuerLogoDataUrl(url: string | null | undefined): Promise<string | null> {
  const trimmed = typeof url === "string" ? url.trim() : ""
  if (!trimmed) return null
  if (trimmed.startsWith("data:")) return trimmed

  try {
    const res = await fetch(trimmed)
    if (!res.ok) return null
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png"
    if (!contentType.startsWith("image/")) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0) return null
    return `data:${contentType};base64,${uint8ToBase64(bytes)}`
  } catch {
    return null
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64")
  }
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
