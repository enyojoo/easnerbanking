import type { ProviderHealthStatus, ProviderRoutingEntry } from "./send-destinations"

export type PayoutRail = "bank_transfer" | "mobile_money"

/** Normalized Noah FormSchema hints for recipient + send UI. */
export type PayoutFieldsSchemaHint = {
  channel_id?: string
  payment_method_type?: string
  form_schema_hash?: string
  reference_required?: boolean
  reference_optional?: boolean
  payment_purpose_enum?: string[]
  bank_enum?: string[]
  /** Mobile money: labels from Noah Identifier channels (e.g. M-PESA for KE). */
  mobile_provider_labels?: string[]
  needs_phone?: boolean
  needs_email?: boolean
  needs_address?: boolean
  needs_branch_code?: boolean
  needs_sort_code?: boolean
  limits?: { min?: string; max?: string }
  processing_seconds?: number
  amount_field_mode: "note" | "payment_purpose" | "note_optional_only"
}

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
  /** From Noah GET /channels/sell — bank enums, reference rules, purpose list. */
  fields_schema?: PayoutFieldsSchemaHint | null
}

export function corridorDisplayLabel(c: Pick<PayoutCorridorPublic, "country_name" | "currency_code" | "currency_name">): string {
  return `${c.country_name} · ${c.currency_name} (${c.currency_code})`
}

/** ISO-3166 alpha-2 for country flags (never derive from currency alone in corridor flows). */
export function flagCodeFromCorridor(c: Pick<PayoutCorridorPublic, "country_code">): string {
  return String(c.country_code || "").toUpperCase()
}
