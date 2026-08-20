import { depositOmnibusSolanaAddressUsd } from "@/lib/deposit-omnibus/config"

const RELAY_BASE_DEFAULT = "https://api.relay.link"

export function getRelayBaseUrl(): string {
  const raw = String(process.env.RELAY_BASE_URL || RELAY_BASE_DEFAULT).trim()
  return raw.replace(/\/$/, "") || RELAY_BASE_DEFAULT
}

export function getRelayApiKey(): string {
  return String(process.env.RELAY_API_KEY || "").trim()
}

export function requireRelayApiKey(): string {
  const key = getRelayApiKey()
  if (!key) throw new Error("RELAY_API_KEY not configured")
  return key
}

export function isRelayConfigured(): boolean {
  return Boolean(getRelayApiKey())
}

/** Relay bridge wallet send is on whenever Relay is configured. */
export function isRelayWalletSendEnabled(): boolean {
  return isRelayConfigured()
}

/** Tron inbound deposit addresses are on whenever Relay is configured. */
export function isRelayTronInboundEnabled(): boolean {
  return isRelayConfigured()
}

export function isRelaySponsorshipEnabled(): boolean {
  const raw = String(process.env.RELAY_SPONSORSHIP_ENABLED ?? "false").trim().toLowerCase()
  return raw === "true" || raw === "1" || raw === "on"
}

export function relayQuoteFeeParams(): {
  subsidizeFees?: boolean
  maxSubsidizationAmount?: string
} {
  if (!isRelaySponsorshipEnabled()) return {}
  return { subsidizeFees: true }
}

export function getRelayBridgeMinSourceUsdc(): number {
  const parsed = Number.parseFloat(String(process.env.RELAY_BRIDGE_MIN_FROM_USDC || ""))
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return 7
}

/** Wallet send (Turnkey direct + Relay bridge) is always enabled. */
export function isWalletSendEnabled(): boolean {
  return true
}

/** Valid Tron wallet for Relay quote probes only (never send real funds here). */
const RELAY_RATE_PROBE_TRON_ADDRESS_DEFAULT = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"

/**
 * Easner-controlled Tron address for Relay Tron USDT deposit provisioning.
 * Used as `user` + `refundTo` when requesting open deposit addresses (origin = Tron).
 * Same idea as WALLET_SEND_FEE_SOLANA_ADDRESS_* – one platform treasury, not per customer.
 */
export function resolveRelayTronPlatformAddress(): string | null {
  return String(process.env.RELAY_TRON_PLATFORM_ADDRESS || "").trim() || null
}

export function requireRelayTronPlatformAddress(): string {
  const addr = resolveRelayTronPlatformAddress()
  if (!addr) {
    throw new Error("RELAY_TRON_PLATFORM_ADDRESS is not configured")
  }
  return addr
}

/** Dummy Tron recipient for rate/payout quote probes (not used for live deposits). */
export function relayRateProbeTronAddress(): string {
  return RELAY_RATE_PROBE_TRON_ADDRESS_DEFAULT
}

/** Solana address for bridge rate probing and quote previews (same as USD omnibus). */
export function resolveCryptoRatesProbeSolAddress(): string | null {
  return depositOmnibusSolanaAddressUsd()
}

export function requireCryptoRatesProbeSolAddress(): string {
  const addr = resolveCryptoRatesProbeSolAddress()
  if (!addr) {
    throw new Error("Set DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD for bridge rate probing.")
  }
  return addr
}
