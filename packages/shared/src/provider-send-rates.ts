import type { ExchangeRate } from "./types"
import type { PayoutProviderId } from "./payout-corridor"
import {
  mapGridBalancePayoutRateRows,
  mapNoahWalletRateRows,
  noahSendRatesQueryPath,
  type GridWalletRateRow,
  type NoahWalletRateRow,
} from "./noah-send-rates"

/** Customer-facing balance payout FX path for a single provider. */
export function providerSendRatesQueryPath(
  provider: PayoutProviderId,
  receiveCurrency: string,
): string {
  const dest = receiveCurrency.trim().toUpperCase()
  const query =
    dest.length === 3 ? `?destinations=${encodeURIComponent(dest)}` : ""
  switch (provider) {
    case "grid":
      return `/api/fx/grid-rates${query}`
    case "yellowcard":
      return `/api/fx/yc-rates${query}`
    default:
      return noahSendRatesQueryPath(receiveCurrency)
  }
}

/** Map DB rows to send-preview exchange rates for the active balance payout provider. */
export function mapProviderBalancePayoutRateRows(
  provider: PayoutProviderId,
  rows: Array<NoahWalletRateRow | GridWalletRateRow>,
  fallbackTs = new Date().toISOString(),
): ExchangeRate[] {
  switch (provider) {
    case "grid":
      return mapGridBalancePayoutRateRows(rows as GridWalletRateRow[], fallbackTs)
    case "yellowcard":
    case "noah":
    default:
      return mapNoahWalletRateRows(rows as NoahWalletRateRow[], fallbackTs)
  }
}
