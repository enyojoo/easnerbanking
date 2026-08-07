/** Wallet send execution routing: Turnkey direct vs Relay bridge. */

export type WalletSendExecutionModel = "direct_turnkey" | "relay_bridge"

export function isDirectTurnkeyCorridor(receiveAsset: string, receiveNetwork: string): boolean {
  const asset = String(receiveAsset || "").toUpperCase()
  const network = String(receiveNetwork || "").trim()
  return (asset === "USDC" && network === "Solana") || (asset === "EURC" && network === "Solana")
}

export function isBridgeExecutionModel(model: string | null | undefined): boolean {
  return String(model || "").trim() === "relay_bridge"
}

export function resolveWalletSendExecutionModel(
  receiveAsset: string,
  receiveNetwork: string,
): WalletSendExecutionModel {
  return isDirectTurnkeyCorridor(receiveAsset, receiveNetwork) ? "direct_turnkey" : "relay_bridge"
}

export function settlementAssetForBalance(balanceCurrency: string): "USDC" | "EURC" {
  return balanceCurrency.trim().toUpperCase() === "EUR" ? "EURC" : "USDC"
}
