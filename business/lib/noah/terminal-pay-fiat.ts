/**
 * **Counter charge denomination only** (Stablecoin Terminal `/pay`): which fiat label the merchant
 * shows for “how much the customer pays” before crypto is sent. This aligns with Noah on-chain
 * wallet assets (e.g. USDC, EURC) – not with bank payout rails.
 *
 * **Payout currency** is independent: it comes from the recipient configured under Setup payout on
 * `/terminal` and Noah automated-payouts / `prepareSellFromRecipientRow` (any supported corridor).
 * Business base currency in settings does **not** restrict that payout currency.
 *
 * Keep `uiFiatToNoahPriceTicker` in `fx-tickers.ts` in sync when adding codes here.
 */
export const NOAH_WALLET_LINKED_FIAT = ["USD", "EUR"] as const
export type NoahWalletLinkedFiat = (typeof NOAH_WALLET_LINKED_FIAT)[number]

const ALLOWED = new Set<string>(NOAH_WALLET_LINKED_FIAT)

export function isNoahWalletLinkedFiat(code: string): code is NoahWalletLinkedFiat {
  return ALLOWED.has(code.trim().toUpperCase())
}

/** `/pay` charge face value: business `base_currency` when it maps to a Noah wallet fiat, else USD. */
export function resolveTerminalPayFiatCurrency(
  baseCurrency: string | null | undefined,
): NoahWalletLinkedFiat {
  const c = (baseCurrency || "").trim().toUpperCase()
  if (!c) return "USD"
  return (ALLOWED.has(c) ? c : "USD") as NoahWalletLinkedFiat
}
