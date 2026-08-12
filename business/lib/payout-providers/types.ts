import type { ProviderRoutingEntry } from "@easner/shared"

export type PayoutProviderId = "noah" | "yellowcard" | string

export type PayoutRailKind = "bank_transfer" | "mobile_money"

export type CorridorContext = {
  countryCode: string
  currencyCode: string
  rail: PayoutRailKind
  providerRouting: ProviderRoutingEntry[]
  /** Sender business registration / user residence (Grid digital-asset payout gate). */
  senderCountryCode?: string | null
}

export interface PayoutProvider {
  id: PayoutProviderId
  supports(ctx: CorridorContext): Promise<boolean>
}

export class NoProviderForCorridorError extends Error {
  code = "NO_PROVIDER_FOR_CORRIDOR" as const
  constructor(message = "No payout provider available for this corridor.") {
    super(message)
    this.name = "NoProviderForCorridorError"
  }
}
