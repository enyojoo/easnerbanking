import type { PayoutCorridorPublic, PayoutRail } from "./payout-corridor"

export type ProviderRoutingEntry = {
  provider: string
  priority: number
  settlement_asset?: string
}

export type ProviderHealthStatus = "ok" | "unavailable"

export type BalanceCurrencyPolicyPublic = {
  code: string
  available: boolean
  active: boolean
}

export type CryptoDestinationPublic = {
  id: string
  asset_code: string
  asset_name: string
  networks: string[]
  country_code: string | null
  sort_order: number | null
  provider_routing?: ProviderRoutingEntry[]
  provider_health?: Record<string, ProviderHealthStatus>
}

export type SendDestinationsFiat = {
  bank_transfer: PayoutCorridorPublic[]
  mobile_money: PayoutCorridorPublic[]
}

export type SendDestinationsResponse = {
  catalog_version: string
  balance_currencies: BalanceCurrencyPolicyPublic[]
  fiat: SendDestinationsFiat
  crypto: CryptoDestinationPublic[]
}

export type PayoutRailFilter = PayoutRail | "all"
