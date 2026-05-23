import type { ProviderHealthStatus, ProviderRoutingEntry } from "./send-destinations"

export type PayoutRail = "bank_transfer" | "mobile_money"

/** Public shape returned by GET /api/payout-corridors */
export type PayoutCorridorPublic = {
  id: string
  rail: PayoutRail
  country_code: string
  country_name: string
  currency_code: string
  currency_name: string
  sort_order: number | null
  /**
   * Mobile money: office-curated allow-list of network labels (UI). Bank: usually null.
   * Not necessarily payment-API identifiers; integrations map at quote/payout time.
   */
  providers: unknown
  /** When true, Noah GET /channels/sell returns at least one channel for this corridor (executable payout). */
  noah_sell_available?: boolean
  provider_routing?: ProviderRoutingEntry[]
  provider_health?: Record<string, ProviderHealthStatus>
}

export function corridorDisplayLabel(c: Pick<PayoutCorridorPublic, "country_name" | "currency_code" | "currency_name">): string {
  return `${c.country_name} · ${c.currency_name} (${c.currency_code})`
}

/** ISO-3166 alpha-2 for country flags (never derive from currency alone in corridor flows). */
export function flagCodeFromCorridor(c: Pick<PayoutCorridorPublic, "country_code">): string {
  return String(c.country_code || "").toUpperCase()
}
