/** Office USD/EUR bank pay-in product mode. Persist `va` / `va_express`; omit or `disabled` when off. */
export type UsPayInMode = "disabled" | "va" | "va_express"

export type UsPayInModeOption = {
  value: Exclude<UsPayInMode, "disabled">
  label: string
}

export const US_PAY_IN_MODE_OPTIONS: UsPayInModeOption[] = [
  { value: "va", label: "VA only" },
  { value: "va_express", label: "VA & Express" },
]

export function isUsUsdCorridor(countryCode: string, currencyCode: string): boolean {
  return (
    String(countryCode ?? "").trim().toUpperCase() === "US" &&
    String(currencyCode ?? "").trim().toUpperCase() === "USD"
  )
}

/** Office Pay-in uses VA / VA & Express instead of a Noah/YC/Grid provider pick. */
export function isVaExpressPayInCorridor(countryCode: string, currencyCode: string): boolean {
  if (isUsUsdCorridor(countryCode, currencyCode)) return true
  return String(currencyCode ?? "").trim().toUpperCase() === "EUR"
}

/** US USD is domestic payout + VA/Express — not a YC/Grid local-currency cross-border corridor. */
export function corridorOffersCrossBorder(countryCode: string, currencyCode: string): boolean {
  return !isUsUsdCorridor(countryCode, currencyCode)
}

export function parseUsPayInMode(value: unknown): UsPayInMode | null {
  const raw = String(value ?? "").trim().toLowerCase()
  if (raw === "disabled" || raw === "off") return "disabled"
  if (raw === "va" || raw === "va_only") return "va"
  if (raw === "va_express" || raw === "va_and_express" || raw === "va-express") return "va_express"
  return null
}

function metadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {}
  return metadata as Record<string, unknown>
}

/** Legacy Office US pay-in was a single Grid/Noah provider pick. */
export function usPayInLegacyEnabled(metadata: unknown): boolean {
  const meta = metadataRecord(metadata)
  const provider = String(meta.pay_in_provider ?? "").trim().toLowerCase()
  if (provider === "noah" || provider === "grid" || provider === "yellowcard" || provider === "bridge") {
    return true
  }
  if (meta.grid_receive_enabled === true) return true
  if (meta.bridge_receive_enabled === true) return true
  if (meta.noah_receive_enabled === true) return true
  if (meta.yc_receive_enabled === true) return true
  if (meta.stripe_express_enabled === true) return true
  return false
}

export function resolveUsPayInMode(metadata: unknown): UsPayInMode {
  const explicit = parseUsPayInMode(metadataRecord(metadata).pay_in_mode)
  if (explicit) return explicit
  return usPayInLegacyEnabled(metadata) ? "va_express" : "disabled"
}

/** Missing catalog row: keep today's VA + Express UX until Office saves a mode. */
export function resolveUsPayInModeFromCorridor(
  row: { metadata?: unknown; enabled?: boolean | null } | null | undefined,
): UsPayInMode {
  if (!row) return "va_express"
  if (row.enabled === false) return "disabled"
  return resolveUsPayInMode(row.metadata)
}

export function usPayInAllowsVa(mode: UsPayInMode): boolean {
  return mode === "va" || mode === "va_express"
}

export function usPayInAllowsExpress(mode: UsPayInMode): boolean {
  return mode === "va_express"
}

export function clearUsCrossBorderMetadata(metadata: Record<string, unknown>): void {
  metadata.cross_border_enabled = false
  delete metadata.cross_border_provider
}

export function applyUsPayInModeToMetadata(
  metadata: Record<string, unknown>,
  mode: UsPayInMode,
  opts?: { clearCrossBorder?: boolean },
): Record<string, unknown> {
  const next = { ...metadata }
  if (opts?.clearCrossBorder !== false) {
    clearUsCrossBorderMetadata(next)
  }
  if (mode === "disabled") {
    delete next.pay_in_mode
    delete next.pay_in_provider
    next.grid_receive_enabled = false
    next.bridge_receive_enabled = false
    next.noah_receive_enabled = false
    next.yc_receive_enabled = false
    next.stripe_express_enabled = false
    return next
  }
  next.pay_in_mode = mode
  next.stripe_express_enabled = mode === "va_express"
  return next
}

export function findUsUsdBankCorridor<T extends { country_code?: string; currency_code?: string; rail?: string }>(
  rows: T[] | null | undefined,
): T | null {
  return (
    (rows ?? []).find(
      (row) =>
        isUsUsdCorridor(String(row.country_code ?? ""), String(row.currency_code ?? "")) &&
        (row.rail == null || row.rail === "bank_transfer"),
    ) ?? null
  )
}

/** Live catalog: missing US row after load is Disable (Live off). Unloaded catalog keeps VA & Express. */
export function resolveUsPayInModeFromCatalog<
  T extends {
    country_code?: string
    currency_code?: string
    rail?: string
    metadata?: unknown
    enabled?: boolean | null
  },
>(rows: T[] | null | undefined, catalogLoaded = true): UsPayInMode {
  const row = findUsUsdBankCorridor(rows)
  if (row) return resolveUsPayInModeFromCorridor(row)
  if (!catalogLoaded) return "va_express"
  return "disabled"
}

function bankRowsForCurrency<
  T extends {
    country_code?: string
    currency_code?: string
    rail?: string
    metadata?: unknown
    enabled?: boolean | null
  },
>(rows: T[] | null | undefined, currency: string): T[] {
  const cur = currency.trim().toUpperCase()
  return (rows ?? []).filter(
    (row) =>
      String(row.currency_code ?? "").trim().toUpperCase() === cur &&
      (row.rail == null || row.rail === "bank_transfer"),
  )
}

function mostPermissiveVaPayInMode(modes: UsPayInMode[]): UsPayInMode {
  if (modes.includes("va_express")) return "va_express"
  if (modes.includes("va")) return "va"
  return "disabled"
}

/**
 * Ledger VA/Express gate. USD reads the US:USD bank row. EUR uses the most
 * permissive live EUR bank corridor. Until any EUR row has an explicit
 * `pay_in_mode`, keep today's VA UX.
 */
export function resolveVaPayInModeFromCatalog<
  T extends {
    country_code?: string
    currency_code?: string
    rail?: string
    metadata?: unknown
    enabled?: boolean | null
  },
>(rows: T[] | null | undefined, currency: string, catalogLoaded = true): UsPayInMode {
  const cur = String(currency ?? "").trim().toUpperCase()
  if (cur === "USD") return resolveUsPayInModeFromCatalog(rows, catalogLoaded)
  if (cur !== "EUR") return catalogLoaded ? "disabled" : "va_express"
  if (!catalogLoaded) return "va_express"
  const eurRows = bankRowsForCurrency(rows, "EUR")
  if (eurRows.length === 0) return "va_express"
  const hasExplicitMode = eurRows.some((row) => parseUsPayInMode(metadataRecord(row.metadata).pay_in_mode))
  if (!hasExplicitMode) return "va_express"
  return mostPermissiveVaPayInMode(eurRows.map((row) => resolveUsPayInModeFromCorridor(row)))
}
