export const APP_SURFACE_COOKIE_NAME = "easner_app_surface"
export const APP_SURFACE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

type StoredSurface = "business" | "platform"

/**
 * Host-only (no `Domain=`). Pay/invoice on sibling hosts must not inherit
 * the operator Banking / Dev mode cookie.
 *
 * Browser tool mode only — not an account preference. New browsers start
 * in Banking. Do not persist this on `users` or `businesses`.
 */
export function parseAppSurfaceCookieValue(raw: string | null | undefined): StoredSurface {
  const value = decodeCookieValue(raw).trim().toLowerCase()
  if (value === "platform") return "platform"
  return "business"
}

export function readAppSurfaceCookieFromDocument(cookieHeader: string): StoredSurface | null {
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${APP_SURFACE_COOKIE_NAME}=`))
  if (!match) return null
  return parseAppSurfaceCookieValue(match.slice(APP_SURFACE_COOKIE_NAME.length + 1))
}

export function readAppSurfaceCookie(): StoredSurface | null {
  if (typeof document === "undefined") return null
  return readAppSurfaceCookieFromDocument(document.cookie)
}

export function serializeAppSurfaceSetCookie(
  surface: StoredSurface,
  options?: { secure?: boolean },
): string {
  const parts = [
    `${APP_SURFACE_COOKIE_NAME}=${surface === "platform" ? "platform" : "business"}`,
    "Path=/",
    `Max-Age=${APP_SURFACE_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ]
  if (options?.secure) parts.push("Secure")
  return parts.join("; ")
}

export function serializeAppSurfaceClearCookie(): string {
  return `${APP_SURFACE_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function writeAppSurfaceCookie(surface: StoredSurface): void {
  if (typeof document === "undefined") return
  const secure = typeof location !== "undefined" && location.protocol === "https:"
  document.cookie = serializeAppSurfaceSetCookie(surface, { secure })
}

export function clearAppSurfaceCookie(): void {
  if (typeof document === "undefined") return
  document.cookie = serializeAppSurfaceClearCookie()
}

function decodeCookieValue(raw: string | null | undefined): string {
  if (!raw) return ""
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
