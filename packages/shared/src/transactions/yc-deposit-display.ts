import { computeDisplayProcessingFee } from "../payout-processing-fee"
import { resolveReceiveCountryName } from "../receive-cash-method-labels"
import { isBankOnrampDepositFlow } from "./bank-deposit-lifecycle"
import { isVerificationDepositMetadata } from "./verification-deposit"
import type { YcFundBalanceDepositReviewSnapshot, YcPayInRail } from "./global-deposit-types"

const LOCAL_CURRENCY_TO_COUNTRY: Record<string, string> = {
  NGN: "NG",
  KES: "KE",
  GHS: "GH",
  ZAR: "ZA",
  UGX: "UG",
  TZS: "TZS",
  MXN: "MX",
  BRL: "BR",
  ARS: "AR",
  COP: "CO",
  CLP: "CL",
  RWF: "RW",
}

function roundLocal(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/** Local principal at quoted rate before processing fees. */
export function computeYcFundBalancePrincipalLocalPayIn(input: {
  usdCredit: number
  exchangeRate: number
}): number {
  const usdCredit = Number(input.usdCredit)
  const exchangeRate = Number(input.exchangeRate)
  if (!Number.isFinite(usdCredit) || usdCredit <= 0) return 0
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return 0
  return roundLocal(usdCredit * exchangeRate)
}

/** Cross-border TLC local principal before fees (receive amount × pay-in rate). */
export function computeYcCrossBorderPrincipalLocalPayIn(input: {
  receiveAmount: number
  customerRate: number
}): number {
  const receiveAmount = Number(input.receiveAmount)
  const customerRate = Number(input.customerRate)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) return 0
  if (!Number.isFinite(customerRate) || customerRate <= 0) return 0
  return roundLocal(receiveAmount * customerRate)
}

export type YcFundBalanceLocalPayInBreakdown = {
  principalLocal: number
  feeLocal: number
  totalLocal: number
  localCurrency: string
}

export function resolveYcFundBalanceLocalPayInBreakdown(
  review: Pick<
    YcFundBalanceDepositReviewSnapshot,
    | "local_pay_in"
    | "local_currency"
    | "usd_credit"
    | "exchange_rate"
    | "principal_local_pay_in"
    | "display_processing_fee_local"
    | "processing_fee"
    | "exchange_fee"
  >,
): YcFundBalanceLocalPayInBreakdown {
  const principalLocal =
    review.principal_local_pay_in != null &&
    Number.isFinite(review.principal_local_pay_in) &&
    review.principal_local_pay_in > 0
      ? roundLocal(review.principal_local_pay_in)
      : computeYcFundBalancePrincipalLocalPayIn({
          usdCredit: review.usd_credit,
          exchangeRate: review.exchange_rate,
        })
  const feeFromDisplay =
    review.display_processing_fee_local != null &&
    Number.isFinite(review.display_processing_fee_local) &&
    review.display_processing_fee_local > 0
      ? roundLocal(review.display_processing_fee_local)
      : null
  const feeLocal =
    feeFromDisplay ??
    (() => {
      const displayUsd = computeDisplayProcessingFee({
        processingFee: review.processing_fee,
        exchangeFee: review.exchange_fee,
      })
      if (displayUsd > 0 && review.exchange_rate > 0) {
        return roundLocal(displayUsd * review.exchange_rate)
      }
      return roundLocal(Math.max(0, review.local_pay_in - principalLocal))
    })()
  return {
    principalLocal,
    feeLocal,
    totalLocal: roundLocal(review.local_pay_in),
    localCurrency: review.local_currency,
  }
}

export function inferResidenceCountryFromLocalCurrency(localCurrency: string): string | null {
  const cur = String(localCurrency ?? "").trim().toUpperCase()
  if (!cur) return null
  return LOCAL_CURRENCY_TO_COUNTRY[cur] ?? null
}

export function normalizeYcPayInRail(raw: unknown): YcPayInRail {
  return String(raw ?? "").trim().toLowerCase() === "mobile_money" ? "mobile_money" : "bank_transfer"
}

export function resolveYcFundBalanceTransferMethod(payInRail: YcPayInRail): string {
  return payInRail === "mobile_money" ? "Mobile Money" : "Bank Transfer"
}

export function resolveYcFundBalanceDepositTitle(input: {
  residenceCountry?: string | null
  payInRail?: YcPayInRail | string | null
  localCurrency?: string | null
}): string {
  const rail = normalizeYcPayInRail(input.payInRail)
  const localCurrency = String(input.localCurrency ?? "").trim().toUpperCase()
  let country = String(input.residenceCountry ?? "").trim().toUpperCase()
  if (!country) {
    country = inferResidenceCountryFromLocalCurrency(localCurrency) ?? ""
  }

  if (localCurrency === "USD" || country === "US") {
    return "US Bank Deposit"
  }
  if (localCurrency === "EUR") {
    return "EU Bank Deposit"
  }
  if (localCurrency === "GBP" || country === "GB") {
    return "UK Bank Deposit"
  }

  const countryName = resolveReceiveCountryName(country || localCurrency)
  if (rail === "mobile_money") {
    return `${countryName} MOMO Deposit`
  }
  return `${countryName} Bank Deposit`
}

