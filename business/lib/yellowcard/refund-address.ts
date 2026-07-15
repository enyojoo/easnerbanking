import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"

export type YcSendRefundMode = "balance_payout" | "cross_border_send"

/**
 * Resolve settlementInfo.refundAddress for YC POST /send.
 * Omnibus is never a refund destination (pass-through only).
 */
export function resolveYcSendRefundAddress(input: {
  mode: YcSendRefundMode
  userTurnkeyAddress?: string | null
  ledgerCurrency?: "USD" | "EUR"
}): string {
  if (input.mode === "balance_payout") {
    const addr = String(input.userTurnkeyAddress ?? "").trim()
    if (!addr) {
      throw new Error("user_turnkey_address_required_for_balance_payout_refund")
    }
    return addr
  }

  const fee = resolveWalletSendFeeSolanaAddress({
    ledgerCurrency: input.ledgerCurrency ?? "USD",
  })
  if (!fee) {
    throw new Error("fee_wallet_address_required_for_cross_border_refund")
  }
  return fee
}
