import type { ProviderHealthStatus, ProviderRoutingEntry } from "./send-destinations"

export type PayoutProviderId = "noah" | "yellowcard" | "grid"

export function resolvePrimaryPayoutProvider(
  routing: ProviderRoutingEntry[] | null | undefined,
): PayoutProviderId {
  const sorted = [...(routing ?? [])].sort((a, b) => a.priority - b.priority)
  const provider = String(sorted[0]?.provider ?? "")
    .trim()
    .toLowerCase()
  if (provider === "yellowcard") return "yellowcard"
  if (provider === "grid") return "grid"
  return "noah"
}

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
  needs_bank_code?: boolean
  limits?: { min?: string; max?: string }
  processing_seconds?: number
  amount_field_mode: "note" | "payment_purpose" | "note_optional_only"
}

/** Office corridor flags used to pick YC vs Grid vs Noah for local pay-in. */
export type PayoutCorridorPayInMetadata = {
  pay_in_provider?: string
  yc_receive?: boolean
  yc_receive_enabled?: boolean
  grid_receive?: boolean
  grid_receive_enabled?: boolean
  noah_receive?: boolean
  noah_receive_enabled?: boolean
  yc_send?: boolean
  grid_send?: boolean
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
  /** Live or synced Grid balance payout on this corridor rail. */
  grid_send_available?: boolean
  /** Live or synced Yellowcard send channel on this corridor rail. */
  yc_send_available?: boolean
  /** Live or synced Yellowcard local pay-in on this corridor rail. */
  yc_receive_available?: boolean
  /** Live or synced Grid local pay-in on this corridor rail. */
  grid_receive_available?: boolean
  provider_routing?: ProviderRoutingEntry[]
  provider_health?: Record<string, ProviderHealthStatus>
  /** Noah hints and/or nested `yellowcard` schema — see yc-recipient-schema. */
  fields_schema?: PayoutFieldsSchemaHint | import("./yc-recipient-schema").PayoutCorridorFieldsSchema | null
  /** Pay-in routing flags from Office (subset of corridor metadata). */
  metadata?: PayoutCorridorPayInMetadata | null
}

export function corridorDisplayLabel(c: Pick<PayoutCorridorPublic, "country_name" | "currency_code" | "currency_name">): string {
  return `${c.country_name} · ${c.currency_name} (${c.currency_code})`
}

/** ISO-3166 alpha-2 for country flags (never derive from currency alone in corridor flows). */
export function flagCodeFromCorridor(c: Pick<PayoutCorridorPublic, "country_code">): string {
  return String(c.country_code || "").toUpperCase()
}

function normCorridorToken(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase()
}

/** Safe match for catalog rows — skips malformed entries missing country/currency codes. */
export function corridorMatchesCountryCurrency(
  c: Pick<PayoutCorridorPublic, "country_code" | "currency_code" | "rail">,
  input: { countryCode: string; currencyCode: string; rail?: PayoutRail },
): boolean {
  const cc = normCorridorToken(input.countryCode)
  const cur = normCorridorToken(input.currencyCode)
  if (!cc || !cur) return false
  if (input.rail != null && c.rail !== input.rail) return false
  return normCorridorToken(c.country_code) === cc && normCorridorToken(c.currency_code) === cur
}

/** True when balance payout routes through Yellowcard direct settlement. */
export function isYcBalancePayoutCorridor(
  corridor: Pick<PayoutCorridorPublic, "provider_routing"> | null | undefined,
): boolean {
  if (!corridor) return false
  return resolvePrimaryPayoutProvider(corridor.provider_routing) === "yellowcard"
}

/** True when balance payout routes through Grid quote lock + execute. */
export function isGridBalancePayoutCorridor(
  corridor: Pick<PayoutCorridorPublic, "provider_routing"> | null | undefined,
): boolean {
  if (!corridor) return false
  return resolvePrimaryPayoutProvider(corridor.provider_routing) === "grid"
}

/** Primary Office provider for USD balance → local fiat payout on this corridor. */
export function resolveBalancePayoutProvider(
  corridor: Pick<PayoutCorridorPublic, "provider_routing"> | null | undefined,
): PayoutProviderId | null {
  if (!corridor) return null
  return resolvePrimaryPayoutProvider(corridor.provider_routing)
}

/** True when balance payout uses Noah sell/prepare (not YC direct or Grid quote lock). */
export function isNoahBalancePayoutCorridor(
  corridor: Pick<PayoutCorridorPublic, "provider_routing"> | null | undefined,
): boolean {
  if (!corridor) return false
  return resolvePrimaryPayoutProvider(corridor.provider_routing) === "noah"
}

/**
 * True when the Office-selected primary payout provider can execute on this corridor.
 * Non-Noah primaries trust routing unless explicitly marked unavailable.
 */
export function isBalancePayoutCorridorExecutable(
  corridor:
    | Pick<
        PayoutCorridorPublic,
        | "provider_routing"
        | "noah_sell_available"
        | "grid_send_available"
        | "yc_send_available"
        | "provider_health"
      >
    | null
    | undefined,
): boolean {
  if (!corridor) return false
  const primary = resolvePrimaryPayoutProvider(corridor.provider_routing)

  if (primary === "grid") {
    if (corridor.provider_health?.grid === "unavailable") return false
    if (corridor.grid_send_available === false) return false
    return true
  }

  if (primary === "yellowcard") {
    if (corridor.provider_health?.yellowcard === "unavailable") return false
    if (corridor.yc_send_available === false) return false
    return true
  }

  if (corridor.provider_health?.noah === "unavailable") return false
  return corridor.noah_sell_available === true
}
