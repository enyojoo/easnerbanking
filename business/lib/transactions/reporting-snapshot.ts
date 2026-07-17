import {
  findReportingFxRate,
  normalizeWalletReportingCurrency,
  type ReportingFxRate,
} from "@easner/shared"

function roundReportingAmount(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function buildWalletReportingSnapshot(input: {
  amount: number
  currency: string
  fxRates: ReportingFxRate[]
}): Record<string, unknown> {
  const amount = Math.abs(Number(input.amount))
  const walletCurrency = normalizeWalletReportingCurrency(input.currency)
  if (!Number.isFinite(amount) || amount <= 0) return {}
  if (walletCurrency !== "USD" && walletCurrency !== "EUR") return {}

  const rate =
    walletCurrency === "USD"
      ? 1
      : findReportingFxRate(input.fxRates, walletCurrency, "USD")
  if (rate == null) return {}

  return {
    reporting_usd_amount: roundReportingAmount(amount * rate),
    reporting_wallet_amount: roundReportingAmount(amount),
    reporting_wallet_currency: walletCurrency,
    reporting_fx_rate: rate,
    reporting_rate_source:
      walletCurrency === "USD" ? "wallet" : "exchange_rates",
  }
}

export function buildYcCrossBorderReportingSnapshot(input: {
  localPayIn: number
  payInCurrency: string
  easnerSellFrom: number
  receiveCryptoUsd?: number
  sendCryptoUsd?: number
}): Record<string, unknown> {
  const localPayIn = Number(input.localPayIn)
  const rate = Number(input.easnerSellFrom)
  if (
    !Number.isFinite(localPayIn) ||
    localPayIn <= 0 ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return { reporting_amount_unavailable: true }
  }

  return {
    reporting_usd_amount: roundReportingAmount(localPayIn / rate),
    reporting_source_amount: roundReportingAmount(localPayIn),
    reporting_source_currency: String(input.payInCurrency).toUpperCase(),
    reporting_source_to_usd_rate: rate,
    reporting_rate_source: "yellowcard_quote",
    reporting_amount_unavailable: false,
    ...(Number.isFinite(Number(input.receiveCryptoUsd))
      ? { receive_crypto_usd: Number(input.receiveCryptoUsd) }
      : {}),
    ...(Number.isFinite(Number(input.sendCryptoUsd))
      ? { send_crypto_usd: Number(input.sendCryptoUsd) }
      : {}),
  }
}
