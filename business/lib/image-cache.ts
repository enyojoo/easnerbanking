import { warmImageUrl } from "@easner/shared"

const VERSION_STORAGE_KEY = "easner_image_ver_v1"
const versionMemory = new Map<string, string>()

function imageIdentityKey(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.search = ""
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return url.split("#", 1)[0]?.split("?", 1)[0] ?? url
  }
}

function readVersionMap(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(VERSION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

function rememberVersion(identity: string, version: string): void {
  if (!identity || !version) return
  versionMemory.set(identity, version)
  if (typeof window === "undefined") return
  try {
    const next = { ...readVersionMap(), [identity]: version }
    localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // quota / private mode
  }
}

function rememberedVersion(identity: string): string | null {
  const fromMemory = versionMemory.get(identity)
  if (fromMemory) return fromMemory
  const fromLs = readVersionMap()[identity]
  if (typeof fromLs === "string" && fromLs.trim()) {
    versionMemory.set(identity, fromLs)
    return fromLs
  }
  return null
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

function readParam(url: string, paramName: string): string | null {
  try {
    const parsed = new URL(url)
    const value = parsed.searchParams.get(paramName)
    return value && value.trim() ? value : null
  } catch {
    const needle = `${encodeURIComponent(paramName)}=`
    const query = url.split("#", 1)[0]?.split("?", 2)[1] ?? ""
    for (const part of query.split("&")) {
      if (part.startsWith(needle)) {
        const value = decodeURIComponent(part.slice(needle.length))
        return value.trim() ? value : null
      }
    }
    return null
  }
}

/**
 * Long-lived browser cache: keep a stable version query param.
 * Revalidate by changing the param (upload bust) – not a rotating time bucket.
 */
function normalizeImageUrl(value: unknown, paramName: string): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const existing = readParam(trimmed, paramName)
  if (existing) {
    rememberVersion(imageIdentityKey(trimmed), existing)
    return trimmed
  }
  const stored = rememberedVersion(imageIdentityKey(trimmed))
  if (stored) return applyVersion(trimmed, paramName, stored)
  return trimmed
}

function bustImageUrl(value: unknown, paramName: string, version = String(Date.now())): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  rememberVersion(imageIdentityKey(trimmed), version)
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

export function warmProfileImageUrl(value: unknown): void {
  const url = normalizeProfileImageUrl(value)
  if (url) warmImageUrl(url)
}

export function warmBusinessLogoUrl(value: unknown): void {
  const url = normalizeBusinessLogoUrl(value)
  if (url) warmImageUrl(url)
}

export function profileImageSrc(value: unknown): string | undefined {
  return normalizeProfileImageUrl(value) ?? undefined
}
