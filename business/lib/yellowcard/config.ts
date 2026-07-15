const YC_SANDBOX_ORIGIN = "https://sandbox.api.yellowcard.io"
const YC_PRODUCTION_ORIGIN = "https://api.yellowcard.io"

export function getYellowcardApiKey(): string {
  return (process.env.YELLOWCARD_API_KEY || "").trim()
}

export function getYellowcardApiSecret(): string {
  return (process.env.YELLOWCARD_API_SECRET || "").trim()
}

export function getYellowcardEnvironment(): "sandbox" | "production" {
  const env = (process.env.YELLOWCARD_ENVIRONMENT || "sandbox").trim().toLowerCase()
  return env === "production" ? "production" : "sandbox"
}

/** API origin without trailing `/business`. */
export function getYellowcardApiOrigin(): string {
  const configured = process.env.YELLOWCARD_API_BASE_URL?.trim()
  if (configured) {
    return configured.replace(/\/business\/?$/, "").replace(/\/$/, "")
  }
  return getYellowcardEnvironment() === "production" ? YC_PRODUCTION_ORIGIN : YC_SANDBOX_ORIGIN
}

/** OpenAPI path segment signed in HMAC — always `/business/...`, query string excluded. */
export function toYellowcardSignedPath(path: string): string {
  const withoutQuery = path.split("?")[0] ?? path
  const p = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`
  if (p.startsWith("/business/") || p === "/business") return p
  return `/business${p}`
}

/** Full request path for the HTTP URL (includes query string when present). */
export function toYellowcardRequestPath(path: string): string {
  const raw = path.startsWith("/") ? path : `/${path}`
  const [pathname, query = ""] = raw.split("?")
  const signedPathname = toYellowcardSignedPath(pathname ?? raw)
  return query ? `${signedPathname}?${query}` : signedPathname
}
