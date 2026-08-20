/**
 * Noah Local Currency Offramp fee schedule (merchant PDF + API-discovered rows).
 * Used for validation/reconciliation only – never overrides prepare noahFloor.
 */

export type NoahOfframpFeeBasis = "noah_floor" | "mid_notional"

export type NoahOfframpScheduleRow = {
  currency: string
  countryCode: string
  /** Match PaymentMethodCategory / rail hint from get_channels_sell. */
  paymentMethodKey: string
  fixedUsd: number
  variablePct: number
  /** When true, row was inferred from API probe – update when Noah confirms. */
  apiDiscovered?: boolean
}

/** Merchant PDF rows (NGN/ZAR/KES/GHS). RWF filled after probe. */
export const NOAH_OFFRAMP_FEE_SCHEDULE: NoahOfframpScheduleRow[] = [
  { currency: "NGN", countryCode: "NG", paymentMethodKey: "bank", fixedUsd: 0.5, variablePct: 0.005 },
  { currency: "ZAR", countryCode: "ZA", paymentMethodKey: "bank", fixedUsd: 1.0, variablePct: 0.0055 },
  { currency: "ZAR", countryCode: "ZA", paymentMethodKey: "digital_wallet_f4b", fixedUsd: 1.0, variablePct: 0.0055 },
  { currency: "KES", countryCode: "KE", paymentMethodKey: "bank", fixedUsd: 1.25, variablePct: 0.0055 },
  { currency: "KES", countryCode: "KE", paymentMethodKey: "digital_wallet_f4b", fixedUsd: 1.25, variablePct: 0.0055 },
  { currency: "KES", countryCode: "KE", paymentMethodKey: "mobile_money", fixedUsd: 1.25, variablePct: 0.0055 },
  { currency: "GHS", countryCode: "GH", paymentMethodKey: "bank", fixedUsd: 1.5, variablePct: 0.0055 },
  { currency: "GHS", countryCode: "GH", paymentMethodKey: "digital_wallet_f4b", fixedUsd: 1.5, variablePct: 0.0055 },
  // RWF: placeholder until probe updates – same structure as KES until API confirms
  {
    currency: "RWF",
    countryCode: "RW",
    paymentMethodKey: "bank",
    fixedUsd: 1.25,
    variablePct: 0.0055,
    apiDiscovered: true,
  },
  {
    currency: "RWF",
    countryCode: "RW",
    paymentMethodKey: "mobile_money",
    fixedUsd: 1.25,
    variablePct: 0.0055,
    apiDiscovered: true,
  },
]

function norm(s: string): string {
  return String(s || "").trim().toUpperCase()
}

/** Map channel category / bank name / mobile provider to schedule paymentMethodKey. */
export function resolveNoahOfframpPaymentMethodKey(input: {
  paymentMethodCategory?: string | null
  paymentMethodType?: string | null
  bankName?: string | null
  mobileProvider?: string | null
}): string {
  const cat = String(input.paymentMethodCategory ?? "").toLowerCase()
  const bank = String(input.bankName ?? "").toLowerCase()
  const mobile = String(input.mobileProvider ?? "").toLowerCase()

  if (cat.includes("mobile") || bank.includes("mobile money") || mobile) {
    return "mobile_money"
  }
  if (cat.includes("wallet") || bank.includes("f4b") || bank.includes("digital wallet")) {
    return "digital_wallet_f4b"
  }
  return "bank"
}

export function findNoahOfframpScheduleRow(input: {
  currency: string
  countryCode?: string | null
  paymentMethodKey?: string | null
  paymentMethodCategory?: string | null
  bankName?: string | null
  mobileProvider?: string | null
}): NoahOfframpScheduleRow | null {
  const currency = norm(input.currency)
  const country = norm(input.countryCode ?? "")
  const key =
    input.paymentMethodKey?.trim().toLowerCase() ||
    resolveNoahOfframpPaymentMethodKey(input)

  const matches = NOAH_OFFRAMP_FEE_SCHEDULE.filter(
    (r) => norm(r.currency) === currency && r.paymentMethodKey === key,
  )
  if (country && matches.length > 1) {
    const byCountry = matches.find((r) => norm(r.countryCode) === country)
    if (byCountry) return byCountry
  }
  return matches[0] ?? null
}

/**
 * Expected Noah corridor fee from merchant schedule.
 * Default basis: noahFloor (variable % applied to crypto authorized amount).
 */
export function computeNoahOfframpScheduleFee(input: {
  basisAmount: number
  currency: string
  countryCode?: string | null
  paymentMethodKey?: string | null
  paymentMethodCategory?: string | null
  bankName?: string | null
  mobileProvider?: string | null
  basis?: NoahOfframpFeeBasis
}): number | null {
  const basisAmount = input.basisAmount
  if (!Number.isFinite(basisAmount) || basisAmount <= 0) return null

  const row = findNoahOfframpScheduleRow(input)
  if (!row) return null

  const basis = input.basis ?? "noah_floor"
  const variableBase = basis === "mid_notional" ? basisAmount : basisAmount
  const fee = row.fixedUsd + row.variablePct * variableBase
  return Math.round(fee * 1_000_000) / 1_000_000
}

export const NOAH_OFFRAMP_SCHEDULE_FEE_TOLERANCE_USD = 0.05

export function noahOfframpScheduleFeeDelta(
  actual: number | null | undefined,
  scheduleFee: number | null,
): number | null {
  if (actual == null || scheduleFee == null) return null
  if (!Number.isFinite(actual) || !Number.isFinite(scheduleFee)) return null
  return Math.round((actual - scheduleFee) * 1_000_000) / 1_000_000
}
