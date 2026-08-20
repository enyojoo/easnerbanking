/**
 * Until Tier 2 (African banking) ships – gate local rails in UI.
 */
export const TIER2_COMPLETE_PLACEHOLDER = false

/** Currencies in the business send flow that use African banking / Tier 2 copy. */
export const TIER2_SEND_CURRENCY_CODES = ["KES", "GHS"] as const

export function isTier2AfricanSendCurrency(code: string | null | undefined): boolean {
  if (!code || code === "STABLECOIN") return false
  return (TIER2_SEND_CURRENCY_CODES as readonly string[]).includes(code)
}

/** Non–balance / non–stablecoin “through another currency” rails (includes RUB/SBP until enabled). */
/**
 * Whether invoice PDFs and payment-instruction blocks may show bank / stablecoin details for this currency.
 * NGN (and similar) follow Tier 2 when enabled; global currencies follow Tier 1 (business KYB).
 */
export function canProvisionInvoiceDepositInstructions(
  invoiceCurrency: string,
  tier1Complete: boolean,
  tier2Complete: boolean = TIER2_COMPLETE_PLACEHOLDER,
): boolean {
  if (invoiceCurrency === "NGN") return tier2Complete
  return tier1Complete
}

export function sendFlowUsesTier2Rail(
  paymentMethod: string,
  otherCurrency: string | null | undefined,
): boolean {
  if (paymentMethod === "balance" || paymentMethod === "usdc" || paymentMethod === "usdt") return false
  if (otherCurrency === "STABLECOIN") return false
  if (
    paymentMethod === "bankTransfer" ||
    paymentMethod === "mpesa" ||
    paymentMethod === "mtnMomo" ||
    paymentMethod === "sbp"
  )
    return true
  if (paymentMethod === "otherCurrency" && otherCurrency && otherCurrency !== "STABLECOIN") return true
  return false
}
