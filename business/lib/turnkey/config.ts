/**
 * Turnkey production configuration (server-side only).
 * @see https://docs.turnkey.com/getting-started/quickstart
 */

function isProductionDeploy(): boolean {
  const vercelEnv = (process.env.VERCEL_ENV || "").trim().toLowerCase()
  if (vercelEnv === "production") return true
  if (vercelEnv === "preview" || vercelEnv === "development") return false
  return process.env.NODE_ENV === "production"
}

/** Env boolean with deploy-aware default when unset. Explicit env always wins. */
function envBoolean(name: string, defaultWhenUnset: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase()
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true
  if (raw === "false" || raw === "0" || raw === "off" || raw === "no") return false
  return defaultWhenUnset
}

export function getTurnkeyOrganizationId(): string {
  return (process.env.TURNKEY_ORGANIZATION_ID || process.env.TURNKEY_ORG_ID || "").trim()
}

export function getTurnkeyApiPublicKey(): string {
  return (process.env.TURNKEY_API_PUBLIC_KEY || "").trim()
}

/** Turnkey CLI writes `hex:p256` – SDK expects hex only. */
function normalizeTurnkeyPrivateKey(raw: string): string {
  const v = String(raw ?? "").trim()
  const colon = v.indexOf(":")
  if (colon > 0 && /^[0-9a-f]+$/i.test(v.slice(0, colon))) {
    return v.slice(0, colon)
  }
  return v
}

export function getTurnkeyApiPrivateKey(): string {
  return normalizeTurnkeyPrivateKey(process.env.TURNKEY_API_PRIVATE_KEY || "")
}

/** Non-root delegated-access (DA) API key – day-to-day signing only. */
export function getTurnkeyDaApiPublicKey(): string {
  return (process.env.TURNKEY_DA_API_PUBLIC_KEY || "").trim()
}

export function getTurnkeyDaApiPrivateKey(): string {
  return normalizeTurnkeyPrivateKey(process.env.TURNKEY_DA_API_PRIVATE_KEY || "")
}

export function isTurnkeyDaConfigured(): boolean {
  return Boolean(getTurnkeyDaApiPublicKey() && getTurnkeyDaApiPrivateKey())
}

/**
 * When DA API keys are configured, send paths auto-use DA for migrated orgs/sub-orgs.
 * No separate enable flag – readiness is detected from DB (sub-orgs) or Turnkey (parent).
 *
 * Optional `TURNKEY_DA_SENDS_STRICT=true`: manual override to fail closed during partial migration.
 * When omitted, full migration is auto-detected from DB + Turnkey and fail-closed applies automatically.
 */
export function isTurnkeyDaSendsStrict(): boolean {
  return (
    process.env.TURNKEY_DA_SENDS_STRICT === "1" ||
    process.env.TURNKEY_DA_SENDS_STRICT === "true"
  )
}

/**
 * @deprecated Use `isTurnkeyDaConfigured()` – DA sends auto-wire when keys + readiness exist.
 * Kept for backward compat: explicit `false` disables auto DA even when keys are set.
 */
export function isTurnkeyDaSendsEnabled(): boolean {
  const raw = (process.env.TURNKEY_DA_SENDS_ENABLED || "").trim().toLowerCase()
  if (raw === "false" || raw === "0") return false
  if (raw === "true" || raw === "1") return true
  return isTurnkeyDaConfigured()
}

/**
 * @deprecated Parent readiness is auto-detected via Turnkey listUsers or TURNKEY_PARENT_DA_USER_ID.
 */
export function isTurnkeyParentDaReady(): boolean {
  if (process.env.TURNKEY_PARENT_DA_READY === "false") return false
  if (
    process.env.TURNKEY_PARENT_DA_READY === "1" ||
    process.env.TURNKEY_PARENT_DA_READY === "true"
  ) {
    return true
  }
  return Boolean(getTurnkeyParentDaUserIdFromEnv())
}

/** Optional: set by migration script to skip parent listUsers on every request. */
export function getTurnkeyParentDaUserIdFromEnv(): string {
  return (process.env.TURNKEY_PARENT_DA_USER_ID || "").trim()
}

/** Optional: parent org user id for the server provisioning API key (createSubOrganization). */
export function getTurnkeyServerRootUserIdFromEnv(): string {
  return (process.env.TURNKEY_SERVER_ROOT_USER_ID || "").trim()
}

/** Display name for the non-root DA user in each Turnkey org. */
export const TURNKEY_CUSTODIAL_DA_USER_NAME = "easner-da"

/** Must match the curve used when the parent org API key was created (P256 vs SECP256K1). */
export function getTurnkeyApiKeyCurveType(): string {
  return (process.env.TURNKEY_API_KEY_CURVE || "API_KEY_CURVE_P256").trim()
}

export function getTurnkeyApiBaseUrl(): string {
  const raw = (process.env.TURNKEY_API_BASE_URL || "https://api.turnkey.com").replace(/\/$/, "")
  return raw
}

/** Optional shared sub-org for integration testing when mobile has not linked a user sub-org yet. */
export function getTurnkeyFallbackSubOrganizationId(): string {
  return (process.env.TURNKEY_FALLBACK_SUB_ORGAN_ID || "").trim()
}

export function isTurnkeyWalletAutoprovisionEnabled(): boolean {
  return envBoolean("TURNKEY_WALLET_AUTOPROVISION_ENABLED", true)
}

