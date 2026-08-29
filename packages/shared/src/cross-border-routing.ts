import { corridorOffersCrossBorder } from "./us-pay-in-mode"

export type CrossBorderProviderId = "yellowcard" | "grid"

export type CorridorOfficeCrossBorderRow = {
  country_code?: string | null
  currency_code?: string | null
  metadata?: unknown
}

/** Office Cross-border is opt-in. Unset or false is off. */
export function corridorOfficeCrossBorderEnabled(metadata: unknown): boolean {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {}
  return meta.cross_border_enabled === true
}

/** True when any catalog row for this country/currency has Office Cross-border on. */
export function catalogCorridorHasOfficeCrossBorder(
  rows: CorridorOfficeCrossBorderRow[],
  countryCode: string,
  currencyCode: string,
): boolean {
  if (!corridorOffersCrossBorder(countryCode, currencyCode)) return false
  const cc = countryCode.trim().toUpperCase()
  const cur = currencyCode.trim().toUpperCase()
  return rows.some((row) => {
    if (String(row.country_code ?? "").trim().toUpperCase() !== cc) return false
    if (String(row.currency_code ?? "").trim().toUpperCase() !== cur) return false
    return corridorOfficeCrossBorderEnabled(row.metadata)
  })
}

/**
 * Send amount → Through Local Currency.
 * Residence (source) corridor must have Cross-border on.
 * Destination corridors that offer Cross-border (not US USD) must also have it on.
 */
export function sendAmountOffersThroughLocalCurrency(input: {
  sourceCorridors: CorridorOfficeCrossBorderRow[]
  sourceCountry: string | null | undefined
  sourceCurrency: string | null | undefined
  destinationCountry: string
  destinationCurrency: string
  destinationCorridor: CorridorOfficeCrossBorderRow | null | undefined
}): boolean {
  const sourceCountry = String(input.sourceCountry ?? "").trim()
  const sourceCurrency = String(input.sourceCurrency ?? "").trim()
  if (!sourceCountry || !sourceCurrency) return false
  if (!catalogCorridorHasOfficeCrossBorder(input.sourceCorridors, sourceCountry, sourceCurrency)) {
    return false
  }
  if (!corridorOffersCrossBorder(input.destinationCountry, input.destinationCurrency)) {
    return true
  }
  return corridorOfficeCrossBorderEnabled(input.destinationCorridor?.metadata)
}

export function parseCrossBorderProvider(metadata: unknown): CrossBorderProviderId | null {
  const meta = (metadata ?? {}) as Record<string, unknown>
  const raw = String(meta.cross_border_provider ?? "")
    .trim()
    .toLowerCase()
  if (raw === "grid") return "grid"
  if (raw === "yellowcard" || raw === "yc") return "yellowcard"
  return null
}

/** Default when Office has not set `cross_border_provider` on the destination corridor. */
export function defaultCrossBorderProvider(input: {
  supportYellowcard: boolean
  supportGrid: boolean
}): CrossBorderProviderId | null {
  if (input.supportYellowcard && input.supportGrid) return "yellowcard"
  if (input.supportGrid) return "grid"
  if (input.supportYellowcard) return "yellowcard"
  return null
}
