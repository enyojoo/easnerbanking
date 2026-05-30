/** Wallet send execution routing: Turnkey direct vs LI.FI bridge. */

export type WalletSendExecutionModel = "direct_turnkey" | "lifi_bridge"

export function isDirectTurnkeyCorridor(receiveAsset: string, receiveNetwork: string): boolean {
  const asset = String(receiveAsset || "").toUpperCase()
  const network = String(receiveNetwork || "").trim()
  return (asset === "USDC" && network === "Solana") || (asset === "EURC" && network === "Solana")
}

export function resolveWalletSendExecutionModel(
  receiveAsset: string,
  receiveNetwork: string,
): WalletSendExecutionModel {
  return isDirectTurnkeyCorridor(receiveAsset, receiveNetwork) ? "direct_turnkey" : "lifi_bridge"
}

export function settlementAssetForBalance(balanceCurrency: string): "USDC" | "EURC" {
  return balanceCurrency.trim().toUpperCase() === "EUR" ? "EURC" : "USDC"
}
