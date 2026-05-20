/**
 * Turnkey production configuration (server-side only).
 * @see https://docs.turnkey.com/getting-started/quickstart
 */

export function getTurnkeyOrganizationId(): string {
  return (process.env.TURNKEY_ORGANIZATION_ID || process.env.TURNKEY_ORG_ID || "").trim()
}

export function getTurnkeyApiPublicKey(): string {
  return (process.env.TURNKEY_API_PUBLIC_KEY || "").trim()
}

export function getTurnkeyApiPrivateKey(): string {
  return (process.env.TURNKEY_API_PRIVATE_KEY || "").trim()
}

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
  return process.env.TURNKEY_WALLET_AUTOPROVISION_ENABLED !== "false"
}

export function isTurnkeyConfigured(): boolean {
  return Boolean(
    getTurnkeyOrganizationId() && getTurnkeyApiPublicKey() && getTurnkeyApiPrivateKey(),
  )
}

export function validateTurnkeyEnvForProduction(): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (!getTurnkeyOrganizationId()) missing.push("TURNKEY_ORGANIZATION_ID")
  if (!getTurnkeyApiPublicKey()) missing.push("TURNKEY_API_PUBLIC_KEY")
  if (!getTurnkeyApiPrivateKey()) missing.push("TURNKEY_API_PRIVATE_KEY")
  return { ok: missing.length === 0, missing }
}

/** Optional: `TURNKEY_WEBHOOK_SECRET` for HMAC verification on `POST /api/webhooks/turnkey`. */
export function getTurnkeyWebhookSecret(): string {
  return (process.env.TURNKEY_WEBHOOK_SECRET || "").trim()
}

export function isTurnkeyBalanceWebhooksIngestEnabled(): boolean {
  return (
    process.env.TURNKEY_BALANCE_WEBHOOKS_ENABLED === "1" ||
    process.env.TURNKEY_BALANCE_WEBHOOKS_ENABLED === "true"
  )
}

export function getTurnkeyBalanceWebhookEndpointId(): string {
  return (process.env.TURNKEY_BALANCE_WEBHOOK_ENDPOINT_ID || "").trim()
}

/** Organization-level Turnkey activity webhook destination. */
export function getTurnkeyWebhookFeatureUrl(): string {
  const explicit = (process.env.TURNKEY_WEBHOOK_URL || "").trim()
  if (explicit) return explicit
  const base =
    (process.env.BUSINESS_APP_URL || process.env.NEXT_PUBLIC_BUSINESS_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim()
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
  return process.env.TURNKEY_ONCHAIN_BALANCE_QUERY !== "false"
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
  return process.env.TURNKEY_SOL_SPONSORSHIP_ENABLED !== "false"
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
  return process.env.TURNKEY_SERVER_SUB_ORG_CREATION_ENABLED !== "false"
}
