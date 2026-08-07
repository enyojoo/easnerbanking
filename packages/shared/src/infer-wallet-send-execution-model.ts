import { isDirectTurnkeyWalletCorridor } from "./wallet-send-limits"
import type { WalletSendExecutionModel } from "./payout-review-display"

export function inferWalletSendExecutionModel(
  receiveCurrency: string,
  receiveNetwork: string,
): WalletSendExecutionModel {
  return isDirectTurnkeyWalletCorridor(receiveCurrency, receiveNetwork)
    ? "direct_turnkey"
    : "relay_bridge"
}
