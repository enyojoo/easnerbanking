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
