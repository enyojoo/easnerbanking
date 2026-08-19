import { gridFetch, gridFetchAllPages } from "./http"
import type { GridQuote } from "./types"
import { gridMajorUnits } from "./external-account"

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
  balance?: { amount?: number; currency?: { code?: string; decimals?: number } }
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

export function resolveGridCurrencyDecimals(
  currency?: { code?: string; decimals?: number } | null,
): number {
  if (currency?.decimals != null && Number.isFinite(currency.decimals)) {
    return currency.decimals
  }
  const code = String(currency?.code ?? "").trim().toUpperCase()
  if (code === "USDC" || code === "USDT") return 6
  return 2
}

/** Keep USDC quote send amounts at 6 decimals so Turnkey does not underfund Grid. */
export function quantizeGridUsdcMajor(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 1_000_000) / 1_000_000
}

export function gridQuoteSendingAmountMajor(quote: Pick<GridQuote, "totalSendingAmount" | "sendingCurrency">): number | null {
  const minor = quote.totalSendingAmount
  if (minor == null || !Number.isFinite(Number(minor)) || Number(minor) <= 0) return null
  return gridMajorUnits(Number(minor), resolveGridCurrencyDecimals(quote.sendingCurrency))
}

export function gridQuoteReceivingAmountMajor(
  quote: Pick<GridQuote, "totalReceivingAmount" | "receivingCurrency">,
): number | null {
  const minor = quote.totalReceivingAmount
  if (minor == null || !Number.isFinite(Number(minor)) || Number(minor) <= 0) return null
  return gridMajorUnits(Number(minor), resolveGridCurrencyDecimals(quote.receivingCurrency))
}

export function gridQuoteFeesUsd(
  quote: Pick<GridQuote, "rateDetails" | "sendingCurrency">,
): number {
  const rd = quote.rateDetails
  if (!rd) return 0
  const factor = 10 ** resolveGridCurrencyDecimals(quote.sendingCurrency)
  const total =
    Number(rd.gridApiFixedFee ?? 0) / factor +
    Number(rd.gridApiVariableFeeAmount ?? 0) / factor +
    Number(rd.counterpartyFixedFee ?? 0) / factor
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
    path: "/customers/internal-accounts",
    query: { customerId, currency },
    mapPage: (page) => page.data ?? [],
  })

  return pickGridInternalAccountForCurrency(rows, currency)
}

export async function loadGridCustomerInternalAccount(input: {
  customerId: string
  currency: string
}): Promise<{ id: string; balanceMajor: number } | null> {
  const customerId = normalizeGridCustomerId(input.customerId)
  const currency = normalizeGridCurrency(input.currency)
  if (!customerId || !currency) return null

  const rows = await gridFetchAllPages<GridInternalAccountRow>({
    path: "/customers/internal-accounts",
    query: { customerId, currency },
    mapPage: (page) => page.data ?? [],
  })
  const id = pickGridInternalAccountForCurrency(rows, currency)
  if (!id) return null
  const row = rows.find((candidate) => String(candidate.id ?? "").trim() === id)
  const decimals = resolveGridCurrencyDecimals(row?.balance?.currency)
  const minor = Number(row?.balance?.amount ?? 0)
  const balanceMajor = Number.isFinite(minor) ? gridMajorUnits(minor, decimals) : 0
  return { id, balanceMajor }
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

/** VA on-ramp: debit INTERNAL_FIAT USD → first-party Turnkey Solana USDC. */
export function buildGridVaTurnkeySweepQuoteBody(input: {
  sourceInternalAccountId: string
  turnkeyExternalAccountId: string
  lockedSendMinor: number
}) {
  return {
    source: buildGridAccountSource({ accountId: input.sourceInternalAccountId }),
    destination: buildGridAccountDestination(input.turnkeyExternalAccountId),
    lockedCurrencyAmount: input.lockedSendMinor,
    lockedCurrencySide: "SENDING" as const,
    immediatelyExecute: true,
    purposeOfPayment: "SELF" as const,
  }
}

/** Failed payout refund: debit INTERNAL_CRYPTO USDC → first-party Turnkey Solana USDC. */
export function buildGridUsdcRefundSweepQuoteBody(input: {
  sourceInternalAccountId: string
  turnkeyExternalAccountId: string
  lockedSendMinor: number
}) {
  return buildGridVaTurnkeySweepQuoteBody(input)
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
