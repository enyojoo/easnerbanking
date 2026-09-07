export type ReportingFxRate = {
  from_currency: string
  to_currency: string
  rate: number
  status?: string | null
}

export type AccountImpactAmount = {
  amount: number
  currency: string
  source: "reporting_snapshot" | "ledger" | "metadata" | "credited_balance"
}

export type ReportingAmount = AccountImpactAmount & {
  reportingAmount: number
  reportingCurrency: string
  fxRate: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function positiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

export function normalizeWalletReportingCurrency(currency: unknown): string {
  const code = String(currency ?? "").trim().toUpperCase()
  if (code === "USDC" || code === "USDT") return "USD"
  if (code === "EURC") return "EUR"
  return code
}

function isWalletReportingCurrency(currency: string): boolean {
  return currency === "USD" || currency === "EUR"
}

/**
 * Resolve the first candidate whose amount **and** currency both hold up.
 *
 * Amount and currency must come from the same field family: pairing a USD
 * `total_debited` with an NGN `base_currency` used to discard the row (counted
 * as zero), and pairing an NGN `base_amount` with a USD `send_currency` used to
 * report a local magnitude as dollars.
 */
function firstResolvablePair(
  pairs: Array<{ amount: unknown; currency: unknown }>,
): { amount: number; currency: string } | null {
  for (const pair of pairs) {
    const amount = positiveNumber(pair.amount)
    if (amount == null) continue
    const currency = normalizeWalletReportingCurrency(pair.currency)
    if (!isWalletReportingCurrency(currency)) continue
    return { amount, currency }
  }
  return null
}

/**
 * Resolve the value that entered or left the Easner account.
 *
 * YC local-to-local cross-border is the exception: it has no wallet debit, so
 * it must carry a frozen `reporting_usd_amount` from the accepted YC quote.
 */
export function resolveAccountImpactAmount(
  row: Record<string, unknown>,
): AccountImpactAmount | null {
  const meta = asRecord(row.metadata)
  const payoutReview = asRecord(meta.payout_review)
  const depositReview = asRecord(meta.deposit_review)
  const direction = String(row.direction ?? "").trim().toLowerCase()
  const isCredit =
    direction === "in" || direction === "credit" || direction === "receive"
  const isCrossBorder = String(meta.yc_mode ?? "") === "cross_border_send"

  const reportingUsd = positiveNumber(meta.reporting_usd_amount)
  if (reportingUsd != null) {
    return {
      amount: reportingUsd,
      currency: "USD",
      source: "reporting_snapshot",
    }
  }

  // Never reinterpret a YC local-to-local payment using its destination cross
  // rate or a current live rate. Historical rows need a frozen USD snapshot.
  if (isCrossBorder) return null

  if (isCredit) {
    const credited = firstResolvablePair([
      { amount: row.account_impact_amount, currency: row.account_impact_currency },
      { amount: row.accountImpactAmount, currency: row.accountImpactCurrency },
      { amount: meta.reporting_wallet_amount, currency: meta.reporting_wallet_currency },
      { amount: depositReview.usd_credit, currency: depositReview.credit_currency ?? "USD" },
      { amount: meta.usd_credit, currency: "USD" },
      { amount: row.posted_amount, currency: row.posted_currency ?? meta.posted_currency },
      { amount: meta.posted_amount, currency: meta.posted_currency ?? row.posted_currency },
      { amount: row.amount, currency: row.currency },
    ])
    if (!credited) return null
    return { ...credited, source: "credited_balance" }
  }

  const debited = firstResolvablePair([
    { amount: row.account_impact_amount, currency: row.account_impact_currency },
    { amount: row.accountImpactAmount, currency: row.accountImpactCurrency },
    { amount: row.ledger_amount, currency: row.ledger_currency },
    { amount: row.ledgerAmount, currency: row.ledgerCurrency },
    { amount: meta.reporting_wallet_amount, currency: meta.reporting_wallet_currency },
    { amount: meta.total_debited, currency: meta.send_currency ?? payoutReview.send_currency },
    { amount: payoutReview.total_debited, currency: payoutReview.send_currency },
    { amount: row.base_amount, currency: row.base_currency },
    { amount: row.baseAmount, currency: row.baseCurrency },
    { amount: row.amount, currency: row.displayCurrency ?? row.currency },
  ])
  if (!debited) return null

  const source =
    row.ledger_amount != null || row.account_impact_amount != null
      ? "ledger"
      : meta.total_debited != null || payoutReview.total_debited != null
        ? "metadata"
        : "ledger"
  return { ...debited, source }
}

export function findReportingFxRate(
  rates: ReportingFxRate[],
  fromCurrency: string,
  toCurrency: string,
): number | null {
  const from = normalizeWalletReportingCurrency(fromCurrency)
  const to = normalizeWalletReportingCurrency(toCurrency)
  if (!from || !to) return null
  if (from === to) return 1

  const active = (rate: ReportingFxRate) =>
    rate.status == null || String(rate.status).toLowerCase() === "active"
  const direct = rates.find(
    (rate) =>
      normalizeWalletReportingCurrency(rate.from_currency) === from &&
      normalizeWalletReportingCurrency(rate.to_currency) === to &&
      active(rate) &&
      Number.isFinite(Number(rate.rate)) &&
      Number(rate.rate) > 0,
  )
  if (direct) return Number(direct.rate)

  const inverse = rates.find(
    (rate) =>
      normalizeWalletReportingCurrency(rate.from_currency) === to &&
      normalizeWalletReportingCurrency(rate.to_currency) === from &&
      active(rate) &&
      Number.isFinite(Number(rate.rate)) &&
      Number(rate.rate) > 0,
  )
  return inverse ? 1 / Number(inverse.rate) : null
}

export function convertWalletToReportingBase(input: {
  amount: number
  walletCurrency: string
  targetBase: string
  fxRates: ReportingFxRate[]
}): { amount: number; currency: string; fxRate: number } | null {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount < 0) return null
  const currency = normalizeWalletReportingCurrency(input.targetBase)
  const fxRate = findReportingFxRate(
    input.fxRates,
    input.walletCurrency,
    currency,
  )
  if (fxRate == null) return null
  return { amount: amount * fxRate, currency, fxRate }
}

export function resolveReportingAmountForFeed(
  row: Record<string, unknown>,
  targetBase: string,
  fxRates: ReportingFxRate[],
): ReportingAmount | null {
  const impact = resolveAccountImpactAmount(row)
  if (!impact) return null
  const converted = convertWalletToReportingBase({
    amount: impact.amount,
    walletCurrency: impact.currency,
    targetBase,
    fxRates,
  })
  if (!converted) return null
  return {
    ...impact,
    reportingAmount: converted.amount,
    reportingCurrency: converted.currency,
    fxRate: converted.fxRate,
  }
}
