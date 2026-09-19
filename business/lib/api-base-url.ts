/**
 * Single API origin for Business, Platform, payer hosts, and RSC.
 *
 * Phase 1a: set `NEXT_PUBLIC_API_URL=https://api.easner.com` even while DNS
 * still points at the business deploy. Local: `http://localhost:3000` (same
 * process until a separate api project exists).
 */
export function getApiBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (explicit) return stripTrailingSlash(explicit)
  if (typeof window !== "undefined") return window.location.origin
  return "http://localhost:3000"
}

/** Absolute URL for a same-app `/api/...` or `/v1/...` path. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const base = getApiBaseUrl()
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

/** Resolve a fetch input so relative `/api` paths hit the API origin. */
export function resolveApiRequestInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === "string") {
    if (input.startsWith("/")) return apiUrl(input)
    return input
  }
  if (input instanceof URL && input.origin === "null") {
    return apiUrl(`${input.pathname}${input.search}${input.hash}`)
  }
  return input
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "")
}
