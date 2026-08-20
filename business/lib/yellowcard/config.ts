const YC_SANDBOX_ORIGIN = "https://sandbox.api.yellowcard.io"
const YC_PRODUCTION_ORIGIN = "https://api.yellowcard.io"

export function getYellowcardApiKey(): string {
  return (process.env.YELLOWCARD_API_KEY || "").trim()
}

export function getYellowcardApiSecret(): string {
  return (process.env.YELLOWCARD_API_SECRET || "").trim()
}

/** True when Yellowcard API key + secret are configured. */
export function isYellowcardConfigured(): boolean {
  return Boolean(getYellowcardApiKey() && getYellowcardApiSecret())
}

export function getYellowcardEnvironment(): "sandbox" | "production" {
  const env = (process.env.YELLOWCARD_ENVIRONMENT || "sandbox").trim().toLowerCase()
  return env === "production" ? "production" : "sandbox"
}

/** Optional static-IP relay for production YC IP whitelisting (see business/yc-relay). */
export function getYellowcardRelayUrl(): string {
  return (process.env.YELLOWCARD_RELAY_URL || "").trim().replace(/\/$/, "")
}

export function getYellowcardRelaySecret(): string {
  return (process.env.YELLOWCARD_RELAY_SECRET || process.env.YC_RELAY_SECRET || "").trim()
}

function envTruthy(name: string): boolean {
  const v = String(process.env[name] || "").trim().toLowerCase()
  return v === "true" || v === "1"
}

function envFalsy(name: string): boolean {
  const v = String(process.env[name] || "").trim().toLowerCase()
  return v === "false" || v === "0"
}

/**
 * Skip omnibus → YC wallet sends in sandbox (omnibus is a live wallet).
 * Set YC_CRYPTO_DEPOSIT_DRY_RUN=false to force live sends while YC is sandbox.
 * DEPOSIT_SPLIT_DRY_RUN=true also skips sends (shared with deposit split).
 */
export function isYcCryptoDepositDryRun(): boolean {
  if (envTruthy("DEPOSIT_SPLIT_DRY_RUN") || envTruthy("YC_CRYPTO_DEPOSIT_DRY_RUN")) {
    return true
  }
  if (envFalsy("YC_CRYPTO_DEPOSIT_DRY_RUN")) {
    return false
  }
  return getYellowcardEnvironment() === "sandbox"
}

/** API origin without trailing `/business`. */
export function getYellowcardApiOrigin(): string {
  const configured = process.env.YELLOWCARD_API_BASE_URL?.trim()
  if (configured) {
    return configured.replace(/\/business\/?$/, "").replace(/\/$/, "")
  }
  return getYellowcardEnvironment() === "production" ? YC_PRODUCTION_ORIGIN : YC_SANDBOX_ORIGIN
}

/** OpenAPI path segment signed in HMAC – always `/business/...`, query string excluded. */
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
