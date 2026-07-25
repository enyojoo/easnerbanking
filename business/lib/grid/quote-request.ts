import { gridFetch, gridFetchAllPages } from "./http"
import type { GridQuote } from "./types"

export type GridQuoteAccountDestination = {
  destinationType: "ACCOUNT"
  accountId: string
}

export type GridQuoteRealtimeFundingSource = {
  sourceType: "REALTIME_FUNDING"
  customerId: string
  currency: string
  cryptoNetwork?: string
}

export type GridQuoteAccountSource = {
  sourceType: "ACCOUNT"
  accountId: string
  customerId?: string
}

type GridInternalAccountRow = {
  id: string
  status?: string
  type?: string
  balance?: { currency?: { code?: string } }
}

export function normalizeGridCustomerId(customerId: string): string {
  const id = String(customerId ?? "").trim()
  if (!id) return id
  if (id.startsWith("Customer:")) return id
  return `Customer:${id}`
}

export function gridInternalAccountCurrency(row: GridInternalAccountRow): string {
  return String(row.balance?.currency?.code ?? "").trim().toUpperCase()
}

export function pickGridInternalAccountForCurrency(
  rows: GridInternalAccountRow[],
  currency: string,
): string | null {
  const cur = currency.trim().toUpperCase()
  if (!cur) return null
  const forCurrency = rows.filter((row) => gridInternalAccountCurrency(row) === cur)
  const active =
    forCurrency.find((row) => String(row.status ?? "").toUpperCase() === "ACTIVE") ??
    forCurrency[0]
  return active?.id?.trim() || null
}

export function gridQuoteFeesUsd(quote: Pick<GridQuote, "rateDetails">): number {
  const rd = quote.rateDetails
  if (!rd) return 0
  const total =
    Number(rd.gridApiFixedFee ?? 0) / 100 +
    Number(rd.gridApiVariableFeeAmount ?? 0) / 100 +
    Number(rd.counterpartyFixedFee ?? 0) / 100
  return Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0
}

function normalizeGridCurrency(code: string): string {
  return code.trim().toUpperCase()
}

export function buildGridAccountDestination(accountId: string): GridQuoteAccountDestination {
  return {
    destinationType: "ACCOUNT",
    accountId: accountId.trim(),
  }
}

/** USDC/USDT payouts and pay-ins fund via on-chain deposit instructions. */
export function buildGridRealtimeFundingSource(input: {
  customerId: string
  currency: string
  cryptoNetwork?: string
}): GridQuoteRealtimeFundingSource {
  const currency = normalizeGridCurrency(input.currency)
  const source: GridQuoteRealtimeFundingSource = {
    sourceType: "REALTIME_FUNDING",
    customerId: normalizeGridCustomerId(input.customerId),
    currency,
  }
  if (currency === "USDC" || currency === "USDT") {
    source.cryptoNetwork = input.cryptoNetwork?.trim().toUpperCase() || "SOLANA"
  }
  return source
}

export function buildGridAccountSource(input: {
  accountId: string
  customerId?: string
}): GridQuoteAccountSource {
  return {
    sourceType: "ACCOUNT",
    accountId: input.accountId.trim(),
    ...(input.customerId?.trim() ? { customerId: input.customerId.trim() } : {}),
  }
}

export async function resolveGridCustomerInternalAccountId(input: {
  customerId: string
  currency: string
}): Promise<string | null> {
  const customerId = normalizeGridCustomerId(input.customerId)
  const currency = normalizeGridCurrency(input.currency)
  if (!customerId || !currency) return null

  const rows = await gridFetchAllPages<GridInternalAccountRow>({
    path: "/internal-accounts",
    query: { customerId, currency },
    mapPage: (page) => page.data ?? [],
  })

  return pickGridInternalAccountForCurrency(rows, currency)
}

/** Balance payout: debit USDC via realtime funding → fiat external account. */
export function buildGridBalancePayoutQuoteBody(input: {
  customerId: string
  externalAccountId: string
  receiveCurrency: string
  lockedReceiveMinor: number
  purposeOfPayment?: string
}) {
  return {
    source: buildGridRealtimeFundingSource({
      customerId: input.customerId,
      currency: "USDC",
      cryptoNetwork: "SOLANA",
    }),
    destination: buildGridAccountDestination(input.externalAccountId),
    lockedCurrencyAmount: input.lockedReceiveMinor,
    lockedCurrencySide: "RECEIVING" as const,
    purposeOfPayment: input.purposeOfPayment?.trim() || "FAMILY_SUPPORT",
  }
}

/** Local pay-in: customer funds NGN (etc.) → USD internal balance. */
export function buildGridFundBalanceQuoteBody(input: {
  customerId: string
  sourceCurrency: string
  destinationInternalAccountId: string
  lockedSendMinor: number
}) {
  return {
    source: buildGridRealtimeFundingSource({
      customerId: input.customerId,
      currency: input.sourceCurrency,
    }),
    destination: buildGridAccountDestination(input.destinationInternalAccountId),
    lockedCurrencyAmount: input.lockedSendMinor,
    lockedCurrencySide: "SENDING" as const,
  }
}

/** Cross-border send: local currency pay-in → recipient external account. */
export function buildGridCrossBorderQuoteBody(input: {
  customerId: string
  sourceCurrency: string
  externalAccountId: string
  lockedReceiveMinor: number
  purposeOfPayment?: string
}) {
  return {
    source: buildGridRealtimeFundingSource({
      customerId: input.customerId,
      currency: input.sourceCurrency,
    }),
    destination: buildGridAccountDestination(input.externalAccountId),
    lockedCurrencyAmount: input.lockedReceiveMinor,
    lockedCurrencySide: "RECEIVING" as const,
    purposeOfPayment: input.purposeOfPayment?.trim() || "FAMILY_SUPPORT",
  }
}
