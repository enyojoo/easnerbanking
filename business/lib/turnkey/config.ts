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

/** Set to `"false"` to skip `getWalletAddressBalances` (UI shows zero balances for the on-chain line). */
export function isTurnkeyOnChainBalanceQueryEnabled(): boolean {
  return process.env.TURNKEY_ONCHAIN_BALANCE_QUERY !== "false"
}

/** When `false`, skip server-side `createSubOrganization` (e.g. bootstrap auto-provision). */
export function isTurnkeyServerSubOrgCreationEnabled(): boolean {
  return process.env.TURNKEY_SERVER_SUB_ORG_CREATION_ENABLED !== "false"
}
