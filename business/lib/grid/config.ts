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

/** Quote TTL used for lock sessions (ms). */
export function getGridQuoteTtlMs(): number {
  const parsed = Number.parseInt(process.env.GRID_QUOTE_TTL_MS || String(15 * 60 * 1000), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 15 * 60 * 1000
  return parsed
}
