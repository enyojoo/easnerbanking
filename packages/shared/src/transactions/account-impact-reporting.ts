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
    const hasUsdCredit =
      positiveNumber(depositReview.usd_credit, meta.usd_credit) != null
    const creditedAmount = positiveNumber(
      row.account_impact_amount,
      row.accountImpactAmount,
      meta.reporting_wallet_amount,
      depositReview.usd_credit,
      meta.usd_credit,
      row.posted_amount,
      meta.posted_amount,
      row.amount,
    )
    const creditedCurrency = normalizeWalletReportingCurrency(
      row.account_impact_currency ??
        row.accountImpactCurrency ??
        meta.reporting_wallet_currency ??
        (hasUsdCredit ? "USD" : undefined) ??
        depositReview.credit_currency ??
        meta.posted_currency ??
        row.posted_currency ??
        row.currency,
    )
    if (creditedAmount != null && isWalletReportingCurrency(creditedCurrency)) {
      return {
        amount: creditedAmount,
        currency: creditedCurrency,
        source: "credited_balance",
      }
    }
    return null
  }

  const ledgerAmount = positiveNumber(
    row.account_impact_amount,
    row.accountImpactAmount,
    row.ledger_amount,
    row.ledgerAmount,
    meta.reporting_wallet_amount,
    meta.total_debited,
    payoutReview.total_debited,
    row.base_amount,
    row.baseAmount,
    row.amount,
  )
  const ledgerCurrency = normalizeWalletReportingCurrency(
    row.account_impact_currency ??
      row.accountImpactCurrency ??
      row.ledger_currency ??
      row.ledgerCurrency ??
      meta.reporting_wallet_currency ??
      payoutReview.send_currency ??
      row.base_currency ??
      row.baseCurrency ??
      row.displayCurrency ??
      row.currency,
  )
  if (ledgerAmount != null && isWalletReportingCurrency(ledgerCurrency)) {
    const source =
      row.ledger_amount != null || row.account_impact_amount != null
        ? "ledger"
        : meta.total_debited != null || payoutReview.total_debited != null
          ? "metadata"
          : "ledger"
    return { amount: ledgerAmount, currency: ledgerCurrency, source }
  }

  return null
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