export function isTurnkeyConfigured(): boolean {
  return Boolean(
    getTurnkeyOrganizationId() && getTurnkeyApiPublicKey() && getTurnkeyApiPrivateKey(),
  )
}

/** Root (provision/admin) credentials present – not required on send-only runtimes. */
export function isTurnkeyRootProvisioningConfigured(): boolean {
  return isTurnkeyConfigured()
}

/** Production send runtime: DA keys + org id (root optional if provisioning is elsewhere). */
export function isTurnkeySendRuntimeConfigured(): boolean {
  return Boolean(getTurnkeyOrganizationId() && isTurnkeyDaConfigured())
}

export function validateTurnkeyEnvForProduction(): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (!getTurnkeyOrganizationId()) missing.push("TURNKEY_ORGANIZATION_ID")
  if (!isTurnkeyDaConfigured()) {
    missing.push("TURNKEY_DA_API_PUBLIC_KEY")
    missing.push("TURNKEY_DA_API_PRIVATE_KEY")
  }
  if (!isTurnkeyRootProvisioningConfigured()) {
    missing.push("TURNKEY_API_PUBLIC_KEY (provisioning)")
    missing.push("TURNKEY_API_PRIVATE_KEY (provisioning)")
  }
  return { ok: missing.length === 0, missing }
}

/** Optional: `TURNKEY_WEBHOOK_SECRET` for HMAC verification on `POST /api/webhooks/turnkey`. */
export function getTurnkeyWebhookSecret(): string {
  return (process.env.TURNKEY_WEBHOOK_SECRET || "").trim()
}

export function isTurnkeyBalanceWebhooksIngestEnabled(): boolean {
  return envBoolean("TURNKEY_BALANCE_WEBHOOKS_ENABLED", isProductionDeploy())
}

/** Production default: strict webhook signature verification (no compatibility bypass). */
export function isTurnkeyWebhookStrictSignatureEnabled(): boolean {
  return envBoolean("TURNKEY_WEBHOOK_STRICT_SIGNATURE", isProductionDeploy())
}

/** Never accept unsigned webhooks in production unless explicitly overridden (dev only). */
export function isTurnkeyWebhookAllowUnsignedEnabled(): boolean {
  if (isProductionDeploy()) return false
  return envBoolean("TURNKEY_WEBHOOK_ALLOW_UNSIGNED", false)
}

export function getTurnkeyBalanceWebhookEndpointId(): string {
  return (process.env.TURNKEY_BALANCE_WEBHOOK_ENDPOINT_ID || "").trim()
}

/** Organization-level Turnkey activity webhook destination. */
export function getTurnkeyWebhookFeatureUrl(): string {
  const explicit = (process.env.TURNKEY_WEBHOOK_URL || "").trim()
  if (explicit) return explicit
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim()
  const base =
    (process.env.BUSINESS_APP_URL ||
      process.env.NEXT_PUBLIC_BUSINESS_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (vercel ? `https://${vercel.replace(/^https?:\/\//, "")}` : "")).trim()
  if (!base) return ""
  try {
    const u = new URL(base)
    u.pathname = "/api/webhooks/turnkey"
    u.search = ""
    u.hash = ""
    return u.toString().replace(/\/$/, "")
  } catch {
    return ""
  }
}

/** Set to `"false"` to skip `getWalletAddressBalances` (UI shows zero balances for the on-chain line). */
export function isTurnkeyOnChainBalanceQueryEnabled(): boolean {
  return envBoolean("TURNKEY_ONCHAIN_BALANCE_QUERY", true)
}

/**
 * CAIP-2 chain id passed to Turnkey `getWalletAddressBalances` for Solana deposit addresses.
 * Must match the network where USDC/EURC were sent (mainnet vs devnet). Turnkey accepts
 * aliases like `solana:mainnet` and normalizes them.
 * @see https://docs.turnkey.com/api-reference/queries/get-balances
 */
export function getTurnkeyBalanceCaip2(): string {
  return (process.env.TURNKEY_BALANCE_CAIP2?.trim() || "solana:mainnet").trim()
}

/**
 * Enable Turnkey Gas Sponsorship on Solana sends.
 *
 * Requires Turnkey dashboard:
 * - Gas Sponsorship enabled
 * - (Recommended) Sponsor Solana Rent enabled for account-creation instructions
 */
export function isTurnkeySolSponsorshipEnabled(): boolean {
  return envBoolean("TURNKEY_SOL_SPONSORSHIP_ENABLED", isProductionDeploy())
}

/**
 * CAIP-2 chain id passed to Turnkey `solSendTransaction` for sponsored Solana sends.
 * Turnkey requires `caip2` when `sponsor: true`.
 *
 * Prefer `TURNKEY_SOLANA_CAIP2` when set; otherwise reuse `TURNKEY_BALANCE_CAIP2`
 * so devnet/mainnet stays consistent across balances and broadcasts.
 *
 * Accepted values include aliases like `solana:mainnet` / `solana:devnet`.
 * @see https://docs.turnkey.com/concepts/broadcasting#solana
 */
export function getTurnkeySolanaBroadcastCaip2(): string {
  const explicit = (process.env.TURNKEY_SOLANA_CAIP2 || "").trim()
  return (explicit || getTurnkeyBalanceCaip2()).trim()
}

/** When `false`, skip server-side `createSubOrganization` (e.g. bootstrap auto-provision). */
export function isTurnkeyServerSubOrgCreationEnabled(): boolean {
  return envBoolean("TURNKEY_SERVER_SUB_ORG_CREATION_ENABLED", true)
}
