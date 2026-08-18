export function normalizeOrigin(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null
    return url.origin
  } catch {
    return null
  }
}

export function normalizeReturnUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed.replace("{CHECKOUT_SESSION_ID}", "placeholder"))
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null
    return trimmed
  } catch {
    return null
  }
}
