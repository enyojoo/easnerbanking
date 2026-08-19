/** Lightspark Grid API configuration (sandbox-first). */

export function getGridBaseUrl(): string {
  const raw = String(process.env.GRID_BASE_URL || "").trim()
  if (raw) return raw.replace(/\/+$/, "")
  return "https://api.lightspark.com/grid/2025-10-13"
}

export function getGridClientId(): string {
  return String(process.env.GRID_CLIENT_ID || "").trim()
}

export function getGridClientSecret(): string {
  return String(process.env.GRID_CLIENT_SECRET || "").trim()
}

export function getGridWebhookPublicKey(): string | null {
  const raw = String(process.env.GRID_WEBHOOK_PUBLIC_KEY || "").trim()
  if (!raw) return null
  const unescaped = raw.replace(/\\n/g, "\n")
  if (unescaped.includes("BEGIN PUBLIC KEY")) return unescaped
  return `-----BEGIN PUBLIC KEY-----\n${unescaped}\n-----END PUBLIC KEY-----`
}

/** @deprecated Grid uses ECDSA public-key verification — set GRID_WEBHOOK_PUBLIC_KEY instead. */
export function getGridWebhookSecret(): string {
  return String(process.env.GRID_WEBHOOK_SECRET || "").trim()
}

export function getGridEnvironment(): "sandbox" | "production" {
  const v = String(process.env.GRID_ENVIRONMENT || "sandbox").trim().toLowerCase()
  return v === "production" || v === "prod" ? "production" : "sandbox"
}

export function isGridConfigured(): boolean {
  return Boolean(getGridClientId() && getGridClientSecret())
}

/** Default FX margin bps on Grid corridor rates (parity with YC/Noah). */
export function getGridPayoutMarginBps(): number {
  const parsed = Number.parseInt(process.env.GRID_PAYOUT_MARGIN_BPS || "50", 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 50
  return parsed
}

/** Quote TTL used for lock sessions when Grid does not return a future expiresAt (ms). */
export function getGridQuoteTtlMs(): number {
  const parsed = Number.parseInt(process.env.GRID_QUOTE_TTL_MS || String(15 * 60 * 1000), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 15 * 60 * 1000
  return parsed
}

/** Refresh the Grid quote at execute if fewer than this many ms remain. */
export function getGridQuoteRefreshBufferMs(): number {
  return 45_000
}

/** Reuse a confirm lock while the Grid quote is still valid. Do not use the 45s execute buffer — Grid quotes are often ~60s, so that buffer forced a second 20s POST /quotes. */
export function getGridQuoteConfirmReuseBufferMs(): number {
  return 5_000
}

export function gridQuoteNeedsRefresh(expiresAt?: string | null): boolean {
  const ms = expiresAt ? Date.parse(String(expiresAt)) : Number.NaN
  if (!Number.isFinite(ms)) return true
  return ms - Date.now() <= getGridQuoteRefreshBufferMs()
}

export function gridQuoteCanReuseOnConfirm(expiresAt?: string | null): boolean {
  const ms = expiresAt ? Date.parse(String(expiresAt)) : Number.NaN
  if (!Number.isFinite(ms)) return false
  return ms - Date.now() > getGridQuoteConfirmReuseBufferMs()
}

/** Prefer Grid's real rate-lock expiry when it is still in the future (YC parity). */
export function resolveGridQuoteExpiresAt(preferred?: string | null): string {
  if (preferred) {
    const ms = new Date(preferred).getTime()
    if (Number.isFinite(ms) && ms > Date.now()) {
      return new Date(ms).toISOString()
    }
  }
  return new Date(Date.now() + getGridQuoteTtlMs()).toISOString()
}

/** Return URL after hosted Grid KYB (SumSub) completes. */
export function getGridBusinessKybReturnUrl(): string {
  const explicit = String(process.env.GRID_BUSINESS_KYB_RETURN_URL || "").trim()
  if (explicit) return explicit
  const app = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").trim()
  if (app) return `${app.replace(/\/+$/, "")}/auth/grid-complete?context=business`
  return "http://localhost:3000/auth/grid-complete?context=business"
}

/** Return URL after hosted Grid KYC (individual / mobile) completes. */
export function getGridIndividualKycReturnUrl(): string {
  const explicit = String(process.env.GRID_KYC_RETURN_URL || "").trim()
  if (explicit) return explicit
  const app = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").trim()
  if (app) return `${app.replace(/\/+$/, "")}/auth/grid-complete?context=kyc`
  return "http://localhost:3000/auth/grid-complete?context=kyc"
}