function readMetaString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

/** Push/email activity label — sentence case from deposit title. */
export function resolveYcFundBalanceNotificationActivityLabel(input: {
  depositDisplayTitle?: string | null
  residenceCountry?: string | null
  payInRail?: YcPayInRail | string | null
  localCurrency?: string | null
}): string {
  const title =
    String(input.depositDisplayTitle ?? "").trim() ||
    resolveYcFundBalanceDepositTitle({
      residenceCountry: input.residenceCountry,
      payInRail: input.payInRail,
      localCurrency: input.localCurrency,
    })
  return title
    .replace(/\sBank\sDeposit$/i, " bank deposit")
    .replace(/\sMOMO\sDeposit$/i, " MOMO deposit")
}

export function resolveYcFundBalanceNotificationActivityLabelFromMetadata(
  meta: Record<string, unknown>,
  review?: YcFundBalanceDepositReviewSnapshot | null,
): string {
  return resolveYcFundBalanceNotificationActivityLabel({
    depositDisplayTitle: readMetaString(meta.deposit_display_title),
    residenceCountry: review?.residence_country ?? readMetaString(meta.residence_country),
    payInRail: review?.pay_in_rail ?? readMetaString(meta.pay_in_rail),
    localCurrency: review?.local_currency ?? readMetaString(meta.local_currency),
  })
}

export function isYcFundBalanceDepositMetadata(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== "object") return false
  return meta.yc_mode === "fund_balance"
}

export function normalizeYcFundBalanceDepositReview(
  raw: unknown,
): YcFundBalanceDepositReviewSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const localPayIn = Number(o.local_pay_in)
  const usdCredit = Number(o.usd_credit)
  const exchangeRate = Number(o.exchange_rate)
  if (!Number.isFinite(localPayIn) || localPayIn <= 0) return null
  if (!Number.isFinite(usdCredit) || usdCredit <= 0) return null
  const localCurrency = String(o.local_currency ?? "").trim().toUpperCase()
  if (!localCurrency) return null
  const payInRail = normalizeYcPayInRail(o.pay_in_rail)
  return {
    local_pay_in: localPayIn,
    local_currency: localCurrency,
    usd_credit: usdCredit,
    processing_fee: Number.isFinite(Number(o.processing_fee)) ? Number(o.processing_fee) : 0,
    ...(Number.isFinite(Number(o.exchange_fee)) ? { exchange_fee: Number(o.exchange_fee) } : {}),
    exchange_rate: Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 0,
    transfer_method:
      String(o.transfer_method ?? "").trim() || resolveYcFundBalanceTransferMethod(payInRail),
    credit_to: String(o.credit_to ?? "").trim() || "USD Balance",
    residence_country:
      String(o.residence_country ?? "").trim().toUpperCase() ||
      inferResidenceCountryFromLocalCurrency(localCurrency) ||
      "",
    pay_in_rail: payInRail,
    ...(Number.isFinite(Number(o.display_processing_fee_local)) &&
    Number(o.display_processing_fee_local) > 0
      ? { display_processing_fee_local: Number(o.display_processing_fee_local) }
      : {}),
  }
}

export function buildYcFundBalanceDepositReviewSnapshot(input: {
  localPayIn: number
  localCurrency: string
  usdCredit: number
  processingFee: number
  exchangeFee?: number
  exchangeRate: number
  residenceCountry: string
  payInRail: YcPayInRail
  displayProcessingFeeLocal?: number
}): YcFundBalanceDepositReviewSnapshot {
  const payInRail = normalizeYcPayInRail(input.payInRail)
  const localCurrency = String(input.localCurrency).trim().toUpperCase()
  const residenceCountry =
    String(input.residenceCountry ?? "").trim().toUpperCase() ||
    inferResidenceCountryFromLocalCurrency(localCurrency) ||
    ""
  return {
    local_pay_in: input.localPayIn,
    principal_local_pay_in: computeYcFundBalancePrincipalLocalPayIn({
      usdCredit: input.usdCredit,
      exchangeRate: input.exchangeRate,
    }),
    local_currency: localCurrency,
    usd_credit: input.usdCredit,
    processing_fee: input.processingFee,
    ...(input.exchangeFee != null && Number.isFinite(input.exchangeFee)
      ? { exchange_fee: input.exchangeFee }
      : {}),
    exchange_rate: input.exchangeRate,
    transfer_method: resolveYcFundBalanceTransferMethod(payInRail),
    credit_to: "USD Balance",
    residence_country: residenceCountry,
    pay_in_rail: payInRail,
    ...(input.displayProcessingFeeLocal != null &&
    Number.isFinite(input.displayProcessingFeeLocal) &&
    input.displayProcessingFeeLocal > 0
      ? { display_processing_fee_local: input.displayProcessingFeeLocal }
      : {}),
  }
}

