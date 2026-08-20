import type { PayoutFieldsSchemaHint, PayoutRail } from "./payout-corridor"

/** Noah MinLimit from fields_schema; null when missing or zero (no practical floor). */
export function parsePayoutMinAmount(
  hints: PayoutFieldsSchemaHint | null | undefined,
): number | null {
  const raw = hints?.limits?.min
  if (raw == null || String(raw).trim() === "") return null
  const n = Number.parseFloat(String(raw))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Easner minimum receive amounts for fiat payouts (bank + mobile money).
 * Applied as max(noahMinLimit, businessMin) so we never go below Noah compliance.
 *
 * Tune here when product policy changes; amounts are in recipient/payout currency.
 */
const PAYOUT_BUSINESS_MIN_BANK: Record<string, number> = {
  USD: 10,
  EUR: 10,
  GBP: 10,
  CAD: 10,
  AUD: 10,
  NZD: 10,
  CHF: 10,
  NGN: 1000,
  KES: 150,
  GHS: 10,
  RWF: 6000,
  ZAR: 10,
  /** Africa – product floors when Noah schema omits MinAmount */
  TZS: 1000,
  UGX: 1000,
  ZMW: 10,
  XOF: 500,
  XAF: 500,
  MWK: 2000,
  BWP: 150,
  CDF: 10_000,
  ETB: 50,
  SLL: 50,
  /** LATAM */
  MXN: 100,
  COP: 10_000,
  ARS: 5000,
  BRL: 10,
  PEN: 10,
  CLP: 5000,
  DOP: 100,
  PYG: 10_000,
  UYU: 100,
  /** Asia-Pacific */
  AED: 20,
  CNY: 50,
  EGP: 100,
  HKD: 50,
  SGD: 5,
  MYR: 10,
  THB: 50,
  PHP: 100,
  INR: 100,
  LKR: 500,
  KRW: 1000,
  IDR: 10_000,
  VUV: 500,
  FJD: 5,
  TRY: 100,
}

/** Optional floor for mobile money where it differs from bank (same currency). */
const PAYOUT_BUSINESS_MIN_MOBILE: Record<string, number> = {
  GHS: 40,
  RWF: 6000,
  KES: 150,
  XOF: 500,
  XAF: 1000,
  TZS: 1000,
  UGX: 1000,
  ZMW: 10,
  MWK: 2000,
  BWP: 150,
  CDF: 10_000,
  PHP: 100,
  INR: 100,
  EGP: 100,
}

function normalizeCurrency(currencyCode: string): string {
  return String(currencyCode || "").trim().toUpperCase()
}

/** Product minimum for a payout currency/rail, or null when no policy is defined. */
export function getBusinessPayoutMin(
  currencyCode: string,
  rail: PayoutRail = "bank_transfer",
): number | null {
  const cur = normalizeCurrency(currencyCode)
  if (!cur) return null
  if (rail === "mobile_money") {
    const mobile = PAYOUT_BUSINESS_MIN_MOBILE[cur]
    if (mobile != null) return mobile
  }
  const bank = PAYOUT_BUSINESS_MIN_BANK[cur]
  return bank ?? null
}

/** Effective minimum receive amount: higher of Noah channel MinLimit and Easner policy. */
export function resolveEffectivePayoutMin(input: {
  hints?: PayoutFieldsSchemaHint | null
  currencyCode: string
  rail?: PayoutRail
}): number | null {
  const rail = input.rail ?? "bank_transfer"
  const cur = normalizeCurrency(input.currencyCode)
  const noah = parsePayoutMinAmount(input.hints) ?? 0
  const business = getBusinessPayoutMin(cur, rail) ?? 0
  const effective = Math.max(noah, business)
  return effective > 0 ? effective : null
}

/** Display-friendly min/max for send amount UI (business min overrides Noah min in labels). */
export function getPayoutLimitsForDisplay(input: {
  hints?: PayoutFieldsSchemaHint | null
  currencyCode: string
  rail?: PayoutRail
}): { min: string | null; max: string | null } {
  const effectiveMin = resolveEffectivePayoutMin(input)
  const maxRaw = input.hints?.limits?.max
  return {
    min: effectiveMin != null ? formatPayoutLimitAmount(effectiveMin) : null,
    max: maxRaw != null && String(maxRaw).trim() !== "" ? String(maxRaw) : null,
  }
}

function formatPayoutLimitAmount(amount: number): string {
  if (Number.isInteger(amount) || Math.abs(amount - Math.round(amount)) < 1e-9) {
    return String(Math.round(amount))
  }
  return amount.toFixed(2).replace(/\.?0+$/, "")
}
