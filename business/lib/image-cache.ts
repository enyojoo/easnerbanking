const IMAGE_CACHE_TTL_DAYS = 30
const IMAGE_CACHE_TTL_MS = IMAGE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000

function cacheBucket(nowMs: number = Date.now()): string {
  return String(Math.floor(nowMs / IMAGE_CACHE_TTL_MS))
}

function applyVersion(url: string, paramName: string, version: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.set(paramName, version)
    return parsed.toString()
  } catch {
    const [base, hash = ""] = url.split("#", 2)
    const sep = base.includes("?") ? "&" : "?"
    return `${base}${sep}${encodeURIComponent(paramName)}=${encodeURIComponent(version)}${hash ? `#${hash}` : ""}`
  }
}

function normalizeImageUrl(value: unknown, paramName: string): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const needle = `${encodeURIComponent(paramName)}=`
  if (trimmed.includes(`?${needle}`) || trimmed.includes(`&${needle}`)) return trimmed
  return applyVersion(trimmed, paramName, cacheBucket())
}

function bustImageUrl(value: unknown, paramName: string, version = String(Date.now())): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return applyVersion(trimmed, paramName, version)
}

export function normalizeProfileImageUrl(value: unknown): string | null {
  return normalizeImageUrl(value, "av")
}

export function normalizeBusinessLogoUrl(value: unknown): string | null {
  return normalizeImageUrl(value, "blv")
}

export function bustProfileImageUrl(value: unknown, version?: string): string | null {
  return bustImageUrl(value, "av", version)
}

export function bustBusinessLogoUrl(value: unknown, version?: string): string | null {
  return bustImageUrl(value, "blv", version)
}