export function reconstructYcFundBalanceDepositReview(
  meta: Record<string, unknown>,
  customerRate?: number | null,
): YcFundBalanceDepositReviewSnapshot | null {
  const nested = normalizeYcFundBalanceDepositReview(meta.deposit_review)
  if (nested) return nested

  const localPayIn = Number(meta.local_pay_in)
  const usdCredit = Number(meta.usd_credit ?? meta.settled_amount ?? meta.posted_amount)
  if (!Number.isFinite(localPayIn) || localPayIn <= 0) return null
  if (!Number.isFinite(usdCredit) || usdCredit <= 0) return null

  const localCurrency = String(meta.local_currency ?? meta.fiat_deposit_currency ?? "NGN")
    .trim()
    .toUpperCase()
  const payInRail = normalizeYcPayInRail(meta.pay_in_rail)
  const residenceCountry =
    String(meta.residence_country ?? "").trim().toUpperCase() ||
    inferResidenceCountryFromLocalCurrency(localCurrency) ||
    ""
  const rateFromMeta = Number(meta.customer_rate)
  const exchangeRate =
    Number.isFinite(rateFromMeta) && rateFromMeta > 0
      ? rateFromMeta
      : Number.isFinite(Number(customerRate)) && Number(customerRate) > 0
        ? Number(customerRate)
        : 0

  return buildYcFundBalanceDepositReviewSnapshot({
    localPayIn,
    localCurrency,
    usdCredit,
    processingFee: Number.isFinite(Number(meta.processing_fee)) ? Number(meta.processing_fee) : 0,
    exchangeFee: Number.isFinite(Number(meta.exchange_fee)) ? Number(meta.exchange_fee) : undefined,
    exchangeRate,
    residenceCountry,
    payInRail,
    displayProcessingFeeLocal: Number.isFinite(Number(meta.display_processing_fee_local))
      ? Number(meta.display_processing_fee_local)
      : undefined,
  })
}

export function resolveYcFundBalanceDepositDisplayTitle(
  meta: Record<string, unknown> | null | undefined,
): string {
  const record = meta ?? {}
  const cached = String(record.deposit_display_title ?? "").trim()
  if (cached) return cached
  const review = normalizeYcFundBalanceDepositReview(record.deposit_review)
  return resolveYcFundBalanceDepositTitle({
    residenceCountry: review?.residence_country ?? readMetaString(record.residence_country),
    payInRail: review?.pay_in_rail ?? readMetaString(record.pay_in_rail),
    localCurrency: review?.local_currency ?? readMetaString(record.local_currency),
  })
}

/** Noah virtual-account inbound funding (USD/EUR ACH/wire onramp). */
export function resolveNoahVaFundingDepositTitle(currency: string): string {
  const c = String(currency ?? "").trim().toUpperCase()
  if (c === "USD") return "US Bank Deposit"
  if (c === "EUR") return "EU Bank Deposit"
  if (c === "GBP") return "UK Bank Deposit"
  return "Bank Deposit"
}

export function isNoahVaFundingDeposit(input: {
  provider?: string | null
  direction?: string | null
  metadata?: Record<string, unknown> | null
}): boolean {
  const provider = String(input.provider ?? "").trim().toLowerCase()
  const direction = String(input.direction ?? "").trim().toLowerCase()
  const meta = input.metadata ?? {}
  if (provider !== "noah") return false
  if (direction && direction !== "in") return false
  if (isVerificationDepositMetadata(meta)) return false
  if (meta.deposit_kind === "verification") return false
  if (isYcFundBalanceDepositMetadata(meta)) return false
  if (String(meta.source ?? "").toLowerCase() === "api_yellowcard_fund_balance") return false
  return isBankOnrampDepositFlow(meta)
}

export function resolveNoahVaFundingDepositTitleFromMeta(
  meta: Record<string, unknown> | null | undefined,
): string {
  const record = meta ?? {}
  const currency = String(
    record.fiat_deposit_currency ?? record.settled_currency ?? record.currency ?? "USD",
  )
    .trim()
    .toUpperCase()
  return resolveNoahVaFundingDepositTitle(currency)
}

export function resolveNoahVaFundingNotificationActivityLabel(currency: string): string {
  return resolveNoahVaFundingDepositTitle(currency)
    .replace(/\sBank\sDeposit$/i, " bank deposit")
}
